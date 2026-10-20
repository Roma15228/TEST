"""FastAPI application for TaskFlow API."""

from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from app.models import Priority, Task, TaskCreate, TaskStats, TaskStatus, TaskUpdate
from app.storage import TaskStorage

# Initialize FastAPI application
app = FastAPI(
    title="TaskFlow API",
    version="1.0.0",
    description="Modern Agile Task & Sprint Management API",
)

# CORS middleware for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global storage instance
storage_instance = TaskStorage()


def get_storage() -> TaskStorage:
    """Dependency provider for TaskStorage."""
    return storage_instance


# ---------------- API ENDPOINTS ----------------

@app.get(
    "/api/tasks",
    response_model=List[Task],
    summary="Get tasks list",
    tags=["tasks"],
)
def get_tasks(
    status: Optional[TaskStatus] = Query(None, description="Filter by status (todo, in_progress, done)"),
    priority: Optional[Priority] = Query(None, description="Filter by priority (low, medium, high)"),
    search: Optional[str] = Query(None, description="Search term for title or description"),
    storage: TaskStorage = Depends(get_storage),
) -> List[Task]:
    """Retrieve all tasks with optional filtering by status, priority, or search term."""
    return storage.get_all(status=status, priority=priority, search=search)


@app.post(
    "/api/tasks",
    response_model=Task,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new task",
    tags=["tasks"],
)
def create_task(
    task_in: TaskCreate,
    storage: TaskStorage = Depends(get_storage),
) -> Task:
    """Create a new task and persist it."""
    return storage.create(task_in)


@app.get(
    "/api/tasks/{task_id}",
    response_model=Task,
    summary="Get task by ID",
    tags=["tasks"],
)
def get_task(
    task_id: str,
    storage: TaskStorage = Depends(get_storage),
) -> Task:
    """Retrieve details of a single task by ID."""
    task = storage.get_by_id(task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with id '{task_id}' not found",
        )
    return task


@app.put(
    "/api/tasks/{task_id}",
    response_model=Task,
    summary="Update task",
    tags=["tasks"],
)
def update_task(
    task_id: str,
    task_update: TaskUpdate,
    storage: TaskStorage = Depends(get_storage),
) -> Task:
    """Update fields of an existing task."""
    updated = storage.update(task_id, task_update)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with id '{task_id}' not found",
        )
    return updated


@app.delete(
    "/api/tasks/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete task",
    tags=["tasks"],
)
def delete_task(
    task_id: str,
    storage: TaskStorage = Depends(get_storage),
) -> Response:
    """Delete a task by ID."""
    deleted = storage.delete(task_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with id '{task_id}' not found",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get(
    "/api/stats",
    response_model=TaskStats,
    summary="Get task statistics",
    tags=["stats"],
)
def get_stats(
    storage: TaskStorage = Depends(get_storage),
) -> TaskStats:
    """Get aggregate counts of tasks by status."""
    return storage.get_stats()


@app.get(
    "/api/health",
    summary="Health check",
    tags=["system"],
)
def health_check() -> dict:
    """Health check endpoint."""
    return {"status": "ok"}


# ---------------- STATIC FILES MOUNTING ----------------

STATIC_DIR = Path("/var/home/gamumu/projects/TEST/app/static")
STATIC_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
