// sync.js — клиентский цикл синхронизации
import * as store from './store.js';

const HEALTH_TIMEOUT = 3000;
const SYNC_INTERVAL = 30000;
const DEBOUNCE_MS = 2000;

let syncing = false;
let debounceTimer = null;
let reachable = false;
let lastError = '';

export function getServerUrl() {
  return store.getMeta('server_url');
}

export function isReachable() {
  return reachable;
}

export function getLastError() {
  return lastError;
}

export async function setServerUrl(url) {
  await store.setMeta('server_url', String(url || '').replace(/\/+$/, ''));
}

function timeoutSignal(ms) {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

export async function checkHealth() {
  const url = getServerUrl();
  if (!url) { reachable = false; return null; }
  try {
    const r = await fetch(`${url}/api/health`, { signal: timeoutSignal(HEALTH_TIMEOUT) });
    if (!r.ok) throw new Error('bad status ' + r.status);
    const data = await r.json();
    reachable = true;
    lastError = '';
    return data;
  } catch (error) {
    reachable = false;
    lastError = error && error.message ? error.message : 'Не удалось проверить сервер';
    return null;
  }
}

export async function bootstrap() {
  const url = getServerUrl();
  const r = await fetch(`${url}/api/bootstrap`, { signal: timeoutSignal(10000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const data = await r.json();
  reachable = true;
  lastError = '';
  return data;
}

async function applyServerChanges(changes) {
  for (const c of changes || []) {
    if (!c || !c.entity) continue;
    switch (c.entity) {
      case 'habit':
        if (c.op === 'delete') {
          const local = store.getHabit(c.id);
          if (local && local.updated_at >= c.updated_at) break;
          await store.applyHabitRemoteDelete(c.id);
        } else if (c.data) {
          const local = store.getHabit(c.id);
          if (local && local.updated_at >= c.updated_at) break;
          await store.applyHabitRemote(c.data);
        }
        break;

      case 'tag':
        if (c.op === 'delete') {
          await store.applyTagRemoteDelete(c.id);
        } else if (c.data) {
          await store.applyTagRemote(c.data);
        }
        break;

      case 'habit_tag': {
        const i = c.id.indexOf('|');
        if (i < 0) break;
        const habitId = c.id.slice(0, i);
        const tagId = c.id.slice(i + 1);
        if (c.op === 'delete') {
          await store.applyHabitTagRemoteDelete(habitId, tagId);
        } else if (c.data) {
          await store.applyHabitTagRemote(c.data);
        }
        break;
      }

      case 'entry':
        if (c.op === 'delete') {
          const e = store.entryIndex().get(c.id);
          if (!e) break;
          const local = store.getEntry(e.habit_id, e.date);
          if (local && local.updated_at >= c.updated_at) break;
          await store.applyEntryRemoteDelete(e.habit_id, e.date);
        } else if (c.data) {
          const local = store.getEntry(c.data.habit_id, c.data.date);
          if (local && local.updated_at >= c.updated_at) break;
          await store.applyEntryRemote(c.data);
        }
        break;
    }
  }
}

export async function syncNow() {
  const url = getServerUrl();
  if (!url || syncing) return null;
  syncing = true;
  try {
    const sinceRev = store.getMeta('last_rev') || 0;
    const items = store.getQueueItems();
    const changes = items.map((q) => ({
      entity: q.entity,
      id: q.id,
      data: q.data,
      op: q.op,
      updated_at: q.updated_at,
    }));

    const r = await fetch(`${url}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ since_rev: sinceRev, changes }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);

    const result = await r.json();
    await applyServerChanges(result.changes || []);
    await store.setLastRev(result.rev);
    await store.removeQueueItems(items.map((q) => q.qid));
    reachable = true;
    lastError = '';
    store.flushRemote();
    return result;
  } catch (e) {
    reachable = false;
    lastError = e && e.message ? e.message : 'Не удалось синхронизировать данные';
    store.flushRemote();
    return null;
  } finally {
    syncing = false;
  }
}

export function scheduleSync() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => syncNow(), DEBOUNCE_MS);
}

export function initSync() {
  store.onRequestSync(scheduleSync);
  window.addEventListener('online', () => syncNow());
  window.addEventListener('offline', () => {
    reachable = false;
    lastError = 'Нет подключения к сети';
    store.flushRemote();
  });
  setInterval(() => syncNow(), SYNC_INTERVAL);
  checkHealth().then(() => store.flushRemote());
}
