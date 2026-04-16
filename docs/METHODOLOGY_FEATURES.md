# Методология расчёта фичей и оценки качества

## 1. Обзор системы

Система RuPrime анализирует игровые навыки игрока в Dota 2 по **8 категориям**, сравнивая показатели с эталонами (baselines) для соответствующего ранга. Результат — оценка от 0 до 10 по каждой категории, список слабых мест и рекомендация тренера.

### Архитектура расчёта

```
Источники данных ──► Эталоны (baselines) ──► Фичи игрока ──► Score 0-10
                                                              ▼
                                              Слабые места (gaps) ──► Подбор тренера
                                                                      ▼
                                                                AI-советы (LLM)
```

---

## 2. Источники данных

### 2.1. Kaggle Dataset (для эталонов)

| Параметр | Значение |
|----------|----------|
| Датасет | Dota 2 Pro League Matches 2024-2025 |
| Матчей | ~59,500 |
| Записей игроков | ~594,000 |
| Записей с rank_tier | ~369,000 (62%) |
| Типа матчей | Профессиональные + высокий рейтинг |

**Ограничения:** преобладание про-матчей (6000+ MMR), слабое покрытие рангов Herald–Crusader.

### 2.2. OpenDota API (для данных игрока)

| Данные | Источник | Объём |
|--------|----------|-------|
| Профиль (ранг, аватар) | `/players/{id}` | 1 объект |
| Lifetime totals (GPM, XPM, KDA...) | `/players/{id}/totals` | ~30 метрик |
| Последние матчи (детальные) | `/players/{id}/recentMatches` | 20 матчей |
| Матчи (базовые) | `/players/{id}/matches?limit=500` | до 500 матчей |
| Рейтинг по героям | `/players/{id}/rankings` | все герои |

---

## 3. Эталоны (Baselines)

### 3.1. Группировка

Эталоны вычисляются по тройке **(mmr_band, hero_id, lane_role)**:

| MMR Band | rank_tier | Медаль | Примерный MMR |
|----------|-----------|--------|---------------|
| herald | 10–19 | Herald | 0–770 |
| guardian | 20–29 | Guardian | 770–1540 |
| crusader | 30–39 | Crusader | 1540–2310 |
| archon | 40–49 | Archon | 2310–3080 |
| legend | 50–59 | Legend | 3080–3850 |
| ancient | 60–69 | Ancient | 3850–4620 |
| divine | 70–79 | Divine | 4620–5420 |
| immortal | 80+ | Immortal | 5420+ |

### 3.2. Агрегация

Для каждой тройки вычисляются:

```
AVG(gold_per_min), AVG(xp_per_min), AVG(kills), AVG(deaths), AVG(assists),
AVG(kda), AVG(last_hits), AVG(denies), AVG(hero_damage), AVG(tower_damage),
AVG(net_worth), AVG(winrate), COUNT(*) as match_count
```

Также для каждой метрики вычисляются **перцентили** (p25, p50, p75, p90, p95), сохраняемые в JSONB.

**Фильтр:** `match_count >= 5` — исключаются конфигурации с малым числом наблюдений.

### 3.3. Формула KDA

```
KDA = (kills + assists) / max(deaths, 1)
```

---

## 4. Расчёт фичей игрока

### 4.1. Источники значений

Для каждого игрока метрики берутся из:

1. **PlayerAccount.totals** (lifetime) — средние за всё время: GPM, XPM, kills, deaths, assists, last_hits, denies, hero_damage, tower_damage, hero_healing, stuns, wards, tower_kills, APM
2. **player_matches (detailed)** — если есть parsed-матчи: GPM, XPM, hero_damage, tower_damage, hero_healing, last_hits
3. **player_matches (all)** — K/D/A, winrate, hero count

Приоритет: totals → detailed matches → all matches.

### 4.2. Восемь категорий

#### Категория 1: Фарм (farming)

| Компонент | Формула | Что показывает |
|-----------|---------|----------------|
| GPM | `player.gpm` vs `baseline.gpm` | Скорость набора золота |
| CS/мин | `player.last_hits / avg_duration_min` vs `baseline.last_hits / 35` | Эффективность добивания крипов |
| Denies | `player.denies` vs `baseline.denies` | Денаи — лишение противника золота |
| Эффективность фарма | `gpm * dur / (gpm * dur)` | Как эффективно тратится золото |

#### Категория 2: Боевая эффективность (combat)

| Компонент | Формула | Что показывает |
|-----------|---------|----------------|
| KDA | `(kills + assists) / deaths` vs baseline | Общая боевая эффективность |
| Урон героям/мин | `hero_damage / duration_min` | Давление на противников |
| Убийства | `kills` vs baseline | Финишинг |
| Ассисты | `assists` vs baseline | Участие в убийствах |

#### Категория 3: Выживаемость (survival)

| Компонент | Формула | Что показывает |
|-----------|---------|----------------|
| Смерти (инверсия) | `baseline.deaths / player.deaths × 5` | Меньше смертей = выше score |
| Винрейт | `winrate × 100` vs 50%/55% | Процент побед |
| Лечение | `hero_healing` vs baseline | Поддержка команды |

#### Категория 4: Вижн и Картография (vision)

| Компонент | Формула | Что показывает |
|-----------|---------|----------------|
| Observer wards/игра | `total_obs / total_games` | Контроль карты |
| Sentry wards/игра | `total_sen / total_games` | Dewarding |

> **Примечание:** Данные доступны только для parsed-матчей (~3%). При отсутствии данных выводится "Недостаточно данных".

#### Категория 5: Давление на объекты (objectives)

| Компонент | Формула | Что показывает |
|-----------|---------|----------------|
| Урон по башням | `tower_damage` vs baseline | Давление на строения |
| Башен/игра | `total_tower_kills / total_games` | Уничтоженные объекты |
| Фокус на объектах | `tower_damage / hero_damage` | Приоритет объектов vs файтов |

#### Категория 6: Механический скилл (mechanics)

| Компонент | Формула | Что показывает |
|-----------|---------|----------------|
| APM | `actions_per_min` vs 80/120 | Скорость действий |
| XPM | `xp_per_min` vs baseline | Набор опыта |
| Уровень | `avg_level` vs 19/22 | Средний уровень героя |

> APM доступен только из totals (parsed матчи).

#### Категория 7: Стабильность (consistency)

| Компонент | Формула | Что показывает |
|-----------|---------|----------------|
| Общий винрейт | `winrate × 100` vs 50%/55% | Стабильность результата |
| Пул героев | `unique_heroes` vs 10/20 | Разнообразие героев |
| Опыт | `min(total_games / 100, 10) × 10` vs 50/80 | Количество игр |

#### Категория 8: Контроль и инициация (control)

| Компонент | Формула | Что показывает |
|-----------|---------|----------------|
| Стан/игра | `total_stuns / total_games` vs 15/25 | Контроль противников |

> Данные доступны только для parsed-матчей.

### 4.3. Формула Score

**Для метрик «чем больше — тем лучше» (direct):**

```
score = min(player_value / baseline_value × 5, 10)
```

**Для метрик «чем меньше — тем лучше» (inverted, e.g. deaths):**

```
score = min(baseline_value / player_value × 5, 10)
```

**Интерпретация:**

| Score | Интерпретация |
|-------|---------------|
| 0–2 | Критически слабо (ниже p25) |
| 3–4 | Ниже среднего (p25–p50) |
| 5 | На уровне среднего для ранга |
| 6–7 | Хороший уровень (p50–p75) |
| 8–9 | Отличный уровень (p75–p95) |
| 10 | Эталон — топ-5% |

### 4.4. Расчёт gap (разрыва)

```
gap = target_score - current_score
```

Где `target_score` вычисляется по эталону целевого ранга:

```
target_score = min(target_value / current_baseline × 5, 10)
```

Чем больше gap — тем важнее эта область для улучшения.

---

## 5. Оценка MMR (эвристика)

Вместо ML-модели (R² = 0.08 на про-данных) используется **эвристическая формула**:

```python
gpm_score  = clip((avg_gpm - 300) / 400, 0, 1)
xpm_score  = clip((avg_xpm - 300) / 400, 0, 1)
kda_score  = clip((avg_kda - 1) / 7, 0, 1)
wr_score   = clip((winrate - 0.3) / 0.4, 0, 1)

composite = 0.3 × gpm_score + 0.2 × xpm_score + 0.3 × kda_score + 0.2 × wr_score

estimated_mmr = 1000 + composite × 8000  # диапазон: 1000–9000
```

**Обоснование весов:**
- GPM (0.3) — основной показатель эффективности
- KDA (0.3) — показывает боевой вклад
- XPM (0.2) — коррелирует с влиянием на игру
- Winrate (0.2) — итоговый результат

---

## 6. Подбор тренера

### 6.1. Алгоритм скоринга

Каждый тренер оценивается по формуле:

```
score = 0.5 (база)
      + mmr_bonus (до +0.2)  # разница MMR тренера и игрока
      + role_bonus (+0.15)    # совпадение по ролям
      + hero_bonus (до +0.15) # пересечение пулов героев
      + exp_bonus (до +0.1)   # опыт тренерства
      + gap_bonus (до +0.3)   # тренер помогает в слабых категориях
```

### 6.2. Связь «роль тренера → категория навыка»

| Роль тренера | Категории, которые он может развить |
|-------------|-------------------------------------|
| POS1 (Carry) | farming, early_game |
| POS2 (Mid) | combat, early_game |
| POS3 (Offlane) | initiation, survival |
| POS4 (Soft Sup) | vision, initiation |
| POS5 (Hard Sup) | vision, survival |

---

## 7. Известные ограничения

| Ограничение | Влияние | Путь решения |
|-------------|---------|-------------|
| Baselines на про-данных | Завышенные эталоны для низких рангов | OpenDota Data Dump |
| Score = player / avg × 5 | «Средний» = 5/10 (не перцентильная шкала) | Перцентильная система |
| Нет разделения по позиции | POS1 и POS5 с одним эталоном | Фильтр по lane_role |
| Vision/Control: мало данных | «Недостаточно данных» для 97% матчей | Запрос парсинга матчей |
| Totals = lifetime average | Не отражает текущий уровень | Фокус на last 50 matches |
| Нет учёта патча/меты | Устаревшие эталоны | Фильтр по patch_id |

---

## 8. Формулы в коде

### Файлы

| Файл | Ответственность |
|------|----------------|
| `services/ml/app/feature_engine.py` | compute_baselines(), analyze_player(), _estimate_mmr_from_stats() |
| `services/ml/app/detailed_features.py` | compute_detailed_features(), 8 категорий, score/target/gap |
| `services/ml/app/routers/matching.py` | _score_coach(), _smart_match_coaches() |
| `services/ml/app/routers/analysis.py` | API endpoints для фичей и связи со Steam |

### Зависимости между расчётами

```
compute_baselines()
    └── Заполняет ml_kaggle_baselines (AVG + percentiles)

compute_detailed_features(account_id)
    ├── Читает player_accounts (totals)
    ├── Читает player_matches (recent matches)
    ├── Читает ml_kaggle_baselines (current_band, target_band)
    └── Возвращает: categories[], overall_score, top_gaps[]

match_coaches(player, coaches)
    ├── analyze_player_from_account() → summary, weaknesses
    ├── compute_detailed_features() → feature_gaps, weak_categories
    └── _score_coach() × N coaches → ranked recommendations
```
