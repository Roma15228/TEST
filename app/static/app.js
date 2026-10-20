/**
 * TaskFlow — Single Page Application (SPA) Controller
 * Чистый Vanilla JavaScript (ES6+), без внешних фреймворков.
 */

(() => {
  'use strict';

  // --- Конфигурация API ---
  const API_CONFIG = {
    BASE_URL: '/api',
    ENDPOINTS: {
      TASKS: '/api/tasks',
      STATS: '/api/stats'
    }
  };

  // --- Состояние приложения (State) ---
  const state = {
    tasks: [],
    stats: {
      total: 0,
      todo: 0,
      in_progress: 0,
      done: 0
    },
    filters: {
      status: 'all',     // 'all' | 'todo' | 'in_progress' | 'done'
      priority: 'all',   // 'all' | 'low' | 'medium' | 'high'
      search: ''
    },
    viewMode: 'kanban',  // 'kanban' | 'list'
    theme: localStorage.getItem('taskflow_theme') || 'dark',
    taskToDeleteId: null,
    editingTaskId: null
  };

  // --- Селекторы DOM-элементов ---
  const DOM = {
    // Статистика
    statTotal: document.getElementById('stat-total'),
    statTodo: document.getElementById('stat-todo'),
    statProgress: document.getElementById('stat-progress'),
    statDone: document.getElementById('stat-done'),
    
    // Счетчики колонок
    countTodo: document.getElementById('count-todo'),
    countProgress: document.getElementById('count-progress'),
    countDone: document.getElementById('count-done'),

    // Контейнеры доски и списка
    boardContainer: document.getElementById('board-container'),
    listContainer: document.getElementById('list-container'),
    listTasksBody: document.getElementById('list-tasks-body'),
    colTodoTasks: document.getElementById('col-todo-tasks'),
    colProgressTasks: document.getElementById('col-progress-tasks'),
    colDoneTasks: document.getElementById('col-done-tasks'),
    emptyState: document.getElementById('empty-state'),
    loadingSpinner: document.getElementById('loading-spinner'),

    // Панель управления
    searchInput: document.getElementById('search-input'),
    btnClearSearch: document.getElementById('btn-clear-search'),
    statusFilterTabs: document.querySelectorAll('.filter-tab'),
    priorityFilter: document.getElementById('priority-filter'),
    viewKanbanBtn: document.getElementById('view-kanban-btn'),
    viewListBtn: document.getElementById('view-list-btn'),
    btnCreateTask: document.getElementById('btn-create-task'),
    btnEmptyCreate: document.getElementById('btn-empty-create'),

    // Тема оформления
    themeToggleBtn: document.getElementById('theme-toggle'),
    themeIconSun: document.getElementById('theme-icon-sun'),
    themeIconMoon: document.getElementById('theme-icon-moon'),

    // Модальное окно задачи
    taskModal: document.getElementById('task-modal'),
    modalTitle: document.getElementById('modal-title'),
    taskForm: document.getElementById('task-form'),
    formTaskId: document.getElementById('form-task-id'),
    formTaskTitle: document.getElementById('form-task-title'),
    formTaskDescription: document.getElementById('form-task-description'),
    formTaskPriority: document.getElementById('form-task-priority'),
    formTaskStatus: document.getElementById('form-task-status'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    btnCancelModal: document.getElementById('btn-cancel-modal'),
    titleError: document.getElementById('title-error'),

    // Модальное окно подтверждения удаления
    confirmModal: document.getElementById('confirm-modal'),
    confirmModalText: document.getElementById('confirm-modal-text'),
    btnCancelDelete: document.getElementById('btn-cancel-delete'),
    btnConfirmDelete: document.getElementById('btn-confirm-delete'),

    // Тосты
    toastContainer: document.getElementById('toast-container')
  };

  // --- API Клиент (Data Layer) ---
  const API = {
    async request(url, options = {}) {
      try {
        const response = await fetch(url, {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...(options.headers || {})
          },
          ...options
        });

        if (!response.ok) {
          let errorMsg = `Ошибка сервера (${response.status})`;
          try {
            const errData = await response.json();
            if (errData.detail) {
              errorMsg = Array.isArray(errData.detail)
                ? errData.detail.map(d => d.msg || d).join(', ')
                : errData.detail;
            }
          } catch (_) {}
          throw new Error(errorMsg);
        }

        // Если ответ пустой (например 204 No Content при DELETE)
        if (response.status === 204) return null;
        return await response.json();
      } catch (err) {
        console.error(`API Error [${url}]:`, err);
        throw err;
      }
    },

    async fetchStats() {
      return await this.request(API_CONFIG.ENDPOINTS.STATS);
    },

    async fetchTasks(params = {}) {
      const query = new URLSearchParams();
      if (params.status && params.status !== 'all') query.append('status', params.status);
      if (params.search) query.append('search', params.search);
      const url = query.toString()
        ? `${API_CONFIG.ENDPOINTS.TASKS}?${query.toString()}`
        : API_CONFIG.ENDPOINTS.TASKS;
      return await this.request(url);
    },

    async createTask(data) {
      return await this.request(API_CONFIG.ENDPOINTS.TASKS, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    async updateTask(id, data) {
      return await this.request(`${API_CONFIG.ENDPOINTS.TASKS}/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },

    async deleteTask(id) {
      return await this.request(`${API_CONFIG.ENDPOINTS.TASKS}/${id}`, {
        method: 'DELETE'
      });
    }
  };

  // --- Утилиты ---
  const Utils = {
    escapeHtml(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },

    debounce(func, wait) {
      let timeout;
      return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
      };
    },

    formatDate(dateStr) {
      if (!dateStr) return '';
      try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
      } catch (_) {
        return '';
      }
    },

    normalizeStatus(status) {
      if (!status) return 'todo';
      const s = String(status).toLowerCase().replace(/[\s-]/g, '_');
      if (s === 'todo' || s === 'to_do') return 'todo';
      if (s === 'inprogress' || s === 'in_progress') return 'in_progress';
      if (s === 'done' || s === 'completed') return 'done';
      return 'todo';
    },

    normalizePriority(p) {
      if (!p) return 'medium';
      const norm = String(p).toLowerCase();
      if (['high', 'medium', 'low'].includes(norm)) return norm;
      return 'medium';
    }
  };

  // --- Всплывающие уведомления (Toast) ---
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    } else {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = `
      <span class="toast-icon">${iconSvg}</span>
      <span class="toast-msg">${Utils.escapeHtml(message)}</span>
    `;

    DOM.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

  // --- Управление темой (Dark / Light) ---
  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('taskflow_theme', theme);

    if (theme === 'light') {
      DOM.themeIconSun.classList.add('hidden');
      DOM.themeIconMoon.classList.remove('hidden');
    } else {
      DOM.themeIconSun.classList.remove('hidden');
      DOM.themeIconMoon.classList.add('hidden');
    }
  }

  function toggleTheme() {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  }

  // --- Загрузка и рендеринг данных ---
  async function loadData() {
    DOM.loadingSpinner.classList.remove('hidden');
    try {
      const [statsData, tasksData] = await Promise.all([
        API.fetchStats().catch(err => {
          console.warn('Не удалось загрузить /api/stats, вычисляем локально:', err);
          return null;
        }),
        API.fetchTasks({
          status: state.filters.status,
          search: state.filters.search
        })
      ]);

      state.tasks = Array.isArray(tasksData) ? tasksData : (tasksData.items || []);
      
      // Обновляем статистику
      if (statsData) {
        state.stats = {
          total: statsData.total ?? statsData.all ?? 0,
          todo: statsData.todo ?? statsData.to_do ?? 0,
          in_progress: statsData.in_progress ?? statsData.progress ?? 0,
          done: statsData.done ?? statsData.completed ?? 0
        };
      } else {
        // Локальный подсчет, если эндпоинт stats недоступен
        state.stats = {
          total: state.tasks.length,
          todo: state.tasks.filter(t => Utils.normalizeStatus(t.status) === 'todo').length,
          in_progress: state.tasks.filter(t => Utils.normalizeStatus(t.status) === 'in_progress').length,
          done: state.tasks.filter(t => Utils.normalizeStatus(t.status) === 'done').length
        };
      }

      renderStats();
      renderTasks();
    } catch (err) {
      showToast(err.message || 'Ошибка загрузки данных', 'error');
    } finally {
      DOM.loadingSpinner.classList.add('hidden');
    }
  }

  // Отображение счетчиков
  function renderStats() {
    DOM.statTotal.textContent = state.stats.total;
    DOM.statTodo.textContent = state.stats.todo;
    DOM.statProgress.textContent = state.stats.in_progress;
    DOM.statDone.textContent = state.stats.done;
  }

  // Фильтрация задач на клиенте (по приоритету и поиску, если бэкенд отдал полный список)
  function getFilteredTasks() {
    let filtered = [...state.tasks];

    // Статус
    if (state.filters.status !== 'all') {
      filtered = filtered.filter(t => Utils.normalizeStatus(t.status) === state.filters.status);
    }

    // Приоритет
    if (state.filters.priority !== 'all') {
      filtered = filtered.filter(t => Utils.normalizePriority(t.priority) === state.filters.priority);
    }

    // Поиск
    if (state.filters.search.trim()) {
      const q = state.filters.search.toLowerCase().trim();
      filtered = filtered.filter(t => {
        const title = (t.title || '').toLowerCase();
        const desc = (t.description || '').toLowerCase();
        return title.includes(q) || desc.includes(q);
      });
    }

    return filtered;
  }

  // Рендеринг карточек
  function renderTasks() {
    const filtered = getFilteredTasks();

    const todoTasks = filtered.filter(t => Utils.normalizeStatus(t.status) === 'todo');
    const progressTasks = filtered.filter(t => Utils.normalizeStatus(t.status) === 'in_progress');
    const doneTasks = filtered.filter(t => Utils.normalizeStatus(t.status) === 'done');

    // Обновляем бейджи колонок
    DOM.countTodo.textContent = todoTasks.length;
    DOM.countProgress.textContent = progressTasks.length;
    DOM.countDone.textContent = doneTasks.length;

    // Очищаем колонки
    DOM.colTodoTasks.innerHTML = '';
    DOM.colProgressTasks.innerHTML = '';
    DOM.colDoneTasks.innerHTML = '';
    DOM.listTasksBody.innerHTML = '';

    // Пустое состояние
    if (filtered.length === 0) {
      DOM.emptyState.classList.remove('hidden');
    } else {
      DOM.emptyState.classList.add('hidden');
    }

    if (state.viewMode === 'kanban') {
      todoTasks.forEach(task => DOM.colTodoTasks.appendChild(createTaskCardElement(task)));
      progressTasks.forEach(task => DOM.colProgressTasks.appendChild(createTaskCardElement(task)));
      doneTasks.forEach(task => DOM.colDoneTasks.appendChild(createTaskCardElement(task)));
    } else {
      filtered.forEach(task => DOM.listTasksBody.appendChild(createTaskCardElement(task, true)));
    }
  }

  // Генерация DOM карточки задачи
  function createTaskCardElement(task, isListView = false) {
    const card = document.createElement('div');
    card.className = `task-card ${isListView ? 'task-card-list' : ''}`;
    card.dataset.id = task.id;

    const normStatus = Utils.normalizeStatus(task.status);
    const normPriority = Utils.normalizePriority(task.priority);

    // Подписи приоритетов
    const priorityLabels = {
      high: 'Высокий',
      medium: 'Средний',
      low: 'Низкий'
    };

    // Кнопка быстрого изменения статуса
    let nextStatusAction = '';
    if (normStatus === 'todo') {
      nextStatusAction = `
        <button class="btn-quick-status" data-action="set-status" data-next="in_progress" title="Взять в работу">
          В работу <span>&rarr;</span>
        </button>
      `;
    } else if (normStatus === 'in_progress') {
      nextStatusAction = `
        <button class="btn-quick-status" data-action="set-status" data-next="done" title="Завершить задачу">
          Готово <span>&#10003;</span>
        </button>
      `;
    } else if (normStatus === 'done') {
      nextStatusAction = `
        <button class="btn-quick-status" data-action="set-status" data-next="in_progress" title="Вернуть в работу">
          <span>&larr;</span> В работу
        </button>
      `;
    }

    const dateFormatted = task.created_at ? Utils.formatDate(task.created_at) : '';

    card.innerHTML = `
      <div class="card-top">
        <div class="badges-group">
          <span class="badge badge-priority-${normPriority}">${priorityLabels[normPriority]}</span>
          ${isListView ? `<span class="badge badge-status-${normStatus}">${normStatus.replace('_', ' ')}</span>` : ''}
        </div>
        <div class="card-actions">
          <button class="btn-card-action" data-action="edit" title="Редактировать">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="btn-card-action danger" data-action="delete" title="Удалить">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
      <h3 class="task-title">${Utils.escapeHtml(task.title)}</h3>
      ${task.description ? `<p class="task-desc">${Utils.escapeHtml(task.description)}</p>` : ''}
      <div class="card-footer">
        <span class="task-date">${dateFormatted}</span>
        <div class="card-quick-actions">
          ${nextStatusAction}
        </div>
      </div>
    `;

    // Обработчики кликов на карточке
    card.addEventListener('click', (e) => {
      const targetBtn = e.target.closest('button');
      if (!targetBtn) return;

      const action = targetBtn.dataset.action;
      if (action === 'edit') {
        openEditModal(task);
      } else if (action === 'delete') {
        openDeleteConfirm(task);
      } else if (action === 'set-status') {
        const nextStatus = targetBtn.dataset.next;
        quickUpdateStatus(task, nextStatus);
      }
    });

    return card;
  }

  // --- Быстрое изменение статуса ---
  async function quickUpdateStatus(task, newStatus) {
    try {
      await API.updateTask(task.id, {
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: newStatus
      });
      showToast(`Статус обновлен на: ${newStatus.replace('_', ' ')}`, 'success');
      await loadData();
    } catch (err) {
      showToast(err.message || 'Ошибка обновления статуса', 'error');
    }
  }

  // --- Управление Модальным окном создания / редактирования ---
  function openCreateModal() {
    state.editingTaskId = null;
    DOM.modalTitle.textContent = 'Новая задача';
    DOM.formTaskId.value = '';
    DOM.formTaskTitle.value = '';
    DOM.formTaskDescription.value = '';
    DOM.formTaskPriority.value = 'medium';
    DOM.formTaskStatus.value = 'todo';
    DOM.formTaskTitle.parentElement.classList.remove('has-error');
    DOM.taskModal.classList.remove('hidden');
    DOM.formTaskTitle.focus();
  }

  function openEditModal(task) {
    state.editingTaskId = task.id;
    DOM.modalTitle.textContent = 'Редактирование задачи';
    DOM.formTaskId.value = task.id;
    DOM.formTaskTitle.value = task.title || '';
    DOM.formTaskDescription.value = task.description || '';
    DOM.formTaskPriority.value = Utils.normalizePriority(task.priority);
    DOM.formTaskStatus.value = Utils.normalizeStatus(task.status);
    DOM.formTaskTitle.parentElement.classList.remove('has-error');
    DOM.taskModal.classList.remove('hidden');
    DOM.formTaskTitle.focus();
  }

  function closeModal() {
    DOM.taskModal.classList.add('hidden');
    state.editingTaskId = null;
  }

  // Валидация и отправка формы
  async function handleFormSubmit(e) {
    e.preventDefault();
    const title = DOM.formTaskTitle.value.trim();
    const description = DOM.formTaskDescription.value.trim();
    const priority = DOM.formTaskPriority.value;
    const status = DOM.formTaskStatus.value;

    if (!title || title.length < 3) {
      DOM.formTaskTitle.parentElement.classList.add('has-error');
      DOM.formTaskTitle.focus();
      return;
    }

    DOM.formTaskTitle.parentElement.classList.remove('has-error');
    const payload = { title, description, priority, status };

    try {
      if (state.editingTaskId) {
        await API.updateTask(state.editingTaskId, payload);
        showToast('Задача успешно обновлена', 'success');
      } else {
        await API.createTask(payload);
        showToast('Задача успешно создана', 'success');
      }
      closeModal();
      await loadData();
    } catch (err) {
      showToast(err.message || 'Не удалось сохранить задачу', 'error');
    }
  }

  // --- Модальное окно подтверждения удаления ---
  function openDeleteConfirm(task) {
    state.taskToDeleteId = task.id;
    DOM.confirmModalText.textContent = `Удалить задачу «${task.title}»?`;
    DOM.confirmModal.classList.remove('hidden');
  }

  function closeDeleteConfirm() {
    DOM.confirmModal.classList.add('hidden');
    state.taskToDeleteId = null;
  }

  async function confirmDelete() {
    if (!state.taskToDeleteId) return;
    try {
      await API.deleteTask(state.taskToDeleteId);
      showToast('Задача удалена', 'info');
      closeDeleteConfirm();
      await loadData();
    } catch (err) {
      showToast(err.message || 'Не удалось удалить задачу', 'error');
    }
  }

  // --- Переключение видов (Kanban / List) ---
  function switchView(mode) {
    state.viewMode = mode;
    if (mode === 'kanban') {
      DOM.viewKanbanBtn.classList.add('active');
      DOM.viewListBtn.classList.remove('active');
      DOM.boardContainer.classList.remove('hidden');
      DOM.listContainer.classList.add('hidden');
    } else {
      DOM.viewListBtn.classList.add('active');
      DOM.viewKanbanBtn.classList.remove('active');
      DOM.boardContainer.classList.add('hidden');
      DOM.listContainer.classList.remove('hidden');
    }
    renderTasks();
  }

  // --- Регистрация слушателей событий (Event Listeners) ---
  function setupEventListeners() {
    // Переключение темы
    DOM.themeToggleBtn.addEventListener('click', toggleTheme);

    // Открытие модалки создания
    DOM.btnCreateTask.addEventListener('click', openCreateModal);
    DOM.btnEmptyCreate.addEventListener('click', openCreateModal);

    // Закрытие модалок
    DOM.btnCloseModal.addEventListener('click', closeModal);
    DOM.btnCancelModal.addEventListener('click', closeModal);
    DOM.btnCancelDelete.addEventListener('click', closeDeleteConfirm);
    DOM.btnConfirmDelete.addEventListener('click', confirmDelete);

    // Закрытие по клику на оверлей
    DOM.taskModal.addEventListener('click', (e) => {
      if (e.target === DOM.taskModal) closeModal();
    });
    DOM.confirmModal.addEventListener('click', (e) => {
      if (e.target === DOM.confirmModal) closeDeleteConfirm();
    });

    // Закрытие по нажатию Esc
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal();
        closeDeleteConfirm();
      }
    });

    // Отправка формы задачи
    DOM.taskForm.addEventListener('submit', handleFormSubmit);

    // Фильтры статуса (Табы)
    DOM.statusFilterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        DOM.statusFilterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.filters.status = tab.dataset.status;
        renderTasks();
      });
    });

    // Фильтр приоритета
    DOM.priorityFilter.addEventListener('change', (e) => {
      state.filters.priority = e.target.value;
      renderTasks();
    });

    // Поиск с дебаунсом 300мс
    const debouncedSearch = Utils.debounce((query) => {
      state.filters.search = query;
      if (query.trim()) {
        DOM.btnClearSearch.classList.remove('hidden');
      } else {
        DOM.btnClearSearch.classList.add('hidden');
      }
      renderTasks();
    }, 300);

    DOM.searchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));

    DOM.btnClearSearch.addEventListener('click', () => {
      DOM.searchInput.value = '';
      state.filters.search = '';
      DOM.btnClearSearch.classList.add('hidden');
      renderTasks();
    });

    // Переключатели видов
    DOM.viewKanbanBtn.addEventListener('click', () => switchView('kanban'));
    DOM.viewListBtn.addEventListener('click', () => switchView('list'));
  }

  // --- Инициализация приложения ---
  function init() {
    applyTheme(state.theme);
    setupEventListeners();
    loadData();
  }

  // Запуск после загрузки DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
