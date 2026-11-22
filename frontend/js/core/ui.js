// Building blocks for the interface: toast, modal, forms, tables, file downloads.

import { $, esc } from './util.js';

let toastT = 0;

// Short, non-blocking status messages. Success messages dismiss automatically; other states
// remain until dismissed so errors and warnings are not lost.
const POP = {
  success: '<path d="m5.5 12.5 4.2 4.2L18.5 7.8"/>',
  error: '<path d="M7 7l10 10M17 7 7 17"/>',
  warn: '<path d="M12 6.5v7M12 17.5h.01"/>',
  info: '<path d="M12 10.5v7M12 6.5h.01"/>',
};
export function toast(msg, kind = 'success') {
  const t = $('#toast'),
    path = POP[kind] || POP.info;
  t.innerHTML = `<div class="pr-bg"><div class="pr pr-${kind}" role="${kind === 'error' ? 'alert' : 'status'}" aria-describedby="prM">
    <i class="pr-icon"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg></i>
    <p class="pr-message" id="prM">${esc(msg)}</p>
    <button class="pr-close" data-act="toastClose" aria-label="Dismiss notification"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
  </div></div>`;
  clearTimeout(toastT);
  if (kind === 'success') toastT = setTimeout(closeToast, 4000);
}
export function closeToast() {
  clearTimeout(toastT);
  const p = $('#toast .pr-bg');
  if (!p) return;
  p.classList.add('out');
  setTimeout(() => {
    if (p.isConnected) $('#toast').innerHTML = '';
  }, 200);
}

export function openModal(html, wide) {
  $('#modal').innerHTML =
    `<div class="modal-bg"><div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
  const f = $('#modal input, #modal select, #modal textarea, #modal button');
  if (f) f.focus();
}

export function closeModal() {
  $('#modal').innerHTML = '';
}

// A yes/no question. A "Delete" or "Remove" button is red, and so is its icon; tone 'out'
// gives the sign-out icon. Leave text off for a bare question, and pass {icon:false} to drop
// the icon too, which leaves just the question and the two buttons.
const ASK_ICON = {
  danger: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  out: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h11"/>',
  ask: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.4M12 17h.01"/>',
};
export function confirmBox(title, text, label, fn, tone, opts = {}) {
  tone = tone || (/delete|remove/i.test(label) ? 'danger' : 'ask');
  const bare = opts.icon === false,
    icon = bare
      ? ''
      : `<i><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ASK_ICON[tone] || ASK_ICON.ask}</svg></i>`;
  openModal(
    `<div class="ask ask-${tone}${bare ? ' ask-bare' : ''}">${icon}
      <h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}
      <div class="actions"><button class="btn btn-quiet" data-act="closeModal">Cancel</button><button class="btn ${tone === 'ask' ? 'primary' : 'danger-fill'}" id="cfYes">${esc(label)}</button></div></div>`,
  );
  $('#cfYes').addEventListener('click', async () => {
    closeModal();
    await fn();
  });
}

function fieldHtml(f, v) {
  const id = 'f_' + f.k,
    val = v === undefined || v === null ? (f.d ?? '') : v;
  if (f.t === 'check')
    return `<label class="chk ${f.full ? 'full' : ''}"><input type="checkbox" id="${id}" ${val ? 'checked' : ''}> ${esc(f.l)}</label>`;
  let ctl;
  if (f.t === 'select')
    ctl = `<select id="${id}">${f.o
      .map((o) => {
        const [ov, ol] = Array.isArray(o) ? o : [o, o];
        return `<option value="${esc(ov)}" ${String(ov) === String(val) ? 'selected' : ''}>${esc(ol)}</option>`;
      })
      .join('')}</select>`;
  else if (f.t === 'area')
    ctl = `<textarea id="${id}" ${f.ph ? `placeholder="${esc(f.ph)}"` : ''}>${esc(val)}</textarea>`;
  else
    ctl = `<input id="${id}" type="${f.t || 'text'}" value="${esc(val)}" ${f.t === 'number' ? 'min="0" inputmode="numeric"' : ''} ${f.ph ? `placeholder="${esc(f.ph)}"` : ''}>`;
  return `<label class="f ${f.full ? 'full' : ''}"><span>${esc(f.l)}${f.req ? '' : ' <span class="muted" style="font-weight:400">(optional)</span>'}</span>${ctl}</label>`;
}

export function openForm({ title, fields, values = {}, submit = 'Save', note, onSave, wide }) {
  openModal(
    `<h2>${esc(title)}</h2>${note ? `<p class="hint" style="margin:-.5rem 0 1rem">${esc(note)}</p>` : ''}<div class="grid2" id="frm">${fields.map((f) => fieldHtml(f, values[f.k])).join('')}</div><p class="err" id="frmErr" role="alert"></p><div class="actions" style="margin-top:.2rem"><button class="btn cancel" data-act="closeModal">Cancel</button><button class="btn primary" id="frmSave">${esc(submit)}</button></div>`,
    wide,
  );
  const run = async () => {
    const v = {};
    for (const f of fields) {
      const el = $('#f_' + f.k);
      v[f.k] = f.t === 'check' ? el.checked : f.t === 'number' ? (el.value === '' ? '' : +el.value) : el.value.trim();
      if (f.req && (v[f.k] === '' || v[f.k] === null)) {
        $('#frmErr').textContent = 'Enter ' + f.l.toLowerCase() + '.';
        toast('Enter ' + f.l.toLowerCase() + '.', 'warn');
        el.focus();
        return;
      }
    }
    const r = await onSave(v);
    if (typeof r === 'string') {
      $('#frmErr').textContent = r;
      toast(r, 'error');
      return;
    }
    if (r === false) return;
    closeModal();
  };
  $('#frmSave').addEventListener('click', run);
  $('#frm').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      run();
    }
  });
}

export function saveFile(filename, data) {
  const type = filename.endsWith('.csv') ? 'text/csv' : 'text/html';
  const url = URL.createObjectURL(new Blob([data], { type: type + ';charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Saved ' + filename, 'success');
}
export const dlBtn = (act, label, extra = '') => `<button class="btn" data-act="${act}" ${extra}>${label}</button>`;
// Open a document (report card, receipt) in a new tab and print it.
export function printDoc(html) {
  const w = window.open('', '_blank');
  if (!w) return toast('Allow pop-ups for this site to print.', 'warn');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

export const toCsv = (rows) =>
  rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c ?? '');
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        })
        .join(','),
    )
    .join('\n');

// Each cell is labelled with its column's heading (data-l), so on phones mobile.css can show
// every row as a card with small labels instead of a table that scrolls sideways.
export const table = (heads, rows, foot = '') => {
  const labels = heads.map((h) => String(Array.isArray(h) ? h[0] : h).replace(/<[^>]*>/g, '').replace(/"/g, '&quot;'));
  const label = (row) => {
    let i = 0;
    return row.replace(/<td(?=[\s>])/g, () => `<td data-l="${labels[i++] || ''}"`);
  };
  return `<div class="tw"><table class="t"><thead><tr>${heads
    .map((h) => {
      const [l, c] = Array.isArray(h) ? h : [h, ''];
      return `<th class="${c}">${l}</th>`;
    })
    .join('')}</tr></thead><tbody>${rows.map(label).join('')}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ''}</table></div>`;
};

export const empty = (title, text, btn = '') =>
  `<div class="panel empty"><b>${esc(title)}</b>${esc(text)}${btn ? '<br>' + btn : ''}</div>`;
