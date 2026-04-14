# Развёртывание Dota 2 Coach Platform на сервере

Пошаговая инструкция: от чистой Ubuntu до работающего сайта с доменом и SSL.
Код пушится напрямую с ПК на сервер через Git по SSH — без GitHub.

---

## Что нужно перед началом

- Сервер с Ubuntu (22.04 или 24.04), минимум 4 GB RAM, 30 GB диска
- Доменное имя (привязанное к IP сервера)
- SSL-сертификат (или бесплатный Let's Encrypt)
- SSH-доступ к серверу

---

## Часть 1. Подготовка сервера

### Шаг 1. Подключиться к серверу

```bash
ssh root@IP_ВАШЕГО_СЕРВЕРА
```

Если спрашивает `Are you sure?` — пишем `yes`.

### Шаг 2. Обновить систему

```bash
apt update && apt upgrade -y
```

### Шаг 3. Установить Docker

```bash
curl -fsSL https://get.docker.com | sh

# Проверяем
docker --version
docker compose version
```

### Шаг 4. Установить Git

```bash
apt install git -y
```

### Шаг 5. Создать пользователя deploy

```bash
adduser deploy
# Вводим пароль (запомните!), остальные поля — Enter

usermod -aG docker deploy
usermod -aG sudo deploy
```

### Шаг 6. Настроить SSH-ключ для deploy

Чтобы с вашего ПК можно было подключаться к серверу как `deploy` и пушить код.

**На вашем ПК** (НЕ на сервере):
```bash
# Проверяем есть ли уже ключ
cat ~/.ssh/id_ed25519.pub
```

Если показывает `ssh-ed25519 ...` — ключ уже есть, копируем его.
Если ошибка — создаём:
```bash
ssh-keygen -t ed25519
# Нажимаем Enter 3 раза
cat ~/.ssh/id_ed25519.pub
# Копируем результат
```

**На сервере** (от root):
```bash
# Переключаемся на deploy
su - deploy

# Создаём папку для ключей
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Вставляем публичный ключ с ПК
nano ~/.ssh/authorized_keys
# Вставляем скопированный ключ (ssh-ed25519 ...)
# Ctrl+O, Enter, Ctrl+X

chmod 600 ~/.ssh/authorized_keys
```

**Проверяем с ПК:**
```bash
ssh deploy@IP_СЕРВЕРА
# Должно подключиться БЕЗ пароля
```

---

## Часть 2. Настройка Git (ПК → Сервер напрямую)

Код отправляется с вашего ПК прямо на сервер по SSH. Никакой GitHub.

### Шаг 7. На сервере — создать Git-хранилище

```bash
ssh deploy@IP_СЕРВЕРА

# Создаём "голый" репозиторий (хранилище для кода)
mkdir -p /opt/dota-coach-repo.git
cd /opt/dota-coach-repo.git
git init --bare

# Создаём рабочую папку
mkdir -p /opt/dota-coach
```

### Шаг 8. На ПК — настроить Git и сделать первый push

```bash
cd /Users/aleksandr/project_2

# Git уже инициализирован, добавляем файлы
git add .
git commit -m "Initial commit: Dota 2 Coach Platform"

# Связываем с сервером
git remote add server deploy@IP_СЕРВЕРА:/opt/dota-coach-repo.git

# Пушим код на сервер
git push server main
```

Если ошибка `error: src refspec main does not match` — возможно ветка называется `master`:
```bash
git branch -M main
git push server main
```

### Шаг 9. На сервере — развернуть код из хранилища

```bash
ssh deploy@IP_СЕРВЕРА

cd /opt/dota-coach
git clone /opt/dota-coach-repo.git .
# Точка в конце обязательна — "клонировать в текущую папку"

# Проверяем
ls -la
# Должны видеть: docker-compose.yml, services/, notebooks/, DEPLOY.md и т.д.
```

---

## Часть 3. Загрузка данных archive-2

Данные archive-2 (~8 GB) в Git НЕ хранятся (они в `.gitignore`). Загружаем отдельно.

### Шаг 10. Скопировать archive-2 на сервер

**На вашем ПК:**
```bash
rsync -avz --progress /Users/aleksandr/project_2/archive-2/ deploy@IP_СЕРВЕРА:/opt/dota-coach/archive-2/
```

Это займёт 10-30 минут в зависимости от скорости интернета. Показывает прогресс.

---

## Часть 4. Настройка и запуск

### Шаг 11. Создать .env на сервере

Файл `.env` тоже в `.gitignore` (там пароли), создаём его вручную:

```bash
ssh deploy@IP_СЕРВЕРА
cd /opt/dota-coach
nano .env
```

Вставляем:

```env
# ===== PostgreSQL =====
POSTGRES_USER=dota_coach
POSTGRES_PASSWORD=ВСТАВИТЬ_ПАРОЛЬ
POSTGRES_DB=dota_coach_db
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
DATABASE_URL=postgresql://dota_coach:ВСТАВИТЬ_ТОТ_ЖЕ_ПАРОЛЬ@postgres:5432/dota_coach_db

# ===== Тестовые данные (true при первом запуске, потом false) =====
SEED_TEST_DATA=true

# ===== JWT =====
JWT_SECRET=ВСТАВИТЬ_СЕКРЕТ
JWT_ALGORITHM=HS256
JWT_ACCESS_EXPIRES_MIN=30
JWT_REFRESH_EXPIRES_DAYS=7

# ===== Внутренние URL (НЕ менять) =====
AUTH_SERVICE_URL=http://auth:8001
CORE_SERVICE_URL=http://core:8002
ML_SERVICE_URL=http://ml:8003
LLM_SERVICE_URL=http://llm:8004

# ===== Data =====
KAGGLE_DATA_PATH=/data/archive-2
```

**Сгенерировать пароль и секрет:**
```bash
# В другом терминале на сервере:
openssl rand -base64 32    # для POSTGRES_PASSWORD
openssl rand -base64 48    # для JWT_SECRET
```

Скопируйте результаты в `.env`. Пароль PostgreSQL должен быть одинаковым в `POSTGRES_PASSWORD` и в `DATABASE_URL`.

Сохраняем: `Ctrl+O`, Enter, `Ctrl+X`.

### Шаг 12. Настроить URL фронтенда

```bash
nano docker-compose.yml
```

Найдите секцию `frontend` (в конце файла) и замените `localhost`:

```yaml
  frontend:
    environment:
      VITE_AUTH_API_URL: https://ваш-домен.ru
      VITE_CORE_API_URL: https://ваш-домен.ru
      VITE_ML_API_URL: https://ваш-домен.ru
```

Сохраняем: `Ctrl+O`, Enter, `Ctrl+X`.

**Важно:** этот файл изменён только на сервере. Не коммитьте его обратно — при следующем `git pull` ваши изменения сохранятся (Git предупредит о конфликте, решите вручную или сделайте `git stash && git pull && git stash pop`).

### Шаг 13. Запустить проект

```bash
cd /opt/dota-coach
docker compose up --build -d
```

Первая сборка — 3-7 минут.

Проверяем:
```bash
docker compose ps
# Все 6 контейнеров должны быть Up

# Проверяем API
curl http://localhost:8001/health   # auth
curl http://localhost:8002/health   # core
curl http://localhost:8003/health   # ml
curl http://localhost:8004/health   # llm
```

---

## Часть 5. Домен и SSL

### Шаг 14. Привязать домен (DNS)

В панели управления доменом (у регистратора) создайте A-запись:

| Тип | Имя | Значение |
|-----|-----|----------|
| A | @ | IP_ВАШЕГО_СЕРВЕРА |
| A | www | IP_ВАШЕГО_СЕРВЕРА |

Подождите 5-30 минут. Проверяем:
```bash
ping ваш-домен.ru
# Должен показать IP вашего сервера
```

### Шаг 15. Установить и настроить Nginx

```bash
sudo apt install nginx -y

sudo nano /etc/nginx/sites-available/dota-coach
```

Вставляем (замените `ваш-домен.ru` на реальный домен):

```nginx
server {
    listen 80;
    server_name ваш-домен.ru www.ваш-домен.ru;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /auth/ {
        proxy_pass http://127.0.0.1:8001/auth/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location ~ ^/(me|player|coach|coaches|matchmaking|training-sessions|ai|admin)(/|$) {
        proxy_pass http://127.0.0.1:8002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
    }

    location /ml/ {
        proxy_pass http://127.0.0.1:8003/ml/;
        proxy_set_header Host $host;
        proxy_read_timeout 300s;
    }

    location /llm/ {
        proxy_pass http://127.0.0.1:8004/llm/;
        proxy_set_header Host $host;
    }

    location /health {
        proxy_pass http://127.0.0.1:8002/health;
    }
}
```

Сохраняем: `Ctrl+O`, Enter, `Ctrl+X`.

**Вход через Steam (OpenID):** в `.env` на сервере (и пересобрать `auth` + `frontend`) задайте публичные URL:

```bash
STEAM_OPENID_ENABLED=true
STEAM_RETURN_URL=https://ваш-домен.ru/auth/steam/callback
STEAM_REALM=https://ваш-домен.ru/
FRONTEND_STEAM_REDIRECT=https://ваш-домен.ru/auth/steam-callback
```

`STEAM_REALM` должен быть «родителем» `STEAM_RETURN_URL` (как у Valve). Локально оставьте значения по умолчанию из `docker-compose.yml`.

```bash
sudo ln -s /etc/nginx/sites-available/dota-coach /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t            # проверка (должно быть ok)
sudo systemctl reload nginx
```

Проверяем: откройте `http://ваш-домен.ru` — должен работать сайт.

### Шаг 16. Установить SSL

#### Вариант А: Let's Encrypt (бесплатный)

```bash
sudo apt install certbot python3-certbot-nginx -y

sudo certbot --nginx -d ваш-домен.ru -d www.ваш-домен.ru
# Email: ваш email
# Terms: Y
# Share: N
# Redirect: 2 (да)
```

Готово. `https://ваш-домен.ru` работает с зелёным замком.

#### Вариант Б: Купленный сертификат

```bash
sudo mkdir -p /etc/ssl/dota-coach

# Загрузите файлы сертификата на сервер (через SCP или nano)
# Нужны: сертификат (.crt/.pem) и приватный ключ (.key)

# Если есть ca_bundle — объединяем:
cat certificate.crt ca_bundle.crt > /etc/ssl/dota-coach/fullchain.crt
cp private.key /etc/ssl/dota-coach/private.key
```

Редактируем Nginx:
```bash
sudo nano /etc/nginx/sites-available/dota-coach
```

Добавляем в начало (ПЕРЕД текущим блоком server):
```nginx
server {
    listen 80;
    server_name ваш-домен.ru www.ваш-домен.ru;
    return 301 https://$host$request_uri;
}
```

В существующем блоке меняем первые строки:
```nginx
server {
    listen 443 ssl;
    server_name ваш-домен.ru www.ваш-домен.ru;

    ssl_certificate     /etc/ssl/dota-coach/fullchain.crt;
    ssl_certificate_key /etc/ssl/dota-coach/private.key;

    # ... все location блоки без изменений ...
}
```

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Шаг 17. Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
# Confirm: y
```

---

## Часть 6. Загрузка данных (первый запуск)

БД пустая — нужно загрузить данные.

```bash
ssh deploy@IP_СЕРВЕРА
cd /opt/dota-coach

# 1. Справочники (герои, предметы) — 5 секунд
curl -X POST http://localhost:8003/ml/admin/load-constants

# 2. Матчи из archive-2 — 15-30 минут
curl -X POST http://localhost:8003/ml/admin/start-import \
  -H "Content-Type: application/json" \
  -d '{"directory_path": "all"}'

# Следить за прогрессом (обновляется каждые 5 сек, Ctrl+C чтобы выйти):
watch -n 5 'curl -s http://localhost:8003/ml/admin/import-status | python3 -m json.tool 2>/dev/null | head -10'

# 3. Вычислить эталоны — 1-2 минуты
curl -X POST http://localhost:8003/ml/admin/compute-baselines

# 4. Обучить модель — 2-5 минут
curl -X POST http://localhost:8003/ml/admin/start-training
# Проверить: curl http://localhost:8003/ml/admin/training-status

# 5. Создать админа
curl -X POST http://localhost:8001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"login":"admin","email":"ваш@email.com","password":"надёжный_пароль","confirm_password":"надёжный_пароль","role":"PLAYER"}'

docker compose exec postgres psql -U dota_coach dota_coach_db \
  -c "UPDATE auth_users SET role = 'ADMIN' WHERE email = 'ваш@email.com';"

# 6. Отключить тестовые данные
nano .env
# Меняем SEED_TEST_DATA=true → SEED_TEST_DATA=false
# Ctrl+O, Enter, Ctrl+X
docker compose restart auth core
```

---

## Часть 7. Деплой обновлений

Когда вы изменили код на ПК и хотите обновить сервер:

### На ПК:
```bash
cd /Users/aleksandr/project_2
git add .
git commit -m "описание изменений"
git push server main
```

### На сервере:
```bash
ssh deploy@IP_СЕРВЕРА
cd /opt/dota-coach
git pull
docker compose up --build -d
```

### Быстрый деплой одной командой с ПК:
```bash
git push server main && ssh deploy@IP_СЕРВЕРА "cd /opt/dota-coach && git pull && docker compose up --build -d && docker compose ps"
```

### Если изменился только один сервис:
```bash
# Только ML
ssh deploy@IP_СЕРВЕРА "cd /opt/dota-coach && git pull && docker compose up --build ml -d"

# Только фронтенд
ssh deploy@IP_СЕРВЕРА "cd /opt/dota-coach && git pull && docker compose up --build frontend -d"
```

### Если `git pull` ругается на конфликт в docker-compose.yml:

Это потому что на сервере вы вручную меняли URL фронтенда.

```bash
git stash          # спрятать локальные изменения
git pull           # забрать новый код
git stash pop      # вернуть локальные изменения
# Если конфликт — nano docker-compose.yml, починить вручную
docker compose up --build -d
```

---

## Часть 8. Обслуживание

### Бэкапы

```bash
# Ручной бэкап
cd /opt/dota-coach
docker compose exec postgres pg_dump -U dota_coach dota_coach_db > ~/backup_$(date +%F).sql

# Автобэкап каждую ночь в 3:00
crontab -e
# Вставить строку:
0 3 * * * cd /opt/dota-coach && docker compose exec -T postgres pg_dump -U dota_coach dota_coach_db | gzip > /opt/backups/dota_$(date +\%F).sql.gz && find /opt/backups -mtime +14 -delete

# Восстановление
docker compose exec -T postgres psql -U dota_coach dota_coach_db < backup.sql
```

### Команды на каждый день

| Что | Команда |
|-----|---------|
| Подключиться | `ssh deploy@IP_СЕРВЕРА` |
| Запустить | `cd /opt/dota-coach && docker compose up -d` |
| Остановить | `docker compose down` |
| Пересобрать | `docker compose up --build -d` |
| Деплой | `git pull && docker compose up --build -d` |
| Логи | `docker compose logs -f` |
| Логи 1 сервиса | `docker compose logs -f ml` |
| Статус | `docker compose ps` |
| Ресурсы | `docker stats` |
| Бэкап | `docker compose exec postgres pg_dump -U dota_coach dota_coach_db > backup.sql` |
| Зайти в БД | `docker compose exec postgres psql -U dota_coach dota_coach_db` |
| Обновить SSL | `sudo certbot renew` |
| Рестарт Nginx | `sudo systemctl reload nginx` |

---

## Что в .gitignore и почему

| Файл/папка | Почему исключён | Что делать на сервере |
|------------|-----------------|----------------------|
| `archive-2/` | 8 GB данных Kaggle | Загрузить через `rsync` (шаг 10) |
| `.env` | Пароли и секреты | Создать вручную (шаг 11) |
| `node_modules/` | Зависимости фронта, ставятся при сборке Docker | Ничего — Docker сам установит |
| `__pycache__/`, `*.pyc` | Кэш Python | Ничего — создаётся автоматически |
| `.DS_Store` | Системный файл macOS | Ничего |
| `*.sql` | Бэкапы БД | Хранить отдельно |
| `*.jpg` | Скриншоты для документации | Не нужны на сервере |
| `notebooks/.ipynb_checkpoints/` | Кэш Jupyter | Не нужен на сервере |
