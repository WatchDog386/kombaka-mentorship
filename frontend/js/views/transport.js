// Transport routes.

import { A, V } from '../core/registry.js';
import { activeLearners } from '../core/school.js';
import { all, get, save } from '../core/store.js';
import { empty, openForm, table, toast } from '../core/ui.js';
import { esc, kes, newId } from '../core/util.js';
import { canEdit } from '../core/widgets.js';

V.transport = () => {
  const rows = all('routes').sort((a, b) => a.name.localeCompare(b.name));
  const tools = `<div class="tools"><span class="grow"></span>${canEdit() ? '<button class="btn primary" data-act="routeForm">Add a route</button>' : ''}</div>`;
  if (!rows.length)
    return (
      tools +
      empty('No transport routes', 'Add a route with its termly charge, then assign learners from their records.')
    );
  return (
    tools +
    table(
      ['Route', 'Stops', 'Vehicle', 'Driver', 'First pick-up', ['Per term', 'num'], ['Learners', 'num'], ''],
      rows.map(
        (r) =>
          `<tr class="mobile-list-row" data-act="routeForm" data-id="${esc(r.id)}" tabindex="0" aria-label="Open transport route ${esc(r.name)}"><td class="mobile-list-primary"><b>${esc(r.name)}</b></td><td class="small">${esc(r.stops)}</td><td>${esc(r.vehicle)}</td><td>${esc(r.driver) || '<span class="muted">Not assigned</span>'}</td><td>${esc(r.pickup)}</td><td class="num">${kes(r.fee)}</td><td class="num">${activeLearners().filter((l) => l.routeId === r.id).length}</td><td class="act">${canEdit() ? `<button class="btn sm" data-act="routeForm" data-id="${esc(r.id)}">Edit</button> <button class="btn sm danger" data-act="del" data-c="routes" data-id="${esc(r.id)}" data-n="${esc(r.name)}">Delete</button>` : ''}</td></tr>`,
      ),
    )
  );
};

function routeForm(r) {
  openForm({
    title: r ? 'Edit route' : 'Add a route',
    values: r || {},
    fields: [
      { k: 'name', l: 'Route name', req: true, full: true },
      { k: 'stops', l: 'Stops', full: true, ph: 'Ruaka, Muchatha, Gathanga' },
      { k: 'vehicle', l: 'Vehicle registration' },
      { k: 'driver', l: 'Driver' },
      { k: 'pickup', l: 'First pick-up time', ph: '6:30 am' },
      { k: 'fee', l: 'Charge per term (KES)', t: 'number', req: true },
    ],
    onSave: async (v) => {
      if (!(await save('routes', { ...(r || {}), ...v, id: r ? r.id : newId('r') }))) return false;
      toast('Route saved', 'success');
    },
  });
}

Object.assign(A, {
  routeForm: (d) => routeForm(d.id ? get('routes', d.id) : null),
});
