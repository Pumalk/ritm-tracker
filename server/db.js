'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.RITM_DB || path.join(DATA_DIR, 'ritm.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habits (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  emoji        TEXT NOT NULL DEFAULT '',
  color        TEXT NOT NULL DEFAULT '#22d3ee',
  target_value REAL,
  target_unit  TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  archived     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS habit_tags (
  habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  tag_id   TEXT NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
  PRIMARY KEY (habit_id, tag_id)
);

CREATE TABLE IF NOT EXISTS entries (
  id         TEXT PRIMARY KEY,
  habit_id   TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  skipped    INTEGER NOT NULL DEFAULT 0,
  value      REAL,
  updated_at TEXT NOT NULL,
  UNIQUE (habit_id, date)
);

CREATE TABLE IF NOT EXISTS changes (
  rev        INTEGER PRIMARY KEY AUTOINCREMENT,
  entity     TEXT NOT NULL,
  row_id     TEXT NOT NULL,
  op         TEXT NOT NULL DEFAULT 'upsert',
  updated_at TEXT NOT NULL
);
`;

function nowIso() {
  return new Date().toISOString();
}

function seed(db) {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM habits').get();
  if (c > 0) return;

  const habits = [
    { title: 'Выпить 2 л воды', emoji: '💧', color: '#22d3ee', target_value: 2, target_unit: 'л' },
    { title: 'Прогулка', emoji: '🚶', color: '#4ade80', target_value: 10000, target_unit: 'шагов' },
    { title: 'Чтение', emoji: '📚', color: '#a78bfa', target_value: null, target_unit: null },
  ];

  const insert = db.prepare(`
    INSERT INTO habits (id, title, emoji, color, target_value, target_unit, sort_order, archived, created_at, updated_at)
    VALUES (@id, @title, @emoji, @color, @target_value, @target_unit, @sort_order, 0, @created_at, @updated_at)
  `);

  const tx = db.transaction((rows) => {
    rows.forEach((h, i) => {
      const t = nowIso();
      insert.run({
        id: crypto.randomUUID(),
        title: h.title,
        emoji: h.emoji,
        color: h.color,
        target_value: h.target_value,
        target_unit: h.target_unit,
        sort_order: i,
        created_at: t,
        updated_at: t,
      });
    });
  });
  tx(habits);
}

function initDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  seed(db);
  return db;
}

module.exports = { initDb, DB_PATH, nowIso };
