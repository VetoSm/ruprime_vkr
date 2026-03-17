import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';
import { RankBadge, RoleBadge } from '../../ui/GameComponents';

export default function CoachProfilePage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mmr, setMmr] = useState('');
  const [rank, setRank] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [heroes, setHeroes] = useState('');
  const [rate, setRate] = useState('');
  const [exp, setExp] = useState('');
  const [about, setAbout] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    coreApi.get('/coach/profile').then((r) => {
      const p = r.data;
      setMmr(p.mmr_estimate?.toString() || '');
      setRank(p.rank_tier || '');
      setRoles(Array.isArray(p.main_roles) ? p.main_roles : []);
      setHeroes(Array.isArray(p.hero_pool) ? p.hero_pool.join(', ') : '');
      setRate(p.hourly_rate?.toString() || '');
      setExp(p.experience_years?.toString() || '');
      setAbout(p.about || '');
    }).catch(() => {});
  }, []);

  const save = async () => {
    try {
      const fullAbout = [firstName, lastName].filter(Boolean).join(' ') + (about ? '\n' + about : '');
      await coreApi.post('/coach/profile', {
        mmr_estimate: mmr ? parseInt(mmr) : undefined,
        rank_tier: rank || undefined,
        main_roles: roles.length > 0 ? roles : undefined,
        hero_pool: heroes ? heroes.split(',').map(s => s.trim()) : undefined,
        hourly_rate: rate ? parseFloat(rate) : undefined,
        experience_years: exp ? parseInt(exp) : undefined,
        about: fullAbout || undefined,
      });
      setMsg('Профиль сохранён!');
    } catch {
      setMsg('Ошибка сохранения');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Профиль тренера</h1>
        <p>Редактируйте профиль для привлечения учеников</p>
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}

      {/* Stats Row */}
      <div className="coach-stats-row">
        <div className="coach-stat">
          <div className="coach-stat-value">0</div>
          <div className="coach-stat-label">Ученики</div>
        </div>
        <div className="coach-stat">
          <div className="coach-stat-value">0</div>
          <div className="coach-stat-label">Сессии</div>
        </div>
        <div className="coach-stat">
          <div className="coach-stat-value">—</div>
          <div className="coach-stat-label">Рейтинг</div>
        </div>
        <div className="coach-stat">
          <div className="coach-stat-value" style={{ fontSize: '1.4rem' }}>
            {rate ? `${parseInt(rate).toLocaleString()} ₽` : '—'}
          </div>
          <div className="coach-stat-label">Ставка / час</div>
        </div>
      </div>

      <div className="card mb-20">
        <div className="section-header">
          <h3>Личные данные</h3>
          <div className="section-line" />
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label>Имя</label>
            <input className="form-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Иван" />
          </div>
          <div className="form-group">
            <label>Фамилия</label>
            <input className="form-input" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Иванов" />
          </div>
        </div>
      </div>

      <div className="card mb-20">
        <div className="section-header">
          <h3>Игровые данные</h3>
          <div className="section-line" />
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label>Оценка MMR</label>
            <input className="form-input" type="number" value={mmr} onChange={(e) => setMmr(e.target.value)} placeholder="6500" />
          </div>
          <div className="form-group">
            <label>Ранг</label>
            <select className="form-select" value={rank} onChange={(e) => setRank(e.target.value)}>
              <option value="">Выберите...</option>
              {['HERALD', 'GUARDIAN', 'CRUSADER', 'ARCHON', 'LEGEND', 'ANCIENT', 'DIVINE', 'IMMORTAL'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {rank && (
              <div style={{ marginTop: 8 }}><RankBadge rankName={rank} size="md" /></div>
            )}
          </div>
        </div>
        <div className="form-group">
          <label>Основные позиции</label>
          <div className="flex gap-10" style={{ flexWrap: 'wrap' }}>
            {['POS1', 'POS2', 'POS3', 'POS4', 'POS5'].map((r) => {
              const selected = roles.includes(r);
              return (
                <button key={r} type="button"
                  className={`btn btn-sm ${selected ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setRoles(selected ? roles.filter(x => x !== r) : [...roles, r])}>
                  <RoleBadge role={r} compact />
                </button>
              );
            })}
          </div>
        </div>
        <div className="form-group">
          <label>Пул героев (через запятую)</label>
          <input className="form-input" value={heroes} onChange={(e) => setHeroes(e.target.value)}
            placeholder="Invoker, Storm Spirit, Shadow Fiend" />
        </div>
      </div>

      <div className="card mb-20">
        <div className="section-header">
          <h3>Услуги</h3>
          <div className="section-line" />
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label>Почасовая ставка</label>
            <div className="flex gap-10" style={{ alignItems: 'center' }}>
              <input className="form-input" type="number" value={rate} onChange={(e) => setRate(e.target.value)}
                placeholder="1500" style={{ maxWidth: 200 }} />
              <span style={{ color: 'var(--accent)', fontWeight: 800, fontSize: '1rem' }}>₽ / час</span>
            </div>
          </div>
          <div className="form-group">
            <label>Опыт тренерства (лет)</label>
            <input className="form-input" type="number" value={exp} onChange={(e) => setExp(e.target.value)}
              placeholder="3" style={{ maxWidth: 150 }} />
          </div>
        </div>
        <div className="form-group">
          <label>О себе и методике</label>
          <textarea className="form-input" value={about} onChange={(e) => setAbout(e.target.value)}
            placeholder="Расскажите ученикам о вашем опыте и подходе к тренировкам..." />
        </div>
      </div>

      <button className="btn btn-primary" onClick={save}>Сохранить профиль</button>
    </div>
  );
}
