import { useState } from 'react';
import { coreApi } from '../../api/client';

export default function PlayerMatchmaking() {
  const [role, setRole] = useState('');
  const [focus, setFocus] = useState('');
  const [useAi, setUseAi] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await coreApi.post('/matchmaking/requests', {
        desired_role: role || undefined,
        focus_area: focus || undefined,
        use_ai_coach: useAi,
      });
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Не удалось создать запрос');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Найти коуча</h1>
        <p>Создайте запрос на подбор коуча</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card mb-20">
        <h3 className="card-title">Новый запрос на подбор</h3>
        <div className="grid-2">
          <div className="form-group">
            <label>Желаемая позиция</label>
            <select className="form-select" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">Любая</option>
              <option value="POS1">Керри (POS1)</option>
              <option value="POS2">Мид (POS2)</option>
              <option value="POS3">Оффлейн (POS3)</option>
              <option value="POS4">Софт саппорт (POS4)</option>
              <option value="POS5">Хард саппорт (POS5)</option>
            </select>
          </div>
          <div className="form-group">
            <label>Область фокуса</label>
            <select className="form-select" value={focus} onChange={(e) => setFocus(e.target.value)}>
              <option value="">Общее</option>
              <option value="lane_control">Контроль линии</option>
              <option value="macro">Макро / движение по карте</option>
              <option value="hero_pool">Пул героев</option>
              <option value="teamfight">Позиционирование в тимфайтах</option>
              <option value="communication">Коммуникация</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>
            <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />{' '}
            Также получать рекомендации ИИ-коуча
          </label>
        </div>
        <button className="btn btn-primary" onClick={submit} disabled={loading}>
          {loading ? 'Поиск коучей...' : 'Найти коучей'}
        </button>
      </div>

      {result && (
        <div className="card">
          <h3 className="card-title">Рекомендованные коучи</h3>
          <div className="mb-10">
            <span className="badge badge-accent">Статус: {result.status}</span>
          </div>
          {result.recommended_coaches && result.recommended_coaches.length > 0 ? (
            <div className="grid-3">
              {result.recommended_coaches.map((coach: any, i: number) => (
                <div key={i} className="card">
                  <div className="flex-between mb-10">
                    <strong>Коуч №{coach.coach_profile_id}</strong>
                    <span className="badge badge-accent">Оценка: {(coach.score * 100).toFixed(0)}%</span>
                  </div>
                  <ul style={{ paddingLeft: 16 }}>
                    {coach.reasons?.map((r: string, j: number) => (
                      <li key={j} className="text-muted" style={{ fontSize: '0.85rem' }}>{r}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted">Коучей пока не найдено. Заходите позже.</p>
          )}
        </div>
      )}
    </div>
  );
}
