// Report cards. The school office starts from every class at once (rpOverview): how many reports
// have the class teacher's and head teacher's remarks, and the class mean. From there it opens a
// class to write head teacher's remarks, or prints the whole class's report cards in one go.
// A teacher works on their class list; a parent reads their child's card.

import { bell } from '../core/icons.js';
import { A, V } from '../core/registry.js';
import { dropKeep, paint } from '../core/render.js';
import { LEVELS, attStats, cfg, className, classesSorted, learnersIn, pointsRange, results, staffName, termLabel } from '../core/school.js';
import { isAdmin, isParent, isStaff, kid, pickClass, ui } from '../core/state.js';
import { get, save } from '../core/store.js';
import { closeModal, dlBtn, empty, printDoc, saveFile, table, toast } from '../core/ui.js';
import { $, esc, fmtDate } from '../core/util.js';
import { canEdit, classSelect, docShell, kidPicker, lvlChip, noKid, schoolHead } from '../core/widgets.js';

const remarksOf = (l) => {
  const c = cfg();
  return get('remarks', `${l.id}_${c.year}_T${c.term}`) || {};
};
// The remarks columns carry no headings once the table collapses on a phone, so each tick
// carries who wrote it. `tag` is the short form that shows there; the title is always there.
const tick = (ok, tag, who) =>
  `<span class="chip ${ok ? 'ok' : 'warn'}" title="${esc(who)}’s remarks ${ok ? 'written' : 'not written yet'}"><span class="tp-tag">${esc(tag)} </span>${ok ? 'Written' : 'Not yet'}</span>`;

function rpOverview() {
  const cls = classesSorted().map((c) => {
    const L = learnersIn(c.id),
      rm = L.map(remarksOf),
      rs = L.map(results);
    const t = rm.filter((r) => (r.teacher || '').trim()).length,
      h = rm.filter((r) => (r.head || '').trim()).length,
      ready = L.filter((l, i) => rs[i].done === rs[i].total && rs[i].total && (rm[i].teacher || '').trim()).length,
      means = rs.filter((r) => r.mean !== null);
    return { c, L, t, h, ready, mean: means.length ? Math.round(means.reduce((n, r) => n + r.mean, 0) / means.length) : null };
  });
  const n = cls.reduce((x, k) => x + k.L.length, 0),
    sum = (f) => cls.reduce((x, k) => x + k[f], 0);
  return `<p class="small muted" style="margin-bottom:.8rem">${esc(termLabel())}. A report is ready once every learning area is assessed and the class teacher has written remarks.</p>
    <div class="strip"><div><b>${sum('ready')} of ${n}</b><span>Report cards ready</span></div><div><b>${sum('t')}</b><span>Class teacher remarks written</span></div><div><b>${sum('h')}</b><span>Head teacher remarks written</span></div><div><b>${n - sum('h')}</b><span>Waiting for head teacher remarks</span></div></div>
    <h2 class="sec-h">Report cards by class</h2>
    <div class="mobile-flat-list">${table(
      ['Level', 'Class and teacher', ['Ready', 'num'], ['Teacher remarks', 'num'], ['Head teacher remarks', 'num'], ['Class mean', 'num'], ''],
      cls.map(
        (k) =>
          `<tr class="mobile-list-row" data-act="drill" data-v="${esc(k.c.id)}" tabindex="0" aria-label="Open report cards for ${esc(k.c.name)}"><td>${esc(LEVELS[k.c.level] || '')}</td><td class="mobile-list-primary"><b>${esc(k.c.name)}</b><br><span class="small muted">${esc(staffName(k.c.teacherId)) || 'No class teacher'}, ${k.L.length} learners</span></td>
          <td class="num">${k.ready} of ${k.L.length}</td><td class="num">${k.t} of ${k.L.length}</td><td class="num">${k.h < k.L.length ? `<b>${k.h}</b>` : k.h} of ${k.L.length}</td><td class="num">${k.mean !== null ? k.mean + '%' : ''}</td>
          <td class="act"><button class="btn sm primary" data-act="drill" data-v="${esc(k.c.id)}">Open class</button>${k.L.length ? `<button class="btn sm" data-act="printClass" data-id="${esc(k.c.id)}">Print all</button>` : ''}</td></tr>`,
      ),
    )}</div>`;
}

V.reports = () => {
  if (isParent()) {
    const k = kid();
    return k ? kidPicker() + reportCard(k) : noKid();
  }
  if (ui.reportId && get('learners', ui.reportId))
    return (
      `<div class="tools"><button class="btn" data-act="closeReport">Back to the class list</button>${isAdmin() ? '<button class="btn" data-act="drill" data-v="">All classes</button>' : ''}</div>` +
      reportCard(get('learners', ui.reportId))
    );
  if (isAdmin() && !ui.drill) return rpOverview();
  const cid = pickClass();
  if (!cid) return empty('No classes yet', 'The school office adds classes and learners first.');
  const L = learnersIn(cid);
  const rows = L.map((l) => [l, results(l)]).sort(
    (a, b) => (b[1].mean ?? -1) - (a[1].mean ?? -1) || a[0].name.localeCompare(b[0].name),
  );
  const tools = `<div class="tools">${isAdmin() ? '<button class="btn" data-act="drill" data-v="">All classes</button>' : ''}${classSelect('rpClass', 'classId', cid)}<span class="small muted">${esc(termLabel())}</span><span class="grow"></span>${L.length ? `<button class="btn" data-act="printClass" data-id="${esc(cid)}">Print the whole class</button>` : ''}</div>`;
  if (!L.length)
    return tools + empty('No learners in ' + className(cid), 'Admit learners to this class to prepare report cards.');
  return (
    tools +
    `<div class="rp-list">` +
    table(
      ['Adm no.', 'Learner', ['Areas assessed', 'num'], ['Mean', 'num'], 'Overall level', 'Teacher remarks', 'Head teacher remarks', ''],
      rows.map(
        ([l, r]) =>
          `<tr><td>${esc(l.admNo)}</td><td><b>${esc(l.name)}</b></td><td class="num">${r.done} of ${r.total}</td><td class="num">${r.mean !== null ? r.mean + '%' : ''}</td><td>${lvlChip(r.overall)}</td><td>${tick((remarksOf(l).teacher || '').trim(), 'CT', 'Class teacher')}</td><td>${tick((remarksOf(l).head || '').trim(), 'HT', 'Head teacher')}</td><td class="act"><button class="btn sm" data-act="openReport" data-id="${esc(l.id)}">Open report</button></td></tr>`,
      ),
    ) +
    `</div>`
  );
};

function reportCard(l) {
  const c = cfg(),
    cls = get('classes', l.classId) || {},
    r = results(l),
    a = attStats(l),
    rm = get('remarks', `${l.id}_${c.year}_T${c.term}`) || {};
  const pp = cls.level === 'pp',
    edit = isStaff() && canEdit();
  return `<article class="rc">
    <div class="rc-head"><div class="seal">${bell(30)}</div><div><h2>${esc(c.name)}</h2><p>${esc([c.address, c.county].filter(Boolean).join(', '))}${c.motto ? '. ' + esc(c.motto) : ''}</p></div></div>
    <h3 style="margin-bottom:.7rem">Learner progress report, ${esc(termLabel())}</h3>
    <dl class="kv" style="margin-bottom:1rem"><dt>Learner</dt><dd><b>${esc(l.name)}</b></dd><dt>Admission no.</dt><dd>${esc(l.admNo)}</dd><dt>Class</dt><dd>${esc(cls.name || '')} (${LEVELS[cls.level] || ''})</dd><dt>Class teacher</dt><dd>${esc(staffName(cls.teacherId)) || 'Not assigned'}</dd><dt>Attendance</dt><dd>${a.total ? `${a.present} of ${a.total} days present, ${a.A} absent, ${a.L} late` : 'No register marked yet'}</dd></dl>
    <div class="rp-card-list">${table(
      ['Learning area', ...(pp ? [] : [['Marks', 'num']]), 'Level', ...(pp ? [] : [['Points', 'num']]), ['What it means', 'hide-sm']],
      r.rows.map(
        (x) =>
          `<tr><td>${esc(x.area)}</td>${pp ? '' : `<td class="num">${x.r ? x.v : ''}</td>`}<td>${lvlChip(x.r)}${x.r ? `<span class="only-sm small muted">${esc(x.r.n)}</span>` : ''}</td>${pp ? '' : `<td class="num">${x.r ? pointsRange(x.r, r.overall ? r.overall.areas : r.rows.length) : ''}</td>`}<td class="small hide-sm">${x.r ? esc(x.r.n) : '<span class="muted">Not assessed</span>'}</td></tr>`,
      ),
      // The totals row carries the points too, so the card shows the same figures as the grading
      // chart's two columns rather than a mean the office has to convert by hand.
      r.overall
        ? `<tr><td>Overall</td>${pp ? '' : `<td class="num">${r.mean}%</td>`}<td>${lvlChip(r.overall)}</td>${pp ? '' : `<td class="num"><b>${r.overall.points} of ${r.overall.outOf}</b></td>`}<td class="small hide-sm">${esc(r.overall.n)}</td></tr>`
        : '',
    )}</div>
    <div class="stack" style="margin-top:1.1rem">
      ${
        edit
          ? `<label class="f"><span>Class teacher\u2019s remarks</span><textarea id="rmT" data-keep>${esc(rm.teacher || '')}</textarea></label><label class="f"><span>Head teacher\u2019s remarks</span><textarea id="rmH" data-keep ${isAdmin() ? '' : 'readonly'}>${esc(rm.head || '')}</textarea></label>`
          : `<div><h3>Class teacher\u2019s remarks</h3><p>${esc(rm.teacher) || '<span class="muted">Not written yet.</span>'}</p></div><div><h3>Head teacher\u2019s remarks</h3><p>${esc(rm.head) || '<span class="muted">Not written yet.</span>'}</p></div>`
      }
      ${c.nextOpens ? `<p class="small muted">Next term opens on ${fmtDate(c.nextOpens, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.</p>` : ''}
      <div class="tools" style="margin:0">${edit ? `<button class="btn primary" data-act="saveRemarks" data-id="${esc(l.id)}">Save remarks</button>` : ''}${dlBtn('dlReport', 'Save report card', `data-id="${esc(l.id)}"`)}${dlBtn('printReport', 'Print', `data-id="${esc(l.id)}"`)}</div>
    </div></article>`;
}

const reportDoc = (l) => docShell('Report card, ' + l.name, reportBody(l));

function reportBody(l) {
  const c = cfg(),
    cls = get('classes', l.classId) || {},
    r = results(l),
    a = attStats(l),
    rm = get('remarks', `${l.id}_${c.year}_T${c.term}`) || {},
    pp = cls.level === 'pp';
  return (
    `${schoolHead()}<h2>Learner progress report, ${esc(termLabel())}</h2>
    <dl><dt>Learner</dt><dd><b>${esc(l.name)}</b></dd><dt>Admission no.</dt><dd>${esc(l.admNo)}</dd><dt>UPI number</dt><dd>${esc(l.upi || '')}</dd><dt>Class</dt><dd>${esc(cls.name || '')}</dd><dt>Class teacher</dt><dd>${esc(staffName(cls.teacherId))}</dd><dt>Attendance</dt><dd>${a.total ? `${a.present} of ${a.total} days present` : 'Not recorded'}</dd></dl>
    <h2>Assessment</h2><table><tr><th>Learning area</th>${pp ? '' : '<th class="num">Marks</th>'}<th>Level</th>${pp ? '' : '<th class="num">Points</th>'}<th>Meaning</th></tr>${r.rows.map((x) => `<tr><td>${esc(x.area)}</td>${pp ? '' : `<td class="num">${x.r ? x.v : ''}</td>`}<td>${x.r ? x.r.c : ''}</td>${pp ? '' : `<td class="num">${x.r ? pointsRange(x.r, r.overall ? r.overall.areas : r.rows.length) : ''}</td>`}<td>${x.r ? esc(x.r.n) : 'Not assessed'}</td></tr>`).join('')}${r.overall ? `<tr><th>Overall</th>${pp ? '' : `<th class="num">${r.mean}%</th>`}<th>${r.overall.c}</th>${pp ? '' : `<th class="num">${r.overall.points} of ${r.overall.outOf}</th>`}<th>${esc(r.overall.n)}</th></tr>` : ''}</table>
    <h2>Class teacher\u2019s remarks</h2><p>${esc(rm.teacher || '')}</p><h2>Head teacher\u2019s remarks</h2><p>${esc(rm.head || '')}</p>
    ${c.nextOpens ? `<p class="muted">Next term opens on ${fmtDate(c.nextOpens)}.</p>` : ''}<div class="sign"><div>Class teacher</div><div>Head teacher</div><div>Parent or guardian</div></div>`
  );
}

Object.assign(A, {
  openReport: (d) => {
    closeModal();
    ui.view = 'reports';
    ui.reportId = d.id;
    const l = get('learners', d.id);
    if (l) {
      ui.classId = l.classId;
      ui.drill = true;
    }
    ui.q = '';
    dropKeep();
    paint();
    window.scrollTo(0, 0);
  },
  closeReport: () => {
    ui.reportId = '';
    dropKeep();
    paint();
  },
  saveRemarks: async (d) => {
    const c = cfg(),
      id = `${d.id}_${c.year}_T${c.term}`,
      cur = get('remarks', id) || {};
    if (
      !(await save('remarks', {
        ...cur,
        id,
        learnerId: d.id,
        year: c.year,
        term: c.term,
        teacher: $('#rmT').value.trim(),
        head: $('#rmH').value.trim(),
      }))
    )
      return false;
    toast('Remarks saved', 'success');
  },
  printReport: (d) => printDoc(reportDoc(get('learners', d.id))),
  // Every report card in a class in one document, one learner to a page.
  printClass: (d) => {
    const L = learnersIn(d.id);
    if (!L.length) return;
    printDoc(
      docShell(
        'Report cards, ' + className(d.id),
        L.map((l, i) => `<section style="${i < L.length - 1 ? 'page-break-after:always;' : ''}">${reportBody(l)}</section>`).join(''),
      ),
    );
  },
  dlReport: (d) => {
    const l = get('learners', d.id);
    saveFile(`Report card ${l.name} ${termLabel().replace(',', '')}.html`, reportDoc(l));
  },
});
