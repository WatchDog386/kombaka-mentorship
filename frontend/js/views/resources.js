// Teaching material: modules, notes, past papers and worksheets, filed under a class and a
// learning area. Staff can add and remove material for their own class; the school office can
// do it for any class. A parent sees only their own child's class, and can open or download
// what is there to help at home. The bytes are served by /api/files; this page only labels them.

import { A, V, onChange } from '../core/registry.js';
import { paint } from '../core/render.js';
import { areasFor, className, classesSorted } from '../core/school.js';
import { isAdmin, isParent, isStaff, isTeacher, kid, myClass, pickClass, ui } from '../core/state.js';
import { api } from '../core/api.js';
import { all, get, putLocal, removeDocLocal } from '../core/store.js';
import { confirmBox, empty, openModal, toast } from '../core/ui.js';
import { $, esc, fmtDate } from '../core/util.js';
import { canEdit, kidPicker, noKid } from '../core/widgets.js';

// A readable size, so a parent on a phone can tell a 2 MB workbook from a 90 KB note.
const sizeOf = (bytes) => {
  const b = +bytes || 0;
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return Math.round(b / 1024) + ' KB';
  return (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB';
};

const LABEL = {
  pdf: 'PDF',
  doc: 'Word',
  docx: 'Word',
  word: 'Word',
  xls: 'Sheet',
  xlsx: 'Sheet',
  ppt: 'Slides',
  pptx: 'Slides',
  odt: 'Document',
  ods: 'Sheet',
  txt: 'Text',
  image: 'Image',
  file: 'File',
};

// The classes this person may look at.
function myClasses() {
  if (isParent()) return [get('classes', (kid() || {}).classId)].filter(Boolean);
  if (isTeacher() && !ui.allRes) {
    const mc = myClass();
    return mc ? [mc] : [];
  }
  return classesSorted();
}

// The learning areas offered for a class, plus anything already filed under it that is not
// on the curriculum list (a school that adds its own).
function areasOf(cls, filed) {
  const list = [...new Set([...areasFor(cls), ...filed])].filter(Boolean).sort();
  return list;
}

function fileCard(r, mayEdit) {
  const label = LABEL[r.kind] || 'File';
  return `<article class="res-card">
    <span class="res-ico res-${esc(r.kind)}" aria-hidden="true">${esc(label)}</span>
    <span class="res-m">
      <b>${esc(r.title)}</b>
      <span class="res-meta">${esc(r.fileName)} \u00b7 ${sizeOf(r.size)} \u00b7 ${esc(r.by)}${r.date ? ', ' + esc(fmtDate(r.date)) : ''}</span>
    </span>
    <span class="res-a">
      <button class="btn sm" data-act="resOpen" data-id="${esc(r.id)}">Open</button>
      ${mayEdit ? `<button class="btn sm danger" data-act="resDel" data-id="${esc(r.id)}" data-n="${esc(r.title)}">Delete</button>` : ''}
    </span>
  </article>`;
}

V.resources = () => {
  if (isParent() && !kid()) return noKid();

  const cls = pickClass();
  const allowed = myClasses();
  const classList = allowed.map((c) => c.id);
  // The server has already dropped anything not meant for this person; filtering by the
  // classes chosen here is what the pickers above control.
  let list = all('resources').filter((r) => classList.includes(r.classId));
  if (ui.resArea) list = list.filter((r) => r.area === ui.resArea);

  const target = get('classes', cls);
  const mayEdit = canEdit() && (isAdmin() || (isTeacher() && allowed.some((c) => c.id === cls)));
  const areas = target ? areasOf(target, all('resources').filter((r) => r.classId === cls).map((r) => r.area)) : [];
  const filed = all('resources').filter((r) => r.classId === cls).length;

  // A teacher with one class has nothing to pick, so the class chooser is left out and the row
// carries only the upload button; with several classes the chooser comes too.
const multi = allowed.length > 1;
const picker = `<div class="tools">
        ${multi ? `<label class="sr" for="resClass">Class</label><select id="resClass" data-ch="resClass">${allowed
          .map((c) => `<option value="${esc(c.id)}" ${c.id === cls ? 'selected' : ''}>${esc(c.name)}</option>`)
          .join('')}</select>` : ''}
        ${isStaff() && multi ? `<label class="chk"><input type="checkbox" id="resAll" data-ch="resAll" ${ui.allRes ? 'checked' : ''}> All classes</label>` : ''}
        ${!multi ? `<span class="small muted">${esc(className(cls))}${ui.resArea ? ' \u00b7 ' + esc(ui.resArea) : ''}</span>` : ''}
        <span class="grow"></span>
        ${mayEdit ? '<button class="btn primary" data-act="resForm">Upload a file</button>' : ''}
      </div>`;

  const areaBar = areas.length
    ? `<div class="res-areas" role="tablist">
        <button class="${ui.resArea ? '' : 'on'}" data-act="resArea" data-v="">All (${filed})</button>
        ${areas.map((a) => `<button class="${ui.resArea === a ? 'on' : ''}" data-act="resArea" data-v="${esc(a)}">${esc(a)}</button>`).join('')}
      </div>`
    : '';

  return (
    (isParent() ? kidPicker() : '') +
    picker +
    `<p class="small muted" style="margin-bottom:.8rem">${
      isParent()
        ? 'Notes, modules and past papers for your child\u2019s class. Open one to read or save it.'
        : 'Modules, lesson notes and past papers, filed by class and learning area. Parents of that class can open them too.'
    }</p>` +
    areaBar +
    (list.length
      ? `<div class="res-list">${list.map((r) => fileCard(r, mayEdit)).join('')}</div>`
      : empty(
          ui.resArea ? 'Nothing filed under ' + ui.resArea : 'No material yet',
          isParent()
            ? 'When the class teacher adds notes or past papers for your child\u2019s class, they appear here.'
            : 'Upload a module, a set of notes or a past paper and the parents of that class can open it.',
        ))
  );
};

// ───────────────────────── uploading ─────────────────────────

function uploadForm() {
  const allowed = myClasses();
  if (!allowed.length) return toast('Add a class first.', 'warn');
  const cls = get('classes', pickClass()) || allowed[0];
  const areas = areasOf(cls, all('resources').filter((r) => r.classId === cls.id).map((r) => r.area));
  openModal(
    `<h2>Upload teaching material</h2>
     <p class="hint" style="margin:-.4rem 0 .9rem">PDFs, Word documents, sheets, slides, images or plain text. The class's parents can open this too.</p>
     <form id="resForm">
       <div class="grid2">
         <label class="f"><span>Class</span><select id="rf_class">${allowed
           .map((c) => `<option value="${esc(c.id)}" ${c.id === cls.id ? 'selected' : ''}>${esc(c.name)}</option>`)
           .join('')}</select></label>
         <label class="f"><span>Learning area</span><select id="rf_area">${(areas.length ? areas : ['General'])
           .map((a) => `<option>${esc(a)}</option>`)
           .join('')}</select></label>
         <label class="f full"><span>Title, if you want something other than the file name</span><input id="rf_title" placeholder="Left blank, the file name is used"></label>
         <label class="f full"><span>File</span><input id="rf_file" type="file" required></label>
       </div>
       <p class="err" id="rf_err" role="alert"></p>
       <div class="actions"><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary" id="rf_go" type="button">Upload</button></div>
     </form>`,
    true,
  );

  $('#rf_go').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const input = $('#rf_file');
    const err = $('#rf_err');
    if (!input.files || !input.files[0]) {
      err.textContent = 'Choose a file to upload.';
      return;
    }
    const form = new FormData();
    form.append('classId', $('#rf_class').value);
    form.append('area', $('#rf_area').value);
    form.append('title', $('#rf_title').value.trim());
    form.append('file', input.files[0]);
    btn.disabled = true;
    btn.textContent = 'Uploading\u2026';
    try {
      const saved = await api.send('/files', form);
      putLocal('resources', saved);
      ui.classId = saved.classId;
      ui.resArea = '';
      $('#modal').innerHTML = '';
      toast('Uploaded ' + saved.title, 'success');
      paint();
    } catch (e) {
      err.textContent = e.message;
      btn.disabled = false;
      btn.textContent = 'Upload';
    }
  });
}

// ───────────────────────── opening and removing ─────────────────────────

// A file has to be fetched with the login token, so it cannot be a plain link; this grabs it
// and hands it to the browser as a download.
async function openFile(id) {
  const r = get('resources', id);
  if (!r) return;
  try {
    const res = await api.download('/files/' + id);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = r.fileName || r.title;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (e) {
    toast(e.message, 'error');
  }
}

Object.assign(A, {
  resForm: uploadForm,
  resOpen: (d) => openFile(d.id),
  resArea: (d) => {
    ui.resArea = d.v;
    paint();
  },
  resDel: (d) =>
    confirmBox('Delete this file?', `"${d.n}" will be removed for everyone who can see it. This cannot be undone.`, 'Delete', async () => {
      try {
        await api.del('/files/' + d.id);
        removeDocLocal('resources', d.id);
        toast('Deleted', 'success');
      } catch (e) {
        toast(e.message, 'error');
      }
    }),
});

Object.assign(onChange, {
  resClass: (el) => {
    ui.classId = el.value;
    ui.resArea = '';
    paint();
  },
  resAll: (el) => {
    ui.allRes = el.checked;
    ui.resArea = '';
    paint();
  },
});