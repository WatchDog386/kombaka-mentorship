// School expenses.

import { A, V } from '../core/registry.js';
import { activeLearners, cfg, paid, termLabel } from '../core/school.js';
import { ui } from '../core/state.js';
import { all, get, save } from '../core/store.js';
import { empty, openForm, table, toast } from '../core/ui.js';
import { esc, fmtDate, kes, newId, sum, today } from '../core/util.js';
import { canEdit, matchQ, search } from '../core/widgets.js';

const EXP_CATS = [
  'Salaries',
  'Food and kitchen',
  'Learning materials',
  'Utilities',
  'Transport',
  'Repairs',
  'Rent',
  'Statutory payments',
  'Other',
];

V.expenses = () => {
  const c = cfg();
  const rows = all('expenses')
    .filter((e) => matchQ(e, ['payee', 'category', 'note']))
    .sort((a, b) => String(b.date).localeCompare(a.date));
  const termRows = rows.filter((e) => +e.year === +c.year && +e.term === +c.term),
    got = sum(activeLearners().map(paid)),
    out = sum(termRows.map((e) => e.amount));
  const tools = `<div class="tools">${search('Search expenses')}<span class="grow"></span>${canEdit() ? '<button class="btn primary" data-act="expForm">Record an expense</button>' : ''}</div>`;
  const head = `<div class="strip three"><div><b>${kes(got)}</b><span>Fees collected, ${esc(termLabel())}</span></div><div><b>${kes(out)}</b><span>Spent this term</span></div><div><b>${kes(got - out)}</b><span>Net position</span></div></div>`;
  if (!rows.length)
    return (
      head +
      tools +
      empty(
        ui.q ? 'No expense matches' : 'No expenses recorded',
        'Record what the school spends to see the term\u2019s net position.',
      )
    );
  return (
    head +
    tools +
    table(
      ['Date', 'Category', 'Paid to', 'Note', 'Method', ['Amount', 'num'], ''],
      rows.map(
        (e) =>
          `<tr><td style="white-space:nowrap">${fmtDate(e.date)}</td><td>${esc(e.category)}</td><td><b>${esc(e.payee)}</b></td><td class="small">${esc(e.note)}</td><td>${esc(e.method)}</td><td class="num">${kes(e.amount)}</td><td class="act">${canEdit() ? `<button class="btn sm" data-act="expForm" data-id="${esc(e.id)}">Edit</button> <button class="btn sm danger" data-act="del" data-c="expenses" data-id="${esc(e.id)}" data-n="this expense">Delete</button>` : ''}</td></tr>`,
      ),
    )
  );
};

function expForm(e) {
  const c = cfg();
  openForm({
    title: e ? 'Edit expense' : 'Record an expense',
    values: e || { date: today(), category: EXP_CATS[1], method: 'M-Pesa' },
    fields: [
      { k: 'payee', l: 'Paid to', req: true },
      { k: 'amount', l: 'Amount (KES)', t: 'number', req: true },
      { k: 'category', l: 'Category', t: 'select', o: EXP_CATS },
      { k: 'date', l: 'Date', t: 'date', req: true },
      { k: 'method', l: 'Method', t: 'select', o: ['M-Pesa', 'Bank transfer', 'Cheque', 'Cash'] },
      { k: 'ref', l: 'Reference' },
      { k: 'note', l: 'What it was for', full: true },
    ],
    onSave: async (v) => {
      if (!(await save('expenses', { term: c.term, year: c.year, ...(e || {}), ...v, id: e ? e.id : newId('x') })))
        return false;
      toast('Expense saved', 'success');
    },
  });
}

Object.assign(A, {
  expForm: (d) => expForm(d.id ? get('expenses', d.id) : null),
});
