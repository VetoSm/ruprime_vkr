# Landing (главный лендинг)

| | |
|---|---|
| **PNG** | `docs/design/mockups/ruprime_landing.png` |
| **Код** | `services/frontend/src/pages/Landing.tsx` |
| **Layout** | `<PublicLayout>` |
| **Route** | `/` (если `!user`, иначе redirect на `defaultRouteForRole`) |
| **Доступ** | guest only (auth redirect-ит) |

## Композиция (top → bottom)

```
<PublicLayout>
  <main className="landing-page">

    1. HERO — landing-hero (grid 1.1fr 0.9fr)
       LEFT: landing-hero-panel
         - <Badge tone="cyan" icon="brain">AI-аналитика Dota 2</Badge>
         - <h1 className="landing-title">
             Стань <span>Immortal</span>. С AI-аналитикой<br/>и тренерами Tier-1.
           </h1>
         - <p className="landing-subtitle">Персональные инсайты, разборы матчей и прогресс под контролем искусственного интеллекта и про-игроков.</p>
         - landing-cta:
             <Button variant="primary" as="a" href="/auth/steam/login">Попробовать через Steam →</Button>
             <Button variant="outline" as={Link} to="/coach-landing">Я тренер</Button>
         - landing-social-proof (grid 3×1):
             <ProofCard value="Сотни"   label="игроков"        />   ← см. REPLACEMENTS §5: убрали число
             <ProofCard value="+MMR"    label="реальный рост"   />
             <ProofCard value="98%"     label="возвращаются"    />   ← опционально оставить статикой
       RIGHT: landing-hero-mock
         - landing-screen mockup с фиктивным dashboard-превью (читаемый только декор):
             - mini-sidebar (5 nav items)
             - mini-avatar block: <Avatar variant="placeholder" fallbackText="SB" /> + "ShadowBlade · Immortal 1023"
               ⚠ Не Steam avatar! Это декор, fallback на инициалы или статичный hero-сэмпл (например heroIcon(74) = Invoker).
             - 3 skill rings (78 / 92 / 65) — статичные значения
             - sparkline-чарт — CSS keyframes анимация (нет real data)
           ⚠ Весь блок `landing-hero-mock` обёрнут `aria-hidden="true"` и не зависит от API.

    2. STEPS — landing-section "Как это работает"
       <section className="landing-section">
         <h2 className="landing-section-title">Как это работает</h2>
         <div className="landing-steps">
           <StepCard index={1} title="Анализируем" text="Наш AI анализирует ваши матчи, находит ошибки и точки роста." icon="brain" />
           <StepCard index={2} title="Обучаем"    text="Персональные планы, разборы с тренерами и AI-рекомендации." icon="screen" />
           <StepCard index={3} title="Побеждаем"  text="Закрепляйте навыки, растите MMR и достигайте новых рангов." icon="trophy" />
         </div>
       </section>

    3. FINAL CTA — landing-final-cta
       <section className="landing-final-cta">
         <h3>Готов поднять свой скилл на новый уровень?</h3>
         <p>Присоединяйся к RuPrime и начни побеждать уже сегодня.</p>
         <Button variant="primary" as="a" href="/auth/steam/login">Попробовать через Steam →</Button>
       </section>

  </main>
</PublicLayout>
```

## Компоненты из TOOLKIT

🟢 active: `Badge`, `Button primary`, `Button outline`, `ProofCard`, `StepCard`, `GlowGradient` (фон), `Sparkline`, `SkillRing` (декор)

## Данные

**Все данные статичные.** Никаких API не вызываем. Превью dashboard — это фейковый JSX (декор, aria-hidden).

## Замены применены

См. `REPLACEMENTS.md`:
- **§5**: Stat "1 240 игроков" → "Сотни" / "+850 MMR" → "+MMR реальный рост" / "98% возвращаются" → опционально статика
- **§5**: Все CTA → Steam OAuth, не email-form
- **§5**: Mockup-превью оставлен как декор, без real data
- **§16**: Аватар в превью (ShadowBlade) — это **не Steam avatar пользователя**, а статичный плейсхолдер с `aria-hidden="true"`. Никаких API.

## Acceptance criteria

- [ ] Hero корректно складывается на mobile (`< 980px`): grid становится 1fr, mockup-превью под hero-text.
- [ ] CTA "Попробовать через Steam" редиректит на `${AUTH_API_URL}/auth/steam/login`.
- [ ] CTA "Я тренер" ведёт на `/coach-landing`.
- [ ] При `user` — страница не рендерится (redirect на дашборд по роли).
- [ ] Заголовок имеет cyan glow на слове "Immortal".
- [ ] Sparkline в mockup-превью анимируется (CSS keyframes `sparkline-shimmer` + `sparkline-sweep` уже есть в `theme.css`).
- [ ] Lighthouse a11y ≥ 90 (mockup-превью должен иметь `aria-hidden="true"`).
- [ ] Все тексты — на русском, без английских заглушек.

## States

| State | Поведение |
|---|---|
| default | Полный hero + steps + CTA |
| auth'd user | Redirect (через `<Navigate />` в `App.tsx`) — страница не рендерится |
| loading | N/A — статичная |
| empty | N/A |
| error | N/A |

## Замечания для AI-генератора

1. **Не вызывай `coreApi` / `authApi`** — на этой странице нет данных.
2. **Mockup-превью** в `landing-hero-mock` собирается из фиктивных значений, как в текущем `Landing.tsx`. Не тяни реальные ML-данные.
3. CSS-классы (`landing-*`, `btn-primary`, `landing-skill-ring*`) уже определены в `theme.css` — переиспользуй.
4. Кнопка Steam — это `<a href="${authApi.defaults.baseURL}/auth/steam/login">`, не axios POST.
