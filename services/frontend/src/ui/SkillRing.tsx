interface SkillRingProps {
  value: number;
  target?: number;
  label: string;
  size?: number;
  onClick?: () => void;
  expanded?: boolean;
  missing?: boolean;
}

export default function SkillRing({ value, target, label, size = 110, onClick, expanded, missing }: SkillRingProps) {
  const radius = (size - 14) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = missing ? 0 : Math.min(value / 10, 1);
  const strokeDashoffset = circumference * (1 - progress);

  const color = missing ? 'var(--text-muted)' : value >= 7 ? 'var(--accent)' : value >= 4 ? 'var(--warning)' : 'var(--danger)';
  const bgGlow = missing ? 'rgba(255,255,255,0.03)' : value >= 7 ? 'rgba(0,212,170,0.06)' : value >= 4 ? 'rgba(255,165,2,0.06)' : 'rgba(255,71,87,0.06)';
  const gap = !missing && target ? Math.max(target - value, 0) : 0;

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 12px',
        background: expanded ? bgGlow : 'var(--bg-card)',
        border: `1px solid ${expanded ? color : 'var(--border-color)'}`,
        borderRadius: 'var(--radius-lg)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.25s ease',
      }}
      onClick={onClick}
      onMouseEnter={(e) => { if (!expanded) (e.currentTarget.style.borderColor = `${color}50`); }}
      onMouseLeave={(e) => { if (!expanded) (e.currentTarget.style.borderColor = 'var(--border-color)'); }}
    >
      <svg width={size} height={size} style={{ filter: `drop-shadow(0 0 8px ${color}30)` }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke="rgba(30,42,69,0.8)" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
          style={{ transition: 'stroke-dashoffset 1s ease', transform: 'rotate(-90deg)', transformOrigin: 'center' }} />
        <text x={size / 2} y={size / 2 - 4} textAnchor="middle" fill={color}
          fontSize="1.4rem" fontWeight="800" fontFamily="Inter, sans-serif">
          {missing ? '—' : value.toFixed(1)}
        </text>
        <text x={size / 2} y={size / 2 + 14} textAnchor="middle" fill="var(--text-muted)"
          fontSize="0.7rem" fontWeight="600" fontFamily="Inter, sans-serif">
          {missing ? 'нет данных' : '/10'}
        </text>
      </svg>
      <span style={{
        fontSize: '0.82rem', color: 'var(--text-primary)', textAlign: 'center',
        fontWeight: 600, marginTop: 8, lineHeight: 1.3,
      }}>{label}</span>
      {gap > 0 && (
        <span style={{
          fontSize: '0.68rem', color: 'var(--warning)', marginTop: 4,
          background: 'rgba(255,165,2,0.08)', padding: '2px 8px', borderRadius: 10,
        }}>
          +{gap.toFixed(1)} до цели
        </span>
      )}
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
  missing?: boolean;
}

export function ComponentBar({ name, playerValue, targetValue, baselineValue, score, targetScore, missing }: ComponentBarProps) {
  if (missing) {
    return (
      <div style={{
        marginBottom: 16,
        padding: '10px 12px',
        border: '1px dashed var(--border-color)',
        borderRadius: 'var(--radius)',
        color: 'var(--text-secondary)',
        background: 'rgba(255,255,255,0.02)',
      }}>
        <strong style={{ color: 'var(--text-primary)' }}>{name}</strong>
        <div style={{ fontSize: '0.78rem', marginTop: 4 }}>
          Метрика пока не посчитана: нужны parsed-матчи. Не учитываем её как слабое место.
        </div>
      </div>
    );
  }

  const maxVal = Math.max(targetValue, playerValue, baselineValue, 1);
  const playerPct = Math.min((playerValue / maxVal) * 100, 100);
  const targetPct = Math.min((targetValue / maxVal) * 100, 100);
  const gap = targetScore - score;

  const barColor = playerPct >= targetPct
    ? 'linear-gradient(90deg, #00d4aa, #00ffc8)'
    : playerPct >= targetPct * 0.7
      ? 'linear-gradient(90deg, #ffa502, #ffca28)'
      : 'linear-gradient(90deg, #ff4757, #ff6b81)';

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{name}</span>
        <span style={{ fontSize: '0.82rem' }}>
          <strong style={{ color: score >= 5 ? 'var(--accent)' : 'var(--warning)' }}>
            {typeof playerValue === 'number' ? playerValue.toFixed(1) : playerValue}
          </strong>
          <span style={{ color: 'var(--text-muted)' }}> / {typeof targetValue === 'number' ? targetValue.toFixed(1) : targetValue}</span>
          {gap > 0.5 && (
            <span style={{
              marginLeft: 6, fontSize: '0.72rem', color: 'var(--danger)',
              background: 'rgba(255,71,87,0.08)', padding: '1px 6px', borderRadius: 8,
            }}>-{gap.toFixed(1)}</span>
          )}
        </span>
      </div>
      <div style={{
        position: 'relative', height: 10, background: 'rgba(30,42,69,0.6)',
        borderRadius: 5, overflow: 'visible',
      }}>
        <div style={{
          position: 'absolute', height: '100%', borderRadius: 5,
          width: `${Math.min(playerPct, 100)}%`,
          background: barColor,
          transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: playerPct >= targetPct ? '0 0 10px rgba(0,212,170,0.3)' : 'none',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 5,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 100%)',
          }} />
        </div>
        {targetPct > 0 && targetPct <= 100 && (
          <div style={{
            position: 'absolute', left: `${targetPct}%`, top: -2, width: 2, height: 14,
            background: 'var(--text-secondary)', borderRadius: 1, opacity: 0.7,
          }} />
        )}
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 3,
      }}>
        <span>Эталон: {baselineValue.toFixed(1)}</span>
        <span>Цель: {targetValue.toFixed(1)}</span>
      </div>
    </div>
  );
}
