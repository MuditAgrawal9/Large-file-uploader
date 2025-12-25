import { useState, useRef } from "react";

const DEBUG = true; // 👈 TURN LOGS ON/OFF HERE

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_CONCURRENT = 3;
const MAX_RETRIES = 3;
const BASE_DELAY = 500;

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const log = (...args) => DEBUG && console.log(...args);

function App() {
  const [file, setFile] = useState(null);
  const [uploadId, setUploadId] = useState(null);
  const [uploadedChunks, setUploadedChunks] = useState([]);
  const [chunkStatus, setChunkStatus] = useState({});
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const uploadedBytesRef = useRef(0);
  const startTimeRef = useRef(0);

  // ================= FILE PICK =================
  const handleFileChange = (e) => {
    const f = e.target.files[0];
    log("File selected:", f?.name, f?.size);
    setFile(f);
    setProgress(0);
    setSpeed(0);
    setEta(0);
    uploadedBytesRef.current = 0;
    setChunkStatus({});
  };

  // ================= INIT =================
  const initUpload = async () => {
    if (!file) return alert("Select a file first");

    log("Init upload request sent");

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
    const statusMap = {};
    for (let i = 0; i < totalChunks; i++) {
      statusMap[i] = data.uploadedChunks.includes(i) ? "SUCCESS" : "PENDING";
    }
    setChunkStatus(statusMap);
  };

  // ================= SINGLE CHUNK =================
  const uploadSingleChunk = async (chunkIndex, attempt = 1) => {
    try {
      log(`Uploading chunk ${chunkIndex}, attempt ${attempt}`);

      setChunkStatus((prev) => ({
        ...prev,
        [chunkIndex]: "UPLOADING",
      }));

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

      if (!res.ok) throw new Error("Network error");

      await res.json();
      log(`Chunk ${chunkIndex} uploaded successfully`);

      uploadedBytesRef.current += chunk.size;
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const currentSpeed = uploadedBytesRef.current / elapsed;
      const remaining = file.size - uploadedBytesRef.current;

      setSpeed(currentSpeed);
      setEta(remaining / currentSpeed);
      setProgress(Math.min(100, (uploadedBytesRef.current / file.size) * 100));

      setChunkStatus((prev) => ({
        ...prev,
        [chunkIndex]: "SUCCESS",
      }));
    } catch (err) {
      log(`Chunk ${chunkIndex} failed on attempt ${attempt}`, err);

      if (attempt >= MAX_RETRIES) {
        setChunkStatus((prev) => ({
          ...prev,
          [chunkIndex]: "ERROR",
        }));
        throw err;
      }

      const delay = BASE_DELAY * Math.pow(2, attempt - 1);
      log(`Retrying chunk ${chunkIndex} after ${delay}ms`);
      await sleep(delay);
      return uploadSingleChunk(chunkIndex, attempt + 1);
    }
  };

  // ================= CONCURRENT UPLOAD =================
  const uploadChunks = async () => {
    if (!uploadId) return alert("Init upload first");

    log("Starting concurrent upload");
    setIsUploading(true);
    startTimeRef.current = Date.now();

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const pending = [];

    for (let i = 0; i < totalChunks; i++) {
      if (!uploadedChunks.includes(i)) pending.push(i);
    }

    let active = 0;
    let index = 0;

    return new Promise((resolve) => {
      const next = () => {
        if (index >= pending.length && active === 0) {
          log("All chunks uploaded");
          setIsUploading(false);
          alert("Upload completed");
          resolve();
          return;
        }

        while (active < MAX_CONCURRENT && index < pending.length) {
          const chunkIndex = pending[index++];
          active++;
          log("Starting chunk", chunkIndex, "active:", active);

          uploadSingleChunk(chunkIndex)
            .catch(() => {})
            .finally(() => {
              active--;
              log("Finished chunk", chunkIndex, "active:", active);
              next();
            });
        }
      };

      next();
    });
  };

  // ================= UI =================
  return (
    <div style={{ padding: 40, maxWidth: 700 }}>
      <h2>Large File Uploader</h2>

      <input type="file" onChange={handleFileChange} />
      <br />
      <br />

      <button onClick={initUpload} disabled={!file || isUploading}>
        Init Upload
      </button>
      <br />
      <br />

      <button onClick={uploadChunks} disabled={!uploadId || isUploading}>
        Upload Chunks
      </button>

      <br />
      <br />

      <div style={{ border: "1px solid #ccc", height: 20 }}>
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            backgroundColor: "#4caf50",
          }}
        />
      </div>

      <p>Progress: {progress.toFixed(2)}%</p>
      <p>Speed: {(speed / (1024 * 1024)).toFixed(2)} MB/s</p>
      <p>ETA: {eta ? eta.toFixed(1) : 0} seconds</p>

      <h3>Chunk Status</h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(10, 1fr)",
          gap: 6,
        }}
      >
        {Object.keys(chunkStatus).map((i) => {
          const status = chunkStatus[i];
          const color =
            status === "SUCCESS"
              ? "green"
              : status === "UPLOADING"
              ? "blue"
              : status === "ERROR"
              ? "red"
              : "gray";

          return (
            <div
              key={i}
              title={`Chunk ${i}: ${status}`}
              style={{
                width: 20,
                height: 20,
                backgroundColor: color,
                borderRadius: 4,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export default App;
