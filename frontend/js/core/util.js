// Small helpers used everywhere: escaping, money, dates, phone numbers, ids.

export const $ = (s, r = document) => r.querySelector(s);

export const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

export const clone = (o) => JSON.parse(JSON.stringify(o));

export const sum = (a) => a.reduce((x, y) => x + (+y || 0), 0);

export const kes = (n) => 'KES ' + Math.round(+n || 0).toLocaleString('en-KE');

const pad = (n) => String(n).padStart(2, '0');

export const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

export const today = () => iso(new Date());

export const nowIso = () => {
  const d = new Date();
  return iso(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
};

export const asDate = (s) => new Date(String(s).slice(0, 10) + 'T12:00:00');

export const fmtDate = (s, o) =>
  s ? asDate(s).toLocaleDateString('en-GB', o || { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export const fmtDay = (s) => fmtDate(s, { weekday: 'short', day: 'numeric', month: 'short' });

export const fmtDT = (s) => (s ? fmtDate(s, { day: 'numeric', month: 'short' }) + ', ' + String(s).slice(11, 16) : '');

export const phone = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  return d.length === 10 ? d.slice(0, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7) : String(p || '');
};

export const normPhone = (p) => {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('254')) d = '0' + d.slice(3);
  return d;
};

export const slug = (a) =>
  String(a)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

export const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

export const deepMerge = (a, b) => {
  for (const k in b) {
    if (isObj(b[k]) && isObj(a[k])) deepMerge(a[k], b[k]);
    else a[k] = b[k];
  }
  return a;
};

export const LS = {
  get(k) {
    try {
      return JSON.parse(localStorage.getItem(k));
    } catch (e) {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch (e) {}
  },
};
