// School rules: curriculum levels, grading scales, fee and attendance calculations.

import { all, get } from './store.js';
import { slug, sum } from './util.js';

export const LEVELS = { pp: 'Pre-primary', lower: 'Lower primary', upper: 'Upper primary', junior: 'Junior school' };

const DEF = {
  name: 'Your school',
  motto: '',
  about: '',
  address: '',
  county: '',
  phone: '',
  email: '',
  paybill: '',
  year: new Date().getFullYear(),
  term: 1,
  nextOpens: '',
  terms: { 1: { s: '', e: '' }, 2: { s: '', e: '' }, 3: { s: '', e: '' } },
  bands: { ee1: 95, ee2: 90, me1: 75, me2: 60, ae1: 50, ae2: 45, be1: 40, be2: 1 },
  areas: {
    pp: [
      'Language Activities',
      'Mathematical Activities',
      'Environmental Activities',
      'Creative Activities',
      'Religious Activities',
    ],
    lower: [
      'English Activities',
      'Kiswahili Activities',
      'Indigenous Language Activities',
      'Mathematical Activities',
      'Environmental Activities',
      'Religious Education Activities',
      'Creative Activities',
    ],
    upper: [
      'English',
      'Kiswahili',
      'Mathematics',
      'Science and Technology',
      'Agriculture and Nutrition',
      'Social Studies',
      'Religious Education',
      'Creative Arts',
    ],
    junior: [
      'English',
      'Kiswahili',
      'Mathematics',
      'Integrated Science',
      'Social Studies',
      'Pre-Technical Studies',
      'Agriculture and Nutrition',
      'Religious Education',
      'Creative Arts and Sports',
    ],
  },
  fees: {
    pp: { tuition: 0, lunch: 0, activity: 0 },
    lower: { tuition: 0, lunch: 0, activity: 0 },
    upper: { tuition: 0, lunch: 0, activity: 0 },
    junior: { tuition: 0, lunch: 0, activity: 0 },
  },
};

export function cfg() {
  const s = get('config', 'school') || {};
  const fees = {},
    terms = {};
  Object.keys(LEVELS).forEach((k) => (fees[k] = { ...DEF.fees[k], ...((s.fees || {})[k] || {}) }));
  [1, 2, 3].forEach((n) => (terms[n] = { ...DEF.terms[n], ...((s.terms || {})[n] || {}) }));
  return {
    ...DEF,
    ...s,
    bands: { ...DEF.bands, ...(s.bands || {}) },
    areas: { ...DEF.areas, ...(s.areas || {}) },
    fees,
    terms,
  };
}

// The rubric pre-primary is rated on, without marks.
export const R4 = [
  { c: 'EE', n: 'Exceeding expectation', p: 4 },
  { c: 'ME', n: 'Meeting expectation', p: 3 },
  { c: 'AE', n: 'Approaching expectation', p: 2 },
  { c: 'BE', n: 'Below expectation', p: 1 },
];

// The eight graded bands, keyed by the threshold each one starts at. `p` orders them for the
// pre-primary rubric roll-up, and `tone` is the first letter pair, which is what .lvl.* styles.
export const GRADES = [
  { c: 'EE1', n: 'Exceeding expectation', p: 8, min: 95, tone: 'ee' },
  { c: 'EE2', n: 'Exceeding expectation', p: 7, min: 90, tone: 'ee' },
  { c: 'ME1', n: 'Meeting expectation', p: 6, min: 75, tone: 'me' },
  { c: 'ME2', n: 'Meeting expectation', p: 5, min: 60, tone: 'me' },
  { c: 'AE1', n: 'Approaching expectation', p: 4, min: 50, tone: 'ae' },
  { c: 'AE2', n: 'Approaching expectation', p: 3, min: 45, tone: 'ae' },
  { c: 'BE1', n: 'Below expectation', p: 2, min: 40, tone: 'be' },
  { c: 'BE2', n: 'Below expectation', p: 1, min: 1, tone: 'be' },
];

// The bands in force for this school: the thresholds from Settings where set, otherwise the
// standard table above. `max` is one mark below the band above, so moving a threshold in Settings
// moves every range below it too.
export function gradeBands() {
  const k = cfg().bands;
  return GRADES.map((g, i) => {
    const min = Math.max(1, Math.min(100, +k[g.c.toLowerCase()] || g.min));
    const max = i === 0 ? 100 : Math.max(min, Math.min(100, +k[GRADES[i - 1].c.toLowerCase()] || GRADES[i - 1].min) - 1);
    return { ...g, min, max, range: min + '\u2013' + max };
  });
}

// The same band expressed in total points for a learner sitting `n` areas, which is the second
// column on the school's grading chart: the low mark times the number of areas, up to one point
// below where the band above starts. Six areas gives the 600-point scale the chart is written on.
export const pointsRange = (band, n) =>
  n > 1 ? (band.min * n) + '\u2013' + (Math.max(band.min, band.max) * n + n - 1) : '';

export function bandAt(n) {
  const bs = gradeBands();
  return bs.find((b) => n >= b.min) || bs[bs.length - 1];
}

// A mark out of 100 to its band. Pre-primary keeps the four-level rubric, since it is rated
// without marks; every other level uses the eight graded bands.
export function rate(level, v) {
  if (v === null || v === undefined || v === '') return null;
  if (level === 'pp' || (typeof v === 'string' && isNaN(+v))) {
    const r = R4.find((x) => x.c === v);
    return r ? { ...r, tone: r.c.toLowerCase() } : null;
  }
  return { ...bandAt(+v), score: +v };
}

// The totals row: marks across every area a learner sat, the average, the band it lands in, and
// that band as total points so the two columns on the grading chart agree.
export function overallOf(level, marks) {
  const done = marks.filter((m) => m !== null && m !== undefined && m !== '');
  if (!done.length) return null;
  const n = done.length,
    mean = Math.round(done.reduce((a, b) => a + (+b || 0), 0) / n),
    r = rate(level, mean);
  return { ...r, mean, areas: n, points: mean * n, outOf: n * 100, pointsRange: pointsRange(r, n) };
}

export const classesSorted = () =>
  all('classes').sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(b.name));

export const className = (id) => (get('classes', id) || {}).name || 'No class';

export const staffName = (id) => (get('staff', id) || {}).name || '';

export const isTeaching = (s) => /teacher/i.test(s.role || '');

export const teachers = () =>
  all('staff')
    .filter((s) => isTeaching(s) && s.status !== 'Left')
    .sort((a, b) => a.name.localeCompare(b.name));

export const activeLearners = () => all('learners').filter((l) => (l.status || 'Active') === 'Active');

export const learnersIn = (cid) =>
  activeLearners()
    .filter((l) => l.classId === cid)
    .sort((a, b) => a.name.localeCompare(b.name));

export const areasFor = (cls) => (cls ? cfg().areas[cls.level] || [] : []);

export const termId = (cid) => {
  const c = cfg();
  return `${cid}_${c.year}_T${c.term}`;
};

export const termLabel = () => {
  const c = cfg();
  return `Term ${c.term}, ${c.year}`;
};

export function feeItems(l) {
  const cls = get('classes', l.classId),
    f = cfg().fees[(cls || {}).level] || {};
  const items = [];
  if (+l.bf) items.push(['Balance brought forward', +l.bf]);
  if (+f.tuition) items.push(['Tuition', +f.tuition]);
  if (+f.lunch && l.lunch !== false) items.push(['Lunch', +f.lunch]);
  if (+f.activity) items.push(['Activities and assessment', +f.activity]);
  const r = l.routeId && get('routes', l.routeId);
  if (r && +r.fee) items.push(['Transport, ' + r.name, +r.fee]);
  return items;
}

export const billed = (l) => sum(feeItems(l).map((i) => i[1]));

export const paymentsOf = (l) => {
  const c = cfg();
  return all('payments')
    .filter((p) => p.learnerId === l.id && +p.year === +c.year && +p.term === +c.term)
    .sort((a, b) => String(a.date).localeCompare(b.date));
};

export const paid = (l) => sum(paymentsOf(l).map((p) => p.amount));

export const balance = (l) => billed(l) - paid(l);

export function attStats(l) {
  const doc = get('attendance', termId(l.classId));
  const days = (doc && doc.days) || {};
  const out = { P: 0, L: 0, A: 0, total: 0, misses: [] };
  Object.keys(days)
    .sort()
    .forEach((d) => {
      const s = days[d] && days[d][l.id];
      if (!s) return;
      out[s]++;
      out.total++;
      if (s !== 'P') out.misses.push([d, s]);
    });
  out.present = out.P + out.L;
  return out;
}

export function dayMarks(cid, date) {
  const doc = get('attendance', termId(cid));
  const d = doc && doc.days && doc.days[date];
  return d && Object.keys(d).length ? d : null;
}

export function results(l) {
  const cls = get('classes', l.classId) || {},
    doc = get('assessments', termId(l.classId)),
    sc = (doc && doc.scores) || {};
  const rows = areasFor(cls).map((a) => {
    const v = (sc[slug(a)] || {})[l.id];
    return { area: a, v, r: rate(cls.level, v) };
  });
  const done = rows.filter((x) => x.r);
  let mean = null,
    overall = null;
  if (done.length) {
    if (cls.level === 'pp') {
      const p = Math.round(sum(done.map((x) => x.r.p)) / done.length);
      const r = R4.find((x) => x.p === p);
      overall = { ...r, tone: r.c.toLowerCase() };
    } else {
      // The total is the sum of the marks sat, and the band comes off the average, so the points
      // and the grade on the report card always match the grading chart.
      overall = overallOf(cls.level, done.map((x) => +x.v));
      mean = overall.mean;
      overall = { ...overall, bands: gradeBands() };
    }
  }
  return { rows, done: done.length, total: rows.length, mean, overall, level: cls.level };
}
