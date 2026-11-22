// Homework set by teachers.

import { A, V } from '../core/registry.js';
import { areasFor, className, classesSorted } from '../core/school.js';
import { isAdmin, isParent, isStaff, isTeacher, kid, meName, myClass, ui } from '../core/state.js';
import { all, get, save } from '../core/store.js';
import { empty, openForm, toast } from '../core/ui.js';
import { esc, fmtDay, newId, today } from '../core/util.js';
import { canEdit, kidPicker, noKid } from '../core/widgets.js';

V.homework = () => {
  let list = all('homework');
  if (isParent()) {
    const k = kid();
    if (!k) return noKid();
    list = list.filter((h) => h.classId === k.classId);
  } else if (isTeacher() && !ui.allHw) {
    const mc = myClass();
    list = list.filter((h) => h.by === meName() || (mc && h.classId === mc.id));
  }
  list.sort((a, b) => String(b.due).localeCompare(a.due));
  const t = today();
  const tools = `<div class="tools">${isParent() ? '' : '<span class="grow"></span>'}${isStaff() && canEdit() ? '<button class="btn primary" data-act="hwForm">Set homework</button>' : ''}</div>`;
  return (
    (isParent() ? kidPicker() : '') +
    tools +
    (list.length
      ? list
          .map(
            (h) =>
              `<div class="note"><h3>${esc(h.title)}</h3><p>${esc(h.details)}</p><div class="meta"><span class="chip">${esc(className(h.classId))}</span><span>${esc(h.area)}</span><span>${h.due >= t ? 'Due ' + fmtDay(h.due) : 'Was due ' + fmtDay(h.due)}</span><span>Set by ${esc(h.by)}</span>${isStaff() && canEdit() && (isAdmin() || h.by === meName()) ? `<span style="margin-left:auto"><button class="btn sm" data-act="hwForm" data-id="${esc(h.id)}">Edit</button> <button class="btn sm danger" data-act="del" data-c="homework" data-id="${esc(h.id)}" data-n="this homework">Delete</button></span>` : ''}</div></div>`,
          )
          .join('')
      : empty(
          'No homework set',
          isParent()
            ? 'Homework from the class teacher appears here.'
            : 'Set homework and parents see it on their phones.',
        ))
  );
};

function hwForm(h) {
  const cls = classesSorted();
  if (!cls.length) return toast('Add a class first.', 'warn');
  const mc = myClass(),
    cid = h ? h.classId : (mc || cls[0]).id;
  const allAreas = [...new Set(cls.flatMap((c) => areasFor(c)))];
  openForm({
    title: h ? 'Edit homework' : 'Set homework',
    wide: true,
    values: h || { classId: cid, area: areasFor(get('classes', cid))[0], due: today() },
    fields: [
      { k: 'classId', l: 'Class', t: 'select', o: cls.map((c) => [c.id, c.name]), req: true },
      { k: 'area', l: 'Learning area', t: 'select', o: allAreas, req: true },
      { k: 'title', l: 'Title', req: true, full: true },
      { k: 'details', l: 'Instructions', t: 'area', full: true, req: true },
      { k: 'due', l: 'Due date', t: 'date', req: true },
    ],
    onSave: async (v) => {
      if (!(await save('homework', { date: today(), by: meName(), ...(h || {}), ...v, id: h ? h.id : newId('h') })))
        return false;
      toast('Homework saved', 'success');
    },
  });
}

Object.assign(A, {
  hwForm: (d) => hwForm(d.id ? get('homework', d.id) : null),
});
