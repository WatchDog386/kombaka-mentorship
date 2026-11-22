// Classes and their class teachers.

import { A, V } from '../core/registry.js';
import { LEVELS, classesSorted, learnersIn, staffName, teachers } from '../core/school.js';
import { all, get, removeDoc, save } from '../core/store.js';
import { confirmBox, empty, openForm, table, toast } from '../core/ui.js';
import { $, esc, newId } from '../core/util.js';
import { canEdit } from '../core/widgets.js';

V.classes = () => {
  const rows = classesSorted();
  const tools = `<div class="tools"><span class="grow"></span>${canEdit() ? '<button class="btn primary" data-act="classForm">Add a class</button>' : ''}</div>`;
  if (!rows.length) return tools + empty('No classes yet', 'Add PP1 up to Grade 9, one row per class or stream.');
  return (
    tools +
    `<div class="mobile-flat-list">${table(
      ['Class', 'Level', 'Class teacher', 'Room', ['Boys', 'num'], ['Girls', 'num'], ['Learners', 'num'], ''],
      rows.map((c) => {
        const L = learnersIn(c.id),
          g = L.filter((l) => l.gender === 'F').length;
        return `<tr class="mobile-list-row" data-act="classForm" data-id="${esc(c.id)}" tabindex="0" aria-label="Open class ${esc(c.name)}"><td class="mobile-list-primary"><b>${esc(c.name)}</b></td><td>${LEVELS[c.level] || ''}</td><td>${esc(staffName(c.teacherId)) || (canEdit() ? `<button class="btn sm primary" data-act="classForm" data-id="${esc(c.id)}">Assign class teacher</button>` : '<span class="muted">Not assigned</span>')}</td><td>${esc(c.room)}</td><td class="num">${L.length - g}</td><td class="num">${g}</td><td class="num">${L.length}</td><td class="act">${canEdit() ? `<button class="btn sm" data-act="classForm" data-id="${esc(c.id)}">Edit</button>` : ''}</td></tr>`;
      }),
    )}</div>`
  );
};

function classForm(c) {
  openForm({
    title: c ? 'Edit class' : 'Add a class',
    values: c || { level: 'pp', order: all('classes').length + 1 },
    note: 'The level decides which learning areas and fee structure apply.',
    fields: [
      { k: 'name', l: 'Class name', req: true, ph: 'Grade 4 East' },
      { k: 'level', l: 'Level', t: 'select', o: Object.entries(LEVELS), req: true },
      {
        k: 'teacherId',
        l: 'Class teacher',
        t: 'select',
        o: [['', 'Not assigned'], ...teachers().map((t) => [t.id, t.name])],
      },
      { k: 'room', l: 'Room' },
      { k: 'order', l: 'Position in the school, lowest class first', t: 'number', req: true, full: true },
    ],
    onSave: async (v) => {
      if (!(await save('classes', { ...(c || {}), ...v, id: c ? c.id : newId('c') }))) return false;
      toast('Class saved', 'success');
    },
  });
  if (c)
    $('#modal .actions').insertAdjacentHTML(
      'afterbegin',
      `<button class="btn danger" data-act="classDel" data-id="${esc(c.id)}" style="margin-right:auto">Delete</button>`,
    );
}

Object.assign(A, {
  classForm: (d) => classForm(d.id ? get('classes', d.id) : null),
  classDel: (d) => {
    const c = get('classes', d.id),
      n = learnersIn(c.id).length;
    if (n) return toast(`Move the ${n} learner${n === 1 ? '' : 's'} in ${c.name} to another class first.`, 'warn');
    confirmBox('Delete ' + c.name + '?', 'This removes the class for everyone.', 'Delete class', async () => {
      if (!(await removeDoc('classes', c.id))) return false;
      toast('Class deleted', 'success');
    });
  },
});
