// Small SVG charts for the dashboards: a line chart with a hover readout, a stacked bar and a meter.
// Colours come from the --viz-* variables in dashboard.css, so light and dark mode use their own steps.

import { esc } from './util.js';

// Short money and count labels for axes and tiles: 950, 12.5K, 1.28M.
export const compact = (n) => {
  const a = Math.abs(n);
  if (a >= 1e6) return +(n / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
  if (a >= 1e3) return +(n / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'K';
  return String(Math.round(n));
};

// The next round number at or above n, so the top gridline lands on a clean value.
function niceMax(n) {
  if (n <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(n)),
    f = n / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

const H = 230,
  PL = 46,
  PR = 14,
  PT = 14,
  PB = 30;

// One series over time. pts: [{x: 'axis label', tip: 'tooltip label', v: number}].
// fmt formats a value for the tooltip, tick for the y axis. w is about the width the chart is shown at,
// so the axis text stays a readable size in narrow cards.
export function lineChart(pts, { fmt = String, tick = compact, label = '', max, w: W = 520 } = {}) {
  if (pts.length < 2) return '<p class="muted small">Not enough records yet to draw this chart.</p>';
  const top = max || niceMax(Math.max(...pts.map((p) => p.v)));
  const x = (i) => PL + (i * (W - PL - PR)) / (pts.length - 1),
    y = (v) => PT + (H - PT - PB) * (1 - v / top);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const yy = y(f * top).toFixed(1);
      return `<line class="lc-grid" x1="${PL}" x2="${W - PR}" y1="${yy}" y2="${yy}"/><text class="lc-tick" x="${PL - 8}" y="${+yy + 4}" text-anchor="end">${esc(tick(f * top))}</text>`;
    })
    .join('');
  const every = Math.max(1, Math.ceil(pts.length / 6));
  const xs = pts
    .map((p, i) =>
      i === pts.length - 1 || (i % every === 0 && pts.length - 1 - i >= Math.max(2, every * 0.7))
        ? `<text class="lc-tick" x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}">${esc(p.x)}</text>`
        : '',
    )
    .join('');
  const last = pts.length - 1;
  // The hover layer reads point positions and labels from data attributes and writes them with textContent.
  const data = esc(JSON.stringify(pts.map((p, i) => [+x(i).toFixed(1), +y(p.v).toFixed(1), p.tip || p.x, fmt(p.v)])));
  return `<div class="lc" tabindex="0" role="img" aria-label="${esc(label)}. Use the arrow keys to read each point." data-w="${W}" data-pts="${data}">
    <svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${grid}
      <path class="lc-area" d="${path}L${x(last).toFixed(1)},${y(0)}L${x(0)},${y(0)}Z"/>
      <path class="lc-line" d="${path}"/>
      <circle class="lc-end" cx="${x(last).toFixed(1)}" cy="${y(pts[last].v).toFixed(1)}" r="4.5"/>
      <line class="lc-x" x1="0" x2="0" y1="${PT}" y2="${H - PB}"/><circle class="lc-dot" cx="0" cy="0" r="5"/>${xs}</svg>
    <div class="lc-tip" hidden><b></b><span></span></div></div>`;
}

// A part-to-whole bar with its legend. parts: [{n: name, v: count, c: 'css colour'}].
// The legend shows each value and share, so nothing depends on colour or hovering.
// unit is text after each value, or a function of the value, for example (v) => (v === 1 ? ' day' : ' days').
export function stackBar(parts, { label = '', unit = '' } = {}) {
  const total = parts.reduce((s, p) => s + p.v, 0),
    u = (v) => (typeof unit === 'function' ? unit(v) : unit);
  if (!total) return '<p class="muted small">Nothing recorded yet.</p>';
  const pct = (v) => Math.round((v / total) * 100);
  return `<div class="sb" role="img" aria-label="${esc(label)}">${parts
    .filter((p) => p.v)
    .map((p) => `<i style="flex:${p.v};background:${p.c}" title="${esc(p.n)}: ${p.v}${esc(u(p.v))}, ${pct(p.v)}%"></i>`)
    .join('')}</div>
    <ul class="sb-key">${parts.map((p) => `<li><i style="background:${p.c}"></i><span>${esc(p.n)}</span><b>${p.v}${esc(u(p.v))}</b><small>${pct(p.v)}%</small></li>`).join('')}</ul>`;
}

// One share against a whole, for example fees collected. tone picks the colour: '', 'warn' or 'bad'.
export const meter = (pct, tone = '', label = '') =>
  `<div class="meter ${tone}" role="img" aria-label="${esc(label || pct + '%')}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;

// The same numbers as a chart, as a table anyone can open.
export const tableView = (heads, rows) =>
  `<details class="tview"><summary>Show as table</summary><div class="tw"><table class="t"><thead><tr>${heads.map((h, i) => `<th class="${i ? 'num' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? 'num' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;

// Hover and keyboard readout for every line chart on the page.
function show(box, i) {
  const pts = JSON.parse(box.dataset.pts);
  i = Math.max(0, Math.min(pts.length - 1, i));
  box.dataset.i = i;
  const [px, py, label, value] = pts[i];
  const svg = box.querySelector('svg');
  svg.querySelector('.lc-x').setAttribute('x1', px);
  svg.querySelector('.lc-x').setAttribute('x2', px);
  const dot = svg.querySelector('.lc-dot');
  dot.setAttribute('cx', px);
  dot.setAttribute('cy', py);
  box.classList.add('on');
  const tip = box.querySelector('.lc-tip');
  tip.querySelector('b').textContent = value;
  tip.querySelector('span').textContent = label;
  tip.hidden = false;
  const r = svg.getBoundingClientRect(),
    sx = r.width / +box.dataset.w;
  tip.style.left = Math.min(r.width - tip.offsetWidth - 4, Math.max(4, px * sx - tip.offsetWidth / 2)) + 'px';
  tip.style.top = Math.max(0, py * sx - tip.offsetHeight - 14) + 'px';
}
function hide(box) {
  box.classList.remove('on');
  box.querySelector('.lc-tip').hidden = true;
}
document.addEventListener('pointermove', (e) => {
  const box = e.target.closest && e.target.closest('.lc');
  document.querySelectorAll('.lc.on').forEach((b) => b !== box && b !== document.activeElement && hide(b));
  if (!box) return;
  const pts = JSON.parse(box.dataset.pts),
    r = box.querySelector('svg').getBoundingClientRect();
  const vx = ((e.clientX - r.left) / r.width) * +box.dataset.w;
  let best = 0;
  pts.forEach((p, i) => {
    if (Math.abs(p[0] - vx) < Math.abs(pts[best][0] - vx)) best = i;
  });
  show(box, best);
});
document.addEventListener('focusin', (e) => {
  if (e.target.classList && e.target.classList.contains('lc')) show(e.target, JSON.parse(e.target.dataset.pts).length - 1);
});
document.addEventListener('focusout', (e) => {
  if (e.target.classList && e.target.classList.contains('lc')) hide(e.target);
});
document.addEventListener('keydown', (e) => {
  const box = e.target.classList && e.target.classList.contains('lc') ? e.target : null;
  if (!box || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
  e.preventDefault();
  show(box, +(box.dataset.i || 0) + (e.key === 'ArrowLeft' ? -1 : 1));
});
