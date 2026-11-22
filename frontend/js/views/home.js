// The public school home page. Routing lives in public.js, which also
// owns the pieces shared with this page: the level icons, the class picker and the
// per-level fee.

import { ico, line } from '../core/icons.js';
import { A, onChange } from '../core/registry.js';
import { LEVELS, cfg, classesSorted, termLabel } from '../core/school.js';
import { get, store } from '../core/store.js';
import { openModal } from '../core/ui.js';
import { $, esc, fmtDate, kes, phone } from '../core/util.js';
import { eventLi, upcoming } from './calendar.js';
import { APP_FULL_NAME } from '../core/config.js';
import { LEVEL_ICON, appLogo, classSpan, feeText, levelFee, pick, setPick } from './public.js';

const I = {
  cap: line('<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6"/>', 18),
  tag: line('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>', 18),
  down: line('<path d="m6 9 6 6 6-6"/>', 14),
  users: line(
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
    15,
  ),
  layers: line('<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>', 15),
};
// A white bell with an orange ball, drawn for the purple badge above the school name.
const badgeArt = `<svg class="hx-bell" viewBox="0 0 120 96" aria-hidden="true"><defs>
  <linearGradient id="hxBell" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#C9C5E6"/><stop offset=".35" stop-color="#FFFFFF"/><stop offset=".7" stop-color="#F0EFF8"/><stop offset="1" stop-color="#ABA6D3"/></linearGradient>
  <radialGradient id="hxBall" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#FFB25E"/><stop offset=".6" stop-color="#F26B1D"/><stop offset="1" stop-color="#C24808"/></radialGradient></defs>
  <g transform="rotate(-20 58 56)"><rect x="53" y="14" width="10" height="12" rx="4" fill="#E4E2F2"/>
    <path d="M30 78c2-32 10-52 28-52s26 20 28 52z" fill="url(#hxBell)"/>
    <ellipse cx="58" cy="78" rx="30" ry="7.5" fill="#E9E7F5"/><ellipse cx="58" cy="77.5" rx="24" ry="4.6" fill="#7E76C4"/></g>
  <circle cx="92" cy="26" r="12" fill="url(#hxBall)"/></svg>`;

export function homeHtml() {
  const c = cfg(),
    cls = classesSorted(),
    has = !!get('config', 'school'),
    name = has ? c.name : APP_FULL_NAME,
    span = classSpan(cls),
    where = c.county || c.address,
    ln = store.counts.learners;
  if (pick && !get('classes', pick)) setPick('');
  const intro = `A Competency Based Curriculum school${c.county ? ' in ' + c.county : ''} for learners from ${span}.`;
  const minFee = Object.keys(LEVELS)
    .map(levelFee)
    .filter((n) => n > 0);
  return `<div class="home"><div class="sheet">
    <section class="hx">
      <img class="hx-img" src="/assets/hero.png" alt="" width="1135" height="1386">
      <header class="hx-top"><div class="hx-logo">${appLogo()}</div>
        <div class="hx-acct"><button class="hx-join" data-act="portal">Sign in</button><button class="hx-join" data-act="getStarted">Get started</button></div></header>
      <div class="hx-body">
        <div class="hx-text">
          <div class="hx-badge">${badgeArt}${c.motto ? `<span>${esc(c.motto)}</span>` : ''}</div>
          <h1>${esc(name)}</h1>
          <p class="hx-sub">${esc(intro)}</p>
          <div class="hx-find" role="group" aria-label="Choose a class">
            <label class="hx-field"><i>${I.cap}</i><span><small>Class</small><select id="hxClass" data-ch="hxClass"><option value="">Any class</option>${cls.map((x) => `<option value="${esc(x.id)}" ${x.id === pick ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></span></label>
            <div class="hx-field"><i>${I.tag}</i><span><small>Fees per term</small><b id="hxFee">${esc(feeText(pick))}</b></span></div>
            <button class="hx-go" data-act="getStarted">Create account</button>
          </div>
        </div>
      </div>
      <p class="hx-call">${c.phone ? `Call the school office on <a href="tel:${esc(String(c.phone).replace(/\s+/g, ''))}">${esc(phone(c.phone))}</a> and we can set you up` : 'Visit the school office and we can set you up'}, or <button class="hx-link" data-act="hInfo" data-m="join">see how to join</button></p>
    </section>
    <div class="hx-tab"><button data-act="hInfo" data-m="terms">Term dates <i>${I.down}</i></button><button data-act="hInfo" data-m="join">How to join <i>${I.down}</i></button>
      <svg class="hx-ramp" viewBox="0 0 70 64" preserveAspectRatio="none" aria-hidden="true"><path d="M0-1H70V0C58 0 52 4 47 12L27 52C23 60 17 64 8 64H0Z"/></svg></div>
    <div class="hx-below">
      <article class="hx-spot"><img src="/assets/school-thumb.svg" alt="" width="84" height="84">
        <div><p class="hx-where"><i>${ico.pin}</i>${esc(where || name)}</p>
          <p class="hx-specs">${ln ? `<span>${I.users}${ln} learners</span>` : ''}<span>${I.layers}${esc(span)}</span></p>
          <p class="hx-price">${minFee.length ? `<b>From ${kes(Math.min(...minFee))}</b><small>a term</small>` : ''}<button class="hx-chip" data-act="contact">Book a visit</button></p></div></article>
      <div class="hx-levels">${Object.entries(LEVELS)
        .map(([k, n]) => `<button class="hx-tile" data-act="hInfo" data-m="classes" data-l="${k}"><i>${LEVEL_ICON[k]}</i>${n}</button>`)
        .join('')}</div>
    </div>
  </div></div>`;
}

const close = (extra = '') =>
  `<div class="actions"><button class="btn" data-act="closeModal">Close</button>${extra}</div>`;
const joinBtn = '<button class="btn primary" data-act="getStarted">Create account</button>';

// Term dates and how to join stay pop-ups: they open from the bar under the hero and
// the copy at the foot of the hero, and they read as a detour from the page you are on.
// Create account opens the sign-in page on its create-account form (signin.js).
const INFO = {
  // The four CBC levels: the classes running, the learning areas and the fee. `l` opens one level.
  classes: (d) => {
    const c = cfg(),
      cls = classesSorted(),
      keys = d && d.l && LEVELS[d.l] ? [d.l] : Object.keys(LEVELS);
    return `<h2>${keys.length === 1 ? esc(LEVELS[keys[0]]) : 'What we teach'}</h2><p class="muted" style="margin:-.4rem 0 .6rem">Learning areas follow the Competency Based Curriculum.</p>${keys
      .map((k) => {
        const names = cls.filter((x) => x.level === k).map((x) => x.name),
          fee = levelFee(k);
        return `<div class="hx-lv"><div class="hx-lv-h"><i>${LEVEL_ICON[k]}</i><div><b>${esc(LEVELS[k])}</b><br><span class="small muted">${names.length ? esc(names.join(', ')) : 'No classes at this level yet'}</span></div>${fee ? `<b>${esc(kes(fee))}<small class="muted"> a term</small></b>` : ''}</div>
          <p class="small">${esc((c.areas[k] || []).join(' · '))}</p></div>`;
      })
      .join('')}${close(joinBtn)}`;
  },
  // How to reach the school office.
  contact: () => {
    const c = cfg(),
      tel = c.phone ? String(c.phone).replace(/\s+/g, '') : '',
      at = [c.address, c.county].filter(Boolean).join(', ');
    return `<h2>Visit or call the school</h2><p class="muted" style="margin:-.4rem 0 1rem">Come and see us, or call and the office will help you get set up.</p>
      <dl class="kv">${c.phone ? `<dt>Phone</dt><dd><a href="tel:${esc(tel)}">${esc(phone(c.phone))}</a></dd>` : ''}${c.email ? `<dt>Email</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd>` : ''}${at ? `<dt>Address</dt><dd>${esc(at)}</dd>` : ''}<dt>Office hours</dt><dd>Monday to Friday, 7:30 am to 4:30 pm</dd></dl>
      <h3 style="margin:1.2rem 0 .4rem">When you visit, bring</h3><ul class="small" style="margin:0; padding-left:1.1rem; line-height:1.9"><li>A copy of your child’s birth certificate</li><li>The last school report</li><li>Two passport photos</li></ul>${close(joinBtn)}`;
  },
  terms: () => {
    const c = cfg(),
      ev = upcoming(5),
      end = c.terms[c.term] && c.terms[c.term].e;
    return `<h2>School calendar</h2><p class="muted" style="margin:-.4rem 0 1rem">${esc(termLabel())} is in session${end ? ' and closes on ' + fmtDate(end, { weekday: 'long', day: 'numeric', month: 'long' }) : ''}.</p>
      <div class="facts">${[1, 2, 3]
        .map((n) => {
          const t = c.terms[n];
          return `<div class="${+c.term === n ? 'on' : ''}"><b>Term ${n}</b><span>${t.s && t.e ? fmtDate(t.s, { day: 'numeric', month: 'short' }) + ' to ' + fmtDate(t.e, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Dates to be announced'}</span></div>`;
        })
        .join('')}</div>
      <h3 style="margin:1.2rem 0 .3rem">Coming up</h3>${ev.length ? `<ul class="list">${ev.map(eventLi).join('')}</ul>` : '<p class="small muted">No events have been announced yet.</p>'}${close()}`;
  },
  join: () => {
    const steps = [
      ['Create an account', 'Sign up and tell us about your child and the class you want. It takes two minutes.'],
      ['Visit the school', 'The office calls you to arrange a visit and a short placement assessment.'],
      ['Bring the documents', 'A copy of the birth certificate, the last school report and two passport photos.'],
      ['Pay fees and report', 'You receive an admission number, the fee structure and a reporting date.'],
    ];
    return `<h2>How to join</h2><p class="muted" style="margin:-.4rem 0 1rem">Joining takes four steps, and the school office helps with each one.</p>
      <ol class="hx-steps">${steps.map(([t, d]) => `<li><b>${t}</b><span class="small muted">${d}</span></li>`).join('')}</ol>${close(joinBtn)}`;
  },
};

Object.assign(A, {
  // One handler for every link under the hero. The ones that are pages navigate;
  // the rest open a pop-up.
  hInfo: (d) => {
    if (INFO[d.m]) openModal(INFO[d.m](d));
  },
  contact: () => openModal(INFO.contact()),
});

onChange.hxClass = (el) => {
  setPick(el.value);
  const f = $('#hxFee');
  if (f) f.textContent = feeText(pick);
};
