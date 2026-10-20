"""Data models and Enums for TaskFlow."""

from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class TaskStatus(str, Enum):
    """Enumeration of possible task statuses."""
    todo = "todo"
    in_progress = "in_progress"
    done = "done"


class Priority(str, Enum):
    """Enumeration of task priority levels."""
    low = "low"
    medium = "medium"
    high = "high"


class TaskBase(BaseModel):
    """Base schema for tasks with common fields."""
    title: str = Field(..., min_length=1, max_length=200, description="Task title")
    description: Optional[str] = Field(None, max_length=2000, description="Optional task description")
    priority: Priority = Field(default=Priority.medium, description="Priority level")


class TaskCreate(TaskBase):
    """Schema for creating a new task."""
    status: TaskStatus = Field(default=TaskStatus.todo, description="Initial task status")


class TaskUpdate(BaseModel):
    """Schema for updating an existing task. All fields are optional."""
    title: Optional[str] = Field(None, min_length=1, max_length=200, description="Updated task title")
    description: Optional[str] = Field(None, max_length=2000, description="Updated description")
    status: Optional[TaskStatus] = Field(None, description="Updated status")
    priority: Optional[Priority] = Field(None, description="Updated priority")


class Task(TaskBase):
    """Complete Task model with system-generated metadata."""
    id: str = Field(..., description="Unique task identifier (UUID)")
    status: TaskStatus = Field(default=TaskStatus.todo, description="Current task status")
    created_at: datetime = Field(..., description="Creation timestamp in UTC")
    updated_at: datetime = Field(..., description="Last modification timestamp in UTC")


class TaskStats(BaseModel):
    """Aggregate statistics for tasks."""
    total: int = Field(default=0, description="Total number of tasks")
    todo: int = Field(default=0, description="Number of tasks in 'todo' status")
    in_progress: int = Field(default=0, description="Number of tasks in 'in_progress' status")
    done: int = Field(default=0, description="Number of tasks in 'done' status")
