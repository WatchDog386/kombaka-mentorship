// The in-memory copy of the school records and the functions that change them.

import { api } from './api.js';
import { toast } from './ui.js';
import { clone, deepMerge } from './util.js';

// The records the signed-in person may see, kept in memory.
// Views read with all() and get(); changes go through save(), mergeDoc()
// and removeDoc(), which update the screen at once and then tell the server.
const COLS = [
  'config',
  'classes',
  'staff',
  'learners',
  'payments',
  'expenses',
  'notices',
  'events',
  'homework',
  'messages',
  'timetables',
  'routes',
  'books',
  'resources',
  'attendance',
  'assessments',
  'remarks',
  'applications',
];
export const store = {
  ready: false,
  online: true,
  pending: 0,
  counts: { learners: 0, teachers: 0 },
  demo: [],
  data: {},
};
COLS.forEach((c) => {
  store.data[c] = new Map();
});
export const all = (c) => [...store.data[c].values()];
export const get = (c, id) => store.data[c].get(id);

const listeners = [];
export function onStoreChange(fn) {
  listeners.push(fn);
}
function changed() {
  listeners.forEach((fn) => fn());
}
function fill(data) {
  COLS.forEach((c) => {
    store.data[c] = new Map((data[c] || []).map((d) => [d.id, d]));
  });
}

// Before sign-in: only what the public home page needs.
export async function loadPublic() {
  try {
    const r = await api.get('/public');
    fill(r.data);
    store.counts = r.counts;
    store.demo = r.demo || [];
    store.online = true;
  } catch (e) {
    store.online = false;
  }
  store.ready = true;
  changed();
}
// After sign-in: everything this person is allowed to see. Returns the user.
export async function loadRecords() {
  const r = await api.get('/bootstrap');
  fill(r.data);
  store.online = true;
  store.ready = true;
  changed();
  return r.user;
}
function failed(e) {
  if (e.status === 0) store.online = false;
  toast(e.message || 'Could not save the change. Try again.', 'error');
}
function restore(col, id, before) {
  if (before) store.data[col].set(id, before);
  else store.data[col].delete(id);
  changed();
}

// Create or replace one record. Resolves true when the server accepted it.
export async function save(col, obj) {
  const id = obj.id,
    before = get(col, id);
  store.data[col].set(id, clone(obj));
  changed();
  store.pending++;
  try {
    const saved = await api.put(`/${col}/${id}`, obj);
    store.data[col].set(id, saved);
    changed();
    return true;
  } catch (e) {
    restore(col, id, before);
    failed(e);
    return false;
  } finally {
    store.pending--;
  }
}
// Merge marks into a register, a result sheet or a timetable.
export async function mergeDoc(col, id, base, patch) {
  const before = get(col, id);
  store.data[col].set(id, deepMerge(before ? clone(before) : { ...clone(base), id }, clone(patch)));
  changed();
  store.pending++;
  try {
    const saved = await api.patch(`/${col}/${id}`, { patch });
    store.data[col].set(id, saved);
    changed();
    return true;
  } catch (e) {
    restore(col, id, before);
    failed(e);
    return false;
  } finally {
    store.pending--;
  }
}
export async function removeDoc(col, id) {
  const before = get(col, id);
  store.data[col].delete(id);
  changed();
  store.pending++;
  try {
    await api.del(`/${col}/${id}`);
    return true;
  } catch (e) {
    restore(col, id, before);
    failed(e);
    return false;
  } finally {
    store.pending--;
  }
}
// Put a record the server has already made into the in-memory copy, without sending it
// back. Used where the server creates the record itself and hands it over, such as
// opening a class group.
export function putLocal(col, obj) {
  store.data[col].set(obj.id, clone(obj));
  changed();
}
// Drop a record from the in-memory copy after the server has already removed it. Used for
// files, which are deleted through /api/files rather than the collection endpoint.
export function removeDocLocal(col, id) {
  store.data[col].delete(id);
  changed();
}
export async function saveConfig(patch) {
  const cur = clone(get('config', 'school') || {});
  return save('config', { ...cur, ...patch, id: 'school' });
}
