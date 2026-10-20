"""Pytest fixtures and configuration for TaskFlow test suite."""

from pathlib import Path
from typing import Generator
import pytest
from fastapi.testclient import TestClient

from app.main import app, get_storage
from app.storage import TaskStorage


@pytest.fixture
def temp_storage_file(tmp_path: Path) -> Path:
    """Fixture providing a clean temporary JSON file path for each test."""
    file_path = tmp_path / "test_tasks.json"
    return file_path


@pytest.fixture
def test_storage(temp_storage_file: Path) -> TaskStorage:
    """Fixture providing an isolated TaskStorage instance with temp file."""
    return TaskStorage(file_path=temp_storage_file)


@pytest.fixture
def client(test_storage: TaskStorage) -> Generator[TestClient, None, None]:
    """
    TestClient fixture with dependency override for get_storage,
    ensuring total isolation between test runs and preventing data mutation in production.
    """
    app.dependency_overrides[get_storage] = lambda: test_storage
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
