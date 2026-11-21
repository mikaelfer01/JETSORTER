// Peças reutilizáveis das telas novas: formatação, cartões, tabelas, gráficos SVG e CSV.
// Mesmo padrão visual das telas existentes (classes .card, .tnch, .rwhat, .tnins, table dentro de .scroll).
export const p2 = (n) => String(n).padStart(2, '0');
export const fmt = (n) => Math.round(Number(n || 0)).toLocaleString('pt-BR');
export const dec = (n, d = 1) => Number(n).toFixed(d).replace('.', ',');
export const pc = (a, b) => (b ? (a / b) * 100 : 0);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const MIN = 60000, HOUR = 3600000, DAY = 86400000;
export const hm = (ms) => p2(new Date(ms).getHours()) + ':' + p2(new Date(ms).getMinutes());
export const dm = (ms) => p2(new Date(ms).getDate()) + '/' + p2(new Date(ms).getMonth() + 1);
export const dkey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
export const kd = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
export const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const dur = (s) => { s = Math.round(s); return s >= 3600 ? Math.floor(s / 3600) + 'h' + p2(Math.floor((s % 3600) / 60)) : s >= 60 ? Math.floor(s / 60) + ' min' : s + ' s'; };
export const ago = (ms, now = Date.now()) => dur(Math.max(0, (now - ms) / 1000));

export const card = (t, sub, what, body, ins, cls = '') => `<section class="card tnch ${cls}"><h3>${t}${sub ? ` <small>${sub}</small>` : ''}</h3>${what ? `<p class="muted rwhat">${what}</p>` : ''}${body}${ins ? `<p class="tnins"><b>Leitura:</b> ${ins}</p>` : ''}</section>`;
export const grid2 = (inner) => `<div class="tnan">${inner}</div>`;
export const kv = (l, v, c = '', sub = '') => `<div class="tnk ${c}"><b>${v}</b><span>${l}</span>${sub ? `<em class="ksub">${sub}</em>` : ''}</div>`;
export const kvs = (arr) => `<div class="tnkg kk">${arr.map((a) => kv(...a)).join('')}</div>`;
export const note = (t) => `<p class="muted nt">${t}</p>`;

// tabela: head = ['Col', ...]; rows = [[cel, ...]]; cel pode ser string (HTML) ou {v, c}; right = índices alinhados à direita
export function table(head, rows, { right = [], max = 0, empty = 'Sem dados no período.', cls = '' } = {}) {
  if (!rows.length) return `<p class="muted nt">${empty}</p>`;
  const r = max ? rows.slice(0, max) : rows;
  const th = head.map((h, i) => `<th${right.includes(i) ? ' class="r"' : ''}>${h}</th>`).join('');
  const body = r.map((row) => '<tr>' + row.map((c, i) => { const o = c && typeof c === 'object' ? c : { v: c }; return `<td class="${[right.includes(i) ? 'r' : '', o.c || ''].join(' ').trim()}">${o.v ?? ''}</td>`; }).join('') + '</tr>').join('');
  return `<div class="scroll"><table class="${cls}"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>${max && rows.length > max ? `<p class="muted nt">Mostrando ${max} de ${fmt(rows.length)}.</p>` : ''}`;
}

export const tag = (t, c = '') => `<i class="tg ${c}">${t}</i>`;
export const rate = (v, bad) => `<span class="rate ${bad ? 'bad' : 'ok'}">${dec(v)}%</span>`;

// barras horizontais em HTML: items = [{k, v, sub?, c?}]
export function hbars(items, { fmtV = fmt, max } = {}) {
  if (!items.length) return '<p class="muted nt">Sem dados no período.</p>';
  const mx = max || Math.max(1, ...items.map((x) => x.v));
  return `<div class="hb">${items.map((x) => `<div class="hbr" title="${esc(x.k)}: ${fmtV(x.v)}"><span class="hbk">${esc(x.k)}</span><span class="hbt"><u style="width:${Math.max(1.5, (x.v / mx) * 100)}%;${x.c ? `background:${x.c}` : ''}"></u></span><b>${fmtV(x.v)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</div>`).join('')}</div>`;
}

// ---------- SVG ----------
const W = 640, PL = 58, PR = 22, PT = 22, PB = 34;
export const COLORS = ['#2563eb', '#f59e0b', '#16a34a', '#d9534f', '#0d9488', '#7c3aed', '#64748b'];
export const nice = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v || 1))); for (const m of [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p; return 10 * p; };
const gridY = (max, H, f, lo = 0) => { let s = ''; for (let i = 0; i <= 4; i++) { const y = PT + (H - PT - PB) * (1 - i / 4); s += `<line x1="${PL}" x2="${W - PR}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${PL - 6}" y="${y + 4}" text-anchor="end" class="rt">${f(lo + (max - lo) * i / 4)}</text>`; } return s; };
const wrap = (H, inner) => `<svg viewBox="0 0 ${W} ${H}" class="rsvg tnsvg" role="img">${inner}</svg>`;
const legend = (names, cols) => names.map((n, i) => `<rect x="${PL + i * 132}" y="2" width="9" height="9" rx="2" fill="${cols[i]}"/><text x="${PL + i * 132 + 13}" y="10" class="rt">${esc(n)}</text>`).join('');

// colunas: labels[], series = [{name, vals[], color?}]; agrupadas; linhaRef = {v, label}
export function colChart(labels, series, { H = 240, fmtV = fmt, ref, lo = 0, hi, stack = false } = {}) {
  if (!labels.length) return '<p class="muted nt">Sem dados.</p>';
  const cols = series.map((s, i) => s.color || COLORS[i % COLORS.length]);
  const tot = labels.map((_, i) => (stack ? series.reduce((a, s) => a + (s.vals[i] || 0), 0) : Math.max(...series.map((s) => s.vals[i] || 0))));
  const mx = hi || nice(Math.max(...tot, ref ? ref.v : 0, 1) * 1.15);
  const bw = (W - PL - PR) / labels.length, n = stack ? 1 : series.length, w = (bw * 0.7) / n;
  const Y = (v) => PT + (H - PT - PB) * (1 - (v - lo) / (mx - lo));
  let s = gridY(mx, H, fmtV, lo);
  labels.forEach((lb, i) => {
    const x0 = PL + i * bw + bw * 0.15; let acc = 0;
    series.forEach((se, k) => {
      const v = se.vals[i] || 0, x = stack ? x0 : x0 + k * w, y = stack ? Y(acc + v) : Y(v), h = stack ? Y(acc) - Y(acc + v) : H - PB - y;
      if (v > 0) s += `<rect x="${x}" y="${y}" width="${w * (stack ? n : 1) - 1}" height="${Math.max(0, h)}" rx="3" fill="${cols[k]}"><title>${esc(lb)} · ${esc(se.name)}: ${fmtV(v)}</title></rect>`;
      if (stack) acc += v;
    });
    if (labels.length <= 14 || i % Math.ceil(labels.length / 12) === 0) s += `<text x="${PL + i * bw + bw / 2}" y="${H - 12}" text-anchor="middle" class="rt">${esc(lb)}</text>`;
    if (series.length === 1 && labels.length <= 12) s += `<text x="${x0 + w / 2}" y="${Y(series[0].vals[i] || 0) - 5}" text-anchor="middle" class="rt b">${fmtV(series[0].vals[i] || 0)}</text>`;
  });
  if (ref) s += `<line x1="${PL}" x2="${W - PR}" y1="${Y(ref.v)}" y2="${Y(ref.v)}" stroke="var(--bad)" stroke-dasharray="6 4"/><text x="${W - PR}" y="${Y(ref.v) - 4}" text-anchor="end" class="rt b" style="fill:var(--bad)">${esc(ref.label || '')}</text>`;
  return wrap(H, s + (series.length > 1 ? legend(series.map((x) => x.name), cols) : ''));
}

// linhas: labels[], series = [{name, vals[] (null = lacuna), color?, dash?}]
export function lineChart(labels, series, { H = 240, fmtV = fmt, ref, lo = 0, hi } = {}) {
  if (!labels.length) return '<p class="muted nt">Sem dados.</p>';
  const cols = series.map((s, i) => s.color || COLORS[i % COLORS.length]);
  const all = series.flatMap((s) => s.vals.filter((v) => v != null));
  const mx = hi || nice(Math.max(...all, ref ? ref.v : 0, 1) * 1.1);
  const X = (i) => PL + ((i + 0.5) / labels.length) * (W - PL - PR), Y = (v) => PT + (H - PT - PB) * (1 - (v - lo) / (mx - lo));
  let s = gridY(mx, H, fmtV, lo);
  labels.forEach((lb, i) => { if (labels.length <= 14 || i % Math.ceil(labels.length / 12) === 0) s += `<text x="${X(i)}" y="${H - 12}" text-anchor="middle" class="rt">${esc(lb)}</text>`; });
  if (ref) s += `<line x1="${PL}" x2="${W - PR}" y1="${Y(ref.v)}" y2="${Y(ref.v)}" stroke="var(--bad)" stroke-dasharray="6 4"/><text x="${W - PR}" y="${Y(ref.v) - 4}" text-anchor="end" class="rt b" style="fill:var(--bad)">${esc(ref.label || '')}</text>`;
  series.forEach((se, k) => {
    let seg = [];
    const flush = () => { if (seg.length > 1) s += `<polyline fill="none" stroke="${cols[k]}" stroke-width="2.5"${se.dash ? ' stroke-dasharray="6 4"' : ''} points="${seg.join(' ')}"/>`; seg = []; };
    se.vals.forEach((v, i) => { if (v == null) { flush(); return; } seg.push(X(i) + ',' + Y(v)); s += `<circle cx="${X(i)}" cy="${Y(v)}" r="3.2" fill="${cols[k]}"><title>${esc(labels[i])} · ${esc(se.name)}: ${fmtV(v)}</title></circle>`; });
    flush();
  });
  return wrap(H, s + legend(series.map((x) => x.name), cols));
}

// mapa de calor em tabela: rows = rótulos, cols = rótulos, val(r,c) → número|null
export function heat(rowL, colL, val, { fmtV = fmt, hue = '37,99,235' } = {}) {
  const v = rowL.map((r, i) => colL.map((c, j) => val(i, j)));
  const mx = Math.max(1, ...v.flat().filter((x) => x != null));
  return `<div class="scroll"><table class="heat"><thead><tr><th></th>${colL.map((c) => `<th class="r">${esc(c)}</th>`).join('')}</tr></thead><tbody>` +
    rowL.map((r, i) => `<tr><td><b>${esc(r)}</b></td>${colL.map((c, j) => { const x = v[i][j]; return x == null ? '<td class="r muted">·</td>' : `<td class="r" style="background:rgba(${hue},${(0.08 + 0.55 * x / mx).toFixed(2)})" title="${esc(r)} · ${esc(c)}: ${fmtV(x)}">${fmtV(x)}</td>`; }).join('')}</tr>`).join('') + `</tbody></table></div>`;
}

// ---------- CSV (abre no Excel) ----------
export function csvDownload(name, head, rows) {
  const q = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const txt = '﻿' + [head, ...rows].map((r) => r.map(q).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export function jsonDownload(name, obj) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export const btn = (label, attr, cls = '') => `<button type="button" class="kbtn ${cls}" ${attr}>${label}</button>`;
