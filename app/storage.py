"""Thread-safe persistent storage for TaskFlow tasks."""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Dict, List, Optional
import uuid

from app.models import Priority, Task, TaskCreate, TaskStats, TaskStatus, TaskUpdate

logger = logging.getLogger(__name__)

DEFAULT_DATA_PATH = Path("/var/home/gamumu/projects/TEST/data/tasks.json")


class TaskStorage:
    """Thread-safe in-memory task repository with JSON file persistence."""

    def __init__(self, file_path: Optional[Path | str] = None) -> None:
        self.file_path = Path(file_path) if file_path else DEFAULT_DATA_PATH
        self._lock = Lock()
        self._tasks: Dict[str, Task] = {}
        self._load()

    def _task_to_dict(self, task: Task) -> dict:
        """Serialize a Task model to a JSON-compatible dictionary."""
        if hasattr(task, "model_dump"):
            return task.model_dump(mode="json")
        return json.loads(task.json())

    def _dict_to_task(self, data: dict) -> Task:
        """Deserialize a dictionary to a Task model."""
        if hasattr(Task, "model_validate"):
            return Task.model_validate(data)
        return Task.parse_obj(data)

    def _load(self) -> None:
        """Load tasks from JSON file into memory."""
        with self._lock:
            if not self.file_path.exists():
                self._tasks = {}
                return

            try:
                with open(self.file_path, "r", encoding="utf-8") as f:
                    content = f.read().strip()
                    if not content:
                        self._tasks = {}
                        return
                    raw_list = json.loads(content)

                loaded_tasks: Dict[str, Task] = {}
                for item in raw_list:
                    task = self._dict_to_task(item)
                    loaded_tasks[task.id] = task

                self._tasks = loaded_tasks
                logger.info("Loaded %d tasks from %s", len(self._tasks), self.file_path)
            except Exception as e:
                logger.error("Error loading tasks from %s: %s", self.file_path, e)
                self._tasks = {}

    def _save(self) -> None:
        """Persist current tasks to JSON file atomically."""
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        raw_list = [self._task_to_dict(task) for task in self._tasks.values()]

        temp_path = self.file_path.with_suffix(".tmp")
        try:
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(raw_list, f, ensure_ascii=False, indent=2)
            temp_path.replace(self.file_path)
        except Exception as e:
            logger.error("Error saving tasks to %s: %s", self.file_path, e)
            if temp_path.exists():
                temp_path.unlink(missing_ok=True)
            raise

    def get_all(
        self,
        status: Optional[TaskStatus] = None,
        priority: Optional[Priority] = None,
        search: Optional[str] = None,
    ) -> List[Task]:
        """Retrieve tasks matching optional status, priority, and search filters."""
        with self._lock:
            tasks = list(self._tasks.values())

        if status is not None:
            tasks = [t for t in tasks if t.status == status]

        if priority is not None:
            tasks = [t for t in tasks if t.priority == priority]

        if search:
            query = search.strip().lower()
            tasks = [
                t for t in tasks
                if query in t.title.lower() or (t.description and query in t.description.lower())
            ]

        tasks.sort(key=lambda t: t.created_at, reverse=True)
        return tasks

    def get_by_id(self, task_id: str) -> Optional[Task]:
        """Retrieve a single task by ID."""
        with self._lock:
            return self._tasks.get(task_id)

    def create(self, task_create: TaskCreate) -> Task:
        """Create and persist a new task."""
        now = datetime.now(timezone.utc)
        task_id = str(uuid.uuid4())

        task = Task(
            id=task_id,
            title=task_create.title.strip(),
            description=task_create.description.strip() if task_create.description else None,
            status=task_create.status,
            priority=task_create.priority,
            created_at=now,
            updated_at=now,
        )

        with self._lock:
            self._tasks[task.id] = task
            self._save()

        return task

    def update(self, task_id: str, task_update: TaskUpdate) -> Optional[Task]:
        """Update an existing task and save changes."""
        with self._lock:
            existing_task = self._tasks.get(task_id)
            if not existing_task:
                return None

            update_data = (
                task_update.model_dump(exclude_unset=True)
                if hasattr(task_update, "model_dump")
                else task_update.dict(exclude_unset=True)
            )

            task_dict = self._task_to_dict(existing_task)
            task_dict.update(update_data)
            task_dict["updated_at"] = datetime.now(timezone.utc).isoformat()

            updated_task = self._dict_to_task(task_dict)
            self._tasks[task_id] = updated_task
            self._save()

            return updated_task

    def delete(self, task_id: str) -> bool:
        """Delete a task by ID. Returns True if deleted, False if not found."""
        with self._lock:
            if task_id not in self._tasks:
                return False
            del self._tasks[task_id]
            self._save()
            return True

    def get_stats(self) -> TaskStats:
        """Compute aggregate counts by status."""
        with self._lock:
            total = len(self._tasks)
            todo = sum(1 for t in self._tasks.values() if t.status == TaskStatus.todo)
            in_progress = sum(1 for t in self._tasks.values() if t.status == TaskStatus.in_progress)
            done = sum(1 for t in self._tasks.values() if t.status == TaskStatus.done)

        return TaskStats(
            total=total,
            todo=todo,
            in_progress=in_progress,
            done=done,
        )
