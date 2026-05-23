# Oracle AI Chat

| | |
|---|---|
| **PNG** | `docs/design/mockups/ruprime_oracle_chat.png` |
| **Код** | `services/frontend/src/pages/player/AiChat.tsx` |
| **Layout** | `<AppLayout>` (PLAYER или COACH sidebar) |
| **Route** | `/ai-chat` |
| **Доступ** | PLAYER, COACH |

## Sidebar

Канонический, active = `Оракул` (sparkle icon).

## Композиция

```
<AppLayout>

  <header className="page-header flex-between">
    <div className="oracle-header">
      <OracleOrb size={48} />
      <div>
        <h1>Оракул</h1>
        <Badge tone="purple" icon="brain">
          AI-коуч на основе твоих матчей
        </Badge>
      </div>
    </div>
    <DailyLimitMeter used={limit.used} total={limit.total} />
  </header>

  <div className="oracle-layout"> {/* 7fr 3fr */}

    <main className="oracle-chat">

      {messages.length === 0 && (
        <div className="oracle-empty-state">
          <OracleOrb size={88} />
          <h3>Я знаю всё о твоих матчах</h3>
          <p>Спроси меня что угодно — от разбора последней игры до выбора героев под мету.</p>
          <div className="oracle-preset-row">
            {PRESETS.map(p =>
              <PromptChip key={p.text} icon={p.icon} onClick={() => sendMessage(p.text)}>
                {p.text}
              </PromptChip>
            )}
          </div>
        </div>
      )}

      <div className="chat-container">
        {messages.map(m => (
          m.role === 'user'
            ? <ChatMessage variant="user" key={m.id}>{m.text}</ChatMessage>
            : <ChatMessage variant="ai" key={m.id} avatar={<OracleOrb size={32} />}>
                <Markdown>{m.advice_full}</Markdown>
                {m.context_basis && <ContextBasisCard basis={m.context_basis} />}
              </ChatMessage>
        ))}
        {isLoading && (
          <ChatMessage variant="ai" loading><Spinner /> Оракул думает...</ChatMessage>
        )}
      </div>

      <footer className="chat-input-row">
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={() => sendMessage(input)}
          disabled={limit.remaining === 0}
          placeholder={limit.remaining === 0
            ? `Дневной лимит ${limit.total} исчерпан`
            : 'Спроси Оракула о своей игре...'} />
        {limit.remaining > 0 && (
          <div className="prompt-chips">
            {PRESETS.slice(0, 3).map(p =>
              <PromptChip compact onClick={() => sendMessage(p.text)}>{p.text}</PromptChip>
            )}
          </div>
        )}
      </footer>
    </main>

    <aside className="oracle-context">
      <Card title="Контекст анализа" compact>
        <p className="text-muted">Эти данные Оракул учитывает в каждом ответе:</p>
        <ContextItem label="Выборка" value={contextBasis?.scope || 'последние 50 ranked'} />
        <ContextItem label="Матчей"  value={contextBasis?.matches || profile.games_analyzed} />
        <ContextItem label="Винрейт" value={`${((contextBasis?.winrate || 0) * 100).toFixed(0)}%`} />
        <ContextItem label="MMR"     value={contextBasis?.mmr || '—'} />
        <ContextItem label="Цель"    value={profile.desired_rank_tier || 'не задана'} />

        <details>
          <summary>Топ героев</summary>
          <div className="hero-pool-row">
            {topHeroes.slice(0, 5).map(h =>
              <HeroChip key={h.hero_id} heroId={h.hero_id} size="sm" />
            )}
          </div>
        </details>
      </Card>
      ⚠ "Прикреплённый реплей" блок с PNG — **УБРАН** (REPLACEMENTS §15: нет API).
      ⚠ Кнопки управления контекстом убраны — контекст всегда автоматический.

      <Card title="История диалогов" compact>
        {history.length === 0 && <p className="text-muted">История пуста</p>}
        {history.map(h => (
          <div key={h.id} className="history-row" onClick={() => loadDialog(h.id)}>
            <OracleOrb size={24} />
            <div>
              <strong>{h.message.slice(0, 40)}...</strong>
              <small>{formatRelative(h.created_at)}</small>
            </div>
          </div>
        ))}
        {history.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onClearHistory}>
            Очистить историю
          </Button>
        )}
      </Card>
    </aside>
  </div>
</AppLayout>
```

## `PRESETS` (preset prompts)

```ts
const PRESETS = [
  { icon: 'replay',  text: 'Разбери мой последний матч' },
  { icon: 'sword',   text: 'Что играть против Pudge?' },
  { icon: 'target',  text: 'Что прокачать на этой неделе?' },
  { icon: 'hero',    text: 'Какой герой мне подходит сейчас?' },
  { icon: 'roles',   text: 'Какая моя сильнейшая роль?' },
  { icon: 'win',     text: 'Почему я часто проигрываю?' },
];
```

## `<ContextBasisCard>` (рендерится внутри AI message)

Показывает, на каких данных AI базировал ответ:
```
<Card variant="ghost" compact>
  <small>На основе:</small>
  <ul>
    <li>Выборка: {basis.scope}</li>
    <li>Матчей: {basis.matches}</li>
    <li>Винрейт: {(basis.winrate * 100).toFixed(0)}%</li>
    {basis.top_gaps?.slice(0, 3).map(g => <li key={g.key}>Топ-зона роста: {g.label}</li>)}
  </ul>
</Card>
```

## Данные

| Блок | Endpoint |
|---|---|
| Отправка сообщения | `POST /ai/chat` `{ message }` → `{ advice_summary, advice_full, context_basis, requests_remaining_today, ... }` |
| История | `GET /ai/history` (загружается на маунт) |
| Очистка истории | `DELETE /ai/history` |
| Top heroes для context aside | `summary.heroes_top` из `GET /player/{me.id}/stats/overview` (один раз) |
| `desired_rank_tier` | `GET /player/profile` |

## Замены

- **§3**: sidebar canonical.
- **§15**:
  - "Прикреплённый реплей" блок — убран (нет API).
  - "Кого играть" с hero portraits в ответе AI — рендерим только если LLM вернул `recommended_heroes` (сейчас не возвращает; готовый компонент `<RecommendedHeroes>` в `_future/`).
  - Радар/диаграмма "Производительность на Invoker" в ответе AI — убрана.
  - Daily limit показан в header через `<DailyLimitMeter>`.
- **§16**: Hero icons в context aside через `<HeroChip heroId>`.

## Acceptance

- [ ] Send отключен при `limit.remaining === 0` + placeholder меняется.
- [ ] При отправке — оптимистично добавляем сообщение пользователя сразу, AI ответ — после respond.
- [ ] `advice_full` рендерится через `<Markdown>` (с allowed tags: heading, list, bold, code).
- [ ] Историю можно переоткрыть — клик восстанавливает диалог в основном окне.
- [ ] `confirm()` перед "Очистить историю".
- [ ] Если в ответе `llm_status === 'rate_limited'` или `'unavailable'` — показываем `<Alert>` с текстом.
- [ ] Mobile: aside ниже chat, presets — горизонтальный скролл.

## States

| State | Поведение |
|---|---|
| no Steam | `<EmptyState title="Привяжи Steam для персональных советов">` |
| limit exhausted | `<Alert>` "Дневной лимит {N} исчерпан, попробуй завтра" |
| LLM unavailable (`llm_status='unavailable'`) | `<Alert>` "AI коуч временно недоступен" |
| sending | Spinner в AI message + input locked |
| loading history | Skeleton aside |
