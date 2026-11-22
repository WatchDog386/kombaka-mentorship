// Term dates and school events.

import { A, V } from '../core/registry.js';
import { cfg } from '../core/school.js';
import { isAdmin } from '../core/state.js';
import { all, get, save } from '../core/store.js';
import { empty, openForm, toast } from '../core/ui.js';
import { esc, fmtDate, fmtDay, newId, today } from '../core/util.js';
import { canEdit } from '../core/widgets.js';

export function upcoming(n) {
  const t = today();
  return all('events')
    .filter((e) => (e.endDate || e.date) >= t)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, n);
}

export const eventLi = (e) =>
  `<li><span><b>${esc(e.title)}</b>${e.note ? `<br><span class="small muted">${esc(e.note)}</span>` : ''}</span><span class="small muted" style="white-space:nowrap">${fmtDay(e.date)}${e.endDate && e.endDate !== e.date ? ' to ' + fmtDay(e.endDate) : ''}</span></li>`;

V.calendar = () => {
  const c = cfg();
  const list = all('events').sort((a, b) => String(a.date).localeCompare(b.date));
  const terms = [1, 2, 3]
    .map((n) => {
      const t = c.terms[n];
      return `<div style="${+c.term === n ? 'background:var(--soft)' : ''}"><b style="font-size:1.1rem">Term ${n}${+c.term === n ? ', current' : ''}</b><span>${t.s && t.e ? fmtDate(t.s, { day: 'numeric', month: 'short' }) + ' to ' + fmtDate(t.e, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Dates not set'}</span></div>`;
    })
    .join('');
  const tools =
    isAdmin() && canEdit()
      ? `<div class="tools"><span class="grow"></span><button class="btn" data-act="eventForm">Add an event</button><button class="btn primary" data-act="eventForm" data-t="Meeting">Schedule a meeting</button></div>`
      : '';
  const groups = {};
  list.forEach((e) => {
    const k = String(e.date).slice(0, 7);
    (groups[k] = groups[k] || []).push(e);
  });
  const t = today();
  return (
    `<div class="strip three">${terms}</div>` +
    tools +
    (list.length
      ? Object.keys(groups)
          .map(
            (k) =>
              `<section class="panel"><h2>${fmtDate(k + '-01', { month: 'long', year: 'numeric' })}</h2><ul class="list">${groups[k].map((e) => `<li style="${(e.endDate || e.date) < t ? 'opacity:.6' : ''}"><span><b>${esc(e.title)}</b> <span class="chip">${esc(e.type)}</span>${e.note ? `<br><span class="small muted">${esc(e.note)}</span>` : ''}</span><span style="white-space:nowrap;text-align:right"><span class="small muted">${fmtDay(e.date)}${e.endDate && e.endDate !== e.date ? ' to ' + fmtDay(e.endDate) : ''}</span>${isAdmin() && canEdit() ? `<br><button class="btn sm" data-act="eventForm" data-id="${esc(e.id)}">Edit</button> <button class="btn sm danger" data-act="del" data-c="events" data-id="${esc(e.id)}" data-n="this event">Delete</button>` : ''}</span></li>`).join('')}</ul></section>`,
          )
          .join('')
      : empty('Nothing on the calendar', 'Add opening and closing days, meetings, assessments and holidays.'))
  );
};

// Meetings and other events. When the office adds one it can also post it as a notice, so the
// staff or parents it concerns hear about it on their phones.
function eventForm(e, type) {
  const meeting = !e && type === 'Meeting';
  openForm({
    title: e ? 'Edit event' : meeting ? 'Schedule a meeting' : 'Add an event',
    values: e || { date: today(), type: type || 'Event', notify: meeting ? 'Teachers' : '' },
    fields: [
      { k: 'title', l: 'Event', req: true, full: true },
      { k: 'date', l: 'Date', t: 'date', req: true },
      { k: 'endDate', l: 'End date', t: 'date' },
      { k: 'type', l: 'Type', t: 'select', o: ['Academic', 'Assessment', 'Meeting', 'Holiday', 'Sports', 'Event'] },
      { k: 'note', l: 'Details, such as the time and place', full: true },
      ...(e
        ? []
        : [
            {
              k: 'notify',
              l: 'Also post it as a notice to',
              t: 'select',
              full: true,
              o: [
                ['', 'Nobody, the calendar is enough'],
                ['Teachers', 'Teachers'],
                ['Parents', 'Parents and guardians'],
                ['All', 'Everyone'],
              ],
            },
          ]),
    ],
    onSave: async (v) => {
      const { notify, ...ev } = v;
      if (!(await save('events', { ...(e || {}), ...ev, id: e ? e.id : newId('e') }))) return false;
      if (notify) {
        const when = fmtDate(ev.date, { weekday: 'long', day: 'numeric', month: 'long' }) + (ev.endDate && ev.endDate !== ev.date ? ' to ' + fmtDate(ev.endDate, { weekday: 'long', day: 'numeric', month: 'long' }) : '');
        const ok = await save('notices', {
          id: newId('n'),
          date: today(),
          title: ev.title,
          body: `${ev.type === 'Meeting' ? 'Meeting' : ev.type} on ${when}.${ev.note ? '\n' + ev.note : ''}`,
          audience: notify,
          by: (all('staff').find((s) => s.role === 'Head teacher') || {}).name || 'School office',
          pinned: false,
        });
        return void toast(ok ? `${ev.type === 'Meeting' ? 'Meeting' : 'Event'} saved and posted as a notice` : 'Event saved, but the notice could not be posted', ok ? 'success' : 'error');
      }
      toast(ev.type === 'Meeting' ? 'Meeting saved' : 'Event saved', 'success');
    },
  });
}

Object.assign(A, {
  eventForm: (d) => eventForm(d.id ? get('events', d.id) : null, d.t),
});
