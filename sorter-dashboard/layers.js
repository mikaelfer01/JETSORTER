// Aba "Camadas e carrinhos": L1 e L2 do sorter lado a lado e cada um dos carrinhos (1–204 por camada).
// Estrutura derivada dos dados reais (trace): induções por camada, nº de carrinhos e saídas atendidas.
import * as A from './analysis.js';

const HOUR = 3600000;
const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
const dec = (n, d = 1) => Number(n).toFixed(d).replace('.', ',');
const pct = (a, b, d = 1) => (b ? dec((a / b) * 100, d) + '%' : '—');
const p2 = (n) => String(n).padStart(2, '0');
const hhmm = (t) => { const d = new Date(t); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const hhmmss = (t) => `${hhmm(t)}:${p2(new Date(t).getSeconds())}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dur = (s) => (s < 90 ? Math.round(s) + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : dec(s / 3600, 1) + ' h');
const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const PT = { 'Automatic mode': 'Modo automático', 'Online status': 'Online', 'Speed normal': 'Velocidade normal', 'Carrier locate finish': 'Carrinhos localizados' };

export const LAY = { sel: null, mode: 'pecas', layer: 'L1' };
let hostClick = false;

const layerOf = (r, map) => (r.ly ? r.ly.replace('Layer', 'L') : map.get(r.ind) || (r.ind <= 6 ? 'L1' : 'L2'));

export function analyzeLayers(c) {
  const { all, now, an, state } = c;
  const indMap = new Map();
  for (const r of all) if (r.ly && !indMap.has(r.ind)) indMap.set(r.ind, r.ly.replace('Layer', 'L'));
  const L = {};
  for (const k of ['L1', 'L2']) L[k] = { k, rows: 0, fed: 0, fall: 0, rej: 0, stuck: 0, now: 0, nowRej: 0, inds: new Set(), chutes: new Set(), trays: new Map(), hours: new Map(), maxTray: 0 };
  const w0 = now - 15 * 60000, lim = now - 20 * 60000;
  for (const r of all) {
    const k = layerOf(r, indMap); const g = L[k]; if (!g) continue;
    g.fed++; g.inds.add(r.ind);
    let t = null;
    if (r.tr) { t = g.trays.get(r.tr); if (!t) { t = { no: r.tr, n: 0, rej: 0, stuck: 0, last: 0, w: 0, rows: [] }; g.trays.set(r.tr, t); } t.n++; t.w += r.w; if (r.t > t.last) t.last = r.t; g.maxTray = Math.max(g.maxTray, r.tr); }
    if (r.dc) {
      g.fall++; g.chutes.add(String(parseInt(r.dc, 10)));
      const h = Math.floor(r.t / HOUR) * HOUR; const x = g.hours.get(h) || { n: 0, rej: 0 }; x.n++;
      if (A.isRej(r)) { g.rej++; x.rej++; if (t) t.rej++; }
      g.hours.set(h, x);
      if (r.t >= w0) { g.now++; if (A.isRej(r)) g.nowRej++; }
    } else if (r.t < lim) { g.stuck++; if (t) t.stuck++; }
    if (t && t.rows.length < 400) t.rows.push(r);
  }
  // falhas de carrinho: histórico do dia + estado atual
  const faultHist = new Map(), faultNow = new Map();
  for (const x of an.carriers) faultHist.set('L' + x.layer + '-' + x.no, x);
  for (const s of state) if (s.grp === 'car') faultNow.set('L' + s.layer + '-' + s.no, s);
  const sorter = { L1: [], L2: [] };
  for (const s of state) if (s.grp === 'sorter' && sorter['L' + s.layer]) sorter['L' + s.layer].push(s);
  // atenção por carrinho
  const flags = [];
  for (const k of ['L1', 'L2']) {
    const g = L[k];
    const n204 = Math.max(g.maxTray, 204);
    const counts = [...g.trays.values()].map((t) => t.n);
    const med = median(counts);
    g.med = med; g.nTray = n204;
    for (let no = 1; no <= n204; no++) {
      const t = g.trays.get(no) || { no, n: 0, rej: 0, stuck: 0, last: 0, w: 0, rows: [] };
      const key = k + '-' + no, fh = faultHist.get(key), fn = faultNow.get(key);
      t.key = key; t.fh = fh || null; t.fn = fn || null;
      if (!g.trays.has(no)) g.trays.set(no, t);
      const why = []; let sev = 0;
      if (fn) { why.push(`em falha agora desde ${hhmm(fn.since)}`); sev = 3; }
      if (fh && fh.n >= 2) { why.push(`${fh.n} falhas hoje (${dur(fh.secs)} paradas)`); sev = Math.max(sev, 2); }
      if (med >= 30 && t.n <= med * 0.4) { why.push(t.n === 0 ? 'nenhuma peça hoje' : `só ${t.n} peças (mediana da camada: ${med})`); sev = Math.max(sev, 2); }
      const stuckAvg = g.stuck / n204;
      if (t.stuck >= Math.max(3, stuckAvg * 3)) { why.push(`${t.stuck} peças sem descarga`); sev = Math.max(sev, 2); }
      if (g.fall >= 500 && t.n >= 30 && t.rej / t.n >= 3 * (g.rej / Math.max(1, g.fall)) && t.rej >= 5) { why.push(`rejeito ${pct(t.rej, t.n)} (camada: ${pct(g.rej, g.fall)})`); sev = Math.max(sev, 1); }
      if (why.length) flags.push({ layer: k, no, why, sev, t });
    }
  }
  flags.sort((a, b) => b.sev - a.sev || b.why.length - a.why.length);
  return { L, indMap, sorter, flags, faultHist, faultNow };
}

function colorFor(mode, t, g, fn) {
  if (fn) return '#d6001c';
  if (mode === 'pecas') { if (!g.med) return '#e6e9f2'; if (!t.n) return '#1f2a44'; const r = t.n / g.med; return r < 0.4 ? '#f2b04a' : `rgba(47,111,237,${(0.25 + Math.min(0.75, (r / 1.6) * 0.75)).toFixed(2)})`; }
  if (mode === 'rej') { const rt = t.n ? t.rej / t.n : 0; return t.rej ? `rgba(214,0,28,${(0.2 + Math.min(0.8, rt * 15)).toFixed(2)})` : '#e6e9f2'; }
  if (mode === 'stuck') return t.stuck ? `rgba(240,140,0,${(0.3 + Math.min(0.7, t.stuck / 10)).toFixed(2)})` : '#e6e9f2';
  if (mode === 'falha') return t.fh ? `rgba(214,0,28,${(0.25 + Math.min(0.75, t.fh.n / 6)).toFixed(2)})` : '#e6e9f2';
  return '#e6e9f2';
}

function grid(g, mode) {
  const cells = [];
  for (let no = 1; no <= g.nTray; no++) {
    const t = g.trays.get(no);
    const tip = `Carrinho ${no} (${g.k})\nPeças hoje: ${fmt(t.n)}\nRejeitos: ${fmt(t.rej)}\nSem descarga: ${fmt(t.stuck)}\nFalhas hoje: ${t.fh ? t.fh.n + ' (' + dur(t.fh.secs) + ')' : 0}${t.fn ? '\nEM FALHA AGORA' : ''}`;
    cells.push(`<i class="car ${LAY.sel === t.key ? 'sel' : ''}" data-car="${t.key}" data-tip="${esc(tip)}" style="background:${colorFor(mode, t, g, t.fn)}"><u>${no}</u></i>`);
  }
  return `<div class="cargrid">${cells.join('')}</div>`;
}

function layerCard(g, A2, c) {
  const st = A2.sorter[g.k];
  const inds = [...g.inds].sort((a, b) => a - b);
  const fnow = [...g.trays.values()].filter((t) => t.fn);
  const fhist = [...g.trays.values()].filter((t) => t.fh);
  const secs = fhist.reduce((a, t) => a + t.fh.secs, 0), nf = fhist.reduce((a, t) => a + t.fh.n, 0);
  const used = [...g.trays.values()].filter((t) => t.n > 0).length;
  const perH = (g.now * 60) / 15;
  const rate = g.fall ? (g.rej / g.fall) * 100 : 0;
  const bad = st.some((s) => s.sev >= 3);
  const pills = st.length ? st.map((s) => `<span class="lpill ${s.sev >= 3 ? 'bad' : 'ok'}" title="${esc(s.desc)}">${esc(PT[s.desc.replace(/^\d+#/, '')] || s.desc)}</span>`).join('') : '<span class="lpill">sem estado lido</span>';
  const indChips = inds.map((n) => { const x = c.an.inds.find((i) => i.no === n); return `<span class="ichip ${x ? x.status : ''}" data-goto="ind|${n}">${p2(n)}</span>`; }).join('');
  return `<div class="card lay ${bad ? 'lbad' : ''}"><h2>Camada ${g.k.slice(1)} <small>induções ${inds.length ? p2(inds[0]) + '–' + p2(inds[inds.length - 1]) : '—'} · ${g.nTray} carrinhos</small></h2>` +
    `<div class="lstate">${pills}</div>` +
    `<div class="lk"><div><label>Peças hoje</label><b>${fmt(g.fall)}</b></div><div><label>Ritmo (15 min)</label><b>${fmt(Math.round(perH))}<em>/h</em></b></div><div><label>Rejeito</label><b class="${rate > c.cfg.rejectThreshold ? 'badt' : ''}">${pct(g.rej, g.fall, 2)}</b></div>` +
    `<div><label>Carrinhos usados</label><b>${used}<em>/${g.nTray}</em></b></div><div><label>Em falha agora</label><b class="${fnow.length ? 'badt' : ''}">${fnow.length}</b></div><div><label>Falhas hoje</label><b>${nf}</b><small>${nf ? dur(secs) + ' parados' : ''}</small></div></div>` +
    `<div class="lrow"><span>Induções</span><div>${indChips}</div></div>` +
    `<div class="lrow"><span>Saídas atendidas</span><div>${g.chutes.size} saídas diferentes receberam peças desta camada hoje</div></div>` +
    `<div class="lrow"><span>Sem descarga</span><div>${fmt(g.stuck)} peças alimentadas há mais de 20 min sem saída (${pct(g.stuck, g.fed)} do alimentado)</div></div>` +
    (fnow.length ? `<div class="lrow"><span>Em falha agora</span><div>${fnow.map((t) => `<b class="badt" data-car="${t.key}">${t.no}</b>`).join(', ')}</div></div>` : '') + `</div>`;
}

function hourly(A2) {
  const hs = new Set(); for (const k of ['L1', 'L2']) for (const h of A2.L[k].hours.keys()) hs.add(h);
  const H = [...hs].sort((a, b) => a - b);
  if (!H.length) return '';
  const mx = Math.max(1, ...H.flatMap((h) => ['L1', 'L2'].map((k) => (A2.L[k].hours.get(h) || { n: 0 }).n)));
  return `<div class="lh">` + H.map((h) => `<div title="${p2(new Date(h).getHours())}h · L1: ${fmt((A2.L.L1.hours.get(h) || { n: 0 }).n)} · L2: ${fmt((A2.L.L2.hours.get(h) || { n: 0 }).n)} peças"><div class="pair"><i class="l1" style="height:${((A2.L.L1.hours.get(h) || { n: 0 }).n / mx) * 100}%"></i><i class="l2" style="height:${((A2.L.L2.hours.get(h) || { n: 0 }).n / mx) * 100}%"></i></div><span>${p2(new Date(h).getHours())}</span></div>`).join('') + `</div>`;
}

function detail(A2, c) {
  if (!LAY.sel) return '<div class="muted">Clique num carrinho do mapa para ver o histórico dele.</div>';
  const [k, no] = LAY.sel.split('-'); const g = A2.L[k]; const t = g && g.trays.get(+no);
  if (!t) return '';
  const evs = c.an.ev.filter((e) => e.grp === 'car' && 'L' + e.layer === k && +e.no === +no).sort((a, b) => b.start - a.start).slice(0, 10);
  const rows = t.rows.slice().sort((a, b) => b.t - a.t).slice(0, 15);
  return `<div class="cdet"><h3>Carrinho ${no} · Camada ${k.slice(1)}</h3><div class="lk"><div><label>Peças hoje</label><b>${fmt(t.n)}</b></div><div><label>Mediana da camada</label><b>${fmt(g.med)}</b></div><div><label>Rejeitos</label><b>${fmt(t.rej)}</b></div><div><label>Sem descarga</label><b>${fmt(t.stuck)}</b></div><div><label>Falhas hoje</label><b>${t.fh ? t.fh.n : 0}</b><small>${t.fh ? dur(t.fh.secs) : ''}</small></div><div><label>Última peça</label><b>${t.last ? hhmm(t.last) : '—'}</b></div></div>` +
    (t.fn ? `<div class="alert crit" style="margin:8px 0">Em falha agora desde ${hhmm(t.fn.since)}.</div>` : '') +
    `<div class="grid2"><div><h4>Falhas hoje</h4>${evs.length ? `<table><thead><tr><th>Início</th><th>Fim</th><th class="r">Duração</th></tr></thead><tbody>${evs.map((e) => `<tr><td>${hhmmss(e.start)}</td><td>${e.end ? hhmmss(e.end) : 'em andamento'}</td><td class="r">${dur(((e.end || c.now) - e.start) / 1000)}</td></tr>`).join('')}</tbody></table>` : '<div class="muted">Sem falhas registradas hoje.</div>'}</div>` +
    `<div><h4>Últimas peças</h4>${rows.length ? `<table><thead><tr><th>Hora</th><th>Pacote</th><th>Ind.</th><th>Saída</th><th>Motivo</th></tr></thead><tbody>${rows.map((r) => `<tr class="${A.isRej(r) ? 'rj' : ''}"><td>${hhmmss(r.t)}</td><td>${esc(r.wb)}</td><td>${r.ind}</td><td>${esc(r.dc || '—')}</td><td>${r.ex ? esc(A.reasonLabel(r.ex)) : '<span class="muted">ok</span>'}</td></tr>`).join('')}</tbody></table>` : '<div class="muted">Sem peças neste carrinho hoje.</div>'}</div></div></div>`;
}

export function renderLayers(root, c) {
  if (!root.dataset.ready) {
    root.dataset.ready = '1';
    root.innerHTML = '<div id="layBody"></div>';
    root.addEventListener('click', (e) => {
      const m = e.target.closest('[data-laymode]'); if (m) { LAY.mode = m.dataset.laymode; c.redraw(); return; }
      const k = e.target.closest('[data-car]'); if (k) { LAY.sel = LAY.sel === k.dataset.car ? null : k.dataset.car; c.redraw(); }
    });
  }
  const A2 = analyzeLayers(c);
  const { L1, L2 } = A2.L;
  const tot = L1.fall + L2.fall;
  const modes = [['pecas', 'Peças por carrinho'], ['rej', 'Rejeitos'], ['stuck', 'Sem descarga'], ['falha', 'Falhas hoje']];
  const legend = { pecas: 'Azul = peças recebidas (mais escuro = mais). Laranja = bem abaixo da mediana da camada. Preto = nenhuma peça. Vermelho = em falha agora.', rej: 'Vermelho = carrinho com rejeitos (mais escuro = maior taxa).', stuck: 'Laranja = carrinho com peças alimentadas há mais de 20 min sem saída registrada.', falha: 'Vermelho = carrinho com falha registrada hoje (mais escuro = mais falhas).' }[LAY.mode];
  const att = A2.flags.slice(0, 25);
  root.querySelector('#layBody').innerHTML =
    `<div class="vwbar"><div><h2>Camadas e carrinhos <small>L1 e L2 do sorter, lado a lado</small></h2></div></div>` +
    `<div class="card"><h2>Como o sorter está organizado <small>lido dos dados de hoje</small></h2><div class="lstruct">` +
    `<div><b>2 camadas</b> (L1 e L2), cada uma com seus carrinhos e sua parte do sorter</div>` +
    `<div><b>L1</b> = induções ${[...L1.inds].sort((a, b) => a - b).map(p2).join(', ') || '—'}</div><div><b>L2</b> = induções ${[...L2.inds].sort((a, b) => a - b).map(p2).join(', ') || '—'}</div>` +
    `<div><b>${L1.nTray} + ${L2.nTray} carrinhos</b> numerados de 1 a ${Math.max(L1.nTray, L2.nTray)} em cada camada</div>` +
    `<div>Peças hoje: <b>L1 ${fmt(L1.fall)}</b> (${pct(L1.fall, tot, 0)}) · <b>L2 ${fmt(L2.fall)}</b> (${pct(L2.fall, tot, 0)})</div></div></div>` +
    `<div class="grid2 laycards">${layerCard(L1, A2, c)}${layerCard(L2, A2, c)}</div>` +
    `<div class="card"><h2>Peças por hora e camada <small>L1 vs L2</small></h2>${hourly(A2)}<div class="legend"><span><i class="lg" style="background:#2f6fed"></i>L1</span><span><i class="lg" style="background:#7a4cd6"></i>L2</span></div></div>` +
    `<div class="card"><h2>Mapa de carrinhos <small>cada quadrado é um carrinho</small></h2>` +
    `<div class="seg big" style="margin:4px 0 8px">${modes.map(([k, n]) => `<button data-laymode="${k}" class="${LAY.mode === k ? 'on' : ''}">${n}</button>`).join('')}</div><div class="muted" style="margin-bottom:8px">${legend}</div>` +
    `<div class="grid2"><div><h3>Camada 1</h3>${grid(L1, LAY.mode)}</div><div><h3>Camada 2</h3>${grid(L2, LAY.mode)}</div></div>${detail(A2, c)}</div>` +
    `<div class="card"><h2>Carrinhos que merecem atenção <small>${att.length ? att.length + ' sinalizados' : 'nenhum'}</small></h2>${att.length ? `<div class="scroll"><table><thead><tr><th>Camada</th><th>Carrinho</th><th>Por quê</th><th class="r">Peças</th><th class="r">Rejeitos</th></tr></thead><tbody>${att.map((f) => `<tr data-car="${f.t.key}" class="${f.sev >= 3 ? 'rj' : ''}"><td>L${f.layer.slice(1)}</td><td><b>${f.no}</b></td><td>${f.why.map(esc).join(' · ')}</td><td class="r">${fmt(f.t.n)}</td><td class="r">${fmt(f.t.rej)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nenhum carrinho com sinal de problema agora.</div>'}</div>`;
}
