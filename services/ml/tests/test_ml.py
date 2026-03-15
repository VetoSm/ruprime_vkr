"""
Тесты ML-сервиса.

Запуск (при запущенных docker-контейнерах):
    pip install pytest httpx
    pytest services/ml/tests/ -v
"""

import pytest
import httpx

BASE = "http://localhost:8003"


@pytest.fixture(scope="module")
def client():
    return httpx.Client(base_url=BASE, timeout=30)


class TestHealth:
    def test_health(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["service"] == "ml"


class TestConstants:
    def test_load_constants(self, client):
        """Загрузка констант из CSV."""
        resp = client.post("/ml/admin/load-constants")
        assert resp.status_code == 200
        data = resp.json()
        assert data["heroes_loaded"] > 0
        assert data["items_loaded"] > 0

    def test_list_heroes(self, client):
        """Список героев после загрузки констант."""
        # Ensure constants loaded
        client.post("/ml/admin/load-constants")
        resp = client.get("/ml/heroes")
        assert resp.status_code == 200
        heroes = resp.json()
        assert len(heroes) > 100  # ~128 heroes


class TestImport:
    def test_import_status(self, client):
        """Статус импорта."""
        resp = client.get("/ml/admin/import-status")
        assert resp.status_code == 200
        assert "running" in resp.json()


class TestAnalysis:
    def test_analyze_unknown_player(self, client):
        """Анализ несуществующего игрока -> минимальный анализ."""
        resp = client.get("/ml/analyze-player/999999999")
        assert resp.status_code == 200
        data = resp.json()
        assert data["summary"]["games_analyzed"] == 0


class TestMatching:
    def test_match_coaches_no_data(self, client):
        """Матчинг тренеров без данных игрока."""
        resp = client.post("/ml/match-coaches", json={
            "player_profile": {
                "player_profile_id": 1,
                "desired_rank_tier": "ANCIENT",
                "desired_roles": ["POS2"],
            },
            "request": {
                "desired_role": "POS2",
                "focus_area": "lane_control",
                "use_ai_coach": True,
            },
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "ml_analysis_id" in data
        assert len(data["recommended_coaches"]) > 0
        assert data["ai_coach_suggestion"] is not None
