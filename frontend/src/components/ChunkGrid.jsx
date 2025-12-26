export default function ChunkGrid({ chunkStatus }) {
  return (
    <div>
      <h4 style={{ marginBottom: 10 }}>Chunk Status</h4>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(18px, 1fr))",
          gap: 6,
          maxHeight: 240,
          overflowY: "auto",
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
              : "#bdbdbd";

          return (
            <div
              key={i}
              title={`Chunk ${i}: ${status}`}
              style={{
                height: 16,
                borderRadius: 4,
                background: color,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
