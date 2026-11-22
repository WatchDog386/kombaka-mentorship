// Staff register.

import { A, V } from '../core/registry.js';
import { classesSorted, isTeaching } from '../core/school.js';
import { ui } from '../core/state.js';
import { all, get, removeDoc, save } from '../core/store.js';
import { confirmBox, empty, openForm, table, toast } from '../core/ui.js';
import { $, esc, newId, normPhone, phone, today } from '../core/util.js';
import { canEdit, matchQ, search } from '../core/widgets.js';

const ROLES = [
  'Head teacher',
  'Deputy head teacher',
  'Senior teacher',
  'Class teacher',
  'Subject teacher',
  'Bursar',
  'Secretary',
  'Librarian',
  'Driver',
  'Cook',
  'Matron',
  'Security',
  'Support staff',
];

V.staff = () => {
  const rows = all('staff')
    .filter((s) => matchQ(s, ['name', 'role', 'staffNo', 'tsc', 'phone']))
    .sort((a, b) => String(a.staffNo).localeCompare(b.staffNo));
  const tools = `<div class="tools">${search('Search staff')}<span class="grow"></span>${canEdit() ? '<button class="btn primary" data-act="staffForm">Add a staff member</button>' : ''}</div>`;
  if (!rows.length)
    return (
      tools +
      empty(
        ui.q ? 'No staff member matches' : 'No staff added yet',
        ui.q ? 'Try a different name or role.' : 'Add teachers so they can be assigned to classes.',
      )
    );
  return (
    tools +
    `<div class="mobile-flat-list">${table(
      ['Staff no.', 'Name', 'Role', 'TSC no.', 'Class', 'Phone', 'Status', ''],
      rows.map((s) => {
        const c = classesSorted()
          .filter((x) => x.teacherId === s.id)
          .map((x) => x.name)
          .join(', ');
        return `<tr class="mobile-list-row" data-act="staffForm" data-id="${esc(s.id)}" tabindex="0" aria-label="Open staff record for ${esc(s.name)}"><td>${esc(s.staffNo)}</td><td class="mobile-list-primary"><b>${esc(s.name)}</b>${s.areas ? `<br><span class="small muted">${esc(s.areas)}</span>` : ''}</td><td>${esc(s.role)}</td><td>${esc(s.tsc) || '<span class="muted">None</span>'}</td><td>${esc(c) || '<span class="muted">None</span>'}</td><td style="white-space:nowrap">${esc(phone(s.phone))}</td><td><span class="chip ${s.status === 'Active' ? 'ok' : ''}">${esc(s.status || 'Active')}</span></td><td class="act">${canEdit() ? `<button class="btn sm" data-act="staffForm" data-id="${esc(s.id)}">Edit</button>` : ''}</td></tr>`;
      }),
    )}</div>`
  );
};

function staffForm(s) {
  const n = 'ST-' + String(all('staff').length + 1).padStart(3, '0');
  openForm({
    title: s ? 'Edit staff member' : 'Add a staff member',
    wide: true,
    values: s || { staffNo: n, status: 'Active', role: 'Class teacher', gender: 'F', joined: today() },
    fields: [
      { k: 'name', l: 'Full name', req: true },
      { k: 'staffNo', l: 'Staff number', req: true },
      { k: 'role', l: 'Role', t: 'select', o: ROLES, req: true },
      { k: 'tsc', l: 'TSC number' },
      { k: 'phone', l: 'Phone', t: 'tel', req: true },
      { k: 'email', l: 'Email', t: 'email' },
      {
        k: 'gender',
        l: 'Gender',
        t: 'select',
        o: [
          ['F', 'Female'],
          ['M', 'Male'],
        ],
      },
      { k: 'joined', l: 'Date employed', t: 'date' },
      { k: 'areas', l: 'Learning areas taught', full: true, ph: 'Mathematics, Integrated Science' },
      { k: 'status', l: 'Status', t: 'select', o: ['Active', 'On leave', 'Left'] },
    ],
    onSave: async (v) => {
      v.phone = normPhone(v.phone);
      if (!(await save('staff', { ...(s || {}), ...v, id: s ? s.id : newId('s') }))) return false;
      toast('Staff member saved', 'success');
    },
  });
  if (s)
    $('#modal .actions').insertAdjacentHTML(
      'afterbegin',
      `<button class="btn danger" data-act="staffDel" data-id="${esc(s.id)}" style="margin-right:auto">Delete</button>${isTeaching(s) && s.phone ? `<button class="btn" data-act="resetPassword" data-login="${esc(s.phone)}">Reset password</button>` : ''}`,
    );
}

Object.assign(A, {
  staffForm: (d) => staffForm(d.id ? get('staff', d.id) : null),
  staffDel: (d) => {
    const s = get('staff', d.id);
    if (classesSorted().some((c) => c.teacherId === s.id)) return toast('Assign another class teacher first.', 'warn');
    confirmBox(
      'Delete ' + s.name + '?',
      'This removes the staff record for everyone.',
      'Delete staff member',
      async () => {
        if (!(await removeDoc('staff', s.id))) return false;
        toast('Staff member deleted', 'success');
      },
    );
  },
});
