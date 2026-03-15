import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';

export default function CoachProfilePage() {
  const [mmr, setMmr] = useState('');
  const [rank, setRank] = useState('');
  const [roles, setRoles] = useState('');
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
      setRoles(Array.isArray(p.main_roles) ? p.main_roles.join(', ') : '');
      setHeroes(Array.isArray(p.hero_pool) ? p.hero_pool.join(', ') : '');
      setRate(p.hourly_rate?.toString() || '');
      setExp(p.experience_years?.toString() || '');
      setAbout(p.about || '');
    }).catch(() => {});
  }, []);

  const save = async () => {
    try {
      await coreApi.post('/coach/profile', {
        mmr_estimate: mmr ? parseInt(mmr) : undefined,
        rank_tier: rank || undefined,
        main_roles: roles ? roles.split(',').map(s => s.trim()) : undefined,
        hero_pool: heroes ? heroes.split(',').map(s => s.trim()) : undefined,
        hourly_rate: rate ? parseFloat(rate) : undefined,
        experience_years: exp ? parseInt(exp) : undefined,
        about: about || undefined,
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
        <p>Редактируйте профиль тренера</p>
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}

      <div className="card">
        <div className="grid-2">
          <div className="form-group">
            <label>Оценка MMR</label>
            <input className="form-input" type="number" value={mmr} onChange={(e) => setMmr(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Ранг</label>
            <select className="form-select" value={rank} onChange={(e) => setRank(e.target.value)}>
              <option value="">Выберите...</option>
              {['HERALD','GUARDIAN','CRUSADER','ARCHON','LEGEND','ANCIENT','DIVINE','IMMORTAL'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Основные роли (через запятую)</label>
            <input className="form-input" value={roles} onChange={(e) => setRoles(e.target.value)} placeholder="POS1, POS2" />
          </div>
          <div className="form-group">
            <label>Пул героев (через запятую)</label>
            <input className="form-input" value={heroes} onChange={(e) => setHeroes(e.target.value)} placeholder="Invoker, Storm Spirit" />
          </div>
          <div className="form-group">
            <label>Ставка ($/час)</label>
            <input className="form-input" type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Опыт (лет)</label>
            <input className="form-input" type="number" value={exp} onChange={(e) => setExp(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label>О себе</label>
          <textarea className="form-input" value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Расскажите ученикам о себе..." />
        </div>
        <button className="btn btn-primary" onClick={save}>Сохранить профиль</button>
      </div>
    </div>
  );
}
