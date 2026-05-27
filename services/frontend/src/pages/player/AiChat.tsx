import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { coreApi } from '../../api/client';

const ORACLE_AVATAR = '/decor/oracle-avatar.png';

interface ChatEntry {
  type: 'user' | 'ai';
  text: string;
  contextBasis?: any;
  showWidget?: boolean;
}

interface ChatThread {
  id: string;
  title: string;
  createdAt?: string;
  messages: ChatEntry[];
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
    .replace(/##\s+Тренировочный контекст[\s\S]*?(?=\n##\s+|$)/i, '')
    .replace(/##\s+Общие советы[\s\S]*?(?=\n##\s+|$)/i, '')
    .trim();
}

function OracleContextWidget({ basis }: { basis: any }) {
  if (!basis) return null;
  const weak = Array.isArray(basis.weak_categories) ? basis.weak_categories.slice(0, 4) : [];
  const radarCats = weak.length ? weak : (Array.isArray(basis.top_gaps) ? basis.top_gaps.slice(0, 4) : []);
  const radarSize = 132;
  const center = radarSize / 2;
  const radius = 48;
  const points = radarCats.map((c: any, idx: number) => {
    const score = Math.max(0, Math.min(10, Number(c.score ?? c.player_score ?? 0)));
    const angle = (-90 + (idx * 360) / Math.max(radarCats.length, 1)) * Math.PI / 180;
    const r = radius * (score / 10);
    return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
  }).join(' ');
  const gridPoints = radarCats.map((_c: any, idx: number) => {
    const angle = (-90 + (idx * 360) / Math.max(radarCats.length, 1)) * Math.PI / 180;
    return `${center + Math.cos(angle) * radius},${center + Math.sin(angle) * radius}`;
  }).join(' ');
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
      {radarCats.length > 0 && (
        <div className="oracle-radar-wrap">
          <svg className="oracle-radar-svg" viewBox={`0 0 ${radarSize} ${radarSize}`} aria-hidden>
            <polygon points={gridPoints} fill="rgba(22,233,212,0.04)" stroke="rgba(22,233,212,0.22)" strokeWidth="1" />
            <circle cx={center} cy={center} r={radius * 0.5} fill="none" stroke="rgba(160,177,200,0.18)" />
            <circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(160,177,200,0.22)" />
            <polygon points={points} fill="rgba(22,233,212,0.22)" stroke="#16e9d4" strokeWidth="3" />
          </svg>
          <div className="oracle-mini-radar">
          {radarCats.map((c: any) => {
            const score = Math.max(0, Math.min(10, Number(c.score ?? c.player_score ?? 0)));
            return (
              <div key={c.key || c.name} className="oracle-mini-radar-row">
                <span>{c.name || c.category || c.key}</span>
                <div><i style={{ width: `${score * 10}%` }} /></div>
                <strong>{score.toFixed(1)}</strong>
              </div>
            );
          })}
          </div>
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

  const meta = metaRaw?.split('\n')
    .map((x) => x.trim())
    .filter((x) => Boolean(x) && !/^Причина:\s*AI_CHAT_DAILY_LIMIT/i.test(x))
    || [];

  return (
    <div className="oracle-message">
      <div className="oracle-message-head">
        <img src={ORACLE_AVATAR} alt="" className="oracle-message-avatar" />
        <div>
          <strong>Оракул</strong>
          <span>разбор по текущему срезу</span>
        </div>
      </div>
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

function UpgradePlans({ onPay, loading }: { onPay: () => void; loading: boolean }) {
  return (
    <div className="oracle-upgrade-plans">
      <div className="subscription-plan-card">
        <div className="subscription-plan-head">
          <span className="badge badge-muted">Free</span>
          <strong>0 ₽</strong>
        </div>
        <h3>Базовый доступ</h3>
        <ul>
          <li>Аналитика по матчам</li>
          <li>1 запрос к Оракулу в день</li>
          <li>Поиск тренеров</li>
        </ul>
      </div>
      <div className="subscription-plan-card subscription-plan-card--pro">
        <div className="subscription-plan-head">
          <span className="badge badge-accent">Pro</span>
          <strong>499 ₽</strong>
        </div>
        <h3>На 30 дней</h3>
        <ul>
          <li>Безлимитный Оракул</li>
          <li>Полная история подробных разборов</li>
          <li>Больше контекста по ролям и героям</li>
        </ul>
        <button className="btn btn-primary btn-sm" onClick={onPay} disabled={loading}>
          {loading ? 'Создаём платёж...' : 'Оплатить'}
        </button>
      </div>
    </div>
  );
}

export default function PlayerAiChat() {
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [limitReached, setLimitReached] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentMsg, setPaymentMsg] = useState('');
  const [paymentErr, setPaymentErr] = useState('');

  const makeChatId = () => `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const titleFromMessage = (text: string) => {
    const clean = text.trim().replace(/\s+/g, ' ');
    return clean ? `${clean.slice(0, 42)}${clean.length > 42 ? '…' : ''}` : 'Новый чат';
  };

  const loadHistory = () => {
    coreApi.get('/ai/history').then((r) => {
      const rows = Array.isArray(r.data) ? r.data : [];
      const byId = new Map<string, ChatThread>();
      rows.slice().reverse().forEach((h: any) => {
        const id = h.conversation_id || `legacy_${h.id}`;
        if (!byId.has(id)) {
          byId.set(id, {
            id,
            title: h.conversation_title || titleFromMessage(h.message || 'Старый чат'),
            createdAt: h.created_at,
            messages: [],
          });
        }
        const thread = byId.get(id)!;
        if (h.message) thread.messages.push({ type: 'user', text: h.message });
        if (h.advice_summary) thread.messages.push({
          type: 'ai',
          text: h.advice_full || h.advice_summary,
          contextBasis: h.context_basis || null,
          showWidget: Boolean(h.show_context_radar && h.context_basis),
        });
        thread.createdAt = h.created_at || thread.createdAt;
      });
      const list = Array.from(byId.values()).reverse();
      setThreads(list);
      if (list.length > 0 && !activeThreadId) {
        setActiveThreadId(list[0].id);
        setMessages(list[0].messages);
      }
    }).catch(() => {});
  };

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    if (searchParams.get('payment') !== 'return' || !searchParams.get('payment_id')) return;
    const paymentId = Number(searchParams.get('payment_id'));
    const next = new URLSearchParams(searchParams);
    next.delete('payment');
    next.delete('payment_id');
    setSearchParams(next, { replace: true });
    if (!paymentId) return;
    coreApi.post('/billing/yookassa/confirm', { payment_id: paymentId })
      .then((r) => {
        setPaymentMsg(r.data.message || 'Оплата прошла успешно.');
        setLimitReached(false);
        loadHistory();
      })
      .catch((err) => setPaymentErr(err?.response?.data?.detail || 'Не удалось подтвердить оплату.'));
  }, [searchParams, setSearchParams]);

  const requestPayment = async () => {
    setPaymentMsg('');
    setPaymentErr('');
    setPaymentLoading(true);
    try {
      const res = await coreApi.post('/billing/yookassa/create-payment', { return_path: '/ai-chat' });
      window.location.href = res.data.confirmation_url;
    } catch (err: any) {
      setPaymentErr(err?.response?.data?.detail || 'Не удалось создать платёж ЮKassa.');
    } finally {
      setPaymentLoading(false);
    }
  };

  const startNewChat = () => {
    const id = makeChatId();
    setActiveThreadId(id);
    setMessages([]);
  };

  const openThread = (thread: ChatThread) => {
    setActiveThreadId(thread.id);
    setMessages(thread.messages);
  };

  const isLimitMessage = (msg: ChatEntry) => (
    msg.type === 'ai' &&
    /запрос[ыа] на сегодня закончились|безлимитный доступ к Оракулу|AI_CHAT_DAILY_LIMIT/i.test(msg.text)
  );

  const send = async (preset?: string) => {
    const userMsg = preset || input;
    if (!userMsg.trim()) return;
    const conversationId = activeThreadId || makeChatId();
    if (!activeThreadId) setActiveThreadId(conversationId);
    setMessages((prev) => [...prev, { type: 'user', text: userMsg }]);
    setInput('');
    setLoading(true);

    try {
      const res = await coreApi.post('/ai/chat', { message: userMsg, context_mode: 'AUTO', conversation_id: conversationId });
      const meta: string[] = [];
      const rateLimited = res.data.llm_status === 'rate_limited' || res.data.upgrade_required;
      if (!rateLimited && typeof res.data.requests_remaining_today === 'number') {
        meta.push(`Осталось запросов сегодня: ${res.data.requests_remaining_today}/${res.data.requests_limit_daily}`);
      }
      if (res.data.llm_status && res.data.llm_status !== 'generated') {
        const statusText: Record<string, string> = {
          fallback: 'Модель не ответила, показан локальный fallback',
          refused: 'Вопрос вне игровой темы',
          unavailable: 'LLM-сервис недоступен',
          rate_limited: 'Дневной лимит исчерпан',
        };
        if (rateLimited) {
          setLimitReached(true);
        } else {
          meta.push(statusText[res.data.llm_status] || `Статус LLM: ${res.data.llm_status}`);
        }
      }
      if (!rateLimited && res.data.llm_error && res.data.llm_status !== 'generated') {
        meta.push(`Причина: ${res.data.llm_error}`);
      }
      const metaText = meta.length ? `\n\n---\n${meta.join('\n')}` : '';
      const aiMessage: ChatEntry = {
        type: 'ai',
        text: rateLimited
          ? 'К сожалению, запросы на сегодня закончились. Вы можете купить безлимитный доступ к Оракулу ниже.'
          : `${res.data.advice_full || res.data.advice_summary || 'Нет ответа'}${metaText}`,
        contextBasis: res.data.context_basis || null,
        showWidget: !rateLimited && Boolean(res.data.show_context_radar && res.data.context_basis),
      };
      setMessages((prev) => {
        const next = [...prev, aiMessage];
        setThreads((old) => {
          const existing = old.find((t) => t.id === conversationId);
          const updated: ChatThread = {
            id: conversationId,
            title: existing?.title || titleFromMessage(userMsg),
            createdAt: new Date().toISOString(),
            messages: next,
          };
          return [updated, ...old.filter((t) => t.id !== conversationId)];
        });
        return next;
      });
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
    setThreads([]);
    setActiveThreadId(null);
  };

  return (
    <div className="oracle-page">
      {paymentMsg && <div className="alert alert-success" style={{ marginBottom: 14 }}>{paymentMsg}</div>}
      {paymentErr && <div className="alert alert-error" style={{ marginBottom: 14 }}>{paymentErr}</div>}

      <div className="card oracle-card">
        <div className="oracle-card-head">
          <img src={ORACLE_AVATAR} alt="" className="oracle-message-avatar oracle-message-avatar--lg" />
          <div>
            <div style={{ fontWeight: 800 }}>Оракул Древних</div>
            <div className="text-muted" style={{ fontSize: '0.82rem' }}>
              Смотрит последние ranked-матчи, игровые признаки и baseline по вашей позиции.
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={startNewChat}>Новый чат</button>
            <button className="btn btn-outline btn-sm" onClick={clearChat}>Очистить историю</button>
            <Link to="/dashboard" className="btn btn-outline btn-sm">К дашборду</Link>
          </div>
        </div>
        <div className="oracle-chat-layout">
        <aside className="oracle-chat-sidebar">
          <div className="oracle-chat-sidebar-title">Старые чаты</div>
          <div className="oracle-free-note">
            Бесплатно доступен 1 запрос в день. Полная история и безлимитный Оракул — в Pro.
          </div>
          {threads.length > 0 ? threads.slice(0, 1).map((thread) => (
            <button
              key={thread.id}
              type="button"
              className={`oracle-chat-thread ${thread.id === activeThreadId ? 'active' : ''}`}
              onClick={() => openThread(thread)}
            >
              <span>{thread.title}</span>
              {thread.createdAt && <small>{new Date(thread.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}</small>}
            </button>
          )) : (
            <div className="text-muted" style={{ fontSize: '0.8rem' }}>Истории пока нет.</div>
          )}
          {threads.length > 1 && (
            <Link to="/settings?tab=subscription" className="oracle-upgrade-card">
              <strong>Полная история</strong>
              <span>Откройте Pro, чтобы видеть все прошлые диалоги и задавать вопросы без дневного лимита.</span>
            </Link>
          )}
        </aside>
        <div className="oracle-chat-main">
        <div className="chat-container">
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
                <>
                  <OracleMessage text={msg.text} contextBasis={msg.contextBasis} showWidget={msg.showWidget} />
                  {isLimitMessage(msg) && (
                    <div className="oracle-message-upgrade">
                      <UpgradePlans onPay={requestPayment} loading={paymentLoading} />
                    </div>
                  )}
                </>
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

        <div className="oracle-chat-form">
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
      </div>
    </div>
  );
}
