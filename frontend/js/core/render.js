// Draws the screen: the menu for each role, the page shell and navigation between views.

import { meter } from './charts.js';
import { loaderHtml, pageLoader, progress } from './loader.js';
import { P, bell, line } from './icons.js';
import { A, V, onChange, onInput } from './registry.js';
import { cfg, termLabel } from './school.js';
import { isAdmin, isParent, isTeacher, meName, session, ui } from './state.js';
import { all, get, removeDoc, store } from './store.js';
import { closeModal, closeToast, confirmBox, toast } from './ui.js';
import { $, asDate, esc, fmtDate, iso, phone, today } from './util.js';
import { APP_FULL_NAME } from './config.js';
import { avatar, photoUrl, syncPhoto } from './avatar.js';
import { homeHtml } from '../views/home.js';
import { myThreads } from '../views/messages.js';
import { isPhone, phoneBarColor, phoneEntryHtml } from '../views/mobile.js';
import { visibleNotices } from '../views/notices.js';
import { alignCover, signInHtml } from '../views/signin.js';
import '../views/profile.js';

const NAV = {
  admin: [
    ['', [['dashboard', 'Dashboard']]],
    [
      'People',
      [
        ['learners', 'Learners'],
        ['applications', 'Applications'],
        ['staff', 'Staff'],
        ['classes', 'Classes'],
      ],
    ],
    [
      'Learning',
      [
        ['attendance', 'Attendance'],
        ['assessment', 'Assessment'],
        ['reports', 'Report cards'],
        ['resources', 'Resources'],
        ['timetable', 'Timetable'],
      ],
    ],
    [
      'Money',
      [
        ['fees', 'Fees'],
        ['expenses', 'Expenses'],
      ],
    ],
    [
      'School life',
      [
        ['notices', 'Notices'],
        ['calendar', 'Calendar'],
        ['messages', 'Messages'],
        ['transport', 'Transport'],
        ['library', 'Library'],
      ],
    ],
    ['', [['settings', 'Settings']]],
  ],
  teacher: [
    ['', [['dashboard', 'Today']]],
    [
      'My classes',
      [
        ['learners', 'Learners'],
        ['attendance', 'Attendance'],
        ['assessment', 'Assessment'],
        ['reports', 'Report cards'],
        ['resources', 'Resources'],
        ['homework', 'Homework'],
        ['timetable', 'Timetable'],
      ],
    ],
    [
      'School life',
      [
        ['notices', 'Notices'],
        ['calendar', 'Calendar'],
        ['messages', 'Messages'],
      ],
    ],
  ],
  parent: [
    ['', [['dashboard', 'Home']]],
    [
      'My child',
      [
        ['reports', 'Progress report'],
        ['attendance', 'Attendance'],
        ['fees', 'Fees'],
        ['homework', 'Homework'],
        ['resources', 'Resources'],
        ['timetable', 'Timetable'],
      ],
    ],
    [
      'School life',
      [
        ['notices', 'Notices'],
        ['calendar', 'Calendar'],
        ['messages', 'Messages'],
      ],
    ],
  ],
};

// Pages every role can open from the account menu, though they are not in the side menu.
const ACCOUNT = { profile: 'My profile' };

const viewTitle = () => {
  for (const g of NAV[session.role]) for (const [k, n] of g[1]) if (k === ui.view) return n;
  return ACCOUNT[ui.view] || '';
};

let paintTimer = 0;
let lastScreen = '';
let keepDrop = false;
// Ask for the screen to be redrawn soon. Several calls in a row cause one redraw.
export function schedulePaint() {
  if (!paintTimer)
    paintTimer = setTimeout(() => {
      paintTimer = 0;
      paint();
    }, 30);
}
// Call before paint() when half-typed inputs on the screen should be thrown away.
export function dropKeep() {
  keepDrop = true;
}

// Redraw the whole screen from the current state. Keeps the focused input,
// typed-but-unsaved values (inputs marked data-keep) and the menu scroll position.
export function paint() {
  const app = $('#app');
  if (!store.ready) {
    app.innerHTML = `<div class="loading" role="status">${loaderHtml('Opening the school records')}</div>`;
    return;
  }
  const signedIn = !!session.role;
  if (signedIn) syncPhoto(paint);
  if (signedIn && (!V[ui.view] || (!ACCOUNT[ui.view] && !NAV[session.role].some((g) => g[1].some((x) => x[0] === ui.view)))))
    ui.view = 'dashboard';
  const phoneOut = !signedIn && isPhone();
  const screen = signedIn ? ui.view : phoneOut ? 'phone:' + (ui.splash || 'in') : 'public:' + ui.pub;

  const act = document.activeElement,
    aid = act && act.id && !act.closest('#modal') ? act.id : '';
  let ss, se;
  if (aid) {
    try {
      ss = act.selectionStart;
      se = act.selectionEnd;
    } catch (e) {
      ss = undefined;
    }
  }
  const keep = {},
    navEl = $('.nav'),
    navTop = navEl ? navEl.scrollTop : 0;
  if (lastScreen === screen && !keepDrop)
    app.querySelectorAll('[data-keep]').forEach((el) => {
      if (el.id) keep[el.id] = el.value;
    });
  keepDrop = false;
  lastScreen = screen;

  document.body.classList.toggle('pub', !signedIn);
  // On a phone there is no public site: the opening slides, then sign in (mobile.js).
  if (phoneOut) app.innerHTML = phoneEntryHtml();
  else if (!signedIn) {
    app.innerHTML = ui.pub === 'signin' ? signInHtml() : homeHtml();
  } else app.innerHTML = shellHtml();
  if (!signedIn && !phoneOut && ui.pub === 'signin') alignCover();
  // Android colours its status bar from theme-color. The signed-in app keeps the navy; the phone's
  // slides and sign-in page match whatever is at their top edge.
  const bar = phoneOut ? phoneBarColor() : '#1C3D62',
    meta = document.querySelector('meta[name="theme-color"]');
  if (meta && meta.content !== bar) meta.content = bar;

  if (navTop) {
    const n2 = $('.nav');
    if (n2) n2.scrollTop = navTop;
  }
  Object.keys(keep).forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.value !== keep[id]) el.value = keep[id];
  });
  if (aid) {
    const el = document.getElementById(aid);
    if (el) {
      el.focus({ preventScroll: true });
      try {
        if (ss !== undefined && ss !== null) el.setSelectionRange(ss, se);
      } catch (e) {
        ss = undefined;
      }
    }
  }
}
const NAV_ICON = {
  dashboard: 'grid',
  learners: 'users',
  applications: 'inbox',
  staff: 'badge',
  classes: 'door',
  attendance: 'check',
  assessment: 'clip',
  reports: 'report',
  resources: 'folder',
  timetable: 'clock',
  homework: 'book',
  fees: 'wallet',
  expenses: 'receipt',
  notices: 'megaphone',
  calendar: 'calendar',
  messages: 'chat',
  transport: 'bus',
  library: 'library',
  settings: 'gear',
};

// The colour of each page's icon in the side panel.
const NAV_COLOR = {
  dashboard: '#2B62C4', learners: '#2B62C4', applications: '#7048B8', staff: '#0F8A8A', classes: '#C07A12',
  attendance: '#1B8A5A', assessment: '#7048B8', reports: '#D9534F', resources: '#0F8A8A', timetable: '#C07A12', homework: '#2B62C4',
  fees: '#1B8A5A', expenses: '#D97362', notices: '#E8590C', calendar: '#D9534F', messages: '#2B62C4',
  transport: '#C07A12', library: '#7048B8', settings: '#5B6B82',
};
// Phones get a bottom tab bar with the four pages each role uses most plus "School". Home is
// listed third so it sits in the middle of the five.
const TABBAR = {
  admin: [['learners', 'Learners'], ['attendance', 'Attendance'], ['dashboard', 'Home'], ['fees', 'Fees']],
  teacher: [['attendance', 'Attendance'], ['assessment', 'Assessment'], ['dashboard', 'Today'], ['messages', 'Messages']],
  parent: [['reports', 'Progress'], ['fees', 'Fees'], ['dashboard', 'Home'], ['messages', 'Messages']],
};
const SCHOOL_VIEWS = ['notices', 'calendar', 'messages', 'transport', 'library'];

// The round icon for each menu group on the narrow rail. A group without a heading
// (Dashboard, Settings) uses the icon of its one page.
const GROUP_ICON = { People: 'users', Learning: 'book', Money: 'wallet', 'School life': 'megaphone', 'My classes': 'door', 'My child': 'users' };
// Each rail icon gets its own colour, in this order.
const RAIL_TONES = ['orange', 'blue', 'ink', 'green', 'violet', 'teal'];

// How far the term has gone, for the side menu card.
function termProgress() {
  const c = cfg(),
    t = c.terms[c.term] || {},
    now = today();
  if (!t.s || !t.e) return { pct: 0, text: 'Term dates are not set yet.' };
  const day = 864e5,
    len = Math.max(1, (asDate(t.e) - asDate(t.s)) / day),
    gone = (asDate(now) - asDate(t.s)) / day,
    left = Math.round((asDate(t.e) - asDate(now)) / day);
  if (gone < 0) return { pct: 0, text: 'Opens ' + fmtDate(t.s, { day: 'numeric', month: 'long' }) + '.' };
  if (left < 0)
    return { pct: 100, text: c.nextOpens ? 'Next term opens ' + fmtDate(c.nextOpens, { day: 'numeric', month: 'long' }) + '.' : 'This term has closed.' };
  return {
    pct: Math.round((gone / len) * 100),
    text: left === 0 ? 'Closes today.' : `Closes in ${left} day${left === 1 ? '' : 's'}, on ${fmtDate(t.e, { day: 'numeric', month: 'long' })}.`,
  };
}

// Notices posted in the last week that this person can see.
function freshNotices() {
  const since = iso(new Date(Date.now() - 7 * 864e5));
  return visibleNotices().filter((n) => String(n.date) >= since).length;
}

// The signed-in layout: side menu, top bar, the current view and a footer with the school's contacts.
// The bottom tab bar on phones. The bar has a curved dip under the open tab with that tab's icon
// raised in a circle above it. The whole page is redrawn on every paint, so the last open tab is
// remembered here. go() paints twice, so a slide still running carries on from where it was
// (a negative delay) instead of starting again.
const TB_MS = 520;
let tabLast = -1,
  tabMove = null;
function tabbarParts() {
  const tabs = [...TABBAR[session.role].map(([k, n]) => [k, n, NAV_COLOR[k]]), ['notices', 'School', '#1B715A']];
  const at = tabs.findIndex(([k]) =>
    k === 'notices' ? SCHOOL_VIEWS.includes(ui.view) : ui.view === k && !ui.navOpen && !(k === 'messages' && SCHOOL_VIEWS.includes(ui.view)),
  );
  const now = performance.now();
  if (at >= 0 && tabLast >= 0 && tabLast !== at) tabMove = { from: tabLast, at, t: now };
  tabLast = at;
  const moved = !!tabMove && tabMove.at === at && now - tabMove.t < TB_MS;
  const from = moved ? tabMove.from : at;
  // The tabs sit inside 36px of side padding (mobile.css), so the centres are worked out within it.
  const pos = (n) => `calc(36px + (100% - 72px) * ${(n + 0.5) / tabs.length})`;
  const [k, , c] = tabs[at] || [];
  return {
    tabs,
    at,
    cls: 'tabbar' + (at < 0 ? ' tb-none' : '') + (moved ? ' tb-move' : ''),
    style: at < 0 ? '' : `--x:${pos(at)}; --from:${pos(from)}; --ac:${c}; --tb-ms:${TB_MS}ms; --tb-delay:${moved ? Math.round(tabMove.t - now) : 0}ms`,
    dot: at < 0 ? '' : `<span class="tb-dot" aria-hidden="true">${line(P[k === 'notices' ? 'megaphone' : NAV_ICON[k]] || P.grid, 24)}</span>`,
  };
}
function shellHtml() {
  const c = cfg(),
    unread = myThreads().filter((t) => {
      const last = t.msgs[t.msgs.length - 1] || {};
      return isParent() ? last.who === 'staff' : last.who === 'parent';
    }).length;
  const newApps = all('applications').filter((a) => (a.status || 'New') === 'New').length,
    fresh = freshNotices();
  const tb = tabbarParts();
  const roleName = isAdmin()
    ? 'Administrator'
    : isTeacher()
      ? (get('staff', session.id) || {}).role || 'Teacher'
      : 'Parent or guardian';
  const name = meName() || '',
    initials =
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase() || 'K';
  const hour = new Date().getHours(),
    hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const tp = termProgress(),
    isDash = ui.view === 'dashboard';
  const sub = isDash
    ? (isAdmin() ? 'Welcome back \u{1F44B} · ' : '') +
      fmtDate(today(), { weekday: 'long', day: 'numeric', month: 'long' }) +
      ' · ' +
      termLabel()
    : c.name + ' · ' + termLabel();
  const badge = (n) => (n ? `<span class="dot-n">${n > 9 ? '9+' : n}</span>` : '');
  const where = [c.address, c.county].filter(Boolean).join(', ');
  // The side menu has two parts: a narrow rail with one round icon per group, and a light
  // panel listing every page as a card. The rail icon of the group you are in sits on a tab
  // that runs into the panel. The arrows beside "Today" step through the pages in menu order.
  const groups = NAV[session.role],
    order = groups.flatMap((g) => g[1].map((x) => x[0])),
    at = order.indexOf(ui.view);
  const rail = groups
    .map(([g, items], i) => {
      const label = g || items[0][1],
        icon = g ? GROUP_ICON[g] || 'grid' : NAV_ICON[items[0][0]] || 'grid',
        on = items.some((x) => x[0] === ui.view);
      return `<button class="rail-b${on ? ' on' : ''}" data-act="go" data-v="${items[0][0]}" title="${esc(label)}" aria-label="${esc(label)}"${on ? ' aria-current="true"' : ''}><i class="rt-${RAIL_TONES[i % RAIL_TONES.length]}">${line(P[icon], 19)}</i></button>`;
    })
    .join('');
  const group = groups.find((g) => g[1].some((x) => x[0] === ui.view)) || groups[0];
  const count = (k) => (k === 'messages' && unread ? unread : k === 'applications' && newApps ? newApps : 0);
  const panel = groups
    .map(
      ([g, items]) =>
        `<section class="nav-g">${g ? `<h4>${esc(g)}</h4>` : ''}${items
          .map(
            ([k, n]) =>
              `<button data-act="go" data-v="${k}" ${ui.view === k ? 'aria-current="page"' : ''}><i style="--c:${NAV_COLOR[k] || '#2B62C4'}">${line(P[NAV_ICON[k]] || P.grid, 16)}</i><span>${n}</span>${count(k) ? `<span class="cnt">${count(k)}</span>` : ''}</button>`,
          )
          .join('')}</section>`,
    )
    .join('');
  return `<div class="app ${ui.navOpen ? 'open' : ''}">
      <aside class="side" aria-label="Main menu">
        <div class="rail">
          <span class="rail-logo" title="${esc(c.name)}"><img src="/assets/logo-art.png" alt="" width="30" height="30"></span>
          <nav class="rail-n" aria-label="Menu groups">${rail}</nav>
          <span class="rail-me" title="${esc(name)}">${photoUrl() ? `<img src="${esc(photoUrl())}" alt="">` : esc(initials)}</span>
        </div>
        <div class="pane">
          <div class="pane-h"><b>${esc(c.name)}</b><small>${esc(roleName)}</small></div>
          <div class="pane-t">
            <button class="pane-today" data-act="go" data-v="dashboard">Today</button>
            <button class="pane-ar" data-act="go" data-v="${order[at - 1] || ''}" aria-label="Previous page" ${at > 0 ? '' : 'disabled'}>${line(P.left, 18)}</button>
            <button class="pane-ar" data-act="go" data-v="${order[at + 1] || ''}" aria-label="Next page" ${at >= 0 && at < order.length - 1 ? '' : 'disabled'}>${line(P.right, 18)}</button>
          </div>
          <nav class="nav">${panel}
            <div class="side-card"><b>${esc(termLabel())}</b><span>${esc(tp.text)}</span>${meter(tp.pct, '', tp.pct + '% of the term has passed')}${c.motto ? `<small>“${esc(c.motto)}”</small>` : ''}</div>
          </nav>
        </div>
      </aside>
      <button class="scrim" data-act="nav" aria-label="Close menu"></button>
      <div class="main">${store.online ? '' : '<div class="banner">The school server is not reachable. Changes are paused until it is back.</div>'}
        <header class="top">
          <div class="top-bar">
            <div class="top-bar">
            <button class="ib menu" data-act="nav" aria-label="Open menu">${line(P.menu)}</button>
            ${isParent() ? '<span class="top-sp"></span>' : `<form class="top-q" data-sub="topSearch" role="search"><label class="sr" for="topQ">Search learners</label>${line(P.search, 18)}<input id="topQ" type="search" placeholder="Search for learners by name or admission number…" autocomplete="off"></form>`}
            <span class="user-info" aria-hidden="true">${avatar(name)}<span class="me-t"><b>${esc(name)}</b><small>${esc(roleName)}</small></span><span class="me-hi"><small>${esc(hello)}</small><b>${esc(isAdmin() ? 'School office' : name.split(/\s+/)[0] || name)}</b></span></span>
            <div class="top-i">
              <button class="ib" data-act="go" data-v="notices" aria-label="Notices${fresh ? ', ' + fresh + ' this week' : ''}">${line(P.bellLine)}${badge(fresh)}</button>
              <button class="ib" data-act="go" data-v="messages" aria-label="Messages${unread ? ', ' + unread + ' unread' : ''}">${line(P.mail)}${badge(unread)}</button>
              ${isAdmin() ? `<button class="ib hide-sm" data-act="go" data-v="settings" aria-label="Settings">${line(P.gear)}</button>` : ''}
              <button class="ib more-menu-btn" data-act="moreMenu" aria-label="Account menu">${line(P.more)}</button>
            </div>
          </div>
          </div>
          <nav class="top-tabs" aria-label="${esc(group[0] || viewTitle())}">${group[1]
            .map(
              ([k, n]) =>
                `<button data-act="go" data-v="${k}" ${ui.view === k ? 'aria-current="page"' : ''}>${line(P[NAV_ICON[k]] || P.grid, 17)}<span>${n}</span></button>`,
            )
            .join('')}</nav>
        </header>
        <div class="page-h"><h1>${esc(viewTitle())}</h1><p>${esc(sub)}</p></div>
        <main id="view" data-view="${ui.view}">${ui.pageLoading ? pageLoader() : `<div class="view-in">${V[ui.view]()}</div>`}</main>
        <nav class="${tb.cls}" aria-label="Main" style="${tb.style}"><div class="tb-bg" aria-hidden="true"><b class="tb-l"></b><svg class="tb-notch" viewBox="0 0 110 64" preserveAspectRatio="none"><path d="M0 0C10 0 15 3 19 10C26 26 37 39 55 39C73 39 84 26 91 10C95 3 100 0 110 0V64H0Z"/></svg><b class="tb-r"></b></div>${tb.dot}${tb.tabs
          .map(
            ([k, n, c], i) =>
              `<button data-act="go" data-v="${k}" ${i === tb.at ? 'aria-current="page"' : ''} style="--c:${c}"><i>${line(P[k === 'notices' ? 'megaphone' : NAV_ICON[k]] || P.grid, 22)}${k !== 'notices' && count(k) ? `<em>${count(k)}</em>` : ''}</i><span>${n}</span></button>`,
          )
          .join('')}</nav>
        ${
          ui.navOpen
            ? `<div class="launch-bg" data-act="nav"></div><section class="launch" role="dialog" aria-modal="true" aria-label="All pages">
          <span class="launch-grip" aria-hidden="true"></span>
          <div class="launch-h">${avatar(name)}<div><b>${esc(name)}</b><small>${esc(roleName)} · ${esc(c.name)}</small></div><button class="ib" data-act="nav" aria-label="Close">${line('<path d="M6 6l12 12M18 6 6 18"/>', 20)}</button></div>
          ${groups
            .map(
              ([g, items]) =>
                `<h4>${esc(g || (items[0][0] === 'settings' ? 'School' : 'Start'))}</h4><div class="launch-g">${items
                  .map(
                    ([k, n]) =>
                      `<button data-act="go" data-v="${k}" ${ui.view === k ? 'aria-current="page"' : ''} style="--c:${NAV_COLOR[k] || '#2B62C4'}"><i>${line(P[NAV_ICON[k]] || P.grid, 22)}${count(k) ? `<em>${count(k)}</em>` : ''}</i><span>${n}</span></button>`,
                  )
                  .join('')}</div>`,
            )
            .join('')}
          <div class="launch-term"><div><b>${esc(termLabel())}</b><span>${esc(tp.text)}</span></div>${meter(tp.pct, '', tp.pct + '% of the term has passed')}</div>
          <div class="launch-acts"><button data-act="goAndClose" data-v="profile">${line(P.users, 18)}My profile</button><button class="out" data-act="signOutAndClose">${line(P.out, 18)}Log out</button></div>
        </section>`
            : ''
        }
        <footer class="foot">${c.email ? `<span>${line(P.mail, 18)}${esc(c.email)}</span>` : ''}${c.phone ? `<span>${line(P.phone, 18)}${esc(phone(c.phone))}</span>` : ''}${where ? `<span>${line(P.pin, 18)}${esc(where)}</span>` : ''}</footer>
      </div>
      ${ui.moreMenuOpen ? `<div class="more-menu-bg" data-act="closeMoreMenu"></div><aside class="more-menu" role="dialog" aria-modal="true" aria-label="Account menu">
        <div class="more-menu-h"><button class="ib" data-act="closeMoreMenu" aria-label="Close menu">${line(P.menu)}</button></div>
        <div class="more-menu-brand"><img src="/assets/logo-mark.png" alt="" width="292" height="267"><b>${esc(c.name)}</b></div>
        <nav class="more-menu-body">${[
          ['dashboard', isTeacher() ? 'Today' : 'Home', NAV_ICON.dashboard],
          ['profile', 'My profile', 'users'],
          ...(isAdmin() ? [['settings', 'School settings', 'gear']] : []),
          ['notices', 'Notifications', 'bellLine'],
          ['messages', 'Messages', 'mail'],
        ]
          .map(([k, n, icon]) => `<button class="mm-i" data-act="goAndClose" data-v="${k}"${ui.view === k ? ' aria-current="page"' : ''}>${line(P[icon] || P.grid, 20)}<span>${n}</span>${count(k) ? `<em>${count(k)}</em>` : ''}</button>`)
          .join('')}
          <button class="mm-i mm-out" data-act="signOutAndClose">${line(P.out, 20)}<span>Log out</span></button>
        </nav>
        <div class="more-menu-foot"><img src="/assets/logo-art.png" alt="" width="28" height="28"><span><b>${esc(APP_FULL_NAME)}</b><small>${esc(name)} · ${esc(roleName)}</small></span></div>
      </aside>` : ''}
    </div></div>`;
}
// Switch to another view. The page area shows the loading wheel for a moment, with the bar
// running across the top, then fades in. A quicker second click wins over the first.
let navTick = 0;
export function go(view) {
  ui.view = view;
  ui.q = '';
  ui.reportId = '';
  ui.att = null;
  ui.marks = null;
  ui.navOpen = false;
  ui.moreMenuOpen = false;
  ui.fClass = '';
  ui.drill = false;
  dropKeep();
  progress();
  ui.pageLoading = true;
  const tick = ++navTick;
  paint();
  window.scrollTo(0, 0);
  setTimeout(() => {
    if (tick !== navTick) return;
    ui.pageLoading = false;
    paint();
  }, 380);
}

Object.assign(A, {
  go: (d) => go(d.v),
  nav: () => {
    ui.navOpen = !ui.navOpen;
    paint();
  },
  goAndClose: (d) => {
    go(d.v);
  },
  signOutAndClose: () => {
    ui.moreMenuOpen = false;
    paint();
    A.signOut();
  },
  moreMenu: () => {
    ui.moreMenuOpen = !ui.moreMenuOpen;
    paint();
  },
  closeMoreMenu: () => {
    ui.moreMenuOpen = false;
    paint();
  },
  // The search box in the top bar opens the learner list filtered by what was typed.
  topSearch: () => {
    const q = ($('#topQ') || {}).value || '';
    go('learners');
    if (q.trim()) {
      ui.q = q.trim();
      paint();
    }
  },
  closeModal,
  // The school office sees Attendance, Assessment and Report cards for every class at once.
  // drill opens one class (data-v is its id); an empty data-v goes back to all classes.
  drill: (d) => {
    if (d.v) ui.classId = d.v;
    ui.drill = !!d.v;
    ui.att = null;
    ui.marks = null;
    ui.reportId = '';
    dropKeep();
    paint();
    window.scrollTo(0, 0);
  },
  // The popup message closes from its button.
  toastClose: () => closeToast(),
  tab: (d) => {
    ui.tab[d.g] = d.v;
    ui.q = '';
    dropKeep();
    paint();
  },
  del: (d) =>
    confirmBox('Delete ' + d.n + '?', 'This removes it for everyone.', 'Delete', async () => {
      if (!(await removeDoc(d.c, d.id))) return false;
      toast(d.n.charAt(0).toUpperCase() + d.n.slice(1) + ' deleted', 'success');
    }),
});

Object.assign(onInput, {
  q: (el) => {
    ui.q = el.value;
    paint();
  },
});

Object.assign(onChange, {
  classId: (el) => {
    ui.classId = el.value;
    ui.att = null;
    ui.marks = null;
    ui.reportId = '';
    paint();
  },
  fClass: (el) => {
    ui.fClass = el.value;
    paint();
  },
  kid: (el) => {
    ui.kid = el.value;
    paint();
  },
});

// Close the account menu when someone clicks elsewhere or presses Escape.
document.addEventListener('click', (e) => {
  const m = $('details.me[open]');
  if (m && !m.contains(e.target)) m.open = false;
});
document.addEventListener('keydown', (e) => {
  const m = e.key === 'Escape' && $('details.me[open]');
  if (m) {
    m.open = false;
    m.querySelector('summary').focus();
  }
});
