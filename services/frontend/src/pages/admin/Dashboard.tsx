import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { coreApi } from '../../api/client';
import { InfoTooltip } from '../../ui/GameComponents';

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [billing, setBilling] = useState<any>(null);
  const [pendingCoaches, setPendingCoaches] = useState<number | null>(null);

  useEffect(() => {
    coreApi.get('/admin/stats').then((r) => setStats(r.data)).catch(() => {});
    coreApi.get('/billing/technical-summary').then((r) => setBilling(r.data)).catch(() => {});
    coreApi.get('/admin/coach-applications', { params: { status: 'PENDING' } })
      .then((r) => setPendingCoaches((r.data?.items || []).length))
      .catch(() => setPendingCoaches(null));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Панель администратора</h1>
        <p>Общая статистика пользователей, сессий и активности платформы</p>
      </div>

      {pendingCoaches !== null && pendingCoaches > 0 && (
        <div
          className="alert mb-20"
          style={{
            background: 'var(--warning-bg)',
            border: '1px solid var(--warning)',
            color: 'var(--text-primary)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span>
            <strong>Заявки в тренеры на рассмотрении:</strong> {pendingCoaches}.{' '}
            Подтвердите или отклоните, чтобы новые тренеры появились в каталоге.
          </span>
          <Link to="/admin/users" className="btn btn-primary btn-sm">
            Открыть заявки
          </Link>
        </div>
      )}

      <div className="grid-4 mb-30">
        <div className="stat-card">
          <div className="stat-card-label">Всего пользователей <InfoTooltip text="Все зарегистрированные core-пользователи." /></div>
          <div className="stat-card-value">{stats?.total_users || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Игроков <InfoTooltip text="Количество профилей игроков." /></div>
          <div className="stat-card-value">{stats?.players || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Тренеров <InfoTooltip text="Количество профилей тренеров в системе." /></div>
          <div className="stat-card-value">{stats?.coaches || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Средний рейтинг тренеров <InfoTooltip text="Средняя оценка по отзывам." /></div>
          <div className="stat-card-value text-accent">{stats?.avg_coach_rating || 'N/A'}</div>
        </div>
      </div>

      <div className="grid-4">
        <div className="stat-card">
          <div className="stat-card-label">Активных заявок <InfoTooltip text="Заявки в работе (не отменены и не отклонены)." /></div>
          <div className="stat-card-value">{stats?.active_requests || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Всего сессий <InfoTooltip text="Все записи на тренировки." /></div>
          <div className="stat-card-value">{stats?.total_sessions || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Запланировано <InfoTooltip text="Сессии со статусом PLANNED." /></div>
          <div className="stat-card-value">{stats?.planned_sessions || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Завершено <InfoTooltip text="Сессии со статусом COMPLETED." /></div>
          <div className="stat-card-value text-accent">{stats?.completed_sessions || 0}</div>
        </div>
      </div>

      <div className="card dash-card" style={{ marginTop: 20 }}>
        <div className="card-head">
          <div className="card-title">Оплаты и подписки</div>
          <span className="badge badge-accent">ЮKassa</span>
        </div>
        <div className="grid-4 mb-20">
          <div className="stat-card">
            <div className="stat-card-label">Успешных оплат</div>
            <div className="stat-card-value">{billing?.succeeded_payments || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Сумма</div>
            <div className="stat-card-value">{Number(billing?.succeeded_amount_rub || 0).toLocaleString('ru-RU')} ₽</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Активных Pro</div>
            <div className="stat-card-value text-accent">{billing?.active_subscriptions || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Провайдер</div>
            <div className="stat-card-value" style={{ fontSize: '1.2rem' }}>{billing?.provider || '—'}</div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Steam persona</th>
                <th>Сумма</th>
                <th>Статус</th>
                <th>Дата оплаты</th>
                <th>Подписка до</th>
              </tr>
            </thead>
            <tbody>
              {(billing?.payments || []).map((p: any) => (
                <tr key={p.id}>
                  <td>
                    {p.login || p.email || `core #${p.core_user_id}`}
                    {p.auth_user_id && <div className="text-muted" style={{ fontSize: '0.72rem' }}>auth #{p.auth_user_id}</div>}
                  </td>
                  <td>{p.steam_persona || '—'}</td>
                  <td>{Number(p.amount || 0).toLocaleString('ru-RU')} {p.currency || 'RUB'}</td>
                  <td><span className={`badge ${p.status === 'succeeded' ? 'badge-accent' : 'badge-muted'}`}>{p.status}</span></td>
                  <td>{p.created_at ? new Date(p.created_at).toLocaleString('ru-RU') : '—'}</td>
                  <td>{p.subscription_until ? new Date(p.subscription_until).toLocaleDateString('ru-RU') : '—'}</td>
                </tr>
              ))}
              {(!billing?.payments || billing.payments.length === 0) && (
                <tr>
                  <td colSpan={6} className="text-muted">Оплат пока нет.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
