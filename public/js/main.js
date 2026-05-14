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
      exportStart: 0,
      exportEnd: 0,
      exportWidth: 0,
      exportHeight: 0,
      exportMethod: 'deterministic', // 'deterministic' or 'realtime'
      exportChunkSize: 5, // 0 means single chunk
    },

    // UI View (Not part of settings/export)
    originalWidth: 0,
    originalHeight: 0,
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
        this.settings.exportEnd = Math.floor(this.video.duration * 100) / 100;
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

      // Global Key Listeners
      window.addEventListener('keydown', (e) => {
        const active = document.activeElement;
        const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
        if (isInput && ['text', 'number', 'password', 'email', 'textarea'].includes(active.type || active.tagName.toLowerCase())) return;

        const key = e.key.toLowerCase();
        if (key === ' ' || e.code === 'Space') { e.preventDefault(); this.togglePlay(); } 
        else if (key === 'arrowleft') { e.preventDefault(); this.stepFrame(-1); } 
        else if (key === 'arrowright') { e.preventDefault(); this.stepFrame(1); } 
        else if (key === 'm') { e.preventDefault(); this.toggleMute(); } 
        else if (key === 'l') { e.preventDefault(); this.toggleLoop(); } 
        else if (key === 's') { e.preventDefault(); this.takeSnapshot(); }
      });
    },

    // UI View Handlers
    handleWheel(e) {
      const delta = -e.deltaY * 0.001;
      this.uiScale = Math.min(Math.max(0.1, this.uiScale + delta), 10);
      this.drawFrame();
    },
    startPan(e) {
      if (e.button === 0) {
        this.isDragging = true;
        this.lastMouse = { x: e.clientX, y: e.clientY };
      }
    },
    handlePan(e) {
      if (this.isDragging) {
        const dx = e.clientX - this.lastMouse.x;
        const dy = e.clientY - this.lastMouse.y;
        this.uiPan.x += dx;
        this.uiPan.y += dy;
        this.lastMouse = { x: e.clientX, y: e.clientY };
        this.drawFrame();
      }
    },
    endPan() {
      this.isDragging = false;
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
      if (!u.u_charSize) return;

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
      
      gl.uniform1fv(u.u_audioData, this.audio.floatData);
      gl.uniform1i(u.u_showVisualizer, s.showVisualizer ? 1 : 0);
      gl.uniform1f(u.u_visualizerIntensity, parseFloat(s.visualizerIntensity));
      gl.uniform1f(u.u_stability, parseFloat(s.stability));

      const time = customTime !== undefined ? customTime : (performance.now() - this.startTime) / 1000.0;
      gl.uniform1f(u.u_time, time);

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
      const phos = { Green: [0.0, 1.0, 0.2], Amber: [1.0, 0.7, 0.0], Blue: [0.2, 0.5, 1.0], White: [1.0, 1.0, 1.0] }[s.phosphorColor] || [0, 1, 0];
      gl.uniform3f(u.u_phosphorColor, phos[0], phos[1], phos[2]);

      gl.uniform2f(u.u_resolution, this.canvas.width, this.canvas.height);
    },

    drawFrame(customTime) {
      if (!this.video || this.video.readyState < 2) return;
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
          for(let i=0; i<64; i++) this.audio.floatData[i] = this.audio.dataArray[i] / 255.0;
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
          this.audio.analyser.fftSize = 128;
          this.audio.previewGain = this.audio.ctx.createGain();
          this.audio.recorderDest = this.audio.ctx.createMediaStreamDestination();
          this.audio.source = this.audio.ctx.createMediaElementSource(this.video);
          this.audio.source.connect(this.audio.analyser);
          this.audio.analyser.connect(this.audio.previewGain);
          this.audio.previewGain.connect(this.audio.ctx.destination);
          this.audio.analyser.connect(this.audio.recorderDest);
          this.video.volume = 1.0;
          this.updateVolume();
      } catch(e) { console.error("Audio init failed:", e); }
    },

    formatTime(seconds) {
      if (!seconds || isNaN(seconds)) return "0:00";
      const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.floor(seconds % 60);
      return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}` : `${m}:${s.toString().padStart(2, "0")}`;
    },

    seek(time) { 
      this.video.currentTime = time; 
      if (!this.running) {
        const onSeeked = () => {
          this.video.removeEventListener("seeked", onSeeked);
          this.drawFrame();
        };
        this.video.addEventListener("seeked", onSeeked);
      }
    },
    stepFrame(direction) {
      if (this.running) this.togglePlay();
      const frameTime = 1 / (this.settings.fps || 30);
      this.video.currentTime = Math.max(0, Math.min(this.duration, this.video.currentTime + direction * frameTime));
      
      const onSeeked = () => {
        this.video.removeEventListener("seeked", onSeeked);
        this.drawFrame();
      };
      this.video.addEventListener("seeked", onSeeked);
    },

    toggleLoop() { this.settings.loop = !this.settings.loop; },
    updateVolume() {
      if (this.audio.previewGain && this.audio.ctx) {
          this.audio.previewGain.gain.setTargetAtTime(this.settings.muted ? 0 : this.settings.volume, this.audio.ctx.currentTime, 0.01);
      }
    },
    toggleMute() { this.settings.muted = !this.settings.muted; this.updateVolume(); },
    togglePlay() {
      this.running = !this.running;
      if (this.running) { this.video.play(); this.startTime = performance.now() - (this.video.currentTime * 1000); } 
      else { this.video.pause(); }
    },

    loadVideo(e) {
      const file = e.target.files[0];
      if (!file) return;
      if (this.video.src && this.video.src.startsWith("blob:")) URL.revokeObjectURL(this.video.src);
      if (this.video.srcObject) { this.video.srcObject.getTracks().forEach(t => t.stop()); this.video.srcObject = null; }
      this.isCamera = false; this.hasSource = true;
      this.video.src = URL.createObjectURL(file);
      this.video.onloadeddata = () => {
        this.initAudio();
        this.originalWidth = this.video.videoWidth; this.originalHeight = this.video.videoHeight;
        this.settings.exportWidth = this.originalWidth; this.settings.exportHeight = this.originalHeight;
        this.canvas.width = this.originalWidth; this.canvas.height = this.originalHeight;
        this.uiScale = 1.0; this.uiPan = { x: 0, y: 0 };
        this.estimateFPS(); this.drawFrame();
        e.target.value = ""; // Clear input
      };
    },

    async useWebcam() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        this.isCamera = true;
        if (this.video.src && this.video.src.startsWith("blob:")) URL.revokeObjectURL(this.video.src);
        this.video.src = ""; this.video.srcObject = stream;
        this.video.onloadedmetadata = () => {
          this.initAudio();
          this.originalWidth = this.video.videoWidth; this.originalHeight = this.video.videoHeight;
          this.settings.exportWidth = this.originalWidth; this.settings.exportHeight = this.originalHeight;
          this.canvas.width = this.originalWidth; this.canvas.height = this.originalHeight;
          this.settings.fps = 30; this.running = true; this.video.play();
        };
      } catch (err) { alert("Camera/Audio access denied: " + err.message); }
    },

    estimateFPS() {
      if (!this.video.requestVideoFrameCallback) { this.settings.fps = 30; return; }
      let frames = [];
      const check = (now, metadata) => {
        frames.push(metadata.presentationTime);
        if (frames.length < 10) { this.video.requestVideoFrameCallback(check); } 
        else {
          const diffs = [];
          for (let i = 1; i < frames.length; i++) diffs.push(frames[i] - frames[i - 1]);
          const avg = diffs.reduce((a, b) => a + b) / diffs.length;
          const detected = Math.round(1000 / avg);
          this.settings.fps = detected > 0 ? detected : 30;
          this.video.pause(); this.video.currentTime = 0;
        }
      };
      this.video.play(); this.video.requestVideoFrameCallback(check);
    },

    updateCharset() {
      const atlas = createAtlas(this.settings.charset);
      window.charCount = atlas.count;
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
      if (!this.running && !this.isExporting) this.drawFrame();
    },

    savePreset() {
      const blob = new Blob([JSON.stringify(this.settings, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "ascii_preset.json"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
    },

    loadPreset(e) {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const loaded = JSON.parse(e.target.result);
          Object.assign(this.settings, loaded);
          this.updateCharset(); this.updateVolume(); this.drawFrame();
          e.target.value = "";
        } catch (err) { alert("Failed to load preset: Invalid JSON file."); }
      };
      reader.readAsText(file);
    },

    takeSnapshot() {
      this.drawFrame();
      const url = this.canvas.toDataURL(this.snapshotFormat);
      const ext = this.snapshotFormat.split("/")[1];
      const a = document.createElement("a"); a.href = url; a.download = `ascii_snapshot.${ext}`; a.click();
    },

    async exportVideo() {
      if (!this.video.src && !this.video.srcObject) { alert("No source loaded."); return; }
      const prevWidth = this.canvas.width, prevHeight = this.canvas.height, wasMuted = this.video.muted;
      this.running = false; this.video.pause(); this.isExporting = true;
      this.renderProgress = 0; this.renderMsg = "Initializing segmented export...";
      this.canvas.width = this.settings.exportWidth; this.canvas.height = this.settings.exportHeight;
      const segmentIds = [], totalDuration = this.settings.exportEnd - this.settings.exportStart;
      this.video.currentTime = this.settings.exportStart;
      try {
        while (this.video.currentTime < this.settings.exportEnd && this.isExporting) {
          const start = this.video.currentTime;
          const chunkSize = parseFloat(this.settings.exportChunkSize);
          const end = (chunkSize > 0) ? Math.min(start + chunkSize, this.settings.exportEnd) : this.settings.exportEnd;
          if (end - start <= 0) break;
          this.renderMsg = `Capturing segment: ${this.formatTime(start)} - ${this.formatTime(end)}`;
          let blob = (this.settings.exportMethod === 'deterministic') ? await this.recordSegmentDeterministic(start, end) : await this.recordSegmentRealtime(start, end);
          this.renderMsg = `Processing segment: ${this.formatTime(start)} - ${this.formatTime(end)}...`;
          const segmentId = await this.uploadAndProcessSegment(blob);
          await this.waitForSegment(segmentId);
          segmentIds.push(segmentId);
          blob = null;
          const processedTime = this.video.currentTime - this.settings.exportStart;
          this.renderProgress = Math.round((processedTime / totalDuration) * 90);
          if (this.video.currentTime >= this.settings.exportEnd || this.video.ended) break;
        }
        if (!this.isExporting) throw new Error("Export cancelled");
        this.renderMsg = "Stitching final video...";
        const res = await fetch("/stitch-segments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ segmentIds }) });
        const { jobId } = await res.json(); this.pollFinalJob(jobId);
      } catch (err) {
        console.error("Export failed:", err);
        if (this.renderMsg !== "Export cancelled.") alert("Export failed: " + err.message);
        this.isExporting = false;
      } finally {
        this.canvas.width = prevWidth; this.canvas.height = prevHeight; this.video.muted = wasMuted; this.drawFrame();
      }
    },

    recordSegmentDeterministic(start, end) {
      return new Promise(async (resolve, reject) => {
        try {
          const fps = this.settings.fps, frameDuration = 1 / fps;
          let currentTime = start;
          const videoStream = this.canvas.captureStream(0);
          const combinedStream = new MediaStream([videoStream.getVideoTracks()[0]]);
          if (this.settings.recordAudio) {
            const audioTrack = this.isCamera ? this.video.srcObject?.getAudioTracks()[0] : this.audio.recorderDest?.stream.getAudioTracks()[0];
            if (audioTrack) combinedStream.addTrack(audioTrack);
          }
          const recorder = new MediaRecorder(combinedStream, { mimeType: "video/webm;codecs=vp9", videoBitsPerSecond: 50000000 });
          let chunks = []; recorder.ondataavailable = e => chunks.push(e.data);
          recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
          recorder.start(); this.video.pause(); this.video.muted = !this.settings.recordAudio;
          while (currentTime < end && this.isExporting) {
            this.video.currentTime = currentTime;
            await new Promise(r => {
              const onSeeked = () => { this.video.removeEventListener("seeked", onSeeked); r(); };
              this.video.addEventListener("seeked", onSeeked);
              if (this.video.readyState >= 4 && this.video.currentTime === currentTime) onSeeked();
            });
            this.drawFrame(currentTime); combinedStream.getVideoTracks()[0].requestFrame(); currentTime += frameDuration;
          }
          recorder.stop();
        } catch (err) { reject(err); }
      });
    },

    recordSegmentRealtime(start, end) {
      return new Promise(resolve => {
        this.video.currentTime = start;
        const videoStream = this.canvas.captureStream(this.settings.fps);
        const combinedStream = new MediaStream([videoStream.getVideoTracks()[0]]);
        if (this.settings.recordAudio) {
            const audioTrack = this.isCamera ? this.video.srcObject?.getAudioTracks()[0] : this.audio.recorderDest?.stream.getAudioTracks()[0];
            if (audioTrack) combinedStream.addTrack(audioTrack);
        }
        const recorder = new MediaRecorder(combinedStream, { mimeType: "video/webm;codecs=vp9", videoBitsPerSecond: 50000000 });
        let chunks = []; recorder.ondataavailable = e => chunks.push(e.data);
        recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
        recorder.start(); this.video.muted = !this.settings.recordAudio; this.video.play();
        const check = () => {
          this.drawFrame(this.video.currentTime);
          if (this.video.currentTime >= end || this.video.ended) { this.video.pause(); recorder.stop(); } 
          else if (this.isExporting) { requestAnimationFrame(check); } 
          else { recorder.stop(); }
        };
        check();
      });
    },

    async uploadAndProcessSegment(blob) {
      const formData = new FormData();
      formData.append("segment", blob); formData.append("fps", this.settings.fps);
      formData.append("width", this.settings.exportWidth); formData.append("height", this.settings.exportHeight);
      const res = await fetch("/process-segment", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Segment upload failed");
      const { segmentId } = await res.json(); return segmentId;
    },

    async waitForSegment(segmentId) {
      return new Promise((resolve, reject) => {
        const poll = async () => {
          try {
            const res = await fetch(`/job-status/${segmentId}`);
            const job = await res.json();
            if (job.status === "completed") resolve(segmentId);
            else if (job.status === "error") reject(new Error("Segment processing failed"));
            else setTimeout(poll, 1000);
          } catch (e) { reject(e); }
        };
        poll();
      });
    },

    pollFinalJob(jobId) {
      const poll = async () => {
        try {
          const res = await fetch(`/job-status/${jobId}`);
          const job = await res.json();
          if (job.status === "completed") {
            this.renderMsg = "Done!"; this.renderProgress = 100;
            const a = document.createElement("a"); a.href = job.downloadUrl; a.download = "ascii_final.mp4"; a.click();
            setTimeout(() => this.isExporting = false, 2000);
          } else if (job.status === "error") { alert("Stitching Error: " + job.error); this.isExporting = false; } 
          else { this.renderMsg = "Stitching final video..."; this.renderProgress = 75; setTimeout(poll, 1000); }
        } catch (err) { alert("Polling error: " + err.message); this.isExporting = false; }
      };
      poll();
    },

    stopRecording() { if (this.isExporting) { this.isExporting = false; this.renderMsg = "Export cancelled."; this.video.pause(); } }
  };
}
