"""Comprehensive API tests for TaskFlow application."""

from typing import Dict, Any
import pytest
from fastapi.testclient import TestClient


# ============================================================================
# 1. СИСТЕМНЫЕ ЭНДПОИНТЫ И ЗДОРОВЬЕ
# ============================================================================

class TestSystemEndpoints:
    """Tests for system and health endpoints."""

    def test_health_check(self, client: TestClient) -> None:
        """Verify GET /api/health returns 200 OK and valid status."""
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data == {"status": "ok"}


# ============================================================================
# 2. ПОЛНЫЙ ЖИЗНЕННЫЙ ЦИКЛ CRUD
# ============================================================================

class TestTaskCRUD:
    """Tests for Create, Read, Update, Delete task operations."""

    def test_create_task_minimal(self, client: TestClient) -> None:
        """Verify task creation with required fields and default values."""
        payload = {"title": "Реализовать авторизацию"}
        response = client.post("/api/tasks", json=payload)

        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert data["title"] == "Реализовать авторизацию"
        assert data["description"] is None
        assert data["status"] == "todo"
        assert data["priority"] == "medium"
        assert "created_at" in data
        assert "updated_at" in data

    def test_create_task_full(self, client: TestClient) -> None:
        """Verify task creation with explicit custom fields."""
        payload = {
            "title": "Настроить CI/CD",
            "description": "Конфигурация GitHub Actions для линтинга и тестов",
            "priority": "high",
            "status": "in_progress",
        }
        response = client.post("/api/tasks", json=payload)

        assert response.status_code == 201
        data = response.json()
        assert data["title"] == payload["title"]
        assert data["description"] == payload["description"]
        assert data["priority"] == "high"
        assert data["status"] == "in_progress"

    def test_get_task_by_id(self, client: TestClient) -> None:
        """Verify retrieving an existing task by its ID."""
        create_res = client.post("/api/tasks", json={"title": "Задача для чтения"})
        task_id = create_res.json()["id"]

        response = client.get(f"/api/tasks/{task_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == task_id
        assert data["title"] == "Задача для чтения"

    def test_update_task_fields(self, client: TestClient) -> None:
        """Verify updating task title and description."""
        create_res = client.post("/api/tasks", json={"title": "Старый заголовок"})
        task_id = create_res.json()["id"]

        update_payload = {
            "title": "Обновленный заголовок",
            "description": "Добавлено описание",
            "priority": "low",
        }
        response = client.put(f"/api/tasks/{task_id}", json=update_payload)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == task_id
        assert data["title"] == "Обновленный заголовок"
        assert data["description"] == "Добавлено описание"
        assert data["priority"] == "low"

    def test_update_task_lifecycle_transitions(self, client: TestClient) -> None:
        """Verify task progression: todo -> in_progress -> done."""
        create_res = client.post("/api/tasks", json={"title": "Жизненный цикл задачи"})
        task_id = create_res.json()["id"]
        assert create_res.json()["status"] == "todo"

        # Переход в in_progress
        res1 = client.put(f"/api/tasks/{task_id}", json={"status": "in_progress"})
        assert res1.status_code == 200
        assert res1.json()["status"] == "in_progress"

        # Переход в done
        res2 = client.put(f"/api/tasks/{task_id}", json={"status": "done"})
        assert res2.status_code == 200
        assert res2.json()["status"] == "done"

    def test_delete_task(self, client: TestClient) -> None:
        """Verify task deletion and subsequent 404 response."""
        create_res = client.post("/api/tasks", json={"title": "Задача под удаление"})
        task_id = create_res.json()["id"]

        # Удаление
        delete_res = client.delete(f"/api/tasks/{task_id}")
        assert delete_res.status_code == 204

        # Проверка отсутствия
        get_res = client.get(f"/api/tasks/{task_id}")
        assert get_res.status_code == 404


# ============================================================================
# 3. СТАТИСТИКА ЗАДАЧ (/api/stats)
# ============================================================================

class TestTaskStats:
    """Tests for aggregate metrics calculation."""

    def test_stats_empty_board(self, client: TestClient) -> None:
        """Verify stats on empty storage."""
        response = client.get("/api/stats")
        assert response.status_code == 200
        data = response.json()
        assert data == {
            "total": 0,
            "todo": 0,
            "in_progress": 0,
            "done": 0,
        }

    def test_stats_counts_distribution(self, client: TestClient) -> None:
        """Verify stats properly counts tasks across all statuses."""
        client.post("/api/tasks", json={"title": "T1", "status": "todo"})
        client.post("/api/tasks", json={"title": "T2", "status": "todo"})
        client.post("/api/tasks", json={"title": "T3", "status": "in_progress"})
        client.post("/api/tasks", json={"title": "T4", "status": "done"})

        response = client.get("/api/stats")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 4
        assert data["todo"] == 2
        assert data["in_progress"] == 1
        assert data["done"] == 1


# ============================================================================
# 4. ФИЛЬТРАЦИЯ И ПОИСК (/api/tasks)
# ============================================================================

class TestTaskFiltering:
    """Tests for task search and filter parameters."""

    @pytest.fixture(autouse=True)
    def setup_tasks(self, client: TestClient) -> None:
        """Pre-populate tasks with diverse attributes."""
        client.post("/api/tasks", json={"title": "Backend API", "description": "FastAPI auth", "status": "todo", "priority": "high"})
        client.post("/api/tasks", json={"title": "Frontend UI", "description": "React layout", "status": "in_progress", "priority": "medium"})
        client.post("/api/tasks", json={"title": "QA Tests", "description": "Pytest suites", "status": "done", "priority": "low"})
        client.post("/api/tasks", json={"title": "Documentation", "description": "API swagger docs", "status": "todo", "priority": "medium"})

    def test_filter_by_status(self, client: TestClient) -> None:
        """Filter tasks by status."""
        response = client.get("/api/tasks?status=todo")
        assert response.status_code == 200
        tasks = response.json()
        assert len(tasks) == 2
        assert all(t["status"] == "todo" for t in tasks)

    def test_filter_by_priority(self, client: TestClient) -> None:
        """Filter tasks by priority."""
        response = client.get("/api/tasks?priority=medium")
        assert response.status_code == 200
        tasks = response.json()
        assert len(tasks) == 2
        assert all(t["priority"] == "medium" for t in tasks)

    def test_filter_by_search_query_title(self, client: TestClient) -> None:
        """Search tasks by keyword in title."""
        response = client.get("/api/tasks?search=Backend")
        assert response.status_code == 200
        tasks = response.json()
        assert len(tasks) == 1
        assert tasks[0]["title"] == "Backend API"

    def test_filter_by_search_query_description(self, client: TestClient) -> None:
        """Search tasks by keyword in description (case-insensitive)."""
        response = client.get("/api/tasks?search=pytest")
        assert response.status_code == 200
        tasks = response.json()
        assert len(tasks) == 1
        assert tasks[0]["title"] == "QA Tests"

    def test_filter_combined(self, client: TestClient) -> None:
        """Combine status, priority, and search filters."""
        response = client.get("/api/tasks?status=todo&priority=medium&search=docs")
        assert response.status_code == 200
        tasks = response.json()
        assert len(tasks) == 1
        assert tasks[0]["title"] == "Documentation"


# ============================================================================
# 5. ГРАНИЧНЫЕ СЦЕНАРИИ И ОБРАБОТКА ОШИБОК
# ============================================================================

class TestEdgeAndErrorCases:
    """Tests for edge cases, non-existent entities, and 422 validations."""

    def test_get_nonexistent_task_returns_404(self, client: TestClient) -> None:
        """Verify 404 Not Found on unknown task ID."""
        response = client.get("/api/tasks/unknown-uuid-12345")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_update_nonexistent_task_returns_404(self, client: TestClient) -> None:
        """Verify 404 Not Found when updating unknown task ID."""
        response = client.put("/api/tasks/unknown-uuid-12345", json={"title": "Новый"})
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_delete_nonexistent_task_returns_404(self, client: TestClient) -> None:
        """Verify 404 Not Found when deleting unknown task ID."""
        response = client.delete("/api/tasks/unknown-uuid-12345")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_create_task_empty_title_returns_422(self, client: TestClient) -> None:
        """Verify 422 Unprocessable Entity when title is empty string (min_length=1)."""
        response = client.post("/api/tasks", json={"title": ""})
        assert response.status_code == 422

    def test_create_task_missing_title_returns_422(self, client: TestClient) -> None:
        """Verify 422 Unprocessable Entity when title field is completely omitted."""
        response = client.post("/api/tasks", json={"description": "Только описание"})
        assert response.status_code == 422

    def test_create_task_invalid_status_returns_422(self, client: TestClient) -> None:
        """Verify 422 Unprocessable Entity on invalid status enum value."""
        payload = {"title": "Тест", "status": "not_a_valid_status"}
        response = client.post("/api/tasks", json=payload)
        assert response.status_code == 422

    def test_create_task_invalid_priority_returns_422(self, client: TestClient) -> None:
        """Verify 422 Unprocessable Entity on invalid priority enum value."""
        payload = {"title": "Тест", "priority": "super_urgent"}
        response = client.post("/api/tasks", json=payload)
        assert response.status_code == 422

    def test_query_filter_invalid_enum_returns_422(self, client: TestClient) -> None:
        """Verify 422 Unprocessable Entity when query param has invalid enum value."""
        response = client.get("/api/tasks?status=invalid_status_filter")
        assert response.status_code == 422


# ============================================================================
# 6. РАЗДАЧА СТАТИКИ И ФРОНТЕНДА
# ============================================================================

class TestFrontendServing:
    """Tests for root SPA static serving."""

    def test_root_endpoint_serves_html(self, client: TestClient) -> None:
        """Verify GET / returns 200 OK and HTML document with TaskFlow branding."""
        response = client.get("/")
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")
        assert "TaskFlow" in response.text
        assert "Smart Agile Board" in response.text
