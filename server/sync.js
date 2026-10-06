'use strict';

const express = require('express');
const crypto = require('crypto');

function maxRev(db) {
  return db.prepare('SELECT COALESCE(MAX(rev), 0) AS rev FROM changes').get().rev;
}

function recordChange(db, entity, rowId, op, updatedAt) {
  const info = db
    .prepare('INSERT INTO changes (entity, row_id, op, updated_at) VALUES (?, ?, ?, ?)')
    .run(entity, rowId, op, updatedAt);
  return info.lastInsertRowid;
}

const habitTagKey = (habitId, tagId) => `${habitId}|${tagId}`;

function habitToData(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    emoji: row.emoji,
    color: row.color,
    target_value: row.target_value,
    target_unit: row.target_unit,
    sort_order: row.sort_order,
    archived: row.archived,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function entryToData(row) {
  if (!row) return null;
  return {
    id: row.id,
    habit_id: row.habit_id,
    date: row.date,
    done: row.done,
    value: row.value,
    updated_at: row.updated_at,
  };
}

function tagToData(row) {
  if (!row) return null;
  return { id: row.id, name: row.name };
}

function applyHabit(db, c) {
  const existing = db.prepare('SELECT * FROM habits WHERE id = ?').get(c.id);

  if (c.op === 'delete') {
    if (!existing) return null;
    if (existing.updated_at >= c.updated_at) return null;
    // Каскад: записываем удаление зависимых записей, чтобы другие клиенты тоже их удалили.
    for (const e of db.prepare('SELECT id FROM entries WHERE habit_id = ?').all(c.id)) {
      recordChange(db, 'entry', e.id, 'delete', c.updated_at);
    }
    for (const l of db.prepare('SELECT habit_id, tag_id FROM habit_tags WHERE habit_id = ?').all(c.id)) {
      recordChange(db, 'habit_tag', habitTagKey(l.habit_id, l.tag_id), 'delete', c.updated_at);
    }
    db.prepare('DELETE FROM habits WHERE id = ?').run(c.id);
    recordChange(db, 'habit', c.id, 'delete', c.updated_at);
    return c.id;
  }

  const d = c.data || {};
  const row = {
    title: d.title != null ? String(d.title) : '',
    emoji: d.emoji != null ? String(d.emoji) : '',
    color: d.color || '#22d3ee',
    target_value: d.target_value != null ? d.target_value : null,
    target_unit: d.target_unit != null ? String(d.target_unit) : null,
    sort_order: Number.isFinite(d.sort_order) ? d.sort_order : 0,
    archived: d.archived ? 1 : 0,
  };

  if (!existing) {
    db.prepare(`
      INSERT INTO habits (id, title, emoji, color, target_value, target_unit, sort_order, archived, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      c.id, row.title, row.emoji, row.color, row.target_value, row.target_unit,
      row.sort_order, row.archived, d.created_at || c.updated_at, c.updated_at
    );
    recordChange(db, 'habit', c.id, 'upsert', c.updated_at);
    return c.id;
  }

  if (existing.updated_at >= c.updated_at) return existing.id;

  db.prepare(`
    UPDATE habits SET title=?, emoji=?, color=?, target_value=?, target_unit=?, sort_order=?, archived=?, updated_at=?
    WHERE id=?
  `).run(
    row.title, row.emoji, row.color, row.target_value, row.target_unit,
    row.sort_order, row.archived, c.updated_at, c.id
  );
  recordChange(db, 'habit', c.id, 'upsert', c.updated_at);
  return c.id;
}

function applyEntry(db, c) {
  if (c.op === 'delete') {
    const d = c.data || {};
    let existing;
    if (d.habit_id != null && d.date != null) {
      existing = db.prepare('SELECT * FROM entries WHERE habit_id = ? AND date = ?').get(d.habit_id, d.date);
    } else {
      existing = db.prepare('SELECT * FROM entries WHERE id = ?').get(c.id);
    }
    if (!existing) return null;
    if (existing.updated_at >= c.updated_at) return null;
    db.prepare('DELETE FROM entries WHERE id = ?').run(existing.id);
    recordChange(db, 'entry', existing.id, 'delete', c.updated_at);
    return existing.id;
  }

  const d = c.data || {};
  const done = d.done ? 1 : 0;
  const value = d.value != null ? d.value : null;
  const existing = db.prepare('SELECT * FROM entries WHERE habit_id = ? AND date = ?').get(d.habit_id, d.date);

  if (!existing) {
    const id = c.id || crypto.randomUUID();
    db.prepare('INSERT INTO entries (id, habit_id, date, done, value, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, d.habit_id, d.date, done, value, c.updated_at);
    recordChange(db, 'entry', id, 'upsert', c.updated_at);
    return id;
  }

  if (existing.updated_at >= c.updated_at) return existing.id;

  db.prepare('UPDATE entries SET done=?, value=?, updated_at=? WHERE id=?')
    .run(done, value, c.updated_at, existing.id);
  recordChange(db, 'entry', existing.id, 'upsert', c.updated_at);
  return existing.id;
}

function applyTag(db, c) {
  const d = c.data || {};
  const byId = db.prepare('SELECT * FROM tags WHERE id = ?').get(c.id);

  if (c.op === 'delete') {
    if (!byId) return null;
    for (const l of db.prepare('SELECT habit_id, tag_id FROM habit_tags WHERE tag_id = ?').all(c.id)) {
      recordChange(db, 'habit_tag', habitTagKey(l.habit_id, l.tag_id), 'delete', c.updated_at);
    }
    db.prepare('DELETE FROM tags WHERE id = ?').run(c.id);
    recordChange(db, 'tag', c.id, 'delete', c.updated_at);
    return c.id;
  }

  const name = d.name != null ? String(d.name) : '';
  const byName = db.prepare('SELECT * FROM tags WHERE name = ?').get(name);
  if (byName && byName.id !== c.id) {
    // Тег с таким именем уже есть — слить на существующий id (без дубликатов).
    recordChange(db, 'tag', byName.id, 'upsert', c.updated_at);
    return byName.id;
  }
  if (byId) {
    if (byId.name !== name) {
      db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(name, c.id);
      recordChange(db, 'tag', c.id, 'upsert', c.updated_at);
    }
    return c.id;
  }
  db.prepare('INSERT INTO tags (id, name) VALUES (?, ?)').run(c.id, name);
  recordChange(db, 'tag', c.id, 'upsert', c.updated_at);
  return c.id;
}

function applyHabitTag(db, c) {
  const d = c.data || {};
  const habitId = d.habit_id;
  const tagId = d.tag_id;
  const rowId = habitTagKey(habitId, tagId);

  if (c.op === 'delete') {
    db.prepare('DELETE FROM habit_tags WHERE habit_id = ? AND tag_id = ?').run(habitId, tagId);
    recordChange(db, 'habit_tag', rowId, 'delete', c.updated_at);
    return rowId;
  }

  const habitExists = db.prepare('SELECT 1 FROM habits WHERE id = ?').get(habitId);
  const tagExists = db.prepare('SELECT 1 FROM tags WHERE id = ?').get(tagId);
  if (!habitExists || !tagExists) return rowId; // родитель ещё не синхронизирован — пропустить

  db.prepare('INSERT OR IGNORE INTO habit_tags (habit_id, tag_id) VALUES (?, ?)').run(habitId, tagId);
  recordChange(db, 'habit_tag', rowId, 'upsert', c.updated_at);
  return rowId;
}

function readEntityData(db, entity, rowId) {
  switch (entity) {
    case 'habit':
      return habitToData(db.prepare('SELECT * FROM habits WHERE id = ?').get(rowId));
    case 'entry':
      return entryToData(db.prepare('SELECT * FROM entries WHERE id = ?').get(rowId));
    case 'tag':
      return tagToData(db.prepare('SELECT * FROM tags WHERE id = ?').get(rowId));
    case 'habit_tag': {
      const i = rowId.indexOf('|');
      const habitId = rowId.slice(0, i);
      const tagId = rowId.slice(i + 1);
      const row = db.prepare('SELECT habit_id, tag_id FROM habit_tags WHERE habit_id = ? AND tag_id = ?').get(habitId, tagId);
      return row ? { habit_id: row.habit_id, tag_id: row.tag_id } : null;
    }
    default:
      return null;
  }
}

function bootstrap(db) {
  return {
    habits: db.prepare('SELECT * FROM habits ORDER BY sort_order ASC, created_at ASC').all().map(habitToData),
    tags: db.prepare('SELECT * FROM tags ORDER BY name ASC').all().map(tagToData),
    habit_tags: db.prepare('SELECT habit_id, tag_id FROM habit_tags').all().map((r) => ({ habit_id: r.habit_id, tag_id: r.tag_id })),
    entries: db.prepare('SELECT * FROM entries').all().map(entryToData),
    rev: maxRev(db),
  };
}

const ENTITY_ORDER = { habit: 0, tag: 1, entry: 2, habit_tag: 3 };

function applySync(db, sinceRev, incoming) {
  const sorted = (Array.isArray(incoming) ? incoming : []).slice().sort((a, b) => {
    const ao = Object.prototype.hasOwnProperty.call(ENTITY_ORDER, a.entity) ? ENTITY_ORDER[a.entity] : 9;
    const bo = Object.prototype.hasOwnProperty.call(ENTITY_ORDER, b.entity) ? ENTITY_ORDER[b.entity] : 9;
    return ao - bo;
  });

  const tx = db.transaction((changes) => {
    for (const c of changes) {
      if (!c || !c.entity || !c.id) continue;
      switch (c.entity) {
        case 'habit': applyHabit(db, c); break;
        case 'entry': applyEntry(db, c); break;
        case 'tag': applyTag(db, c); break;
        case 'habit_tag': applyHabitTag(db, c); break;
        default: break;
      }
    }
  });
  tx(sorted);

  const rows = db.prepare('SELECT rev, entity, row_id, op, updated_at FROM changes WHERE rev > ? ORDER BY rev ASC').all(sinceRev);
  const changes = rows.map((r) => ({
    entity: r.entity,
    id: r.row_id,
    op: r.op,
    updated_at: r.updated_at,
    data: r.op === 'delete' ? null : readEntityData(db, r.entity, r.row_id),
  }));

  return { changes, rev: maxRev(db) };
}

function syncRouter(db) {
  const router = express.Router();

  router.get('/bootstrap', (req, res) => {
    res.json(bootstrap(db));
  });

  router.post('/sync', (req, res) => {
    const body = req.body || {};
    const sinceRev = Number.isInteger(body.since_rev) ? body.since_rev : 0;
    try {
      res.json(applySync(db, sinceRev, body.changes));
    } catch (e) {
      res.status(500).json({ error: (e && e.message) || 'sync error' });
    }
  });

  return router;
}

module.exports = { syncRouter, maxRev, bootstrap, applySync };
