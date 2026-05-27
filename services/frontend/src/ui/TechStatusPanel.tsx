import { useEffect, useState } from 'react';
import { coreApi } from '../api/client';

interface Props {
  collapsed?: boolean;
  role?: string;
}

function num(v: any) {
  return typeof v === 'number' ? v.toLocaleString('ru-RU') : '—';
}

function needsPublicAccess(steamData: any) {
  if (!steamData?.linked) return false;
  const total = Number(steamData.lifetime_games ?? ((steamData.win || 0) + (steamData.lose || 0)));
  return steamData.source === 'steam_web_api_only' || (total <= 0 && Boolean(steamData.personaname));
}

export default function TechStatusPanel({ collapsed = false, role }: Props) {
  const [steamData, setSteamData] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [parseProgress, setParseProgress] = useState<any>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(() => {
    try { return localStorage.getItem('tech_status_collapsed') === '1'; } catch { return false; }
  });
  const [retrying, setRetrying] = useState(false);
  const isPlayerLike = role === 'PLAYER' || role === 'COACH';

  useEffect(() => {
    if (!isPlayerLike) return;
    let cancelled = false;
    const load = () => {
      coreApi.get('/player/steam-data').then((r) => { if (!cancelled) setSteamData(r.data); }).catch(() => {});
      coreApi.get('/player/sync-status').then((r) => { if (!cancelled) setSyncStatus(r.data); }).catch(() => {});
      coreApi.get('/player/parse-progress').then((r) => { if (!cancelled) setParseProgress(r.data); }).catch(() => {});
    };
    load();
    const id = window.setInterval(load, 60000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [isPlayerLike]);

  useEffect(() => {
    try { localStorage.setItem('tech_status_collapsed', panelCollapsed ? '1' : '0'); } catch {}
  }, [panelCollapsed]);

  if (!isPlayerLike) return null;
  if (collapsed) {
    const hasWork = needsPublicAccess(steamData) || Boolean(parseProgress?.in_progress);
    return <div className={`tech-status-dot ${hasWork ? 'active' : ''}`} title="Матчи" />;
  }

  const retrySync = async () => {
    setRetrying(true);
    try {
      const res = await coreApi.post('/player/sync-steam');
      setSteamData(res.data);
      const progress = await coreApi.get('/player/parse-progress').catch(() => null);
      if (progress?.data) setParseProgress(progress.data);
    } finally {
      setRetrying(false);
    }
  };

  const linked = Boolean(steamData?.linked);
  const publicAccessNeeded = needsPublicAccess(steamData);
  return (
    <section className={`tech-status-panel ${panelCollapsed ? 'collapsed' : ''}`} aria-label="Матчи и загрузка">
      <button type="button" className="tech-status-head" onClick={() => setPanelCollapsed((v) => !v)}>
        <span>Матчи</span>
        <strong>{panelCollapsed ? '+' : '−'}</strong>
      </button>

      {!panelCollapsed && (
        <div className="tech-status-body">
          {!linked ? (
            <div className="tech-status-item warn">
              <strong>Steam не привязан</strong>
              <span>Привяжите аккаунт в настройках, чтобы включить аналитику.</span>
            </div>
          ) : publicAccessNeeded ? (
            <div className="tech-status-item warn">
              <strong>Откройте матчи Dota 2</strong>
              <span>В Dota 2 включите Expose Public Match Data: Настройки → Социальные сети.</span>
              <button className="btn btn-primary btn-sm" disabled={retrying} onClick={retrySync}>
                {retrying ? 'Проверяем…' : 'Я включил'}
              </button>
            </div>
          ) : (
            <div className="tech-status-item ok">
              <strong>Матчи доступны</strong>
              <span>{steamData?.personaname || 'Steam'} · {num(steamData?.matches_loaded)} матчей в базе</span>
            </div>
          )}

          {linked && (
            <div className="tech-status-grid">
              <span>Матчей</span><strong>{num(parseProgress?.matches_loaded ?? steamData?.matches_loaded)}</strong>
              <span>Спарсено</span><strong>{num(parseProgress?.parsed ?? steamData?.parsed_games_n)}</strong>
            </div>
          )}

          {syncStatus?.scheduled && syncStatus?.status && (
            <div className="tech-status-item">
              <strong>{syncStatus.status === 'running' ? 'Догрузка идёт' : 'Синхронизация'}</strong>
              <span>{syncStatus.message || 'Фоновое обновление матчей.'}</span>
            </div>
          )}

        </div>
      )}
    </section>
  );
}

