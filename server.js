const express = require("express");
const path = require("path");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");

const app = express();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

const jobs = new Map();

// Process a single segment
app.post("/process-segment", multer({ storage: multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => cb(null, `seg_${Date.now()}_${Math.random().toString(36).slice(2)}.webm`)
})}).single("segment"), (req, res) => {
  const { fps, width, height } = req.body;
  const inputPath = req.file.path;
  const segmentId = `seg_${Date.now()}`;
  const outputPath = inputPath.replace(".webm", ".mp4");
  const targetFps = parseFloat(fps) || 30;
  const w = parseInt(width);
  const h = parseInt(height);

  jobs.set(segmentId, { status: "processing", progress: 0, timestamp: Date.now() });

  const runSegmentFfmpeg = (useGpu = true) => {
    const command = ffmpeg(inputPath);
    
    // Scale and Pad to maintain aspect ratio exactly
    if (!isNaN(w) && !isNaN(h)) {
      command.videoFilters([
        {
          filter: 'scale',
          options: {
            w: w,
            h: h,
            force_original_aspect_ratio: 'decrease'
          }
        },
        {
          filter: 'pad',
          options: {
            w: w,
            h: h,
            x: '(ow-iw)/2',
            y: '(oh-ih)/2',
            color: 'black'
          }
        }
      ]);
    }

    const options = useGpu ? [
      "-c:v h264_nvenc", "-preset slow", "-cq 18",
      `-r ${targetFps}`, "-pix_fmt yuv420p",
      "-c:a aac", "-b:a 192k", "-movflags +faststart"
    ] : [
      "-c:v libx264", "-preset fast", "-crf 18",
      `-r ${targetFps}`, "-pix_fmt yuv420p",
      "-c:a aac", "-b:a 192k", "-movflags +faststart"
    ];

    command.outputOptions(options)
      .on("progress", (p) => {
        const job = jobs.get(segmentId);
        if (job) job.progress = Math.round(p.percent || 0);
      })
      .on("error", (err) => {
        if (useGpu) {
          console.warn(`[Segment ${segmentId}] GPU failed, retrying with CPU...`);
          runSegmentFfmpeg(false);
        } else {
          console.error(`[Segment ${segmentId}] error:`, err);
          const job = jobs.get(segmentId);
          if (job) job.status = "error";
          fs.unlink(inputPath, () => {});
        }
      })
      .on("end", () => {
        const job = jobs.get(segmentId);
        if (job) {
          job.status = "completed";
          job.path = outputPath;
        }
        fs.unlink(inputPath, () => {});
      })
      .save(outputPath);
  };

  runSegmentFfmpeg(true);
  res.json({ segmentId });
});

// Stitch all segments together
app.post("/stitch-segments", (req, res) => {
  const { segmentIds } = req.body;
  const jobId = `stitch_${Date.now()}`;
  const outputName = `final_${Date.now()}.mp4`;
  const outputPath = path.join("uploads", outputName);

  const readySegments = segmentIds.map(id => jobs.get(id)).filter(j => j && j.status === "completed");
  
  if (readySegments.length === 0) {
    return res.status(400).send("No valid segments found");
  }

  // Create concat file
  const concatPath = path.join("uploads", `concat_${Date.now()}.txt`);
  const content = readySegments.map(s => `file '${path.basename(s.path)}'`).join("\n");
  fs.writeFileSync(concatPath, content);

  jobs.set(jobId, { status: "processing", progress: 0, timestamp: Date.now() });

  ffmpeg()
    .input(concatPath)
    .inputOptions(["-f concat", "-safe 0"])
    .outputOptions("-c copy")
    .on("error", (err) => {
      console.error("Stitch error:", err);
      const job = jobs.get(jobId);
      if (job) job.status = "error";
      if (fs.existsSync(concatPath)) fs.unlink(concatPath, () => {});
    })
    .on("end", () => {
      const job = jobs.get(jobId);
      if (job) {
        job.status = "completed";
        job.downloadUrl = `/download/${outputName}`;
      }
      if (fs.existsSync(concatPath)) fs.unlink(concatPath, () => {});
      // Optional: cleanup segments after stitching
      readySegments.forEach(s => {
        if (fs.existsSync(s.path)) fs.unlink(s.path, () => {});
      });
    })
    .save(outputPath);

  res.json({ jobId });
});

// Poll for job status
app.get("/job-status/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).send("Job not found");
  res.json(job);
});

app.get("/download/:name", (req, res) => {
  const filePath = path.join(__dirname, "uploads", req.params.name);
  if (!fs.existsSync(filePath)) return res.status(404).send("File not found");
  
  res.download(filePath, "ascii_video.mp4", (err) => {
    if (err && err.code !== 'ECONNABORTED') {
      console.error("Download error:", err);
    }
  });
});

if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

// Periodic cleanup: every 15 minutes
setInterval(() => {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;

  console.log("[Cleanup] Starting periodic cleanup...");

  // 1. Clean up jobs Map
  for (const [jobId, job] of jobs.entries()) {
    if (now - job.timestamp > ONE_HOUR) {
      jobs.delete(jobId);
    }
  }

  // 2. Clean up physical files in uploads/ that might be orphaned
  fs.readdir("uploads", (err, files) => {
    if (err) return;
    files.forEach(file => {
      const filePath = path.join("uploads", file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        if (now - stats.mtimeMs > ONE_HOUR) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
}, 15 * 60 * 1000);

app.listen(3000, () => console.log("http://localhost:3000"));
