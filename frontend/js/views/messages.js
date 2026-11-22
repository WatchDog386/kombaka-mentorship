// Chats, laid out like a messaging app: a list of conversations on one side, the open
// conversation on the other. A conversation is either a one-to-one thread with a parent or
// the school office, or a class group (kind === 'class') that the class teacher and the
// guardians of that class share. Groups are opened from here and reached in person by
// their invite link, which still needs a signed-in account (see routes/groups.py).

import { A, V, onInput } from '../core/registry.js';
import { paint } from '../core/render.js';
import { activeLearners, classesSorted, className, learnersIn, staffName } from '../core/school.js';
import { isAdmin, isParent, isStaff, isTeacher, kid, meName, myClass, myKids, session, ui } from '../core/state.js';
import { api } from '../core/api.js';
import { all, get, putLocal, save } from '../core/store.js';
import { empty, openForm, openModal, toast } from '../core/ui.js';
import { $, clone, esc, fmtDT, newId, normPhone, nowIso } from '../core/util.js';
import { canEdit } from '../core/widgets.js';

// The first letters of a name, for the round picture beside a chat.
const initialsOf = (name) =>
  String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

// Every conversation this person may see. The server has already filtered the rest out.
export function myThreads() {
  let list = all('messages');
  if (isTeacher()) list = list.filter((t) => t.to === session.id || t.kind === 'class');
  if (isParent()) list = list.filter((t) => normPhone(t.parentPhone) === session.id || t.kind === 'class');
  return list.sort((a, b) => String(b.updated).localeCompare(a.updated));
}

const isGroup = (t) => t.kind === 'class';

// Who a conversation is with, as a title and an initial for the round picture.
function whoOf(t) {
  if (isGroup(t)) return t.subject || 'Class group';
  const other = isParent() ? threadTo(t) : t.parentName || threadTo(t);
  return other;
}

const avatarOf = (t) => {
  const name = whoOf(t);
  return isGroup(t) ? initialsOf(className(t.classId) || name) : initialsOf(name);
};

const toneOf = (t) => (isGroup(t) ? 'g' : isParent() ? 'p' : 's');

// One-to-one conversations say who the other person is; groups say how many are in them.
const subOf = (t) => {
  if (isGroup(t)) {
    const n = (t.members || []).length;
    return `${className(t.classId)}${n ? ' \u00b7 ' + n + ' in the group' : ''}`;
  }
  return isParent() ? `About ${(get('learners', t.learnerId) || {}).name || 'your child'}` : threadTo(t);
};

const threadTo = (t) => (t.to === 'office' ? 'School office' : staffName(t.to) || 'Teacher');

const lastOf = (t) => t.msgs[t.msgs.length - 1] || {};

// The last thing said, cut to one line for the list.
function preview(t) {
  const m = lastOf(t);
  if (!m.text) return isGroup(t) ? 'No messages yet' : 'No messages yet';
  return m.text.replace(/\s+/g, ' ').slice(0, 90);
}

// A chat is unread when the last word was not mine and it is not the one open in front of us.
const waiting = (t) => {
  if (t.id === ui.thread) return false;
  const m = lastOf(t);
  if (!m.text) return false;
  return isParent() ? m.who === 'staff' : m.who === 'parent';
};

const myClasses = () => (isTeacher() && myClass() ? [myClass()] : classesSorted());

// ───────────────────────── the conversation list ─────────────────────────

function chatList() {
  const list = myThreads();
  const groups = list.filter(isGroup);
  const direct = list.filter((t) => !isGroup(t));
  const head = (n) => (n ? `<h4 class="chat-sec">${n}</h4>` : '');
  const row = (t) => {
    const on = t.id === ui.thread;
    const m = lastOf(t);
    return `<button class="chat-row${on ? ' on' : ''}" data-act="openThread" data-id="${esc(t.id)}" aria-current="${on}">
      <span class="chat-av av-${toneOf(t)}">${esc(avatarOf(t))}</span>
      <span class="chat-row-m"><span class="chat-row-t"><b>${esc(whoOf(t))}</b>${waiting(t) ? '<i class="dot" aria-label="New reply"></i>' : ''}</span><span class="chat-row-s">${esc(preview(t))}</span></span>
      <span class="chat-row-w"><span class="chat-row-d">${m.at ? fmtDT(m.at) : ''}</span>${m.who === meKey() ? '<i class="tick" aria-hidden="true">&#10003;&#10003;</i>' : ''}</span>
    </button>`;
  };
  if (!list.length)
    return `<div class="chat-empty">${empty(
      'No conversations yet',
      isParent() ? 'Write to your child\u2019s class teacher or the school office.' : 'Messages from parents, and class groups, appear here.',
    )}</div>`;
  return `${head('Class groups')}${groups.map(row).join('')}${head('Direct messages')}${direct.map(row).join('')}`;
}

// 'staff' and 'parent' are the two sides of a conversation; office counts as staff.
const meKey = () => (isParent() ? 'parent' : 'staff');

// ───────────────────────── the open conversation ─────────────────────────

// Day separators, the way a chat app groups messages that arrived together.
function dayLabel(at) {
  if (!at) return '';
  const d = new Date(at);
  const today = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-GB', { weekday: 'long' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function bubbles(t) {
  if (!t.msgs.length)
    return `<div class="chat-blank">${
      isGroup(t)
        ? `<b>${esc(whoOf(t))}</b><p>No messages yet. Say hello to the parents of ${esc(className(t.classId))}.</p>`
        : `<b>${esc(whoOf(t))}</b><p>No messages yet. Write the first one.</p>`
    }</div>`;
  let day = '';
  return t.msgs
    .map((m) => {
      let sep = '';
      const d = dayLabel(m.at);
      if (d !== day) {
        day = d;
        sep = `<div class="chat-day"><span>${esc(d)}</span></div>`;
      }
      // In a group everyone sees who said what; one-to-one does not need it.
      const who = isGroup(t) ? `<span class="chat-who">${esc(m.name)}</span>` : '';
      return `${sep}<div class="chat-b${m.who === meKey() ? ' me' : ''}">${who}<span class="chat-x">${esc(m.text)}</span><span class="chat-at">${esc(fmtDT(m.at))}</span></div>`;
    })
    .join('');
}

function chatPane(t) {
  if (!t)
    return `<div class="chat-blank chat-pick"><b>Select a chat</b><p>Pick a conversation on the left to read and reply.</p></div>`;
  const back = `<button class="chat-back" data-act="closeThread" aria-label="Back to the list">${'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>'}</button>`;
  const group = isGroup(t);
  const members = `<span class="small muted chat-sub">${esc(group ? (t.members || []).length + ' in the group · ' + className(t.classId) : subOf(t))}</span>`;
  const link =
    group && t.joinToken
      ? `<button class="btn sm" data-act="groupLink" data-id="${esc(t.id)}" data-c="${esc(t.classId)}">Copy join link</button>`
      : '';
  const kick = group && t.joinToken ? `<button class="btn sm danger" data-act="groupLinkOff" data-c="${esc(t.classId)}">Stop link</button>` : '';
  return `<header class="chat-head">
      ${back}<span class="chat-av av-${toneOf(t)}">${esc(avatarOf(t))}</span>
      <span class="chat-head-m"><b>${esc(whoOf(t))}</b>${members}</span>
      <span class="chat-head-a">${kick}${link}</span>
    </header>
    <div class="chat-body" id="chatBody">${bubbles(t)}</div>
    ${
      canEdit()
        ? `<form class="chat-compose" data-sub="sendChat" data-id="${esc(t.id)}">
            <label class="sr" for="chatText">Message</label>
            <textarea id="chatText" data-in="chatText" rows="1" placeholder="Type a message" enterkeyhint="send"></textarea>
            <button class="chat-send" type="submit" aria-label="Send">${'<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a1 1 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z"/></svg>'}</button>
          </form>`
        : `<p class="chat-locked">You cannot post in this conversation.</p>`
    }`;
}

// ───────────────────────── the view ─────────────────────────

V.messages = () => {
  const open = ui.thread ? get('messages', ui.thread) : null;
  const mine = [
    isAdmin() ? 'New class group' : isTeacher() ? 'Class group' : '',
    isParent() ? 'New message' : '',
  ]
    .filter(Boolean)
    .map((label, i) => `<button class="btn${i === 0 && isStaff() ? ' primary' : ''}" data-act="${isParent() ? 'msgForm' : 'groupForm'}">${label}</button>`)
    .join('');
  const tools = `<div class="tools chat-tools"><span class="grow"></span>${canEdit() ? mine : ''}</div>`;

  if (!ui.thread) return tools + `<div class="chat chat-list-only"><div class="chat-side">${chatList()}</div></div>`;
  return (
    tools +
    `<div class="chat${open ? '' : ' chat-list-only'}">
       <div class="chat-side">${chatList()}</div>
       <div class="chat-main">${chatPane(open)}</div>
     </div>`
  );
};

// ───────────────────────── starting a group ─────────────────────────

function groupForm() {
  const mine = isTeacher() && myClass() ? [myClass()] : classesSorted();
  const mineIds = new Set(mine.map((c) => c.id));
  const have = new Set(myThreads().filter(isGroup).map((t) => t.classId));
  const list = mine.filter((c) => !have.has(c.id));
  if (!list.length)
    return toast(
      isTeacher() ? 'Your class already has a group. Open it from the list.' : 'Every class already has a group.',
      'warn',
    );
  openForm({
    title: 'Open a class group',
    submit: 'Open group',
    values: { classId: list[0].id },
    fields: [
      {
        k: 'classId',
        l: 'Class',
        t: 'select',
        req: true,
        full: true,
        o: list.map((c) => [c.id, `${c.name} \u00b7 ${learnersIn(c.id).length} learners`]),
      },
    ],
    onSave: async (v) => {
      let g;
      try {
        g = await api.post('/groups', { classId: v.classId });
      } catch (e) {
        toast(e.message, 'error');
        return false;
      }
      // The server made the group and handed it back, so it only needs to go in the
      // in-memory copy; there is nothing to save and no message to send yet.
      putLocal('messages', { ...g, msgs: g.msgs || [] });
      ui.thread = g.id;
      ui.view = 'messages';
      paint();
      return true;
    },
  });
}

// The invite link, and a way to stop it working.
async function copyLink(classId) {
  try {
    const r = await api.post('/groups/link', { classId });
    const url = new URL(r.link, location.origin).href;
    if (navigator.clipboard) await navigator.clipboard.writeText(url);
    openModal(
      `<h2>Join link for ${esc(className(classId))}</h2>
       <p class="hint" style="margin:-.4rem 0 .9rem">Send this to the parents of the class, in the school WhatsApp group or as an SMS. Anyone who opens it is asked to sign in, and only a parent of this class or the school can actually get in.</p>
       <label class="f"><span>Link</span><input id="joinUrl" type="text" value="${esc(url)}" readonly onclick="this.select()"></label>
       <p class="small muted">To stop this link working, close this and use <b>Stop link</b> in the chat.</p>
       <div class="actions"><button class="btn" data-act="closeModal">Close</button><button class="btn primary" data-act="copyUrl" data-u="${esc(url)}">Copy again</button></div>`,
      true,
    );
  } catch (e) {
    toast(e.message, 'error');
  }
}

// Follow an invite link from the address bar. The token says which group; the signed-in
// account still decides whether this person may be in it.
export async function joinFromUrl() {
  const token = new URLSearchParams(location.search).get('join');
  if (!token) return;
  history.replaceState(null, '', location.pathname);
  try {
    const r = await api.post('/groups/join', { token });
    ui.view = 'messages';
    ui.thread = r.threadId;
    paint();
    toast('You have joined ' + r.subject, 'success');
  } catch (e) {
    toast(e.message, 'warn');
  }
}

Object.assign(A, {
  openThread: (d) => {
    ui.thread = d.id;
    paint();
    const b = $('#chatBody');
    if (b) b.scrollTop = b.scrollHeight;
  },
  closeThread: () => {
    ui.thread = '';
    paint();
  },
  sendChat: async (d, el) => {
    const box = $('#chatText');
    const text = box ? box.value.trim() : '';
    if (!text) return;
    const t = clone(get('messages', d.id));
    if (!t) return;
    t.msgs.push({ who: meKey(), name: meName(), text, at: nowIso() });
    t.updated = nowIso();
    if (!(await save('messages', t))) return;
    ui.thread = d.id;
    paint();
    const body = $('#chatBody');
    if (body) body.scrollTop = body.scrollHeight;
    const again = $('#chatText');
    if (again) again.focus();
  },
  groupForm,
  groupLink: (d) => copyLink(d.c),
  copyUrl: async (d) => {
    try {
      await navigator.clipboard.writeText(d.u);
      toast('Link copied', 'success');
    } catch (e) {
      toast('Select the link and copy it.', 'warn');
    }
  },
  groupLinkOff: async (d) => {
    try {
      await api.post('/groups/link/off', { classId: d.c });
      const t = get('messages', ui.thread);
      if (t) putLocal('messages', { ...clone(t), joinToken: '' });
      toast('The join link no longer works. The group and its messages are kept.', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  },
  msgForm,
});

// Grow the composer with what is typed into it, up to a few lines.
Object.assign(onInput, {
  chatText: (el) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  },
});

// Enter sends the message; Shift+Enter starts a new line, as in any chat app.
document.addEventListener('keydown', (e) => {
  const box = e.target.closest('#chatText');
  if (!box || e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
  e.preventDefault();
  box.closest('form').requestSubmit();
});

// ───────────────────────── starting a direct message ─────────────────────────

function msgForm() {
  if (isParent()) {
    const ks = myKids();
    if (!ks.length) return toast('No learner is linked to this phone number.', 'warn');
    const tos = [['office', 'School office']];
    ks.forEach((k) => {
      const c = get('classes', k.classId);
      if (c && c.teacherId && staffName(c.teacherId))
        tos.unshift([k.id + '|' + c.teacherId, `${staffName(c.teacherId)}, ${k.name.split(' ')[0]}\u2019s class teacher`]);
    });
    return openForm({
      title: 'Write to the school',
      submit: 'Send message',
      wide: true,
      values: { to: tos[0][0], learnerId: (kid() || ks[0]).id },
      fields: [
        { k: 'to', l: 'Send to', t: 'select', o: tos, req: true },
        { k: 'learnerId', l: 'About', t: 'select', o: ks.map((k) => [k.id, k.name]), req: true },
        { k: 'subject', l: 'Subject', req: true, full: true },
        { k: 'text', l: 'Message', t: 'area', req: true, full: true },
      ],
      onSave: async (v) => {
        const [a, b] = v.to.split('|');
        const lid = b ? a : v.learnerId,
          at = nowIso();
        const doc = {
          id: newId('m'),
          learnerId: lid,
          parentPhone: session.id,
          parentName: meName(),
          to: b || 'office',
          subject: v.subject,
          msgs: [{ who: 'parent', name: meName(), text: v.text, at }],
          updated: at,
        };
        if (!(await save('messages', doc))) return false;
        ui.thread = doc.id;
        paint();
      },
    });
  }
  const mc = myClass();
  const ls = isTeacher() && mc ? learnersIn(mc.id) : activeLearners().sort((a, b) => a.name.localeCompare(b.name));
  if (!ls.length) return toast('There are no learners to write about yet.', 'warn');
  openForm({
    title: 'Write to a parent',
    submit: 'Send message',
    wide: true,
    values: { learnerId: ls[0].id },
    fields: [
      { k: 'learnerId', l: 'Parent of', t: 'select', full: true, req: true, o: ls.map((l) => [l.id, `${l.name} (${l.guardianName})`]) },
      { k: 'subject', l: 'Subject', req: true, full: true },
      { k: 'text', l: 'Message', t: 'area', req: true, full: true },
    ],
    onSave: async (v) => {
      const l = get('learners', v.learnerId),
        at = nowIso();
      const doc = {
        id: newId('m'),
        learnerId: l.id,
        parentPhone: normPhone(l.guardianPhone),
        parentName: l.guardianName,
        to: isAdmin() ? 'office' : session.id,
        subject: v.subject,
        msgs: [{ who: 'staff', name: meName(), text: v.text, at }],
        updated: at,
      };
      if (!(await save('messages', doc))) return false;
      ui.thread = doc.id;
      paint();
    },
  });
}