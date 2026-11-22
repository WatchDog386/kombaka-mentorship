// The first screen after sign-in, one version for each role.

import { compact, lineChart, meter, stackBar, tableView } from '../core/charts.js';
import { P, line } from '../core/icons.js';
import { A, V } from '../core/registry.js';
import { go, paint } from '../core/render.js';
import {
  LEVELS,
  activeLearners,
  attStats,
  balance,
  billed,
  cfg,
  className,
  classesSorted,
  dayMarks,
  learnersIn,
  paid,
  results,
  teachers,
  termId,
  termLabel,
} from '../core/school.js';
import { isAdmin, isTeacher, kid, meName, myClass, myKids, session, ui } from '../core/state.js';
import { all, get } from '../core/store.js';
import { empty } from '../core/ui.js';
import { asDate, esc, fmtDate, fmtDay, iso, kes, phone, sum, today } from '../core/util.js';
import { feeChip, lvlChip, noKid } from '../core/widgets.js';
import { myThreads } from './messages.js';
import { visibleNotices } from './notices.js';
import { PERIODS, SLOTS, filledIn } from './timetable.js';

V.dashboard = () => (isAdmin() ? dashAdmin() : isTeacher() ? dashTeacher() : dashParent());

/* ---------- Pieces shared by the three dashboards ---------- */

const ic = (name, s = 20) => line(P[name], s);
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
const firstName = (n) => String(n || '').split(/\s+/)[0];
const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : 0);

// "Today", "Yesterday", "3 days ago" or a date.
function ago(d) {
  const n = Math.round((asDate(today()) - asDate(d)) / 864e5);
  return n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : n < 7 ? n + ' days ago' : fmtDate(d, { day: 'numeric', month: 'short' });
}

// A card with a heading, an optional "View all" link and a body.
const card = (title, body, link = '', cls = '') =>
  `<section class="card ${cls}"><div class="card-h"><h2>${title}</h2>${link}</div>${body}</section>`;
const viewAll = (v, label = 'View all') =>
  `<button class="lnk" data-act="go" data-v="${v}">${label}${ic('right', 16)}</button>`;

// A headline number on a solid coloured box: the number, its label, a large faded icon on the
// right and a "More info" strip along the foot that opens the page behind the number.
// tone: blue, green, yellow or red.
const tile = (tone, icon, view, label, value, sub = '', extra = '') =>
  `<div class="sbox ${tone}"><div class="sbox-in"><b class="sbox-v">${value}</b><span class="sbox-l">${label}</span>${extra}${sub ? `<small>${sub}</small>` : ''}</div><i class="sbox-i">${ic(icon, 54)}</i>
    <button class="sbox-more" data-act="go" data-v="${view}">More info ${ic('arrow', 15)}</button></div>`;

// Rows of activity: icon, what happened, details and when.
const feed = (items) =>
  items.length
    ? `<ul class="feed">${items.map((f) => `<li><i class="fi ${f.tone}">${ic(f.icon, 18)}</i><div><b>${esc(f.title)}</b><span>${esc(f.text)}</span></div><time>${esc(ago(f.date))}</time></li>`).join('')}</ul>`
    : '<p class="muted small">Nothing new yet.</p>';

// Small square buttons for the things people do most.
const quick = (items) =>
  `<div class="quick">${items.map(([icon, tone, label, act, v, t]) => `<button data-act="${act}" ${v ? `data-v="${v}"` : ''} ${t ? `data-t="${t}"` : ''}><i class="fi ${tone}">${ic(icon, 20)}</i><span>${label}</span></button>`).join('')}</div>`;

// "This term's work": cards that each say where something stands, with one button to act on it.
// [tone, heading, text, button label, action, view, data-id]. The office always sees them; on the
// teacher's dashboard they stand in for the greeting banner on phones (cls 'm-only').
const steps = (items, label, cls = '') =>
  `<section class="steps ${cls}" aria-label="${esc(label)}">${items
    .map(
      ([tone, h, p, b, act, v, id]) =>
        `<div class="step"><h3>${h}</h3><p>${p}</p><button class="btn sm ${tone}" data-act="${act}"${v ? ` data-v="${v}"` : ''}${id ? ` data-id="${esc(id)}"` : ''}>${b}</button></div>`,
    )
    .join('')}</section>`;

// The greeting banner on the teacher and parent dashboards. Phones leave it out (d-only): the top
// bar already greets them, and the work cards or tiles below carry its buttons.
const hero = (title, text, buttons) =>
  `<section class="hero d-only"><div class="hero-t"><p class="hero-k">${esc(fmtDate(today(), { weekday: 'long', day: 'numeric', month: 'long' }))}</p><h2>${esc(title)}</h2><p>${text}</p><div class="hero-b">${buttons}</div></div><img class="hero-img" src="/assets/hero.png" alt=""></section>`;

// Event types each keep one colour on the calendar; the list beside it names them.
const EV_TONE = { Academic: 'var(--viz-1)', Assessment: 'var(--viz-2)', Event: 'var(--viz-3)', Holiday: 'var(--viz-8)', Meeting: 'var(--viz-7)' };
const evTone = (e) => EV_TONE[e.type] || 'var(--viz-1)';

// A month calendar with school events marked, and the month's events listed under it.
function miniCal() {
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + (ui.calOff || 0));
  const y = base.getFullYear(),
    m = base.getMonth(),
    lead = (new Date(y, m, 1).getDay() + 6) % 7,
    days = new Date(y, m + 1, 0).getDate(),
    t = today(),
    evs = all('events');
  const on = (d) => evs.filter((e) => d >= e.date && d <= (e.endDate || e.date));
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span></span>');
  for (let d = 1; d <= days; d++) {
    const day = iso(new Date(y, m, d)),
      es = on(day);
    cells.push(
      `<span class="${day === t ? 'td' : ''} ${es.length ? 'ev' : ''}" ${es.length ? `style="--c:${evTone(es[0])}" title="${esc(es.map((e) => e.title).join(', '))}"` : ''}>${d}</span>`,
    );
  }
  const month = iso(new Date(y, m, 1)).slice(0, 7);
  const list = evs
    .filter((e) => String(e.date).slice(0, 7) === month || String(e.endDate || '').slice(0, 7) === month)
    .sort((a, b) => a.date.localeCompare(b.date));
  return `<div class="cal-h"><b>${base.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</b><span><button class="ib sm" data-act="calMove" data-d="-1" aria-label="Previous month">${ic('left', 18)}</button><button class="ib sm" data-act="calMove" data-d="1" aria-label="Next month">${ic('right', 18)}</button></span></div>
    <div class="cal-wrap"><div class="cal" aria-hidden="true">${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => `<em>${d}</em>`).join('')}${cells.join('')}</div></div>
    ${list.length ? `<ul class="cal-l cal-details">${list.map((e) => `<li><i style="background:${evTone(e)}"></i><span>${esc(e.title)}<small>${esc(e.type || '')}</small></span><time>${fmtDate(e.date, { day: 'numeric', month: 'short' })}${e.endDate && e.endDate !== e.date ? ' to ' + fmtDate(e.endDate, { day: 'numeric', month: 'short' }) : ''}</time></li>`).join('')}</ul>` : '<p class="muted small cal-details" style="margin-top:.8rem">No school events this month.</p>'}`;
}

// Each day's share of learners marked present or late, for one class or for the whole school.
function attendanceSeries(classIds) {
  const byDay = {};
  classIds.forEach((cid) => {
    const doc = get('attendance', termId(cid));
    Object.entries((doc && doc.days) || {}).forEach(([d, marks]) => {
      const v = Object.values(marks || {});
      if (!v.length) return;
      const o = (byDay[d] = byDay[d] || { p: 0, n: 0 });
      o.n += v.length;
      o.p += v.filter((s) => s !== 'A').length;
    });
  });
  return Object.keys(byDay)
    .sort()
    .slice(-20)
    .map((d) => ({ x: fmtDate(d, { day: 'numeric', month: 'short' }), tip: fmtDay(d), v: pctOf(byDay[d].p, byDay[d].n) }));
}

const LEVEL_PARTS = [
  ['ee', 'Exceeding'],
  ['me', 'Meeting'],
  ['ae', 'Approaching'],
  ['be', 'Below'],
];
// Results recorded this term for a set of learners: how many, out of how many, and at which level.
function resultsSummary(ls) {
  const tones = { ee: 0, me: 0, ae: 0, be: 0 };
  let done = 0,
    total = 0;
  ls.forEach((l) => {
    const r = results(l);
    done += r.done;
    total += r.total;
    r.rows.forEach((x) => x.r && tones[x.r.tone]++);
  });
  return { done, total, pct: pctOf(done, total), parts: LEVEL_PARTS.map(([k, n]) => ({ n, v: tones[k], c: `var(--viz-${k})` })) };
}

/* ---------- School office ---------- */

// Fees collected so far this term, added up at the end of each week.
function feeSeries() {
  const c = cfg(),
    t = c.terms[c.term] || {};
  if (!t.s) return [];
  const pays = all('payments').filter((p) => +p.year === +c.year && +p.term === +c.term);
  const end = [t.e || today(), today()].sort()[0],
    upTo = (day) => sum(pays.filter((p) => p.date <= day).map((p) => p.amount));
  const pts = [];
  for (let d = asDate(t.s); iso(d) <= end; d = new Date(d.getTime() + 7 * 864e5)) pts.push(iso(d));
  if (pts[pts.length - 1] !== end) pts.push(end);
  return pts.map((day) => ({ x: fmtDate(day, { day: 'numeric', month: 'short' }), tip: 'Collected by ' + fmtDay(day), v: upTo(day) }));
}

const APP_TONE = { New: 'warn', Contacted: 'info', Admitted: 'ok', Closed: '' };

function dashAdmin() {
  const ls = activeLearners(),
    cls = classesSorted();
  if (!ls.length && !cls.length)
    return empty(
      'No school records yet',
      'Start with the school profile and fee structure, then add classes, staff and learners.',
      '<button class="btn primary" data-act="go" data-v="settings">Set up the school</button>',
    );
  const staffN = all('staff').filter((s) => s.status !== 'Left').length,
    girls = ls.filter((l) => l.gender === 'F').length;
  const exp = sum(ls.map(billed)),
    got = sum(ls.map(paid)),
    pct = pctOf(got, exp);
  const t = today();
  let marked = 0,
    pres = 0,
    tot = 0;
  cls.forEach((c) => {
    const d = dayMarks(c.id, t);
    if (!d) return;
    marked++;
    learnersIn(c.id).forEach((l) => {
      if (!d[l.id]) return;
      tot++;
      if (d[l.id] !== 'A') pres++;
    });
  });
  const apps = all('applications').sort((a, b) => String(b.date).localeCompare(a.date)),
    newApps = apps.filter((a) => (a.status || 'New') === 'New').length;
  const rs = resultsSummary(ls);

  const tiles = `<div class="tiles">
    ${tile('blue', 'users', 'learners', 'Learners enrolled', ls.length.toLocaleString('en-KE'), `${ls.length - girls} boys, ${girls} girls`)}
    ${tile('green', 'badge', 'staff', 'Staff', staffN, `${teachers().length} teaching`)}
    ${tile('yellow', 'wallet', 'fees', 'Fees collected', 'KES ' + compact(got), `${pct}% of ${kes(exp)}`, meter(pct, '', pct + '% of this term’s fees collected'))}
    ${tile('red', 'check', 'attendance', 'Present today', marked ? pctOf(pres, tot) + '%' : '—', marked ? `${marked} of ${cls.length} registers marked` : 'No registers marked yet')}
  </div>`;

  // Head teacher's remarks still to write, and class timetables with gaps.
  const c0 = cfg(),
    headLeft = ls.filter((l) => !((get('remarks', `${l.id}_${c0.year}_T${c0.term}`) || {}).head || '').trim()).length,
    gaps = cls.filter((c) => {
      const f = filledIn(c.id);
      return f.n < SLOTS || f.noT;
    }).length;
  const work = [
    ['blue', 'Admissions', newApps ? `${newApps} new application${newApps === 1 ? '' : 's'} waiting for a call.` : 'No new applications waiting.', 'Review', 'go', 'applications'],
    ['green', 'Registers today', `${marked} of ${cls.length} class registers marked. ${cls.length - marked ? 'Follow up with the class teachers below.' : 'Every class is done.'}`, 'See all classes', 'go', 'attendance'],
    ['violet', 'Report cards', `${rs.pct}% of results recorded; ${headLeft} report${headLeft === 1 ? '' : 's'} waiting for head teacher remarks.`, 'Review reports', 'go', 'reports'],
    ['orange', 'Timetables', gaps ? `${gaps} class timetable${gaps === 1 ? ' has' : 's have'} empty lessons or lessons with no teacher.` : 'Every class timetable is complete.', 'Build timetables', 'go', 'timetable'],
  ];
  const workflow = steps(work, 'This term’s work');

  const weekend = [0, 6].includes(new Date().getDay());
  const unmarked = cls.filter((c) => learnersIn(c.id).length && !dayMarks(c.id, t));
  const registerBody = weekend
    ? '<p class="muted">It is the weekend. Registers are marked on school days.</p>'
    : unmarked.length
      ? `<ul class="rows">${unmarked
          .slice(0, 5)
          .map((c) => {
            const tch = get('staff', c.teacherId);
            return `<li><span class="grow"><b>${esc(c.name)}</b><small>${tch ? esc(tch.name) + (tch.phone ? ', ' + esc(tch.phone) : '') : 'No class teacher assigned'}</small></span>${tch && tch.phone ? `<a class="btn sm register-call" href="tel:${esc(String(tch.phone).replace(/\s+/g, ''))}" aria-label="Call ${esc(tch.name)} at ${esc(tch.phone)}" title="Call ${esc(tch.name)}">${ic('phone', 16)}</a>` : `<button class="btn sm" data-act="go" data-v="classes">Assign</button>`}</li>`;
          })
          .join('')}</ul>`
      : '<p class="muted">Every class register is marked for today.</p>';
  const registers = `<section class="registers-missing"><div class="card-h"><h2>Registers not marked today</h2>${viewAll('attendance', 'All classes')}</div>${registerBody}</section>`;

  const fs = feeSeries();
  const levelParts = Object.keys(LEVELS).map((k, i) => ({
    n: LEVELS[k],
    v: ls.filter((l) => (get('classes', l.classId) || {}).level === k).length,
    c: `var(--viz-${i + 1})`,
  }));
  const stats = card(
    'This term',
    `<div class="stats">
      <div><h3>Fees collected so far</h3><p class="big">${kes(got)}<small> of ${kes(exp)} billed</small></p>
        ${lineChart(fs, { fmt: kes, w: 470, label: 'Fees collected so far this term, added up each week' })}</div>
    </div>`,
    `<span class="pill-t">${esc(termLabel())}</span>`,
    'stats-card',
  );

  const recent = card(
    'Recent applications',
    apps.length
      ? `<div class="tw"><table class="t"><thead><tr><th>Date</th><th>Child</th><th>Class wanted</th><th>Parent or guardian</th><th>Phone</th><th>Status</th></tr></thead><tbody>${apps
          .slice(0, 5)
          .map(
            (a) =>
              `<tr><td style="white-space:nowrap">${fmtDate(a.date)}</td><td><b>${esc(a.child)}</b></td><td>${esc(get('classes', a.classId) ? className(a.classId) : a.classId || '')}</td><td>${esc(a.parent)}</td><td style="white-space:nowrap">${esc(phone(a.phone))}</td><td><span class="chip ${APP_TONE[a.status] || 'warn'}">${esc(a.status || 'New')}</span></td></tr>`,
          )
          .join('')}</tbody></table></div>`
      : '<p class="muted">No applications yet. Families apply by creating an account on the school home page.</p>',
    viewAll('applications'),
  );

  const owing = ls
    .map((l) => [l, balance(l)])
    .filter((x) => x[1] > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const balances = card(
    'Largest fee balances',
    owing.length
      ? `<ul class="rows">${owing.map(([l, b]) => `<li><span class="grow"><b>${esc(l.name)}</b><small>${esc(className(l.classId))}, ${esc(phone(l.guardianPhone))}</small></span><b class="num">${kes(b)}</b></li>`).join('')}</ul>`
      : '<p class="muted">Every learner has cleared fees.</p>',
    viewAll('fees', 'Open fees'),
  );
  const maxN = Math.max(1, ...cls.map((c) => learnersIn(c.id).length));
  const enrolClasses = cls.filter((c) => (get('classes', c.id) || {}).level !== 'junior');
  const enrol = card(
    'Enrolment by class',
    `<div class="enrol">${enrolClasses
      .map((c) => {
        const L = learnersIn(c.id),
          g = L.filter((l) => l.gender === 'F').length,
          b = L.length - g;
        return `<span>${esc(c.name)}</span><div class="hb" role="img" aria-label="${esc(c.name)}: ${b} boys, ${g} girls"><i style="width:${(b / maxN) * 100}%;background:var(--viz-1)"></i><i style="width:${(g / maxN) * 100}%;background:var(--viz-2)"></i></div><span class="num">${L.length}</span>`;
      })
      .join('')}</div><ul class="sb-key inline"><li><i style="background:var(--viz-1)"></i><span>Boys</span><b>${ls.length - girls}</b></li><li><i style="background:var(--viz-2)"></i><span>Girls</span><b>${girls}</b></li></ul>`,
  );

  const pays = all('payments')
    .sort((a, b) => String(b.date).localeCompare(a.date))
    .slice(0, 4);
  const items = [
    ...apps.slice(0, 4).map((a) => ({ icon: 'inbox', tone: 'blue', title: 'Application received', text: `${a.child}, ${get('classes', a.classId) ? className(a.classId) : a.classId || 'class not given'}`, date: a.date })),
    ...pays.map((p) => ({ icon: 'wallet', tone: 'green', title: 'Fee payment received', text: `${kes(p.amount)} for ${(get('learners', p.learnerId) || {}).name || 'a learner'}`, date: p.date })),
    ...visibleNotices()
      .slice(0, 3)
      .map((n) => ({ icon: 'megaphone', tone: 'orange', title: 'Notice posted', text: n.title, date: n.date })),
  ]
    .sort((a, b) => String(b.date).localeCompare(a.date))
    .slice(0, 6);

  return `<div class="dash">
    <div class="dash-main">${tiles}${workflow}${registers}${stats}${recent}<div class="two">${balances}${enrol}</div></div>
    <aside class="dash-side">
      ${card('Recent activity', feed(items))}
      ${card('Important dates', miniCal(), viewAll('calendar', 'Calendar'), 'cal-card')}
      ${card(
        'Quick actions',
        quick([
          ['users', 'blue', 'Admit a learner', 'learnerForm'],
          ['wallet', 'green', 'Record a payment', 'payForm'],
          ['calendar', 'red', 'Schedule a meeting', 'eventForm', '', 'Meeting'],
          ['megaphone', 'violet', 'Post a notice', 'noticeForm'],
          ['clock', 'orange', 'Build timetables', 'go', 'timetable'],
          ['door', 'blue', 'Assign class teachers', 'go', 'classes'],
        ]),
      )}
    </aside></div>`;
}

const initials = (n) =>
  String(n || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

/* ---------- Teacher ---------- */

function dashTeacher() {
  const mc = myClass(),
    t = today(),
    wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];
  const lessons = [];
  all('timetables').forEach((tt) => {
    const g = (tt.grid || {})[wd] || {};
    Object.keys(g).forEach((p) => {
      if (g[p] && g[p].t === session.id && g[p].a) lessons.push([+p, g[p].a, className(tt.classId || tt.id)]);
    });
  });
  lessons.sort((a, b) => a[0] - b[0]);
  const L = mc ? learnersIn(mc.id) : [],
    marks = mc && dayMarks(mc.id, t),
    here = marks ? Object.values(marks).filter((s) => s !== 'A').length : 0;
  const hw = all('homework')
    .filter((h) => h.by === meName() && h.due >= t)
    .sort((a, b) => a.due.localeCompare(b.due));

  const banner = hero(
    `${greeting()}, ${firstName(meName())}!`,
    mc
      ? marks
        ? `The ${esc(mc.name)} register for today is marked: ${here} of ${L.length} learners are in school.`
        : `The ${esc(mc.name)} register for today is not marked yet. It takes a minute.`
      : `You have ${lessons.length} lesson${lessons.length === 1 ? '' : 's'} on the timetable today.`,
    mc
      ? `<button class="btn primary" data-act="go" data-v="attendance">${marks ? 'Open the register' : 'Mark the register'}${ic('arrow', 18)}</button><button class="btn ghost" data-act="go" data-v="assessment">Record assessment</button>`
      : `<button class="btn primary" data-act="go" data-v="assessment">Record assessment${ic('arrow', 18)}</button>`,
  );
  const tiles = `<div class="tiles">
    ${tile('blue', 'users', 'learners', mc ? esc(mc.name) : 'My class', mc ? L.length : '—', mc ? 'Learners in your class' : 'You are not a class teacher')}
    ${tile('green', 'check', 'attendance', 'Present today', marks ? `${here} of ${L.length}` : '—', marks ? pctOf(here, L.length) + '% of the class' : mc ? 'Register not marked yet' : 'No class register')}
    ${tile('yellow', 'clock', 'timetable', 'Lessons today', lessons.length, lessons.length ? 'First at ' + ((PERIODS.find((x) => x.n === lessons[0][0]) || {}).t || '').split(' to ')[0] : 'Nothing on the timetable')}
    ${tile('red', 'book', 'homework', 'Homework due', hw.length, hw.length ? 'Next due ' + fmtDay(hw[0].due) : 'Nothing due')}
  </div>`;

  // Phones: the work cards in place of the banner, and today's lessons as a plain list like the
  // office's "Registers not marked today", with the time on the right.
  const rsT = resultsSummary(L),
    unread = myThreads().filter((m) => (m.msgs[m.msgs.length - 1] || {}).who === 'parent').length;
  const work = steps(
    [
      ...(mc
        ? [['green', 'Register today', marks ? `Marked: ${here} of ${L.length} learners in ${esc(mc.name)} are in school.` : `The ${esc(mc.name)} register is not marked yet. It takes a minute.`, marks ? 'Open the register' : 'Mark the register', 'go', 'attendance']]
        : []),
      ['violet', 'Assessment', `${rsT.pct}% of ${esc(termLabel())} results recorded${mc ? ' for ' + esc(mc.name) : ''}.`, 'Record assessment', 'go', 'assessment'],
      ['orange', 'Homework', hw.length ? `${hw.length} piece${hw.length === 1 ? '' : 's'} of homework due, the next ${fmtDay(hw[0].due)}.` : 'No homework due from you.', 'Set homework', 'hwForm'],
      ['blue', 'Messages', unread ? `${unread} parent message${unread === 1 ? '' : 's'} waiting for a reply.` : 'No parent messages waiting.', 'Open messages', 'go', 'messages'],
    ],
    'Your work today',
    'm-only',
  );
  const lessonList = `<section class="registers-missing m-only"><div class="card-h"><h2>Your lessons today</h2>${viewAll('timetable', 'Timetable')}</div>${
    lessons.length
      ? `<ul class="rows">${lessons
          .map(([p, a, c]) => `<li><span class="grow"><b>${esc(a)}</b><small>${esc(c)}, period ${p}</small></span><small class="due">${esc((PERIODS.find((x) => x.n === p) || {}).t || '')}</small></li>`)
          .join('')}</ul>`
      : '<p class="muted">No lessons on the timetable for today.</p>'
  }</section>`;

  const lessonCards = card(
    'Your lessons today',
    lessons.length
      ? `<div class="lessons">${lessons
          .map(([p, a, c], i) => `<div class="lesson" style="--c:var(--viz-${(i % 4) + 1})"><div class="lesson-top">${ic('book', 22)}<span>Period ${p}</span></div><b>${esc(a)}</b><span>${esc(c)}</span><small>${ic('clock', 14)}${(PERIODS.find((x) => x.n === p) || {}).t || ''}</small></div>`)
          .join('')}</div>`
      : '<p class="muted">No lessons on the timetable for today.</p>',
    viewAll('timetable', 'Timetable'),
    'd-only',
  );

  const series = mc ? attendanceSeries([mc.id]) : [];
  const rs = resultsSummary(L);
  const progress = mc
    ? `<div class="two">${card(
        'Class attendance',
        `${lineChart(series, { fmt: (v) => v + '% present', tick: (v) => v + '%', max: 100, w: 360, label: `${mc.name} attendance by day this term` })}${series.length > 1 ? tableView(['Day', 'Present'], series.map((p) => [p.tip, p.v + '%'])) : ''}`,
        viewAll('attendance', 'Register'),
      )}${card(
        'Assessment progress',
        `<p class="big">${rs.pct}%<small> of ${esc(termLabel())} results recorded</small></p>${meter(rs.pct, rs.pct < 50 ? 'warn' : '', rs.pct + '% of results recorded')}<h3 style="margin-top:1.2rem">Levels so far</h3>${stackBar(rs.parts, { label: 'Results at each expectation level' })}`,
        viewAll('assessment', 'Assessment'),
      )}</div>`
    : '';

  const threads = myThreads().slice(0, 3);
  const items = [
    ...hw.slice(0, 3).map((h) => ({ icon: 'book', tone: 'violet', title: 'Homework set: ' + h.title, text: `${className(h.classId)}, due ${fmtDay(h.due)}`, date: h.date || t })),
    ...threads.map((m) => ({ icon: 'chat', tone: 'blue', title: m.subject || 'Message from a parent', text: (m.msgs[m.msgs.length - 1] || {}).text || '', date: String(m.updated || t).slice(0, 10) })),
    ...visibleNotices()
      .slice(0, 3)
      .map((n) => ({ icon: 'megaphone', tone: 'orange', title: n.title, text: 'Notice from ' + (n.by || 'the school'), date: n.date })),
  ]
    .sort((a, b) => String(b.date).localeCompare(a.date))
    .slice(0, 5);

  return `<div class="dash">
    <div class="dash-main">${banner}${tiles}${work}${lessonList}${lessonCards}${progress}${card('Recent activity', feed(items))}</div>
    <aside class="dash-side">
      ${card('Calendar', miniCal(), viewAll('calendar'), 'cal-card')}
      ${card(
        'Homework you set',
        hw.length
          ? `<ul class="rows">${hw.slice(0, 4).map((h) => `<li><i class="fi violet">${ic('book', 18)}</i><span class="grow"><b>${esc(h.title)}</b><small>${esc(className(h.classId))}, ${esc(h.area)}</small></span><small class="due">${fmtDay(h.due)}</small></li>`).join('')}</ul>`
          : '<p class="muted small">Nothing is due.</p>',
        viewAll('homework'),
      )}
      ${card(
        'Quick links',
        quick([
          ['check', 'green', 'Register', 'go', 'attendance'],
          ['clip', 'violet', 'Assessment', 'go', 'assessment'],
          ['book', 'orange', 'Set homework', 'hwForm'],
          ['chat', 'blue', 'Messages', 'go', 'messages'],
          ['report', 'red', 'Report cards', 'go', 'reports'],
          ['clock', 'blue', 'Timetable', 'go', 'timetable'],
        ]),
      )}
    </aside></div>`;
}

/* ---------- Parent ---------- */

function dashParent() {
  const ks = myKids();
  if (!ks.length) return noKid();
  const c = cfg(),
    t = today(),
    k = kid();
  const names = ks.map((x) => firstName(x.name));
  const who = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
  const banner = hero(
    `${greeting()}, ${firstName(meName())}!`,
    `Here is how ${esc(who)} ${ks.length > 1 ? 'are' : 'is'} doing in ${esc(termLabel())}.`,
    `<button class="btn primary" data-act="kidGo" data-id="${esc(k.id)}" data-v="reports">Progress report${ic('arrow', 18)}</button><button class="btn ghost" data-act="kidGo" data-id="${esc(k.id)}" data-v="fees">${balance(k) > 0 ? 'Pay fees' : 'Fee statement'}</button>`,
  );

  const kidCards = `<div class="kids">${ks
    .map((x, i) => {
      const a = attStats(x),
        r = results(x),
        ap = a.total ? pctOf(a.present, a.total) : null;
      return `<button class="kidc ${x.id === k.id ? 'on' : ''}" data-act="kidPick" data-id="${esc(x.id)}" aria-pressed="${x.id === k.id}" style="--c:var(--viz-${(i % 4) + 1})">
        <span class="kidc-top"><span class="av">${esc(initials(x.name))}</span><span><b>${esc(x.name)}</b><small>${esc(className(x.classId))}, adm. ${esc(x.admNo)}</small></span></span>
        <span class="kidc-row"><span>Attendance</span><b>${ap === null ? 'No record yet' : ap + '%'}</b></span>${meter(ap || 0, ap !== null && ap < 80 ? 'warn' : '', 'Attendance ' + (ap === null ? 'not recorded' : ap + '%'))}
        <span class="kidc-row"><span>Fees</span>${feeChip(x)}</span>
        <span class="kidc-row"><span>Overall</span>${r.overall ? lvlChip(r.overall) : '<span class="muted">Not yet</span>'}</span></button>`;
    })
    .join('')}</div>`;

  const cls = get('classes', k.classId) || {},
    tch = get('staff', cls.teacherId),
    a = attStats(k),
    r = results(k),
    bill = billed(k),
    pd = paid(k),
    bal = balance(k);
  const att = card(
    `${esc(firstName(k.name))}’s attendance`,
    a.total
      ? `<p class="big">${pctOf(a.present, a.total)}%<small> of ${a.total} school days</small></p>${stackBar(
          [
            { n: 'Present', v: a.P, c: 'var(--viz-ee)' },
            { n: 'Late', v: a.L, c: 'var(--viz-ae)' },
            { n: 'Absent', v: a.A, c: 'var(--viz-be)' },
          ],
          { label: 'Days present, late and absent', unit: (v) => (v === 1 ? ' day' : ' days') },
        )}`
      : '<p class="muted">No register has been marked for this term yet.</p>',
    `<button class="lnk" data-act="kidGo" data-id="${esc(k.id)}" data-v="attendance">Details${ic('right', 16)}</button>`,
  );
  const res = card(
    'Results this term',
    r.done
      ? `<ul class="rows">${r.rows.map((x) => `<li><span class="grow"><b>${esc(x.area)}</b></span>${x.r ? lvlChip(x.r) : '<span class="muted small">Not yet</span>'}</li>`).join('')}</ul>${r.overall ? `<p class="small" style="margin-top:.7rem">Overall: <b>${r.mean !== null ? r.mean + '%, ' : ''}${esc(r.overall.n)}</b></p>` : ''}`
      : '<p class="muted">Teachers have not recorded results for this term yet.</p>',
    `<button class="lnk" data-act="kidGo" data-id="${esc(k.id)}" data-v="reports">Report${ic('right', 16)}</button>`,
  );
  const fees = card(
    'Fees, ' + esc(termLabel()),
    `<div class="fees3"><div><span>Billed, KES</span><b>${bill.toLocaleString('en-KE')}</b></div><div><span>Paid, KES</span><b>${pd.toLocaleString('en-KE')}</b></div><div><span>Balance${bal > 0 ? ', KES' : ''}</span><b>${bal > 0 ? bal.toLocaleString('en-KE') : 'Cleared'}</b></div></div>
      ${meter(pctOf(pd, bill), bal > 0 ? 'warn' : '', pctOf(pd, bill) + '% of fees paid')}
      ${
        bal > 0 && c.paybill
          ? `<ol class="paysteps"><li>Open M-Pesa and choose <b>Lipa na M-Pesa</b>, then <b>Pay Bill</b>.</li><li>Business number <b>${esc(c.paybill)}</b>.</li><li>Account number <b>${esc(k.admNo)}</b>, ${esc(firstName(k.name))}’s admission number.</li><li>Amount <b>${kes(bal)}</b> or any part of it.</li></ol>`
          : bal > 0
            ? ''
            : '<p class="small muted" style="margin-top:.7rem">Thank you. This term’s fees are fully paid.</p>'
      }`,
    `<button class="lnk" data-act="kidGo" data-id="${esc(k.id)}" data-v="fees">Statement${ic('right', 16)}</button>`,
  );
  const hw = all('homework')
    .filter((h) => h.classId === k.classId && h.due >= t)
    .sort((x, y) => x.due.localeCompare(y.due));
  const homework = card(
    'Homework due',
    hw.length
      ? `<ul class="rows">${hw.map((h) => `<li><i class="fi violet">${ic('book', 18)}</i><span class="grow"><b>${esc(h.title)}</b><small>${esc(h.area)}</small></span><small class="due">${fmtDay(h.due)}</small></li>`).join('')}</ul>`
      : '<p class="muted small">Nothing is due.</p>',
    `<button class="lnk" data-act="kidGo" data-id="${esc(k.id)}" data-v="homework">All homework${ic('right', 16)}</button>`,
  );
  // Phones: the office's coloured tiles in place of the banner, for the child chosen below.
  const ap = a.total ? pctOf(a.present, a.total) : null;
  const tiles = `<div class="tiles m-only">
    ${tile('blue', 'check', 'attendance', `${esc(firstName(k.name))}’s attendance`, ap === null ? '—' : ap + '%', ap === null ? 'No register marked yet' : `${a.present} of ${a.total} school days`)}
    ${tile('green', 'report', 'reports', 'Overall this term', r.overall ? esc(r.overall.c || r.overall.n) : '—', r.overall ? esc(r.overall.n) : 'No results yet')}
    ${tile('yellow', 'wallet', 'fees', bal > 0 ? 'Fee balance' : 'Fees', bal > 0 ? 'KES ' + compact(bal) : 'Cleared', bal > 0 ? `${pctOf(pd, bill)}% of ${kes(bill)} paid` : 'Fully paid this term', meter(pctOf(pd, bill), '', pctOf(pd, bill) + '% of fees paid'))}
    ${tile('red', 'book', 'homework', 'Homework due', hw.length, hw.length ? 'Next due ' + fmtDay(hw[0].due) : 'Nothing due')}
  </div>`;
  const teacherNote = tch
    ? `<p class="small muted" style="margin:-.4rem 0 1rem">${esc(cls.name || '')} class teacher: <b>${esc(tch.name)}</b>, ${esc(phone(tch.phone))}</p>`
    : '';

  return `<div class="dash">
    <div class="dash-main">${banner}${tiles}${card(ks.length > 1 ? 'Your children' : 'Your child', kidCards)}${teacherNote}<div class="two">${att}${res}</div><div class="two">${fees}${homework}</div></div>
    <aside class="dash-side">
      ${card('Calendar', miniCal(), viewAll('calendar'), 'cal-card')}
      ${card(
        'Notices from school',
        feed(
          visibleNotices()
            .slice(0, 4)
            .map((n) => ({ icon: 'megaphone', tone: 'orange', title: n.title, text: n.by || 'School office', date: n.date })),
        ),
        viewAll('notices'),
      )}
      ${c.nextOpens ? `<p class="small muted side-note">Next term opens ${fmtDate(c.nextOpens, { weekday: 'long', day: 'numeric', month: 'long' })}.</p>` : ''}
      ${card(
        'Quick links',
        quick([
          ['report', 'blue', 'Progress report', 'go', 'reports'],
          ['wallet', 'green', 'Fees', 'go', 'fees'],
          ['book', 'violet', 'Homework', 'go', 'homework'],
          ['check', 'orange', 'Attendance', 'go', 'attendance'],
          ['clock', 'blue', 'Timetable', 'go', 'timetable'],
          ['chat', 'red', 'Messages', 'go', 'messages'],
        ]),
      )}
    </aside></div>`;
}

Object.assign(A, {
  kidGo: (d) => {
    ui.kid = d.id;
    go(d.v);
  },
  kidPick: (d) => {
    ui.kid = d.id;
    paint();
  },
  calMove: (d) => {
    ui.calOff = (ui.calOff || 0) + +d.d;
    paint();
  },
});
