interface SkillRingProps {
  value: number;
  target?: number;
  label: string;
  size?: number;
  onClick?: () => void;
  expanded?: boolean;
}

export default function SkillRing({ value, target, label, size = 100, onClick, expanded }: SkillRingProps) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(value / 10, 1);
  const targetProgress = target ? Math.min(target / 10, 1) : 0;
  const strokeDashoffset = circumference * (1 - progress);
  const targetDashoffset = circumference * (1 - targetProgress);

  const color = value >= 7 ? 'var(--accent)' : value >= 4 ? 'var(--warning)' : 'var(--danger)';
  const gap = target ? Math.max(target - value, 0) : 0;

  return (
    <div
      className="stat-card"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px',
        cursor: onClick ? 'pointer' : 'default',
        borderColor: expanded ? 'var(--accent)' : undefined,
      }}
      onClick={onClick}
    >
      <div className="skill-ring">
        <svg width={size} height={size}>
          {/* Background */}
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--border-color)" strokeWidth="5" />
          {/* Target ring (dashed) */}
          {target && target > value && (
            <circle cx={size/2} cy={size/2} r={radius} fill="none"
              stroke="var(--text-muted)" strokeWidth="3" strokeDasharray={`${circumference * 0.03} ${circumference * 0.02}`}
              strokeDashoffset={targetDashoffset}
              style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }} />
          )}
          {/* Current progress */}
          <circle cx={size/2} cy={size/2} r={radius} fill="none"
            stroke={color} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
            style={{ transition: 'stroke-dashoffset 0.8s ease', transform: 'rotate(-90deg)', transformOrigin: 'center' }} />
          {/* Score text */}
          <text x={size/2} y={size/2 - 2} textAnchor="middle" fill={color} fontSize="1.2rem" fontWeight="700">
            {value.toFixed(1)}
          </text>
          <text x={size/2} y={size/2 + 14} textAnchor="middle" fill="var(--text-secondary)" fontSize="0.65rem">
            / 10
          </text>
        </svg>
        <span className="skill-ring-label">{label}</span>
        {gap > 0 && (
          <span style={{ fontSize: '0.7rem', color: 'var(--warning)', marginTop: 2 }}>
            +{gap.toFixed(1)} до цели
          </span>
        )}
      </div>
    </div>
  );
}


interface ComponentBarProps {
  name: string;
  playerValue: number;
  targetValue: number;
  baselineValue: number;
  score: number;
  targetScore: number;
}

export function ComponentBar({ name, playerValue, targetValue, baselineValue, score, targetScore }: ComponentBarProps) {
  const pct = Math.min((playerValue / Math.max(targetValue, 0.01)) * 100, 150);
  const gap = targetScore - score;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 4 }}>
        <span>{name}</span>
        <span>
          <strong style={{ color: score >= 5 ? 'var(--accent)' : 'var(--warning)' }}>
            {typeof playerValue === 'number' ? playerValue.toFixed(1) : playerValue}
          </strong>
          <span className="text-muted"> / {typeof targetValue === 'number' ? targetValue.toFixed(1) : targetValue}</span>
          {gap > 0.5 && <span className="text-danger" style={{ marginLeft: 6, fontSize: '0.75rem' }}>(-{gap.toFixed(1)})</span>}
        </span>
      </div>
      <div style={{ position: 'relative', height: 8, background: 'var(--border-color)', borderRadius: 4 }}>
        <div style={{
          position: 'absolute', height: '100%', borderRadius: 4,
          width: `${Math.min(pct, 100)}%`,
          background: pct >= 100 ? 'var(--accent)' : pct >= 70 ? 'var(--warning)' : 'var(--danger)',
          transition: 'width 0.5s ease',
        }} />
        {/* Target marker */}
        <div style={{
          position: 'absolute', left: '100%', top: -3, width: 2, height: 14,
          background: 'var(--text-muted)', borderRadius: 1,
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
        <span>Эталон ({baselineValue.toFixed(1)})</span>
        <span>Цель ({targetValue.toFixed(1)})</span>
      </div>
    </div>
  );
}
