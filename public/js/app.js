// app.js — точка входа: инициализация, роутинг, синхронизация
import * as store from './store.js';
import * as sync from './sync.js';
import * as grid from './ui-grid.js';
import * as stats from './ui-stats.js';
import * as habits from './ui-habits.js';

let currentScreen = 'grid';

const SCREEN_TITLES = { grid: 'Сегодня', stats: 'Статистика', habits: 'Привычки' };

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function renderIndicator() {
  const dot = document.getElementById('sync-dot');
  const text = document.getElementById('sync-text');
  const pill = document.getElementById('sync-indicator');
  if (!dot || !text) return;

  const url = sync.getServerUrl();
  if (!url) {
    dot.className = 'sync-dot off';
    text.textContent = 'Не настроен';
    pill.title = 'Сервер не настроен';
    return;
  }
  if (!sync.isReachable()) {
    dot.className = 'sync-dot off';
    text.textContent = 'Офлайн';
    pill.title = sync.getLastError() || 'Офлайн — нет связи с сервером';
    return;
  }
  const n = store.getQueueLength();
  if (n > 0) {
    dot.className = 'sync-dot warn';
    text.textContent = n + ' в очереди';
    pill.title = `В очереди изменений: ${n}`;
    return;
  }
  dot.className = 'sync-dot ok';
  text.textContent = 'Синхр.';
  pill.title = 'Синхронизировано';
}

function renderTabs() {
  document.querySelectorAll('.tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.screen === currentScreen);
  });
}

function render() {
  const screen = document.getElementById('screen');
  const title = document.getElementById('nav-title');
  if (title) title.textContent = SCREEN_TITLES[currentScreen] || 'Ритм';
  if (!screen) return;
  if (currentScreen === 'grid') grid.render(screen);
  else if (currentScreen === 'stats') stats.render(screen);
  else habits.render(screen);
  renderIndicator();
  renderTabs();
}

function setupTabs() {
  document.getElementById('tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (!b) return;
    currentScreen = b.dataset.screen;
    stats.destroyCharts();
    render();
  });
}

function setupSyncButton() {
  document.getElementById('sync-indicator').addEventListener('click', async () => {
    const text = document.getElementById('sync-text');
    if (text) text.textContent = '…';
    await sync.syncNow();
    renderIndicator();
  });
}

async function connectToServer() {
  const input = document.getElementById('server-url');
  const status = document.getElementById('server-status');
  const url = input.value.trim().replace(/\/+$/, '');
  if (!/^http:\/\//i.test(url)) {
    status.textContent = 'Адрес должен начинаться с http://';
    return;
  }
  status.textContent = 'Подключение…';
  const previousUrl = sync.getServerUrl();
  try {
    await sync.setServerUrl(url);
    const boot = await sync.bootstrap();
    await store.applyBootstrap(boot);
    sync.initSync();
    hide(document.getElementById('server-setup'));
    show(document.getElementById('app'));
    render();
  } catch (e) {
    await sync.setServerUrl(previousUrl || '');
    status.textContent = 'Не удалось подключиться: ' + (e && e.message ? e.message : e);
  }
}

async function main() {
  try {
    await store.init();
  } catch (error) {
    const setup = document.getElementById('server-setup');
    const status = document.getElementById('server-status');
    show(setup);
    hide(document.getElementById('app'));
    status.textContent = `Не удалось открыть локальное хранилище: ${error.message}`;
    console.error('Не удалось открыть локальное хранилище приложения:', error);
    return;
  }
  setupTabs();
  setupSyncButton();
  document.getElementById('server-connect').addEventListener('click', connectToServer);
  store.onChange(render);

  const url = sync.getServerUrl();
  if (!url) {
    show(document.getElementById('server-setup'));
    hide(document.getElementById('app'));
  } else {
    hide(document.getElementById('server-setup'));
    show(document.getElementById('app'));
    sync.initSync();
    render();
  }
}

main();
