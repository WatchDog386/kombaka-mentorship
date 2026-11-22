// Attendance. The school office sees every class at once (attOverview) and can open any class's
// register; a teacher marks their class register; a parent sees their child's record.

import { A, V, onChange } from '../core/registry.js';
import { paint } from '../core/render.js';
import { LEVELS, activeLearners, attStats, cfg, className, classesSorted, dayMarks, learnersIn, staffName, termId, termLabel } from '../core/school.js';
import { isAdmin, isParent, kid, pickClass, ui } from '../core/state.js';
import { get, mergeDoc } from '../core/store.js';
import { empty, table, toast } from '../core/ui.js';
import { asDate, clone, esc, fmtDate, phone, today } from '../core/util.js';
import { canEdit, classSelect, kidPicker, noKid } from '../core/widgets.js';

function attDraft(cid, date) {
  const key = cid + '|' + date;
  if (!ui.att || ui.att.key !== key || !ui.att.dirty)
    ui.att = { key, marks: clone(dayMarks(cid, date) || {}), dirty: false };
  return ui.att;
}

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

// The school office's view: every class's register for one day, the whole school's totals, and
// the learners who keep missing school this term.
function attOverview() {
  const cls = classesSorted(),
    date = ui.date;
  let marked = 0;
  const all = { P: 0, L: 0, A: 0, n: 0 };
  const rows = cls.map((c) => {
    const L = learnersIn(c.id),
      d = dayMarks(c.id, date),
      n = { P: 0, L: 0, A: 0 };
    if (d) {
      marked++;
      L.forEach((l) => d[l.id] && n[d[l.id]]++);
      all.P += n.P;
      all.L += n.L;
      all.A += n.A;
      all.n += n.P + n.L + n.A;
    }
    const t = get('staff', c.teacherId);
    return `<tr class="mobile-list-row" data-act="drill" data-v="${esc(c.id)}" tabindex="0" aria-label="Open register for ${esc(c.name)}"><td>${esc(LEVELS[c.level] || '')}</td><td class="mobile-list-primary"><b>${esc(c.name)}</b><br><span class="small muted">${t ? esc(t.name) : 'No class teacher'}${t && t.phone ? ', ' + esc(phone(t.phone)) : ''}</span></td>
      <td>${d ? '<span class="chip ok">Marked</span>' : L.length ? '<span class="chip bad">Not marked</span>' : '<span class="chip">No learners</span>'}</td>
      <td class="num">${d ? n.P : ''}</td><td class="num">${d ? n.L : ''}</td><td class="num">${d ? n.A : ''}</td><td class="num">${d ? pct(n.P + n.L, n.P + n.L + n.A) + '%' : ''}</td>
      <td class="act"><button class="btn sm${d ? '' : ' primary'}" data-act="drill" data-v="${esc(c.id)}">${d ? 'View register' : 'Open register'}</button></td></tr>`;
  });
  const missing = activeLearners()
    .map((l) => [l, attStats(l)])
    .filter(([, s]) => s.A >= 3)
    .sort((a, b) => b[1].A - a[1].A)
    .slice(0, 12);
  return `<div class="tools"><label class="sr" for="attDate">Date</label><input type="date" id="attDate" data-ch="date" value="${esc(date)}" max="${today()}"><span class="small muted">${fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
    <div class="strip"><div><b>${marked} of ${cls.length}</b><span>Class registers marked</span></div><div><b>${all.n ? pct(all.P + all.L, all.n) + '%' : '—'}</b><span>Present across the school</span></div><div><b>${all.L}</b><span>Late</span></div><div><b>${all.A}</b><span>Absent</span></div></div>
    <h2 class="sec-h">Registers by class</h2>
    ${table(['Level', 'Class and teacher', 'Register', ['Present', 'num'], ['Late', 'num'], ['Absent', 'num'], ['Attendance', 'num'], ''], rows)}
    <h2 class="sec-h">Learners missing school, ${esc(termLabel())}</h2>
    ${
      missing.length
        ? table(
            ['Adm no.', 'Learner', 'Class', ['Days absent', 'num'], ['Days late', 'num'], 'Parent or guardian'],
            missing.map(
              ([l, s]) =>
                `<tr><td>${esc(l.admNo)}</td><td class="mobile-list-primary"><b>${esc(l.name)}</b></td><td>${esc(className(l.classId))}</td><td class="num"><b>${s.A}</b> of ${s.total}</td><td class="num">${s.L}</td><td>${esc(l.guardianName)}<br><span class="small muted">${esc(phone(l.guardianPhone))}</span></td></tr>`,
            ),
          )
        : '<p class="muted">No learner has missed three or more days this term.</p>'
    }`;
}

V.attendance = () => {
  if (isParent()) return attParent();
  if (isAdmin() && !ui.drill) return attOverview();
  const cid = pickClass();
  if (!cid) return empty('No classes yet', 'The school office adds classes and learners first.');
  const L = learnersIn(cid),
    d = attDraft(cid, ui.date),
    wk = [0, 6].includes(asDate(ui.date).getDay());
  const cnt = { P: 0, L: 0, A: 0 };
  L.forEach((l) => {
    if (d.marks[l.id]) cnt[d.marks[l.id]]++;
  });
  const tools = `<div class="tools">${isAdmin() ? '<button class="btn" data-act="drill" data-v="">All classes</button>' : ''}${classSelect('attClass', 'classId', cid)}<label class="sr" for="attDate">Date</label><input type="date" id="attDate" data-ch="date" value="${esc(ui.date)}" max="${today()}"><span class="grow"></span>${canEdit() && L.length ? '<button class="btn" data-act="markAll">Mark everyone present</button><button class="btn primary" data-act="saveAtt">Save register</button>' : ''}</div>`;
  if (!L.length)
    return tools + empty('No learners in ' + className(cid), 'Admit learners to this class to mark a register.');
  const seg = (l, v, label, k) =>
    `<button class="${k}" aria-pressed="${d.marks[l.id] === v}" data-act="mark" data-id="${esc(l.id)}" data-v="${v}">${label}</button>`;
  return (
    tools +
    `<p class="small muted" style="margin-bottom:.7rem">${fmtDate(ui.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${wk ? '. This date falls on a weekend.' : ''}. ${cnt.P} present, ${cnt.L} late, ${cnt.A} absent, ${L.length - cnt.P - cnt.L - cnt.A} not marked.${d.dirty ? ' <b>Changes not saved.</b>' : ''}</p>` +
    table(
      [['Adm no.', 'hide-sm'], 'Learner', 'Register', ['Present this term', 'num hide-sm']],
      L.map((l) => {
        const s = attStats(l);
        return `<tr><td class="hide-sm">${esc(l.admNo)}</td><td class="mobile-list-primary"><b>${esc(l.name)}</b></td><td><span class="seg" role="group" aria-label="Register for ${esc(l.name)}">${seg(l, 'P', 'Present', 'p')}${seg(l, 'L', 'Late', 'l')}${seg(l, 'A', 'Absent', 'a')}</span></td><td class="num hide-sm">${s.total ? s.present + ' of ' + s.total : ''}</td></tr>`;
      }),
    )
  );
};

function attParent() {
  const k = kid();
  if (!k) return noKid();
  const s = attStats(k);
  return (
    kidPicker() +
    `<div class="strip"><div><b>${s.total}</b><span>School days recorded</span></div><div><b>${s.P}</b><span>Present on time</span></div><div><b>${s.L}</b><span>Late</span></div><div><b>${s.A}</b><span>Absent</span></div></div>` +
    (s.misses.length
      ? table(
          ['Date', 'Register'],
          s.misses
            .reverse()
            .map(
              ([d, v]) =>
                `<tr><td>${fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' })}</td><td><span class="chip ${v === 'A' ? 'bad' : 'warn'}">${v === 'A' ? 'Absent' : 'Late'}</span></td></tr>`,
            ),
        )
      : empty(
          s.total ? 'Present and on time every day' : 'No register marked yet',
          s.total
            ? `${k.name.split(' ')[0]} has not missed a day in ${termLabel()}.`
            : 'Attendance appears here once the class teacher marks the register.',
        ))
  );
}

Object.assign(A, {
  mark: (d) => {
    if (!canEdit()) return;
    const a = ui.att;
    if (!a) return;
    a.marks[d.id] = d.v;
    a.dirty = true;
    paint();
  },
  markAll: () => {
    const cid = pickClass(),
      a = attDraft(cid, ui.date);
    learnersIn(cid).forEach((l) => {
      if (!a.marks[l.id]) a.marks[l.id] = 'P';
    });
    a.dirty = true;
    paint();
  },
  saveAtt: async () => {
    const cid = pickClass(),
      a = attDraft(cid, ui.date),
      L = learnersIn(cid),
      c = cfg();
    const left = L.filter((l) => !a.marks[l.id]).length;
    if (left) return toast(`${left} learner${left === 1 ? ' is' : 's are'} not marked yet.`, 'warn');
    const marks = {};
    L.forEach((l) => (marks[l.id] = a.marks[l.id]));
    a.dirty = false;
    if (
      await mergeDoc(
        'attendance',
        termId(cid),
        { classId: cid, year: c.year, term: c.term, days: {} },
        { days: { [ui.date]: marks } },
      )
    )
      toast('Register saved for ' + className(cid), 'success');
  },
});

Object.assign(onChange, {
  date: (el) => {
    if (el.value) {
      ui.date = el.value;
      ui.att = null;
      paint();
    }
  },
});
