// Chhote common helpers (id, slot ka time, date). Server ka timezone kuch bhi ho, slot ka time hamesha India (IST) me samjha jata hai.

// Strict positive integer parser. "2" -> 2. "abc", "2abc", 0, -1, null -> null
const parseId = (value) => {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!/^[1-9]\d*$/.test(str)) return null;
  const n = Number(str);
  return Number.isSafeInteger(n) ? n : null;
};

// "9:00 am" ya "09:00 AM" -> "09:00 AM". Samajh na aaye to null.
const normSlot = (value) => {
  const m = /^\s*(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)\s*$/i.exec(String(value ?? ''));
  return m ? `${m[1].padStart(2, '0')}:${m[2]} ${m[3].toUpperCase()}` : null;
};

// Slots ko time ke hisaab se sort karne ke liye (minutes since midnight)
const slotSortKey = (slot) => {
  const n = normSlot(slot);
  if (!n) return 0;
  const h = (Number(n.slice(0, 2)) % 12) + (n.endsWith('PM') ? 12 : 0);
  return h * 60 + Number(n.slice(3, 5));
};

// Slot kab shuru hota hai (milliseconds). dateStr = 'YYYY-MM-DD', slot = '10:00 AM', time IST (+05:30) me.
const slotStartMs = (dateStr, slot) => {
  const n = normSlot(slot);
  if (!n || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) return null;
  const mins = slotSortKey(n);
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  const ms = Date.parse(`${dateStr}T${hh}:${mm}:00+05:30`);
  return Number.isNaN(ms) ? null : ms;
};

// Aaj ki date India me, 'YYYY-MM-DD'
const istToday = (now = Date.now()) => new Date(now + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

// 'YYYY-MM-DD' aur asli calendar date (2026-02-31 galat hai)
const isValidDate = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

// Status hamesha 'Confirmed' jaisa
const capStatus = (s) => {
  const k = String(s || '').toLowerCase();
  return k ? k.charAt(0).toUpperCase() + k.slice(1) : 'Pending';
};

module.exports = { parseId, normSlot, slotSortKey, slotStartMs, istToday, isValidDate, capStatus };
