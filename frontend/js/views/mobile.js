// What a phone shows before anyone signs in. On a phone Mwangaza behaves like an installed app
// rather than a website: no public home page. It opens on three slides (the school, then what
// the app does), then a plain sign-in page that says "Welcome back".
// Signing in uses the same form ids and A.signIn as the desktop page, and the server works out
// from the login whether this is the school office, a teacher or a parent.

import { APP_FULL_NAME } from '../core/config.js';
import { line } from '../core/icons.js';
import { A } from '../core/registry.js';
import { paint } from '../core/render.js';
import { cfg, classesSorted } from '../core/school.js';
import { ui } from '../core/state.js';
import { get } from '../core/store.js';
import { openModal } from '../core/ui.js';
import { LS, esc, phone } from '../core/util.js';
import { classSpan } from './public.js';

// Phones are the same width at which mobile.css changes the layout.
const PHONE = window.matchMedia('(max-width:760px)');
export const isPhone = () => PHONE.matches;

const SEEN = 'kengele.onboarded';
const schoolName = () => (get('config', 'school') ? cfg().name : APP_FULL_NAME);

// Installing the app. Android's browser offers the install itself (beforeinstallprompt): the event is
// kept, and the Install button opens that prompt. An iPhone has no such prompt, so there the button
// explains Add to Home Screen. The button only shows where one of the two works and the app is not
// already running installed. It is toggled in place rather than repainted, so no entrance replays.
let installEvt = null;
const installed = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const canInstall = () => !installed() && (!!installEvt || isIOS());
const syncInstall = () => document.querySelectorAll('.app-inst').forEach((b) => (b.hidden = !canInstall()));
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvt = e;
  syncInstall();
});
window.addEventListener('appinstalled', () => {
  installEvt = null;
  syncInstall();
});
const installBtn = () =>
  `<button class="app-inst" data-act="appInstall"${canInstall() ? '' : ' hidden'}>${line('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>', 18)}Install the app on this phone</button>`;

function iosSteps() {
  const share = line('<path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5v10h14V11h-1"/>', 18),
    plus = line('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/>', 18);
  return `<h2>Install on your iPhone</h2><p class="muted" style="margin:-.4rem 0 1rem">Open this page in Safari, then:</p>
    <ol class="inst-steps"><li><i>${share}</i><span>Tap the <b>Share</b> button in Safari's toolbar.</span></li>
      <li><i>${plus}</i><span>Scroll down and tap <b>Add to Home Screen</b>.</span></li>
      <li><i>${line('<path d="m5 12 5 5 9-10"/>', 18)}</i><span>Tap <b>Add</b>. ${esc(schoolName())} is now on your home screen.</span></li></ol>
    <div class="actions"><button class="ml-btn inst-ok" data-act="closeModal">Got it</button></div>`;
}

// Each slide is a coloured panel cut on a slant, with the students from the home page in it,
// over a tag, a headline, a short line and a sentence. `bp`/`bs` place the photo: the first
// slide shows both students, the others close in on one each. The first slide is the school.
const SLIDES = [
  { c: '#1B715A', bp: '50% 0', bs: 'cover' },
  {
    c: '#2B62C4', bp: '6% 0', bs: 'auto 150%', tag: 'Attendance', title: 'Every school day in your pocket',
    sub: 'Registers marked each morning', text: 'Class teachers mark the register before lessons start, and parents see attendance the same day.',
  },
  {
    c: '#E8590C', bp: '94% 0', bs: 'auto 150%', tag: 'Results and fees', title: 'Reports, fees and messages',
    sub: 'The whole term in one place', text: 'Report cards for every learning area, fee statements with M-Pesa Pay Bill steps, and a direct line to the class teacher.',
  },
];
function slide(i) {
  if (i) return SLIDES[i];
  const c = cfg();
  return {
    ...SLIDES[0],
    tag: c.county ? 'CBC school, ' + c.county : 'CBC school',
    title: schoolName(),
    sub: c.motto || 'Learners from ' + classSpan(classesSorted()),
    text: 'Attendance, results, fees and school news for parents, teachers and the school office.',
  };
}

// Start-up on a phone: the slides, from the first. Get started, on any slide, opens sign in.
export function startPhone() {
  ui.splash = 'onboard';
  ui.obi = 0;
  paint();
}

function onboardHtml() {
  const i = ui.obi || 0,
    s = slide(i);
  // The clip path is in fractions of the panel, so the slant and the rounded corner keep their place on any phone.
  return `<div class="ob" style="--c:${s.c}; --bp:${s.bp}; --bs:${s.bs}">
    <svg width="0" height="0" aria-hidden="true" style="position:absolute"><clipPath id="obCut" clipPathUnits="objectBoundingBox"><path d="M0 0H1V.73L.86 .865Q.79 .935 .7 .875L0 .4Z"/></clipPath></svg>
    <div class="ob-art" aria-hidden="true"><span class="ob-pic"></span></div>
    <div class="ob-text" aria-live="polite">
      <span class="ob-tag">${esc(s.tag)}</span>
      <h2>${esc(s.title)}</h2>
      <p class="ob-sub">${esc(s.sub)}</p>
      <p class="ob-p">${esc(s.text)}</p>
    </div>
    <button class="ml-btn ob-go" data-act="obDone">Get started</button>
    ${installBtn()}
    <div class="ob-dots">${SLIDES.map((x, n) => `<button class="${n === i ? 'on' : ''}" data-act="obGo" data-v="${n}" aria-label="Slide ${n + 1} of ${SLIDES.length}"${n === i ? ' aria-current="true"' : ''}></button>`).join('')}</div>
  </div>`;
}

function signInHtml() {
  const c = cfg();
  return `<div class="ml">
    <div class="ml-head">
      <img class="ml-logo" src="/assets/logo-mark.png" alt="${esc(schoolName())}" width="292" height="267">
      <h1>Welcome back</h1>
      <p class="ml-sub">Sign in with the phone number or username the school has on record.</p>
    </div>
    <form class="ml-form" data-sub="signIn" novalidate>
      <label class="ml-f"><span>Phone number or username</span>
        <span class="ml-in">${line('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', 19)}<input id="liUser" data-keep autocomplete="username" inputmode="text" placeholder="0712 345 678"></span></label>
      <label class="ml-f"><span>Password</span>
        <span class="ml-in">${line('<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>', 19)}<input id="liPass" data-keep type="password" autocomplete="current-password" placeholder="Your password"><button type="button" class="au-eye" data-act="pwShow" aria-label="Show password" aria-pressed="false">${line('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', 19)}</button></span></label>
      <p class="err" id="liErr" role="alert">${esc(ui.loginError)}</p>
      <button class="ml-btn" type="submit">Sign in</button>
    </form>
    ${installBtn()}
    <p class="ml-help">Forgot your password? Ask the school office to reset it.${c.phone ? `<br><a href="tel:${esc(String(c.phone).replace(/\s+/g, ''))}">Call ${esc(phone(c.phone))}</a>` : ''}</p>
  </div>`;
}

// The whole signed-out screen on a phone.
// The colour for the phone's status bar on these screens, so the page seems to run up behind it:
// the slide's colour above the photo panel, and the sign-in page's own background.
export const phoneBarColor = () => (ui.splash === 'onboard' ? SLIDES[ui.obi || 0].c : '#FAFAFB');

export const phoneEntryHtml = () => (ui.splash === 'onboard' ? onboardHtml() : signInHtml());

function done() {
  try {
    LS.set(SEEN, 1);
  } catch (e) {
    /* private browsing: the slides show again next time */
  }
  ui.splash = '';
  paint();
}

Object.assign(A, {
  obNext: () => {
    ui.obi = Math.min((ui.obi || 0) + 1, SLIDES.length - 1);
    paint();
  },
  obGo: (d) => {
    ui.obi = Math.max(0, Math.min(+d.v || 0, SLIDES.length - 1));
    paint();
  },
  obDone: done,
  appInstall: async () => {
    if (!installEvt) return openModal(iosSteps());
    const e = installEvt;
    installEvt = null;
    e.prompt();
    await e.userChoice.catch(() => null);
    syncInstall();
  },
});

// Swiping left or right moves between the slides.
let x0 = null;
document.addEventListener('touchstart', (e) => {
  x0 = e.target.closest('.ob') ? e.touches[0].clientX : null;
}, { passive: true });
document.addEventListener('touchend', (e) => {
  if (x0 === null || ui.splash !== 'onboard') return;
  const dx = e.changedTouches[0].clientX - x0;
  x0 = null;
  if (Math.abs(dx) < 50) return;
  if (dx < 0) {
    if ((ui.obi || 0) < SLIDES.length - 1) A.obNext();
    else done();
  } else if (ui.obi > 0) {
    ui.obi--;
    paint();
  }
}, { passive: true });
