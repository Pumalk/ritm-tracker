// metrics.js — формулы раздела 9 спецификации
import * as store from './store.js';

const pad = (n) => String(n).padStart(2, '0');

export const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function todayStr() {
  return toDateStr(new Date());
}
export function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}
export function startOfWeek(dateStr) { // понедельник
  const d = parseDate(dateStr);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return toDateStr(d);
}
export function weekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}
export function fmtDay(dateStr) { return dateStr.slice(8, 10); }
export function fmtMonthDay(dateStr) { return `${dateStr.slice(8, 10)}.${dateStr.slice(5, 7)}`; }
export const fmtNum = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0';
  return Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100);
};

function habitStartDate(habit) {
  const createdAt = new Date(habit.created_at);
  return Number.isNaN(createdAt.valueOf()) ? String(habit.created_at).slice(0, 10) : toDateStr(createdAt);
}

export function activeHabits(day) {
  return store.getHabits().filter((h) => {
    return !h.archived && habitStartDate(h) <= day;
  });
}

export function isDone(habitId, date) {
  const e = store.getEntry(habitId, date);
  return !!(e && e.done);
}

export function dayPercent(day) {
  const act = activeHabits(day);
  if (!act.length) return 0;
  let done = 0;
  for (const h of act) if (isDone(h.id, day)) done++;
  return done / act.length;
}

export function weekPercent(weekStart) {
  const today = todayStr();
  let total = 0;
  let done = 0;
  for (const d of weekDays(weekStart)) {
    if (d > today) break;
    const act = activeHabits(d);
    total += act.length;
    for (const h of act) if (isDone(h.id, d)) done++;
  }
  return total ? done / total : 0;
}

export function habitPeriodStats(habit, from, to) {
  const today = todayStr();
  const start = habitStartDate(habit);
  let cur = start > from ? start : from;
  const end = to < today ? to : today;
  let days = 0;
  let done = 0;
  while (cur <= end) {
    days++;
    if (isDone(habit.id, cur)) done++;
    cur = addDays(cur, 1);
  }
  return { days, done, percent: days ? done / days : 0 };
}

export function currentStreak(habit) {
  const start = habitStartDate(habit);
  let d = todayStr();
  if (!isDone(habit.id, d)) d = addDays(d, -1);
  let streak = 0;
  while (d >= start) {
    if (isDone(habit.id, d)) { streak++; d = addDays(d, -1); }
    else break;
  }
  return streak;
}

export function bestStreak(habit) {
  const start = habitStartDate(habit);
  const today = todayStr();
  let best = 0;
  let cur = 0;
  let d = start;
  while (d <= today) {
    if (isDone(habit.id, d)) { cur++; if (cur > best) best = cur; }
    else cur = 0;
    d = addDays(d, 1);
  }
  return best;
}

export function overallPercent() {
  const habits = store.getHabits();
  if (!habits.length) return { done: 0, total: 0, percent: 0 };
  const today = todayStr();
  let from = today;
  for (const h of habits) {
    const c = habitStartDate(h);
    if (c < from) from = c;
  }
  let total = 0;
  let done = 0;
  let d = from;
  while (d <= today) {
    const act = activeHabits(d);
    total += act.length;
    for (const h of act) if (isDone(h.id, d)) done++;
    d = addDays(d, 1);
  }
  return { done, total, percent: total ? done / total : 0 };
}

export function weekDelta(weekStart) {
  const current = weekPercent(weekStart);
  const previous = weekPercent(addDays(weekStart, -7));
  return { current, previous, delta: current - previous };
}

export function periodRange(period) {
  const today = todayStr();
  if (period === 'week') return { from: startOfWeek(today), to: today, label: 'за неделю' };
  if (period === 'month') return { from: today.slice(0, 8) + '01', to: today, label: 'за месяц' };
  let from = today;
  for (const h of store.getHabits()) {
    const c = habitStartDate(h);
    if (c < from) from = c;
  }
  return { from, to: today, label: 'за всё время' };
}

export function lastNWeeks(n) {
  const thisWeek = startOfWeek(todayStr());
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const ws = addDays(thisWeek, -7 * i);
    out.push({ start: ws, percent: weekPercent(ws) });
  }
  return out;
}

export function lastNDays(n) {
  const today = todayStr();
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    out.push({ date: d, percent: dayPercent(d) });
  }
  return out;
}

export function topHabits(from, to) {
  return store.getHabits()
    .filter((h) => !h.archived)
    .map((h) => ({ habit: h, ...habitPeriodStats(h, from, to) }))
    .filter((s) => s.days > 0)
    .sort((a, b) => b.percent - a.percent || b.done - a.done)
    .slice(0, 7);
}

export function rankingByRepetitions(from, to) {
  return store.getHabits()
    .filter((h) => !h.archived)
    .map((h) => ({ habit: h, ...habitPeriodStats(h, from, to) }))
    .sort((a, b) => b.done - a.done || b.percent - a.percent);
}
