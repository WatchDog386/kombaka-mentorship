// Fees: balances, payments, receipts, fee structure, and the parent fee statement.

import { A, V } from '../core/registry.js';
import {
  LEVELS,
  activeLearners,
  balance,
  billed,
  cfg,
  className,
  classesSorted,
  feeItems,
  paid,
  paymentsOf,
  termLabel,
} from '../core/school.js';
import { isParent, kid, ui } from '../core/state.js';
import { all, get, removeDoc, save, saveConfig } from '../core/store.js';
import {
  closeModal,
  confirmBox,
  dlBtn,
  empty,
  openForm,
  openModal,
  saveFile,
  table,
  toCsv,
  toast,
} from '../core/ui.js';
import { $, esc, fmtDate, kes, newId, phone, sum, today } from '../core/util.js';
import {
  canEdit,
  classSelect,
  docShell,
  feeChip,
  kidPicker,
  matchQ,
  noKid,
  schoolHead,
  search,
} from '../core/widgets.js';

V.fees = () => {
  if (isParent()) return feesParent();
  const tab = ui.tab.fees || 'balances',
    ls = activeLearners();
  const exp = sum(ls.map(billed)),
    got = sum(ls.map(paid));
  const head = `<div class="strip"><div><b>${kes(exp)}</b><span>Expected, ${esc(termLabel())}</span></div><div><b>${kes(got)}</b><span>Collected</span></div><div><b>${kes(Math.max(0, exp - got))}</b><span>Outstanding</span></div><div><b>${ls.filter((l) => balance(l) <= 0).length} of ${ls.length}</b><span>Learners cleared</span></div></div>
    <div class="tabs" role="tablist">${[
      ['balances', 'Balances'],
      ['payments', 'Payments'],
      ['structure', 'Fee structure'],
    ]
      .map(
        ([k, n]) =>
          `<button role="tab" aria-selected="${tab === k}" data-act="tab" data-g="fees" data-v="${k}">${n}</button>`,
      )
      .join('')}</div>`;
  if (tab === 'structure') {
    const f = cfg().fees;
    return (
      head +
      `<p class="small muted" style="margin-bottom:.7rem">Amounts are per learner, per term, in Kenya shillings. Transport is charged from the learner\u2019s route.</p>` +
      table(
        ['Level', ['Tuition', 'num'], ['Lunch', 'num'], ['Activities and assessment', 'num']],
        Object.entries(LEVELS).map(
          ([k, n]) =>
            `<tr><td><b>${n}</b></td>${['tuition', 'lunch', 'activity'].map((v) => `<td><input id="fee_${k}_${v}" data-keep type="number" min="0" inputmode="numeric" value="${esc(f[k][v])}" aria-label="${n} ${v}" style="text-align:right;min-width:7rem"></td>`).join('')}</tr>`,
        ),
      ) +
      (canEdit()
        ? `<div class="tools" style="margin-top:1rem"><button class="btn primary" data-act="saveFees">Save fee structure</button></div>`
        : '')
    );
  }
  if (tab === 'payments') {
    const c = cfg();
    const rows = all('payments')
      .filter((p) => +p.year === +c.year && +p.term === +c.term)
      .map((p) => ({ ...p, lname: (get('learners', p.learnerId) || {}).name || 'Removed learner' }))
      .filter((p) => matchQ(p, ['lname', 'receiptNo', 'ref', 'method']))
      .sort((a, b) => String(b.date).localeCompare(a.date) || String(b.receiptNo).localeCompare(a.receiptNo));
    const tools = `<div class="tools">${search('Search receipt, learner or M-Pesa code')}<span class="grow"></span>${dlBtn('csvPayments', 'Save as CSV')}${canEdit() ? '<button class="btn primary" data-act="payForm">Record a payment</button>' : ''}</div>`;
    if (!rows.length)
      return head + tools + empty('No payments found', 'Payments recorded this term appear here with their receipts.');
    return (
      head +
      tools +
      table(
        ['Date', 'Receipt', 'Learner', 'Method', 'Reference', ['Amount', 'num'], ''],
        rows.map(
          (p) =>
            `<tr class="mobile-list-row" data-act="dlReceipt" data-id="${esc(p.id)}" tabindex="0" aria-label="Open receipt for ${esc(p.lname)}"><td style="white-space:nowrap">${fmtDate(p.date)}</td><td>${esc(p.receiptNo)}</td><td class="mobile-list-primary"><b>${esc(p.lname)}</b></td><td>${esc(p.method)}</td><td>${esc(p.ref)}</td><td class="num">${kes(p.amount)}</td><td class="act">${dlBtn('dlReceipt', 'Receipt', `data-id="${esc(p.id)}"`).replace('class="btn"', 'class="btn sm"')}${canEdit() ? ` <button class="btn sm danger" data-act="payDel" data-id="${esc(p.id)}">Delete</button>` : ''}</td></tr>`,
        ),
        `<tr><td colspan="5">Total</td><td class="num">${kes(sum(rows.map((p) => p.amount)))}</td><td></td></tr>`,
      )
    );
  }
  const fc = ui.fClass || '';
  const ord = Object.fromEntries(classesSorted().map((c, i) => [c.id, i]));
  const rows = ls
    .filter((l) => (!fc || l.classId === fc) && matchQ(l, ['name', 'admNo', 'guardianPhone']))
    .sort((a, b) => (ord[a.classId] ?? 99) - (ord[b.classId] ?? 99) || a.name.localeCompare(b.name));
  const tools = `<div class="tools">${search('Search learner or admission no.')}${classSelect('fClass', 'fClass', fc, true)}<span class="grow"></span>${dlBtn('csvBalances', 'Save as CSV')}${canEdit() ? '<button class="btn primary" data-act="payForm">Record a payment</button>' : ''}</div>`;
  if (!rows.length)
    return (
      head +
      tools +
      (ls.length
        ? empty('No learner matches', 'Try a different name, number or class.')
        : empty('No learners admitted yet', 'Fee balances appear here once learners are admitted.'))
    );
  return (
    head +
    tools +
    table(
      ['Adm no.', 'Learner', 'Class', ['Billed', 'num'], ['Paid', 'num'], ['Balance', 'num'], 'Status', ''],
      rows.map(
        (l) =>
          `<tr class="mobile-list-row" data-act="statement" data-id="${esc(l.id)}" tabindex="0" aria-label="Open fee statement for ${esc(l.name)}"><td>${esc(l.admNo)}</td><td class="mobile-list-primary"><b>${esc(l.name)}</b></td><td>${esc(className(l.classId))}</td><td class="num">${kes(billed(l))}</td><td class="num">${kes(paid(l))}</td><td class="num"><b>${kes(balance(l))}</b></td><td>${feeChip(l)}</td><td class="act"><button class="btn sm" data-act="statement" data-id="${esc(l.id)}">Statement</button>${canEdit() ? ` <button class="btn sm" data-act="payForm" data-id="${esc(l.id)}">Pay</button>` : ''}</td></tr>`,
      ),
      `<tr><td colspan="3">Total</td><td class="num">${kes(sum(rows.map(billed)))}</td><td class="num">${kes(sum(rows.map(paid)))}</td><td class="num">${kes(sum(rows.map(balance)))}</td><td colspan="2"></td></tr>`,
    )
  );
};

function statementHtml(l) {
  const items = feeItems(l),
    pays = paymentsOf(l);
  return (
    table(
      ['Item', ['Amount', 'num']],
      items.map(([n, a]) => `<tr><td>${esc(n)}</td><td class="num">${kes(a)}</td></tr>`),
      `<tr><td>Total billed</td><td class="num">${kes(billed(l))}</td></tr>`,
    ) +
    `<h3 style="margin:1.1rem 0 .5rem">Payments received</h3>` +
    (pays.length
      ? table(
          ['Date', 'Receipt', 'Method', 'Reference', ['Amount', 'num'], ''],
          pays.map(
            (p) =>
              `<tr><td style="white-space:nowrap">${fmtDate(p.date)}</td><td>${esc(p.receiptNo)}</td><td>${esc(p.method)}</td><td>${esc(p.ref)}</td><td class="num">${kes(p.amount)}</td><td class="act"><button class="btn sm" data-act="dlReceipt" data-id="${esc(p.id)}">Receipt</button></td></tr>`,
          ),
          `<tr><td colspan="4">Total paid</td><td class="num">${kes(paid(l))}</td><td></td></tr>`,
        )
      : '<p class="muted">No payment received this term.</p>')
  );
}

function feesParent() {
  const k = kid();
  if (!k) return noKid();
  const c = cfg(),
    b = balance(k);
  return (
    kidPicker() +
    `<div class="cols"><section class="panel"><h2>Fee statement, ${esc(termLabel())}</h2><p class="muted" style="margin-bottom:.8rem">${esc(k.name)}, ${esc(className(k.classId))}</p>${statementHtml(k)}
    <div class="facts" style="grid-template-columns:1fr"><div><b>${b > 0 ? kes(b) : b < 0 ? kes(-b) + ' overpaid' : 'Fees cleared'}</b><span>${b > 0 ? 'Balance to pay' : b < 0 ? 'Carried to next term' : 'Thank you'}</span></div></div></section>
    <section class="panel"><h2>Pay with M-Pesa</h2>${c.paybill ? `<ol style="margin:0;padding-left:1.2rem"><li>Open M-Pesa and choose Lipa na M-Pesa, then Pay Bill.</li><li>Business number: <b>${esc(c.paybill)}</b></li><li>Account number: <b>${esc(k.admNo)}</b> (the admission number)</li><li>Enter the amount${b > 0 ? ', for example ' + kes(b) : ''}, then your M-Pesa PIN.</li><li>Keep the confirmation message. The office records the payment and your receipt appears on this page.</li></ol>` : '<p class="muted">The school has not added a Pay Bill number yet. Please pay at the school office.</p>'}<p class="small muted" style="margin-top:.8rem">Bank deposits and cash are received at the school office${c.phone ? ', ' + esc(phone(c.phone)) : ''}.</p></section></div>`
  );
}

function payForm(l) {
  const ls = activeLearners().sort((a, b) => a.name.localeCompare(b.name));
  if (!ls.length) return toast('Admit a learner before recording payments.', 'warn');
  const c = cfg();
  openForm({
    title: 'Record a payment',
    submit: 'Record payment',
    values: {
      learnerId: (l || ls[0]).id,
      amount: l ? Math.max(0, balance(l)) || '' : '',
      method: 'M-Pesa',
      date: today(),
    },
    fields: [
      {
        k: 'learnerId',
        l: 'Learner',
        t: 'select',
        full: true,
        req: true,
        o: ls.map((x) => [x.id, `${x.name} (${x.admNo}, ${className(x.classId)})`]),
      },
      { k: 'amount', l: 'Amount (KES)', t: 'number', req: true },
      { k: 'date', l: 'Date paid', t: 'date', req: true },
      { k: 'method', l: 'Method', t: 'select', o: ['M-Pesa', 'Bank deposit', 'Cash', 'Cheque'], req: true },
      { k: 'ref', l: 'M-Pesa code or slip number' },
      { k: 'note', l: 'Note', full: true },
    ],
    onSave: async (v) => {
      if (!(v.amount > 0)) return 'Enter an amount above zero.';
      if (!(await save('payments', { ...v, id: newId('p'), term: c.term, year: c.year }))) return false;
      toast('Payment of ' + kes(v.amount) + ' recorded', 'success');
    },
  });
}

function receiptDoc(p) {
  const l = get('learners', p.learnerId) || { name: '', admNo: '' };
  return docShell(
    'Receipt ' + p.receiptNo,
    `${schoolHead()}<h2>Fee receipt ${esc(p.receiptNo)}</h2><dl><dt>Date</dt><dd>${fmtDate(p.date)}</dd><dt>Received from</dt><dd>${esc(l.guardianName || '')}</dd><dt>Learner</dt><dd><b>${esc(l.name)}</b>, adm no. ${esc(l.admNo)}, ${esc(className(l.classId))}</dd><dt>Term</dt><dd>Term ${esc(p.term)}, ${esc(p.year)}</dd><dt>Method</dt><dd>${esc(p.method)}${p.ref ? ', ref ' + esc(p.ref) : ''}</dd><dt>Amount</dt><dd><b>${kes(p.amount)}</b></dd>${l.id ? `<dt>Balance after all payments</dt><dd>${kes(balance(l))}</dd>` : ''}</dl><div class="sign"><div>Received by: ${esc(p.by || '')}</div><div>School stamp</div></div>`,
  );
}

Object.assign(A, {
  dlReceipt: (d) => {
    const p = get('payments', d.id);
    saveFile(`Receipt ${p.receiptNo}.html`, receiptDoc(p));
  },
  payForm: (d) => {
    closeModal();
    payForm(d.id ? get('learners', d.id) : null);
  },
  payDel: (d) => {
    const p = get('payments', d.id);
    confirmBox(
      'Delete receipt ' + p.receiptNo + '?',
      `This removes the payment of ${kes(p.amount)} and raises the learner\u2019s balance.`,
      'Delete payment',
      async () => {
        if (!(await removeDoc('payments', p.id))) return false;
        toast('Payment deleted', 'success');
      },
    );
  },
  statement: (d) => {
    const l = get('learners', d.id);
    openModal(
      `<h2 style="margin-bottom:.2rem">Fee statement</h2><p class="muted" style="margin-bottom:.9rem">${esc(l.name)}, ${esc(className(l.classId))}, ${esc(termLabel())}</p>${statementHtml(l)}<div class="facts" style="grid-template-columns:1fr"><div><b>${kes(balance(l))}</b><span>Balance</span></div></div><div class="actions"><button class="btn primary" data-act="closeModal">Done</button></div>`,
      true,
    );
  },
  saveFees: async () => {
    const fees = {};
    Object.keys(LEVELS).forEach((k) => {
      fees[k] = {};
      ['tuition', 'lunch', 'activity'].forEach((v) => (fees[k][v] = +$(`#fee_${k}_${v}`).value || 0));
    });
    if (!(await saveConfig({ fees }))) return false;
    toast('Fee structure saved', 'success');
  },
  csvBalances: () =>
    saveFile(
      `Fee balances ${termLabel().replace(',', '')}.csv`,
      toCsv([
        ['Adm no', 'Name', 'Class', 'Guardian phone', 'Billed', 'Paid', 'Balance'],
        ...activeLearners()
          .sort((a, b) => String(a.admNo).localeCompare(b.admNo))
          .map((l) => [l.admNo, l.name, className(l.classId), l.guardianPhone, billed(l), paid(l), balance(l)]),
      ]),
    ),
  csvPayments: () => {
    const c = cfg();
    saveFile(
      `Payments ${termLabel().replace(',', '')}.csv`,
      toCsv([
        ['Date', 'Receipt', 'Adm no', 'Learner', 'Method', 'Reference', 'Amount'],
        ...all('payments')
          .filter((p) => +p.year === +c.year && +p.term === +c.term)
          .sort((a, b) => String(a.date).localeCompare(b.date))
          .map((p) => {
            const l = get('learners', p.learnerId) || {};
            return [p.date, p.receiptNo, l.admNo, l.name, p.method, p.ref, p.amount];
          }),
      ]),
    );
  },
});
