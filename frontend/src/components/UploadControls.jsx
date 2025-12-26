export default function UploadControls({
  onInit,
  onStart,
  onPause,
  onResume,
  disabled,
  isUploading,
  isPaused,
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        marginBottom: 24,
      }}
    >
      <button
        className="btn"
        onClick={onInit}
        disabled={disabled || isUploading}
      >
        Init
      </button>

      <button
        className="btn primary"
        onClick={onStart}
        disabled={disabled || isUploading}
      >
        Start
      </button>

      <button className="btn" onClick={onPause} disabled={!isUploading}>
        Pause
      </button>

      <button className="btn" onClick={onResume} disabled={!isPaused}>
        Resume
      </button>
    </div>
  );
}
