import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { coreApi } from '../../api/client';

interface ChatEntry {
  type: 'user' | 'ai';
  text: string;
  contextBasis?: any;
  showWidget?: boolean;
}

function cleanInline(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^>\s?/, '')
    .replace(/\bPOS1\b/gi, 'керри')
    .replace(/\bPOS2\b/gi, 'мид')
    .replace(/\bPOS3\b/gi, 'оффлейн')
    .replace(/\bPOS4\b/gi, 'софт-саппорт')
    .replace(/\bPOS5\b/gi, 'хард-саппорт');
}

function stripAnswerMeta(raw: string) {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^#+\s*(Вопрос|Ваш вопрос|Повтор вопроса)\s*[:\n][\s\S]*?(?=\n#+\s+|$)/i, '')
    .replace(/^#\s+Советы тренера\s*\n+/i, '')
    .replace(/##\s+Резюме[\s\S]*?(?=\n##\s+|$)/i, '')
    .trim();
}

function OracleContextWidget({ basis }: { basis: any }) {
  if (!basis) return null;
  const weak = Array.isArray(basis.weak_categories) ? basis.weak_categories.slice(0, 4) : [];
  return (
    <div className="oracle-answer-widget">
      <div className="oracle-answer-widget-head">
        <strong>Текущий срез</strong>
        <span>{basis.scope || 'выбранные матчи'} · {basis.matches ?? '—'} м</span>
      </div>
      <div className="oracle-answer-widget-kpis">
        <span>WR <strong>{typeof basis.winrate === 'number' ? `${(basis.winrate * 100).toFixed(0)}%` : '—'}</strong></span>
        <span>MMR <strong>{basis.mmr ?? '—'}</strong></span>
        <span>Балл <strong>{typeof basis.overall_score === 'number' ? basis.overall_score.toFixed(1) : (basis.overall_score ?? '—')}</strong></span>
      </div>
      {weak.length > 0 && (
        <div className="oracle-mini-radar">
          {weak.map((c: any) => {
            const score = Math.max(0, Math.min(10, Number(c.score || 0)));
            return (
              <div key={c.key || c.name} className="oracle-mini-radar-row">
                <span>{c.name || c.key}</span>
                <div><i style={{ width: `${score * 10}%` }} /></div>
                <strong>{score.toFixed(1)}</strong>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OracleMessage({ text, contextBasis, showWidget }: { text: string; contextBasis?: any; showWidget?: boolean }) {
  const [body, metaRaw] = text.split(/\n---\n/);
  const lines = stripAnswerMeta(body).split('\n');
  const blocks: JSX.Element[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    const items = listItems;
    listItems = [];
    blocks.push(
      <ul key={`list-${blocks.length}`} style={{ margin: '6px 0 12px', paddingLeft: 18 }}>
        {items.map((item, idx) => (
          <li key={idx} style={{ marginBottom: 4, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            {cleanInline(item)}
          </li>
        ))}
      </ul>
    );
  };

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) {
      flushList();
      return;
    }
    if (line.startsWith('# ')) {
      flushList();
      blocks.push(
        <div key={idx} className="badge badge-purple" style={{ margin: '4px 0 10px', letterSpacing: 0.8, textTransform: 'uppercase' }}>
          {cleanInline(line.replace(/^#\s+/, ''))}
        </div>
      );
      return;
    }
    if (line.startsWith('## ')) {
      flushList();
      blocks.push(
        <h3 key={idx} style={{ margin: '14px 0 8px', fontSize: '1rem', color: 'var(--accent-bright)' }}>
          {cleanInline(line.replace(/^##\s+/, ''))}
        </h3>
      );
      return;
    }
    if (line.startsWith('### ')) {
      flushList();
      blocks.push(
        <div key={idx} style={{ margin: '12px 0 6px', fontWeight: 800, color: 'var(--text-primary)' }}>
          {cleanInline(line.replace(/^###\s+/, ''))}
        </div>
      );
      return;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/) || line.match(/^\d+\.\s+(.*)$/);
    if (bullet) {
      listItems.push(bullet[1]);
      return;
    }
    flushList();
    blocks.push(
      <p key={idx} style={{ margin: '0 0 8px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {cleanInline(line)}
      </p>
    );
  });
  flushList();

  const meta = metaRaw?.split('\n').map((x) => x.trim()).filter(Boolean) || [];

  return (
    <div className="oracle-message">
      {showWidget && <OracleContextWidget basis={contextBasis} />}
      {blocks}
      {meta.length > 0 && (
        <div style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
        }}>
          {meta.map((m, idx) => (
            <span key={idx} className="badge badge-accent" style={{ fontSize: '0.72rem' }}>{m}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PlayerAiChat() {
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [contextBasis, setContextBasis] = useState<any>(null);
  const [showContextRadar, setShowContextRadar] = useState(false);
  const [showBasis, setShowBasis] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    coreApi.get('/ai/history').then((r) => {
      setHistory(r.data);
      // Load last messages
      const loaded: ChatEntry[] = [];
      r.data.slice(0, 10).reverse().forEach((h: any) => {
        if (h.message) loaded.push({ type: 'user', text: h.message });
        if (h.advice_summary) loaded.push({ type: 'ai', text: h.advice_full || h.advice_summary });
      });
      setMessages(loaded);
    }).catch(() => {});
  }, []);

  const send = async (preset?: string) => {
    const userMsg = preset || input;
    if (!userMsg.trim()) return;
    setMessages((prev) => [...prev, { type: 'user', text: userMsg }]);
    setInput('');
    setLoading(true);

    try {
      const res = await coreApi.post('/ai/chat', { message: userMsg, context_mode: 'AUTO' });
      const meta: string[] = [];
      if (typeof res.data.requests_remaining_today === 'number') {
        meta.push(`Осталось запросов сегодня: ${res.data.requests_remaining_today}/${res.data.requests_limit_daily}`);
      }
      if (res.data.llm_status && res.data.llm_status !== 'generated') {
        const statusText: Record<string, string> = {
          fallback: 'Модель не ответила, показан локальный fallback',
          refused: 'Вопрос вне игровой темы',
          unavailable: 'LLM-сервис недоступен',
          rate_limited: 'Дневной лимит исчерпан',
        };
        meta.push(statusText[res.data.llm_status] || `Статус LLM: ${res.data.llm_status}`);
      }
      if (res.data.llm_error && res.data.llm_status !== 'generated') {
        meta.push(`Причина: ${res.data.llm_error}`);
      }
      setContextBasis(res.data.context_basis || null);
      setShowContextRadar(Boolean(res.data.show_context_radar));
      const metaText = meta.length ? `\n\n---\n${meta.join('\n')}` : '';
      setMessages((prev) => [...prev, {
        type: 'ai',
        text: `${res.data.advice_full || res.data.advice_summary || 'Нет ответа'}${metaText}`,
        contextBasis: res.data.context_basis || null,
        showWidget: Boolean(res.data.show_context_radar),
      }]);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setMessages((prev) => [...prev, { type: 'ai', text: detail || 'Оракул временно недоступен.' }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (searchParams.get('auto') !== 'gaps' || loading || messages.length > 0) return;
    const prompt = 'Разбери мои главные разрывы по фитчам: собери недостающие проценты до целевых показателей и дай план, что улучшать в ближайших 10 ranked-матчах.';
    send(prompt);
    const next = new URLSearchParams(searchParams);
    next.delete('auto');
    setSearchParams(next, { replace: true });
  }, [searchParams, loading, messages.length]);

  const clearChat = async () => {
    await coreApi.delete('/ai/history').catch(() => {});
    setMessages([]);
    setHistory([]);
    setContextBasis(null);
    setShowContextRadar(false);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Оракул Древних</h1>
        <p>Разбор по вашим матчам, роли и слабым зонам. Отвечает только по Dota 2.</p>
      </div>

      <div className="card" style={{ minHeight: 500, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
          <div
            aria-hidden="true"
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              border: '1px solid var(--border-color)',
              background: 'var(--purple-bg)',
              color: 'var(--accent-bright)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              letterSpacing: 1,
            }}
          >
            О
          </div>
          <div>
            <div style={{ fontWeight: 800 }}>Оракул Древних</div>
            <div className="text-muted" style={{ fontSize: '0.82rem' }}>
              Смотрит последние ranked-матчи, игровые признаки и baseline по вашей позиции.
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-outline btn-sm" onClick={clearChat}>Очистить чат</button>
            <Link to="/dashboard" className="btn btn-outline btn-sm">К дашборду</Link>
          </div>
        </div>
        {contextBasis && showContextRadar && (
          <div className="card mb-20" style={{ padding: 12, borderStyle: 'dashed' }}>
            <div className="flex-between" style={{ gap: 10, flexWrap: 'wrap' }}>
              <div>
                <strong>Текущий срез игрока</strong>
                <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                  Показывается один раз в начале диалога: выборка, матчей и слабые категории.
                </div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => setShowBasis((v) => !v)}>
                {showBasis ? 'Свернуть' : 'Развернуть'}
              </button>
            </div>
            {showBasis && (
              <div style={{ marginTop: 10, fontSize: '0.86rem' }}>
                <div className="text-muted">Выборка: {contextBasis.scope || '—'} · Матчей: {contextBasis.matches ?? '—'} · Общий балл: {contextBasis.overall_score ?? '—'}</div>
                {contextBasis.top_gaps?.length > 0 && (
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                    {contextBasis.top_gaps.slice(0, 5).map((g: any, idx: number) => (
                      <li key={idx}>{g.component}: {g.player_value} → {g.target_value}</li>
                    ))}
                  </ul>
                )}
                {contextBasis.weak_categories?.length > 0 && (
                  <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                    {contextBasis.weak_categories.slice(0, 4).map((c: any) => {
                      const pct = Math.max(0, Math.min(100, Number(c.score || 0) * 10));
                      return (
                        <div key={c.key || c.name} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 42px', gap: 8, alignItems: 'center' }}>
                          <span className="text-muted">{c.name || c.key}</span>
                          <span style={{ height: 6, borderRadius: 999, background: 'rgba(22, 233, 212, 0.10)', overflow: 'hidden' }}>
                            <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #f6c463, #ff4757)' }} />
                          </span>
                          <strong>{Number(c.score || 0).toFixed(1)}</strong>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <div className="chat-container" style={{ flex: 1 }}>
          {messages.length === 0 && (
            <div className="text-center text-muted oracle-empty-state">
              <p>Выберите быстрый разбор или задайте вопрос по конкретной роли, герою или таймингу.</p>
              <div className="oracle-preset-row">
                <button className="btn btn-outline btn-sm" onClick={() => send('Назови главную ошибку моего текущего ranked-среза и как её исправить за 10 игр.')}>
                  Главная ошибка
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => send('Почему просел вижн и какие тайминги вардов мне тренировать?')}>
                  Vision-тайминги
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => send('Составь короткий план тренировки на неделю по моим слабым зонам.')}>
                  План недели
                </button>
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`chat-message ${msg.type}`}>
              {msg.type === 'ai' ? (
                <OracleMessage text={msg.text} contextBasis={msg.contextBasis} showWidget={msg.showWidget} />
              ) : (
                <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{msg.text}</div>
              )}
            </div>
          ))}
          {loading && (
            <div className="chat-message ai">
              <span className="text-muted">Готовлю ответ по вашему текущему срезу...</span>
            </div>
          )}
        </div>

        <div className="flex gap-10 mt-20">
          <input
            className="form-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Спросите Оракула по Dota 2..."
            disabled={loading}
          />
          <button className="btn btn-primary" onClick={() => send()} disabled={loading}>
            Получить разбор
          </button>
        </div>
      </div>
    </div>
  );
}
