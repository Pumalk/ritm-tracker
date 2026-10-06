// ui-grid.js — экран «Сегодня»: карточка дня + недельная сетка
import * as store from './store.js';
import * as metrics from './metrics.js';

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

let weekStart = metrics.startOfWeek(metrics.todayStr());

export function getWeekStart() { return weekStart; }
export function setWeekStart(ws) { weekStart = ws; }
export function shiftWeek(delta) {
  weekStart = metrics.addDays(weekStart, delta * 7);
  return weekStart;
}

function tint(hex, alpha) {
  const h = String(hex || '#22d3ee').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function checkButton(done, locked) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'check' + (done ? ' done' : '');
  b.disabled = !!locked;
  b.setAttribute('aria-label', done ? 'Снять отметку' : 'Отметить выполненным');
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M6.5 12.5l3.5 3.5 7.5-8" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return b;
}

function progressRing(percent, size, stroke, centerText) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, percent));
  const offset = c * (1 - p);
  const color = p > 0 ? '#22c55e' : 'rgba(255,255,255,0.16)';
  return `
    <div class="progress-ring" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="${stroke}"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
          stroke-dasharray="${c}" stroke-dashoffset="${offset}" transform="rotate(-90 ${size / 2} ${size / 2})"
          style="transition: stroke-dashoffset 0.5s cubic-bezier(0.2,0.8,0.2,1)"/>
      </svg>
      <div class="ring-center">${escapeHtml(centerText)}</div>
    </div>`;
}

function formatFullDate(dateStr) {
  const d = metrics.parseDate(dateStr);
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

function toggle(h, date) {
  const e = store.getEntry(h.id, date);
  store.setEntry(h.id, date, e && e.done ? 0 : 1, e ? e.value : null);
}

function metaLabel(h) {
  const ids = store.getHabitTagIds(h.id);
  if (!ids.length) return '';
  return ids.map((id) => store.getTag(id)?.name).filter(Boolean).map((n) => '#' + n).join('  ');
}

function emojiChip(h) {
  const chip = document.createElement('span');
  chip.className = 'habit-emoji';
  chip.style.background = tint(h.color, 0.16);
  chip.textContent = h.emoji || '✨';
  return chip;
}

function buildValueField(h, date, side) {
  const e = store.getEntry(h.id, date);
  const done = !!(e && e.done);

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'value-field';
  input.inputMode = 'decimal';
  input.min = '0';
  input.step = 'any';
  input.placeholder = '—';
  if (e && e.value != null) input.value = e.value;
  input.addEventListener('change', () => {
    if (!input.validity.valid) {
      input.reportValidity();
      return;
    }
    const v = input.value.trim() === '' ? null : Number(input.value);
    store.setEntry(h.id, date, done ? 1 : 0, v);
  });
  input.addEventListener('click', (ev) => ev.stopPropagation());

  const unit = document.createElement('span');
  unit.className = 'value-unit';
  unit.textContent = '/ ' + metrics.fmtNum(h.target_value) + (h.target_unit ? ' ' + h.target_unit : '');

  side.appendChild(input);
  side.appendChild(unit);
}

function todayRow(h, today) {
  const e = store.getEntry(h.id, today);
  const done = !!(e && e.done);

  const row = document.createElement('div');
  row.className = 'today-row' + (done ? ' done' : '');

  const check = checkButton(done, false);
  check.addEventListener('click', (ev) => { ev.stopPropagation(); toggle(h, today); });

  const body = document.createElement('div');
  body.className = 'today-body';
  const title = document.createElement('div');
  title.className = 'today-title' + (done ? ' done' : '');
  title.textContent = h.title;
  body.appendChild(title);
  const metaText = metaLabel(h);
  if (metaText) {
    const meta = document.createElement('div');
    meta.className = 'today-meta';
    meta.textContent = metaText;
    body.appendChild(meta);
  }

  const side = document.createElement('div');
  side.className = 'today-side';
  if (h.target_value != null && done) {
    buildValueField(h, today, side);
  } else {
    const streak = metrics.currentStreak(h);
    if (streak > 0) {
      const chip = document.createElement('span');
      chip.className = 'streak-chip';
      chip.textContent = '🔥 ' + streak;
      side.appendChild(chip);
    }
  }

  row.appendChild(check);
  row.appendChild(emojiChip(h));
  row.appendChild(body);
  row.appendChild(side);
  row.addEventListener('click', () => toggle(h, today));
  return row;
}

function todayCard(today) {
  const habits = metrics.activeHabits(today)
    .sort((a, b) => a.sort_order - b.sort_order);
  const doneCount = habits.filter((h) => metrics.isDone(h.id, today)).length;
  const pct = habits.length ? doneCount / habits.length : 0;

  const card = document.createElement('section');
  card.className = 'card fade-in';

  const head = document.createElement('div');
  head.className = 'today-head';
  const headLeft = document.createElement('div');
  const dateLabel = document.createElement('div');
  dateLabel.className = 'today-date';
  dateLabel.textContent = formatFullDate(today);
  headLeft.appendChild(dateLabel);
  head.appendChild(headLeft);
  head.insertAdjacentHTML('beforeend', progressRing(pct, 46, 5, `${doneCount}/${habits.length}`));
  card.appendChild(head);

  if (!habits.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<span class="big">🌱</span>Привычек пока нет.<br>Добавьте первую на вкладке «Привычки».';
    card.appendChild(empty);
  } else {
    for (const h of habits) card.appendChild(todayRow(h, today));
  }
  return card;
}

function weekLabel(days) {
  return `${metrics.fmtMonthDay(days[0])}–${metrics.fmtMonthDay(days[6])}`;
}

function gridCell(h, date, today) {
  const c = document.createElement('div');
  c.className = 'grid-cell';
  if (date === today) c.classList.add('is-today');

  const e = store.getEntry(h.id, date);
  const done = !!(e && e.done);
  const createdAt = new Date(h.created_at);
  const created = Number.isNaN(createdAt.valueOf())
    ? String(h.created_at).slice(0, 10)
    : metrics.toDateStr(createdAt);
  const locked = date > today || created > date;
  if (locked) c.classList.add('is-locked');

  const box = checkButton(done, locked);
  box.addEventListener('click', () => toggle(h, date));
  c.appendChild(box);

  if (h.target_value != null && done) {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'value-field';
    input.inputMode = 'decimal';
    input.min = '0';
    input.step = 'any';
    input.placeholder = '—';
    input.disabled = locked;
    if (e && e.value != null) input.value = e.value;
    input.addEventListener('change', () => {
      if (!input.validity.valid) {
        input.reportValidity();
        return;
      }
      const v = input.value.trim() === '' ? null : Number(input.value);
      store.setEntry(h.id, date, done ? 1 : 0, v);
    });
    input.addEventListener('click', (ev) => ev.stopPropagation());
    c.appendChild(input);
  }

  return c;
}

function weekGrid(today) {
  const days = metrics.weekDays(weekStart);
  const habits = store.getHabits().filter((h) => !h.archived).sort((a, b) => a.sort_order - b.sort_order);

  const scroll = document.createElement('div');
  scroll.className = 'grid-scroll';
  const grid = document.createElement('div');
  grid.className = 'grid';

  const head = document.createElement('div');
  head.className = 'grid-row';
  const corner = document.createElement('div');
  corner.className = 'grid-corner';
  head.appendChild(corner);
  for (let i = 0; i < 7; i++) {
    const d = days[i];
    const c = document.createElement('div');
    c.className = 'grid-head-cell';
    if (d <= today) {
      const activeCount = metrics.activeHabits(d).length;
      if (activeCount) {
        const pct = metrics.dayPercent(d);
        const cls = pct >= 0.8 ? 'ok' : (pct >= 0.4 ? 'warn' : 'bad');
        c.classList.add(`tint-${cls}`);
      }
    }
    c.innerHTML = `<span class="grid-day-name">${metrics.DAY_NAMES[i]}</span><span class="grid-day-num">${metrics.fmtDay(d)}</span>`;
    head.appendChild(c);
  }
  grid.appendChild(head);

  for (const h of habits) {
    const row = document.createElement('div');
    row.className = 'grid-row';
    const label = document.createElement('div');
    label.className = 'grid-habit-cell';
    label.appendChild(emojiChip(h));
    const titleSpan = document.createElement('span');
    titleSpan.className = 'habit-title';
    titleSpan.textContent = h.title;
    label.appendChild(titleSpan);
    row.appendChild(label);
    for (let i = 0; i < 7; i++) row.appendChild(gridCell(h, days[i], today));
    grid.appendChild(row);
  }

  scroll.appendChild(grid);
  return scroll;
}

export function render(container) {
  const today = metrics.todayStr();
  const days = metrics.weekDays(weekStart);

  container.innerHTML = '';

  // Карточка «Сегодня»
  container.appendChild(todayCard(today));

  // Заголовок и переключатель недели
  const header = document.createElement('div');
  header.className = 'section-header';
  header.textContent = 'Неделя';
  container.appendChild(header);

  const bar = document.createElement('div');
  bar.className = 'week-bar';
  bar.innerHTML = `
    <button class="icon-btn" id="week-prev" aria-label="Прошлая неделя">‹</button>
    <div class="week-label">${weekLabel(days)}</div>
    <button class="icon-btn" id="week-next" aria-label="Следующая неделя">›</button>
  `;
  bar.querySelector('#week-prev').addEventListener('click', () => { shiftWeek(-1); render(container); });
  const nextButton = bar.querySelector('#week-next');
  nextButton.disabled = weekStart >= metrics.startOfWeek(today);
  nextButton.addEventListener('click', () => {
    if (weekStart >= metrics.startOfWeek(today)) return;
    shiftWeek(1);
    render(container);
  });
  container.appendChild(bar);

  container.appendChild(weekGrid(today));
}
