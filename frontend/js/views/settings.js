// School profile, academic year, grading, learning areas and closing a term.

import { A, V } from '../core/registry.js';
import { dropKeep, paint } from '../core/render.js';
import { LEVELS, GRADES, activeLearners, balance, cfg, classesSorted, gradeBands, pointsRange, termLabel } from '../core/school.js';
import { ui } from '../core/state.js';
import { save, saveConfig } from '../core/store.js';
import { closeModal, openModal, toast } from '../core/ui.js';
import { $, clone, esc } from '../core/util.js';
import { canEdit, lvlChip } from '../core/widgets.js';

V.settings = () => {
  const c = cfg(),
    ro = canEdit() ? '' : 'disabled';
  const inp = (id, label, val, type = 'text', cls = '') =>
    `<label class="f ${cls}"><span>${label}</span><input id="${id}" data-keep type="${type}" value="${esc(val)}" ${ro}></label>`;
  return `
  <section class="panel"><h2>School profile</h2><div class="grid2">
    ${inp('s_name', 'School name', c.name)}${inp('s_motto', 'Motto', c.motto)}<label class="f full"><span>About the school, shown on the home page</span><textarea id="s_about" data-keep ${ro}>${esc(c.about || '')}</textarea></label>${inp('s_address', 'Postal address', c.address)}${inp('s_county', 'County', c.county)}
    ${inp('s_phone', 'Office phone', c.phone, 'tel')}${inp('s_email', 'Office email', c.email, 'email')}${inp('s_paybill', 'M-Pesa Pay Bill number', c.paybill)}</div></section>
  <section class="panel"><h2>Academic year</h2><div class="grid2">
    ${inp('s_year', 'Year', c.year, 'number')}<label class="f"><span>Current term</span><select id="s_term" data-keep ${ro}>${[1, 2, 3].map((n) => `<option value="${n}" ${+c.term === n ? 'selected' : ''}>Term ${n}</option>`).join('')}</select></label>
    ${[1, 2, 3].map((n) => inp(`s_t${n}s`, `Term ${n} opens`, c.terms[n].s, 'date') + inp(`s_t${n}e`, `Term ${n} closes`, c.terms[n].e, 'date')).join('')}
    ${inp('s_next', 'Next term opens, shown on report cards', c.nextOpens, 'date', 'full')}</div></section>
  <section class="panel"><h2>Grading</h2><p class="hint" style="margin-bottom:.8rem">The lowest mark for each grade, out of 100. Every band runs up to one mark below the grade above it, so moving a number moves every range below it. Pre-primary is rated on the four-level rubric without marks. Leave a box empty to fall back to the standard scale.</p><div class="grid2" style="grid-template-columns:repeat(4,1fr)">
    ${gradeBands()
      .map((b) => inp('s_b_' + b.c.toLowerCase(), `${b.c} from`, c.bands[b.c.toLowerCase()] ?? '', 'number'))
      .join('')}</div>
    <div class="tw" style="margin-top:1rem"><table class="t"><thead><tr><th class="num">Marks</th><th>Grade</th><th class="num">Points (600)</th><th>What it means</th></tr></thead><tbody>${gradeBands()
      .slice()
      .reverse()
      .map((b) => `<tr><td class="num"><b>${b.range}</b></td><td>${lvlChip(b)}</td><td class="num">${pointsRange(b, 6)}</td><td class="small muted">${esc(b.n)}</td></tr>`)
      .join('')}</tbody></table></div></section>
  <section class="panel"><h2>Learning areas</h2><p class="hint" style="margin-bottom:.8rem">One learning area per line. These drive assessment, report cards, homework and timetables.</p><div class="grid2">
    ${Object.entries(LEVELS)
      .map(
        ([k, n]) =>
          `<label class="f"><span>${n}</span><textarea id="s_ar_${k}" data-keep style="min-height:190px" ${ro}>${esc(c.areas[k].join('\n'))}</textarea></label>`,
      )
      .join('')}</div></section>
  ${
    canEdit()
      ? `<div class="tools"><button class="btn primary" data-act="saveSettings">Save settings</button></div>
  <section class="panel"><h2>Close the term</h2><p>Closing ${esc(termLabel())} carries every learner\u2019s fee balance into the next term and opens a clean register and assessment sheet. After Term 3 you can also move learners up one class.</p><button class="btn" style="margin-top:.8rem" data-act="closeTerm">Close ${esc(termLabel())}</button></section>`
      : ''
  }
  <p class="small muted">Records are saved on the school server, so the office, teachers and parents all see the same data.</p>`;
};

Object.assign(A, {
  saveSettings: async () => {
    const v = (id) => $('#' + id).value.trim(),
      areas = {};
    Object.keys(LEVELS).forEach(
      (k) =>
        (areas[k] = v('s_ar_' + k)
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)),
    );
    if (!v('s_name')) return toast('Enter the school name.', 'warn');
    if (
      !(await saveConfig({
        name: v('s_name'),
        motto: v('s_motto'),
        about: v('s_about'),
        address: v('s_address'),
        county: v('s_county'),
        phone: v('s_phone'),
        email: v('s_email'),
        paybill: v('s_paybill'),
        year: +v('s_year') || cfg().year,
        term: +v('s_term'),
        nextOpens: v('s_next'),
        terms: {
          1: { s: v('s_t1s'), e: v('s_t1e') },
          2: { s: v('s_t2s'), e: v('s_t2e') },
          3: { s: v('s_t3s'), e: v('s_t3e') },
        },
        // A blank box keeps the standard threshold, so a school can change one band and leave
        // the rest on the default scale.
        bands: Object.fromEntries(GRADES.map((g) => {
          const n = +v('s_b_' + g.c.toLowerCase());
          return [g.c.toLowerCase(), n >= 1 && n <= 100 ? n : g.min];
        })),
        areas,
      }))
    )
      return false;
    toast('Settings saved', 'success');
  },
  closeTerm: () => {
    const c = cfg(),
      last = +c.term === 3;
    openModal(
      `<h2>Close ${esc(termLabel())}?</h2><p>Fee balances carry into ${last ? 'Term 1, ' + (+c.year + 1) : 'Term ' + (+c.term + 1) + ', ' + c.year}. This term\u2019s registers, results and payments stay on record.</p>${last ? `<label class="chk" style="padding-top:.9rem"><input type="checkbox" id="promo" checked> Move learners up one class. Learners in the top class are marked Completed.</label>` : ''}<div class="actions"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="ctYes">Close the term</button></div>`,
    );
    $('#ctYes').addEventListener('click', async () => {
      const promote = last && $('#promo').checked;
      closeModal();
      toast('Closing the term\u2026', 'info');
      const cls = classesSorted();
      for (const l of activeLearners()) {
        const n = { ...clone(l), bf: balance(l) };
        if (promote) {
          const i = cls.findIndex((x) => x.id === l.classId),
            cur = cls[i],
            nx = cur && cls.find((x) => (x.order || 0) > (cur.order || 0));
          if (nx) n.classId = nx.id;
          else n.status = 'Completed';
        }
        if (n.bf !== (+l.bf || 0) || n.classId !== l.classId || n.status !== l.status) await save('learners', n);
      }
      await saveConfig(last ? { term: 1, year: +c.year + 1 } : { term: +c.term + 1 });
      ui.att = null;
      ui.marks = null;
      dropKeep();
      toast('Now in ' + termLabel(), 'success');
      paint();
    });
  },
});
