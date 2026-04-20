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
      asciiVariation: 0,
      showOriginal: false,
      edgeStrength: 1.0,
      edgeThreshold: 0.1,
      dirEdgeThreshold: 0.1,
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
      loop: false,
      recordAudio: true,
      volume: 1.0,
      muted: false,
      stability: 0.5,
      showVisualizer: false,
      visualizerIntensity: 1.0,
    },

    // UI View (Not part of settings/export)
    uiScale: 1.0,
    uiPan: { x: 0, y: 0 },
    isDragging: false,
    lastMouse: { x: 0, y: 0 },

    running: false,
    isExporting: false,
    hasSource: false,
    renderProgress: 0,
    currentTime: 0,
    duration: 0,
    renderMsg: "Ready",
    snapshotFormat: "image/png",
    startTime: performance.now(),
    isCamera: false,
    uniforms: {},
    audio: {
      ctx: null,
      analyser: null,
      previewGain: null,
      recorderDest: null,
      source: null,
      dataArray: new Uint8Array(64),
      floatData: new Float32Array(64)
    },

    init() {
      this.video = document.getElementById("video");
      this.canvas = document.getElementById("gl");
      initGL(this.canvas);
      this.initUniforms();
      this.renderLoop();

      // Video event listeners for UI sync
      this.video.addEventListener("timeupdate", () => {
        this.currentTime = this.video.currentTime;
      });
      this.video.addEventListener("durationchange", () => {
        this.duration = this.video.duration;
      });
      this.video.addEventListener("loadedmetadata", () => {
        this.duration = this.video.duration;
      });
      this.video.addEventListener("ended", () => {
        if (this.settings.loop && !this.isCamera) {
          this.video.currentTime = 0;
          this.video.play();
          this.running = true;
        } else {
          this.running = false;
        }
      });

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

      // Global Key Listeners
      window.addEventListener('keydown', (e) => {
        const active = document.activeElement;
        const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
        
        // If typing in a text/number field, allow default behavior
        if (isInput && ['text', 'number', 'password', 'email', 'textarea'].includes(active.type || active.tagName.toLowerCase())) {
          return;
        }

        const key = e.key.toLowerCase();

        if (key === ' ' || e.code === 'Space') {
          e.preventDefault();
          this.togglePlay();
        } 
        else if (key === 'arrowleft') {
          e.preventDefault();
          this.stepFrame(-1);
        } 
        else if (key === 'arrowright') {
          e.preventDefault();
          this.stepFrame(1);
        } 
        else if (key === 'm') {
          e.preventDefault();
          this.toggleMute();
        } 
        else if (key === 'l') {
          e.preventDefault();
          this.toggleLoop();
        } 
        else if (key === 's') {
          e.preventDefault();
          this.takeSnapshot();
        }
      });
    },

    initUniforms() {
      const names = [
        "u_video", "u_atlas", "u_resolution", "u_charSize", "u_charCount",
        "u_brightness", "u_contrast", "u_saturation", "u_sharpness", "u_gamma",
        "u_colorMode", "u_invert", "u_bgColor", "u_spacing", "u_effectStyle",
        "u_asciiVariation", "u_showOriginal", 
        "u_edgeStrength", "u_edgeThreshold", "u_dirEdgeThreshold",
        "u_audioData", "u_showVisualizer", "u_visualizerIntensity", "u_stability",
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
      gl.uniform1i(u.u_asciiVariation, parseInt(s.asciiVariation));
      gl.uniform1i(u.u_showOriginal, s.showOriginal ? 1 : 0);

      gl.uniform1f(u.u_edgeStrength, parseFloat(s.edgeStrength));
      gl.uniform1f(u.u_edgeThreshold, parseFloat(s.edgeThreshold));
      gl.uniform1f(u.u_dirEdgeThreshold, parseFloat(s.dirEdgeThreshold));
      
      // Audio & Stability
      gl.uniform1fv(u.u_audioData, this.audio.floatData);
      gl.uniform1i(u.u_showVisualizer, s.showVisualizer ? 1 : 0);
      gl.uniform1f(u.u_visualizerIntensity, parseFloat(s.visualizerIntensity));
      gl.uniform1f(u.u_stability, parseFloat(s.stability));

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
        if (this.audio.analyser) {
          this.audio.analyser.getByteFrequencyData(this.audio.dataArray);
          for(let i=0; i<64; i++) {
            this.audio.floatData[i] = this.audio.dataArray[i] / 255.0;
          }
        }
        this.drawFrame();
      }
      requestAnimationFrame(() => this.renderLoop());
    },

    initAudio() {
      if (this.audio.ctx) return;
      try {
          this.audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
          this.audio.analyser = this.audio.ctx.createAnalyser();
          this.audio.analyser.fftSize = 128; // 64 bins
          
          this.audio.previewGain = this.audio.ctx.createGain();
          this.audio.recorderDest = this.audio.ctx.createMediaStreamDestination();
          
          this.audio.source = this.audio.ctx.createMediaElementSource(this.video);
          
          // Source -> Analyser
          this.audio.source.connect(this.audio.analyser);
          
          // Path A: Analyser -> Preview Gain -> Speakers (User hears this)
          this.audio.analyser.connect(this.audio.previewGain);
          this.audio.previewGain.connect(this.audio.ctx.destination);
          
          // Path B: Analyser -> Recorder Destination (Recorder captures this)
          this.audio.analyser.connect(this.audio.recorderDest);
          
          // Keep video element at 1.0 volume internally
          this.video.volume = 1.0;
          this.updateVolume();
      } catch(e) {
          console.error("Audio init failed:", e);
      }
    },

    formatTime(seconds) {
      if (!seconds || isNaN(seconds)) return "0:00";
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      if (h > 0) {
        return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
      }
      return `${m}:${s.toString().padStart(2, "0")}`;
    },

    seek(time) {
      this.video.currentTime = time;
      if (!this.running) this.drawFrame();
    },

    stepFrame(direction) {
      if (this.running) this.togglePlay();
      const frameTime = 1 / (this.settings.fps || 30);
      this.video.currentTime = Math.max(0, Math.min(this.duration, this.video.currentTime + direction * frameTime));
      this.drawFrame();
    },

    toggleLoop() {
      this.settings.loop = !this.settings.loop;
    },

    updateVolume() {
      if (this.audio.previewGain) {
          this.audio.previewGain.gain.setTargetAtTime(
              this.settings.muted ? 0 : this.settings.volume,
              this.audio.ctx.currentTime,
              0.01
          );
      }
      if (this.settings.volume > 0) this.settings.muted = false;
    },

    toggleMute() {
      this.settings.muted = !this.settings.muted;
      this.updateVolume();
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
      this.hasSource = true;
      this.video.src = URL.createObjectURL(file);
      this.video.onloadeddata = () => {
        this.initAudio();
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
          this.initAudio();
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
        try {
          const loaded = JSON.parse(e.target.result);
          // Merge into settings to maintain reactivity
          Object.assign(this.settings, loaded);
          
          this.updateCharset();
          this.updateVolume();
          this.drawFrame();
          
          // Clear input so same file can be loaded again
          e.target.value = "";
        } catch (err) {
          alert("Failed to load preset: Invalid JSON file.");
        }
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
      this.renderMsg = "Initializing...";

      // Initialize session
      const initRes = await fetch("/upload-init", { method: "POST" });
      const { sessionId } = await initRes.json();

      // Chunk Queue to ensure sequential uploads
      let chunkQueue = Promise.resolve();
      let uploadErrors = 0;

      const videoStream = this.canvas.captureStream(this.settings.fps);
      const combinedStream = new MediaStream([videoStream.getVideoTracks()[0]]);

      if (this.settings.recordAudio) {
          let audioTrack = null;
          if (this.isCamera && this.video.srcObject) {
              audioTrack = this.video.srcObject.getAudioTracks()[0];
          } else if (this.audio.recorderDest) {
              audioTrack = this.audio.recorderDest.stream.getAudioTracks()[0];
          }

          if (audioTrack) {
              combinedStream.addTrack(audioTrack);
          }
      }

      this.recorder = new MediaRecorder(combinedStream, {
        mimeType: "video/webm;codecs=vp9,opus",
        videoBitsPerSecond: 20000000, 
      });

      this.recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunkQueue = chunkQueue.then(async () => {
            const formData = new FormData();
            formData.append("sessionId", sessionId);
            formData.append("chunk", e.data);
            try {
              const res = await fetch("/upload-chunk", { method: "POST", body: formData });
              if (!res.ok) throw new Error("Chunk failed");
            } catch (err) {
              uploadErrors++;
              console.error("Upload error:", err);
            }
          });
        }
      };

      this.recorder.onstop = async () => {
        this.video.muted = wasMuted;
        this.renderMsg = "Waiting for uploads to finish...";
        
        // Wait for all chunks to be uploaded
        await chunkQueue;
        
        if (uploadErrors > 0) {
          alert(`Warning: ${uploadErrors} chunks failed to upload. Video might be corrupted.`);
        }

        this.renderMsg = "Starting backend processing...";
        
        try {
          const res = await fetch("/upload-finish", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, fps: this.settings.fps })
          });
          
          if (!res.ok) throw new Error("Processing trigger failed");
          const { jobId } = await res.json();

          // Poll for status
          const pollStatus = async () => {
            const sRes = await fetch(`/job-status/${jobId}`);
            const job = await sRes.json();

            if (job.status === "completed") {
              this.renderMsg = "Done!";
              const a = document.createElement("a");
              a.href = job.downloadUrl;
              a.download = "ascii_final.mp4";
              a.click();
              this.isExporting = false;
            } else if (job.status === "error") {
              alert("FFmpeg Error: " + job.error);
              this.isExporting = false;
            } else {
              this.renderMsg = `Processing: ${job.progress}% (Backend)`;
              setTimeout(pollStatus, 1000);
            }
          };

          pollStatus();
        } catch (err) {
          alert("Error: " + err.message);
          this.isExporting = false;
        }
      };

      this.recorder.start(2000); 
      this.video.play();

      if (!this.isCamera) {
          const interval = setInterval(() => {
            const prog = Math.round((this.video.currentTime / this.video.duration) * 100);
            this.renderMsg = `Recording: ${prog}%`;
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
