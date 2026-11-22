// Library catalogue and loans.

import { A, V } from '../core/registry.js';
import { activeLearners, className } from '../core/school.js';
import { ui } from '../core/state.js';
import { all, get, save } from '../core/store.js';
import { closeModal, empty, openForm, openModal, table, toast } from '../core/ui.js';
import { $, clone, esc, fmtDate, newId, today } from '../core/util.js';
import { canEdit, matchQ, search } from '../core/widgets.js';

V.library = () => {
  const rows = all('books')
    .filter((b) => matchQ(b, ['title', 'author', 'category']))
    .sort((a, b) => a.title.localeCompare(b.title));
  const tools = `<div class="tools">${search('Search books')}<span class="grow"></span>${canEdit() ? '<button class="btn primary" data-act="bookForm">Add a book</button>' : ''}</div>`;
  if (!rows.length)
    return (
      tools +
      empty(
        ui.q ? 'No book matches' : 'The library catalogue is empty',
        'Add book titles and track who has borrowed each copy.',
      )
    );
  return (
    tools +
    table(
      ['Title', 'Author', 'Category', 'Shelf', ['Copies', 'num'], ['On loan', 'num'], ''],
      rows.map((b) => {
        const n = (b.loans || []).length;
        return `<tr class="mobile-list-row" data-act="bookForm" data-id="${esc(b.id)}" tabindex="0" aria-label="Open library record for ${esc(b.title)}"><td class="mobile-list-primary"><b>${esc(b.title)}</b></td><td>${esc(b.author)}</td><td>${esc(b.category)}</td><td>${esc(b.shelf)}</td><td class="num">${esc(b.copies)}</td><td class="num">${n}</td><td class="act">${canEdit() && n < +b.copies ? `<button class="btn sm" data-act="loanForm" data-id="${esc(b.id)}">Lend</button> ` : ''}${n ? `<button class="btn sm" data-act="loans" data-id="${esc(b.id)}">Returns</button> ` : ''}${canEdit() ? `<button class="btn sm" data-act="bookForm" data-id="${esc(b.id)}">Edit</button>` : ''}</td></tr>`;
      }),
    )
  );
};

function bookForm(b) {
  openForm({
    title: b ? 'Edit book' : 'Add a book',
    values: b || { copies: 1 },
    fields: [
      { k: 'title', l: 'Title', req: true, full: true },
      { k: 'author', l: 'Author' },
      { k: 'category', l: 'Category', ph: 'English fiction' },
      { k: 'copies', l: 'Copies', t: 'number', req: true },
      { k: 'shelf', l: 'Shelf' },
    ],
    onSave: async (v) => {
      if (!(await save('books', { loans: [], ...(b || {}), ...v, id: b ? b.id : newId('b') }))) return false;
      toast('Book saved', 'success');
    },
  });
  if (b)
    $('#modal .actions').insertAdjacentHTML(
      'afterbegin',
      `<button class="btn danger" data-act="del" data-c="books" data-id="${esc(b.id)}" data-n="${esc(b.title)}" style="margin-right:auto">Delete</button>`,
    );
}

function loansModal(id) {
  const b = get('books', id);
  if (!b) return;
  openModal(
    `<h2>${esc(b.title)}</h2>${
      (b.loans || []).length
        ? `<ul class="list">${b.loans
            .map((x, i) => {
              const l = get('learners', x.learnerId) || {};
              return `<li><span><b>${esc(l.name || 'Removed learner')}</b><br><span class="small muted">${esc(className(l.classId))}, borrowed ${fmtDate(x.date)}</span></span>${canEdit() ? `<button class="btn sm" data-act="returnBook" data-id="${esc(b.id)}" data-i="${i}">Mark returned</button>` : ''}</li>`;
            })
            .join('')}</ul>`
        : '<p class="muted">No copies are on loan.</p>'
    }<div class="actions"><button class="btn primary" data-act="closeModal">Done</button></div>`,
  );
}

Object.assign(A, {
  bookForm: (d) => bookForm(d.id ? get('books', d.id) : null),
  loans: (d) => loansModal(d.id),
  loanForm: (d) => {
    const b = get('books', d.id),
      ls = activeLearners().sort((a, x) => a.name.localeCompare(x.name));
    if (!ls.length) return toast('Admit learners before lending books.', 'warn');
    openForm({
      title: 'Lend \u201c' + b.title + '\u201d',
      submit: 'Lend book',
      values: { learnerId: ls[0].id, date: today() },
      fields: [
        {
          k: 'learnerId',
          l: 'Borrower',
          t: 'select',
          full: true,
          req: true,
          o: ls.map((l) => [l.id, `${l.name} (${className(l.classId)})`]),
        },
        { k: 'date', l: 'Date borrowed', t: 'date', req: true },
      ],
      onSave: async (v) => {
        const nb = clone(get('books', b.id));
        nb.loans = [...(nb.loans || []), v];
        if (!(await save('books', nb))) return false;
        toast('Book lent', 'success');
      },
    });
  },
  returnBook: async (d) => {
    const nb = clone(get('books', d.id));
    nb.loans.splice(+d.i, 1);
    if (!(await save('books', nb))) return false;
    toast('Book returned', 'success');
    nb.loans.length ? loansModal(nb.id) : closeModal();
  },
});
