// Loading indicators.
//
// The look follows the KUCCPS portal: a plain screen with a fast "speeding wheel" (a thin
// ring of two arcs) and "Please wait...", with no logo. Ours has a second, smaller wheel
// inside that turns the other way.
//
// showLoader / hideLoader: the full screen cover, for start-up, opening the sign-in page,
//   signing in and signing out. A smaller line under "Please wait..." says what is happening.
// withLoader: runs some work under the cover and keeps it up for a moment at least, so it
//   reads as a deliberate step rather than a flicker.
// progress: a thin bar that runs across the top of the window when a page changes.
// pageLoader: the wheel in the page area for a moment while a page opens.

import { esc } from './util.js';

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Both elements are made on first use, outside #app, so a redraw never removes them.
function el(id) {
  let e = document.getElementById(id);
  if (!e) {
    e = document.createElement('div');
    e.id = id;
    document.body.appendChild(e);
  }
  return e;
}

const wheel = (cls = '') => `<div class="wheel ${cls}" aria-hidden="true"><span></span><span></span></div>`;

// The cover's inside, also used for the start-up screen before anything else has loaded.
export const loaderHtml = (text) =>
  `<div class="ld">${wheel()}<p>Please wait<span class="ld-dots"><b>.</b><b>.</b><b>.</b></span></p>${text ? `<small>${esc(text)}</small>` : ''}</div>`;

export function showLoader(text) {
  const e = el('loader');
  e.setAttribute('role', 'status');
  e.setAttribute('aria-live', 'polite');
  e.innerHTML = loaderHtml(text);
  e.classList.add('on');
}

// Change the words on a cover that is already showing.
export function loaderText(text) {
  const p = document.querySelector('#loader.on small');
  if (p) p.textContent = text;
}

export function hideLoader() {
  const e = document.getElementById('loader');
  if (e) e.classList.remove('on');
}

export async function withLoader(text, work, min = 700) {
  showLoader(text);
  const start = Date.now();
  try {
    return await work();
  } finally {
    const left = min - (Date.now() - start);
    if (left > 0) await wait(left);
    hideLoader();
  }
}

// The "Login successful" page, shown on the cover between signing in and opening the
// dashboard: a green circle draws itself, a tick follows, then the welcome.
export function showSuccess(title, line2, line3) {
  const e = el('loader');
  e.setAttribute('role', 'status');
  e.setAttribute('aria-live', 'polite');
  e.innerHTML = `<div class="ok">
    <svg class="ok-mark" viewBox="0 0 80 80" aria-hidden="true"><circle class="ok-c" cx="40" cy="40" r="36"/><path class="ok-t" d="M24 41.5 35 52 57 29"/></svg>
    <h2>Login successful</h2>
    <p>${esc(title)}</p>
    ${line2 ? `<small>${esc(line2)}</small>` : ''}
    <span class="ok-go">${esc(line3 || 'Taking you to your dashboard')}</span>
  </div>`;
  e.classList.add('on');
}

export function progress() {
  const e = el('pbar');
  e.classList.remove('run');
  void e.offsetWidth; // restart the animation when pages change quickly
  e.classList.add('run');
}

export const pageLoader = () =>
  `<div class="pl" aria-busy="true">${wheel('sm')}<p>Please wait<span class="ld-dots"><b>.</b><b>.</b><b>.</b></span></p></div>`;
