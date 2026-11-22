// My profile: the person who is signed in. Their picture (which they can change), what the school
// has on record for them, the part of the school that is theirs (a teacher's class, a parent's
// children, the office's school at a glance) and changing their password. Everything about how the
// school itself is set up is in Settings.

import { api } from '../core/api.js';
import { avatar, photoUrl, setPhoto } from '../core/avatar.js';
import { line, P } from '../core/icons.js';
import { A, V, onChange } from '../core/registry.js';
import { go, paint } from '../core/render.js';
import { activeLearners, balance, cfg, className, termLabel } from '../core/school.js';
import { isAdmin, isParent, isTeacher, meName, myClass, myKids, session, ui } from '../core/state.js';
import { all, get } from '../core/store.js';
import { toast } from '../core/ui.js';
import { $, esc, fmtDate, kes, phone } from '../core/util.js';

const roleOf = () => (isAdmin() ? 'Administrator' : isTeacher() ? (get('staff', session.id) || {}).role || 'Teacher' : 'Parent or guardian');
const longDate = (d) => (d ? fmtDate(d, { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const kv = (rows) =>
  `<dl class="kv prof-kv">${rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
    .join('')}</dl>`;

// The header: picture with a camera button, name, role and a few facts as chips.
function hero() {
  const c = cfg(),
    name = meName(),
    chips = [];
  if (isTeacher()) {
    const mc = myClass();
    if (mc) chips.push('Class teacher, ' + mc.name);
  }
  if (isParent()) {
    const n = myKids().length;
    chips.push(n === 1 ? '1 child at the school' : n + ' children at the school');
  }
  if (session.since) chips.push('Member since ' + fmtDate(session.since, { month: 'long', year: 'numeric' }));
  const pickPhoto = (cls, inner) =>
    `<label class="${cls}">${inner}<input type="file" accept="image/*" data-ch="profPhoto" hidden></label>`;
  return `<section class="prof-hero">
    <div class="prof-cover" aria-hidden="true"></div>
    <div class="prof-id">
      <div class="prof-pic">${avatar(name, 'av prof-av')}${pickPhoto('prof-cam', `${line('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', 18)}<span class="sr">Change photo</span>`)}</div>
      <div class="prof-who"><h2>${esc(name)}</h2><p>${esc(roleOf())} · ${esc(c.name)}</p>
        ${chips.length ? `<div class="prof-chips">${chips.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}</div>
      <div class="prof-acts">${pickPhoto('btn', photoUrl() ? 'Change photo' : 'Add a photo')}${photoUrl() ? '<button class="btn" data-act="profPhotoDel">Remove</button>' : ''}</div>
    </div>
  </section>`;
}

// What the school holds for this person. Only the office can change it.
function details() {
  let rows;
  if (isTeacher()) {
    const s = get('staff', session.id) || {};
    rows = [
      ['Full name', s.name || session.name],
      ['Staff number', s.staffNo],
      ['Role', s.role],
      ['TSC number', s.tsc],
      ['Phone', phone(s.phone)],
      ['Email', s.email],
      ['Date employed', longDate(s.joined)],
    ];
  } else if (isParent()) {
    rows = [
      ['Name', session.name],
      ['Phone', phone(session.id)],
    ];
  } else {
    rows = [['Account', 'School office']];
  }
  rows.push(['Signs in with', isAdmin() ? session.login : phone(session.login || session.id)]);
  return `<section class="panel"><h2>Personal details</h2>${kv(rows)}
    ${isAdmin() ? '' : '<p class="hint" style="margin-top:1rem">These come from the school’s records. To correct anything, ask the school office.</p>'}</section>`;
}

// The part of the school that belongs to this person.
function mine() {
  if (isTeacher()) {
    const s = get('staff', session.id) || {},
      mc = myClass(),
      ls = mc ? activeLearners().filter((l) => l.classId === mc.id) : [],
      girls = ls.filter((l) => l.gender === 'F').length,
      areas = String(s.areas || '')
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);
    return `<section class="panel"><h2>My class</h2>${
      mc
        ? `<div class="prof-stat"><b>${esc(mc.name)}</b><span>${ls.length} learners · ${girls} girls, ${ls.length - girls} boys</span></div>
          <div class="prof-links"><button class="btn" data-act="go" data-v="attendance">${line(P.check, 17)}Register</button><button class="btn" data-act="go" data-v="assessment">${line(P.clip, 17)}Assessment</button></div>`
        : '<p class="muted">You are not class teacher of a class this term.</p>'
    }
      ${areas.length ? `<h3 class="prof-h3">Learning areas I teach</h3><div class="prof-chips soft">${areas.map((a) => `<span>${esc(a)}</span>`).join('')}</div>` : ''}</section>`;
  }
  if (isParent()) {
    const ks = myKids();
    return `<section class="panel"><h2>My children</h2>${
      ks.length
        ? `<ul class="prof-kids">${ks
            .map((k) => {
              const owe = balance(k);
              return `<li>${`<span class="av sm">${esc(k.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase())}</span>`}
                <div><b>${esc(k.name)}</b><span>${esc(className(k.classId))}${k.admNo ? ' · Adm. ' + esc(k.admNo) : ''}</span><span class="${owe > 0 ? 'owe' : 'paid'}">${owe > 0 ? 'Fees due ' + kes(owe) : 'Fees paid up'}</span></div>
                <div class="prof-kid-acts"><button class="btn sm" data-act="profKid" data-id="${esc(k.id)}" data-v="reports">Progress</button><button class="btn sm" data-act="profKid" data-id="${esc(k.id)}" data-v="fees">Fees</button></div></li>`;
            })
            .join('')}</ul>`
        : '<p class="muted">Once the school admits your child, they appear here.</p>'
    }</section>`;
  }
  const staff = all('staff').filter((s) => (s.status || 'Active') === 'Active').length,
    newApps = all('applications').filter((a) => (a.status || 'New') === 'New').length;
  return `<section class="panel"><h2>The school</h2>
    <div class="prof-nums"><div><b>${activeLearners().length}</b><span>Learners</span></div><div><b>${staff}</b><span>Staff</span></div><div><b>${all('classes').length}</b><span>Classes</span></div><div><b>${newApps}</b><span>New applications</span></div></div>
    <p class="muted" style="margin:.9rem 0">${esc(termLabel())} is in session.</p>
    <button class="btn" data-act="go" data-v="settings">${line(P.gear, 17)}School settings</button></section>`;
}

function security() {
  return `<section class="panel"><h2>Change password</h2>
    <form class="grid2" data-sub="cpSave" novalidate>
      <label class="f full"><span>Current password</span><input id="cp_current" data-keep type="password" autocomplete="current-password"></label>
      <label class="f"><span>New password</span><input id="cp_next" data-keep type="password" autocomplete="new-password"></label>
      <label class="f"><span>New password again</span><input id="cp_again" data-keep type="password" autocomplete="new-password"></label>
      <p class="err full" id="cpErr" role="alert"></p>
      <div class="actions full"><button class="btn primary" id="cpSave" type="submit">Save new password</button></div>
    </form></section>`;
}

V.profile = () => `${hero()}<div class="prof-grid">${details()}${mine()}${security()}</div>`;

// A picture is cut to a centred square and shrunk to 320 pixels before it is sent, so it stays
// small whatever the phone's camera took.
async function squareJpeg(file) {
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = no;
      i.src = src;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight),
      size = Math.min(320, side),
      canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    canvas
      .getContext('2d')
      .drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally {
    URL.revokeObjectURL(src);
  }
}

onChange.profPhoto = async (el) => {
  const file = el.files && el.files[0];
  el.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) return toast('Choose a picture: a photo or an image file.', 'warn');
  let url;
  try {
    url = await squareJpeg(file);
  } catch (e) {
    return toast('That picture could not be opened. Try another one.', 'error');
  }
  try {
    const r = await api.put('/auth/photo', { photo: url });
    setPhoto(r.photoAt, url);
    toast('Profile photo updated', 'success');
    paint();
  } catch (e) {
    toast(e.message, 'error');
  }
};

Object.assign(A, {
  profPhotoDel: async () => {
    try {
      await api.del('/auth/photo');
      setPhoto('', '');
      toast('Profile photo removed', 'success');
      paint();
    } catch (e) {
      toast(e.message, 'error');
    }
  },
  // Open a child's progress report or fees from their card.
  profKid: (d) => {
    ui.kid = d.id;
    go(d.v);
  },
  cpSave: async () => {
    const current = $('#cp_current').value,
      next = $('#cp_next').value,
      again = $('#cp_again').value,
      err = $('#cpErr'),
      btn = $('#cpSave');
    err.textContent = '';
    if (!current || !next || !again) return (err.textContent = 'Fill in all three boxes.');
    if (next.length < 6) return (err.textContent = 'The new password needs at least 6 characters.');
    if (next !== again) return (err.textContent = 'The two new passwords do not match.');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await api.post('/auth/password', { current, new: next });
      ['cp_current', 'cp_next', 'cp_again'].forEach((id) => ($('#' + id).value = ''));
      toast('Password changed', 'success');
    } catch (e) {
      err.textContent = e.message;
    }
    btn.disabled = false;
    btn.textContent = 'Save new password';
  },
});
