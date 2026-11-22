// Assessment. Teachers enter results by class and learning area. The school office first sees how
// far every class has got (asOverview): learning areas finished, the class mean and what is left,
// and can open any class to see or correct its results.

import { A, V, onChange, onInput } from '../core/registry.js';
import { paint } from '../core/render.js';
import { LEVELS, R4, areasFor, cfg, classesSorted, gradeBands, learnersIn, pointsRange, rate, results, staffName, termId, termLabel } from '../core/school.js';
import { isAdmin, pickClass, ui } from '../core/state.js';
import { get, mergeDoc } from '../core/store.js';
import { empty, table, toast } from '../core/ui.js';
import { clone, esc, slug } from '../core/util.js';
import { canEdit, classSelect, lvlChip } from '../core/widgets.js';
import { meter } from '../core/charts.js';

function marksDraft(cid, ak) {
  const key = cid + '|' + ak;
  if (!ui.marks || ui.marks.key !== key || !ui.marks.dirty) {
    const doc = get('assessments', termId(cid));
    ui.marks = { key, vals: clone(((doc && doc.scores) || {})[ak] || {}), dirty: false };
  }
  return ui.marks;
}

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

// The grading scale, printed under the entry form so a teacher types marks knowing what each band
// means. The points column comes off the number of areas the class sits, so it matches the total
// on the report card; six areas is the 600-point scale the chart is written on.
const gradeTable = () => {
  const n = areasFor(get('classes', pickClass()) || {}).length || 6;
  return `<details class="gscale"><summary>Grading scale</summary>
    <table><thead><tr><th class="num">Marks</th><th>Grade</th>${n > 1 ? `<th class="num">Points (${n * 100})</th>` : ''}<th>What it means</th></tr></thead><tbody>${gradeBands()
    .slice()
    .reverse()
    .map(
      (b) =>
        `<tr><td class="num"><b>${b.range}</b></td><td>${lvlChip(b)}</td>${n > 1 ? `<td class="num">${pointsRange(b, n)}</td>` : ''}<td class="small muted">${esc(b.n)}</td></tr>`,
    )
    .join('')}</tbody></table></details>`;
};

// One class's progress: which learning areas have a result for every learner, and the class mean.
function classProgress(c) {
  const L = learnersIn(c.id),
    areas = areasFor(c),
    sc = (get('assessments', termId(c.id)) || {}).scores || {};
  const filled = (a) => L.filter((l) => {
    const v = (sc[slug(a)] || {})[l.id];
    return v !== undefined && v !== null && v !== '';
  }).length;
  const done = areas.filter((a) => L.length && filled(a) === L.length),
    left = areas.filter((a) => !done.includes(a)),
    got = areas.reduce((n, a) => n + filled(a), 0),
    rs = L.map(results).filter((r) => r.overall);
  let overall = null,
    mean = null;
  if (rs.length && c.level !== 'pp') {
    mean = Math.round(rs.reduce((n, r) => n + r.mean, 0) / rs.length);
    overall = rate(c.level, mean);
  } else if (rs.length) {
    const tally = {};
    rs.forEach((r) => (tally[r.overall.c] = (tally[r.overall.c] || 0) + 1));
    const top = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
    overall = rs.find((r) => r.overall.c === top).overall;
  }
  return { L, areas, done, left, got, need: areas.length * L.length, mean, overall };
}

function asOverview() {
  const cls = classesSorted().map((c) => [c, classProgress(c)]),
    got = cls.reduce((n, [, p]) => n + p.got, 0),
    need = cls.reduce((n, [, p]) => n + p.need, 0),
    full = cls.filter(([, p]) => p.L.length && !p.left.length).length,
    means = cls.filter(([, p]) => p.mean !== null);
  return `<p class="small muted" style="margin-bottom:.8rem">${esc(termLabel())}. Class teachers enter results; open a class to see or correct them.</p>
    <div class="strip"><div><b>${pct(got, need)}%</b><span>Results recorded</span></div><div><b>${full} of ${cls.length}</b><span>Classes fully assessed</span></div><div><b>${got.toLocaleString('en-KE')}</b><span>Results entered, of ${need.toLocaleString('en-KE')}</span></div><div><b>${means.length ? Math.round(means.reduce((n, [, p]) => n + p.mean, 0) / means.length) + '%' : '—'}</b><span>School mean, Grade 1 up</span></div></div>
    <h2 class="sec-h">Assessment by class</h2>
    <div class="mobile-flat-list">${table(
      ['Level', 'Class and teacher', ['Learning areas done', 'num'], 'Results recorded', ['Class mean', 'num'], 'Class level', 'Still to assess', ''],
      cls.map(
        ([c, p]) =>
          `<tr class="mobile-list-row" data-act="drill" data-v="${esc(c.id)}" tabindex="0" aria-label="Open assessment for ${esc(c.name)}"><td>${esc(LEVELS[c.level] || '')}</td><td class="mobile-list-primary"><b>${esc(c.name)}</b><br><span class="small muted">${esc(staffName(c.teacherId)) || 'No class teacher'}, ${p.L.length} learners</span></td>
          <td class="num">${p.done.length} of ${p.areas.length}</td><td style="min-width:8rem">${meter(pct(p.got, p.need), pct(p.got, p.need) < 50 ? 'warn' : '', pct(p.got, p.need) + '% recorded')}<span class="small muted">${pct(p.got, p.need)}%</span></td>
          <td class="num">${p.mean !== null ? p.mean + '%' : ''}</td><td>${p.overall ? lvlChip(p.overall) : '<span class="muted">Not yet</span>'}</td>
          <td class="small">${p.L.length ? (p.left.length ? esc(p.left.slice(0, 3).join(', ')) + (p.left.length > 3 ? ` and ${p.left.length - 3} more` : '') : '<span class="chip ok">All done</span>') : '<span class="muted">No learners</span>'}</td>
          <td class="act"><button class="btn sm" data-act="drill" data-v="${esc(c.id)}">Open class</button></td></tr>`,
      ),
    )}</div>`;
}

V.assessment = () => {
  if (isAdmin() && !ui.drill) return asOverview();
  const cid = pickClass();
  if (!cid) return empty('No classes yet', 'The school office adds classes and learners first.');
  const cls = get('classes', cid),
    areas = areasFor(cls);
  if (!areas.includes(ui.area)) ui.area = areas[0] || '';
  const L = learnersIn(cid),
    d = marksDraft(cid, slug(ui.area)),
    pp = cls.level === 'pp';
  const tools = `<div class="tools">${isAdmin() ? '<button class="btn" data-act="drill" data-v="">All classes</button>' : ''}${classSelect('asClass', 'classId', cid)}<label class="sr" for="asArea">Learning area</label><select id="asArea" data-ch="area">${areas.map((a) => `<option ${a === ui.area ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select><span class="grow"></span>${canEdit() && L.length ? '<button class="btn primary" data-act="saveMarks">Save results</button>' : ''}</div>`;
  if (!L.length)
    return tools + empty('No learners in ' + cls.name, 'Admit learners to this class to record assessment.');
  const guide = pp
    ? 'Pre-primary learners are rated on the four-level rubric, without marks.'
    : 'Enter marks out of 100. The level beside each mark follows the grading scale, the same one the report card and the class average use.';
  return (
    tools +
    `<p class="small muted" style="margin-bottom:.7rem">${esc(termLabel())}. ${guide}${d.dirty ? ' <b>Changes not saved.</b>' : ''}</p>` +
    (pp ? '' : gradeTable()) +
    `<div class="as-list">` +
    table(
      [['Adm no.', 'hide-sm'], 'Learner', pp ? 'Rubric level' : 'Marks out of 100', 'Level'],
      L.map((l) => {
        const v = d.vals[l.id] ?? '';
        return `<tr><td class="hide-sm">${esc(l.admNo)}</td><td><b>${esc(l.name)}</b></td><td class="as-in">${pp ? `<select id="m_${esc(l.id)}" data-ch="score" data-id="${esc(l.id)}" aria-label="Level for ${esc(l.name)}"><option value="">Not assessed</option>${R4.map((r) => `<option value="${r.c}" ${v === r.c ? 'selected' : ''}>${r.c}, ${r.n}</option>`).join('')}</select>` : `<input id="m_${esc(l.id)}" type="number" min="0" max="100" inputmode="numeric" data-in="score" data-id="${esc(l.id)}" value="${esc(v)}" aria-label="Marks for ${esc(l.name)}">`}</td><td id="lv_${esc(l.id)}">${lvlChip(rate(cls.level, v))}</td></tr>`;
      }),
    ) +
    `</div>`
  );
};

Object.assign(A, {
  saveMarks: async () => {
    const cid = pickClass(),
      cls = get('classes', cid),
      m = ui.marks,
      c = cfg();
    if (!m) return;
    const vals = {};
    for (const l of learnersIn(cid)) {
      const v = m.vals[l.id];
      if (v === '' || v === undefined || v === null) {
        vals[l.id] = null;
        continue;
      }
      if (cls.level !== 'pp' && !(+v >= 0 && +v <= 100))
        return toast('Marks for ' + l.name + ' must be between 0 and 100.', 'warn');
      vals[l.id] = cls.level === 'pp' ? v : +v;
    }
    m.dirty = false;
    if (
      await mergeDoc(
        'assessments',
        termId(cid),
        { classId: cid, year: c.year, term: c.term, scores: {} },
        { scores: { [slug(ui.area)]: vals } },
      )
    )
      toast(ui.area + ' results saved for ' + cls.name, 'success');
  },
});

Object.assign(onInput, {
  score: (el) => {
    const m = ui.marks;
    if (!m) return;
    m.vals[el.dataset.id] = el.value === '' ? '' : +el.value;
    m.dirty = true;
    const cls = get('classes', pickClass());
    const out = document.getElementById('lv_' + el.dataset.id);
    if (out) out.innerHTML = lvlChip(rate(cls.level, m.vals[el.dataset.id]));
  },
});

Object.assign(onChange, {
  area: (el) => {
    ui.area = el.value;
    ui.marks = null;
    paint();
  },
  score: (el) => {
    const m = ui.marks;
    if (!m) return;
    m.vals[el.dataset.id] = el.value;
    m.dirty = true;
    paint();
  },
});
