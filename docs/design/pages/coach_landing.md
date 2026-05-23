# Coach Landing (лендинг для тренеров)

| | |
|---|---|
| **PNG** | `docs/design/mockups/ruprime_coach_landing.png` |
| **Код** | `services/frontend/src/pages/CoachLanding.tsx` |
| **Layout** | `<PublicLayout>` |
| **Route** | `/coach-landing` |
| **Доступ** | public (любая роль) |

## Композиция

```
<PublicLayout>
  <main className="landing-page">

    1. HERO — landing-hero (grid 1fr 1fr)
       LEFT: landing-hero-panel
         - <Badge tone="cyan" icon="trophy">Для тренеров Dota 2</Badge>
         - <h1 className="landing-title">
             Преврати свой опыт в стабильный <span>доход</span>
           </h1>
         - <p className="landing-subtitle">
             RuPrime соединяет тебя с замотивированными игроками,
             берёт на себя поиск клиентов и организацию сессий.
           </p>
         - landing-cta:
             <Button variant="primary" onClick={onApplyCoach}>Стать тренером →</Button>
             <Button variant="outline" as={Link} to="#how">Узнать условия</Button>
         - landing-social-proof (grid 3×1):
             <ProofCard value="Гибкий"  label="график" />
             <ProofCard value="100%"    label="ставки твои" />   ← было "до 80 000 ₽/мес"
             <ProofCard value="0%"      label="комиссии первый месяц" />
       RIGHT: landing-hero-mock
         - Декоративный mock тренерского дашборда (фиктивные данные, aria-hidden):
             - Mini header "Сессии за месяц 28"  ← было "Доход 64 500 ₽" (см. REPLACEMENTS §2)
             - Sparkline + area chart активности
             - Список из 3-4 строк "Предстоящие сессии" с placeholder-аватарами
             - Mini-rating block "4.9 ★ · 248 отзывов"

    2. BENEFITS — landing-section "Что ты получаешь"
       Grid 3×1:
         <StepCard icon="calendar" title="Гибкий график" text="Ты сам выбираешь, когда и сколько работать. Сессии в удобное время." />
         <StepCard icon="chart"    title="Мощная аналитика" text="Детальная статистика по сессиям и отзывы — следи за ростом в реальном времени." />
         <StepCard icon="wallet"   title="Простой расчёт" text="Тренер сам устанавливает цену за час. Оплата напрямую между сторонами после сессии." />
       ⚠ Иконка wallet — toolkit-only? НЕТ, оставляем — это не "платежи", а "ставка/расчёт".

    3. HOW IT WORKS — landing-section "Как стать тренером"
       Grid 4×1 timeline:
         <StepCard index={1} title="Зарегистрируйся"  text="Через Steam — клик и ты в системе." />
         <StepCard index={2} title="Пройди проверку" text="Мы проверим твой опыт по матчам OpenDota." />
         <StepCard index={3} title="Создай профиль"   text="Опиши подход, выбери цену за час." />
         <StepCard index={4} title="Получай учеников" text="Игроки сами найдут тебя через каталог." />

    4. FINAL CTA — landing-final-cta
       "Готов помогать другим расти?" + Button → onApplyCoach

  </main>
  + decor: <div className="landing-decor"
             style={{ backgroundImage: `url(${decorRender('coachLanding.left')})` }} />
           (слева/справа за hero, opacity 0.18, blur(2px))
</PublicLayout>
```

## Компоненты из TOOLKIT

🟢 `Badge`, `Button primary/outline`, `ProofCard`, `StepCard`, `GlowGradient`, `Sparkline`, `Avatar` (placeholder варианте для mock)

## Поведение `onApplyCoach`

```ts
function onApplyCoach() {
  if (!user) {
    // Steam OAuth с пометкой "coach signup"
    window.location.href = `${AUTH_URL}/auth/steam/login?signup=coach`;
    return;
  }
  if (user.role === 'PLAYER') {
    if (user.coach_application_status === 'PENDING') {
      toast('Ваша заявка уже на рассмотрении');
      return;
    }
    if (user.coach_application_status === 'APPROVED') {
      navigate('/coach/dashboard');
      return;
    }
    await authApi.post('/auth/apply-coach');
    toast('Заявка отправлена! Мы проверим её в течение 24ч');
    return;
  }
  if (user.role === 'COACH') {
    navigate('/coach/dashboard');
  }
}
```

## Данные

В основном статика. AuthContext даёт `user` для логики кнопки.

## Замены

- **REPLACEMENTS §2**: "до 80 000 ₽/мес" → "100% ставки твои". График "Доход" → "Сессий за месяц".
- **REPLACEMENTS §16**: Декор по краям — `decorRender('coachLanding.left'|'.right')`.
- Mock-аватары в превью — placeholder, не Steam.

## Acceptance

- [ ] CTA "Стать тренером" обрабатывает все 4 ветки (guest / PLAYER no app / PLAYER pending / COACH).
- [ ] Mobile: hero становится 1-колонка, mock-превью под текстом.
- [ ] Декор по краям — `aria-hidden`, не ломает a11y.

## States

| User | Кнопка "Стать тренером" |
|---|---|
| guest | редирект на Steam OAuth `?signup=coach` |
| PLAYER no app | `POST /auth/apply-coach` + toast |
| PLAYER PENDING | toast "Уже на рассмотрении" (disabled) |
| PLAYER REJECTED | re-apply возможен → POST `/auth/apply-coach` |
| COACH | redirect `/coach/dashboard` |
| ADMIN | toast "Админ не может подать заявку" |
