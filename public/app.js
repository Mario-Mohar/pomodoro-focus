// Diese App laeuft vollstaendig im Browser. Alle Daten - Aufgaben, Statistik,
// Einstellungen - liegen im localStorage und verlassen das Geraet nicht.


// State
let timerInterval = null;
let timerWorker = null;
let timeRemaining = 25 * 60;
let totalTime = 25 * 60;
let isRunning = false;
let timerEndTime = null; // Timestamp when timer should end

// Rhythm State (declared early for use in onTimerComplete)
let currentRhythm = null;
let rhythmActive = false;
let currentPhaseIndex = 0;
let rhythmCycleCount = 0;

// Initialize Timer Web Worker for background support
try {
  timerWorker = new Worker('/timer-worker.js');
  timerWorker.onmessage = function(e) {
    const { type, remaining } = e.data;

    if (type === 'tick') {
      timeRemaining = remaining;
      updateTimerDisplay();
      saveTimerState();
    } else if (type === 'complete') {
      isRunning = false;
      startBtn.disabled = false;
      pauseBtn.disabled = true;
      timerEndTime = null;
      onTimerComplete();
      resetTimer();
    }
  };
  console.log('Timer Web Worker initialized');
} catch (e) {
  console.log('Web Worker not supported, using fallback timer');
  timerWorker = null;
}
let currentCategory = 'all';
let stats = loadStats();

// Motivations-Quotes
const quotes = [
  "Der Erfolg ist die Summe kleiner Anstrengungen, die jeden Tag wiederholt werden.",
  "Konzentration ist der Schlüssel zur Meisterschaft.",
  "Ein Ziel ohne Plan ist nur ein Wunsch.",
  "Kleine Fortschritte sind immer noch Fortschritte.",
  "Fokus ist deine Superkraft.",
  "Produktivität ist nie ein Zufall. Sie ist immer das Ergebnis von Engagement.",
  "Qualität ist wichtiger als Quantität.",
  "Jeder Experte war einmal ein Anfänger.",
  "Der beste Zeitpunkt anzufangen war gestern. Der zweitbeste ist jetzt.",
  "Erfolg besteht darin, von Misserfolg zu Misserfolg zu gehen, ohne seine Begeisterung zu verlieren."
];

// Sound Presets
const sounds = {
  beep: { freq: 800, duration: 0.2 },
  chime: { freq: 1200, duration: 0.3 },
  bell: { freq: 1500, duration: 0.4 }
};

// DOM Elemente
const timerDisplay = document.getElementById('timer-display');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const resetBtn = document.getElementById('reset-btn');
const presetBtns = document.querySelectorAll('.preset-btn');
const soundSelect = document.getElementById('sound-select');
const testSoundBtn = document.getElementById('test-sound-btn');

// Theme
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');

// Stats
const sessionsTodayEl = document.getElementById('sessions-today');
const streakCountEl = document.getElementById('streak-count');
const totalMinutesEl = document.getElementById('total-minutes');

// Quote
const quoteSection = document.getElementById('quote-section');
const quoteText = document.getElementById('quote-text');

// Auth Elements

// Todo Elements
const todoForm = document.getElementById('todo-form');
const todoInput = document.getElementById('todo-input');
const todoCategorySelect = document.getElementById('todo-category');
const todoPrioritySelect = document.getElementById('todo-priority');
const todoDueDateInput = document.getElementById('todo-due-date');
const todoRecurrenceSelect = document.getElementById('todo-recurrence');
const todoRecurrenceEndDateInput = document.getElementById('todo-recurrence-end-date');
const todoList = document.getElementById('todo-list');
const emptyState = document.getElementById('empty-state');
const todoContent = document.getElementById('todo-content');
const categoryFilters = document.querySelectorAll('.category-filter');
const exportButtons = document.getElementById('export-buttons');
const exportCSVBtn = document.getElementById('export-csv-btn');
const exportPDFBtn = document.getElementById('export-pdf-btn');

// Store current todos for export
let currentTodos = [];

// Stats Functions
function getStatsKey() {
  return 'pomodoroStats';
}

function loadStats() {
  const key = getStatsKey();
  const saved = localStorage.getItem(key);
  if (saved) {
    return JSON.parse(saved);
  }
  return {
    lastSessionDate: null,
    sessionsToday: 0,
    totalSessions: 0,
    totalMinutes: 0,
    streak: 0,
    lastStreakDate: null,
    dailyHistory: {} // { "2025-11-22": { sessions: 5, minutes: 125 } }
  };
}

function saveStats() {
  const key = getStatsKey();
  localStorage.setItem(key, JSON.stringify(stats));
}

function updateStatsDisplay() {
  sessionsTodayEl.textContent = stats.sessionsToday;
  streakCountEl.textContent = stats.streak;
  totalMinutesEl.textContent = stats.totalMinutes;
}

function reloadUserStats() {
  stats = loadStats();
  updateStatsDisplay();
  renderAdvancedStats();
}

// Timer Persistence Functions
function saveTimerState() {
  const timerState = {
    timeRemaining,
    totalTime,
    isRunning,
    timerEndTime,
    lastUpdate: Date.now(),
    // Rhythm state
    rhythmActive,
    currentPhaseIndex,
    rhythmCycleCount
  };
  localStorage.setItem('pomodoroTimer', JSON.stringify(timerState));
}

function loadTimerState() {
  const saved = localStorage.getItem('pomodoroTimer');
  if (!saved) return null;

  try {
    const timerState = JSON.parse(saved);

    // Calculate remaining time based on endTime if timer was running
    if (timerState.isRunning && timerState.timerEndTime) {
      const now = Date.now();
      timerState.timeRemaining = Math.max(0, Math.floor((timerState.timerEndTime - now) / 1000));

      // If time ran out while page was closed
      if (timerState.timeRemaining === 0) {
        timerState.isRunning = false;
      }
    }

    return timerState;
  } catch (e) {
    console.error('Error loading timer state:', e);
    return null;
  }
}

function clearTimerState() {
  localStorage.removeItem('pomodoroTimer');
}

function restoreTimerState() {
  const savedState = loadTimerState();
  if (!savedState) return;

  // Restore timer values
  timeRemaining = savedState.timeRemaining;
  totalTime = savedState.totalTime;
  timerEndTime = savedState.timerEndTime;
  updateTimerDisplay();

  // Restore rhythm state if present
  if (savedState.rhythmActive !== undefined) {
    rhythmActive = savedState.rhythmActive;
    currentPhaseIndex = savedState.currentPhaseIndex || 0;
    rhythmCycleCount = savedState.rhythmCycleCount || 0;
  }

  // Check if timer completed while page was closed
  if (savedState.isRunning && savedState.timeRemaining === 0) {
    // Timer abgelaufen während Seite geschlossen war
    clearTimerState();
    onTimerComplete();
    return;
  }

  // If timer was running, resume it
  if (savedState.isRunning && savedState.timeRemaining > 0) {
    startTimer();
  }

  // Update rhythm UI after restoring state
  if (rhythmActive && typeof updateRhythmUI === 'function') {
    // Delay to ensure rhythm elements are loaded
    setTimeout(() => {
      updateRhythmUI();
    }, 100);
  }
}

function checkAndUpdateStreak() {
  const today = new Date().toDateString();

  if (stats.lastSessionDate !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    if (stats.lastStreakDate === yesterdayStr) {
      stats.streak += 1;
    } else if (stats.lastStreakDate !== today) {
      stats.streak = 1;
    }

    stats.sessionsToday = 0;
    stats.lastSessionDate = today;
  }

  stats.lastStreakDate = today;
}




function recordSessionLocally(minutes) {
  checkAndUpdateStreak();
  stats.sessionsToday += 1;
  stats.totalSessions += 1;
  stats.totalMinutes += minutes;
  const today = new Date().toISOString().split('T')[0];
  if (!stats.dailyHistory) stats.dailyHistory = {};
  if (!stats.dailyHistory[today]) {
    stats.dailyHistory[today] = { sessions: 0, minutes: 0 };
  }
  stats.dailyHistory[today].sessions += 1;
  stats.dailyHistory[today].minutes += minutes;
  saveStats();
  updateStatsDisplay();
  renderAdvancedStats();
}

function recordSession(minutes) {
  recordSessionLocally(minutes);
}

// Theme Functions
function loadTheme() {
  // Lade Theme sofort aus localStorage für schnelles Rendering
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}


function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// Erweiterte Statistiken
function renderAdvancedStats() {
  renderWeekChart();
  renderHeatmap();
}

function renderWeekChart() {
  const weekChart = document.getElementById('week-chart');
  const weekLabels = document.getElementById('week-labels');
  if (!weekChart || !weekLabels) return;

  const last7Days = getLast7Days();
  const maxSessions = Math.max(...last7Days.map(d => d.sessions), 1);

  weekChart.innerHTML = last7Days.map(day => {
    const heightPercent = (day.sessions / maxSessions) * 100;
    return `
      <div class="flex-1 flex flex-col items-center gap-1 group relative">
        <div
          class="w-full rounded-t transition-all cursor-pointer hover:opacity-80"
          style="height: ${heightPercent}%; background-color: ${day.sessions > 0 ? 'var(--accent)' : 'var(--bg-tertiary)'}; min-height: ${day.sessions > 0 ? '4px' : '2px'};"
          title="${day.sessions} Sessions, ${day.minutes} Min"
        ></div>
        <div class="opacity-0 group-hover:opacity-100 absolute -top-8 bg-tertiary px-2 py-1 rounded text-xs whitespace-nowrap pointer-events-none">
          ${day.sessions} • ${day.minutes}m
        </div>
      </div>
    `;
  }).join('');

  weekLabels.innerHTML = last7Days.map(day =>
    `<span class="flex-1 text-center">${day.label}</span>`
  ).join('');
}

function getLast7Days() {
  if (!stats.dailyHistory) stats.dailyHistory = {};
  const days = [];
  const today = new Date();

  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dayData = stats.dailyHistory[dateStr] || { sessions: 0, minutes: 0 };

    const dayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    const label = i === 0 ? 'Heute' : dayNames[date.getDay()];

    days.push({
      date: dateStr,
      label: label,
      sessions: dayData.sessions,
      minutes: dayData.minutes
    });
  }

  return days;
}

function renderHeatmap() {
  const heatmapContainer = document.getElementById('heatmap-container');
  if (!heatmapContainer) return;

  const heatmapData = getLast12Weeks();
  const maxSessions = Math.max(...heatmapData.map(d => d.sessions), 1);

  // Gruppiere nach Wochen
  const weeks = [];
  for (let i = 0; i < heatmapData.length; i += 7) {
    weeks.push(heatmapData.slice(i, i + 7));
  }

  heatmapContainer.innerHTML = weeks.map(week => `
    <div class="flex flex-col gap-1">
      ${week.map(day => {
        const intensity = day.sessions === 0 ? 0 : Math.min(Math.ceil((day.sessions / maxSessions) * 4), 4);
        const colors = [
          'var(--bg-tertiary)',
          'rgba(239, 68, 68, 0.3)',
          'rgba(239, 68, 68, 0.6)',
          'rgba(239, 68, 68, 0.9)',
          'rgba(239, 68, 68, 1)'
        ];
        return `
          <div
            class="w-3 h-3 rounded-sm cursor-pointer hover:ring-2 hover:ring-accent transition"
            style="background-color: ${colors[intensity]};"
            title="${day.date}: ${day.sessions} Sessions, ${day.minutes} Min"
          ></div>
        `;
      }).join('')}
    </div>
  `).join('');
}

function getLast12Weeks() {
  if (!stats.dailyHistory) stats.dailyHistory = {};
  const days = [];
  const today = new Date();
  const totalDays = 12 * 7; // 84 Tage

  for (let i = totalDays - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dayData = stats.dailyHistory[dateStr] || { sessions: 0, minutes: 0 };

    days.push({
      date: dateStr,
      sessions: dayData.sessions,
      minutes: dayData.minutes
    });
  }

  return days;
}

// Timer Funktionen
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateTimerDisplay() {
  timerDisplay.textContent = formatTime(timeRemaining);
  const progress = ((totalTime - timeRemaining) / totalTime) * 360;
  document.querySelector('.timer-circle').style.setProperty('--progress', `${progress}deg`);
}

function startTimer() {
  if (isRunning) return;
  isRunning = true;
  startBtn.disabled = true;
  pauseBtn.disabled = false;

  // Set end time if not already set (fresh start vs resume)
  if (!timerEndTime) {
    timerEndTime = Date.now() + timeRemaining * 1000;
  }

  saveTimerState(); // Save state when starting

  // Use Web Worker if available (runs in background without throttling)
  if (timerWorker) {
    timerWorker.postMessage({ action: 'start', data: { endTime: timerEndTime } });
  }

  // Fallback interval (also runs as backup, Web Worker handles completion)
  timerInterval = setInterval(() => {
    // Calculate remaining time based on actual time (works even when tab is in background)
    const now = Date.now();
    timeRemaining = Math.max(0, Math.floor((timerEndTime - now) / 1000));
    updateTimerDisplay();
    saveTimerState(); // Save state every second

    // If no Web Worker, handle completion here
    if (!timerWorker && timeRemaining <= 0) {
      stopTimer();
      onTimerComplete();
    }
  }, 1000);
}

function pauseTimer() {
  isRunning = false;
  startBtn.disabled = false;
  pauseBtn.disabled = true;
  clearInterval(timerInterval);

  // Stop Web Worker timer
  if (timerWorker) {
    timerWorker.postMessage({ action: 'stop' });
  }

  timerEndTime = null; // Clear end time so it recalculates on resume
  saveTimerState(); // Save state when pausing
}

function resetTimer() {
  pauseTimer();
  timeRemaining = totalTime;
  updateTimerDisplay();
  clearTimerState(); // Clear saved state on reset
}

function stopTimer() {
  pauseTimer();
  resetTimer();
}

function setTimer(minutes) {
  if (isRunning) {
    pauseTimer();
  }
  totalTime = minutes * 60;
  timeRemaining = totalTime;
  updateTimerDisplay();
  clearTimerState(); // Clear saved state when setting new time
}

function onTimerComplete() {
  const minutes = Math.floor(totalTime / 60);

  // Only record work sessions, not breaks
  if (!rhythmActive || (currentRhythm && currentRhythm.phases[currentPhaseIndex]?.type === 'work')) {
    recordSession(minutes);
  }

  playSelectedSound();

  // Check if rhythm is active and advance to next phase
  if (rhythmActive && typeof advanceRhythmPhase === 'function') {
    const currentPhase = currentRhythm?.phases[currentPhaseIndex];
    const phaseType = currentPhase?.type === 'work' ? 'Arbeitsphase' : 'Pause';
    showNotification(`${phaseType} beendet!`, `${minutes} Minuten abgeschlossen. Nächste Phase startet...`);
    advanceRhythmPhase();
  } else {
    showNotification('Timer abgelaufen!', `${minutes} Minuten Session abgeschlossen!`);
    showRandomQuote();
  }
}

// Sound Functions
function playSelectedSound() {
  const selectedSound = soundSelect.value;
  const sound = sounds[selectedSound];

  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = sound.freq;
    oscillator.type = 'sine';
    gainNode.gain.value = 0.3;

    oscillator.start();
    oscillator.stop(audioContext.currentTime + sound.duration);
  } catch (e) {
    console.log('Audio nicht verfügbar');
  }
}

function showNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '🍅' });
  }
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// Quote Functions
const dailyQuoteText = document.getElementById('daily-quote-text');
const refreshQuoteBtn = document.getElementById('refresh-quote-btn');

// Get daily quote based on date (same quote all day)
function getDailyQuote() {
  const today = new Date().toDateString();
  const savedDate = localStorage.getItem('dailyQuoteDate');
  const savedQuote = localStorage.getItem('dailyQuote');

  if (savedDate === today && savedQuote) {
    return savedQuote;
  }

  // New day - get new quote based on date seed
  const dateNum = new Date().getDate() + new Date().getMonth() * 31;
  const quote = quotes[dateNum % quotes.length];

  localStorage.setItem('dailyQuoteDate', today);
  localStorage.setItem('dailyQuote', quote);

  return quote;
}

// Show daily quote on page load
function showDailyQuote() {
  if (dailyQuoteText) {
    dailyQuoteText.textContent = `"${getDailyQuote()}"`;
  }
}

// Refresh to random quote
function refreshDailyQuote() {
  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
  if (dailyQuoteText) {
    dailyQuoteText.textContent = `"${randomQuote}"`;
  }
  localStorage.setItem('dailyQuote', randomQuote);
  localStorage.setItem('dailyQuoteDate', new Date().toDateString());
}

// Event listener for refresh button
if (refreshQuoteBtn) {
  refreshQuoteBtn.addEventListener('click', refreshDailyQuote);
}

// Show session completion quote
function showRandomQuote() {
  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
  quoteText.textContent = randomQuote;
  quoteSection.classList.remove('hidden');

  setTimeout(() => {
    quoteSection.classList.add('hidden');
  }, 10000);
}

// Auth Funktionen




// UI Aktualisierung
function updateUI() {
  // In dieser Fassung gibt es weder Konten noch gesperrte Funktionen:
  // die Aufgabenliste ist immer sichtbar.
  if (todoContent) todoContent.classList.remove('hidden');
}

// Modal Funktionen
function openModal(modal) {
  modal.classList.add('active');
}

function closeModal(modal) {
  modal.classList.remove('active');
}

// Todo-Speicherung (localStorage)
//
// Diese App laeuft ohne Server: Aufgaben liegen im localStorage des Browsers.
// Die Datensaetze behalten die Form, die der Rest der App erwartet
// (id, text, category, priority, completed, due_date, recurrence,
// recurrence_end_date, created_at).

const TODOS_KEY = 'pomodoroTodos';

function readTodos() {
  try {
    const raw = localStorage.getItem(TODOS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error('Aufgaben konnten nicht gelesen werden:', error);
    return [];
  }
}

function writeTodos(todos) {
  try {
    localStorage.setItem(TODOS_KEY, JSON.stringify(todos));
  } catch (error) {
    console.error('Aufgaben konnten nicht gespeichert werden:', error);
  }
}

function nextTodoId(todos) {
  return todos.reduce((max, todo) => Math.max(max, Number(todo.id) || 0), 0) + 1;
}

async function fetchTodos() {
  renderTodos(readTodos());
}

async function createTodo(text, category, priority, due_date, recurrence, recurrence_end_date) {
  const todos = readTodos();
  todos.push({
    id: nextTodoId(todos),
    text,
    category: category || 'personal',
    priority: priority || 'medium',
    completed: 0,
    due_date: due_date || null,
    recurrence: recurrence || null,
    recurrence_end_date: recurrence_end_date || null,
    created_at: new Date().toISOString(),
  });
  writeTodos(todos);
  fetchTodos();
}

async function updateTodo(id, updates) {
  const todos = readTodos();
  const todo = todos.find((entry) => String(entry.id) === String(id));
  if (todo) {
    Object.assign(todo, updates);
    // completed wurde frueher als INTEGER gespeichert - Form beibehalten
    if ('completed' in updates) todo.completed = updates.completed ? 1 : 0;
    writeTodos(todos);
  }
  fetchTodos();
}

async function deleteTodo(id) {
  writeTodos(readTodos().filter((entry) => String(entry.id) !== String(id)));
  fetchTodos();
}

// Category Functions
function getCategoryIcon(category) {
  const icons = {
    work: '🏢',
    personal: '🏠',
    urgent: '⚡'
  };
  return icons[category] || '📌';
}

// Priority Functions
function getPriorityBadge(priority) {
  const badges = {
    high: { icon: '🔴', text: 'Hoch', color: '#dc2626' },
    medium: { icon: '🟡', text: 'Mittel', color: '#ca8a04' },
    low: { icon: '🟢', text: 'Niedrig', color: '#16a34a' }
  };
  const badge = badges[priority] || badges.medium;
  return `<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold" style="background-color: ${badge.color}; color: white;">${badge.icon} ${badge.text}</span>`;
}

// Due Date Functions
function getDueDateStatus(due_date) {
  if (!due_date) return 'normal';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(due_date);
  dueDate.setHours(0, 0, 0, 0);

  const diffTime = dueDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'today';
  if (diffDays <= 3) return 'soon';
  return 'normal';
}

function formatDueDate(due_date) {
  if (!due_date) return null;

  const date = new Date(due_date);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}.${month}.${year}`;
}

function getDueDateBadge(due_date) {
  if (!due_date) return '';

  const status = getDueDateStatus(due_date);
  const formattedDate = formatDueDate(due_date);

  const badges = {
    overdue: { icon: '🔴', text: formattedDate, color: '#dc2626', label: 'Überfällig' },
    today: { icon: '🟠', text: formattedDate, color: '#ea580c', label: 'Heute fällig' },
    soon: { icon: '🟡', text: formattedDate, color: '#ca8a04', label: 'Bald fällig' },
    normal: { icon: '📅', text: formattedDate, color: '#6b7280', label: 'Fällig' }
  };

  const badge = badges[status];
  return `<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold" style="background-color: ${badge.color}; color: white;" title="${badge.label}: ${formattedDate}">${badge.icon} ${badge.text}</span>`;
}

function filterByCategory(category) {
  currentCategory = category;

  categoryFilters.forEach(btn => {
    if (btn.dataset.category === category) {
      btn.classList.add('active');
      btn.style.backgroundColor = 'var(--accent)';
      btn.style.color = 'white';
    } else {
      btn.classList.remove('active');
      btn.style.backgroundColor = 'var(--bg-tertiary)';
      btn.style.color = 'var(--text-primary)';
    }
  });

  fetchTodos();
}

// Recurrence Functions
function getRecurrenceBadge(recurrence) {
  if (!recurrence) return '';

  const badges = {
    daily: { icon: '🔄', text: 'Täglich', color: '#3b82f6' },
    weekly: { icon: '📅', text: 'Wöchentlich', color: '#8b5cf6' },
    monthly: { icon: '📆', text: 'Monatlich', color: '#ec4899' }
  };

  const badge = badges[recurrence];
  if (!badge) return '';

  return `<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold" style="background-color: ${badge.color}; color: white;" title="Wiederkehrend: ${badge.text}">${badge.icon} ${badge.text}</span>`;
}

async function checkRecurrence() {
  // Legt fuer erledigte, heute faellige Aufgaben mit Wiederholung die
  // naechste Instanz an. Entspricht der Logik, die vorher auf dem Server lag.
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todos = readTodos();
  const followUps = [];

  for (const todo of todos) {
    if (!todo.completed || !todo.recurrence || !todo.due_date) continue;

    const dueDate = new Date(todo.due_date);
    dueDate.setHours(0, 0, 0, 0);
    if (dueDate.getTime() !== today.getTime()) continue;

    if (todo.recurrence_end_date) {
      const endDate = new Date(todo.recurrence_end_date);
      endDate.setHours(0, 0, 0, 0);
      if (today > endDate) continue;
    }

    const nextDue = new Date(dueDate);
    if (todo.recurrence === 'daily') nextDue.setDate(nextDue.getDate() + 1);
    else if (todo.recurrence === 'weekly') nextDue.setDate(nextDue.getDate() + 7);
    else if (todo.recurrence === 'monthly') nextDue.setDate(nextDue.getDate() + 30);
    else continue;

    followUps.push({
      text: todo.text,
      category: todo.category,
      priority: todo.priority,
      completed: 0,
      due_date: nextDue.toISOString(),
      recurrence: todo.recurrence,
      recurrence_end_date: todo.recurrence_end_date,
      created_at: new Date().toISOString(),
    });
  }

  if (!followUps.length) return;

  let nextId = nextTodoId(todos);
  for (const followUp of followUps) {
    todos.push({ id: nextId++, ...followUp });
  }
  writeTodos(todos);
  fetchTodos();
}

// Todo Rendering
function renderTodos(todos) {
  const filteredTodos = currentCategory === 'all'
    ? todos
    : todos.filter(t => t.category === currentCategory);

  // Sortiere nach Fälligkeitsdatum und Priorität
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const sortedTodos = filteredTodos.sort((a, b) => {
    // Erst nach Fälligkeitsstatus sortieren
    const statusA = getDueDateStatus(a.due_date);
    const statusB = getDueDateStatus(b.due_date);
    const statusOrder = { overdue: 0, today: 1, soon: 2, normal: 3 };

    const statusCompare = (statusOrder[statusA] || 3) - (statusOrder[statusB] || 3);
    if (statusCompare !== 0) return statusCompare;

    // Dann nach Priorität
    const priorityA = priorityOrder[a.priority || 'medium'];
    const priorityB = priorityOrder[b.priority || 'medium'];
    return priorityA - priorityB;
  });

  // Store filtered todos for export
  currentTodos = sortedTodos;

  if (sortedTodos.length === 0) {
    todoList.innerHTML = '';
    emptyState.classList.remove('hidden');
    if (exportButtons) exportButtons.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  if (exportButtons) exportButtons.classList.remove('hidden');

  todoList.innerHTML = sortedTodos.map(todo => `
    <li class="bg-tertiary rounded-lg p-4 flex items-center gap-3 hover:opacity-80 transition">
      <input
        type="checkbox"
        ${todo.completed ? 'checked' : ''}
        data-todo-toggle="${todo.id}"
        data-todo-completed="${todo.completed ? 1 : 0}"
        class="w-5 h-5 rounded cursor-pointer"
        style="accent-color: var(--accent);"
      >
      <div class="flex-1">
        <span class="${todo.completed ? 'line-through text-secondary' : ''}">${escapeHtml(todo.text)}</span>
        <div class="flex items-center gap-2 mt-2 flex-wrap">
          <span class="text-xs text-secondary">
            ${getCategoryIcon(todo.category)} ${todo.category || 'personal'}
          </span>
          ${getPriorityBadge(todo.priority || 'medium')}
          ${getDueDateBadge(todo.due_date)}
          ${getRecurrenceBadge(todo.recurrence)}
        </div>
      </div>
      <button
        data-todo-delete="${todo.id}"
        class="text-red-500 hover:text-red-400 font-bold text-xl leading-none"
      >
        ×
      </button>
    </li>
  `).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Export Functions
function exportTodosAsCSV() {
  if (!currentTodos || currentTodos.length === 0) return;

  // CSV Header
  const headers = ['Text', 'Kategorie', 'Priorität', 'Fälligkeitsdatum', 'Status'];

  // CSV Rows
  const rows = currentTodos.map(todo => {
    const category = getCategoryName(todo.category);
    const priority = getPriorityName(todo.priority);
    const dueDate = todo.due_date ? formatDueDate(todo.due_date) : '-';
    const status = todo.completed ? 'Erledigt' : 'Offen';

    // Escape quotes in text
    const text = todo.text.replace(/"/g, '""');

    return `"${text}","${category}","${priority}","${dueDate}","${status}"`;
  });

  // Combine header and rows
  const csvContent = [headers.join(','), ...rows].join('\n');

  // Add BOM for Excel UTF-8 compatibility
  const BOM = '\uFEFF';
  const csvWithBOM = BOM + csvContent;

  // Create blob and download
  const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' });
  const today = new Date().toISOString().split('T')[0];
  const filename = `pomodoro-todos-${today}.csv`;

  downloadFile(blob, filename);
  showExportNotification('CSV-Export erfolgreich!');
}

function exportTodosAsPDF() {
  if (!currentTodos || currentTodos.length === 0) return;

  // Group todos by status
  const openTodos = currentTodos.filter(t => !t.completed);
  const completedTodos = currentTodos.filter(t => t.completed);

  const today = new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  // Create HTML for PDF
  const html = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Meine Aufgaben - ${today}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      padding: 40px;
      background: white;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 3px solid #ef4444;
    }
    .header h1 {
      font-size: 32px;
      color: #ef4444;
      margin-bottom: 8px;
    }
    .header .date {
      font-size: 16px;
      color: #6b7280;
    }
    .section {
      margin-bottom: 40px;
    }
    .section h2 {
      font-size: 24px;
      margin-bottom: 20px;
      color: #111827;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .section h2 .count {
      font-size: 18px;
      color: #6b7280;
      font-weight: normal;
    }
    .todo-item {
      background: #f9fafb;
      border-left: 4px solid #e5e7eb;
      padding: 16px;
      margin-bottom: 12px;
      border-radius: 4px;
    }
    .todo-item.priority-high {
      border-left-color: #dc2626;
      background: #fef2f2;
    }
    .todo-item.priority-medium {
      border-left-color: #ca8a04;
      background: #fefce8;
    }
    .todo-item.priority-low {
      border-left-color: #16a34a;
      background: #f0fdf4;
    }
    .todo-text {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 8px;
      color: #111827;
    }
    .todo-meta {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      font-size: 14px;
      color: #6b7280;
    }
    .todo-meta-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      color: white;
    }
    .badge.priority-high { background: #dc2626; }
    .badge.priority-medium { background: #ca8a04; }
    .badge.priority-low { background: #16a34a; }
    .badge.status-overdue { background: #dc2626; }
    .badge.status-today { background: #ea580c; }
    .badge.status-soon { background: #ca8a04; }
    .badge.status-normal { background: #6b7280; }
    .empty {
      text-align: center;
      padding: 40px;
      color: #9ca3af;
      font-style: italic;
    }
    @media print {
      body {
        padding: 20px;
      }
      .todo-item {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🍅 Meine Aufgaben</h1>
    <div class="date">${today}</div>
  </div>

  ${openTodos.length > 0 ? `
  <div class="section">
    <h2>
      📋 Offene Aufgaben
      <span class="count">(${openTodos.length})</span>
    </h2>
    ${openTodos.map(todo => generateTodoHTML(todo)).join('')}
  </div>
  ` : ''}

  ${completedTodos.length > 0 ? `
  <div class="section">
    <h2>
      ✅ Erledigte Aufgaben
      <span class="count">(${completedTodos.length})</span>
    </h2>
    ${completedTodos.map(todo => generateTodoHTML(todo)).join('')}
  </div>
  ` : ''}

  ${currentTodos.length === 0 ? `
  <div class="empty">
    Keine Aufgaben vorhanden
  </div>
  ` : ''}
</body>
</html>
  `;

  // Create new window for printing
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();

    // Wait for content to load, then print
    printWindow.onload = function() {
      setTimeout(() => {
        printWindow.print();
        showExportNotification('PDF-Export gestartet!');
      }, 250);
    };
  } else {
    alert('Popup wurde blockiert. Bitte erlaube Popups für diese Seite.');
  }
}

function generateTodoHTML(todo) {
  const priorityClass = `priority-${todo.priority || 'medium'}`;
  const categoryName = getCategoryName(todo.category);
  const categoryIcon = getCategoryIcon(todo.category);
  const priorityName = getPriorityName(todo.priority);
  const priorityIcon = getPriorityIcon(todo.priority);

  let dueDateHTML = '';
  if (todo.due_date) {
    const status = getDueDateStatus(todo.due_date);
    const formattedDate = formatDueDate(todo.due_date);
    const statusLabels = {
      overdue: 'Überfällig',
      today: 'Heute',
      soon: 'Bald',
      normal: 'Fällig'
    };
    dueDateHTML = `
      <span class="todo-meta-item">
        <span class="badge status-${status}">${statusLabels[status]}: ${formattedDate}</span>
      </span>
    `;
  }

  return `
    <div class="todo-item ${priorityClass}">
      <div class="todo-text">${escapeHtml(todo.text)}</div>
      <div class="todo-meta">
        <span class="todo-meta-item">
          ${categoryIcon} ${categoryName}
        </span>
        <span class="todo-meta-item">
          <span class="badge ${priorityClass}">${priorityIcon} ${priorityName}</span>
        </span>
        ${dueDateHTML}
      </div>
    </div>
  `;
}

function getCategoryName(category) {
  const names = {
    work: 'Arbeit',
    personal: 'Privat',
    urgent: 'Dringend'
  };
  return names[category] || 'Privat';
}

function getPriorityName(priority) {
  const names = {
    high: 'Hoch',
    medium: 'Mittel',
    low: 'Niedrig'
  };
  return names[priority] || 'Mittel';
}

function getPriorityIcon(priority) {
  const icons = {
    high: '🔴',
    medium: '🟡',
    low: '🟢'
  };
  return icons[priority] || '🟡';
}

function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function showExportNotification(message) {
  // Create temporary notification element
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background-color: #16a34a;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    z-index: 9999;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    animation: slideIn 0.3s ease-out;
  `;

  document.body.appendChild(notification);

  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 3000);
}

// Event Listeners - Timer
startBtn.addEventListener('click', startTimer);
pauseBtn.addEventListener('click', pauseTimer);
resetBtn.addEventListener('click', resetTimer);

presetBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const minutes = parseInt(btn.dataset.minutes);
    setTimer(minutes);
  });
});

// Update timer immediately when tab becomes visible again
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && isRunning && timerEndTime) {
    const now = Date.now();
    timeRemaining = Math.max(0, Math.floor((timerEndTime - now) / 1000));
    updateTimerDisplay();

    if (timeRemaining <= 0) {
      stopTimer();
      onTimerComplete();
    }
  }
});

// Event Listeners - Theme
themeToggle.addEventListener('click', toggleTheme);

// Event Listeners - Sound Test
testSoundBtn.addEventListener('click', playSelectedSound);

// Event Listeners - Advanced Stats Toggle
const toggleAdvancedStatsBtn = document.getElementById('toggle-advanced-stats');
const advancedStatsSection = document.getElementById('advanced-stats');
const toggleStatsText = document.getElementById('toggle-stats-text');

if (toggleAdvancedStatsBtn && advancedStatsSection) {
  toggleAdvancedStatsBtn.addEventListener('click', () => {
    const isHidden = advancedStatsSection.classList.contains('hidden');
    if (isHidden) {
      advancedStatsSection.classList.remove('hidden');
      toggleStatsText.textContent = '📊 Erweiterte Statistiken ausblenden';
      renderAdvancedStats();
    } else {
      advancedStatsSection.classList.add('hidden');
      toggleStatsText.textContent = '📊 Erweiterte Statistiken anzeigen';
    }
  });
}

// Event Listeners - Category Filter
categoryFilters.forEach(btn => {
  btn.addEventListener('click', () => {
    filterByCategory(btn.dataset.category);
  });
});

// Event Delegation - Todo Liste
todoList.addEventListener('change', (e) => {
  const toggleEl = e.target.closest('[data-todo-toggle]');
  if (toggleEl) {
    const id = parseInt(toggleEl.dataset.todoToggle);
    const wasCompleted = toggleEl.dataset.todoCompleted === '1';
    updateTodo(id, { completed: !wasCompleted });
  }
});

todoList.addEventListener('click', (e) => {
  const deleteEl = e.target.closest('[data-todo-delete]');
  if (deleteEl) {
    const id = parseInt(deleteEl.dataset.todoDelete);
    deleteTodo(id);
  }
});

// Event Delegation - Custom Timers
if (document.getElementById('saved-timers-list')) {
  document.getElementById('saved-timers-list').addEventListener('click', (e) => {
    const setEl = e.target.closest('[data-timer-set]');
    if (setEl) {
      setTimer(parseInt(setEl.dataset.timerSet));
      return;
    }
    const deleteEl = e.target.closest('[data-timer-delete]');
    if (deleteEl) {
      deleteCustomTimer(parseInt(deleteEl.dataset.timerDelete));
    }
  });
}

// Onboarding
const onboardingModal = document.getElementById('onboarding-modal');
const onboardingNextBtn = document.getElementById('onboarding-next-btn');
let onboardingStep = 1;

function showOnboarding() {
  onboardingStep = 1;
  updateOnboardingStep();
  if (onboardingModal) openModal(onboardingModal);
}

function updateOnboardingStep() {
  document.querySelectorAll('.onboarding-step').forEach(el => {
    el.classList.toggle('hidden', parseInt(el.dataset.step) !== onboardingStep);
  });
  document.querySelectorAll('.onboarding-dot').forEach((dot, i) => {
    dot.style.background = i + 1 === onboardingStep ? 'var(--accent)' : 'var(--bg-tertiary)';
  });
  if (onboardingNextBtn) {
    onboardingNextBtn.textContent = onboardingStep === 3 ? 'Los geht\'s!' : 'Weiter';
  }
}

if (onboardingNextBtn) {
  onboardingNextBtn.addEventListener('click', () => {
    if (onboardingStep < 3) {
      onboardingStep++;
      updateOnboardingStep();
    } else {
      localStorage.setItem('onboarding_done', '1');
      closeModal(onboardingModal);
    }
  });
}



document.querySelectorAll('.close-modal').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const modal = e.target.closest('.modal');
    closeModal(modal);
  });
});

// Verifizierungs-E-Mail erneut senden

// Recurrence Select Change Handler
if (todoRecurrenceSelect) {
  todoRecurrenceSelect.addEventListener('change', (e) => {
    if (e.target.value) {
      todoRecurrenceEndDateInput.classList.remove('hidden');
    } else {
      todoRecurrenceEndDateInput.classList.add('hidden');
      todoRecurrenceEndDateInput.value = '';
    }
  });
}

// Todo Form
if (todoForm) {
  todoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = todoInput.value.trim();
    const category = todoCategorySelect.value;
    const priority = todoPrioritySelect.value;
    const due_date = todoDueDateInput.value || null;
    const recurrence = todoRecurrenceSelect.value || null;
    const recurrence_end_date = todoRecurrenceEndDateInput.value || null;
    if (text) {
      createTodo(text, category, priority, due_date, recurrence, recurrence_end_date);
      todoInput.value = '';
      todoPrioritySelect.value = 'medium'; // Reset to default
      todoDueDateInput.value = ''; // Reset due date
      todoRecurrenceSelect.value = ''; // Reset recurrence
      todoRecurrenceEndDateInput.value = ''; // Reset recurrence end date
      todoRecurrenceEndDateInput.classList.add('hidden'); // Hide end date input
    }
  });
}


// Export Buttons
if (exportCSVBtn) {
  exportCSVBtn.addEventListener('click', exportTodosAsCSV);
}

if (exportPDFBtn) {
  exportPDFBtn.addEventListener('click', exportTodosAsPDF);
}

// Make functions globally available for inline handlers
window.updateTodo = updateTodo;
window.deleteTodo = deleteTodo;

// Initialisierung
loadTheme();
showDailyQuote(); // Show daily motivation quote
restoreTimerState(); // Restore timer state from localStorage
updateStatsDisplay();
renderAdvancedStats(); // Initiale Render der erweiterten Stats
requestNotificationPermission();

// ============================================================
// PWA: Service Worker & Install Prompt
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        // Stündlich nach Updates suchen
        setInterval(() => reg.update(), 60 * 60 * 1000);
      })
      .catch(err => console.error('SW Registrierung fehlgeschlagen:', err));
  });
}

let deferredInstallPrompt = null;
const pwaInstallBtn = document.getElementById('pwa-install-btn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (pwaInstallBtn) pwaInstallBtn.style.display = 'block';
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  if (pwaInstallBtn) pwaInstallBtn.style.display = 'none';
});

if (pwaInstallBtn) {
  pwaInstallBtn.addEventListener('click', () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(() => {
      deferredInstallPrompt = null;
      pwaInstallBtn.style.display = 'none';
    });
  });
}

// Handle page visibility change (when returning from background)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && isRunning && timerEndTime) {
    // Recalculate time when page becomes visible
    const now = Date.now();
    timeRemaining = Math.max(0, Math.floor((timerEndTime - now) / 1000));
    updateTimerDisplay();

    // Check if timer completed while in background
    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
      if (timerWorker) {
        timerWorker.postMessage({ action: 'stop' });
      }
      isRunning = false;
      startBtn.disabled = false;
      pauseBtn.disabled = true;
      timerEndTime = null;
      onTimerComplete();
      resetTimer();
    }
  }
});

// ===== Custom Timer Functions =====

// Custom Timer Elements
const customTimerInput = document.getElementById('custom-timer-input');
const setCustomTimerBtn = document.getElementById('set-custom-timer-btn');
const saveCustomTimerCheckbox = document.getElementById('save-custom-timer-checkbox');
const savedTimersSection = document.getElementById('saved-timers-section');
const savedTimersList = document.getElementById('saved-timers-list');

// localStorage key
const CUSTOM_TIMERS_KEY = 'customTimers';
const MAX_CUSTOM_TIMERS = 5;

// Eigene Timer liegen im localStorage
async function loadCustomTimers() {
  const saved = localStorage.getItem(CUSTOM_TIMERS_KEY);
  if (!saved) return [];
  try {
    return JSON.parse(saved);
  } catch (error) {
    console.error('Eigene Timer konnten nicht gelesen werden:', error);
    return [];
  }
}

// Fetch custom timers from server

async function saveCustomTimersToStorage(timers) {
  localStorage.setItem(CUSTOM_TIMERS_KEY, JSON.stringify(timers));
}

// Save custom timers to server

// Save a new custom timer
async function saveCustomTimer(minutes) {
  let timers = await loadCustomTimers();

  // Check if timer already exists
  const exists = timers.some(t => t.minutes === minutes);
  if (exists) {
    return; // Don't add duplicates
  }

  // Add new timer
  const newTimer = {
    minutes: minutes,
    label: `${minutes} Min`
  };

  timers.push(newTimer);

  // Keep only the last 5 timers (FIFO)
  if (timers.length > MAX_CUSTOM_TIMERS) {
    timers = timers.slice(-MAX_CUSTOM_TIMERS);
  }

  await saveCustomTimersToStorage(timers);
  await renderCustomTimers();
}

// Delete a custom timer
async function deleteCustomTimer(index) {
  let timers = await loadCustomTimers();
  timers.splice(index, 1);
  await saveCustomTimersToStorage(timers);
  await renderCustomTimers();
}

// Render custom timers in the UI
async function renderCustomTimers() {
  const timers = await loadCustomTimers();

  if (timers.length === 0) {
    savedTimersSection.classList.add('hidden');
    return;
  }

  savedTimersSection.classList.remove('hidden');

  savedTimersList.innerHTML = timers.map((timer, index) => `
    <div class="relative group">
      <button
        data-timer-set="${timer.minutes}"
        class="w-full custom-timer-btn bg-tertiary hover:bg-opacity-80 active:bg-opacity-60 py-2 rounded-lg transition"
        title="${timer.label}"
      >
        ${timer.label}
      </button>
      <button
        data-timer-delete="${index}"
        class="absolute -top-1 -right-1 w-5 h-5 bg-red-600 hover:bg-red-700 text-white rounded-full text-xs font-bold leading-none opacity-0 group-hover:opacity-100 transition-opacity"
        title="Timer löschen"
      >
        ×
      </button>
    </div>
  `).join('');
}

// Event listener for custom timer button
if (setCustomTimerBtn) {
  setCustomTimerBtn.addEventListener('click', async () => {
    const minutes = parseInt(customTimerInput.value);

    // Validation
    if (!minutes || minutes < 1 || minutes > 180) {
      alert('Bitte gib eine gültige Anzahl von Minuten ein (1-180)');
      return;
    }

    // Set the timer
    setTimer(minutes);

    // Save if checkbox is checked
    if (saveCustomTimerCheckbox.checked) {
      await saveCustomTimer(minutes);
    }

    // Clear input
    customTimerInput.value = '';
  });
}

// Allow Enter key to trigger custom timer
if (customTimerInput) {
  customTimerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      setCustomTimerBtn.click();
    }
  });
}

// Make delete function globally available
window.deleteCustomTimer = deleteCustomTimer;

// Eigene Timer werden beim Start gerendert (siehe Initialisierung oben).

// ===== Pomodoro Rhythm Functions =====

// Rhythm Presets
const RHYTHM_PRESETS = {
  classic: {
    name: 'Klassisch',
    phases: [
      { type: 'work', minutes: 25 },
      { type: 'break', minutes: 5 },
      { type: 'work', minutes: 25 },
      { type: 'break', minutes: 5 },
      { type: 'work', minutes: 25 },
      { type: 'break', minutes: 15 }
    ],
    autoRepeat: true
  },
  short: {
    name: 'Kurz',
    phases: [
      { type: 'work', minutes: 15 },
      { type: 'break', minutes: 3 },
      { type: 'work', minutes: 15 },
      { type: 'break', minutes: 3 },
      { type: 'work', minutes: 15 },
      { type: 'break', minutes: 10 }
    ],
    autoRepeat: true
  },
  long: {
    name: 'Lang',
    phases: [
      { type: 'work', minutes: 50 },
      { type: 'break', minutes: 10 },
      { type: 'work', minutes: 50 },
      { type: 'break', minutes: 30 }
    ],
    autoRepeat: true
  }
};

// Rhythm DOM Elements
const toggleRhythmBtn = document.getElementById('toggle-rhythm-btn');
const rhythmToggleText = document.getElementById('rhythm-toggle-text');
const rhythmEditor = document.getElementById('rhythm-editor');
const rhythmControls = document.getElementById('rhythm-controls');
const startRhythmBtn = document.getElementById('start-rhythm-btn');
const stopRhythmBtn = document.getElementById('stop-rhythm-btn');
const activeRhythmDisplay = document.getElementById('active-rhythm-display');
const rhythmPhasesDisplay = document.getElementById('rhythm-phases-display');
const currentPhaseIndicator = document.getElementById('current-phase-indicator');
const rhythmCycleCountEl = document.getElementById('rhythm-cycle-count');
const customRhythmBuilder = document.getElementById('custom-rhythm-builder');
const rhythmPhasesList = document.getElementById('rhythm-phases-list');
const addPhaseBtn = document.getElementById('add-phase-btn');
const saveRhythmBtn = document.getElementById('save-rhythm-btn');
const deleteRhythmBtn = document.getElementById('delete-rhythm-btn');
const rhythmAutoRepeat = document.getElementById('rhythm-auto-repeat');

// Temporary phases for building custom rhythm
let tempPhases = [];

// Load rhythm from server or localStorage
async function loadRhythm() {
  const saved = localStorage.getItem('pomodoroRhythm');
  if (!saved) return;
  try {
    currentRhythm = JSON.parse(saved);
  } catch (error) {
    currentRhythm = null;
  }
}

// Save rhythm to server or localStorage
async function saveRhythm(rhythm) {
  currentRhythm = rhythm;
  if (rhythm) {
    localStorage.setItem('pomodoroRhythm', JSON.stringify(rhythm));
  } else {
    localStorage.removeItem('pomodoroRhythm');
  }
}

// Update rhythm UI
function updateRhythmUI() {
  if (!currentRhythm) {
    activeRhythmDisplay.classList.add('hidden');
    rhythmControls.classList.add('hidden');
    deleteRhythmBtn.classList.add('hidden');
    return;
  }

  // Show rhythm display
  activeRhythmDisplay.classList.remove('hidden');
  rhythmControls.classList.remove('hidden');
  deleteRhythmBtn.classList.remove('hidden');

  // Build phases display
  const phasesHtml = currentRhythm.phases.map((phase, index) => {
    const isActive = rhythmActive && index === currentPhaseIndex;
    const bgColor = phase.type === 'work' ? 'bg-red-500' : 'bg-green-500';
    const opacity = isActive ? '' : 'opacity-50';
    const ring = isActive ? 'ring-2 ring-white' : '';
    return `<span class="inline-flex items-center gap-1 px-2 py-1 rounded ${bgColor} ${opacity} ${ring} text-white text-xs">
      ${phase.type === 'work' ? '💼' : '☕'} ${phase.minutes}m
    </span>`;
  }).join('');

  rhythmPhasesDisplay.innerHTML = phasesHtml;

  // Update current phase indicator
  if (rhythmActive) {
    const currentPhase = currentRhythm.phases[currentPhaseIndex];
    const phaseType = currentPhase.type === 'work' ? 'Arbeitsphase' : 'Pause';
    const bgColor = currentPhase.type === 'work' ? 'background-color: #ef4444;' : 'background-color: #10b981;';
    currentPhaseIndicator.textContent = `${phaseType} ${currentPhaseIndex + 1}/${currentRhythm.phases.length}`;
    currentPhaseIndicator.style.cssText = bgColor + ' color: white;';
    currentPhaseIndicator.classList.remove('hidden');

    if (currentRhythm.autoRepeat) {
      rhythmCycleCountEl.textContent = `Zyklus ${rhythmCycleCount + 1}`;
      rhythmCycleCountEl.classList.remove('hidden');
    } else {
      rhythmCycleCountEl.classList.add('hidden');
    }

    startRhythmBtn.classList.add('hidden');
    stopRhythmBtn.classList.remove('hidden');
  } else {
    currentPhaseIndicator.classList.add('hidden');
    rhythmCycleCountEl.classList.add('hidden');
    startRhythmBtn.classList.remove('hidden');
    stopRhythmBtn.classList.add('hidden');
  }
}

// Start rhythm
function startRhythm() {
  if (!currentRhythm || currentRhythm.phases.length === 0) return;

  rhythmActive = true;
  currentPhaseIndex = 0;
  rhythmCycleCount = 0;

  // Start first phase
  startCurrentPhase();
  updateRhythmUI();
}

// Stop rhythm
function stopRhythm() {
  rhythmActive = false;
  currentPhaseIndex = 0;
  rhythmCycleCount = 0;

  // Stop current timer
  if (isRunning) {
    pauseTimer();
  }

  updateRhythmUI();
}

// Start current phase
function startCurrentPhase() {
  if (!currentRhythm || !rhythmActive) return;

  const phase = currentRhythm.phases[currentPhaseIndex];
  setTimer(phase.minutes);
  startTimer();
  updateRhythmUI();

  // Show notification for phase start
  const phaseType = phase.type === 'work' ? 'Arbeitsphase' : 'Pausephase';
  showNotification(`${phaseType} gestartet`, `${phase.minutes} Minuten ${phase.type === 'work' ? 'Fokus' : 'Pause'}`);
}

// Advance to next phase (called when timer completes)
function advanceRhythmPhase() {
  if (!rhythmActive || !currentRhythm) return false;

  currentPhaseIndex++;

  // Check if cycle complete
  if (currentPhaseIndex >= currentRhythm.phases.length) {
    if (currentRhythm.autoRepeat) {
      // Restart from beginning
      currentPhaseIndex = 0;
      rhythmCycleCount++;
    } else {
      // Rhythm complete
      rhythmActive = false;
      updateRhythmUI();
      showNotification('Rhythmus abgeschlossen!', 'Alle Phasen wurden durchlaufen.');
      return false;
    }
  }

  // Auto-start next phase after short delay
  setTimeout(() => {
    if (rhythmActive) {
      startCurrentPhase();
    }
  }, 2000); // 2 second pause between phases

  return true;
}

// Render temp phases in editor
function renderTempPhases() {
  if (tempPhases.length === 0) {
    rhythmPhasesList.innerHTML = '<p class="text-xs text-secondary text-center py-2">Keine Phasen definiert</p>';
    return;
  }

  rhythmPhasesList.innerHTML = tempPhases.map((phase, index) => `
    <div class="flex items-center gap-2 bg-tertiary rounded-lg p-2">
      <select class="phase-type flex-shrink-0 bg-primary rounded px-2 py-1 text-xs" data-index="${index}">
        <option value="work" ${phase.type === 'work' ? 'selected' : ''}>💼 Arbeit</option>
        <option value="break" ${phase.type === 'break' ? 'selected' : ''}>☕ Pause</option>
      </select>
      <input type="number" class="phase-minutes flex-1 bg-primary rounded px-2 py-1 text-xs"
             value="${phase.minutes}" min="1" max="180" data-index="${index}">
      <span class="text-xs text-secondary">Min</span>
      <button class="delete-phase-btn text-red-500 hover:text-red-400 text-sm" data-index="${index}">×</button>
    </div>
  `).join('');

  // Add event listeners
  rhythmPhasesList.querySelectorAll('.phase-type').forEach(select => {
    select.addEventListener('change', (e) => {
      const index = parseInt(e.target.dataset.index);
      tempPhases[index].type = e.target.value;
    });
  });

  rhythmPhasesList.querySelectorAll('.phase-minutes').forEach(input => {
    input.addEventListener('change', (e) => {
      const index = parseInt(e.target.dataset.index);
      tempPhases[index].minutes = Math.max(1, Math.min(180, parseInt(e.target.value) || 1));
    });
  });

  rhythmPhasesList.querySelectorAll('.delete-phase-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      tempPhases.splice(index, 1);
      renderTempPhases();
    });
  });
}

// Event Listeners for Rhythm

// Toggle rhythm editor
if (toggleRhythmBtn) {
  toggleRhythmBtn.addEventListener('click', () => {
    const isHidden = rhythmEditor.classList.contains('hidden');
    if (isHidden) {
      rhythmEditor.classList.remove('hidden');
      rhythmToggleText.textContent = '▲ Schließen';
    } else {
      rhythmEditor.classList.add('hidden');
      rhythmToggleText.textContent = '▼ Einrichten';
    }
  });
}

// Preset buttons
document.querySelectorAll('.rhythm-preset').forEach(btn => {
  btn.addEventListener('click', async () => {
    const preset = btn.dataset.preset;

    if (preset === 'custom') {
      // Show custom builder
      customRhythmBuilder.classList.remove('hidden');
      tempPhases = currentRhythm ? [...currentRhythm.phases] : [
        { type: 'work', minutes: 25 },
        { type: 'break', minutes: 5 }
      ];
      renderTempPhases();
    } else if (RHYTHM_PRESETS[preset]) {
      // Apply preset
      await saveRhythm(RHYTHM_PRESETS[preset]);
      customRhythmBuilder.classList.add('hidden');
      updateRhythmUI();
    }
  });
});

// Add phase button
if (addPhaseBtn) {
  addPhaseBtn.addEventListener('click', () => {
    if (tempPhases.length < 10) {
      // Alternate between work and break
      const lastType = tempPhases.length > 0 ? tempPhases[tempPhases.length - 1].type : 'break';
      const newType = lastType === 'work' ? 'break' : 'work';
      tempPhases.push({ type: newType, minutes: newType === 'work' ? 25 : 5 });
      renderTempPhases();
    } else {
      alert('Maximal 10 Phasen erlaubt');
    }
  });
}

// Save rhythm button
if (saveRhythmBtn) {
  saveRhythmBtn.addEventListener('click', async () => {
    if (tempPhases.length === 0) {
      alert('Bitte füge mindestens eine Phase hinzu');
      return;
    }

    const rhythm = {
      name: 'Eigener Rhythmus',
      phases: tempPhases,
      autoRepeat: rhythmAutoRepeat ? rhythmAutoRepeat.checked : true
    };

    await saveRhythm(rhythm);
    customRhythmBuilder.classList.add('hidden');
    updateRhythmUI();
  });
}

// Delete rhythm button
if (deleteRhythmBtn) {
  deleteRhythmBtn.addEventListener('click', async () => {
    if (confirm('Möchtest du den Rhythmus wirklich löschen?')) {
      if (rhythmActive) {
        stopRhythm();
      }
      await saveRhythm(null);
      updateRhythmUI();
    }
  });
}

// Start rhythm button
if (startRhythmBtn) {
  startRhythmBtn.addEventListener('click', startRhythm);
}

// Stop rhythm button
if (stopRhythmBtn) {
  stopRhythmBtn.addEventListener('click', stopRhythm);
}

// Initialize rhythm on page load
async function initRhythm() {
  await loadRhythm();
  updateRhythmUI();
}

// Make rhythm functions available globally
window.advanceRhythmPhase = advanceRhythmPhase;
window.rhythmActive = () => rhythmActive;

// ============================================================
// Start
// Steht bewusst am Dateiende: erst wenn alle const-Deklarationen
// ausgewertet sind, darf initial gerendert werden.
// ============================================================
updateUI();
fetchTodos();
renderCustomTimers();

// Einfuehrung nur beim ersten Besuch
if (!localStorage.getItem('onboarding_done')) {
  showOnboarding();
}
