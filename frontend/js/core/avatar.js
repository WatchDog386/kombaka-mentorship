// The signed-in person's profile picture, shown wherever their initials used to be.
//
// The account only carries a stamp (session.photoAt) saying which picture is current; the picture
// itself comes from GET /api/auth/photo when that stamp changes. A copy is kept on this device,
// under the person's login, so it shows straight away on the next visit and is not fetched on
// every 30-second refresh. Signing out forgets it.

import { api } from './api.js';
import { session } from './state.js';
import { LS, esc } from './util.js';

const KEY = 'kengele:photo';
let held = LS.get(KEY) || {}; // { login, at, url }
let asking = '';

export const initialsOf = (name) =>
  (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'K';

function keep(at, url) {
  held = at ? { login: session.login, at, url } : {};
  if (at) LS.set(KEY, held);
  else LS.del(KEY);
}

// The picture for the person signed in now, or '' when they have none (or it is still coming).
export const photoUrl = () => (session.role && held.login === session.login && held.at === session.photoAt ? held.url || '' : '');

// Run on every paint. Fetches the picture when the stamp has moved on, then repaints.
export function syncPhoto(repaint) {
  if (!session.role) return;
  const at = session.photoAt || '';
  if (!at) {
    if (held.login === session.login && held.at) keep('', '');
    return;
  }
  if ((held.login === session.login && held.at === at) || asking === at) return;
  asking = at;
  api
    .get('/auth/photo')
    .then((r) => {
      keep(r.photoAt, r.photo);
      repaint();
    })
    .catch(() => {})
    .finally(() => {
      asking = '';
    });
}

// After the person changes or removes their picture on the profile page.
export function setPhoto(at, url) {
  session.photoAt = at;
  keep(at, url);
}

export const forgetPhoto = () => keep('', '');

// A round avatar: the picture when there is one, otherwise the initials. `cls` sets its size.
export const avatar = (name, cls = 'av') => {
  const url = photoUrl();
  return url ? `<span class="${cls} has-photo"><img src="${esc(url)}" alt=""></span>` : `<span class="${cls}">${esc(initialsOf(name))}</span>`;
};
