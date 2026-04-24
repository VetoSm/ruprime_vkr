import { useState } from 'react';
import { coreApi } from '../api/client';

interface Props {
  /** What steam-data endpoint last reported. If null we don't render. */
  steamData: {
    linked?: boolean;
    personaname?: string | null;
    lifetime_games?: number | null;
    win?: number | null;
    lose?: number | null;
    source?: string | null;
    warning?: string | null;
  } | null;
  /** Callback to re-fetch steamData after user hits the retry button. */
  onRefreshed?: (data: any) => void;
  /** Compact variant for small cards; defaults to full banner. */
  compact?: boolean;
}

/**
 * Rendered when a user has successfully linked Steam but OpenDota couldn't
 * pull match history — either because the Dota 2 profile is closed to the
 * public, or because the user just linked and OpenDota is still indexing.
 *
 * The component explains in plain language what is going on and walks the
 * user through the in-game setting they need to flip. Once they come back
 * and press "Я включил", we call /player/sync-steam to retry.
 */
export default function DotaPrivacyBanner({ steamData, onRefreshed, compact = false }: Props) {
  const [retrying, setRetrying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!steamData?.linked) return null;

  const hasMatches = Number(steamData.lifetime_games ?? ((steamData.win || 0) + (steamData.lose || 0))) > 0;
  const isSteamOnly = steamData.source === 'steam_web_api_only';
  const looksClosed = isSteamOnly || (!hasMatches && Boolean(steamData.personaname));
  if (!looksClosed) return null;

  const retry = async () => {
    setRetrying(true); setErr(null); setMsg(null);
    try {
      const res = await coreApi.post('/player/sync-steam');
      const data = res.data || {};
      if ((data.lifetime_games || ((data.win || 0) + (data.lose || 0))) > 0) {
        setMsg('Готово, данные подтянулись. Обновите страницу.');
      } else {
        setMsg('Пока матчей не видно. Проверьте, что в Dota 2 сохранилась галочка «Показывать матчи в открытом доступе», подождите 5–10 минут после смены настройки и попробуйте снова.');
      }
      onRefreshed?.(data);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Не удалось выполнить догрузку. Попробуйте ещё раз через пару минут.');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      className="alert"
      style={{
        background: 'var(--warning-bg)',
        border: '1px solid var(--warning)',
        color: 'var(--text-primary)',
        padding: compact ? 14 : 18,
        borderRadius: 12,
        marginBottom: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div
          style={{
            flexShrink: 0,
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'rgba(255, 165, 2, 0.15)',
            border: '1px solid var(--warning)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.2rem',
            color: 'var(--warning)',
            fontWeight: 700,
          }}
          aria-hidden
        >
          !
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>
            История матчей Dota 2 скрыта
          </div>
          <div className="text-muted" style={{ fontSize: '0.9rem', marginBottom: 10, lineHeight: 1.55 }}>
            {steamData.personaname ? (
              <>
                Steam-аккаунт <strong>{steamData.personaname}</strong> привязан, но Dota 2 не отдаёт матчи.
                Это не ошибка сайта — матчевая статистика показывается нам только если вы включили её в настройках клиента Dota 2.
              </>
            ) : (
              'Steam привязан, но Dota 2 пока не отдаёт матчевую статистику. Включите её в настройках клиента — это единственный способ, разрешённый Valve.'
            )}
          </div>

          <details open={!compact}>
            <summary
              style={{
                cursor: 'pointer',
                color: 'var(--accent-bright)',
                fontSize: '0.88rem',
                fontWeight: 600,
                marginBottom: 8,
                userSelect: 'none',
              }}
            >
              Как открыть данные (≈1 минута в игре)
            </summary>
            <ol
              style={{
                margin: '6px 0 12px 22px',
                padding: 0,
                fontSize: '0.88rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.7,
              }}
            >
              <li>Откройте <strong>Dota 2</strong>.</li>
              <li>В главном меню нажмите на шестерёнку ⚙️ (левый верхний угол) → <strong>Настройки</strong>.</li>
              <li>Вкладка <strong>«Социальные сети»</strong> (или «Options → Social»).</li>
              <li>Включите опцию <strong>«Показывать публично статистику матчей Dota 2»</strong> (англ.: <em>Expose Public Match Data</em>).</li>
              <li>Закройте настройки. Подождите 5–10 минут, чтобы Valve и OpenDota успели обновиться.</li>
              <li>Вернитесь сюда и нажмите кнопку ниже.</li>
            </ol>
          </details>

          {msg && (
            <div
              className="alert alert-success"
              style={{ fontSize: '0.85rem', marginTop: 8 }}
            >
              {msg}
            </div>
          )}
          {err && (
            <div className="alert alert-error" style={{ fontSize: '0.85rem', marginTop: 8 }}>
              {err}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
            <button className="btn btn-primary btn-sm" disabled={retrying} onClick={retry}>
              {retrying ? 'Пробуем…' : 'Я включил, попробовать ещё раз'}
            </button>
            <a
              href="https://dota2.fandom.com/wiki/Matchmaking#Expose_Public_Match_Data"
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline btn-sm"
            >
              Что это за настройка?
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
