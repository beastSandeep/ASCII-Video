const express = require("express");
const path = require("path");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.static(path.join(__dirname, "public")));

app.post("/upload-and-process", upload.single("video"), (req, res) => {
  const filePath = req.file.path;
  const fps = parseFloat(req.body.fps) || 30;
  const bitrate = req.body.bitrate || "8000k";
  const outputName = `processed_${Date.now()}.mp4`;
  const outputPath = path.join("uploads", outputName);

  console.log(`Processing video: ${filePath} at ${fps} FPS`);

  ffmpeg(filePath)
    .outputOptions([
      "-c:v libx264",
      "-preset slow",
      "-crf 16",
      `-r ${fps}`,
      "-pix_fmt yuv420p",
      "-color_range 2",
      "-colorspace 1",
      "-color_trc 1",
      "-color_primaries 1",
      "-vf scale=in_range=full:out_range=full,format=yuv420p,eq=saturation=1.2:contrast=1.1",
      "-x264-params", "fullrange=on",
      "-c:a aac",
      "-b:a 192k",
      "-movflags +faststart"
    ])
    .on("progress", (progress) => {
      if (progress.percent) {
        console.log(`Processing: ${Math.round(progress.percent)}% done`);
      }
    })
    .on("error", (err) => {
      console.error("Error processing video:", err);
      res.status(500).send("Error processing video");
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    })
    .on("end", () => {
      console.log("Processing finished:", outputPath);
      res.download(outputPath, "ascii_video.mp4", (err) => {
        if (err) console.error("Error sending file:", err);
        
        // Cleanup
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      });
    })
    .save(outputPath);
});

// Ensure uploads directory exists
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

app.listen(3000, () => {
  console.log("http://localhost:3000");
});
