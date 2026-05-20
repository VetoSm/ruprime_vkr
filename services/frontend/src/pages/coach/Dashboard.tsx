import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { coreApi } from '../../api/client';
import { useAuth } from '../../store/AuthContext';
import { InfoTooltip } from '../../ui/GameComponents';
import SkillRing, { ComponentBar } from '../../ui/SkillRing';

interface Student {
  player_profile_id: number;
  core_user_id: number;
  actual_rank_tier?: string | null;
  desired_rank_tier?: string | null;
  sessions_total: number;
  sessions_completed: number;
  last_completed_at?: string | null;
  next_planned_at?: string | null;
  analysis_summary?: {
    estimated_mmr?: number;
    estimated_rank_tier?: string;
    winrate?: number | null;
    kda_avg?: number;
    total_games?: number;
  } | null;
}

export default function CoachDashboard() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [myStats, setMyStats] = useState<any>(null);
  const [myFeatures, setMyFeatures] = useState<any>(null);
  const [showMyAnalysis, setShowMyAnalysis] = useState(false);

  useEffect(() => {
    coreApi.get('/me/overview').then((r) => setOverview(r.data)).catch(() => {});
    coreApi.get('/training-sessions/my').then((r) => setSessions(r.data || [])).catch(() => {});
    coreApi.get('/coach/students-overview')
      .then((r) => setStudents(r.data?.students || []))
      .catch(() => setStudents([]));
  }, []);

  const stats = overview?.stats || {};
  const profile = overview?.profile || {};
  const plannedSessions = sessions.filter((s) => s.status === 'PLANNED').length;
  const completedSessions = sessions.filter((s) => s.status === 'COMPLETED').length;
  const cancelledSessions = sessions.filter((s) => s.status === 'CANCELLED').length;

  const isVerified = Boolean(profile.is_verified);

  useEffect(() => {
    const playerProfileId = overview?.profile?.player_profile_id;
    if (!playerProfileId || !showMyAnalysis) return;
    coreApi.get(`/player/${playerProfileId}/stats/overview`, { params: { mode: 'ranked', period: '50' } })
      .then((r) => setMyStats(r.data))
      .catch(() => {});
    coreApi.get(`/player/${playerProfileId}/detailed-features`, { params: { mode: 'ranked', period: '50' } })
      .then((r) => setMyFeatures(r.data))
      .catch(() => {});
  }, [overview?.profile?.player_profile_id, showMyAnalysis]);

  return (
    <div>
      <div className="page-header">
        <h1>Панель тренера</h1>
        <p>С возвращением, {user?.login}! Обзор метрик и записей учеников.</p>
      </div>

      {!isVerified && (
        <div
          className="alert mb-20"
          style={{
            background: 'var(--warning-bg)',
            border: '1px solid var(--warning)',
            color: 'var(--text-primary)',
          }}
        >
          Профиль на модерации: пока тех-аккаунт его не подтвердит, вы не появляетесь в каталоге тренеров и не получаете заявки от игроков.
          Заполните профиль полностью, чтобы ускорить рассмотрение.
        </div>
      )}

      <div className="grid-4 mb-20">
        <div className="stat-card">
          <div className="stat-card-label">Предстоящие сессии <InfoTooltip text="Количество ваших тренировок в статусе PLANNED." /></div>
          <div className="stat-card-value">{plannedSessions || stats.upcoming_sessions || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Средний рейтинг <InfoTooltip text="Средняя оценка по отзывам учеников." /></div>
          <div className="stat-card-value text-accent">{stats.avg_rating || 'N/A'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Оценка MMR <InfoTooltip text="Ваша заявленная/сохраненная MMR-оценка." /></div>
          <div className="stat-card-value">{profile.mmr_estimate || 'N/A'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Завершено сессий <InfoTooltip text="Количество тренировок со статусом COMPLETED." /></div>
          <div className="stat-card-value text-accent">{completedSessions}</div>
        </div>
      </div>

      <div className="grid-3 mb-30">
        <div className="stat-card">
          <div className="stat-card-label">Всего записей <InfoTooltip text="Суммарно все сессии в вашем расписании." /></div>
          <div className="stat-card-value">{sessions.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Отменено <InfoTooltip text="Сессии в статусе CANCELLED." /></div>
          <div className="stat-card-value">{cancelledSessions}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Статус профиля <InfoTooltip text="Верификация влияет на доверие игроков к профилю тренера." /></div>
          <div className="stat-card-value">{profile.is_verified ? 'Верифицирован' : 'Не верифицирован'}</div>
        </div>
      </div>

      <div className="card mb-20">
        <h3 className="card-title">Быстрые действия</h3>
        <div className="flex gap-10">
          <Link to="/coach/profile" className="btn btn-outline">Редактировать профиль</Link>
          <Link to="/coach/schedule" className="btn btn-outline">Расписание</Link>
          <Link to="/coach/reviews" className="btn btn-outline">Отзывы</Link>
        </div>
      </div>

      <div className="card mb-20">
        <h3 className="card-title">
          Моя игра <InfoTooltip text="Здесь — ваша собственная статистика как игрока: ранг, любимые роли, фитчи и AI-разбор. Используется для самооценки и подготовки к разборам с учениками." />
        </h3>
        {profile.player_profile_id ? (
          <>
            <p className="text-muted" style={{ fontSize: '0.92rem', marginTop: 0 }}>
              Steam привязан{profile.actual_rank_tier ? `, ваш текущий ранг: ${profile.actual_rank_tier}` : ''}.
              Те же инструменты, которыми пользуются ваши ученики, доступны и вам.
            </p>
            <div className="flex gap-10" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => setShowMyAnalysis((v) => !v)}>
                {showMyAnalysis ? 'Скрыть мой разбор' : 'Мой разбор игры'}
              </button>
              <Link to="/ai-chat" className="btn btn-outline">Спросить Оракула</Link>
              <Link to="/settings" className="btn btn-outline">Steam и настройки</Link>
            </div>
            {showMyAnalysis && (
              <div style={{ marginTop: 16 }}>
                <div className="grid-4 mb-20">
                  <div className="stat-card"><div className="stat-card-label">Матчей</div><div className="stat-card-value">{myStats?.summary?.games_analyzed ?? '—'}</div></div>
                  <div className="stat-card"><div className="stat-card-label">WR</div><div className="stat-card-value">{typeof myStats?.summary?.winrate === 'number' ? `${(myStats.summary.winrate * 100).toFixed(1)}%` : '—'}</div></div>
                  <div className="stat-card"><div className="stat-card-label">GPM</div><div className="stat-card-value">{myStats?.summary?.gpm_avg ?? '—'}</div></div>
                  <div className="stat-card"><div className="stat-card-label">KDA</div><div className="stat-card-value">{myStats?.summary?.kda_avg ?? '—'}</div></div>
                </div>
                {myFeatures?.categories?.length > 0 && (
                  <>
                    <div className="skill-grid mb-20">
                      {myFeatures.categories.map((cat: any) => (
                        <SkillRing key={cat.key} value={cat.score} target={cat.target} label={cat.name} />
                      ))}
                    </div>
                    {myFeatures.categories.slice(0, 3).map((cat: any) => (
                      <div key={cat.key} style={{ marginBottom: 12 }}>
                        <h4 style={{ margin: '0 0 8px' }}>{cat.name}</h4>
                        {cat.components.map((comp: any) => (
                          <ComponentBar key={comp.key} name={comp.name}
                            playerValue={comp.player_value} targetValue={comp.target_value}
                            baselineValue={comp.baseline_value} score={comp.score}
                            targetScore={comp.target_score} missing={Boolean(comp.missing)} />
                        ))}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-muted" style={{ fontSize: '0.92rem', marginTop: 0 }}>
              Привяжите свой Steam, чтобы видеть собственный разбор игры (фитчи, динамику, рекомендации Оракула) — то же, что вы получаете для своих учеников.
            </p>
            <div className="flex gap-10" style={{ flexWrap: 'wrap' }}>
              <Link to="/settings" className="btn btn-primary">Привязать Steam</Link>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">
          Мои ученики <InfoTooltip text="Игроки, с которыми у вас запланированы или проведены занятия." />
        </h3>
        {students.length === 0 ? (
          <p className="text-muted" style={{ fontSize: '0.9rem' }}>
            Пока нет учеников. Как только появятся заявки, они будут здесь — с их аналитикой, рангом и записями сессий.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Игрок</th>
                  <th>Ранг</th>
                  <th>MMR</th>
                  <th>Винрейт</th>
                  <th>Сессий</th>
                  <th>Следующая</th>
                  <th>Последняя</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const summary = s.analysis_summary || {};
                  const winrate = typeof summary.winrate === 'number' ? `${(summary.winrate * 100).toFixed(1)}%` : '—';
                  return (
                    <tr key={s.player_profile_id}>
                      <td>#{s.player_profile_id}</td>
                      <td>{s.actual_rank_tier || summary.estimated_rank_tier || '—'}</td>
                      <td>{summary.estimated_mmr || '—'}</td>
                      <td>{winrate}</td>
                      <td>{s.sessions_completed} / {s.sessions_total}</td>
                      <td>{s.next_planned_at ? new Date(s.next_planned_at).toLocaleString('ru-RU') : '—'}</td>
                      <td>{s.last_completed_at ? new Date(s.last_completed_at).toLocaleDateString('ru-RU') : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
