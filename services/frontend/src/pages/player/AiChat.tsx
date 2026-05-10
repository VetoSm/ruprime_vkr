import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';

interface ChatEntry {
  type: 'user' | 'ai';
  text: string;
}

function cleanInline(text: string) {
  return text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/^>\s?/, '');
}

function OracleMessage({ text }: { text: string }) {
  const [body, metaRaw] = text.split(/\n---\n/);
  const lines = body.split('\n');
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

  const send = async () => {
    if (!input.trim()) return;
    const userMsg = input;
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
      const metaText = meta.length ? `\n\n---\n${meta.join('\n')}` : '';
      setMessages((prev) => [...prev, {
        type: 'ai',
        text: `${res.data.advice_full || res.data.advice_summary || 'Нет ответа'}${metaText}`,
      }]);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setMessages((prev) => [...prev, { type: 'ai', text: detail || 'ИИ-коуч временно недоступен.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Оракул Древних</h1>
        <p>AI-разбор по вашим матчам, роли и слабым зонам. Отвечает только по Dota 2.</p>
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
            AI
          </div>
          <div>
            <div style={{ fontWeight: 800 }}>Оракул Древних</div>
            <div className="text-muted" style={{ fontSize: '0.82rem' }}>
              Смотрит последние ranked-матчи, скиллы и role-aware baseline.
            </div>
          </div>
        </div>
        <div className="chat-container" style={{ flex: 1 }}>
          {messages.length === 0 && (
            <div className="text-center text-muted" style={{ marginTop: 40 }}>
              <p>Спросите Оракула о своей игре в Dota 2.</p>
              <p style={{ fontSize: '0.85rem', marginTop: 10 }}>
                Примеры: «Почему просел вижн на Soft Support?» / «Что тренировать в следующих 10 ranked?»
              </p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`chat-message ${msg.type}`}>
              {msg.type === 'ai' ? (
                <OracleMessage text={msg.text} />
              ) : (
                <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{msg.text}</div>
              )}
            </div>
          ))}
          {loading && (
            <div className="chat-message ai">
              <span className="text-muted">Думаю...</span>
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
          <button className="btn btn-primary" onClick={send} disabled={loading}>
            Получить разбор
          </button>
        </div>
      </div>
    </div>
  );
}
