function appData() {
  return {
    settings: {
      charSize: 8,
      charset: "STANDARD",
      brightness: 1.0,
      contrast: 1.0,
      saturation: 1.0,
      sharpness: 0.0,
      gamma: 1.0,
      colorMode: true,
      invert: false,
      bgColor: "#000000",
      style: 0,
      spacing: 1.0,
      
      // Detailed Post-Processing
      bloom: false,
      bloomThreshold: 0.3,
      bloomSoft: 0.2,
      bloomIntensity: 1.5,
      bloomRadius: 12.0,

      grain: false,
      grainIntensity: 0.2,
      grainSize: 1.0,
      grainSpeed: 1.0,

      chromatic: false,
      chromaticOffset: 0.003,

      scanlines: false,
      scanlineOpacity: 0.5,
      scanlineSpacing: 4.0,

      vignette: false,
      vignetteIntensity: 0.5,
      vignetteRadius: 0.5,

      crtCurve: false,
      crtAmount: 0.1,

      phosphor: false,
      phosphorColor: "Green",

      fps: 30,
      recordAudio: true,
      volume: 1.0,
      muted: false,
    },

    // UI View (Not part of settings/export)
    uiScale: 1.0,
    uiPan: { x: 0, y: 0 },
    isDragging: false,
    lastMouse: { x: 0, y: 0 },

    running: false,
    isExporting: false,
    renderProgress: 0,
    renderMsg: "Ready",
    snapshotFormat: "image/png",
    startTime: performance.now(),
    isCamera: false,
    uniforms: {},

    init() {
      this.video = document.getElementById("video");
      this.canvas = document.getElementById("gl");
      initGL(this.canvas);
      this.initUniforms();
      this.renderLoop();

      // Mouse wheel zoom
      this.canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = -e.deltaY * 0.001;
        this.uiScale = Math.min(Math.max(0.1, this.uiScale + delta), 10);
      });

      // Panning
      this.canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
          this.isDragging = true;
          this.lastMouse = { x: e.clientX, y: e.clientY };
        }
      });
      window.addEventListener('mousemove', (e) => {
        if (this.isDragging) {
          const dx = e.clientX - this.lastMouse.x;
          const dy = e.clientY - this.lastMouse.y;
          this.uiPan.x += dx;
          this.uiPan.y += dy;
          this.lastMouse = { x: e.clientX, y: e.clientY };
        }
      });
      window.addEventListener('mouseup', () => this.isDragging = false);
    },

    initUniforms() {
      const names = [
        "u_video", "u_atlas", "u_resolution", "u_charSize", "u_charCount",
        "u_brightness", "u_contrast", "u_saturation", "u_sharpness", "u_gamma",
        "u_colorMode", "u_invert", "u_bgColor", "u_spacing", "u_effectStyle",
        "u_time", 
        "u_bloom", "u_bloomThreshold", "u_bloomSoft", "u_bloomIntensity", "u_bloomRadius",
        "u_grain", "u_grainIntensity", "u_grainSize", "u_grainSpeed",
        "u_chromatic", "u_chromaticOffset",
        "u_scanlines", "u_scanlineOpacity", "u_scanlineSpacing",
        "u_vignette", "u_vignetteIntensity", "u_vignetteRadius",
        "u_crtCurve", "u_crtAmount",
        "u_phosphor", "u_phosphorColor"
      ];
      names.forEach(name => {
        this.uniforms[name] = gl.getUniformLocation(program, name);
      });
    },

    syncUniforms(customTime) {
      const s = this.settings;
      const u = this.uniforms;

      gl.uniform1f(u.u_charSize, parseFloat(s.charSize));
      gl.uniform1f(u.u_charCount, charCount);
      gl.uniform1f(u.u_brightness, parseFloat(s.brightness));
      gl.uniform1f(u.u_contrast, parseFloat(s.contrast));
      gl.uniform1f(u.u_saturation, parseFloat(s.saturation));
      gl.uniform1f(u.u_sharpness, parseFloat(s.sharpness));
      gl.uniform1f(u.u_gamma, parseFloat(s.gamma));
      gl.uniform1i(u.u_colorMode, s.colorMode ? 1 : 0);
      gl.uniform1i(u.u_invert, s.invert ? 1 : 0);
      
      const rgb = (hex) => [
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255
      ];
      const bg = rgb(s.bgColor);
      gl.uniform3f(u.u_bgColor, bg[0], bg[1], bg[2]);

      gl.uniform1f(u.u_spacing, parseFloat(s.spacing));
      gl.uniform1i(u.u_effectStyle, parseInt(s.style));
      
      const time = customTime !== undefined ? customTime : (performance.now() - this.startTime) / 1000.0;
      gl.uniform1f(u.u_time, time);

      // Detailed Post-Processing
      gl.uniform1i(u.u_bloom, s.bloom ? 1 : 0);
      gl.uniform1f(u.u_bloomThreshold, parseFloat(s.bloomThreshold));
      gl.uniform1f(u.u_bloomSoft, parseFloat(s.bloomSoft));
      gl.uniform1f(u.u_bloomIntensity, parseFloat(s.bloomIntensity));
      gl.uniform1f(u.u_bloomRadius, parseFloat(s.bloomRadius));

      gl.uniform1i(u.u_grain, s.grain ? 1 : 0);
      gl.uniform1f(u.u_grainIntensity, parseFloat(s.grainIntensity));
      gl.uniform1f(u.u_grainSize, parseFloat(s.grainSize));
      gl.uniform1f(u.u_grainSpeed, parseFloat(s.grainSpeed));

      gl.uniform1i(u.u_chromatic, s.chromatic ? 1 : 0);
      gl.uniform1f(u.u_chromaticOffset, parseFloat(s.chromaticOffset));

      gl.uniform1i(u.u_scanlines, s.scanlines ? 1 : 0);
      gl.uniform1f(u.u_scanlineOpacity, parseFloat(s.scanlineOpacity));
      gl.uniform1f(u.u_scanlineSpacing, parseFloat(s.scanlineSpacing));

      gl.uniform1i(u.u_vignette, s.vignette ? 1 : 0);
      gl.uniform1f(u.u_vignetteIntensity, parseFloat(s.vignetteIntensity));
      gl.uniform1f(u.u_vignetteRadius, parseFloat(s.vignetteRadius));

      gl.uniform1i(u.u_crtCurve, s.crtCurve ? 1 : 0);
      gl.uniform1f(u.u_crtAmount, parseFloat(s.crtAmount));

      gl.uniform1i(u.u_phosphor, s.phosphor ? 1 : 0);
      const phos = {
        Green: [0.0, 1.0, 0.2],
        Amber: [1.0, 0.7, 0.0],
        Blue: [0.2, 0.5, 1.0],
        White: [1.0, 1.0, 1.0]
      }[s.phosphorColor] || [0, 1, 0];
      gl.uniform3f(u.u_phosphorColor, phos[0], phos[1], phos[2]);

      gl.uniform2f(u.u_resolution, this.canvas.width, this.canvas.height);
    },

    drawFrame(customTime) {
      if (this.video.readyState < 2) return;

      gl.viewport(0, 0, this.canvas.width, this.canvas.height);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, videoTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, this.video);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, atlasTexture);

      gl.uniform1i(this.uniforms.u_video, 0);
      gl.uniform1i(this.uniforms.u_atlas, 1);

      this.syncUniforms(customTime);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },

    renderLoop() {
      if (this.running || this.isExporting || this.settings.grain || this.settings.bloom) {
        this.drawFrame();
      }
      requestAnimationFrame(() => this.renderLoop());
    },

    updateVolume() {
      this.video.volume = this.settings.volume;
      if (this.settings.volume > 0) this.settings.muted = false;
      this.video.muted = this.settings.muted;
    },

    toggleMute() {
      this.settings.muted = !this.settings.muted;
      this.video.muted = this.settings.muted;
    },

    togglePlay() {
      this.running = !this.running;
      if (this.running) {
        this.video.play();
        this.startTime = performance.now() - (this.video.currentTime * 1000);
      } else {
        this.video.pause();
      }
    },

    loadVideo(e) {
      const file = e.target.files[0];
      if (!file) return;
      if (this.video.srcObject) {
        this.video.srcObject.getTracks().forEach(t => t.stop());
        this.video.srcObject = null;
      }
      this.isCamera = false;
      this.video.src = URL.createObjectURL(file);
      this.video.onloadeddata = () => {
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        this.estimateFPS();
        this.drawFrame();
      };
    },

    async useWebcam() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        this.isCamera = true;
        this.video.src = "";
        this.video.srcObject = stream;
        this.video.onloadedmetadata = () => {
          this.canvas.width = this.video.videoWidth;
          this.canvas.height = this.video.videoHeight;
          this.settings.fps = 30;
          this.running = true;
          this.video.play();
        };
      } catch (err) {
        alert("Camera/Audio access denied: " + err.message);
      }
    },

    estimateFPS() {
      if (!this.video.requestVideoFrameCallback) {
        this.settings.fps = 30;
        return;
      }
      let frames = [];
      const check = (now, metadata) => {
        frames.push(metadata.presentationTime);
        if (frames.length < 10) {
          this.video.requestVideoFrameCallback(check);
        } else {
          const diffs = [];
          for (let i = 1; i < frames.length; i++) diffs.push(frames[i] - frames[i - 1]);
          const avg = diffs.reduce((a, b) => a + b) / diffs.length;
          const detected = Math.round(1000 / avg);
          this.settings.fps = detected > 0 ? detected : 30;
          this.video.pause();
          this.video.currentTime = 0;
        }
      };
      this.video.play();
      this.video.requestVideoFrameCallback(check);
    },

    updateCharset() {
      const atlas = createAtlas(this.settings.charset);
      window.charCount = atlas.count;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
      if (!this.running && !this.isExporting) this.drawFrame();
    },

    savePreset() {
      const blob = new Blob([JSON.stringify(this.settings, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ascii_preset.json";
      a.click();
    },

    loadPreset(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        Object.assign(this.settings, JSON.parse(e.target.result));
        this.updateCharset();
        this.drawFrame();
        this.updateVolume();
      };
      reader.readAsText(file);
    },

    takeSnapshot() {
      this.drawFrame();
      const url = this.canvas.toDataURL(this.snapshotFormat);
      const ext = this.snapshotFormat.split("/")[1];
      const a = document.createElement("a");
      a.href = url;
      a.download = `ascii_snapshot.${ext}`;
      a.click();
    },

    async exportVideo() {
      if (!this.video.src && !this.video.srcObject) {
        alert("No source loaded.");
        return;
      }

      const wasMuted = this.video.muted;
      if (this.settings.recordAudio && !this.isCamera) {
          this.video.muted = false;
      }

      this.running = false;
      this.video.pause();
      if (!this.isCamera) this.video.currentTime = 0;
      
      this.isExporting = true;
      this.renderProgress = 0;
      this.renderMsg = this.isCamera ? "Recording live..." : "Capturing GPU...";

      const videoStream = this.canvas.captureStream(60);
      const combinedStream = new MediaStream([videoStream.getVideoTracks()[0]]);

      if (this.settings.recordAudio) {
          let audioTracks = [];
          if (this.isCamera && this.video.srcObject) {
              audioTracks = this.video.srcObject.getAudioTracks();
          } else if (this.video.captureStream) {
              const fileStream = this.video.captureStream();
              audioTracks = fileStream.getAudioTracks();
          } else if (this.video.mozCaptureStream) {
              const fileStream = this.video.mozCaptureStream();
              audioTracks = fileStream.getAudioTracks();
          }

          if (audioTracks.length > 0) {
              combinedStream.addTrack(audioTracks[0]);
          }
      }

      this.recorder = new MediaRecorder(combinedStream, {
        mimeType: "video/webm;codecs=vp9,opus",
        videoBitsPerSecond: 100000000, 
      });

      const chunks = [];
      this.recorder.ondataavailable = (e) => chunks.push(e.data);
      this.recorder.onstop = async () => {
        this.video.muted = wasMuted;
        this.renderMsg = "Processing FFmpeg...";
        const blob = new Blob(chunks, { type: "video/webm" });
        const formData = new FormData();
        formData.append("video", blob);
        formData.append("fps", this.settings.fps);

        try {
          const response = await fetch("/upload-and-process", { method: "POST", body: formData });
          if (!response.ok) throw new Error("Failed");
          const resultBlob = await response.blob();
          const url = URL.createObjectURL(resultBlob);
          const a = document.createElement("a");
          a.href = url; a.download = "ascii_final.mp4"; a.click();
        } catch (err) {
          alert("Error: " + err.message);
        } finally {
          this.isExporting = false;
        }
      };

      this.recorder.start();
      video.play();

      if (!this.isCamera) {
          const interval = setInterval(() => {
            this.renderProgress = Math.round((this.video.currentTime / this.video.duration) * 100);
            this.renderMsg = `Capturing: ${this.renderProgress}%`;
            this.drawFrame(this.video.currentTime);
            if (this.video.ended) {
              clearInterval(interval);
              this.recorder.stop();
              this.video.pause();
            }
          }, 16);
      }
    },

    stopRecording() {
        if (this.recorder && this.recorder.state === "recording") {
            this.recorder.stop();
            this.video.pause();
        }
    }
  };
}
