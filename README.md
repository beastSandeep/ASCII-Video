# ASCII WebGL Converter

A high-performance web application that converts videos and webcam streams into customizable ASCII art in real-time, featuring robust 4K export capabilities.

## ✨ Key Features

* **High-Performance WebGL:** Renders complex ASCII effects, including Bloom, Grain, CRT curves, and Scanlines instantly using the GPU.
* **Robust 4K Export:** 
  * **Deterministic Mode:** Captures frame-by-frame to guarantee perfect FPS and zero dropped frames.
  * **Segmented Processing:** Exports video in configurable chunks to minimize RAM usage and prevent backend file-locking crashes.
* **Custom Range Export:** Use timeline pointers to precisely select the start and end times for your export.
* **Resolution Control:** Easily scale down export resolution or maintain the native video resolution.
* **Audio Sync:** Automatically includes and synchronizes original video audio or microphone input in the final MP4.
* **Presets:** Save and load your favorite configurations as JSON files.

## 🚀 Getting Started

### Prerequisites
* Node.js (v14 or higher)
* FFmpeg installed and available in your system's PATH.

### Installation
1. Install dependencies: `npm install`
2. Start the server: `npm start`
3. Open: `http://localhost:3000`

## ⌨️ Keyboard Shortcuts
* **Space:** Play / Pause
* **Arrows:** Seek frame-by-frame
* **M:** Mute / Unmute
* **L:** Toggle Loop
* **S:** Snapshot

## 🏗️ Tech Stack
* **Frontend:** Alpine.js, WebGL
* **Backend:** Node.js, Express, FFmpeg
