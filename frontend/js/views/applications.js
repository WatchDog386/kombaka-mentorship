// Admission applications, sent by families when they create an account.

import { A, V } from '../core/registry.js';
import { className } from '../core/school.js';
import { all, get, save } from '../core/store.js';
import { empty, openModal, table, toast } from '../core/ui.js';
import { clone, esc, fmtDate, phone } from '../core/util.js';
import { canEdit } from '../core/widgets.js';
import { learnerForm } from './learners.js';

const APP_TONE = { New: 'warn', Contacted: 'info', Admitted: 'ok', Closed: '' };

V.applications = () => {
  const rows = all('applications').sort((a, b) => String(b.date).localeCompare(a.date));
  if (!rows.length) return empty('No applications yet', 'Families who create an account on the school home page appear here.');
  return `<div class="mobile-flat-list">${table(
    ['Date', 'Child', 'Class wanted', 'Parent or guardian', 'Phone', 'Message', 'Status', ''],
    rows.map(
      (a) =>
        `<tr class="mobile-list-row" data-act="appView" data-id="${esc(a.id)}" tabindex="0" aria-label="Open application for ${esc(a.child)}"><td style="white-space:nowrap">${fmtDate(a.date)}</td><td class="mobile-list-primary"><b>${esc(a.child)}</b></td><td>${esc(get('classes', a.classId) ? className(a.classId) : a.classId || '')}</td><td>${esc(a.parent)}</td><td style="white-space:nowrap">${esc(phone(a.phone))}</td><td class="small">${esc(a.message)}</td><td><span class="chip ${APP_TONE[a.status] || ''}">${esc(a.status || 'New')}</span></td><td class="act">${canEdit() ? `${a.status !== 'Admitted' ? `<button class="btn sm" data-act="appAdmit" data-id="${esc(a.id)}">Admit</button> ` : ''}${a.status === 'New' ? `<button class="btn sm" data-act="appStatus" data-id="${esc(a.id)}" data-v="Contacted">Mark contacted</button> ` : ''}<button class="btn sm danger" data-act="del" data-c="applications" data-id="${esc(a.id)}" data-n="this application">Delete</button>` : ''}</td></tr>`,
    ),
  )}</div>`;
};

Object.assign(A, {
  appView: (d) => {
    const a = get('applications', d.id);
    if (!a) return;
    openModal(
      `<div class="application-record"><p class="application-record-kicker">Admission application</p><h2>${esc(a.child)}</h2><span class="chip ${APP_TONE[a.status] || ''}">${esc(a.status || 'New')}</span>
      <dl class="mobile-record-grid"><div><dt>Date received</dt><dd>${fmtDate(a.date) || 'Not recorded'}</dd></div><div><dt>Class requested</dt><dd>${esc(get('classes', a.classId) ? className(a.classId) : a.classId || 'Not specified')}</dd></div><div><dt>Parent or guardian</dt><dd>${esc(a.parent)}</dd></div><div><dt>Phone</dt><dd><a href="tel:${esc(a.phone)}">${esc(phone(a.phone))}</a></dd></div><div class="mobile-record-full"><dt>Message</dt><dd>${esc(a.message) || 'No message provided'}</dd></div></dl>
      <div class="actions">${canEdit() ? `${a.status !== 'Admitted' ? `<button class="btn" data-act="appAdmit" data-id="${esc(a.id)}">Admit learner</button>` : ''}${a.status === 'New' ? `<button class="btn" data-act="appStatus" data-id="${esc(a.id)}" data-v="Contacted">Mark contacted</button>` : ''}<button class="btn danger" data-act="del" data-c="applications" data-id="${esc(a.id)}" data-n="this application">Delete</button>` : ''}<button class="btn primary" data-act="closeModal">Done</button></div></div>`,
    );
  },
  appAdmit: (d) => {
    const a = get('applications', d.id);
    if (!a) return;
    learnerForm(null, {
      name: a.child,
      guardianName: a.parent,
      guardianPhone: a.phone,
      ...(get('classes', a.classId) ? { classId: a.classId } : {}),
      appId: a.id,
    });
  },
  appStatus: async (d) => {
    const a = get('applications', d.id);
    if (a) {
      if (!(await save('applications', { ...clone(a), status: d.v }))) return false;
      toast('Application marked ' + d.v.toLowerCase(), 'success');
    }
  },
});
