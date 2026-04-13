interface Props {
  text: string;
  visible: boolean;
}

export default function DisclosurePanel({ text, visible }: Props) {
  return (
    <div
      style={{
        ...container,
        transform: visible ? "translateY(0)" : "translateY(-100%)",
        opacity: visible ? 1 : 0,
      }}
    >
      <p style={heading}>CLASSIFICATION NOTICE</p>
      <p style={body}>{text}</p>
    </div>
  );
}

const container: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  background: "rgba(10,10,10,0.92)",
  backdropFilter: "blur(8px)",
  padding: "16px 24px",
  borderBottom: "1px solid var(--color-accent-dim)",
  transition: "transform 0.6s ease, opacity 0.6s ease",
  zIndex: 20,
};

const heading: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.12em",
  color: "var(--color-accent)",
  marginBottom: 8,
  textTransform: "uppercase",
};

const body: React.CSSProperties = {
  fontFamily: "var(--font-serif)",
  fontSize: 13,
  lineHeight: 1.6,
  color: "var(--color-text-dim)",
};
