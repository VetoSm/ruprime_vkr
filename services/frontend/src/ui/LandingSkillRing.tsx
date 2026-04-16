type Props = {
  label: string;
  value: number; // 0..10
};

export default function LandingSkillRing({ label, value }: Props) {
  const safe = Math.max(0, Math.min(value, 10));
  const deg = (safe / 10) * 360;

  return (
    <div className="landing-skill-ring">
      <div
        className="landing-skill-ring-circle"
        style={{ background: `conic-gradient(var(--accent) ${deg}deg, rgba(22, 233, 212, 0.16) ${deg}deg)` }}
      >
        <div className="landing-skill-ring-inner">
          <strong>{safe.toFixed(1)}</strong>
          <span>/10</span>
        </div>
      </div>
      <div className="landing-skill-ring-label">{label}</div>
    </div>
  );
}
