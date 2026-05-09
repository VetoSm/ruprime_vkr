import { useEffect, useState } from 'react';
import { coreApi } from '../../api/client';

interface ChatEntry {
  type: 'user' | 'ai';
  text: string;
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
        <h1>ИИ-коуч</h1>
        <p>Персональные советы по игре от искусственного интеллекта</p>
      </div>

      <div className="card" style={{ minHeight: 500, display: 'flex', flexDirection: 'column' }}>
        <div className="chat-container" style={{ flex: 1 }}>
          {messages.length === 0 && (
            <div className="text-center text-muted" style={{ marginTop: 40 }}>
              <p>Спросите ИИ-коуча обо всём, что касается вашей игры в Dota 2!</p>
              <p style={{ fontSize: '0.85rem', marginTop: 10 }}>
                Примеры: «Как улучшить игру на мид-лейне?» / «Каких героев учить для POS4?»
              </p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`chat-message ${msg.type}`}>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{msg.text}</div>
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
            placeholder="Спросите ИИ-коуча..."
            disabled={loading}
          />
          <button className="btn btn-primary" onClick={send} disabled={loading}>
            Отправить
          </button>
        </div>
      </div>
    </div>
  );
}
