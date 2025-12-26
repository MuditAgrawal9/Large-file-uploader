export default function Stats({ progress, speed, eta }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
        fontSize: 13,
        color: "#444",
        marginBottom: 24,
      }}
    >
      <div>
        Progress: <b>{progress.toFixed(2)}%</b>
      </div>
      <div>
        Speed: <b>{(speed / (1024 * 1024)).toFixed(2)} MB/s</b>
      </div>
      <div>
        ETA: <b>{eta ? eta.toFixed(0) : 0}s</b>
      </div>
    </div>
  );
}
