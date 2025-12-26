import { useState, useRef } from "react";

const DEBUG = true;
const log = (...args) => DEBUG && console.log(...args);

const CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_CONCURRENT = 3;
const MAX_RETRIES = 3;
const BASE_DELAY = 500;

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

export function useChunkUploader() {
  const [file, setFile] = useState(null);
  const [uploadId, setUploadId] = useState(null);
  const [uploadedChunks, setUploadedChunks] = useState([]);
  const [chunkStatus, setChunkStatus] = useState({});
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const pauseRef = useRef(false);
  const completedChunksRef = useRef([]);
  const retryQueueRef = useRef([]);

  // FILE SELECT
  const setSelectedFile = (f) => {
    if (!f) return;

    log("File selected:", f.name);

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

  // INIT
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

  // SINGLE CHUNK
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

        const remaining = totalChunks - updated.length;
        const rate = completedChunksRef.current.length / 5 || 0.0001;
        setEta(remaining / rate);

        return updated;
      });

      setChunkStatus((p) => ({ ...p, [chunkIndex]: "SUCCESS" }));
    } catch {
      if (attempt >= MAX_RETRIES) {
        setChunkStatus((p) => ({ ...p, [chunkIndex]: "ERROR" }));
        retryQueueRef.current.push(chunkIndex);
        return;
      }

      await sleep(BASE_DELAY * Math.pow(2, attempt - 1));
      return uploadSingleChunk(chunkIndex, attempt + 1);
    }
  };

  // UPLOAD MANAGER
  const startUpload = () => {
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

    const next = () => {
      if (pauseRef.current) return;

      if (
        index >= pending.length &&
        retryQueueRef.current.length === 0 &&
        active === 0
      ) {
        setIsUploading(false);
        return;
      }

      while (active < MAX_CONCURRENT && !pauseRef.current) {
        let chunkIndex;

        if (retryQueueRef.current.length > 0) {
          chunkIndex = retryQueueRef.current.shift();
        } else if (index < pending.length) {
          chunkIndex = pending[index++];
        } else break;

        if (uploadedChunks.includes(chunkIndex)) continue;

        active++;
        uploadSingleChunk(chunkIndex).finally(() => {
          active--;
          next();
        });
      }
    };

    next();
  };

  const pauseUpload = () => {
    pauseRef.current = true;
    setIsPaused(true);
    setIsUploading(false);
  };

  const resumeUpload = () => {
    pauseRef.current = false;
    setIsPaused(false);
    startUpload();
  };

  return {
    file,
    setSelectedFile,
    initUpload,
    startUpload,
    pauseUpload,
    resumeUpload,
    progress,
    speed,
    eta,
    chunkStatus,
    isUploading,
    isPaused,
  };
}
