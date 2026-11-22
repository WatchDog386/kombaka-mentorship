// Notices to parents and teachers.

import { A, V } from '../core/registry.js';
import { className, classesSorted } from '../core/school.js';
import { isAdmin, isParent, isStaff, isTeacher, meName, myClass, myKids } from '../core/state.js';
import { all, get, save } from '../core/store.js';
import { empty, openForm, toast } from '../core/ui.js';
import { esc, fmtDate, newId, today } from '../core/util.js';
import { canEdit } from '../core/widgets.js';

export function visibleNotices() {
  let list = all('notices');
  if (isTeacher()) {
    const mc = myClass();
    list = list.filter(
      (n) => ['All', 'Teachers'].includes(n.audience) || (mc && n.audience === mc.id) || n.by === meName(),
    );
  }
  if (isParent()) {
    const cids = myKids().map((k) => k.classId);
    list = list.filter((n) => ['All', 'Parents'].includes(n.audience) || cids.includes(n.audience));
  }
  return list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.date).localeCompare(a.date));
}

const audienceLabel = (a) =>
  ['All', 'Parents', 'Teachers'].includes(a) ? (a === 'All' ? 'Everyone' : a) : className(a) + ' parents';

export const noticeMini = (list) =>
  list.length
    ? `<ul class="list">${list.map((n) => `<li><span><b>${esc(n.title)}</b><br><span class="small muted">${esc(n.by || '')}, ${fmtDate(n.date)}</span></span></li>`).join('')}</ul>`
    : '<p class="muted">No notices yet.</p>';

V.notices = () => {
  const list = visibleNotices();
  const tools = `<div class="tools"><span class="grow"></span>${isStaff() && canEdit() ? '<button class="btn primary" data-act="noticeForm">Post a notice</button>' : ''}</div>`;
  return (
    (isStaff() ? tools : '') +
    (list.length
      ? list
          .map(
            (n) =>
              `<div class="note ${n.pinned ? 'pin' : ''}"><h3>${esc(n.title)}</h3><p style="white-space:pre-line">${esc(n.body)}</p><div class="meta">${n.pinned ? '<span class="chip warn">Pinned</span>' : ''}<span class="chip">${esc(audienceLabel(n.audience))}</span><span>${esc(n.by)}, ${fmtDate(n.date)}</span>${isStaff() && canEdit() && (isAdmin() || n.by === meName()) ? `<span style="margin-left:auto"><button class="btn sm" data-act="noticeForm" data-id="${esc(n.id)}">Edit</button> <button class="btn sm danger" data-act="del" data-c="notices" data-id="${esc(n.id)}" data-n="this notice">Delete</button></span>` : ''}</div></div>`,
          )
          .join('')
      : empty(
          'No notices',
          isStaff() ? 'Post a notice to reach parents and teachers.' : 'Notices from the school appear here.',
        ))
  );
};

function noticeForm(n) {
  const mc = myClass();
  const aud = isAdmin()
    ? [
        ['All', 'Everyone'],
        ['Parents', 'All parents'],
        ['Teachers', 'Teachers only'],
        ...classesSorted().map((c) => [c.id, c.name + ' parents']),
      ]
    : mc
      ? [[mc.id, mc.name + ' parents']]
      : [['Teachers', 'Teachers only']];
  openForm({
    title: n ? 'Edit notice' : 'Post a notice',
    wide: true,
    values: n || { audience: aud[0][0] },
    fields: [
      { k: 'title', l: 'Title', req: true, full: true },
      { k: 'body', l: 'Message', t: 'area', req: true, full: true },
      { k: 'audience', l: 'Who should see it', t: 'select', o: aud, req: true },
      ...(isAdmin() ? [{ k: 'pinned', l: 'Pin to the top', t: 'check' }] : []),
    ],
    onSave: async (v) => {
      if (
        !(await save('notices', {
          date: today(),
          by: isAdmin()
            ? (all('staff').find((s) => s.role === 'Head teacher') || {}).name || 'School office'
            : meName(),
          ...(n || {}),
          ...v,
          id: n ? n.id : newId('n'),
        }))
      )
        return false;
      toast(n ? 'Notice saved' : 'Notice posted', 'success');
    },
  });
}

Object.assign(A, {
  noticeForm: (d) => noticeForm(d.id ? get('notices', d.id) : null),
});
