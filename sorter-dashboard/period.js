// Produtividade por período escolhível (dia/hora inicial → dia/hora final).
// Usa as telas agregadas do sorter (Feeder feed quantity + Summary, agrupadas por hora): 2 consultas por trecho, então
// funciona para qualquer intervalo (até 31 dias) em ~1 s, sem baixar o trace inteiro.
import { getJson, summary, fmtQ } from './api.js';

const HOUR = 3600000, DAY = 86400000, MAX_DAYS = 31;
const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
const dec = (n, d = 1) => Number(n).toFixed(d).replace('.', ',');
const pct = (a, b, d = 1) => (b ? dec((a / b) * 100, d) + '%' : '—');
const p2 = (n) => String(n).padStart(2, '0');
const dStr = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const tStr = (ms) => { const d = new Date(ms); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const dBr = (ms) => { const d = new Date(ms); return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`; };
const wk = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const lblT = (ms) => `${wk[new Date(ms).getDay()]} ${dBr(ms)} ${tStr(ms)}`;
const lbl = (ms) => `${wk[new Date(ms).getDay()]} ${dBr(ms)} ${p2(new Date(ms).getHours())}h`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s) => document.querySelector(s);
const toMs = (d, t) => (d && t ? new Date(`${d}T${t}`).getTime() : NaN);

let state = { mode: 'live', res: null, gran: 'auto', busy: false, token: 0, follow: false, timer: null };
let getRejMode = () => 'all';

export const prMode = () => state.mode;

// ---------- coleta ----------
function sumOutlets(rows) {
  const ind = {};
  for (const o of rows || []) for (let k = 1; k <= 40; k++) { const v = +o['total_' + k]; if (v) ind[k] = (ind[k] || 0) + v; }
  return ind;
}

const parseArea = (t) => { const m = /(\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{2}):(\d{2})/.exec(String(t || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : NaN; };

// Uma consulta por tela cobre o intervalo inteiro: o sorter devolve 1 linha por hora (campo "timearea").
// Início/fim quebrados (ex.: 06:30) viram trechos próprios, porque o servidor ancora as janelas no início pedido.
async function fetchSeg(a, b, out) {
  const [o, s] = await Promise.all([
    getJson('/statis/outlets', { method: 'POST', form: { start: fmtQ(a), end: fmtQ(b - 1000), group: 60, page: 1, limit: 5000 } }),
    summary({ start: a, end: b - 1000, group: 60 })
  ]);
  const key = (t) => { const t0 = parseArea(t); return Number.isFinite(t0) ? (t0 < Math.floor(a / HOUR) * HOUR + HOUR && a % HOUR ? Math.floor(a / HOUR) * HOUR : Math.floor(t0 / HOUR) * HOUR) : NaN; };
  const at = (k) => { let x = out.get(k); if (!x) { x = { a: k, b: k + HOUR, ind: {}, tot: 0, abn: 0, blk: 0 }; out.set(k, x); } return x; };
  for (const r of o.data || []) {
    const k = key(r.timearea); if (!Number.isFinite(k)) continue;
    const x = at(k);
    for (let i = 1; i <= 40; i++) { const v = +r['total_' + i]; if (v) x.ind[i] = (x.ind[i] || 0) + v; }
  }
  for (const r of s.data || []) {
    const k = key(r.timearea); if (!Number.isFinite(k)) continue;
    const x = at(k);
    x.tot += +r.sorter_sorttotal || 0; x.abn += +r.sorter_abnormaltotal || 0; x.blk += +r.sorter_chuteblocktotal || 0;
  }
}

async function collect(from, to, onProgress, token) {
  const first = Math.ceil(from / HOUR) * HOUR, last = Math.floor(to / HOUR) * HOUR;
  const segs = [];
  if (Math.floor(from / HOUR) === Math.floor((to - 1) / HOUR)) segs.push([from, to]); // tudo dentro de uma hora
  else {
    if (from < first) segs.push([from, first]);
    if (first < last) segs.push([first, last]);
    if (to > last) segs.push([last, to]);
  }
  const out = new Map();
  let d = 0;
  for (const [a, b] of segs) {
    if (token !== state.token) return [];
    await fetchSeg(a, b, out);
    onProgress(++d, segs.length);
  }
  return [...out.values()].sort((x, y) => x.a - y.a);
}

// ---------- agregação ----------
function aggregate(slices, gran) {
  const keyOf = (a) => (gran === 'day' ? new Date(new Date(a).setHours(0, 0, 0, 0)).getTime() : Math.floor(a / HOUR) * HOUR);
  const B = new Map();
  const inds = new Set();
  for (const s of slices) {
    const k = keyOf(s.a);
    let x = B.get(k);
    if (!x) { x = { k, feed: 0, tot: 0, abn: 0, blk: 0, ind: {}, hours: 0, active: 0 }; B.set(k, x); }
    const f = Object.values(s.ind).reduce((p, v) => p + v, 0);
    x.feed += f; x.tot += s.tot; x.abn += s.abn; x.blk += s.blk;
    x.hours += (s.b - s.a) / HOUR;
    if (f > 0) x.active += (s.b - s.a) / HOUR;
    for (const [i, v] of Object.entries(s.ind)) { x.ind[i] = (x.ind[i] || 0) + v; inds.add(+i); }
  }
  return { buckets: [...B.values()].sort((a, b) => a.k - b.k), inds: [...inds].sort((a, b) => a - b) };
}

// ---------- visual ----------
function chartSvg(buckets, gran, rejKey) {
  const W = 1200, H = 190, pl = 44, pb = 26, pt = 10, n = buckets.length;
  const mx = Math.max(1, ...buckets.map((b) => b.feed));
  const bw = (W - pl) / Math.max(1, n);
  const every = Math.max(1, Math.ceil(n / 24));
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const y = pt + ((H - pt - pb) * i) / 4;
    g += `<line x1="${pl}" x2="${W}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${pl - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${fmt(Math.round(mx * (1 - i / 4)))}</text>`;
  }
  buckets.forEach((b, i) => {
    const h = ((H - pt - pb) * b.feed) / mx, x = pl + i * bw, y = H - pb - h;
    const rj = b[rejKey], rh = b.tot ? Math.min(h, (h * rj) / Math.max(1, b.feed)) : 0;
    const tip = `${gran === 'day' ? `${wk[new Date(b.k).getDay()]} ${dBr(b.k)}` : lbl(b.k)}: ${fmt(b.feed)} alimentadas · ${fmt(b.tot)} processadas · ${fmt(rj)} rejeitos (${pct(rj, b.tot, 2)})`;
    g += `<g><title>${esc(tip)}</title><rect x="${x + bw * 0.1}" y="${y}" width="${bw * 0.8}" height="${Math.max(0, h)}" rx="2" fill="#c3cbe0"/>` +
      (rh > 0.5 ? `<rect x="${x + bw * 0.1}" y="${y}" width="${bw * 0.8}" height="${rh}" rx="2" fill="var(--bad)"/>` : '') + `</g>`;
    if (i % every === 0) g += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${gran === 'day' ? dBr(b.k) : `${p2(new Date(b.k).getHours())}h`}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px">${g}</svg>`;
}

function renderResult(el) {
  const r = state.res;
  if (!r) { el.innerHTML = ''; return; }
  const span = r.to - r.from;
  const gran = state.gran === 'auto' ? (span > 2 * DAY ? 'day' : 'hour') : state.gran;
  const rejKey = getRejMode() === 'all' ? 'abn' : 'blk';
  const { buckets, inds } = aggregate(r.slices, gran);
  const hourly = aggregate(r.slices, 'hour').buckets;
  const T = hourly.reduce((a, b) => ({ feed: a.feed + b.feed, tot: a.tot + b.tot, rej: a.rej + b[rejKey], act: a.act + (b.feed > 0 ? 1 : 0) }), { feed: 0, tot: 0, rej: 0, act: 0 });
  const peak = hourly.slice().sort((a, b) => b.feed - a.feed)[0];
  const hrsTot = Math.max(1, Math.round(span / HOUR));
  const strong = hourly.filter((b) => b.feed >= 50);
  const avgH = strong.length ? strong.reduce((a, b) => a + b.feed, 0) / strong.length : 0;
  const mxCell = Math.max(1, ...buckets.flatMap((b) => Object.values(b.ind)));
  const mxInd = {};
  const indTot = {};
  for (const i of inds) { indTot[i] = buckets.reduce((a, b) => a + (b.ind[i] || 0), 0); }
  const sumInd = Object.values(indTot).reduce((a, b) => a + b, 0);
  const bestInd = Math.max(1, ...Object.values(indTot));
  const colHead = buckets.map((b) => `<th class="r" title="${esc(gran === 'day' ? dBr(b.k) : lbl(b.k))}">${gran === 'day' ? `${wk[new Date(b.k).getDay()]}<br>${dBr(b.k)}` : `${p2(new Date(b.k).getHours())}h${new Date(b.k).getHours() === 0 || b === buckets[0] ? `<br><small>${dBr(b.k)}</small>` : ''}`}</th>`).join('');
  const matrix = inds.map((i) => `<tr><td><b>${String(i).padStart(2, '0')}</b></td>${buckets.map((b) => { const v = b.ind[i] || 0, x = v ? Math.max(0.08, v / mxCell) : 0; return `<td class="c hz blue" style="--i:${x.toFixed(2)}" ${v ? `data-tip="${esc(`Indução ${String(i).padStart(2, '0')} · ${gran === 'day' ? dBr(b.k) : lbl(b.k)}: ${fmt(v)} peças`)}"` : ''}>${v ? fmt(v) : ''}</td>`; }).join('')}<td class="r"><b>${fmt(indTot[i])}</b></td></tr>`).join('');
  const hrsOf = (i) => hourly.filter((b) => (b.ind[i] || 0) > 0);
  const rowsInd = inds.map((i) => {
    const hs = hrsOf(i), best = hs.slice().sort((a, b) => (b.ind[i] || 0) - (a.ind[i] || 0))[0];
    const st = hs.filter((b) => b.ind[i] >= 50), av = st.length ? st.reduce((a, b) => a + b.ind[i], 0) / st.length : 0;
    return `<tr><td><b>${String(i).padStart(2, '0')}</b></td><td class="bar"><i style="width:${(indTot[i] / bestInd) * 100}%;--c:var(--blue)"></i><span>${fmt(indTot[i])}</span></td><td class="r">${pct(indTot[i], sumInd)}</td><td class="r">${best ? `${lbl(best.k)} · ${fmt(best.ind[i])}` : '—'}</td><td class="r">${fmt(Math.round(av))}</td><td class="r">${pct(hs.length, hrsTot, 0)}</td></tr>`;
  }).join('');
  const dayB = aggregate(r.slices, 'day').buckets;
  const rowsDay = dayB.length > 1 ? dayB.map((b) => {
    const hrs = hourly.filter((h) => h.k >= b.k && h.k < b.k + DAY), pk = hrs.slice().sort((x, y) => y.feed - x.feed)[0];
    return `<tr><td><b>${wk[new Date(b.k).getDay()]} ${dBr(b.k)}</b></td><td class="r">${fmt(b.feed)}</td><td class="r">${fmt(b.tot)}</td><td class="r">${fmt(b[rejKey])}</td><td class="r">${pct(b[rejKey], b.tot, 2)}</td><td class="r">${b.active ? fmt(Math.round(b.feed / b.active)) : '—'}</td><td class="r">${pk ? `${p2(new Date(pk.k).getHours())}h · ${fmt(pk.feed)}` : '—'}</td><td class="r">${dec(b.active, 0)} h</td></tr>`;
  }).join('') : '';
  const trunc = r.to > Date.now() ? '' : '';
  el.innerHTML =
    `<div class="kpis prk">` +
    `<div class="kpi"><label>Alimentadas no período</label><b>${fmt(T.feed)}</b><span>${lblT(r.from)} → ${lblT(r.to)}</span></div>` +
    `<div class="kpi"><label>Processadas (Summary)</label><b>${fmt(T.tot)}</b><span>peças que já caíram na saída</span></div>` +
    `<div class="kpi ${T.tot && T.rej / T.tot > 0.03 ? 'bad' : ''}"><label>Rejeitos</label><b>${fmt(T.rej)}</b><span>${pct(T.rej, T.tot, 2)} · ${getRejMode() === 'all' ? 'todas as exceções' : 'só Chute block'}</span></div>` +
    `<div class="kpi"><label>Ritmo médio</label><b>${fmt(Math.round(avgH))}<small> /h</small></b><span>nas horas com ≥ 50 peças</span></div>` +
    `<div class="kpi"><label>Melhor hora</label><b>${peak ? fmt(peak.feed) : '—'}</b><span>${peak ? lbl(peak.k) : ''}</span></div>` +
    `<div class="kpi"><label>Horas com operação</label><b>${T.act}<small> / ${hrsTot}</small></b><span>${pct(T.act, hrsTot, 0)} do período</span></div></div>` +
    `<section class="card"><h2>Peças por ${gran === 'day' ? 'dia' : 'hora'} <small>cinza = alimentadas · vermelho = parte que virou rejeito</small>` +
    `<span class="seg"><button data-prgran="auto" class="${state.gran === 'auto' ? 'on' : ''}">auto</button><button data-prgran="hour" class="${state.gran === 'hour' ? 'on' : ''}">hora</button><button data-prgran="day" class="${state.gran === 'day' ? 'on' : ''}">dia</button></span></h2>${chartSvg(buckets, gran, rejKey)}</section>` +
    `<section class="card"><h2>Mapa de calor: indução × ${gran === 'day' ? 'dia' : 'hora'} <small>peças alimentadas por indução (Feeder feed quantity do sistema)</small></h2><div class="scroll"><table class="mx"><thead><tr><th>Ind.</th>${colHead}<th class="r">Total</th></tr></thead><tbody>${matrix || '<tr><td colspan="99" class="muted">Sem alimentação no período.</td></tr>'}</tbody></table></div></section>` +
    `<section class="card"><h2>Indicadores por indução no período</h2><div class="scroll"><table><thead><tr><th>Indução</th><th>Peças</th><th class="r">% do fluxo</th><th class="r">Melhor hora</th><th class="r">Ritmo médio (peças/h)</th><th class="r">Tempo ativo</th></tr></thead><tbody>${rowsInd}</tbody></table></div><p class="muted" style="margin:8px 2px 0">Tempo ativo = horas com ao menos 1 peça ÷ horas do período. Ritmo médio considera só horas com ≥ 50 peças.</p></section>` +
    (rowsDay ? `<section class="card"><h2>Resumo por dia</h2><div class="scroll"><table><thead><tr><th>Dia</th><th class="r">Alimentadas</th><th class="r">Processadas</th><th class="r">Rejeitos</th><th class="r">Taxa</th><th class="r">Ritmo (peças/h ativa)</th><th class="r">Melhor hora</th><th class="r">Horas ativas</th></tr></thead><tbody>${rowsDay}</tbody></table></div></section>` : '') + trunc;
}

function csvOut() {
  const r = state.res; if (!r) return;
  const rejKey = getRejMode() === 'all' ? 'abn' : 'blk';
  const { buckets, inds } = aggregate(r.slices, 'hour');
  const head = ['Hora', ...inds.map((i) => 'Ind ' + String(i).padStart(2, '0')), 'Alimentadas', 'Processadas', 'Rejeitos'];
  const rows = buckets.map((b) => [`${dStr(b.k)} ${p2(new Date(b.k).getHours())}:00`, ...inds.map((i) => b.ind[i] || 0), b.feed, b.tot, b[rejKey]]);
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [head, ...rows].map((x) => x.map(q).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `produtividade_${dStr(r.from)}_${tStr(r.from).replace(':', '')}_a_${dStr(r.to)}_${tStr(r.to).replace(':', '')}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- controles ----------
function setInputs(from, to) {
  $('#prFromD').value = dStr(from); $('#prFromT').value = tStr(from);
  $('#prToD').value = dStr(to); $('#prToT').value = tStr(to);
}
function setStatus(t, err) { const s = $('#prStatus'); s.textContent = t; s.classList.toggle('bad', !!err); }

async function analyze(silent) {
  let from = toMs($('#prFromD').value, $('#prFromT').value), to = toMs($('#prToD').value, $('#prToT').value);
  state.follow = $('#prFollow').checked;
  if (state.follow) { to = Date.now(); setInputs(from, to); }
  if (!Number.isFinite(from) || !Number.isFinite(to)) return setStatus('Escolha o dia e a hora de início e de fim.', true);
  if (to > Date.now()) to = Date.now();
  if (to <= from) return setStatus('O fim precisa ser depois do início.', true);
  if (to - from > MAX_DAYS * DAY) return setStatus(`Período máximo: ${MAX_DAYS} dias.`, true);
  const token = ++state.token;
  state.busy = true;
  $('#prGo').disabled = true;
  const bar = $('#prProg'); bar.classList.remove('hidden');
  if (!silent) setStatus('Consultando o sorter…');
  try {
    const slices = await collect(from, to, (d, n) => { if (token === state.token && !silent) { bar.firstElementChild.style.width = (d / n) * 100 + '%'; setStatus(`Consultando o sorter… ${d} de ${n}`); } }, token);
    if (token !== state.token) return;
    state.res = { from, to, slices };
    setStatus(`Período analisado: ${lblT(from)} → ${lblT(to)} · ${slices.length} hora(s) com dados · atualizado ${tStr(Date.now())}`);
    renderResult($('#prRange'));
    $('#prCsv').disabled = false;
  } catch (e) {
    if (token === state.token) setStatus('Falha ao consultar o sorter: ' + (e && e.message ? e.message : e), true);
  } finally {
    if (token === state.token) { state.busy = false; $('#prGo').disabled = false; bar.classList.add('hidden'); bar.firstElementChild.style.width = '0'; }
  }
}

function setMode(m) {
  state.mode = m;
  $('#prBar').dataset.mode = m;
  $('#prLive').classList.toggle('hidden', m !== 'live');
  $('#prRange').classList.toggle('hidden', m !== 'custom');
  $('#prCustom').classList.toggle('hidden', m !== 'custom');
  document.querySelectorAll('[data-prmode]').forEach((b) => b.classList.toggle('on', b.dataset.prmode === m));
  if (m === 'custom' && !state.res && !state.busy) analyze();
}

function preset(k) {
  const now = Date.now(), d0 = new Date(now).setHours(0, 0, 0, 0);
  let f = d0, t = now;
  if (k === 'today') { f = d0; }
  else if (k === 'yesterday') { f = d0 - DAY; t = d0; }
  else if (k === '24h') { f = now - DAY; }
  else if (k === '7d') { f = d0 - 6 * DAY; }
  else if (k === 'week') { const dw = new Date(d0).getDay(); f = d0 - ((dw + 6) % 7) * DAY; }
  else if (k === 'month') { f = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime(); }
  $('#prFollow').checked = t === now;
  setInputs(f, t);
  analyze();
}

export function initPeriod({ rejMode }) {
  getRejMode = rejMode;
  const now = Date.now();
  setInputs(new Date(now).setHours(0, 0, 0, 0), now);
  document.addEventListener('click', (e) => {
    const t = e.target;
    const m = t.closest('[data-prmode]'); if (m) { setMode(m.dataset.prmode); return; }
    const p = t.closest('[data-prpreset]'); if (p) { preset(p.dataset.prpreset); return; }
    const g = t.closest('[data-prgran]'); if (g) { state.gran = g.dataset.prgran; renderResult($('#prRange')); return; }
    if (t.closest('#prGo')) { analyze(); return; }
    if (t.closest('#prCsv')) { csvOut(); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.matches('#prFollow')) { clearInterval(state.timer); state.timer = null; if (e.target.checked) { state.timer = setInterval(() => { if (state.mode === 'custom' && !state.busy && $('#prFollow').checked) analyze(true); }, 60000); } }
  });
  state.timer = null;
}

// quando o filtro "Rejeito" do topo muda, redesenha o resultado
export function repaintPeriod() { if (state.mode === 'custom' && state.res) renderResult($('#prRange')); }
