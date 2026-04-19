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

const activeUploads = new Map();
const jobs = new Map();

// Initialize an upload session
app.post("/upload-init", (req, res) => {
  const sessionId = `upload_${Date.now()}`;
  const tempPath = path.join("uploads", `${sessionId}.webm`);
  activeUploads.set(sessionId, tempPath);
  res.json({ sessionId });
});

// Receive a chunk and append it to the file
app.post("/upload-chunk", upload.single("chunk"), (req, res) => {
  const { sessionId } = req.body;
  const tempPath = activeUploads.get(sessionId);

  if (!tempPath) return res.status(400).send("Invalid session ID");

  try {
    fs.appendFileSync(tempPath, req.file.buffer);
    res.sendStatus(200);
  } catch (err) {
    console.error("Error appending chunk:", err);
    res.status(500).send("Error saving chunk");
  }
});

// Finalize and start background processing
app.post("/upload-finish", (req, res) => {
  const { sessionId, fps } = req.body;
  const tempPath = activeUploads.get(sessionId);

  if (!tempPath || !fs.existsSync(tempPath)) {
    return res.status(400).send("File not found");
  }

  const jobId = `job_${Date.now()}`;
  const outputName = `processed_${Date.now()}.mp4`;
  const outputPath = path.join("uploads", outputName);
  const targetFps = parseFloat(fps) || 30;

  jobs.set(jobId, { status: "processing", progress: 0, downloadUrl: null, error: null });
  
  // Return jobId immediately to avoid timeout
  res.json({ jobId });

  console.log(`[${jobId}] Starting processing: ${tempPath}`);

  const runFfmpeg = (useGpu = true) => {
    const command = ffmpeg(tempPath);
    const options = useGpu ? [
      "-c:v h264_nvenc", "-preset slow", "-cq 18",
      `-r ${targetFps}`, "-pix_fmt yuv420p",
      "-c:a aac", "-b:a 192k", "-movflags +faststart"
    ] : [
      "-c:v libx264", "-preset fast", "-crf 22",
      `-r ${targetFps}`, "-pix_fmt yuv420p",
      "-c:a aac", "-b:a 192k", "-movflags +faststart"
    ];

    command.outputOptions(options)
      .on("progress", (progress) => {
        if (progress.percent) {
          const job = jobs.get(jobId);
          if (job) job.progress = Math.round(progress.percent);
        }
      })
      .on("error", (err) => {
        if (useGpu) {
          console.warn(`[${jobId}] GPU failed, retrying with CPU...`);
          runFfmpeg(false);
        } else {
          console.error(`[${jobId}] FFmpeg error:`, err);
          const job = jobs.get(jobId);
          if (job) { job.status = "error"; job.error = err.message; }
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        }
      })
      .on("end", () => {
        console.log(`[${jobId}] Finished: ${outputPath}`);
        const job = jobs.get(jobId);
        if (job) {
          job.status = "completed";
          job.progress = 100;
          job.downloadUrl = `/download/${outputName}`;
        }
        activeUploads.delete(sessionId);
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      })
      .save(outputPath);
  };

  runFfmpeg(true);
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

app.listen(3000, () => console.log("http://localhost:3000"));
