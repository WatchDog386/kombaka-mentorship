// Mwangaza School Manager frontend.

import { getToken, setToken } from './core/api.js';
import { REFRESH_SECONDS } from './core/config.js';
import { A, onChange, onInput } from './core/registry.js';
import { paint, schedulePaint } from './core/render.js';
import { session, setSession, ui } from './core/state.js';
import { loadPublic, loadRecords, onStoreChange, store } from './core/store.js';
import { closeModal, closeToast } from './core/ui.js';
import { $, LS } from './core/util.js';
import { pageFromPath, syncRoute } from './views/public.js';
import { isPhone, startPhone } from './views/mobile.js';
import { joinFromUrl } from './views/messages.js';
import './views/applications.js';
import './views/assessment.js';
import './views/attendance.js';
import './views/calendar.js';
import './views/classes.js';
import './views/dashboard.js';
import './views/expenses.js';
import './views/fees.js';
import './views/home.js';
import './views/homework.js';
import './views/learners.js';
import './views/library.js';
import './views/messages.js';
import './views/notices.js';
import './views/public.js';
import './views/reports.js';
import './views/resources.js';
import './views/settings.js';
import './views/signin.js';
import './views/staff.js';
import './views/timetable.js';
import './views/transport.js';

// Entry point: loads every view, wires the page events and starts the app.
// Always the light colours. Dark mode has gone, so a device that once chose it forgets that.
document.documentElement.dataset.theme = 'light';
LS.del('kengele.theme');
onStoreChange(schedulePaint);

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  // A page link is handled here, so it redraws in place instead of reloading the page.
  // The href stays put, so copying the link, opening it in a new tab and refreshing all work.
  if (el.dataset.act === 'goPage' && !e.button && !e.metaKey && !e.ctrlKey && !e.shiftKey) e.preventDefault();
  const fn = A[el.dataset.act];
  if (fn) fn(el.dataset, el, e);
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-in]');
  if (el && onInput[el.dataset.in]) onInput[el.dataset.in](el);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-ch]');
  if (el && onChange[el.dataset.ch]) onChange[el.dataset.ch](el);
});
// A form with data-sub="<name>" runs A.<name> when submitted, so Enter and password managers work.
document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-sub]');
  if (!f) return;
  e.preventDefault();
  const fn = A[f.dataset.sub];
  if (fn) fn(f.dataset, f, e);
});
// The back and forward buttons move between the public pages.
window.addEventListener('popstate', syncRoute);
document.addEventListener('keydown', (e) => {
  const row = e.target.closest('.mobile-list-row');
  const control = e.target.closest('button,a,input,select,textarea,[contenteditable="true"]');
  if (row && !control && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    row.click();
    return;
  }
  if (e.key === 'Escape') {
    if ($('#toast').innerHTML) closeToast();
    else if ($('#modal').innerHTML) closeModal();
    else if (ui.navOpen) {
      ui.navOpen = false;
      paint();
    }
  }
});

// Fetch fresh records now and then, so two people working at once see each other's changes.
async function refresh() {
  if (!session.role || document.hidden || store.pending) return;
  try {
    setSession(await loadRecords());
  } catch (e) {
    if (e.status === 401) A.signOutNow();
    else {
      store.online = false;
      schedulePaint();
    }
  }
}
setInterval(refresh, REFRESH_SECONDS * 1000);
window.addEventListener('focus', refresh);

async function boot() {
  // The address bar says which public page to show, so a link can be shared or reloaded.
  ui.pub = pageFromPath(window.location.pathname);
  paint();
  if (getToken()) {
    try {
      setSession(await loadRecords());
    } catch (e) {
      setToken(null);
      await loadPublic();
    }
  } else await loadPublic();
  paint();
  // A phone that is not signed in opens like an app: the opening slides, then sign in.
  if (!session.role && isPhone()) startPhone();
  // An invite link in the address bar opens the class group it belongs to, if this
  // signed-in person may be in it (see joinFromUrl).
  if (session.role) await joinFromUrl();
  // A signed-in visitor who opened a public link gets the home page, not the page behind it.
  if (session.role && ui.pub !== 'home' && ui.pub !== 'signin') {
    ui.pub = 'home';
    paint();
  }
}
boot();
// Turning a tablet or resizing the window across the phone width redraws in the right layout.
window.matchMedia('(max-width:760px)').addEventListener('change', () => paint());

// Register the service worker so phones can install Mwangaza as an app (see sw.js).
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
