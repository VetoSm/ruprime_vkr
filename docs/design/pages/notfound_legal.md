# 404 NotFound + Privacy + Terms

| | |
|---|---|
| **PNG** | `docs/design/mockups/ruprime_notfound_legal.png` |
| **Код** | `NotFound.tsx`, `Privacy.tsx`, `Terms.tsx` |
| **Layout** | `<PublicLayout>` |
| **Routes** | `*` (catch-all), `/privacy`, `/terms` |
| **Доступ** | public |

---

## 404 NotFound

```
<PublicLayout>
  <main className="notfound-page">
    + декор: <img src={decorRender('notfound.center')} className="notfound-decor"
                  aria-hidden style={{ opacity: 0.22, mixBlendMode: 'screen' }} />

    <div className="notfound-content">
      <h1 className="notfound-404">404</h1>   ← cyan glow + лёгкий glitch keyframes
      <h2>Эта страница ушла в фонтан</h2>
      <p className="text-muted">Кажется, ты заглянул в туман войны. Давай вернёмся на базу.</p>

      <div className="notfound-cta">
        <Button variant="primary" as={Link} to="/">→ На главную</Button>
        <Button variant="outline" as={Link} to="/coaches">К списку тренеров</Button>
      </div>

      <div className="oracle-tip">
        <OracleOrb size={48} />
        <p className="text-muted">А пока — совет от Оракула:</p>
        <blockquote>"{randomOracleQuote()}"</blockquote>
      </div>

      <DotaMinimap aria-hidden className="notfound-minimap" />  ← SVG силуэт мини-карты
    </div>
  </main>
</PublicLayout>
```

### Pool of `randomOracleQuote()`

Статичный массив на фронте, 5-7 шуточных фраз:
- "Не форси без союзников. Жди роту."
- "Лучший вард — тот, что не нашли."
- "Хорошая мысль: купи бкб."
- "Карта была. Возможно, ты её не смотрел."
- "В этой ситуации ластхит — это ты."

### Замены

- **REPLACEMENTS §16**: декор-render через `decorRender('notfound.center')` = Vengeful Spirit. Никаких сгенерированных лиц в DOM.
- `<DotaMinimap>` — SVG-силуэт, не картинка с CDN.

### Acceptance
- [ ] 404 — крупно, читается на mobile (max-width 100% контейнера).
- [ ] CTA центрированы в одну строку на desktop, стак в mobile.
- [ ] Декор `aria-hidden`.

---

## Privacy + Terms (`/privacy`, `/terms`)

Обе страницы — статичные текстовые документы с одинаковой структурой.

```
<PublicLayout>
  <main className="legal-page">

    <aside className="legal-toc">
      <h3>Содержание</h3>
      <ol>
        <li><a href="#section-1" className={active === 1 ? 'active' : ''}>1. Общие положения</a></li>
        <li><a href="#section-2">2. Какие данные мы собираем</a></li>
        <li><a href="#section-3">3. Цели обработки</a></li>
        <li><a href="#section-4">4. Передача третьим лицам</a></li>
        <li><a href="#section-5">5. Хранение и удаление</a></li>
        <li><a href="#section-6">6. Cookies и трекеры</a></li>
        <li><a href="#section-7">7. Ваши права</a></li>
        <li><a href="#section-8">8. Контакты</a></li>
      </ol>
      <p className="legal-version">Версия от 12.05.2026</p>
    </aside>

    <article className="legal-body">
      <h1>Политика конфиденциальности</h1>
      <p className="legal-meta">Версия 2.1 · обновлена 12.05.2026</p>

      <section id="section-1">
        <h2><span className="legal-accent">|</span> 1. Общие положения</h2>
        <p>Настоящая Политика...</p>
        <h3>1.1 Кто мы</h3>
        <ul>
          <li>ИП Иванов И.И.</li>
          <li>ОГРНИП ..., ИНН ...</li>
          <li>Адрес: ...</li>
        </ul>
        <blockquote className="legal-callout">
          Мы храним только то, что нужно для работы платформы.
        </blockquote>
      </section>

      <section id="section-2">
        <h2><span className="legal-accent">|</span> 2. Какие данные мы собираем</h2>
        ...
      </section>

      ... остальные секции ...
    </article>

  </main>
</PublicLayout>
```

### Замены

- ❌ "Прикреплённый PDF" / "Скачать PDF" — нет такого блока.
- ✅ ToC слева — на mobile становится collapsible (или `position: static` сверху текста).
- ✅ Smooth scroll по якорям.

### Acceptance

- [ ] ToC на desktop — sticky (`position: sticky; top: 20px`).
- [ ] Активная ссылка в ToC подсвечивается cyan при скролле через `IntersectionObserver`.
- [ ] На mobile (< 980px) ToC — accordion сверху текста.
- [ ] Все ссылки в тексте корректно работают.

## Компоненты

🟢 `OracleOrb`, `Button primary/outline`, `DotaMinimap` (SVG component), декор `decorRender('notfound.center')`.

## Данные

Полная статика, на фронте в JSX/MDX.
