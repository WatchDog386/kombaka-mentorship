// Learner register: admit, edit, view a learner.

import { A, V } from '../core/registry.js';
import { activeLearners, attStats, balance, className, classesSorted, results } from '../core/school.js';
import { isAdmin, isTeacher, myClass, ui } from '../core/state.js';
import { all, get, removeDoc, save } from '../core/store.js';
import { confirmBox, dlBtn, empty, openForm, openModal, saveFile, table, toCsv, toast } from '../core/ui.js';
import { clone, esc, fmtDate, kes, newId, normPhone, phone, today } from '../core/util.js';
import { canEdit, classSelect, matchQ, search } from '../core/widgets.js';

V.learners = () => {
  const mc = myClass(),
    fc = isTeacher() && mc ? mc.id : ui.fClass || '';
  let rows = activeLearners().filter(
    (l) => (!fc || l.classId === fc) && matchQ(l, ['name', 'admNo', 'guardianName', 'guardianPhone', 'upi']),
  );
  const ord = Object.fromEntries(classesSorted().map((c, i) => [c.id, i]));
  rows.sort((a, b) => (ord[a.classId] ?? 99) - (ord[b.classId] ?? 99) || a.name.localeCompare(b.name));
  const tools = `<div class="tools">${search('Search name, admission no. or phone')}${isAdmin() ? classSelect('fClass', 'fClass', fc, true) : ''}<span class="grow"></span>${isAdmin() ? dlBtn('csvLearners', 'Save list as CSV') : ''}${isAdmin() && canEdit() ? '<button class="btn primary" data-act="learnerForm">Admit a learner</button>' : ''}</div>`;
  const heads = [
    ['Adm no.', 'learner-adm-col'],
    ['Learner', 'learner-name-col'],
    ['Class', 'learner-class-col'],
    ['Gender', 'learner-gender-col'],
    ['Parent or guardian', 'learner-guardian-col'],
    ['Phone', 'learner-phone-col'],
    ...(isAdmin() ? [['Fee balance', 'num learner-balance-col']] : []),
  ];
  if (!rows.length)
    return (
      tools +
      empty(
        ui.q || fc ? 'No learner matches' : 'No learners admitted yet',
        ui.q || fc ? 'Try a different name, number or class.' : 'Add classes first, then admit learners.',
      )
    );
  return (
    tools +
    `<div class="learner-list">${table(
      heads,
      rows.map(
        (l) =>
          `<tr class="learner-row" data-act="learnerView" data-id="${esc(l.id)}" tabindex="0" aria-label="Open full record for ${esc(l.name)}"><td class="learner-adm-col">${esc(l.admNo)}</td><td class="learner-name-col"><b>${esc(l.name)}</b></td><td class="learner-class-col">${esc(className(l.classId))}</td><td class="learner-gender-col">${l.gender === 'F' ? 'Girl' : 'Boy'}</td><td class="learner-guardian-col">${esc(l.guardianName)}</td><td class="learner-phone-col" style="white-space:nowrap">${esc(phone(l.guardianPhone))}</td>${isAdmin() ? `<td class="num learner-balance-col">${kes(balance(l))}</td>` : ''}</tr>`,
      ),
    )}</div>` +
    `<p class="small muted" style="margin-top:.6rem">${rows.length} learner${rows.length === 1 ? '' : 's'}</p>`
  );
};

document.addEventListener('keydown', (e) => {
  const row = e.target.closest('.learner-row');
  if (!row || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  row.click();
});

export function learnerForm(l, preset) {
  const cls = classesSorted();
  if (!cls.length) return toast('Add a class before admitting learners.', 'warn');
  const next = String(Math.max(1000, ...all('learners').map((x) => parseInt(x.admNo, 10) || 0)) + 1);
  openForm({
    title: l ? 'Edit learner' : 'Admit a learner',
    wide: true,
    values: l || {
      admNo: next,
      joined: today(),
      lunch: true,
      status: 'Active',
      gender: 'F',
      classId: ui.fClass || cls[0].id,
      ...(preset || {}),
    },
    fields: [
      { k: 'name', l: 'Full name', req: true },
      { k: 'admNo', l: 'Admission number', req: true },
      { k: 'classId', l: 'Class', t: 'select', o: cls.map((c) => [c.id, c.name]), req: true },
      {
        k: 'gender',
        l: 'Gender',
        t: 'select',
        o: [
          ['F', 'Girl'],
          ['M', 'Boy'],
        ],
        req: true,
      },
      { k: 'dob', l: 'Date of birth', t: 'date' },
      { k: 'upi', l: 'UPI number (NEMIS or KEMIS)' },
      { k: 'guardianName', l: 'Parent or guardian name', req: true },
      { k: 'guardianPhone', l: 'Guardian phone', t: 'tel', req: true, ph: '0712 345 678' },
      {
        k: 'guardianRelation',
        l: 'Relationship',
        t: 'select',
        o: ['Mother', 'Father', 'Guardian', 'Grandparent', 'Other'],
      },
      {
        k: 'routeId',
        l: 'Transport route',
        t: 'select',
        o: [['', 'Does not use school transport'], ...all('routes').map((r) => [r.id, r.name])],
      },
      { k: 'joined', l: 'Date admitted', t: 'date' },
      { k: 'bf', l: 'Balance brought forward (KES)', t: 'number' },
      { k: 'status', l: 'Status', t: 'select', o: ['Active', 'Transferred', 'Completed', 'Left'] },
      { k: 'lunch', l: 'Takes school lunch', t: 'check' },
      {
        k: 'medical',
        l: 'Medical notes',
        t: 'area',
        full: true,
        ph: 'Allergies, conditions or medication the school should know about',
      },
    ],
    onSave: async (v) => {
      if (all('learners').some((x) => x.admNo === v.admNo && (!l || x.id !== l.id)))
        return 'Admission number ' + v.admNo + ' is already in use.';
      v.guardianPhone = normPhone(v.guardianPhone);
      v.bf = +v.bf || 0;
      if (
        !(await save('learners', {
          ...(l || {}),
          ...v,
          id: l ? l.id : 'L' + v.admNo.replace(/[^A-Za-z0-9]/g, '') + (get('learners', 'L' + v.admNo) ? newId('') : ''),
        }))
      )
        return false;
      if (preset && preset.appId) {
        const a = get('applications', preset.appId);
        if (a) await save('applications', { ...clone(a), status: 'Admitted' });
      }
      toast(l ? 'Learner saved' : v.name + ' admitted', 'success');
    },
  });
}

function learnerView(id) {
  const l = get('learners', id);
  if (!l) return;
  const a = attStats(l),
    r = results(l),
    rt = l.routeId && get('routes', l.routeId);
  openModal(
      `<div class="learner-record">
        <header class="learner-record-head"><div><span class="learner-record-kicker">Learner record</span><h2>${esc(l.name)}</h2><p>${esc(className(l.classId))} · Admission no. ${esc(l.admNo)}</p></div><span class="learner-record-status">${esc(l.status || 'Active')}</span></header>
        <div class="learner-record-stats"><div><b>${a.total ? a.present + ' of ' + a.total : 'No record'}</b><span>Days present this term</span></div><div><b>${r.overall ? (r.mean !== null ? r.mean + '%, ' : '') + r.overall.c : 'Not yet'}</b><span>Assessment</span></div>${isAdmin() ? `<div><b>${kes(balance(l))}</b><span>Fee balance</span></div>` : ''}</div>
        <section class="learner-record-section"><h3>Learner details</h3><dl class="learner-record-grid"><div><dt>Gender</dt><dd>${l.gender === 'F' ? 'Girl' : 'Boy'}</dd></div><div><dt>Date of birth</dt><dd>${fmtDate(l.dob) || 'Not recorded'}</dd></div><div><dt>UPI number</dt><dd>${esc(l.upi) || 'Not recorded'}</dd></div><div><dt>Date admitted</dt><dd>${fmtDate(l.joined) || 'Not recorded'}</dd></div></dl></section>
        <section class="learner-record-section"><h3>Family contact</h3><dl class="learner-record-grid"><div><dt>Parent or guardian</dt><dd>${esc(l.guardianName)}${l.guardianRelation ? ' (' + esc(l.guardianRelation) + ')' : ''}</dd></div><div><dt>Phone</dt><dd><a href="tel:${esc(normPhone(l.guardianPhone))}">${esc(phone(l.guardianPhone))}</a></dd></div></dl></section>
        <section class="learner-record-section"><h3>School details</h3><dl class="learner-record-grid"><div><dt>Transport</dt><dd>${rt ? esc(rt.name) : 'Does not use school transport'}</dd></div><div><dt>Lunch</dt><dd>${l.lunch === false ? 'Carries own lunch' : 'School lunch'}</dd></div></dl></section>
        ${l.medical ? `<section class="learner-record-section"><h3>Medical notes</h3><p class="learner-record-note">${esc(l.medical)}</p></section>` : ''}
        <div class="actions learner-record-actions"><div class="learner-record-primary">${isAdmin() && canEdit() ? `<button class="btn" data-act="learnerForm" data-id="${esc(l.id)}">Edit learner</button><button class="btn" data-act="payForm" data-id="${esc(l.id)}">Record payment</button>` : ''}<button class="btn learner-record-report" data-act="openReport" data-id="${esc(l.id)}">Report card</button></div>${isAdmin() && canEdit() ? `<details class="learner-record-more"><summary>More actions</summary><div><button class="btn danger" data-act="learnerDel" data-id="${esc(l.id)}">Delete learner</button><button class="btn" data-act="resetPassword" data-login="${esc(l.guardianPhone)}">Reset parent password</button></div></details>` : ''}<button class="btn primary learner-record-done" data-act="closeModal">Done</button></div>
      </div>`,
    true,
  );
}

Object.assign(A, {
  learnerForm: (d) => learnerForm(d.id ? get('learners', d.id) : null),
  learnerView: (d) => learnerView(d.id),
  learnerDel: (d) => {
    const l = get('learners', d.id);
    confirmBox(
      'Delete ' + l.name + '?',
      'This removes the learner record for everyone. To keep history, edit the learner and set the status to Transferred or Left instead.',
      'Delete learner',
      async () => {
        if (!(await removeDoc('learners', l.id))) return false;
        toast('Learner deleted', 'success');
      },
    );
  },
  csvLearners: () =>
    saveFile(
      'Learners.csv',
      toCsv([
        ['Adm no', 'Name', 'Class', 'Gender', 'Date of birth', 'UPI', 'Guardian', 'Phone', 'Route', 'Status'],
        ...all('learners')
          .sort((a, b) => String(a.admNo).localeCompare(b.admNo))
          .map((l) => [
            l.admNo,
            l.name,
            className(l.classId),
            l.gender,
            l.dob,
            l.upi,
            l.guardianName,
            l.guardianPhone,
            (get('routes', l.routeId) || {}).name || '',
            l.status,
          ]),
      ]),
    ),
});
