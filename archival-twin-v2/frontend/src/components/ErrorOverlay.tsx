import { ERROR_MESSAGES } from "../content/disclosureText";

interface Props {
  errorCode: string;
  detail: string;
  onDismiss: () => void;
}

export default function ErrorOverlay({ errorCode, detail, onDismiss }: Props) {
  const message = ERROR_MESSAGES[errorCode] ?? detail;

  return (
    <div style={overlay} onClick={onDismiss}>
      <div style={card}>
        <p style={code}>{errorCode.replace(/_/g, " ").toUpperCase()}</p>
        <p style={msg}>{message}</p>
        <p style={hint}>Tap to dismiss</p>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0,0,0,0.7)",
  zIndex: 50,
  cursor: "pointer",
};

const card: React.CSSProperties = {
  maxWidth: 420,
  padding: "32px 28px",
  textAlign: "center",
};

const code: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.1em",
  color: "var(--color-danger)",
  marginBottom: 12,
};

const msg: React.CSSProperties = {
  fontFamily: "var(--font-serif)",
  fontSize: 16,
  lineHeight: 1.6,
  color: "var(--color-text)",
  marginBottom: 20,
};

const hint: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  color: "var(--color-text-dim)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};
