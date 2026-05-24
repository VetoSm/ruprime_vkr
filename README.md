# Dota 2 Coach Platform

AI-powered platform for Dota 2 coaching: analytics, personalized training, coach matching, and AI advisor.

## Architecture

5 microservices, all containerized with Docker:

| Service  | Port | Description |
|----------|------|-------------|
| Auth     | 8001 | Authentication, JWT, Steam linking |
| Core     | 8002 | BFF: profiles, matchmaking, sessions, admin |
| ML       | 8003 | Data loading, feature engineering, MMR estimation |
| LLM      | 8004 | AI coach (stub, ready for LLM integration) |
| Frontend | 3000 | React SPA with dark Dota 2 theme |

## Quick Start

### 1. Launch all services

```bash
docker-compose up --build
```

### 2. Load data (after services are up)

Open the admin panel or use curl:

```bash
# Load constants (heroes, items, abilities)
curl -X POST http://localhost:8003/ml/admin/load-constants

# Load 2024 data
curl -X POST http://localhost:8003/ml/admin/load-kaggle-data \
  -H "Content-Type: application/json" \
  -d '{"directory_path": "/data/archive-2/2024"}'

# Load all data (2024 + 2025)
curl -X POST http://localhost:8003/ml/admin/load-all-data

# Compute baselines for MMR estimation
curl -X POST http://localhost:8003/ml/admin/compute-baselines

# Train MMR model
curl -X POST http://localhost:8003/ml/admin/train-mmr-model
```

### 3. Create an admin user

```bash
curl -X POST http://localhost:8001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"login": "admin", "email": "admin@dota.coach", "password": "admin1234", "confirm_password": "admin1234", "role": "PLAYER"}'
```

Then update the role in the database:
```sql
UPDATE auth_users SET role = 'ADMIN' WHERE email = 'admin@dota.coach';
```

### 4. Open the frontend

Go to http://localhost:3000

## Tech Stack

- **Backend**: Python 3.11, FastAPI, SQLAlchemy, PostgreSQL
- **ML**: pandas, numpy, scikit-learn
- **Frontend**: React 18, TypeScript, Vite, Recharts
- **Infrastructure**: Docker, docker-compose

## Project Structure

```
services/
├── auth/         # Authentication service
├── core/         # Core business logic service (BFF)
├── ml/           # ML analytics service
├── llm/          # LLM coach service (stub)
└── frontend/     # React SPA
archive-2/        # Kaggle Dota 2 data (CSV + images)
```

## API Documentation

Each service exposes Swagger docs:
- Auth: http://localhost:8001/docs
- Core: http://localhost:8002/docs
- ML: http://localhost:8003/docs
- LLM: http://localhost:8004/docs

## Environment Variables

All configuration is in `.env` file. Key settings:
- `POSTGRES_*` - Database credentials
- `JWT_SECRET` - JWT signing secret (change in production!)
- `JWT_ACCESS_EXPIRES_MIN` - Access token TTL (default: 30 min)
- `JWT_REFRESH_EXPIRES_DAYS` - Refresh token TTL (default: 7 days)
- `KAGGLE_DATA_PATH` - Path to CSV data inside ML container
