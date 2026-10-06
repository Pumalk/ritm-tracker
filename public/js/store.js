// store.js — локальное хранилище (память + IndexedDB) и очередь изменений.
// Чтение — синхронное из памяти (offline-first, мгновенная отрисовка),
// запись — в память + IndexedDB + очередь на синхронизацию.

import * as idb from './idb.js';

const DB_NAME = 'ritm-tracker';
const DB_VERSION = 1;

let db = null;

const state = {
  meta: new Map(),      // key -> value
  habits: new Map(),    // id -> habit
  tags: new Map(),      // id -> tag
  habitTags: new Map(), // `${habit_id}|${tag_id}` -> {habit_id, tag_id}
  entries: new Map(),   // `${habit_id}|${date}` -> entry
  queue: new Map(),     // qid -> change
};

const listeners = new Set();
const syncHooks = new Set();

function emit() {
  for (const fn of listeners) fn();
}
function requestSync() {
  for (const fn of syncHooks) fn();
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function onRequestSync(fn) {
  syncHooks.add(fn);
  return () => syncHooks.delete(fn);
}

export function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
export function isoNow() {
  return new Date().toISOString();
}

const tagKey = (habitId, tagId) => `${habitId}|${tagId}`;
const entryKey = (habitId, date) => `${habitId}|${date}`;

export async function init() {
  db = await idb.openDB(DB_NAME, DB_VERSION, (d) => {
    if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
    if (!d.objectStoreNames.contains('habits')) d.createObjectStore('habits');
    if (!d.objectStoreNames.contains('tags')) d.createObjectStore('tags');
    if (!d.objectStoreNames.contains('habit_tags')) d.createObjectStore('habit_tags');
    if (!d.objectStoreNames.contains('entries')) d.createObjectStore('entries');
    if (!d.objectStoreNames.contains('queue')) d.createObjectStore('queue', { keyPath: 'qid' });
  });

  state.meta = new Map((await idb.getAll(db, 'meta')).map((v) => [v.key, v.value]));
  state.habits = new Map((await idb.getAll(db, 'habits')).map((v) => [v.id, v]));
  state.tags = new Map((await idb.getAll(db, 'tags')).map((v) => [v.id, v]));
  state.habitTags = new Map((await idb.getAll(db, 'habit_tags')).map((v) => [tagKey(v.habit_id, v.tag_id), v]));
  state.entries = new Map((await idb.getAll(db, 'entries')).map((v) => [entryKey(v.habit_id, v.date), v]));
  state.queue = new Map((await idb.getAll(db, 'queue')).map((v) => [v.qid, v]));
}

// ---------- Чтение (синхронное, из памяти) ----------
export const getMeta = (key) => state.meta.get(key);
export const getHabits = () => [...state.habits.values()];
export const getHabit = (id) => state.habits.get(id);
export const getTags = () => [...state.tags.values()];
export const getTag = (id) => state.tags.get(id);
export const getAllHabitTags = () => [...state.habitTags.values()];

export function getHabitTagIds(habitId) {
  const out = [];
  for (const v of state.habitTags.values()) if (v.habit_id === habitId) out.push(v.tag_id);
  return out;
}

export const getEntry = (habitId, date) => state.entries.get(entryKey(habitId, date));
export const getEntries = () => [...state.entries.values()];
export const getQueueLength = () => state.queue.size;
export const getQueueItems = () => [...state.queue.values()];

export function entryIndex() {
  const m = new Map();
  for (const e of state.entries.values()) m.set(e.id, e);
  return m;
}

// ---------- meta ----------
export async function setMeta(key, value) {
  state.meta.set(key, value);
  await idb.put(db, 'meta', { key, value });
}

// ---------- Мутации (локально + очередь + перерисовка) ----------
async function enqueue(change) {
  const item = { qid: uuid(), ...change };
  state.queue.set(item.qid, item);
  await idb.put(db, 'queue', item);
}

export async function putHabit(habit) {
  const now = isoNow();
  const h = {
    id: habit.id || uuid(),
    title: String(habit.title || ''),
    emoji: String(habit.emoji || ''),
    color: habit.color || '#22d3ee',
    target_value: habit.target_value != null ? habit.target_value : null,
    target_unit: habit.target_unit != null ? String(habit.target_unit) : null,
    sort_order: Number.isFinite(habit.sort_order) ? habit.sort_order : 0,
    archived: habit.archived ? 1 : 0,
    created_at: habit.created_at || now,
    updated_at: now,
  };
  state.habits.set(h.id, h);
  await idb.put(db, 'habits', h, h.id);
  await enqueue({ entity: 'habit', id: h.id, data: h, op: 'upsert', updated_at: now });
  emit();
  requestSync();
  return h;
}

export async function deleteHabit(id) {
  const now = isoNow();
  state.habits.delete(id);
  await idb.del(db, 'habits', id);
  for (const [k, e] of [...state.entries]) {
    if (e.habit_id === id) { state.entries.delete(k); await idb.del(db, 'entries', k); }
  }
  for (const [k, v] of [...state.habitTags]) {
    if (v.habit_id === id) { state.habitTags.delete(k); await idb.del(db, 'habit_tags', k); }
  }
  await enqueue({ entity: 'habit', id, data: null, op: 'delete', updated_at: now });
  emit();
  requestSync();
}

export async function putTag(tag) {
  const id = tag.id || uuid();
  const t = { id, name: String(tag.name || '').trim() };
  state.tags.set(id, t);
  await idb.put(db, 'tags', t, id);
  await enqueue({ entity: 'tag', id, data: t, op: 'upsert', updated_at: isoNow() });
  emit();
  requestSync();
  return t;
}

export async function deleteTag(id) {
  state.tags.delete(id);
  await idb.del(db, 'tags', id);
  for (const [k, v] of [...state.habitTags]) {
    if (v.tag_id === id) { state.habitTags.delete(k); await idb.del(db, 'habit_tags', k); }
  }
  await enqueue({ entity: 'tag', id, data: null, op: 'delete', updated_at: isoNow() });
  emit();
  requestSync();
}

export async function linkTag(habitId, tagId) {
  const key = tagKey(habitId, tagId);
  if (state.habitTags.has(key)) return;
  const v = { habit_id: habitId, tag_id: tagId };
  state.habitTags.set(key, v);
  await idb.put(db, 'habit_tags', v, key);
  await enqueue({ entity: 'habit_tag', id: key, data: v, op: 'upsert', updated_at: isoNow() });
  emit();
  requestSync();
}

export async function unlinkTag(habitId, tagId) {
  const key = tagKey(habitId, tagId);
  if (!state.habitTags.has(key)) return;
  state.habitTags.delete(key);
  await idb.del(db, 'habit_tags', key);
  await enqueue({ entity: 'habit_tag', id: key, data: { habit_id: habitId, tag_id: tagId }, op: 'delete', updated_at: isoNow() });
  emit();
  requestSync();
}

export async function setEntry(habitId, date, done, value) {
  const now = isoNow();
  const key = entryKey(habitId, date);
  const existing = state.entries.get(key);
  const entry = {
    id: existing ? existing.id : uuid(),
    habit_id: habitId,
    date,
    done: done ? 1 : 0,
    value: value != null ? value : null,
    updated_at: now,
  };
  state.entries.set(key, entry);
  await idb.put(db, 'entries', entry, key);
  await enqueue({ entity: 'entry', id: entry.id, data: entry, op: 'upsert', updated_at: now });
  emit();
  requestSync();
  return entry;
}

// ---------- Применение данных с сервера (БЕЗ очереди) ----------
export async function applyBootstrap(boot) {
  await setMeta('last_rev', boot.rev);

  state.habits = new Map((boot.habits || []).map((h) => [h.id, h]));
  state.tags = new Map((boot.tags || []).map((t) => [t.id, t]));
  state.habitTags = new Map((boot.habit_tags || []).map((v) => [tagKey(v.habit_id, v.tag_id), v]));
  state.entries = new Map((boot.entries || []).map((e) => [entryKey(e.habit_id, e.date), e]));

  await idb.clear(db, 'habits');
  await idb.clear(db, 'tags');
  await idb.clear(db, 'habit_tags');
  await idb.clear(db, 'entries');
  for (const h of state.habits.values()) await idb.put(db, 'habits', h, h.id);
  for (const t of state.tags.values()) await idb.put(db, 'tags', t, t.id);
  for (const v of state.habitTags.values()) await idb.put(db, 'habit_tags', v, tagKey(v.habit_id, v.tag_id));
  for (const e of state.entries.values()) await idb.put(db, 'entries', e, entryKey(e.habit_id, e.date));

  emit();
}

export async function applyHabitRemote(h) {
  state.habits.set(h.id, h);
  await idb.put(db, 'habits', h, h.id);
}
export async function applyHabitRemoteDelete(id) {
  state.habits.delete(id);
  await idb.del(db, 'habits', id);
  for (const [k, e] of [...state.entries]) {
    if (e.habit_id === id) { state.entries.delete(k); await idb.del(db, 'entries', k); }
  }
  for (const [k, v] of [...state.habitTags]) {
    if (v.habit_id === id) { state.habitTags.delete(k); await idb.del(db, 'habit_tags', k); }
  }
}
export async function applyTagRemote(t) {
  state.tags.set(t.id, t);
  await idb.put(db, 'tags', t, t.id);
}
export async function applyTagRemoteDelete(id) {
  state.tags.delete(id);
  await idb.del(db, 'tags', id);
  for (const [k, v] of [...state.habitTags]) {
    if (v.tag_id === id) { state.habitTags.delete(k); await idb.del(db, 'habit_tags', k); }
  }
}
export async function applyEntryRemote(e) {
  const key = entryKey(e.habit_id, e.date);
  state.entries.set(key, e);
  await idb.put(db, 'entries', e, key);
}
export async function applyEntryRemoteDelete(habitId, date) {
  const key = entryKey(habitId, date);
  state.entries.delete(key);
  await idb.del(db, 'entries', key);
}
export async function applyHabitTagRemote(v) {
  const key = tagKey(v.habit_id, v.tag_id);
  state.habitTags.set(key, v);
  await idb.put(db, 'habit_tags', v, key);
}
export async function applyHabitTagRemoteDelete(habitId, tagId) {
  const key = tagKey(habitId, tagId);
  state.habitTags.delete(key);
  await idb.del(db, 'habit_tags', key);
}
export async function setLastRev(rev) {
  await setMeta('last_rev', rev);
}
export async function removeQueueItems(qids) {
  for (const qid of qids) {
    state.queue.delete(qid);
    await idb.del(db, 'queue', qid);
  }
}
export function flushRemote() {
  emit();
}
