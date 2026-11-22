// Timetables. The school office builds them: a class view to fill in lessons and teachers (a
// teacher already teaching another class at that time cannot be booked twice), a view of any one
// teacher's week, and a workload table of lessons per teacher and empty slots per class.
// Teachers see class timetables or only their own lessons; parents see their child's class.

import { A, V, onChange } from '../core/registry.js';
import { paint } from '../core/render.js';
import { LEVELS, areasFor, className, classesSorted, staffName, teachers } from '../core/school.js';
import { isAdmin, isParent, isTeacher, pickClass, session, ui } from '../core/state.js';
import { all, get, mergeDoc } from '../core/store.js';
import { empty, openForm, table, toast } from '../core/ui.js';
import { esc } from '../core/util.js';
import { canEdit, classSelect, kidPicker, noKid } from '../core/widgets.js';

export const PERIODS = [
  { n: 1, t: '8:20 to 9:00' },
  { n: 2, t: '9:00 to 9:40' },
  { b: 'Short break', t: '9:40 to 10:00' },
  { n: 3, t: '10:00 to 10:40' },
  { n: 4, t: '10:40 to 11:20' },
  { b: 'Tea break', t: '11:20 to 11:40' },
  { n: 5, t: '11:40 to 12:20' },
  { n: 6, t: '12:20 to 1:00' },
  { b: 'Lunch', t: '1:00 to 2:00' },
  { n: 7, t: '2:00 to 2:40' },
  { n: 8, t: '2:40 to 3:20' },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const DAYNAMES = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday' };

const EXTRA = ['Games', 'Clubs', 'Library', 'Pastoral programme', 'Assembly', 'Remedial'];

export const SLOTS = PERIODS.filter((p) => p.n).length * DAYS.length;
const slot = (t, d, n) => ((t.grid || {})[d] || {})[n] || {};

// The class a teacher is already booked into at this time, other than `except`.
function busyAt(tid, d, n, except) {
  if (!tid) return '';
  const hit = all('timetables').find((t) => (t.classId || t.id) !== except && slot(t, d, n).t === tid && slot(t, d, n).a);
  return hit ? hit.classId || hit.id : '';
}
// Every lesson a teacher has in the week, as [day, lesson, area, classId].
const lessonsOf = (tid) =>
  all('timetables').flatMap((t) =>
    DAYS.flatMap((d) =>
      PERIODS.filter((p) => p.n && slot(t, d, p.n).t === tid && slot(t, d, p.n).a).map((p) => [d, p.n, slot(t, d, p.n).a, t.classId || t.id]),
    ),
  );
// How full a class timetable is, and how many lessons still need a teacher.
export function filledIn(cid) {
  const t = get('timetables', cid) || {};
  let n = 0,
    noT = 0;
  DAYS.forEach((d) =>
    PERIODS.forEach((p) => {
      const x = p.n ? slot(t, d, p.n) : {};
      if (!x.a) return;
      n++;
      if (!x.t && !EXTRA.includes(x.a)) noT++;
    }),
  );
  return { n, noT };
}

const weekGrid = (cell) =>
  `<div class="tw"><table class="tt"><thead><tr><th>Time</th>${DAYS.map((d) => `<th>${DAYNAMES[d]}</th>`).join('')}</tr></thead><tbody>${PERIODS.map((p) => (p.b ? `<tr><td class="brk">${p.t}</td><td class="brk" colspan="5">${p.b}</td></tr>` : `<tr><th scope="row">${p.t}</th>${DAYS.map((d) => `<td>${cell(d, p.n)}</td>`).join('')}</tr>`)).join('')}</tbody></table></div>`;

const modeBar = () =>
  `<div class="seg mode" role="group" aria-label="Timetable view">${[
    ['class', 'Class timetables'],
    ['teacher', 'By teacher'],
    ['load', 'Workload'],
  ]
    .map(([k, l]) => `<button aria-pressed="${(ui.ttMode || 'class') === k}" data-act="ttMode" data-v="${k}">${l}</button>`)
    .join('')}</div>`;

// The school office: any one teacher's week.
function byTeacher() {
  const ts = teachers();
  if (!ts.length) return empty('No teachers yet', 'Add teaching staff first.');
  if (!ts.find((t) => t.id === ui.ttTeacher)) ui.ttTeacher = ts[0].id;
  const tid = ui.ttTeacher,
    ls = lessonsOf(tid);
  return (
    `<div class="tools">${modeBar()}<label class="sr" for="ttT">Teacher</label><select id="ttT" data-ch="ttTeacher">${ts.map((t) => `<option value="${esc(t.id)}" ${t.id === tid ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select><span class="small muted">${ls.length} lessons a week, ${SLOTS - ls.length} free periods</span></div>` +
    weekGrid((d, n) =>
      ls
        .filter((x) => x[0] === d && x[1] === n)
        .map((x) => `<b>${esc(x[2])}</b><small>${esc(className(x[3]))}</small>`)
        .join(''),
    )
  );
}

// The school office: lessons per teacher, and how full each class timetable is.
function workload() {
  const ts = teachers(),
    cls = classesSorted();
  return `<div class="tools">${modeBar()}</div>
    <h2 class="sec-h">Teachers</h2>
    ${table(
      ['Staff no.', 'Teacher', ['Lessons a week', 'num'], ['Free periods', 'num'], 'Classes taught', 'Class teacher of', ''],
      ts.map((t) => {
        const ls = lessonsOf(t.id),
          taught = [...new Set(ls.map((x) => className(x[3])))],
          own = cls.filter((c) => c.teacherId === t.id).map((c) => c.name);
        return `<tr><td>${esc(t.staffNo || '')}</td><td><b>${esc(t.name)}</b><br><span class="small muted">${esc(t.role || '')}</span></td><td class="num"><b>${ls.length}</b></td><td class="num">${SLOTS - ls.length}</td><td class="small">${esc(taught.join(', ')) || '<span class="muted">No lessons yet</span>'}</td><td>${esc(own.join(', ')) || '<span class="muted">None</span>'}</td><td class="act"><button class="btn sm" data-act="ttShowTeacher" data-id="${esc(t.id)}">See week</button></td></tr>`;
      }),
    )}
    <h2 class="sec-h">Classes</h2>
    ${table(
      ['Level', 'Class and teacher', ['Lessons filled', 'num'], ['Empty slots', 'num'], ['Lessons with no teacher', 'num'], ''],
      cls.map((c) => {
        const f = filledIn(c.id);
        return `<tr><td>${esc(LEVELS[c.level] || '')}</td><td><b>${esc(c.name)}</b><br><span class="small muted">${esc(staffName(c.teacherId)) || 'No class teacher'}</span></td><td class="num">${f.n} of ${SLOTS}</td><td class="num">${SLOTS - f.n ? `<b>${SLOTS - f.n}</b>` : 0}</td><td class="num">${f.noT ? `<b>${f.noT}</b>` : 0}</td><td class="act"><button class="btn sm" data-act="ttShowClass" data-id="${esc(c.id)}">Edit timetable</button></td></tr>`;
      }),
    )}`;
}

V.timetable = () => {
  if (isAdmin() && ui.ttMode === 'teacher') return byTeacher();
  if (isAdmin() && ui.ttMode === 'load') return workload();
  const mine = isTeacher() && ui.mine;
  const cid = pickClass();
  if (!cid && !mine) return isParent() ? noKid() : empty('No classes yet', 'The school office adds classes first.');
  const grid = (get('timetables', cid) || {}).grid || {},
    edit = isAdmin() && canEdit();
  const cell = (d, n) => {
    if (mine) {
      const hits = [];
      all('timetables').forEach((t) => {
        const x = ((t.grid || {})[d] || {})[n];
        if (x && x.t === session.id && x.a)
          hits.push(`<b>${esc(x.a)}</b><small>${esc(className(t.classId || t.id))}</small>`);
      });
      return hits.join('') || '';
    }
    const x = (grid[d] || {})[n] || {};
    const inner = x.a
      ? `<b>${esc(x.a)}</b>${x.t ? `<small>${esc(staffName(x.t))}</small>` : ''}`
      : edit
        ? '<span class="muted">Add</span>'
        : '';
    return edit
      ? `<button data-act="cellForm" data-d="${d}" data-n="${n}" aria-label="${DAYNAMES[d]} lesson ${n}: ${esc(x.a || 'empty')}. Edit">${inner}</button>`
      : inner;
  };
  const f = isAdmin() ? filledIn(cid) : null;
  const tools = `<div class="tools">${isAdmin() ? modeBar() : ''}${isParent() ? '' : mine ? '' : classSelect('ttClass', 'classId', cid)}${isTeacher() ? `<button class="btn" data-act="toggleMine">${mine ? 'Show a class timetable' : 'Show only my lessons'}</button>` : ''}${edit ? `<span class="small muted">${f.n} of ${SLOTS} lessons filled${f.noT ? `, ${f.noT} without a teacher` : ''}. Select a lesson to change it.</span>` : ''}</div>`;
  return (
    (isParent() ? kidPicker() : '') +
    tools +
    `<div class="tw"><table class="tt"><thead><tr><th>Time</th>${DAYS.map((d) => `<th>${DAYNAMES[d]}</th>`).join('')}</tr></thead><tbody>${PERIODS.map((p) => (p.b ? `<tr><td class="brk">${p.t}</td><td class="brk" colspan="5">${p.b}</td></tr>` : `<tr><th scope="row">${p.t}</th>${DAYS.map((d) => `<td>${cell(d, p.n)}</td>`).join('')}</tr>`)).join('')}</tbody></table></div>`
  );
};

function cellForm(d, n) {
  const cid = pickClass(),
    cls = get('classes', cid),
    x = (((get('timetables', cid) || {}).grid || {})[d] || {})[n] || {};
  openForm({
    title: `${cls.name}, ${DAYNAMES[d]} lesson ${n}`,
    values: x,
    fields: [
      {
        k: 'a',
        l: 'Learning area or activity',
        t: 'select',
        full: true,
        o: [['', 'Free lesson'], ...areasFor(cls), ...EXTRA],
      },
      {
        k: 't',
        l: 'Teacher',
        t: 'select',
        full: true,
        o: [
          ['', 'No teacher'],
          ...teachers().map((t) => {
            const b = busyAt(t.id, d, n, cid);
            return [t.id, b ? `${t.name} (teaching ${className(b)} then)` : t.name];
          }),
        ],
      },
    ],
    onSave: async (v) => {
      const b = v.a && busyAt(v.t, d, n, cid);
      if (b)
        return `${staffName(v.t)} is already teaching ${className(b)} on ${DAYNAMES[d]}, lesson ${n}. Choose another teacher or change that lesson first.`;
      await mergeDoc(
        'timetables',
        cid,
        { classId: cid, grid: {} },
        { grid: { [d]: { [n]: { a: v.a, t: v.a ? v.t : '' } } } },
      );
      toast('Timetable saved', 'success');
    },
  });
}

Object.assign(A, {
  cellForm: (d) => cellForm(d.d, d.n),
  ttMode: (d) => {
    ui.ttMode = d.v;
    paint();
  },
  ttShowTeacher: (d) => {
    ui.ttMode = 'teacher';
    ui.ttTeacher = d.id;
    paint();
    window.scrollTo(0, 0);
  },
  ttShowClass: (d) => {
    ui.ttMode = 'class';
    ui.classId = d.id;
    paint();
    window.scrollTo(0, 0);
  },
  toggleMine: () => {
    ui.mine = !ui.mine;
    paint();
  },
});

Object.assign(onChange, {
  ttTeacher: (el) => {
    ui.ttTeacher = el.value;
    paint();
  },
});
