export default function AdminLoading() {
  return (
    <div style={{ fontFamily: "var(--font-jakarta)", padding: "0" }}>
      {/* Header skeleton */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ width: "180px", height: "32px", background: "#E8E6E0", borderRadius: "6px", marginBottom: "8px", animation: "pulse 1.5s ease-in-out infinite" }} />
        <div style={{ width: "260px", height: "14px", background: "#F0EDE8", borderRadius: "4px", animation: "pulse 1.5s ease-in-out infinite" }} />
      </div>

      {/* Toolbar skeleton */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
        <div style={{ flex: 1, height: "40px", background: "#F0EDE8", borderRadius: "8px", animation: "pulse 1.5s ease-in-out infinite" }} />
        <div style={{ width: "110px", height: "40px", background: "#F0EDE8", borderRadius: "8px", animation: "pulse 1.5s ease-in-out infinite" }} />
        <div style={{ width: "110px", height: "40px", background: "#F0EDE8", borderRadius: "8px", animation: "pulse 1.5s ease-in-out infinite" }} />
      </div>

      {/* Table skeleton */}
      <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "10px", overflow: "hidden" }}>
        <div style={{ background: "#F4F3EF", padding: "12px 16px", borderBottom: "2px solid #E2E0DA", display: "flex", gap: "24px" }}>
          {[120, 180, 80, 100, 100, 80].map((w, i) => (
            <div key={i} style={{ width: `${w}px`, height: "12px", background: "#E2E0DA", borderRadius: "4px", animation: "pulse 1.5s ease-in-out infinite" }} />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            style={{ padding: "16px", display: "flex", gap: "24px", alignItems: "center", borderBottom: "1px solid #F4F3EF", animationDelay: `${i * 80}ms` }}
          >
            <div style={{ width: "16px", height: "16px", background: "#F0EDE8", borderRadius: "3px", animation: "pulse 1.5s ease-in-out infinite" }} />
            <div style={{ width: "48px", height: "48px", background: "#F0EDE8", borderRadius: "8px", flexShrink: 0, animation: "pulse 1.5s ease-in-out infinite" }} />
            <div style={{ flex: 1 }}>
              <div style={{ width: `${120 + (i % 3) * 40}px`, height: "14px", background: "#F0EDE8", borderRadius: "4px", marginBottom: "6px", animation: "pulse 1.5s ease-in-out infinite" }} />
              <div style={{ width: "80px", height: "11px", background: "#F4F3EF", borderRadius: "4px", animation: "pulse 1.5s ease-in-out infinite" }} />
            </div>
            <div style={{ width: "60px", height: "22px", background: "#F0EDE8", borderRadius: "20px", animation: "pulse 1.5s ease-in-out infinite" }} />
            <div style={{ width: "70px", height: "14px", background: "#F0EDE8", borderRadius: "4px", animation: "pulse 1.5s ease-in-out infinite" }} />
            <div style={{ width: "80px", height: "14px", background: "#F0EDE8", borderRadius: "4px", animation: "pulse 1.5s ease-in-out infinite" }} />
          </div>
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
