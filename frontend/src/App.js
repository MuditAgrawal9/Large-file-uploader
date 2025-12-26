import { useChunkUploader } from "./hooks/useChunkUploader";
import UploadControls from "./components/UploadControls";
import ProgressBar from "./components/ProgressBar";
import Stats from "./components/Stats";
import ChunkGrid from "./components/ChunkGrid";

function App() {
  const {
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
  } = useChunkUploader();

  return (
    <div
      style={{
        maxWidth: 960,
        margin: "40px auto",
        padding: 24,
        fontFamily: "Inter, system-ui, sans-serif",
        background: "#fff",
        borderRadius: 12,
        boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Large File Uploader</h2>
        <p style={{ marginTop: 6, color: "#666", fontSize: 14 }}>
          Resumable · Chunked · Network-resilient
        </p>
      </header>

      {/* File Picker */}
      <div
        style={{
          border: "1px dashed #ccc",
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
        }}
      >
        <input
          type="file"
          onChange={(e) => setSelectedFile(e.target.files[0])}
        />
        {file && (
          <p style={{ marginTop: 8, fontSize: 13, color: "#444" }}>
            📄 {file.name} — {(file.size / (1024 * 1024)).toFixed(1)} MB
          </p>
        )}
      </div>

      <UploadControls
        onInit={initUpload}
        onStart={startUpload}
        onPause={pauseUpload}
        onResume={resumeUpload}
        isUploading={isUploading}
        isPaused={isPaused}
        disabled={!file}
      />

      <ProgressBar progress={progress} />

      <Stats progress={progress} speed={speed} eta={eta} />

      <ChunkGrid chunkStatus={chunkStatus} />
    </div>
  );
}

export default App;
