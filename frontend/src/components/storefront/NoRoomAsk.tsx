"use client";

/**
 * Asked when more was wanted on a sheet than it has room for.
 *
 * The builder used to answer this by itself, and badly: the copies that did
 * not fit were put in a pile in the corner. Whether to pay for a bigger sheet,
 * start another one, or settle for fewer is the buyer's decision — so it is
 * put to them, with what each choice costs, before anything is placed.
 */
export interface NoRoomChoice {
  key: string;
  label: string;
  /** What it means for the sheet and the price, in a sentence. */
  detail: string;
}

export function NoRoomAsk({
  title, message, choices, onPick, onCancel,
}: {
  title: string;
  message: string;
  /** Best first: the first is drawn as the one to take. */
  choices: NoRoomChoice[];
  onPick: (key: string) => void;
  onCancel: () => void;
}) {
  return (
    <div onClick={onCancel} style={S.backdrop}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title} style={S.box}>
        <div style={S.title}>{title}</div>
        <p style={S.message}>{message}</p>

        <div style={S.list}>
          {choices.map((c, i) => (
            <button key={c.key} type="button" data-choice={c.key} onClick={() => onPick(c.key)}
              style={{ ...S.choice, ...(i === 0 ? S.choiceFirst : null) }}>
              <span style={{ ...S.label, ...(i === 0 ? { color: "#14532D" } : null) }}>{c.label}</span>
              <span style={S.detail}>{c.detail}</span>
            </button>
          ))}
        </div>

        <div style={S.foot}>
          <button type="button" onClick={onCancel} style={S.cancel}>{choices.length ? "Cancel" : "OK"}</button>
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  backdrop: { position: "fixed", inset: 0, zIndex: 650, background: "rgba(16,24,40,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" },
  box: { background: "#fff", borderRadius: "14px", padding: "24px", width: "100%", maxWidth: "460px", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(16,24,40,.28)", fontFamily: "'Inter', 'DM Sans', system-ui, sans-serif" },
  title: { fontSize: "18px", fontWeight: 800, color: "#1F2430" },
  message: { fontSize: "13.5px", color: "#5B6170", lineHeight: 1.6, margin: "7px 0 16px" },
  list: { display: "flex", flexDirection: "column", gap: "8px" },
  choice: { display: "block", width: "100%", textAlign: "left", background: "#fff", border: "1px solid #E6E8EC", borderRadius: "10px", padding: "12px 14px", cursor: "pointer", fontFamily: "inherit" },
  choiceFirst: { background: "#E9F7EF", borderColor: "#BFE6CE" },
  label: { display: "block", fontSize: "14px", fontWeight: 700, color: "#1F2430" },
  detail: { display: "block", fontSize: "12.5px", color: "#5B6170", lineHeight: 1.5, marginTop: "3px" },
  foot: { display: "flex", justifyContent: "flex-end", marginTop: "16px" },
  cancel: { background: "#fff", border: "1px solid #E6E8EC", color: "#1F2430", borderRadius: "9px", padding: "10px 18px", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
};

export default NoRoomAsk;
