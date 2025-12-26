import { useState, useRef } from "react";

const DEBUG = true;
const log = (...args) => DEBUG && console.log(...args);

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_CONCURRENT = 3;
const MAX_RETRIES = 3;
const BASE_DELAY = 500;

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function App() {
  const [file, setFile] = useState(null);
  const [uploadId, setUploadId] = useState(null);
  const [uploadedChunks, setUploadedChunks] = useState([]);
  const [chunkStatus, setChunkStatus] = useState({});
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0); // bytes/sec
  const [eta, setEta] = useState(0); // seconds

  const [isUploading, setIsUploading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const pauseRef = useRef(false);
  const completedChunksRef = useRef([]); // { time, size }
  const retryQueueRef = useRef([]); // 🔑 failed chunks retry queue

  // ================= FILE PICK =================
  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;

    log("File selected:", f.name, f.size);

    setFile(f);
    setUploadId(null);
    setUploadedChunks([]);
    setChunkStatus({});
    setProgress(0);
    setSpeed(0);
    setEta(0);
    setIsUploading(false);
    setIsPaused(false);

    pauseRef.current = false;
    completedChunksRef.current = [];
    retryQueueRef.current = [];
  };

  // ================= INIT =================
  const initUpload = async () => {
    if (!file) return alert("Select a file first");

    const res = await fetch("http://localhost:4000/upload/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        totalSize: file.size,
        totalChunks: Math.ceil(file.size / CHUNK_SIZE),
      }),
    });

    const data = await res.json();
    log("Init response:", data);

    setUploadId(data.uploadId);
    setUploadedChunks(data.uploadedChunks);

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    const status = {};
    for (let i = 0; i < totalChunks; i++) {
      status[i] = data.uploadedChunks.includes(i) ? "SUCCESS" : "PENDING";
    }
    setChunkStatus(status);

    setProgress((data.uploadedChunks.length / totalChunks) * 100);
  };

  // ================= SINGLE CHUNK =================
  const uploadSingleChunk = async (chunkIndex, attempt = 1) => {
    try {
      setChunkStatus((p) => ({ ...p, [chunkIndex]: "UPLOADING" }));

      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(file.size, start + CHUNK_SIZE);
      const chunk = file.slice(start, end);

      const formData = new FormData();
      formData.append("uploadId", uploadId);
      formData.append("chunkIndex", chunkIndex);
      formData.append("chunk", chunk);

      const res = await fetch("http://localhost:4000/upload/chunk", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      await res.json();

      const now = Date.now();
      completedChunksRef.current.push({ time: now, size: chunk.size });
      completedChunksRef.current = completedChunksRef.current.filter(
        (c) => now - c.time <= 5000
      );

      const bytesLast5Sec = completedChunksRef.current.reduce(
        (sum, c) => sum + c.size,
        0
      );
      setSpeed(bytesLast5Sec / 5);

      setUploadedChunks((prev) => {
        if (prev.includes(chunkIndex)) return prev;

        const updated = [...prev, chunkIndex];
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

        setProgress((updated.length / totalChunks) * 100);

        const chunksRemaining = totalChunks - updated.length;
        const chunksPerSecond = completedChunksRef.current.length / 5 || 0.0001;

        setEta(chunksRemaining / chunksPerSecond);
        return updated;
      });

      setChunkStatus((p) => ({ ...p, [chunkIndex]: "SUCCESS" }));
    } catch (err) {
      log(`Chunk ${chunkIndex} failed attempt ${attempt}`);

      if (attempt >= MAX_RETRIES) {
        setChunkStatus((p) => ({ ...p, [chunkIndex]: "ERROR" }));
        retryQueueRef.current.push(chunkIndex); // 🔑 retry later
        return;
      }

      await sleep(BASE_DELAY * Math.pow(2, attempt - 1));
      return uploadSingleChunk(chunkIndex, attempt + 1);
    }
  };

  // ================= UPLOAD MANAGER =================
  const uploadChunks = async () => {
    if (!uploadId) return alert("Init upload first");

    setIsUploading(true);
    setIsPaused(false);
    pauseRef.current = false;

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const pending = [];

    for (let i = 0; i < totalChunks; i++) {
      if (!uploadedChunks.includes(i)) pending.push(i);
    }

    let active = 0;
    let index = 0;

    return new Promise((resolve) => {
      const next = () => {
        if (pauseRef.current) return;

        if (
          index >= pending.length &&
          retryQueueRef.current.length === 0 &&
          active === 0
        ) {
          setIsUploading(false);
          resolve();
          return;
        }

        while (active < MAX_CONCURRENT && !pauseRef.current) {
          let chunkIndex;

          if (retryQueueRef.current.length > 0) {
            chunkIndex = retryQueueRef.current.shift();
            log("Retrying failed chunk:", chunkIndex);
          } else if (index < pending.length) {
            chunkIndex = pending[index++];
          } else {
            break;
          }

          if (uploadedChunks.includes(chunkIndex)) continue;

          active++;
          uploadSingleChunk(chunkIndex).finally(() => {
            active--;
            next();
          });
        }
      };

      next();
    });
  };

  // ================= PAUSE / RESUME =================
  const pauseUpload = () => {
    pauseRef.current = true;
    setIsPaused(true);
    setIsUploading(false);
  };

  const resumeUpload = () => {
    pauseRef.current = false;
    setIsPaused(false);
    uploadChunks();
  };

  // ================= UI =================
  return (
    <div
      style={{
        maxWidth: 900,
        margin: "20px auto",
        padding: "0 16px",
        fontFamily: "sans-serif",
      }}
    >
      <h2 style={{ textAlign: "center" }}>📦 Large File Uploader</h2>

      {/* File Picker */}
      <div style={{ marginBottom: 16 }}>
        <input type="file" onChange={handleFileChange} />
      </div>

      {/* Controls */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 20,
        }}
      >
        <button onClick={initUpload} disabled={!file || isUploading}>
          Init
        </button>
        <button onClick={uploadChunks} disabled={!uploadId || isUploading}>
          Start
        </button>
        <button onClick={pauseUpload} disabled={!isUploading}>
          Pause
        </button>
        <button onClick={resumeUpload} disabled={!isPaused}>
          Resume
        </button>
      </div>

      {/* Progress Bar */}
      <div
        style={{
          border: "1px solid #ccc",
          height: 22,
          borderRadius: 4,
          overflow: "hidden",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            background: "#4caf50",
            transition: "width 0.3s",
          }}
        />
      </div>

      {/* Stats */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          fontSize: 14,
          marginBottom: 20,
        }}
      >
        <div>
          <b>Progress:</b> {progress.toFixed(2)}%
        </div>
        <div>
          <b>Speed:</b> {(speed / (1024 * 1024)).toFixed(2)} MB/s
        </div>
        <div>
          <b>ETA:</b> {eta ? eta.toFixed(1) : 0}s
        </div>
      </div>

      {/* Chunk Status */}
      <h3 style={{ marginBottom: 10 }}>Chunk Status</h3>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(24px, 1fr))",
          gap: 6,
          maxHeight: 300,
          overflowY: "auto",
          paddingBottom: 10,
        }}
      >
        {Object.entries(chunkStatus).map(([i, status]) => {
          const color =
            status === "SUCCESS"
              ? "#4caf50"
              : status === "UPLOADING"
              ? "#2196f3"
              : status === "ERROR"
              ? "#f44336"
              : "#9e9e9e";

          return (
            <div
              key={i}
              title={`Chunk ${i}: ${status}`}
              style={{
                height: 20,
                borderRadius: 4,
                backgroundColor: color,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export default App;
