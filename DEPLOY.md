# Развёртывание Dota 2 Coach Platform на сервере

Пошаговая инструкция: от чистой Ubuntu до работающего сайта с доменом и SSL.

---

## Что нужно перед началом

- Сервер с Ubuntu (22.04 или 24.04), минимум 4 GB RAM, 30 GB диска
- Доменное имя (например `dota-coach.ru`), привязанное к IP сервера
- SSL-сертификат (или используем бесплатный Let's Encrypt)
- Проект в Git-репозитории (GitHub/GitLab)
- SSH-доступ к серверу

---

## Шаг 1. Подключиться к серверу

Открываем терминал на своём компьютере:

```bash
ssh root@IP_ВАШЕГО_СЕРВЕРА
```

Если спрашивает `Are you sure you want to continue connecting?` — пишем `yes`.

Если используете ключ:
```bash
ssh -i путь/к/ключу.pem root@IP_ВАШЕГО_СЕРВЕРА
```

После подключения вы увидите что-то вроде:
```
root@server:~#
```

Это значит вы на сервере. Все дальнейшие команды выполняются здесь.

---

## Шаг 2. Обновить систему

```bash
apt update && apt upgrade -y
```

Ждём 1-3 минуты. Если спрашивает что-то — нажимаем Enter (оставляем по умолчанию).

---

## Шаг 3. Установить Docker

```bash
# Скачиваем и устанавливаем Docker одной командой
curl -fsSL https://get.docker.com | sh

# Проверяем что установилось
docker --version
# Должно показать: Docker version 28.x.x

docker compose version
# Должно показать: Docker Compose version v2.x.x
```

Если `docker compose version` не работает — установите отдельно:
```bash
apt install docker-compose-plugin -y
```

---

## Шаг 4. Установить Git

```bash
apt install git -y

# Проверяем
git --version
# Должно показать: git version 2.x.x
```

---

## Шаг 5. Создать пользователя (не работать от root)

```bash
# Создаём пользователя
adduser deploy
# Вводим пароль (запомните его!), остальные поля — Enter

# Даём права на Docker
usermod -aG docker deploy

# Даём права sudo
usermod -aG sudo deploy

# Переключаемся на нового пользователя
su - deploy
```

Теперь вы видите:
```
deploy@server:~$
```

---

## Шаг 6. Настроить SSH-ключ для Git

Чтобы сервер мог скачивать код из вашего репозитория:

```bash
# Генерируем SSH-ключ
ssh-keygen -t ed25519 -C "deploy@server"
# Нажимаем Enter 3 раза (пустой пароль для ключа)

# Показываем публичный ключ
cat ~/.ssh/id_ed25519.pub
```

Скопируйте то, что показало (начинается с `ssh-ed25519 ...`).

**Идём в GitHub/GitLab:**
- GitHub: Settings → SSH and GPG keys → New SSH key → вставляем ключ
- GitLab: Preferences → SSH Keys → Add new key → вставляем ключ

---

## Шаг 7. Клонировать проект

```bash
# Переходим в папку для проекта
cd /opt
sudo mkdir dota-coach
sudo chown deploy:deploy dota-coach
cd dota-coach

# Клонируем репозиторий (замените URL на свой!)
git clone git@github.com:ВАШ_ЛОГИН/ВАШ_РЕПОЗИТОРИЙ.git .
```

Обратите внимание на точку `.` в конце — это значит "клонировать в текущую папку".

Если репозиторий публичный, можно по HTTPS:
```bash
git clone https://github.com/ВАШ_ЛОГИН/ВАШ_РЕПОЗИТОРИЙ.git .
```

Проверяем что файлы на месте:
```bash
ls -la
# Должны увидеть: docker-compose.yml, .env, services/, archive-2/ и т.д.
```

---

## Шаг 8. Загрузить данные archive-2

Если данные НЕ в git-репозитории (они большие ~8 GB), загрузите с локальной машины:

```bash
# НА ЛОКАЛЬНОЙ МАШИНЕ (не на сервере):
rsync -avz --progress /Users/aleksandr/project_2/archive-2/ deploy@IP_СЕРВЕРА:/opt/dota-coach/archive-2/
```

Или скачайте Kaggle dataset прямо на сервер:
```bash
# На сервере:
pip install kaggle
# Положить kaggle.json в ~/.kaggle/
kaggle datasets download -d YOUR_DATASET -p /opt/dota-coach/archive-2/
```

---

## Шаг 9. Настроить .env для продакшена

```bash
cd /opt/dota-coach
nano .env
```

Вставляем (замените все значения в ВЕРХНЕМ_РЕГИСТРЕ):

```env
# ===== PostgreSQL =====
POSTGRES_USER=dota_coach
POSTGRES_PASSWORD=ВСТАВИТЬ_СЛОЖНЫЙ_ПАРОЛЬ
POSTGRES_DB=dota_coach_db
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
DATABASE_URL=postgresql://dota_coach:ВСТАВИТЬ_ТОТ_ЖЕ_ПАРОЛЬ@postgres:5432/dota_coach_db

# ===== Тестовые данные (true только при первом запуске, потом false) =====
SEED_TEST_DATA=true

# ===== JWT =====
JWT_SECRET=ВСТАВИТЬ_ДЛИННУЮ_СЛУЧАЙНУЮ_СТРОКУ
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

**Как сгенерировать пароли:**
```bash
# Пароль для PostgreSQL (32 символа)
openssl rand -base64 32
# Пример: aB3dEf7hJkLmNpQrStUvWxYz1234567890==

# JWT Secret (48 символов)
openssl rand -base64 48
# Пример: xYz123AbCdEfGhIjKlMnOpQrStUvWxYz1234567890ABCDEF==
```

Скопируйте сгенерированные значения в `.env`. **Пароль PostgreSQL** должен быть одинаковым в `POSTGRES_PASSWORD` и в `DATABASE_URL`.

Сохраняем: `Ctrl+O`, Enter, `Ctrl+X`.

---

## Шаг 10. Настроить URL фронтенда

```bash
nano docker-compose.yml
```

Найдите секцию `frontend` (в конце файла) и замените `localhost` на ваш домен:

```yaml
  frontend:
    build: ./services/frontend
    ports:
      - "3000:3000"
    environment:
      VITE_AUTH_API_URL: https://ваш-домен.ru
      VITE_CORE_API_URL: https://ваш-домен.ru
      VITE_ML_API_URL: https://ваш-домен.ru
```

Сохраняем: `Ctrl+O`, Enter, `Ctrl+X`.

---

## Шаг 11. Запустить проект

```bash
cd /opt/dota-coach

# Собрать и запустить все контейнеры
docker compose up --build -d
```

Первый раз сборка займёт 3-7 минут (скачивание образов Python, Node.js, PostgreSQL).

Проверяем:
```bash
# Статус контейнеров (все должны быть Up)
docker compose ps

# Должно показать 6 контейнеров:
# postgres   - Up (healthy)
# auth       - Up
# core       - Up
# ml         - Up
# llm        - Up
# frontend   - Up
```

Если какой-то контейнер не Up — смотрим логи:
```bash
docker compose logs auth    # логи auth-сервиса
docker compose logs ml      # логи ml-сервиса
docker compose logs -f      # все логи в реальном времени (Ctrl+C чтобы выйти)
```

Проверяем что сервисы отвечают:
```bash
curl http://localhost:8001/health
# {"status":"ok","service":"auth"}

curl http://localhost:8002/health
# {"status":"ok","service":"core"}

curl http://localhost:8003/health
# {"status":"ok","service":"ml"}

curl http://localhost:8004/health
# {"status":"ok","service":"llm","mode":"stub"}

curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
# 200
```

Если все 200/ok — идём дальше.

---

## Шаг 12. Привязать домен

### 12.1. Настроить DNS

Зайдите в панель управления доменом (у вашего регистратора) и создайте A-запись:

| Тип | Имя | Значение | TTL |
|-----|-----|----------|-----|
| A | @ | IP_ВАШЕГО_СЕРВЕРА | 300 |
| A | www | IP_ВАШЕГО_СЕРВЕРА | 300 |

Подождите 5-30 минут пока DNS обновится.

Проверяем:
```bash
# На сервере или локально:
ping ваш-домен.ru
# Должен показать IP вашего сервера
```

### 12.2. Установить Nginx

```bash
sudo apt install nginx -y

# Проверяем
sudo systemctl status nginx
# Должно быть: active (running)
```

### 12.3. Настроить Nginx

```bash
sudo nano /etc/nginx/sites-available/dota-coach
```

Вставляем:

```nginx
server {
    listen 80;
    server_name ваш-домен.ru www.ваш-домен.ru;

    # Frontend (React SPA)
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

    # Auth API
    location /auth/ {
        proxy_pass http://127.0.0.1:8001/auth/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Core API — все маршруты
    location ~ ^/(me|player|coach|coaches|matchmaking|training-sessions|ai|admin)(/|$) {
        proxy_pass http://127.0.0.1:8002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
    }

    # ML API
    location /ml/ {
        proxy_pass http://127.0.0.1:8003/ml/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;
    }

    # LLM API
    location /llm/ {
        proxy_pass http://127.0.0.1:8004/llm/;
        proxy_set_header Host $host;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:8002/health;
    }
}
```

**Важно:** замените `ваш-домен.ru` на реальный домен (в 2 местах в строке `server_name`).

Сохраняем: `Ctrl+O`, Enter, `Ctrl+X`.

Активируем конфигурацию:
```bash
# Создаём символическую ссылку
sudo ln -s /etc/nginx/sites-available/dota-coach /etc/nginx/sites-enabled/

# Удаляем дефолтный сайт
sudo rm /etc/nginx/sites-enabled/default

# Проверяем конфигурацию (не должно быть ошибок)
sudo nginx -t
# nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
# nginx: configuration file /etc/nginx/nginx.conf test is successful

# Перезапускаем Nginx
sudo systemctl reload nginx
```

Проверяем в браузере: `http://ваш-домен.ru` — должен открыться сайт.

---

## Шаг 13. Установить SSL-сертификат

### Вариант А: бесплатный Let's Encrypt (рекомендуется)

```bash
# Устанавливаем Certbot
sudo apt install certbot python3-certbot-nginx -y

# Получаем сертификат (замените домен!)
sudo certbot --nginx -d ваш-домен.ru -d www.ваш-домен.ru
```

Certbot спросит:
1. Email — введите ваш email (для уведомлений об истечении)
2. Terms — `Y` (согласие)
3. Share email — `N` (не обязательно)
4. Redirect HTTP to HTTPS — выберите `2` (да, редиректить)

Готово! Certbot автоматически:
- Скачал сертификат
- Настроил Nginx для HTTPS
- Добавил автообновление

Проверяем: `https://ваш-домен.ru` — должен быть зелёный замок.

Автообновление проверяем:
```bash
sudo certbot renew --dry-run
# Должно пройти без ошибок
```

### Вариант Б: свой купленный сертификат

Если купили сертификат, у вас есть файлы:
- `certificate.crt` (или `.pem`) — сам сертификат
- `private.key` — приватный ключ
- `ca_bundle.crt` (опционально) — цепочка

```bash
# Копируем на сервер
sudo mkdir -p /etc/ssl/dota-coach
sudo nano /etc/ssl/dota-coach/certificate.crt
# Вставляем содержимое сертификата

sudo nano /etc/ssl/dota-coach/private.key
# Вставляем приватный ключ

# Если есть ca_bundle — объединяем:
cat certificate.crt ca_bundle.crt > /etc/ssl/dota-coach/fullchain.crt
```

Редактируем Nginx:
```bash
sudo nano /etc/nginx/sites-available/dota-coach
```

Добавляем в начало файла (ДО существующего блока `server`):

```nginx
# Редирект HTTP → HTTPS
server {
    listen 80;
    server_name ваш-домен.ru www.ваш-домен.ru;
    return 301 https://$host$request_uri;
}
```

В существующем блоке `server` меняем первую строку:
```nginx
server {
    listen 443 ssl;
    server_name ваш-домен.ru www.ваш-домен.ru;

    ssl_certificate     /etc/ssl/dota-coach/fullchain.crt;
    ssl_certificate_key /etc/ssl/dota-coach/private.key;

    # ... остальные location блоки без изменений ...
```

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## Шаг 14. Настроить Firewall

```bash
# Разрешаем только нужные порты
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP (для редиректа на HTTPS)
sudo ufw allow 443/tcp     # HTTPS

# Включаем firewall
sudo ufw enable
# Confirm: y

# Проверяем
sudo ufw status
```

**Важно:** порты 5432 (PostgreSQL), 8001-8004 (сервисы) НЕ открываем — они доступны только через Nginx.

---

## Шаг 15. Загрузить данные (первый запуск)

БД пустая. Загружаем данные пошагово:

```bash
cd /opt/dota-coach

# 1. Загрузить справочники (герои, предметы)
curl -X POST http://localhost:8003/ml/admin/load-constants
# Ответ: {"status":"success","heroes_loaded":126,...}

# 2. Загрузить матчи (самое долгое — 15-30 минут)
curl -X POST http://localhost:8003/ml/admin/start-import \
  -H "Content-Type: application/json" \
  -d '{"directory_path": "all"}'

# 3. Следить за прогрессом:
watch -n 5 'curl -s http://localhost:8003/ml/admin/import-status | python3 -m json.tool'
# Ctrl+C когда finished=true

# 4. Вычислить эталоны
curl -X POST http://localhost:8003/ml/admin/compute-baselines
# Ответ: {"status":"success","baselines_computed":1389}

# 5. Обучить модель MMR
curl -X POST http://localhost:8003/ml/admin/start-training
# Следить: curl http://localhost:8003/ml/admin/training-status

# 6. Выключить тестовые данные (больше не нужны)
nano .env
# Поменять SEED_TEST_DATA=true на SEED_TEST_DATA=false
# Ctrl+O, Enter, Ctrl+X

# 7. Создать реального админа
curl -X POST http://localhost:8001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"login":"admin","email":"ваш@email.com","password":"надёжный_пароль","confirm_password":"надёжный_пароль","role":"PLAYER"}'

# Назначить ADMIN
docker compose exec postgres psql -U dota_coach dota_coach_db \
  -c "UPDATE auth_users SET role = 'ADMIN' WHERE email = 'ваш@email.com';"
```

---

## Шаг 16. Проверить что всё работает

```bash
# Все контейнеры работают?
docker compose ps

# Сайт открывается?
curl -s -o /dev/null -w "%{http_code}" https://ваш-домен.ru
# 200

# API работает?
curl https://ваш-домен.ru/health
# {"status":"ok"}

# Данные загружены?
curl http://localhost:8003/ml/data/stats | python3 -c "
import sys,json
d=json.load(sys.stdin)
for t,i in d.items():
    print(f'{t}: {i.get(\"count\",0):,}')
"
```

Откройте `https://ваш-домен.ru` в браузере — должен работать сайт с зелёным замком.

---

## Деплой изменений (обновление кода)

Когда вы внесли изменения в код на своём компьютере:

### На локальном компьютере:
```bash
cd /Users/aleksandr/project_2
git add .
git commit -m "описание изменений"
git push
```

### На сервере:
```bash
ssh deploy@IP_СЕРВЕРА
cd /opt/dota-coach

# Забираем новый код
git pull

# Пересобираем и перезапускаем
docker compose up --build -d

# Проверяем
docker compose ps
docker compose logs --tail=20
```

### Быстрый деплой одной командой (с локальной машины):
```bash
ssh deploy@IP_СЕРВЕРА "cd /opt/dota-coach && git pull && docker compose up --build -d && docker compose ps"
```

### Если изменился только один сервис:
```bash
# Только ML
ssh deploy@IP_СЕРВЕРА "cd /opt/dota-coach && git pull && docker compose up --build ml -d"

# Только фронтенд
ssh deploy@IP_СЕРВЕРА "cd /opt/dota-coach && git pull && docker compose up --build frontend -d"
```

---

## Бэкапы

### Ручной бэкап:
```bash
cd /opt/dota-coach
docker compose exec postgres pg_dump -U dota_coach dota_coach_db > backup_$(date +%F).sql
```

### Автоматический бэкап (каждую ночь в 3:00):
```bash
# Создаём папку для бэкапов
sudo mkdir -p /opt/backups

# Добавляем в cron
crontab -e
# Вставляем строку:
0 3 * * * cd /opt/dota-coach && docker compose exec -T postgres pg_dump -U dota_coach dota_coach_db | gzip > /opt/backups/dota_$(date +\%F).sql.gz && find /opt/backups -mtime +14 -delete
```

Это: каждый день в 3:00 делает бэкап и удаляет старые (старше 14 дней).

### Восстановление из бэкапа:
```bash
# Распаковать
gunzip /opt/backups/dota_2026-02-16.sql.gz

# Загрузить
docker compose exec -T postgres psql -U dota_coach dota_coach_db < /opt/backups/dota_2026-02-16.sql
```

---

## Мониторинг и отладка

```bash
# Статус всех контейнеров
docker compose ps

# Логи в реальном времени
docker compose logs -f

# Логи одного сервиса
docker compose logs -f ml
docker compose logs -f core

# Сколько ресурсов потребляют контейнеры
docker stats

# Размер таблиц в БД
docker compose exec postgres psql -U dota_coach dota_coach_db -c "
SELECT tablename, pg_size_pretty(pg_total_relation_size(tablename::text)) as size
FROM pg_tables WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(tablename::text) DESC;
"

# Зайти в БД вручную
docker compose exec postgres psql -U dota_coach dota_coach_db

# Перезапустить всё
docker compose restart

# Перезапустить один сервис
docker compose restart ml

# Полная пересборка с нуля (ОСТОРОЖНО: удалит данные из БД!)
docker compose down -v
docker compose up --build -d
```

---

## Шпаргалка команд

| Что сделать | Команда |
|-------------|---------|
| Подключиться к серверу | `ssh deploy@IP_СЕРВЕРА` |
| Запустить проект | `cd /opt/dota-coach && docker compose up -d` |
| Остановить проект | `docker compose down` |
| Пересобрать всё | `docker compose up --build -d` |
| Деплой обновлений | `git pull && docker compose up --build -d` |
| Посмотреть логи | `docker compose logs -f` |
| Посмотреть статус | `docker compose ps` |
| Бэкап БД | `docker compose exec postgres pg_dump -U dota_coach dota_coach_db > backup.sql` |
| Зайти в БД | `docker compose exec postgres psql -U dota_coach dota_coach_db` |
| Обновить SSL | `sudo certbot renew` |
| Перезапустить Nginx | `sudo systemctl reload nginx` |
