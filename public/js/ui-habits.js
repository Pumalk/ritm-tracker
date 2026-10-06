// ui-habits.js — экран «Привычки» (CRUD, теги, архив, сортировка)
import * as store from './store.js';
import * as metrics from './metrics.js';

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

const COLORS = ['#22d3ee', '#4ade80', '#e879f9', '#facc15', '#fb923c', '#f87171', '#a78bfa', '#60a5fa'];
const EMOJIS = ['💧', '🚶', '📚', '🏃', '🧘', '🥗', '😴', '💊', '🧠', '✍️', '🎸', '🌱', '☀️', '📵'];

const ICON_EDIT = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const ICON_ARCHIVE = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M9 13h6"/></svg>';

function tint(hex, alpha) {
  const h = String(hex || '#22d3ee').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function sectionHeader(title) {
  const h = document.createElement('div');
  h.className = 'section-header';
  h.textContent = title;
  return h;
}

function card() {
  const c = document.createElement('section');
  c.className = 'card';
  return c;
}

export function render(container) {
  container.innerHTML = '';

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = '+ Добавить привычку';
  addBtn.addEventListener('click', () => openForm(container));
  container.appendChild(addBtn);

  const habits = store.getHabits().filter((h) => !h.archived).sort((a, b) => a.sort_order - b.sort_order);

  container.appendChild(sectionHeader('Активные'));
  const list = card();
  if (habits.length) {
    habits.forEach((h, i) => list.appendChild(habitRow(h, i, habits.length, container)));
  } else {
    const e = document.createElement('div');
    e.className = 'empty-state';
    e.innerHTML = '<span class="big">🌱</span>Пока нет привычек.';
    list.appendChild(e);
  }
  container.appendChild(list);

  const archived = store.getHabits().filter((h) => h.archived);
  if (archived.length) {
    container.appendChild(sectionHeader('Архив'));
    const arc = card();
    for (const h of archived) {
      const row = document.createElement('div');
      row.className = 'habit-row archived';
      const chip = document.createElement('span');
      chip.className = 'habit-emoji';
      chip.style.background = tint(h.color, 0.16);
      chip.textContent = h.emoji || '✨';
      const info = document.createElement('div');
      info.className = 'habit-info';
      info.innerHTML = `<div class="habit-title">${escapeHtml(h.title)}</div>`;
      const restore = document.createElement('button');
      restore.className = 'btn btn-ghost';
      restore.textContent = 'Восстановить';
      restore.addEventListener('click', () => store.putHabit({ ...h, archived: 0 }));
      row.appendChild(chip);
      row.appendChild(info);
      row.appendChild(restore);
      arc.appendChild(row);
    }
    container.appendChild(arc);
  }
}

function habitRow(h, i, total, container) {
  const row = document.createElement('div');
  row.className = 'habit-row';

  const chip = document.createElement('span');
  chip.className = 'habit-emoji';
  chip.style.background = tint(h.color, 0.16);
  chip.textContent = h.emoji || '✨';

  const info = document.createElement('div');
  info.className = 'habit-info';
  const title = document.createElement('div');
  title.className = 'habit-title';
  title.textContent = h.title;
  info.appendChild(title);
  const metaText = metaLabel(h);
  if (metaText) {
    const meta = document.createElement('div');
    meta.className = 'habit-meta';
    meta.textContent = metaText;
    info.appendChild(meta);
  }

  const controls = document.createElement('div');
  controls.className = 'habit-controls';

  const up = document.createElement('button');
  up.type = 'button';
  up.className = 'icon-btn';
  up.textContent = '▲';
  up.title = `Поднять: ${h.title}`;
  up.setAttribute('aria-label', `Поднять «${h.title}»`);
  up.disabled = i === 0;
  up.addEventListener('click', () => reorder(h.id, -1));

  const down = document.createElement('button');
  down.type = 'button';
  down.className = 'icon-btn';
  down.textContent = '▼';
  down.title = `Опустить: ${h.title}`;
  down.setAttribute('aria-label', `Опустить «${h.title}»`);
  down.disabled = i === total - 1;
  down.addEventListener('click', () => reorder(h.id, 1));

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'icon-btn';
  edit.innerHTML = ICON_EDIT;
  edit.title = `Редактировать: ${h.title}`;
  edit.setAttribute('aria-label', `Редактировать «${h.title}»`);
  edit.addEventListener('click', () => openForm(container, h));

  const archive = document.createElement('button');
  archive.type = 'button';
  archive.className = 'icon-btn';
  archive.innerHTML = ICON_ARCHIVE;
  archive.title = `В архив: ${h.title}`;
  archive.setAttribute('aria-label', `Архивировать «${h.title}»`);
  archive.addEventListener('click', () => store.putHabit({ ...h, archived: 1 }));

  controls.append(up, down, edit, archive);
  row.appendChild(chip);
  row.appendChild(info);
  row.appendChild(controls);
  return row;
}

function metaLabel(h) {
  const parts = [];
  const ids = store.getHabitTagIds(h.id);
  for (const id of ids) {
    const t = store.getTag(id);
    if (t) parts.push('#' + t.name);
  }
  if (h.target_value != null) {
    parts.push(`🎯 ${metrics.fmtNum(h.target_value)}${h.target_unit ? ' ' + h.target_unit : ''}`);
  }
  return parts.join('  ');
}

function reorder(id, dir) {
  const habits = store.getHabits().filter((h) => !h.archived).sort((a, b) => a.sort_order - b.sort_order);
  const idx = habits.findIndex((h) => h.id === id);
  const j = idx + dir;
  if (idx < 0 || j < 0 || j >= habits.length) return;
  const a = habits[idx];
  const b = habits[j];
  const so = a.sort_order;
  store.putHabit({ ...a, sort_order: b.sort_order });
  store.putHabit({ ...b, sort_order: so });
}

function openForm(container, habit) {
  const isEdit = !!habit;
  const base = habit || { title: '', emoji: '✨', color: COLORS[0], target_value: null, target_unit: '' };
  let color = base.color;
  const selectedTags = new Set(isEdit ? store.getHabitTagIds(habit.id) : []);

  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';

  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = `
    <div class="sheet-grabber"></div>
    <h2 class="sheet-title">${isEdit ? 'Редактировать' : 'Новая привычка'}</h2>

    <label class="field">
      <span>Название</span>
      <input type="text" id="f-title" value="${escapeHtml(base.title)}" placeholder="Например: Пить воду">
    </label>

    <div class="field">
      <span>Эмодзи</span>
      <div class="emoji-row" id="f-emoji-row"></div>
      <input type="text" id="f-emoji" value="${escapeHtml(base.emoji)}" maxlength="4">
    </div>

    <div class="field">
      <span>Цвет</span>
      <div class="swatches" id="f-swatches"></div>
    </div>

    <div class="field">
      <span>Теги</span>
      <div class="chips" id="f-chips"></div>
      <div class="chip-add">
        <input type="text" id="f-newtag" placeholder="Новый тег">
        <button id="f-addtag" class="btn btn-ghost">+</button>
      </div>
    </div>

    <label class="field">
      <span>Числовая цель (опционально)</span>
      <div class="target-row">
        <input type="number" id="f-target" min="0.01" step="any" value="${base.target_value != null ? base.target_value : ''}" placeholder="Значение">
        <input type="text" id="f-unit" value="${escapeHtml(base.target_unit || '')}" placeholder="ед. (л, шагов…)">
      </div>
      <span class="field-error" id="f-target-error" role="alert"></span>
    </label>

    <div class="sheet-actions">
      <button id="f-cancel" class="btn btn-ghost">Отмена</button>
      <button id="f-save" class="btn btn-primary">Сохранить</button>
    </div>
  `;
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  // Свотчи цвета
  const swatchBox = sheet.querySelector('#f-swatches');
  function renderSwatches() {
    swatchBox.innerHTML = '';
    for (const c of COLORS) {
      const s = document.createElement('button');
      s.type = 'button';
      s.className = 'swatch' + (c === color ? ' active' : '');
      s.style.background = c;
      s.setAttribute('aria-label', `Цвет ${c}`);
      s.setAttribute('aria-pressed', String(c === color));
      s.addEventListener('click', () => { color = c; renderSwatches(); });
      swatchBox.appendChild(s);
    }
  }
  renderSwatches();

  // Быстрые эмодзи
  const emojiRow = sheet.querySelector('#f-emoji-row');
  for (const em of EMOJIS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'emoji-pick';
    b.textContent = em;
    b.setAttribute('aria-label', `Эмодзи ${em}`);
    b.addEventListener('click', () => { sheet.querySelector('#f-emoji').value = em; });
    emojiRow.appendChild(b);
  }

  // Чипы тегов
  const chipsBox = sheet.querySelector('#f-chips');
  function renderChips() {
    chipsBox.innerHTML = '';
    const tags = store.getTags();
    if (!tags.length) {
      const hint = document.createElement('span');
      hint.className = 'muted';
      hint.textContent = 'Тегов пока нет — создайте ниже.';
      chipsBox.appendChild(hint);
    }
    for (const t of tags) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (selectedTags.has(t.id) ? ' active' : '');
      chip.textContent = '#' + t.name;
      chip.setAttribute('aria-pressed', String(selectedTags.has(t.id)));
      chip.addEventListener('click', () => {
        if (selectedTags.has(t.id)) selectedTags.delete(t.id);
        else selectedTags.add(t.id);
        renderChips();
      });
      chipsBox.appendChild(chip);
    }
  }
  renderChips();

  sheet.querySelector('#f-addtag').addEventListener('click', async () => {
    const input = sheet.querySelector('#f-newtag');
    const name = input.value.trim();
    if (!name) return;
    const t = store.getTags().find((x) => x.name.toLowerCase() === name.toLowerCase())
      || await store.putTag({ name });
    selectedTags.add(t.id);
    input.value = '';
    renderChips();
  });

  sheet.querySelector('#f-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  sheet.querySelector('#f-save').addEventListener('click', async () => {
    const title = sheet.querySelector('#f-title').value.trim();
    if (!title) {
      sheet.querySelector('#f-title').focus();
      return;
    }
    const emoji = sheet.querySelector('#f-emoji').value.trim() || '✨';
    const targetRaw = sheet.querySelector('#f-target').value.trim();
    const unit = sheet.querySelector('#f-unit').value.trim();
    const target_value = targetRaw === '' ? null : Number(targetRaw);
    const targetError = sheet.querySelector('#f-target-error');
    if (target_value != null && (!Number.isFinite(target_value) || target_value <= 0)) {
      targetError.textContent = 'Укажите число больше нуля или оставьте поле пустым.';
      sheet.querySelector('#f-target').focus();
      return;
    }
    targetError.textContent = '';

    const data = {
      id: habit ? habit.id : null,
      title,
      emoji,
      color,
      target_value,
      target_unit: unit || null,
      created_at: habit ? habit.created_at : null,
      sort_order: habit ? habit.sort_order : null,
      archived: habit ? habit.archived : 0,
    };

    if (!isEdit && data.sort_order == null) {
      const existing = store.getHabits();
      data.sort_order = existing.reduce((m, h) => Math.max(m, h.sort_order), -1) + 1;
    }

    const saved = await store.putHabit(data);

    if (isEdit) {
      const current = store.getHabitTagIds(saved.id);
      for (const id of current) if (!selectedTags.has(id)) await store.unlinkTag(saved.id, id);
      for (const id of selectedTags) if (!current.includes(id)) await store.linkTag(saved.id, id);
    } else {
      for (const id of selectedTags) await store.linkTag(saved.id, id);
    }

    overlay.remove();
  });
}
