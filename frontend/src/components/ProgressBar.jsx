export default function ProgressBar({ progress }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          height: 10,
          background: "#eee",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            background: "linear-gradient(90deg,#4caf50,#66bb6a)",
            transition: "width 0.3s",
          }}
        />
      </div>
    </div>
  );
}
