import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { coreApi } from '../../api/client';
import { RankBadge } from '../../ui/GameComponents';
import { EmptyState } from '../../ui/Primitives';
import { CoachAvatar } from '../../ui/Avatar';
import { Dropdown } from '../../ui/Dropdown';
import { loadHeroes, heroIcon, heroName, roleName } from '../../api/heroes';
import { IconSearch, IconChevronRight, IconClose, IconStar } from '../../ui/Icons';

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: '',     label: 'Все роли' },
  { value: 'POS1', label: 'Carry' },
  { value: 'POS2', label: 'Mid' },
  { value: 'POS3', label: 'Offlane' },
  { value: 'POS4', label: 'Soft Support' },
  { value: 'POS5', label: 'Hard Support' },
];
const RANK_OPTIONS = ['', 'LEGEND', 'ANCIENT', 'DIVINE', 'IMMORTAL'];
const PRICE_OPTIONS: { value: string; label: string }[] = [
  { value: '',     label: 'Цена: любая' },
  { value: '1000', label: 'до 1 000 ₽' },
  { value: '2000', label: 'до 2 000 ₽' },
  { value: '3000', label: 'до 3 000 ₽' },
  { value: '5000', label: 'до 5 000 ₽' },
];
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'rating', label: 'По рейтингу' },
  { value: 'price-asc',  label: 'Дешевле' },
  { value: 'price-desc', label: 'Дороже' },
  { value: 'mmr',  label: 'По MMR тренера' },
];
const PER_PAGE = 6;

/* Placeholder-слоты — пока нет API. 3 ближайших окна, общие на всех тренеров. */
const PLACEHOLDER_SLOTS = (() => {
  const slots: { id: string; label: string; iso: string }[] = [];
  const now = new Date();
  for (const offsetH of [3, 24, 26, 48, 50]) {
    const t = new Date(now.getTime() + offsetH * 3600 * 1000);
    // округлим до часа
    t.setMinutes(0, 0, 0);
    const dayLabel = t.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', weekday: 'short' });
    const timeLabel = t.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    slots.push({ id: t.toISOString(), label: `${dayLabel}, ${timeLabel}`, iso: t.toISOString() });
  }
  return slots;
})();

function coachName(c: any): string {
  if (c.about) {
    const first = c.about.split('\n')[0].trim();
    if (first.length > 0 && first.length < 30) return first;
  }
  return `Тренер #${c.id}`;
}

/* Стилизованные инициалы для аватара (когда нет картинки). */
function coachInitials(name: string): string {
  const parts = name.replace(/[#_\-.]/g, ' ').trim().split(/\s+/);
  const a = parts[0]?.[0] || '?';
  const b = parts[1]?.[0] || '';
  return (a + b).toUpperCase();
}

function coachStats(c: any): { rating: number | null; reviews: number; sessions: number; studentsWr: number | null; descriptor: string } {
  const sessions = typeof c.sessions_completed === 'number' ? c.sessions_completed : 0;
  const reviews = typeof c.reviews_count === 'number' ? c.reviews_count : 0;
  const rating = typeof c.avg_rating === 'number' && c.avg_rating > 0
    ? Number(c.avg_rating.toFixed(1))
    : null;
  const studentsWr = typeof c.students_winrate_delta_pct === 'number'
    ? Number(c.students_winrate_delta_pct.toFixed(1))
    : null;
  // Короткое описание из `about` тренера: первая строка либо две первых
  // фразы. Обрезаем длинные эссе, чтобы не ломать раскладку.
  let descriptor = '';
  if (typeof c.about === 'string' && c.about.trim()) {
    const flat = c.about.replace(/\s+/g, ' ').trim();
    descriptor = flat.length > 110 ? `${flat.slice(0, 108).trim()}…` : flat;
  }
  return { rating, reviews, sessions, studentsWr, descriptor };
}

export default function PlayerCoaches() {
  const [coaches, setCoaches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [steamLinked, setSteamLinked] = useState<boolean | null>(null);

  // Фильтры
  const [search, setSearch] = useState('');
  const [filterRank, setFilterRank] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterMaxRate, setFilterMaxRate] = useState('');
  const [sortBy, setSortBy] = useState('rating');
  const [page, setPage] = useState(1);

  // Apply-modal
  const [applyCoach, setApplyCoach] = useState<any | null>(null);
  const [applyRole, setApplyRole] = useState('');
  const [applyMessage, setApplyMessage] = useState('');
  const [applySlot, setApplySlot] = useState<string | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyResultMsg, setApplyResultMsg] = useState<string | null>(null);
  const [applyResultErr, setApplyResultErr] = useState<string | null>(null);

  useEffect(() => {
    loadHeroes();
    coreApi.get('/coaches')
      .then((r) => setCoaches(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
    coreApi.get('/player/steam-data')
      .then((r) => setSteamLinked(Boolean(r.data?.linked)))
      .catch(() => setSteamLinked(false));
  }, []);

  const filteredAndSorted = useMemo(() => {
    let list = coaches.slice();

    // Поиск по нику тренера или героям
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) => {
        const name = coachName(c).toLowerCase();
        if (name.includes(q)) return true;
        const heroes = (c.hero_pool && c.hero_pool.length > 0) ? c.hero_pool : (c.auto_hero_pool || []);
        return heroes.some((h: any) => {
          const num = Number(h);
          return Number.isFinite(num) && heroName(num).toLowerCase().includes(q);
        });
      });
    }

    if (filterRank) {
      list = list.filter((c) => {
        const rt = (c.rank_tier || c.auto_rank_tier || '').toUpperCase();
        return rt.includes(filterRank);
      });
    }

    if (filterRole) {
      list = list.filter((c) => {
        const roles = (c.main_roles?.length ? c.main_roles : c.auto_main_roles) || [];
        return roles.includes(filterRole);
      });
    }

    if (filterMaxRate) {
      const lim = Number(filterMaxRate);
      list = list.filter((c) => !c.hourly_rate || c.hourly_rate <= lim);
    }

    // Сортировка
    list.sort((a, b) => {
      if (sortBy === 'price-asc') return (a.hourly_rate || 999999) - (b.hourly_rate || 999999);
      if (sortBy === 'price-desc') return (b.hourly_rate || 0) - (a.hourly_rate || 0);
      if (sortBy === 'mmr') return ((b.mmr_estimate || b.auto_mmr_estimate || 0) - (a.mmr_estimate || a.auto_mmr_estimate || 0));
      const ra = (coachStats(a).rating ?? 0) + (a.is_verified ? 0.1 : 0);
      const rb = (coachStats(b).rating ?? 0) + (b.is_verified ? 0.1 : 0);
      return rb - ra;
    });

    return list;
  }, [coaches, search, filterRank, filterRole, filterMaxRate, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / PER_PAGE));
  const pagedCoaches = filteredAndSorted.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  useEffect(() => { setPage(1); }, [search, filterRank, filterRole, filterMaxRate, sortBy]);

  const openApply = (coach: any) => {
    setApplyCoach(coach);
    setApplyRole('');
    setApplyMessage('');
    setApplySlot(null);
    setApplyResultMsg(null);
    setApplyResultErr(null);
  };

  const submitApply = async () => {
    if (!applyCoach) return;
    setApplyLoading(true);
    setApplyResultMsg(null); setApplyResultErr(null);
    try {
      await coreApi.post('/matchmaking/requests', {
        preferred_coach_profile_id: applyCoach.id,
        desired_role: applyRole || undefined,
        message: applyMessage
          ? `${applyMessage}${applySlot ? `\n\nПредпочитаемый слот: ${PLACEHOLDER_SLOTS.find(s => s.id === applySlot)?.label}` : ''}`
          : (applySlot ? `Предпочитаемый слот: ${PLACEHOLDER_SLOTS.find(s => s.id === applySlot)?.label}` : undefined),
        use_ai_coach: false,
      });
      setApplyResultMsg('Заявка отправлена. После подтверждения тренером — вы сможете связаться.');
    } catch (e: any) {
      setApplyResultErr(e?.response?.data?.detail || 'Не удалось отправить заявку');
    } finally {
      setApplyLoading(false);
    }
  };

  return (
    <div>
      {/* ============ Header ============ */}
      <div className="stats-header">
        <div className="stats-header-title">
          <h1>Тренеры</h1>
          <p>Найди ментора под свою цель и стиль игры</p>
        </div>
      </div>

      {steamLinked === false && (
        <div className="alert mb-20" style={{
          background: 'var(--warning-bg, rgba(255, 165, 2, 0.08))',
          border: '1px solid var(--warning, rgba(255, 165, 2, 0.4))',
          color: 'var(--text-primary)',
          fontSize: '0.9rem',
        }}>
          Steam не привязан — мы не сможем подобрать тренера под ваши слабые стороны.{' '}
          <Link to="/settings">Привяжите аккаунт</Link>.
        </div>
      )}

      {/* ============ Filter bar ============ */}
      <div className="coaches-filterbar">
        <div className="coaches-search">
          <IconSearch size={16} />
          <input
            type="text"
            placeholder="Поиск по нику / герою"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Dropdown
          value={filterRank}
          onChange={setFilterRank}
          options={[
            { value: '', label: 'Любой' },
            ...RANK_OPTIONS.filter(Boolean).map(r => ({ value: r, label: r })),
          ]}
          label="Ранг"
        />
        <Dropdown
          value={filterRole}
          onChange={setFilterRole}
          options={ROLE_OPTIONS.map(r => ({ value: r.value, label: r.label }))}
          label="Роль"
        />
        <Dropdown
          value={filterMaxRate}
          onChange={setFilterMaxRate}
          options={PRICE_OPTIONS.map(p => ({ value: p.value, label: p.label }))}
          label="Цена"
        />
        <Dropdown
          value={sortBy}
          onChange={setSortBy}
          options={SORT_OPTIONS.map(s => ({ value: s.value, label: s.label }))}
          label="Сортировка"
          align="right"
        />
      </div>

      {/* ============ Coach cards grid ============ */}
      {loading ? (
        <div className="card dash-card"><p className="text-muted text-center" style={{ padding: 30 }}>Загружаем тренерский штаб…</p></div>
      ) : pagedCoaches.length === 0 ? (
        <EmptyState
          title="По фильтру никого нет"
          description="Попробуйте сбросить часть фильтров — расширьте диапазон по рангу, роли или цене."
          cta={<button className="btn btn-outline btn-sm" onClick={() => {
            setSearch(''); setFilterRank(''); setFilterRole(''); setFilterMaxRate(''); setSortBy('rating');
          }}>Сбросить фильтры</button>}
        />
      ) : (
        <div className="coaches-grid">
          {pagedCoaches.map((c) => {
            const name = coachName(c);
            const roles = (c.main_roles?.length ? c.main_roles : c.auto_main_roles) || [];
            const heroes = (c.hero_pool?.length ? c.hero_pool : c.auto_hero_pool) || [];
            const rank = c.rank_tier || c.auto_rank_tier;
            const stats = coachStats(c);
            const wrDeltaText = stats.studentsWr == null
              ? '—'
              : stats.studentsWr > 0
              ? `+${stats.studentsWr.toFixed(1)}%`
              : (stats.studentsWr < 0 ? `${stats.studentsWr.toFixed(1)}%` : '—');
            return (
              <div key={c.id} className="coach-card">
                <div className="coach-card-head">
                  <div className="coach-portrait coach-portrait--avatar">
                    {/* Если у тренера привязан Steam — подтягиваем real avatar
                        через /ml/player-account/{id}; иначе показываем
                        инициалы (CoachAvatar умеет в фолбэк сам). */}
                    <CoachAvatar
                      coachProfileId={c.id}
                      dotaAccountId={c.dota_account_id}
                      fallbackName={coachInitials(name)}
                      size={64}
                    />
                    {c.is_verified && <span className="coach-online-dot" title="Подтверждён" />}
                  </div>
                  <div className="coach-card-title">
                    <div className="coach-card-name-row">
                      <h3 className="coach-name">{name}</h3>
                      {stats.rating != null && stats.rating >= 4.85 && stats.reviews >= 10 && <span className="coach-badge-top">Топ-1%</span>}
                    </div>
                    {rank && (
                      <div className="coach-rank">
                        {/* RankBadge уже рисует медаль + название —
                            второй текстовый ярлык был дублем (видно
                            «Divine [5] · Divine»). Оставляем только
                            бэйдж. */}
                        <RankBadge rankName={rank} size="sm" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Описание тренера (первая строка `about`). Раньше карточка
                    показывала только ник + ранг, а реальное описание было
                    спрятано в форме apply. Здесь — короткое summary, чтобы
                    на этапе выбора уже было ясно, чем тренер занимается. */}
                {stats.descriptor && (
                  <p className="coach-description" title={c.about}>{stats.descriptor}</p>
                )}

                {/* Сигнатурные герои */}
                <div className="coach-heroes-row">
                  {heroes.slice(0, 3).map((raw: any, i: number) => {
                    const num = Number(raw);
                    return (
                      <span key={`${c.id}-${raw}-${i}`} className="coach-hero-disc" title={Number.isFinite(num) ? heroName(num) : String(raw)}>
                        {Number.isFinite(num)
                          ? <img src={heroIcon(num)} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          : <span>{String(raw).slice(0, 2)}</span>}
                      </span>
                    );
                  })}
                  {heroes.length === 0 && <span className="text-muted" style={{ fontSize: '0.78rem' }}>пул не указан</span>}
                </div>

                <div className="coach-stats-inline">
                  <div className="coach-stat">
                    <span className="coach-stat-label">Сессий</span>
                    <span className="coach-stat-value">{stats.sessions || '—'}</span>
                  </div>
                  <div className="coach-stat" title={stats.reviews > 0 ? `${stats.reviews} отзывов` : 'Отзывов пока нет'}>
                    <span className="coach-stat-label">Рейтинг</span>
                    <span className="coach-stat-value">
                      {stats.rating != null ? (
                        <>{stats.rating} <IconStar size={12} color="#f6c463" /></>
                      ) : 'Новый'}
                    </span>
                  </div>
                  <div className="coach-stat" title="Средний прирост WR учеников после тренировок">
                    <span className="coach-stat-label">Прирост WR</span>
                    <span
                      className="coach-stat-value"
                      style={{ color: stats.studentsWr == null ? 'var(--text-muted)' : (stats.studentsWr >= 0 ? 'var(--accent)' : 'var(--danger)') }}
                    >
                      {wrDeltaText}
                    </span>
                  </div>
                </div>

                {/* Сильные роли как теги */}
                <div className="coach-tags">
                  {roles.slice(0, 3).map((r: string) => (
                    <span key={r} className="coach-tag">{roleName(r.replace('POS', ''))}</span>
                  ))}
                  {roles.length === 0 && <span className="coach-tag coach-tag-muted">мульти-роль</span>}
                </div>

                {/* Цена + CTA */}
                <div className="coach-card-foot">
                  <div className="coach-price">
                    {c.hourly_rate
                      ? <>от <strong>{c.hourly_rate.toLocaleString('ru-RU')} ₽</strong>/час</>
                      : <span className="text-muted">цена договорная</span>
                    }
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => openApply(c)}>
                    Записаться
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============ Pagination ============ */}
      {totalPages > 1 && (
        <div className="coaches-pagination">
          <button
            type="button"
            className="coaches-pagi-btn"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            aria-label="Назад"
          >‹</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
            .map((p, idx, arr) => (
              <span key={p}>
                {idx > 0 && arr[idx - 1] !== p - 1 && <span className="coaches-pagi-dots">…</span>}
                <button
                  type="button"
                  className={`coaches-pagi-btn ${p === page ? 'active' : ''}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              </span>
            ))}
          <button
            type="button"
            className="coaches-pagi-btn"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            aria-label="Вперёд"
          >›</button>
        </div>
      )}

      {/* ============ Apply Modal ============ */}
      {applyCoach && (
        <div className="modal-backdrop" onClick={() => !applyLoading && setApplyCoach(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Заявка тренеру</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => !applyLoading && setApplyCoach(null)}
                aria-label="Закрыть"
              >
                <IconClose size={16} />
              </button>
            </div>

            <div className="modal-coach-row">
              <span className="coach-portrait coach-portrait--sm">
                <span>{coachInitials(coachName(applyCoach))}</span>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="coach-name">{coachName(applyCoach)}</div>
                <div className="text-muted" style={{ fontSize: '0.82rem' }}>
                  {applyCoach.hourly_rate
                    ? `${applyCoach.hourly_rate.toLocaleString('ru-RU')} ₽/час`
                    : 'Цена договорная'}
                  {' · '}
                  {coachStats(applyCoach).rating != null ? `Рейтинг ${coachStats(applyCoach).rating}` : 'Рейтинг появится после отзывов'}
                </div>
              </div>
            </div>

            {applyResultMsg && (
              <div className="alert alert-success" style={{ marginTop: 14 }}>
                <strong>Готово.</strong> {applyResultMsg}
              </div>
            )}
            {applyResultErr && <div className="alert alert-error" style={{ marginTop: 14 }}>{applyResultErr}</div>}

            {!applyResultMsg && (
              <>
                {/* Slot picker (placeholder — пока нет API слотов) */}
                <div className="form-group" style={{ marginTop: 14 }}>
                  <label>Желаемый слот <span className="text-muted" style={{ fontWeight: 400 }}>(будет уточнён с тренером)</span></label>
                  <div className="slot-picker">
                    {PLACEHOLDER_SLOTS.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`slot-pill ${applySlot === s.id ? 'active' : ''}`}
                        onClick={() => setApplySlot(applySlot === s.id ? null : s.id)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>Позиция для разбора</label>
                  <Dropdown
                    value={applyRole}
                    onChange={setApplyRole}
                    options={ROLE_OPTIONS.map((r) => ({
                      value: r.value,
                      label: r.value ? r.label : 'Не указывать',
                    }))}
                  />
                </div>

                <div className="form-group">
                  <label>Сообщение тренеру</label>
                  <textarea
                    className="form-input"
                    value={applyMessage}
                    onChange={(e) => setApplyMessage(e.target.value)}
                    rows={3}
                    placeholder="Коротко: что хочется подтянуть, какой график, какие ожидания от разбора."
                  />
                </div>

                <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: 4 }}>
                  Контакты тренера (Telegram) будут доступны после того, как тренер подтвердит заявку.
                </div>
              </>
            )}

            <div className="modal-actions">
              {applyResultMsg ? (
                <>
                  <Link to="/requests" className="btn btn-outline btn-sm">Мои заявки</Link>
                  <button className="btn btn-primary btn-sm" onClick={() => setApplyCoach(null)}>
                    Закрыть <IconChevronRight size={14} />
                  </button>
                </>
              ) : (
                <>
                  <button className="btn btn-outline btn-sm" disabled={applyLoading} onClick={() => setApplyCoach(null)}>
                    Отмена
                  </button>
                  <button className="btn btn-primary btn-sm" disabled={applyLoading} onClick={submitApply}>
                    {applyLoading ? 'Отправляем…' : 'Отправить заявку'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
