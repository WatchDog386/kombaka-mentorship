// The public school site on a computer: routing between the home page (home.js) and the
// sign-in page, where families also create an account (signin.js), plus the bits the home page shares. The site is deliberately small: the home
// page carries everything a family needs, with pop-ups for classes, contacts and how to join.
// Phones do not show the public site at all (views/mobile.js).
//
// The whole public site is one screen in this app: ui.pub says which page is showing and
// the browser path says the same thing, so a page can be linked, reloaded and stepped
// back to like any other. The server sends index.html for these paths, so the links work
// even before this script runs.

import { APP_NAME } from '../core/config.js';
import { line } from '../core/icons.js';
import { hideLoader, progress, showLoader, wait } from '../core/loader.js';
import { A } from '../core/registry.js';
import { paint } from '../core/render.js';
import { LEVELS, cfg } from '../core/school.js';
import { ui } from '../core/state.js';
import { get } from '../core/store.js';
import { esc, kes, sum } from '../core/util.js';

// The system logo for the hero: the cap, pen and book straight on the background, with the name
// set as text beside it. logo-art.png is assets/logo.png cropped to the artwork alone, without
// the placeholder wordmark under it (logo-mark.png still has the wordmark).
export const appLogo = () =>
  `<img src="/assets/logo-art.png" alt="" width="236" height="181"><span>${esc(APP_NAME)}</span>`;

// An icon per CBC level, and the class the visitor picked in the home page search bar.
// The home page shares both, so they live here rather than being copied.
export const LEVEL_ICON = {
  pp: line('<rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/><rect x="8" y="3" width="8" height="8" rx="1.5"/>', 24),
  lower: line('<path d="m4 20 1-5L16 4l4 4L9 19z"/><path d="m14 6 4 4"/>', 24),
  upper: line('<path d="M3 5c3-1.5 6-1.5 9 1 3-2.5 6-2.5 9-1v14c-3-1.5-6-1.5-9 1-3-2.5-6-2.5-9-1z"/><path d="M12 6v14"/>', 24),
  junior: line('<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7 15h10"/>', 24),
};
export let pick = ''; // the class chosen in the home page search bar
// An imported binding cannot be assigned to, so the home page changes it through this.
export const setPick = (v) => {
  pick = v || '';
};
export const levelFee = (k) => sum(Object.values(cfg().fees[k] || {}));
export function feeText(classId) {
  const cl = get('classes', classId);
  const v = (cl ? [cl.level] : Object.keys(LEVELS)).map(levelFee).filter((n) => n > 0);
  if (!v.length) return 'Ask the office';
  return (cl ? '' : 'From ') + kes(Math.min(...v));
}
export function classSpan(cls) {
  if (!cls.length) return 'PP1 to Grade 9';
  return cls.length > 1 ? cls[0].name + ' to ' + cls[cls.length - 1].name : cls[0].name;
}

// ---------------------------------------------------------------- routing

const slug = { home: '', signin: 'login' };

// /login -> 'signin'. Unknown paths, including the old /apply, /about, /classes, /notices and
// /contact pages, fall back to the home page.
export const pageFromPath = (path) => {
  const key = String(path || '').replace(/^\/+|\/+$/g, '').split('/')[0];
  if (!key) return 'home';
  const found = Object.keys(slug).find((k) => slug[k] === key);
  return found || 'home';
};
export const pathFor = (name) => '/' + slug[name] + (slug[name] ? '/' : '');

// Show a public page: update the state, put its address in the bar, redraw.
// Opening the sign-in page shows the full loading cover for a moment; other pages run the
// thin bar across the top.
export function goPage(name, { push = true } = {}) {
  const next = name in slug ? name : 'home';
  if (next === 'signin' && ui.pub !== 'signin') {
    showLoader('Opening sign in');
    wait(650).then(hideLoader);
  } else progress();
  ui.pub = next;
  if (push) {
    const path = pathFor(next);
    if (window.location.pathname !== path) window.history.pushState({ pub: next }, '', path);
  }
  paint();
  window.scrollTo(0, 0);
}

// Follow the address bar, for the back and forward buttons.
export function syncRoute() {
  const next = pageFromPath(window.location.pathname);
  if (next === ui.pub) return;
  ui.pub = next;
  paint();
}

Object.assign(A, {
  goPage: (d) => goPage(d.p),
  goHome: () => goPage('home'),
});
