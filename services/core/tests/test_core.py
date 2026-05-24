"""
Тесты Core-сервиса.

Запуск (при запущенных docker-контейнерах):
    pip install pytest httpx
    pytest services/core/tests/ -v

Для работы нужны запущенные Auth (8001) и Core (8002).
"""

import pytest
import httpx

AUTH_BASE = "http://localhost:8001"
CORE_BASE = "http://localhost:8002"


@pytest.fixture(scope="module")
def auth_client():
    return httpx.Client(base_url=AUTH_BASE, timeout=10)


@pytest.fixture(scope="module")
def core_client():
    return httpx.Client(base_url=CORE_BASE, timeout=10)


def get_token(auth_client, email, password):
    resp = auth_client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token(auth_client):
    return get_token(auth_client, "admin@dota.coach", "admin1234")


@pytest.fixture(scope="module")
def player_token(auth_client):
    return get_token(auth_client, "player@test.com", "player1234")


@pytest.fixture(scope="module")
def coach_token(auth_client):
    return get_token(auth_client, "coach@test.com", "coach12345")


# ---- Health ----

class TestHealth:
    def test_health(self, core_client):
        resp = core_client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["service"] == "core"


# ---- /me/overview ----

class TestMeOverview:
    def test_admin_overview(self, core_client, admin_token):
        """Обзор для админа."""
        resp = core_client.get("/me/overview", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        assert resp.json()["role"] == "ADMIN"
        assert "stats" in resp.json()

    def test_player_overview(self, core_client, player_token):
        """Обзор для игрока."""
        resp = core_client.get("/me/overview", headers={"Authorization": f"Bearer {player_token}"})
        assert resp.status_code == 200
        assert resp.json()["role"] == "PLAYER"

    def test_coach_overview(self, core_client, coach_token):
        """Обзор для тренера."""
        resp = core_client.get("/me/overview", headers={"Authorization": f"Bearer {coach_token}"})
        assert resp.status_code == 200
        assert resp.json()["role"] == "COACH"

    def test_no_auth(self, core_client):
        """Без токена -> 401."""
        resp = core_client.get("/me/overview")
        assert resp.status_code == 401


# ---- Player Profile ----

class TestPlayerProfile:
    def test_get_profile(self, core_client, player_token):
        """Получение профиля игрока (тестовые данные)."""
        resp = core_client.get("/player/profile", headers={"Authorization": f"Bearer {player_token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["desired_rank_tier"] == "IMMORTAL"
        assert data["steam_id"] == "76561198071234567"

    def test_update_profile(self, core_client, player_token):
        """Обновление профиля игрока."""
        resp = core_client.post("/player/profile",
            json={"desired_rank_tier": "DIVINE", "about": "Updated via test"},
            headers={"Authorization": f"Bearer {player_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["desired_rank_tier"] == "DIVINE"


# ---- Coach Profile ----

class TestCoachProfile:
    def test_get_coach_profile(self, core_client, coach_token):
        """Получение профиля тренера."""
        resp = core_client.get("/coach/profile", headers={"Authorization": f"Bearer {coach_token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["mmr_estimate"] == 7500
        assert data["is_verified"] is True

    def test_list_coaches(self, core_client, player_token):
        """Список тренеров."""
        resp = core_client.get("/coaches", headers={"Authorization": f"Bearer {player_token}"})
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
        assert len(resp.json()) >= 2  # 2 test coaches


# ---- Matchmaking ----

class TestMatchmaking:
    def test_create_request(self, core_client, player_token):
        """Создание заявки на подбор тренера."""
        resp = core_client.post("/matchmaking/requests",
            json={"desired_role": "POS2", "focus_area": "lane_control", "use_ai_coach": True},
            headers={"Authorization": f"Bearer {player_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["desired_role"] == "POS2"
        assert data["status"] in ("NEW", "MATCHING", "WAITING_CONFIRMATION")

    def test_list_requests(self, core_client, player_token):
        """Список заявок игрока."""
        resp = core_client.get("/matchmaking/requests/my",
            headers={"Authorization": f"Bearer {player_token}"},
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


# ---- Sessions ----

class TestSessions:
    def test_my_sessions(self, core_client, player_token):
        """Список сессий игрока."""
        resp = core_client.get("/training-sessions/my",
            headers={"Authorization": f"Bearer {player_token}"},
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


# ---- AI Chat ----

class TestAiChat:
    def test_chat(self, core_client, player_token):
        """Отправка сообщения AI-тренеру."""
        resp = core_client.post("/ai/chat",
            json={"message": "Как улучшить фарм?", "context_mode": "AUTO"},
            headers={"Authorization": f"Bearer {player_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "advice_summary" in data

    def test_history(self, core_client, player_token):
        """История чата с AI."""
        resp = core_client.get("/ai/history",
            headers={"Authorization": f"Bearer {player_token}"},
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


# ---- Admin ----

class TestAdmin:
    def test_admin_stats(self, core_client, admin_token):
        """Статистика системы (ADMIN)."""
        resp = core_client.get("/admin/stats", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        assert "total_users" in resp.json()

    def test_admin_users(self, core_client, admin_token):
        """Список пользователей (ADMIN)."""
        resp = core_client.get("/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_admin_logs(self, core_client, admin_token):
        """Логи действий (ADMIN)."""
        resp = core_client.get("/admin/logs", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_admin_db_view(self, core_client, admin_token):
        """Просмотр таблицы (ADMIN)."""
        resp = core_client.get("/admin/db-view/player_profiles",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["table"] == "player_profiles"

    def test_player_cant_admin(self, core_client, player_token):
        """Игрок не может смотреть админку -> 403."""
        resp = core_client.get("/admin/stats", headers={"Authorization": f"Bearer {player_token}"})
        assert resp.status_code == 403
