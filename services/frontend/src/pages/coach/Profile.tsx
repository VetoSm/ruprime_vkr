import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';
import { loadHeroes, heroIcon, heroName, roleName } from '../../api/heroes';
import { RankBadge } from '../../ui/GameComponents';
import { EmptyState } from '../../ui/Primitives';
import { IconStar, IconClose } from '../../ui/Icons';

const ROLE_OPTIONS = [
  { id: 'POS1', label: 'Carry' },
  { id: 'POS2', label: 'Mid' },
  { id: 'POS3', label: 'Offlane' },
  { id: 'POS4', label: 'Soft Support' },
  { id: 'POS5', label: 'Hard Support' },
];

const RANK_OPTIONS = ['ANCIENT', 'DIVINE', 'IMMORTAL'];

type TabId = 'profile' | 'pricing' | 'students' | 'reviews';

export default function CoachProfile() {
  const [tab, setTab] = useState<TabId>('profile');

  // Data
  const [profile, setProfile] = useState<any>(null);
  const [steamData, setSteamData] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [studentsSummary, setStudentsSummary] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);

  // Form fields
  const [rate, setRate] = useState('');
  const [exp, setExp] = useState('');
  const [rank, setRank] = useState('');
  const [mmr, setMmr] = useState('');
  const [about, setAbout] = useState('');
  const [telegram, setTelegram] = useState('');
  const [mainRoles, setMainRoles] = useState<string[]>([]);
  const [heroes, setHeroes] = useState<string[]>([]);
  const [heroOptions, setHeroOptions] = useState<any[]>([]);
  const [heroPickerOpen, setHeroPickerOpen] = useState(false);
  const [heroSearch, setHeroSearch] = useState('');

  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    loadHeroes().then((hs) => {
      setHeroOptions(Object.values(hs).sort((a: any, b: any) => a.localized_name.localeCompare(b.localized_name)));
    });
    coreApi.get('/coach/profile').then((r) => {
      const p = r.data;
      setProfile(p);
      setRate(p.hourly_rate?.toString() || '');
      setExp(p.experience_years?.toString() || '');
      setRank(p.rank_tier || '');
      setMmr(p.mmr_estimate?.toString() || '');
      setAbout(p.about || '');
      setTelegram(p.telegram || '');
      setMainRoles(Array.isArray(p.main_roles) ? p.main_roles : []);
      setHeroes(Array.isArray(p.hero_pool) ? p.hero_pool.map(String) : []);
    }).catch(() => {});

    coreApi.get('/player/steam-data').then((r) => setSteamData(r.data)).catch(() => {});
    coreApi.get('/coach/students-overview').then((r) => {
      setStudents(r.data?.students || []);
      setStudentsSummary(r.data?.summary || null);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    coreApi.get(`/coach/${profile.id}/reviews`).then((r) => setReviews(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, [profile?.id]);

  const save = async () => {
    setMsg(''); setErr('');
    try {
      await coreApi.post('/coach/profile', {
        hourly_rate: rate ? Number(rate) : undefined,
        experience_years: exp ? Number(exp) : undefined,
        rank_tier: rank || undefined,
        mmr_estimate: mmr ? Number(mmr) : undefined,
        about: about || undefined,
        telegram: telegram || undefined,
        main_roles: mainRoles.length ? mainRoles : undefined,
        hero_pool: heroes.length ? heroes : undefined,
      });
      setMsg('Профиль сохранён.');
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Ошибка сохранения');
    }
  };

  const toggleRole = (r: string) => setMainRoles((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);
  const toggleHero = (hid: string) => setHeroes((prev) => prev.includes(hid) ? prev.filter((x) => x !== hid) : [...prev, hid]);

  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / reviews.length : null;
  const sessionsCount = students.reduce((acc, s) => acc + (s.sessions_total || 0), 0);

  const filteredHeroOptions = heroSearch
    ? heroOptions.filter((h: any) => (h.localized_name || h.name).toLowerCase().includes(heroSearch.toLowerCase()))
    : heroOptions;

  return (
    <div>
      <div className="stats-header">
        <div className="stats-header-title">
          <h1>Профиль тренера</h1>
          <p>Информация, которую видят игроки в каталоге</p>
        </div>
        <div className="stats-header-filters">
          <span className="text-muted" style={{ fontSize: '0.85rem' }}>
            {profile?.is_verified ? <span className="badge badge-accent">Проверенный</span> : <span className="badge badge-muted">На модерации</span>}
          </span>
        </div>
      </div>

      {msg && <div className="alert alert-success" style={{ marginBottom: 14 }}>{msg}</div>}
      {err && <div className="alert alert-error"   style={{ marginBottom: 14 }}>{err}</div>}

      {/* Preview-карточка (как видят игроки) */}
      <div className="coach-public-card">
        <div className="coach-public-portrait">
          {steamData?.avatar_url
            ? <img src={steamData.avatar_url} alt="" />
            : <span className="coach-public-portrait-initials">{(steamData?.personaname || 'Тренер').slice(0, 2).toUpperCase()}</span>}
        </div>
        <div className="coach-public-info">
          <div className="coach-public-name-row">
            <h2 className="coach-public-name">{steamData?.personaname || profile?.login || 'Тренер'}</h2>
            {rank && <RankBadge rankName={rank} size="md" />}
            <span className="coach-public-rank-label">{rank}</span>
          </div>
          <div className="coach-public-meta">
            Тренер · {mainRoles.length > 0 ? mainRoles.map((r) => roleName(r.replace('POS', ''))).join(' / ') : 'мульти-роль'}
            {exp && ` · ${exp} лет опыта`}
          </div>
          <div className="coach-public-stats">
            <div className="coach-public-stat">
              <span className="coach-public-stat-label">Сессий</span>
              <span className="coach-public-stat-value">{sessionsCount}</span>
            </div>
            <div className="coach-public-stat">
              <span className="coach-public-stat-label">Рейтинг</span>
              <span className="coach-public-stat-value">
                {avgRating != null ? avgRating.toFixed(1) : '—'}
                {avgRating != null && <IconStar size={14} color="#f6c463" />}
              </span>
            </div>
            <div className="coach-public-stat">
              <span className="coach-public-stat-label">WR учеников</span>
              <span className="coach-public-stat-value">
                {typeof studentsSummary?.avg_student_winrate === 'number'
                  ? `${(studentsSummary.avg_student_winrate * 100).toFixed(0)}%`
                  : '—'}
              </span>
            </div>
            <div className="coach-public-stat">
              <span className="coach-public-stat-label">Ставка</span>
              <span className="coach-public-stat-value">{rate ? `${Number(rate).toLocaleString('ru-RU')} ₽` : '—'}/час</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="seg-control" style={{ marginBottom: 18 }}>
        {([
          { id: 'profile',  label: 'О тренере' },
          { id: 'pricing',  label: 'Тарифы' },
          { id: 'students', label: 'Ученики' },
          { id: 'reviews',  label: 'Отзывы' },
        ] as { id: TabId; label: string }[]).map((t) => (
          <button
            key={t.id}
            type="button"
            className={`seg-control-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'reviews' && reviews.length > 0 && <span style={{ opacity: 0.6, marginLeft: 4 }}>· {reviews.length}</span>}
            {t.id === 'students' && students.length > 0 && <span style={{ opacity: 0.6, marginLeft: 4 }}>· {students.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="card dash-card">
          <div className="card-head"><div className="card-title">О тренере</div></div>
          <div className="profile-form">
            <div className="form-group">
              <label>О себе (видят игроки)</label>
              <textarea
                className="form-input"
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                rows={4}
                placeholder="Стиль работы, подход, что включает сессия, ожидания от ученика…"
              />
            </div>

            <div className="form-group">
              <label>Сильные стороны (роли)</label>
              <div className="role-toggle" role="tablist" style={{ borderRadius: 10, gridTemplateColumns: 'repeat(5, 1fr)' }}>
                {ROLE_OPTIONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`role-toggle-btn ${mainRoles.includes(r.id) ? 'active' : ''}`}
                    onClick={() => toggleRole(r.id)}
                    style={{ borderRadius: 8, padding: '8px 6px', fontSize: '0.78rem' }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid-2 form-grid">
              <div className="form-group">
                <label>Ранг</label>
                <div className="role-toggle" style={{ borderRadius: 10, gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  {RANK_OPTIONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`role-toggle-btn ${rank === r ? 'active' : ''}`}
                      onClick={() => setRank(rank === r ? '' : r)}
                      style={{ borderRadius: 8, padding: '8px 6px', fontSize: '0.78rem' }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>MMR</label>
                <input type="number" className="form-input" value={mmr} onChange={(e) => setMmr(e.target.value)} placeholder="напр. 5700" />
              </div>
            </div>

            <div className="grid-2 form-grid">
              <div className="form-group">
                <label>Опыт тренерства (лет)</label>
                <input type="number" className="form-input" value={exp} onChange={(e) => setExp(e.target.value)} placeholder="2" />
              </div>
              <div className="form-group">
                <label>Telegram (виден после подтверждения сессии)</label>
                <input type="text" className="form-input" value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@nickname" />
              </div>
            </div>

            {/* Hero pool */}
            <div className="form-group">
              <label>Пул героев (до 12)</label>
              <div className="coach-heropool-row">
                {heroes.length > 0 ? heroes.map((hid) => {
                  const num = Number(hid);
                  return (
                    <span key={hid} className="coach-hero-disc" title={heroName(num)}>
                      <img src={heroIcon(num)} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <button type="button" className="coach-hero-disc-remove" onClick={() => toggleHero(hid)} aria-label="Убрать">
                        <IconClose size={10} />
                      </button>
                    </span>
                  );
                }) : <span className="text-muted" style={{ fontSize: '0.82rem' }}>пусто</span>}
                <button type="button" className="coach-hero-add" onClick={() => setHeroPickerOpen(true)} disabled={heroes.length >= 12}>
                  + Добавить
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-primary btn-sm" onClick={save}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'pricing' && (
        <div className="card dash-card">
          <div className="card-head"><div className="card-title">Стоимость сессий</div></div>
          <div className="profile-form">
            <div className="form-group">
              <label>Ставка за час (₽)</label>
              <input type="number" className="form-input" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="1500" min={0} step={100} />
              <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: 4 }}>
                Это базовая ставка, которую видят игроки в карточке. Тариф «Пакет 5» и «Безлимит» появятся, когда добавим скидки.
              </div>
            </div>

            <div className="coach-tarifs-preview">
              <div className="coach-tarif-row">
                <span className="coach-tarif-name">Разовая</span>
                <span className="coach-tarif-desc">1 сессия · 60 минут</span>
                <span className="coach-tarif-price">{rate ? `${Number(rate).toLocaleString('ru-RU')} ₽` : '—'}</span>
              </div>
              <div className="coach-tarif-row coach-tarif-row--muted">
                <span className="coach-tarif-name">Пакет 5</span>
                <span className="coach-tarif-desc">5 сессий · 60 мин (−7%)</span>
                <span className="coach-tarif-price">{rate ? `${Math.round(Number(rate) * 5 * 0.93).toLocaleString('ru-RU')} ₽` : '—'}</span>
              </div>
              <div className="coach-tarif-row coach-tarif-row--muted">
                <span className="coach-tarif-name">Безлимит</span>
                <span className="coach-tarif-desc">30 дней · без ограничений (−20%)</span>
                <span className="coach-tarif-price">{rate ? `${Math.round(Number(rate) * 12 * 0.80).toLocaleString('ru-RU')} ₽` : '—'}</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary btn-sm" onClick={save}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'students' && (
        <div className="card dash-card">
          <div className="card-head"><div className="card-title">История учеников</div></div>
          {students.length > 0 ? (
            <div className="top-heroes-table">
              <div className="top-heroes-head" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr' }}>
                <span>Ученик</span>
                <span>Ранг</span>
                <span>Сессий</span>
                <span>Завершено</span>
                <span>Следующая</span>
              </div>
              {students.map((s: any) => (
                <div key={s.player_profile_id} className="top-heroes-row" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr' }}>
                  <span className="match-hero">
                    <span className="coach-portrait coach-portrait--sm" style={{ width: 28, height: 28 }}>
                      <span style={{ fontSize: '0.7rem' }}>#{s.player_profile_id}</span>
                    </span>
                    <span>Игрок #{s.player_profile_id}</span>
                  </span>
                  <span className="text-muted">{s.actual_rank_tier || '—'}</span>
                  <span>{s.sessions_total}</span>
                  <span className="top-heroes-wr-value">{s.sessions_completed}</span>
                  <span className="text-muted">
                    {s.next_planned_at ? new Date(s.next_planned_at).toLocaleDateString('ru-RU') : '—'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Учеников пока нет" description="После первой сессии ученики появятся здесь с историей и прогрессом." compact />
          )}
        </div>
      )}

      {tab === 'reviews' && (
        <div className="card dash-card">
          <div className="card-head">
            <div className="card-title">Отзывы учеников</div>
            {avgRating != null && (
              <span className="badge badge-warning">
                {avgRating.toFixed(1)} <IconStar size={12} color="#f6c463" /> · {reviews.length}
              </span>
            )}
          </div>
          {reviews.length > 0 ? (
            <div className="reviews-list">
              {reviews.map((r: any) => (
                <div key={r.id} className="review-row">
                  <span className="coach-portrait coach-portrait--sm"><span>?</span></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="review-rating">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <IconStar key={i} size={14} color={i < (r.rating || 0) ? '#f6c463' : 'rgba(123, 139, 165, 0.30)'} />
                      ))}
                      <span className="text-muted" style={{ fontSize: '0.78rem', marginLeft: 6 }}>
                        Сессия #{r.training_session_id} · {new Date(r.created_at).toLocaleDateString('ru-RU')}
                      </span>
                    </div>
                    {r.comment && <div className="review-comment">{r.comment}</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Отзывов пока нет" description="После каждой завершённой сессии ученик может оставить оценку. Когда первый придёт — попадёт сюда." compact />
          )}
        </div>
      )}

      {/* Hero picker modal */}
      {heroPickerOpen && (
        <div className="modal-backdrop" onClick={() => setHeroPickerOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-head">
              <h3>Пул героев</h3>
              <button type="button" className="modal-close" onClick={() => setHeroPickerOpen(false)}><IconClose size={16} /></button>
            </div>
            <div className="form-group">
              <input
                type="text"
                className="form-input"
                placeholder="Поиск героя…"
                value={heroSearch}
                onChange={(e) => setHeroSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="hero-picker-grid">
              {filteredHeroOptions.map((h: any) => {
                const active = heroes.includes(String(h.hero_id));
                return (
                  <button
                    key={h.hero_id}
                    type="button"
                    className={`hero-picker-cell ${active ? 'active' : ''}`}
                    onClick={() => toggleHero(String(h.hero_id))}
                    disabled={!active && heroes.length >= 12}
                    title={h.localized_name || h.name}
                  >
                    <img src={heroIcon(h.hero_id)} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <span>{h.localized_name || h.name}</span>
                  </button>
                );
              })}
            </div>
            <div className="modal-actions">
              <span className="text-muted" style={{ fontSize: '0.78rem' }}>{heroes.length} / 12 героев</span>
              <button className="btn btn-primary btn-sm" onClick={() => setHeroPickerOpen(false)}>Готово</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
