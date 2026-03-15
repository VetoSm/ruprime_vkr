"""
Тесты Auth-сервиса.

Запуск:
    docker compose exec auth pip install pytest httpx
    docker compose exec auth pytest tests/ -v

Или локально (при запущенных сервисах):
    pip install pytest httpx
    pytest services/auth/tests/ -v
"""

import pytest
import httpx

BASE = "http://localhost:8001"


@pytest.fixture(scope="module")
def client():
    return httpx.Client(base_url=BASE, timeout=10)


# ---- Регистрация ----

class TestRegister:
    def test_register_player(self, client):
        """Регистрация нового игрока."""
        resp = client.post("/auth/register", json={
            "login": "test_player_new",
            "email": "newplayer@test.com",
            "password": "testpass123",
            "confirm_password": "testpass123",
            "role": "PLAYER",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["email"] == "newplayer@test.com"
        assert data["role"] == "PLAYER"
        assert data["is_active"] is True

    def test_register_coach(self, client):
        """Регистрация нового тренера."""
        resp = client.post("/auth/register", json={
            "login": "test_coach_new",
            "email": "newcoach@test.com",
            "password": "testpass123",
            "confirm_password": "testpass123",
            "role": "COACH",
        })
        assert resp.status_code == 201
        assert resp.json()["role"] == "COACH"

    def test_register_duplicate_email(self, client):
        """Дубликат email -> 409."""
        client.post("/auth/register", json={
            "login": "dup_test1",
            "email": "dup@test.com",
            "password": "testpass123",
            "confirm_password": "testpass123",
            "role": "PLAYER",
        })
        resp = client.post("/auth/register", json={
            "login": "dup_test2",
            "email": "dup@test.com",
            "password": "testpass123",
            "confirm_password": "testpass123",
            "role": "PLAYER",
        })
        assert resp.status_code == 409

    def test_register_password_mismatch(self, client):
        """Пароли не совпадают -> 400."""
        resp = client.post("/auth/register", json={
            "login": "mismatch_test",
            "email": "mismatch@test.com",
            "password": "testpass123",
            "confirm_password": "different123",
            "role": "PLAYER",
        })
        assert resp.status_code == 400

    def test_register_short_password(self, client):
        """Короткий пароль -> 422."""
        resp = client.post("/auth/register", json={
            "login": "short_test",
            "email": "short@test.com",
            "password": "123",
            "confirm_password": "123",
            "role": "PLAYER",
        })
        assert resp.status_code == 422


# ---- Логин ----

class TestLogin:
    def test_login_success(self, client):
        """Успешный логин тестового аккаунта."""
        resp = client.post("/auth/login", json={
            "email": "admin@dota.coach",
            "password": "admin1234",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, client):
        """Неверный пароль -> 401."""
        resp = client.post("/auth/login", json={
            "email": "admin@dota.coach",
            "password": "wrongpassword",
        })
        assert resp.status_code == 401

    def test_login_nonexistent_email(self, client):
        """Несуществующий email -> 401."""
        resp = client.post("/auth/login", json={
            "email": "nobody@test.com",
            "password": "testpass123",
        })
        assert resp.status_code == 401


# ---- /auth/me ----

class TestMe:
    def _get_token(self, client):
        resp = client.post("/auth/login", json={"email": "admin@dota.coach", "password": "admin1234"})
        return resp.json()["access_token"]

    def test_me_success(self, client):
        """Получение текущего пользователя по токену."""
        token = self._get_token(client)
        resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "admin@dota.coach"
        assert data["role"] == "ADMIN"

    def test_me_no_token(self, client):
        """Без токена -> 401."""
        resp = client.get("/auth/me")
        assert resp.status_code == 401

    def test_me_invalid_token(self, client):
        """Невалидный токен -> 401."""
        resp = client.get("/auth/me", headers={"Authorization": "Bearer invalid_token_123"})
        assert resp.status_code == 401


# ---- Refresh ----

class TestRefresh:
    def test_refresh_success(self, client):
        """Обновление токена по refresh."""
        login_resp = client.post("/auth/login", json={"email": "player@test.com", "password": "player1234"})
        refresh_token = login_resp.json()["refresh_token"]
        resp = client.post("/auth/refresh", json={"refresh_token": refresh_token})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_refresh_invalid(self, client):
        """Невалидный refresh -> 401."""
        resp = client.post("/auth/refresh", json={"refresh_token": "invalid_token"})
        assert resp.status_code == 401


# ---- Logout ----

class TestLogout:
    def test_logout(self, client):
        """Логаут отзывает refresh-токен."""
        login_resp = client.post("/auth/login", json={"email": "player@test.com", "password": "player1234"})
        data = login_resp.json()
        token = data["access_token"]
        refresh = data["refresh_token"]

        resp = client.post("/auth/logout",
            json={"refresh_token": refresh},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

        # Old refresh should fail
        resp2 = client.post("/auth/refresh", json={"refresh_token": refresh})
        assert resp2.status_code == 401


# ---- Steam link ----

class TestSteamLink:
    def test_link_steam(self, client):
        """Привязка Steam аккаунта."""
        login_resp = client.post("/auth/login", json={"email": "player@test.com", "password": "player1234"})
        token = login_resp.json()["access_token"]

        resp = client.post("/auth/link-steam",
            json={"steam_token": "76561198099999999"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["linked"] is True


# ---- Health ----

class TestHealth:
    def test_health(self, client):
        """Health check."""
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["service"] == "auth"
