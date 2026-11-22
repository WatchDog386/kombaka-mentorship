// Shared pieces of views: level chips, search box, class picker, printable document shell.

import { balance, cfg, className, classesSorted, paid } from './school.js';
import { kid, myKids, ui } from './state.js';
import { store } from './store.js';
import { empty } from './ui.js';
import { esc, phone } from './util.js';

export const lvlChip = (r) =>
  r ? `<span class="lvl ${r.tone}" title="${esc(r.n)}">${r.c}</span>` : '<span class="muted">Not yet</span>';

export const feeChip = (l) => {
  const b = balance(l),
    p = paid(l);
  return b <= 0
    ? '<span class="chip ok">Cleared</span>'
    : p > 0
      ? '<span class="chip warn">Part paid</span>'
      : '<span class="chip bad">Not paid</span>';
};

export const search = (ph) =>
  `<label class="sr" for="q">Search</label><input id="q" type="search" data-in="q" value="${esc(ui.q)}" placeholder="${esc(ph)}">`;

export const matchQ = (o, keys) => {
  const q = ui.q.trim().toLowerCase();
  return (
    !q ||
    keys.some((k) =>
      String(o[k] ?? '')
        .toLowerCase()
        .includes(q),
    )
  );
};

export const classSelect = (id, key, val, withAll) =>
  `<label class="sr" for="${id}">Class</label><select id="${id}" data-ch="${key}">${withAll ? `<option value="">All classes</option>` : ''}${classesSorted()
    .map((c) => `<option value="${esc(c.id)}" ${c.id === val ? 'selected' : ''}>${esc(c.name)}</option>`)
    .join('')}</select>`;

export const kidPicker = () => {
  const ks = myKids();
  const k = kid();
  return ks.length > 1
    ? `<div class="tools"><label class="sr" for="kidSel">Child</label><select id="kidSel" data-ch="kid">${ks.map((x) => `<option value="${esc(x.id)}" ${k && x.id === k.id ? 'selected' : ''}>${esc(x.name)}, ${esc(className(x.classId))}</option>`).join('')}</select></div>`
    : '';
};

export const noKid = () =>
  empty(
    'Your application is with the school office',
    'Once your child is admitted, their attendance, results and fees appear here. If it has been more than a few days, call the school office.',
  );

// Changes are paused while the server cannot be reached.
export const canEdit = () => store.online;

export function docShell(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>body{font:15px/1.5 "Segoe UI",Arial,sans-serif;color:#17231E;max-width:760px;margin:2rem auto;padding:0 1.2rem}h1{font-size:1.5rem;margin:0}h2{font-size:1.1rem;margin:1.4rem 0 .5rem}.head{border-bottom:3px double #999;padding-bottom:.8rem;margin-bottom:1rem}.muted{color:#56655E}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:.4rem .6rem;text-align:left}th{background:#EEF2ED}.num{text-align:right}dl{display:grid;grid-template-columns:max-content 1fr;gap:.25rem 1rem}dt{color:#56655E}dd{margin:0}.sign{display:flex;gap:3rem;margin-top:3rem}.sign div{flex:1;border-top:1px solid #333;padding-top:.3rem;font-size:.85rem}@media print{body{margin:0}}</style></head><body>${body}</body></html>`;
}

export function schoolHead() {
  const c = cfg();
  return `<div class="head"><h1>${esc(c.name)}</h1><div class="muted">${esc([c.address, c.county, phone(c.phone), c.email].filter(Boolean).join(' | '))}</div>${c.motto ? `<div class="muted"><i>${esc(c.motto)}</i></div>` : ''}</div>`;
}
