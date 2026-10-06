// ui-stats.js — экран «Статистика» в iOS-стиле
import * as store from './store.js';
import * as metrics from './metrics.js';

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

let period = 'week';
let charts = [];
let chartsToInit = [];

const PERIOD_LABELS = { week: 'Неделя', month: 'Месяц', all: 'Всё время' };

export function destroyCharts() {
  for (const ch of charts) { try { ch.destroy(); } catch (e) { /* ignore */ } }
  charts = [];
  chartsToInit = [];
}

function configureChartDefaults() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.color = 'rgba(235, 235, 245, 0.62)';
  Chart.defaults.font.family = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
  Chart.defaults.font.size = 11;
  Chart.defaults.borderColor = 'rgba(84, 84, 88, 0.35)';
}

function addChart(el, type, data, options) {
  chartsToInit.push({ el, type, data, options });
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

function empty(text) {
  const d = document.createElement('div');
  d.className = 'empty-state';
  d.textContent = text;
  return d;
}

function ringSvg(percent, size, stroke, color) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, percent));
  const offset = c * (1 - p);
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="${stroke}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${offset}" transform="rotate(-90 ${size / 2} ${size / 2})"
        style="transition: stroke-dashoffset 0.6s cubic-bezier(0.2,0.8,0.2,1)"/>
    </svg>`;
}

const barOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: {
      beginAtZero: true, max: 100,
      ticks: { callback: (v) => v + '%', stepSize: 25, color: 'rgba(235,235,245,0.4)' },
      grid: { color: 'rgba(84,84,88,0.3)' },
      border: { display: false },
    },
    x: { grid: { display: false }, border: { display: false }, ticks: { color: 'rgba(235,235,245,0.4)' } },
  },
};

const lineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: {
      beginAtZero: true, max: 100,
      ticks: { callback: (v) => v + '%', stepSize: 25, color: 'rgba(235,235,245,0.4)' },
      grid: { color: 'rgba(84,84,88,0.3)' },
      border: { display: false },
    },
    x: { grid: { display: false }, border: { display: false }, ticks: { color: 'rgba(235,235,245,0.4)', maxTicksLimit: 7 } },
  },
};

export function render(container) {
  configureChartDefaults();
  destroyCharts();

  const today = metrics.todayStr();
  const { from, to } = metrics.periodRange(period);

  container.innerHTML = '';

  // Сегментированный селектор периода
  const seg = document.createElement('div');
  seg.className = 'segmented';
  for (const p of ['week', 'month', 'all']) {
    const b = document.createElement('button');
    b.className = 'segment' + (p === period ? ' active' : '');
    b.textContent = PERIOD_LABELS[p];
    b.setAttribute('aria-pressed', String(p === period));
    b.addEventListener('click', () => { period = p; render(container); });
    seg.appendChild(b);
  }
  container.appendChild(seg);
  container.appendChild(sectionHeader('Обзор'));
  container.appendChild(kpiCard(today));

  container.appendChild(sectionHeader('По неделям'));
  container.appendChild(weeklyCard());

  container.appendChild(sectionHeader('Динамика · 30 дней'));
  container.appendChild(dailyCard());

  container.appendChild(sectionHeader('Привычки'));
  container.appendChild(perHabitCard(from, to));

  container.appendChild(sectionHeader('ТОП внедрённых'));
  container.appendChild(topCard(from, to));

  container.appendChild(sectionHeader('Рейтинг повторений'));
  container.appendChild(rankingCard(from, to));

  initCharts();
}

function kpiCard(today) {
  const overall = metrics.overallPercent();
  const ws = metrics.startOfWeek(today);
  const delta = metrics.weekDelta(ws);
  const pct = Math.round(overall.percent * 100);

  const c = card();
  const row = document.createElement('div');
  row.className = 'kpi-row';
  row.style.padding = '20px 16px';

  const ringWrap = document.createElement('div');
  ringWrap.className = 'kpi-ring';
  ringWrap.setAttribute('role', 'img');
  ringWrap.setAttribute('aria-label', `Общий прогресс: ${pct}% (${overall.done} из ${overall.total})`);
  ringWrap.innerHTML = ringSvg(overall.percent, 120, 10, pct > 0 ? '#22c55e' : 'rgba(255,255,255,0.14)');
  const ringCenter = document.createElement('div');
  ringCenter.className = 'ring-pct';
  ringCenter.innerHTML = `<b>${pct}%</b><span>${overall.done}/${overall.total}</span>`;
  ringWrap.appendChild(ringCenter);

  const w2w = document.createElement('div');
  w2w.className = 'w2w';
  const cur = Math.round(delta.current * 100);
  const d = Math.round(delta.delta * 100);
  const direction = d > 0 ? 'up' : (d < 0 ? 'down' : 'even');
  w2w.innerHTML = `
    <div class="w2w-label">Неделя к неделе</div>
    <div class="w2w-cur">${cur}%</div>
    <div class="w2w-delta ${direction}">${d > 0 ? '↑' : (d < 0 ? '↓' : '→')} ${Math.abs(d)} п.п. за неделю</div>
  `;

  row.appendChild(ringWrap);
  row.appendChild(w2w);
  c.appendChild(row);
  return c;
}

function weeklyCard() {
  const weeks = metrics.lastNWeeks(8);
  const c = card();
  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';
  wrap.style.padding = '14px 14px 10px';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Процент выполнения привычек за последние восемь недель');
  wrap.appendChild(canvas);
  c.appendChild(wrap);
  addChart(canvas, 'bar', {
    labels: weeks.map((w) => metrics.fmtMonthDay(w.start)),
    datasets: [{
      label: '% недели',
      data: weeks.map((w) => Math.round(w.percent * 100)),
      backgroundColor: 'rgba(34, 211, 238, 0.75)',
      borderColor: '#22d3ee',
      borderWidth: 0,
      borderRadius: 3,
      borderSkipped: false,
    }],
  }, barOptions);
  return c;
}

function dailyCard() {
  const days = metrics.lastNDays(30);
  const c = card();
  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';
  wrap.style.padding = '14px 14px 10px';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Динамика выполнения привычек за последние тридцать дней');
  wrap.appendChild(canvas);
  c.appendChild(wrap);
  addChart(canvas, 'line', {
    labels: days.map((d) => metrics.fmtMonthDay(d.date)),
    datasets: [{
      label: '% дня',
      data: days.map((d) => Math.round(d.percent * 100)),
      fill: true,
      backgroundColor: 'rgba(34, 211, 238, 0.12)',
      borderColor: '#22d3ee',
      borderWidth: 2,
      tension: 0.35,
      pointRadius: 0,
    }],
  }, lineOptions);
  return c;
}

function perHabitCard(from, to) {
  const c = card();
  const pad = document.createElement('div');
  pad.className = 'card-pad';
  const habits = store.getHabits().filter((h) => !h.archived).sort((a, b) => a.sort_order - b.sort_order);
  if (!habits.length) { c.appendChild(empty('Нет привычек')); return c; }

  for (const h of habits) {
    const s = metrics.habitPeriodStats(h, from, to);
    if (!s.days) continue;
    const pct = Math.round(s.percent * 100);
    const item = document.createElement('div');
    item.className = 'stat-item';
    item.innerHTML = `
      <div class="hs-head">
        <span class="hs-name">${escapeHtml(h.emoji)} ${escapeHtml(h.title)}</span>
        <span class="hs-pct">${pct}%</span>
      </div>
      <div class="bar"><div class="bar-fill bar-purple" style="width:${pct}%"></div></div>
      <div class="hs-sub">🔥 ${metrics.currentStreak(h)} · ⚡ ${metrics.bestStreak(h)} · ${s.done}/${s.days} дн.</div>
    `;
    pad.appendChild(item);
  }
  c.appendChild(pad);
  return c;
}

function topCard(from, to) {
  const c = card();
  const pad = document.createElement('div');
  pad.className = 'card-pad';
  const top = metrics.topHabits(from, to);
  if (!top.length) { c.appendChild(empty('Недостаточно данных')); return c; }

  for (const s of top) {
    const pct = Math.round(s.percent * 100);
    const item = document.createElement('div');
    item.className = 'top-item';
    item.innerHTML = `
      <div class="top-head">
        <span class="top-name">${escapeHtml(s.habit.emoji)} ${escapeHtml(s.habit.title)}</span>
        <span class="top-pct">${pct}%</span>
      </div>
      <div class="bar"><div class="bar-fill bar-magenta" style="width:${pct}%"></div></div>
    `;
    pad.appendChild(item);
  }
  c.appendChild(pad);
  return c;
}

function rankingCard(from, to) {
  const c = card();
  const pad = document.createElement('div');
  pad.className = 'card-pad';
  const rank = metrics.rankingByRepetitions(from, to).filter((s) => s.days > 0);
  if (!rank.length) { c.appendChild(empty('Недостаточно данных')); return c; }

  const head = document.createElement('div');
  head.className = 'rank-row rank-head';
  head.innerHTML = '<span>Привычка</span><span>Σ</span><span>%</span>';
  pad.appendChild(head);

  for (const s of rank) {
    const row = document.createElement('div');
    row.className = 'rank-row';
    row.innerHTML = `<span>${escapeHtml(s.habit.emoji)} ${escapeHtml(s.habit.title)}</span><span>${s.done}</span><span>${Math.round(s.percent * 100)}%</span>`;
    pad.appendChild(row);
  }
  c.appendChild(pad);
  return c;
}

function initCharts() {
  if (typeof Chart === 'undefined') return;
  for (const cfg of chartsToInit) {
    charts.push(new Chart(cfg.el, { type: cfg.type, data: cfg.data, options: cfg.options }));
  }
  chartsToInit = [];
}
