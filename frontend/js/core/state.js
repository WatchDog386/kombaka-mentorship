// Who is signed in and what the screen is showing.

import { activeLearners, classesSorted, staffName } from './school.js';
import { normPhone, today } from './util.js';

// Who is signed in. role is '' when nobody is.
// id is the staff id for a teacher, the guardian phone number for a parent, 'office' for the school office.
export const session = { role: '', id: '', name: '', login: '', photoAt: '', since: '' };
export function setSession(user) {
  Object.assign(
    session,
    user
      ? { role: user.role, id: user.id, name: user.name, login: user.login, photoAt: user.photoAt || '', since: user.since || '' }
      : { role: '', id: '', name: '', login: '', photoAt: '', since: '' },
  );
}

// What the screen is showing right now.
export const ui = {
  pub: 'home',
  calOff: 0, // months before (-) or after (+) this one on the dashboard calendar
  authMode: 'in', // the sign-in page form: 'in' to sign in, 'up' to create an account
  view: 'dashboard',
  q: '',
  navOpen: false,
  moreMenuOpen: false,
  loginError: '',
  tab: {},
  classId: '',
  fClass: '',
  date: today(),
  area: '',
  kid: '',
  reportId: '',
  thread: '',
  mine: false,
  att: null,
  marks: null,
};
export const isAdmin = () => session.role === 'admin';
export const isTeacher = () => session.role === 'teacher';
export const isParent = () => session.role === 'parent';

export const isStaff = () => isAdmin() || isTeacher();

export const myKids = () =>
  isParent()
    ? activeLearners()
        .filter((l) => normPhone(l.guardianPhone) === session.id)
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

export const myClass = () => (isTeacher() ? classesSorted().find((c) => c.teacherId === session.id) : null);

export const kid = () => {
  const ks = myKids();
  return ks.find((k) => k.id === ui.kid) || ks[0];
};

export const meName = () =>
  isAdmin() ? 'School office' : isTeacher() ? staffName(session.id) || session.name : session.name;

export function pickClass() {
  const list = classesSorted();
  if (isParent()) return (kid() || {}).classId || '';
  if (list.find((c) => c.id === ui.classId)) return ui.classId;
  const mc = myClass();
  ui.classId = (mc || list[0] || {}).id || '';
  return ui.classId;
}
