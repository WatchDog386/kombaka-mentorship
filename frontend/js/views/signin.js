// Sign in, create an account, sign out and passwords. Creating an account also sends the
// child's admission application. A dark cover slides across the card to switch between the two forms.

import { api, setToken } from '../core/api.js';
import { forgetPhoto } from '../core/avatar.js';
import { APP_FULL_NAME } from '../core/config.js';
import { line } from '../core/icons.js';
import { hideLoader, loaderText, showLoader, showSuccess, wait, withLoader } from '../core/loader.js';
import { A } from '../core/registry.js';
import { isPhone } from './mobile.js';
import { goPage, pick, setPick } from './public.js';
import { dropKeep, go, paint } from '../core/render.js';
import { LEVELS, cfg, classesSorted } from '../core/school.js';
import { setSession, ui } from '../core/state.js';
import { get, loadPublic, loadRecords, store } from '../core/store.js';
import { closeModal, confirmBox, toast } from '../core/ui.js';
import { $, esc, phone } from '../core/util.js';

const I = {
  user: line('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', 18),
  lock: line('<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>', 18),
  eye: line('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', 18),
  eyeOff: line(
    '<path d="m3 3 18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    18,
  ),
  child: line('<circle cx="12" cy="12" r="9"/><path d="M8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>', 18),
  cap: line('<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/>', 18),
  phone: line('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>', 18),
  note: line('<path d="M4 5h16v11H8l-4 4z"/>', 18),
  office: line('<path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-5h6v5M9 11h.01M15 11h.01"/>', 18),
  teacher: line('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="m7 20 3-4M17 20l-3-4M7 8h6M7 11h4"/>', 18),
  family: line('<circle cx="9" cy="7" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0M15 20a4.5 4.5 0 0 1 6.5-4"/>', 18),
  back: line('<path d="M19 12H5M11 18l-6-6 6-6"/>', 18),
};
const roleIcon = (r) => (/office/i.test(r) ? I.office : /teacher/i.test(r) ? I.teacher : I.family);

// One input with an icon inside it. Screen readers read the label; the placeholder shows it on screen.
// The tone names the icon colour, set in signin.css as .au-field > i.
const field = (icon, label, control, tone = '') =>
  `<label class="au-field"><span class="sr">${label}</span><i class="${tone}">${icon}</i>${control}</label>`;

// The create-account form: a parent account and the child's admission application in one go.
// sel is a class id to start on, used when the visitor picked a class on the home page.
function registerFormHtml({ classes, sel = '', inert = false }) {
  const opts = classes.map(([v, l]) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(l)}</option>`);
  return `<form class="auth-form auth-up" id="rgForm" data-sub="register" novalidate ${inert ? 'inert' : ''}>
          <h2>Create an account</h2>
          <p class="au-cap">Sign up and apply for your child. The school office will call you.</p>
          <div class="au-fields">
            ${field(I.user, 'Your name, as parent or guardian', '<input id="rgParent" data-keep autocomplete="name" placeholder="Your name, as parent or guardian">', 't-green')}
            ${field(I.phone, 'Phone number', '<input id="rgPhone" data-keep type="tel" inputmode="tel" autocomplete="tel" placeholder="Phone number, like 0712 345 678">', 't-amber')}
            ${field(I.lock, 'Choose a password', '<input id="rgPass" type="password" autocomplete="new-password" placeholder="Choose a password (6 or more characters)">', 't-coral')}
            ${field(I.child, 'Child’s full name', '<input id="rgChild" data-keep autocomplete="off" placeholder="Child’s full name">', 't-purple')}
            ${field(I.cap, 'Class applying for', `<select id="rgClass" data-keep required><option value="">Class applying for</option>${opts.join('')}</select>`, 't-blue')}
          </div>
          <p class="err" id="rgErr" role="alert"></p>
          <button class="au-btn" type="submit">Create account</button>
        </form>`;
}

export function signInHtml() {
  const c = cfg(),
    has = !!get('config', 'school'),
    name = has ? c.name : APP_FULL_NAME,
    up = ui.authMode === 'up',
    cls = classesSorted();
  // The logo is the way back to the home page.
  const logo = `<button type="button" class="au-logo" data-act="home" aria-label="Go to the ${esc(name)} home page"><img src="/assets/logo.png" alt="${esc(name)}"></button>`;
  const classes = cls.length ? cls.map((x) => [x.id, x.name]) : Object.values(LEVELS).map((n) => [n, n]);
  return `<div class="auth-page">
    <button type="button" class="au-back" data-act="home" title="Go to the school home page">${I.back}<span>Back to home</span></button>
    <svg class="au-shape au-tri" viewBox="0 0 100 100" aria-hidden="true"><polygon points="18,14 92,28 58,88"/></svg><span class="au-shape au-dot" aria-hidden="true"></span>
    ${c.phone ? `<p class="au-bar">Need help? Call <a href="tel:${esc(String(c.phone).replace(/\s+/g, ''))}">${esc(phone(c.phone))}</a></p>` : ''}
    <div class="auth${up ? ' up' : ''}">
      <div class="auth-forms">
        <form class="auth-form auth-in" data-sub="signIn" novalidate ${up ? 'inert' : ''}>
          <h2>Sign in</h2>
          ${
            store.demo.length
              ? `<p class="au-cap">Try a demo account</p><div class="au-demo">${store.demo.map((d, i) => `<button type="button" class="au-pill" data-act="demoFill" data-i="${i}" title="${esc(d.login)} with password ${esc(d.password)}"><i>${roleIcon(d.role)}</i>${esc(d.role.split(',')[0])}</button>`).join('')}</div><p class="au-cap">or use your phone number:</p>`
              : '<p class="au-cap">For the school office, teachers and parents.</p>'
          }
          <div class="au-fields">
            ${field(I.user, 'Phone number or username', '<input id="liUser" data-keep autocomplete="username" placeholder="Phone number or username">', 't-green')}
            ${field(I.lock, 'Password', `<input id="liPass" data-keep type="password" autocomplete="current-password" placeholder="Password"><button type="button" class="au-eye" data-act="pwShow" aria-label="Show password" aria-pressed="false">${I.eye}</button>`, 't-amber')}
          </div>
          <p class="err" id="liErr" role="alert">${esc(ui.loginError)}</p>
          <button class="au-btn" type="submit">Sign in</button>
          <p class="au-hint">Forgot your password? Ask the school office to reset it.</p>
        </form>
        ${registerFormHtml({ classes, sel: pick, inert: !up })}
      </div>
      <div class="auth-cover"><div class="auth-cover-in">
        <div class="auth-pane auth-pane-l" ${up ? '' : 'inert'}>${logo}
          <h2>Welcome back!</h2><p>Parents and teachers of ${esc(name)} sign in with the phone number the school has on record.</p>
          <button class="au-ghost" data-act="authMode" data-mode="in">Sign in</button></div>
        <div class="auth-pane auth-pane-r" ${up ? 'inert' : ''}>${logo}
          <h2>New to the school?</h2><p>Create an account and apply for your child’s admission. The office calls you to arrange a visit.</p>
          <button class="au-ghost" data-act="authMode" data-mode="up">Create account</button></div>
      </div></div>
    </div></div>`;
}

// Line each cover button up with the form button beside it: "Create account" with "Sign in",
// and "Sign in" with the form's "Create account". Only the buttons move; the text stays centred.
export function alignCover() {
  const card = $('.auth');
  if (!card) return;
  const top = card.getBoundingClientRect().top;
  const at = (s) => Math.round($(s).getBoundingClientRect().top - top) + 'px';
  card.style.setProperty('--au-btn-in', at('.auth-in .au-btn'));
  card.style.setProperty('--au-btn-up', at('.auth-up .au-btn'));
}
window.addEventListener('resize', alignCover);
if (document.fonts) document.fonts.addEventListener('loadingdone', alignCover);

// Switch between the two forms. Classes and attributes change in place so the slide can animate.
function authMode(d) {
  const up = d.mode === 'up',
    box = $('.auth');
  ui.authMode = up ? 'up' : 'in';
  if (!box) return;
  box.classList.toggle('up', up);
  $('.auth-in').inert = up;
  $('.auth-up').inert = !up;
  $('.auth-pane-l').inert = !up;
  $('.auth-pane-r').inert = up;
  if (box.getBoundingClientRect().top < 0) box.scrollIntoView({ block: 'start' });
  const first = $(up ? '#rgParent' : '#liUser');
  if (first) first.focus({ preventScroll: true });
}

// Signing in runs in three steps on the full screen cover: the wheel while the details are
// checked and the records load, the "Login successful" page, then the wheel again while
// the dashboard opens. send() makes the request; heading() words the success page.
async function enter(checking, send, heading) {
  showLoader(checking);
  const start = Date.now();
  const r = await send();
  setToken(r.token);
  setSession(r.user);
  loaderText('Loading your school records');
  await loadRecords();
  ui.classId = '';
  ui.kid = '';
  await wait(Math.max(0, 800 - (Date.now() - start)));
  showLoader('Opening your dashboard');
  await wait(700);
  go('dashboard');
  hideLoader();
}

async function register() {
  const v = {
    parent: $('#rgParent').value.trim(),
    phone: $('#rgPhone').value.trim(),
    password: $('#rgPass').value,
    child: $('#rgChild').value.trim(),
    classId: $('#rgClass').value,
  };
  const err = $('#rgErr');
  const problem =
    [
      [!v.parent, '#rgParent', 'Enter your name.'],
      [!v.phone, '#rgPhone', 'Enter your phone number.'],
      [v.password.length < 6, '#rgPass', 'Choose a password with at least 6 characters.'],
      [!v.child, '#rgChild', 'Enter your child’s name.'],
      [!v.classId, '#rgClass', 'Choose the class you are applying for.'],
    ].find(([bad]) => bad);
  if (problem) {
    err.textContent = problem[2];
    alignCover();
    $(problem[1]).focus();
    return;
  }
  err.textContent = '';
  try {
    await enter('Creating your account', () => api.post('/auth/register', v), (u, first) => `Welcome, ${first}`);
    setPick('');
  } catch (e) {
    setToken(null);
    setSession(null);
    hideLoader();
    err.textContent = e.message;
    alignCover();
    if (!isPhone()) toast(e.message, 'error');
  }
}

async function signIn() {
  const login = $('#liUser').value.trim(),
    password = $('#liPass').value;
  if (!login || !password) {
    ui.loginError = 'Enter your phone number or username, and your password.';
    paint();
    // On a phone the message under the form is enough; a pop-up as well would crowd the screen.
    return isPhone() || toast(ui.loginError, 'warn');
  }
  ui.loginError = '';
  try {
    await enter(
      'Checking your details',
      () => api.post('/auth/login', { login, password }),
      (u, first) => (u.role === 'admin' ? 'Welcome back to the school office' : `Welcome back, ${first}`),
    );
  } catch (e) {
    setToken(null);
    setSession(null);
    ui.loginError = e.message;
    hideLoader();
    paint();
    if (!isPhone()) toast(e.message, 'error');
  }
}
async function signOut() {
  forgetPhoto();
  setToken(null);
  setSession(null);
  ui.navOpen = false;
  ui.pub = 'signin';
  ui.authMode = 'in';
  ui.loginError = '';
  closeModal();
  dropKeep();
  await withLoader('Signing you out', async () => {
    await loadPublic();
    paint();
  });
  window.scrollTo(0, 0);
}
Object.assign(A, {
  portal: () => {
    ui.pub = 'signin';
    ui.authMode = 'in';
    ui.loginError = '';
    dropKeep();
    paint();
    window.scrollTo(0, 0);
  },
  home: () => {
    ui.pub = 'home';
    paint();
    window.scrollTo(0, 0);
  },
  signIn,
  // The Sign out item asks first. signOutNow is for the app itself, when a login has expired.
  signOut: () => confirmBox('Are you sure you want to log out?', '', 'Log out', signOut, 'out', { icon: false }),
  signOutNow: signOut,
  authMode,
  register,
  // "Get started" and the other Create account buttons: the sign-in page, on the create-account form.
  getStarted: () => {
    ui.authMode = 'up';
    ui.loginError = '';
    closeModal();
    dropKeep();
    goPage('signin');
  },
  pwShow: (d, el) => {
    const input = $('#liPass'),
      show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    el.setAttribute('aria-pressed', String(show));
    el.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    el.innerHTML = show ? I.eyeOff : I.eye;
  },
  demoFill: (d) => {
    const a = store.demo[+d.i];
    if (a) {
      $('#liUser').value = a.login;
      $('#liPass').value = a.password;
    }
  },
  resetPassword: (d) =>
    confirmBox(
      'Reset this password?',
      `The account for ${phone(d.login)} goes back to the default password.`,
      'Reset password',
      async () => {
        try {
          const r = await api.post('/auth/reset', { login: d.login });
          toast(`Password reset. ${phone(r.login)} now signs in with ${r.password}`, 'success');
        } catch (e) {
          toast(e.message, 'error');
        }
      },
    ),
});
