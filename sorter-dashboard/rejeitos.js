// Aba "Rejeitos": rejeitos de qualquer período escolhido, hora a hora.
// • Período dentro de hoje → análise completa a partir do trace do dia (motivo, saída, indução, rota, lista de peças).
// • Período que inclui dias anteriores → resumo por hora do próprio sorter (peças, exceções, Chute block). O sorter não
//   entrega motivo/saída/indução de dias passados sem uma varredura pesada, que o painel evita de propósito (somente leitura).
import * as A from './analysis.js';
import { summary } from './api.js';

const HOUR = 3600000, DAY = 86400000, MAXD = 31;
const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
const dec = (n, d = 1) => Number(n).toFixed(d).replace('.', ',');
const pct = (a, b, d = 1) => (b ? dec((a / b) * 100, d) + '%' : '—');
const p2 = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wk = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const hh = (ms) => p2(new Date(ms).getHours()) + ':00';
const hhmmss = (ms) => { const d = new Date(ms); return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; };
const dBr = (ms) => { const d = new Date(ms); return `${wk[d.getDay()]} ${p2(d.getDate())}/${p2(d.getMonth() + 1)}`; };
const hourStart = (ms) => { const d = new Date(ms); d.setMinutes(0, 0, 0); return d.getTime(); };
const inputVal = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const rateCls = (r, th = 3) => (r >= th * 2 ? 'bad' : r >= th ? 'warn' : 'ok');

const R = { mode: 'today', from: 0, to: 0, hist: null, histKey: '', busy: false, err: '', list: 200, tab: 'motivo', reason: '' };
const PRESETS = [['today', 'Hoje'], ['hour', 'Hora atual'], ['prev', 'Hora anterior'], ['last3', 'Últimas 3 h'], ['last6', 'Últimas 6 h'], ['custom', 'Escolher período']];

function range(now, d0) {
  const h = hourStart(now);
  switch (R.mode) {
    case 'hour': return [h, now + 1];
    case 'prev': return [h - HOUR, h];
    case 'last3': return [h - 2 * HOUR, now + 1];
    case 'last6': return [h - 5 * HOUR, now + 1];
    case 'custom': {
      const a = R.from || d0, b = R.to || now;
      return [Math.min(a, b), Math.max(a, b) + (R.to ? 0 : 1)];
    }
    default: return [d0, now + 1];
  }
}

// ---------- histórico (resumo por hora do sorter) ----------
const parseArea = (t) => { const m = /(\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{2}):(\d{2})/.exec(String(t || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : NaN; };
async function loadHist(a, b, redraw) {
  const A0 = hourStart(a), B0 = Math.min(Math.ceil(b / HOUR) * HOUR, Date.now() + HOUR);
  const key = A0 + '|' + B0;
  if (R.histKey === key && R.hist) return;
  if (R.busy === key) return;
  R.busy = key; R.err = '';
  try {
    const r = await summary({ start: A0, end: B0 - 1000, group: 60 });
    const rows = [];
    for (const x of r.data || []) {
      const t = hourStart(parseArea(x.timearea)); if (!Number.isFinite(t)) continue;
      rows.push({ t, total: +x.sorter_sorttotal || 0, abn: +x.sorter_abnormaltotal || 0, blk: +x.sorter_chuteblocktotal || 0 });
    }
    rows.sort((p, q) => p.t - q.t);
    R.hist = rows; R.histKey = key;
  } catch (e) { R.err = e && e.message ? e.message : String(e); R.hist = null; R.histKey = ''; }
  R.busy = false;
  redraw();
}

// ---------- blocos ----------
function kpi(cls, label, val, sub) { return `<div class="kpi ${cls}"><label>${label}</label><b>${val}</b><span>${sub}</span></div>`; }

function hourTable(H, cur, th, hist, rejLabel) {
  const eligible = H.filter((g) => g.total >= 200 && g.rej >= 5);
  const worst = eligible.length ? eligible.reduce((a, g) => (g.rej / g.total > a.rej / a.total ? g : a)) : null;
  const mx = Math.max(1, ...H.map((g) => g.rej));
  const rows = H.map((g) => {
    const rate = g.total ? (g.rej / g.total) * 100 : 0, isCur = g.t === cur;
    const pph = isCur ? Math.round((g.total * 60) / Math.max(1, (Date.now() - cur) / 60000)) : g.total;
    return `<tr class="${worst === g ? 'worst' : ''}"><td><b>${dBr(g.t)} ${hh(g.t)}</b>${isCur ? ' <span class="tag">parcial</span>' : ''}${worst === g ? ' <span class="tag">pior hora</span>' : ''}</td>` +
      `<td class="r">${fmt(g.total)}</td><td class="r">${fmt(pph)}${isCur ? ' <span class="muted">/h</span>' : ''}</td>` +
      `<td class="bar"><i style="width:${(g.rej / mx) * 100}%"></i><span>${fmt(g.rej)}</span></td><td><span class="rate ${rateCls(rate, th)}">${pct(g.rej, g.total)}</span></td>` +
      (hist ? `<td class="r">${fmt(g.blk)}</td><td class="r">${fmt(g.abn - g.blk)}</td>`
        : `<td>${g.reason ? `<b>${esc(A.reasonLabel(g.reason[0]))}</b> <span class="muted">(${g.reason[1]})</span>` : '—'}</td><td>${g.topChute ? `<b>${esc(A.chuteLabel(g.topChute[0]))}</b> <span class="muted">(${g.topChute[1]})</span>` : '—'}</td><td>${g.topInd ? `${p2(g.topInd[0])} <span class="muted">(${g.topInd[1]})</span>` : '—'}</td>`) + '</tr>';
  }).join('');
  const head = hist ? '<th class="r">Chute block</th><th class="r">Outras exceções</th>' : '<th>Motivo principal</th><th>Saída principal</th><th>Ind. principal</th>';
  return `<div class="scroll"><table><thead><tr><th>Hora</th><th class="r">Peças</th><th class="r">PPH</th><th>${esc(rejLabel)}</th><th>Taxa</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function ranking(list, head, labelFn, tot) {
  if (!list.length) return '<div class="empty">Sem rejeitos neste período.</div>';
  const mx = Math.max(1, ...list.map((g) => g.n));
  return `<div class="scroll"><table><thead><tr><th>${head}</th><th>Rejeitos</th><th class="r">% do total</th>${list[0].total != null ? '<th class="r">Peças</th><th class="r">Taxa</th>' : ''}</tr></thead><tbody>` +
    list.map((g) => `<tr><td><b>${labelFn(g.key)}</b></td><td class="bar"><i style="width:${(g.n / mx) * 100}%"></i><span>${fmt(g.n)}</span></td><td class="r">${pct(g.n, tot, 0)}</td>` +
      (g.total != null ? `<td class="r">${fmt(g.total)}</td><td class="r"><span class="rate ${rateCls((g.n / g.total) * 100)}">${pct(g.n, g.total)}</span></td>` : '') + '</tr>').join('') + '</tbody></table></div>';
}

export function renderRej(root, c) {
  const prevMode = A.getRejectMode();
  if (R.reason && R.reason !== '__other') A.setRejectMode('all'); // com motivo escolhido, só ele conta como rejeito
  try { renderRej2(root, c); } finally { A.setRejectMode(prevMode); }
}
const OTHER = '__other';
function renderRej2(root, c) {
  const f = R.reason && R.reason !== OTHER ? { reason: R.reason } : {};
  const { now, d0 } = c, [a, b] = range(now, d0), th = c.cfg.rejectThreshold, level = c.cfg.routeLevel;
  const detailed = a >= d0;
  const cur = hourStart(now);
  // ----- barra de controle -----
  const bar = `<div class="vwbar"><div><h2>Rejeitos <small>qualquer período, hora a hora</small></h2>` +
    `<p class="muted what">Escolha o período; a tabela mostra, para cada hora cheia, as peças, os rejeitos e a taxa. ${detailed ? 'Dentro de hoje você também vê o motivo, a saída, a indução e a rota de cada rejeito.' : 'Período com dias anteriores: números por hora vindos do resumo do sorter (sem motivo/saída por peça).'}</p></div>` +
    `<div class="vwctl rejctl">` + PRESETS.map(([k, t]) => `<button class="btn ${R.mode === k ? 'on' : ''}" data-rej="${k}">${t}</button>`).join('') +
    (R.mode === 'custom' ? `<label>De <input type="datetime-local" id="rejFrom" value="${inputVal(R.from || d0)}" /></label><label>Até <input type="datetime-local" id="rejTo" value="${inputVal(R.to || now)}" /></label><button class="btn primary" data-rej="apply">Aplicar</button>` : '') +
    `</div></div>`;
  const spanTxt = `${dBr(a)} ${hh(a)} → ${b > now ? 'agora' : dBr(b) + ' ' + hh(b)}`;
  if (!detailed && (b - a) / DAY > MAXD) { root.innerHTML = bar + `<div class="card"><div class="empty">Período grande demais (máx. ${MAXD} dias).</div></div>`; return; }

  const rl = R.reason ? (R.reason === OTHER ? 'Outras exceções' : A.reasonLabel(R.reason)) : c.rejLabel;
  const chip = (k, t, n) => `<button class="btn ${R.reason === k ? 'on' : ''}" data-rej="reason:${esc(k)}">${esc(t)}${n != null ? ` <b>${fmt(n)}</b>` : ''}</button>`;
  let chips = '';
  let body = '';
  if (detailed) {
    // ----- detalhado (trace do dia) -----
    const rows = c.all.filter((r) => r.t >= a && r.t < b), fall = rows.filter((r) => r.dc);
    { const all = A.byException(fall, {}, level); const blkN = all.filter((x) => x.reason === A.BLOCK).reduce((q, x) => q + x.n, 0);
      chips = `<div class="subtabs rejmot"><span class="muted">Motivo:</span> ` + chip('', 'Padrão (config.)') + chip(A.BLOCK, 'Chute block', blkN) + all.filter((x) => x.reason !== A.BLOCK).map((x) => chip(x.reason, A.reasonLabel(x.reason), x.n)).join('') + `</div>`; }
    const H = A.hourly(fall, f, level).filter((g) => g.total > 0);
    for (const g of H) {
      const m = new Map(); for (const r of fall) if (r.t >= g.t && r.t < g.t + HOUR && A.isRejF(r, f)) m.set(r.ex, (m.get(r.ex) || 0) + 1);
      g.reason = [...m].sort((x, y) => y[1] - x[1])[0] || null;
    }
    const tot = fall.length, rej = fall.filter((r) => A.isRejF(r, f)).length, blk = fall.filter(A.isBlock).length;
    const pend = rows.filter((r) => !r.dc && A.isRejF(r, f)).length;
    const eligible = H.filter((g) => g.total >= 200 && g.rej >= 5), worst = eligible.length ? eligible.reduce((x, g) => (g.rej / g.total > x.rej / x.total ? g : x)) : null;
    const hrs = Math.max(1 / 60, (Math.min(b, now) - a) / HOUR);
    const kp = `<div class="mapkpis">` +
      kpi('', 'Peças processadas', fmt(tot), `${spanTxt} · ${dec(tot / hrs, 0)} por hora em média`) +
      kpi(rej ? 'blk' : 'ok', rl, fmt(rej), `${pct(rej, tot, 2)} das peças${pend ? ` · +${fmt(pend)} em trânsito (ainda sem descarga)` : ''}`) +
      kpi('', 'Chute block', fmt(blk), (R.reason && R.reason !== A.BLOCK ? 'saída recusou a peça (fora do filtro de motivo)' : `saída recusou a peça · ${pct(blk, rej || 1, 0)} dos rejeitos`)) +
      kpi(worst ? 'warn' : '', 'Pior hora', worst ? hh(worst.t) : '—', worst ? `${pct(worst.rej, worst.total)} · ${fmt(worst.rej)} de ${fmt(worst.total)} peças` : 'sem hora com volume suficiente (200 peças e 5 rejeitos)') +
      kpi('', 'Horas no período', fmt(H.length), 'com peças descarregadas') + `</div>`;
    const by = (keyFn, except) => [...A.groupBy(fall, f, level, keyFn, except).values()].filter((g) => g.rej > 0).map((g) => ({ key: g.key, n: g.rej, total: g.total })).sort((x, y) => y.n - x.n);
    const reasons = A.byException(fall, {}, level).map((x) => ({ key: x.reason, n: x.n })).filter((x) => (R.reason ? x.key === R.reason : A.isRej({ ex: x.key })));
    const chutes = [...A.groupBy(fall, f, level, (r) => A.chuteKey(r), 'chute', true).values()].filter((g) => g.rej > 0).map((g) => ({ key: g.key, n: g.rej, total: g.total })).sort((x, y) => y.n - x.n).slice(0, 30);
    const inds = by((r) => r.ind, 'ind').slice(0, 12), routes = by((r) => A.routeKey(r, level), 'route').slice(0, 30);
    const tabs = [['motivo', 'Por motivo', reasons.length], ['saida', 'Por saída (Chute block)', chutes.length], ['ind', 'Por indução', inds.length], ['rota', 'Por rota', routes.length]];
    const pane = R.tab === 'saida' ? ranking(chutes, 'Saída', (k) => esc(A.chuteLabel(k)), chutes.reduce((s, g) => s + g.n, 0))
      : R.tab === 'ind' ? ranking(inds, 'Indução', (k) => p2(k), rej)
      : R.tab === 'rota' ? ranking(routes, 'Rota', (k) => esc(k), rej)
      : ranking(reasons, 'Motivo', (k) => esc(A.reasonLabel(k)), rej);
    const L = A.recent(rows, f, level, 5000), lim = R.list;
    const list = L.length ? `<div class="scroll rec"><table><thead><tr><th>Hora</th><th>Waybill</th><th>Ind.</th><th>Saída pretendida</th><th>Caiu em</th><th>Motivo</th><th>Rota</th><th class="r">Peso (kg)</th></tr></thead><tbody>` +
      L.slice(0, lim).map((r) => `<tr class="${r.dc ? '' : 'transit'}"><td>${hhmmss(r.t)}</td><td>${esc(r.wb)}</td><td>${p2(r.ind)}</td><td><b>${esc(A.chuteLabel(A.chuteKey(r)))}</b></td><td>${esc(r.dc || 'em trânsito')}</td><td>${esc(A.reasonLabel(r.ex))}</td><td>${esc(A.routeKey(r, level))}</td><td class="r">${r.w.toFixed(2)}</td></tr>`).join('') +
      `</tbody></table>${L.length > lim ? `<button class="btn" data-rej="more" style="margin:8px">Mostrar mais (+500) · exibindo ${fmt(Math.min(L.length, lim))} de ${fmt(L.length)}</button>` : ''}</div>` : '<div class="empty">Sem rejeitos neste período.</div>';
    R.csv = { head: ['Hora', 'Waybill', 'Ind', 'Saida pretendida', 'Caiu em', 'Motivo', 'Rota', 'Peso'], rows: L.map((r) => [hhmmss(r.t), r.wb, r.ind, A.chuteKey(r), r.dc || '', r.ex, A.routeKey(r, level), r.w.toFixed(2)]), name: 'rejeitos' };
    body = kp +
      `<div class="card"><h2>Hora a hora <small>${esc(spanTxt)} · cada linha é uma hora cheia; "parcial" = hora em andamento (PPH extrapolado)</small></h2>${H.length ? hourTable(H, cur, th, false, rl) : '<div class="empty">Sem peças neste período.</div>'}</div>` +
      `<div class="card"><h2>De onde vêm os rejeitos <small>qual motivo, saída, indução ou rota concentra mais</small></h2><div class="subtabs">${tabs.map(([k, t, n]) => `<button class="btn ${R.tab === k ? 'on' : ''}" data-rej="tab:${k}">${t} <b>${n}</b></button>`).join('')}</div>${pane}</div>` +
      `<div class="card"><h2>Lista de rejeitos <small>${fmt(L.length)} no período · mais recentes primeiro</small> <button class="btn" data-rej="csv" style="float:right">Exportar CSV</button></h2>${list}</div>`;
  } else {
    // ----- histórico (resumo por hora) -----
    loadHist(a, b, c.redraw);
    const mode = A.getRejectMode();
    const H = (R.hist || []).filter((x) => x.t < b && x.t + HOUR > a).map((x) => ({ t: x.t, total: x.total, rej: R.reason === A.BLOCK ? x.blk : R.reason === OTHER ? x.abn - x.blk : mode === 'all' ? x.abn : x.blk, abn: x.abn, blk: x.blk }));
    chips = `<div class="subtabs rejmot"><span class="muted">Motivo:</span> ` + chip('', 'Padrão (config.)') + chip(A.BLOCK, 'Chute block', (R.hist || []).filter((x) => x.t < b && x.t + HOUR > a).reduce((q, x) => q + x.blk, 0)) + chip(OTHER, 'Outras exceções', (R.hist || []).filter((x) => x.t < b && x.t + HOUR > a).reduce((q, x) => q + x.abn - x.blk, 0)) + `</div>`;
    const tot = H.reduce((s, g) => s + g.total, 0), rej = H.reduce((s, g) => s + g.rej, 0), blk = H.reduce((s, g) => s + g.blk, 0);
    const eligible = H.filter((g) => g.total >= 200 && g.rej >= 5), worst = eligible.length ? eligible.reduce((x, g) => (g.rej / g.total > x.rej / x.total ? g : x)) : null;
    R.csv = { head: ['Hora', 'Pecas', 'Rejeitos', 'Chute block', 'Outras excecoes'], rows: H.map((g) => [dBr(g.t) + ' ' + hh(g.t), g.total, g.rej, g.blk, g.abn - g.blk]), name: 'rejeitos_por_hora' };
    body = (R.busy ? '<div class="card"><div class="empty">Buscando o resumo por hora no sorter…</div></div>' : '') +
      (R.err ? `<div class="card"><div class="empty">Não foi possível buscar o histórico: ${esc(R.err)}</div></div>` : '') +
      (H.length ? `<div class="mapkpis">` + kpi('', 'Peças processadas', fmt(tot), `${spanTxt} (horas cheias)`) + kpi(rej ? 'blk' : 'ok', rl, fmt(rej), `${pct(rej, tot, 2)} das peças`) + kpi('', 'Chute block', fmt(blk), 'saída recusou a peça') +
        kpi(worst ? 'warn' : '', 'Pior hora', worst ? `${dBr(worst.t)} ${hh(worst.t)}` : '—', worst ? `${pct(worst.rej, worst.total)} · ${fmt(worst.rej)} de ${fmt(worst.total)}` : 'sem hora com volume suficiente') + kpi('', 'Horas', fmt(H.length), 'no período') + `</div>` +
        `<div class="card"><h2>Hora a hora <small>${esc(spanTxt)} · números do resumo do sorter</small> <button class="btn" data-rej="csv" style="float:right">Exportar CSV</button></h2>${hourTable(H, cur, th, true, rl)}</div>` +
        `<p class="muted">Para dias anteriores o sorter só informa totais por hora. Motivo, saída e indução por peça ficam disponíveis para o dia de hoje (escolha "Hoje", "Hora atual" ou um período dentro de hoje).</p>` : (R.busy || R.err ? '' : '<div class="card"><div class="empty">Sem dados neste período.</div></div>'));
  }
  root.innerHTML = bar + chips + body;

  if (!root._rej) {
    root._rej = true;
    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-rej]'); if (!t) return;
      const k = t.dataset.rej;
      if (k === 'more') R.list += 500;
      else if (k === 'csv') { if (R.csv) c2.csv(R.csv); return; }
      else if (k === 'apply') { const f = root.querySelector('#rejFrom').value, g = root.querySelector('#rejTo').value; R.from = f ? new Date(f).getTime() : 0; R.to = g ? new Date(g).getTime() : 0; }
      else if (k.startsWith('tab:')) R.tab = k.slice(4);
      else if (k.startsWith('reason:')) { R.reason = k.slice(7); R.list = 200; }
      else { R.mode = k; R.list = 200; R.hist = null; R.histKey = ''; R.err = ''; if (k === 'custom' && !R.from) { R.from = hourStart(Date.now()) - 3 * HOUR; R.to = 0; } }
      c2.redraw();
    });
  }
  c2 = c;
}
let c2 = null;
