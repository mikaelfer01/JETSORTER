// Abas "Equipamentos" e "Produtividade".
import * as A from './analysis.js';
import { KINDS, IND_COLS, devName, IND_STATUS } from './devices.js';

const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
const dec = (n, d = 1) => Number(n).toFixed(d).replace('.', ',');
const pct = (a, b, d = 1) => (b ? dec((a / b) * 100, d) + '%' : '—');
const p2 = (n) => String(n).padStart(2, '0');
const hhmm = (ms) => { const d = new Date(ms); return p2(d.getHours()) + ':' + p2(d.getMinutes()); };
const hhmmss = (ms) => hhmm(ms) + ':' + p2(new Date(ms).getSeconds());
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dTxt = (s) => (s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${dec(s / 3600, 1)} h`);
const nn = (n) => String(n).padStart(2, '0');
const sevCls = (s) => (s >= 3 ? 'bad' : s === 2 ? 'warn' : s === 1 ? 'info' : 'ok');

function kpi(cls, label, val, sub = '') {
  return `<div class="kpi ${cls}"><label>${label}</label><b>${val}</b><small>${sub}</small></div>`;
}

// ---------------- Equipamentos ----------------
function indState(x, now) {
  const [cls, txt] = IND_STATUS[x.status] || ['idle', '—'];
  let since = '';
  if (x.status === 'parada' || x.status === 'falha') since = `desde ${hhmm(x.cur.since)} (${dTxt((now - x.cur.since) / 1000)})`;
  else if (x.status === 'ativa') since = `última peça há ${dTxt((now - x.lastPiece) / 1000)}`;
  else if (x.lastPiece) since = `última peça há ${dTxt((now - x.lastPiece) / 1000)}`;
  else since = 'sem peças hoje';
  return [cls, txt, since];
}

function swimlane(an, c) {
  const { now, dayStart } = c;
  const lanes = [...an.inds.map((x) => ({ id: 'i' + x.no, label: 'Ind ' + nn(x.no) })), { id: 'c1', label: 'Carrinhos L1' }, { id: 'c2', label: 'Carrinhos L2' }];
  const W = 1000, ml = 78, mr = 14, mt = 8, lh = 17, H = mt + lanes.length * lh + 24, iw = W - ml - mr, span = Math.max(60000, now - dayStart);
  const laneIdx = new Map(lanes.map((l, i) => [l.id, i]));
  const col = (k) => (k === 'stop' ? 'var(--muted)' : ['cortina', 'sensor', 'falha', 'wcs', 'plc', 'car'].includes(k) ? 'var(--bad)' : ['larg', 'comp'].includes(k) ? 'var(--warn)' : 'var(--blue)');
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  lanes.forEach((l, i) => {
    const y = mt + i * lh;
    s += `<rect x="${ml}" y="${y}" width="${iw}" height="${lh - 2}" fill="${i % 2 ? 'transparent' : 'var(--card2)'}"/><text x="${ml - 6}" y="${y + 12}" text-anchor="end" font-size="11" fill="var(--muted)">${l.label}</text>`;
  });
  const hrs = Math.ceil(span / 3600000);
  for (let h = 0; h <= hrs; h++) {
    const x = ml + ((h * 3600000) / span) * iw;
    if (x > W - mr) break;
    s += `<line x1="${x}" x2="${x}" y1="${mt}" y2="${H - 22}" stroke="var(--line)"/><text x="${x}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="var(--muted)">${p2(new Date(dayStart + h * 3600000).getHours())}h</text>`;
  }
  const draw = (e, end) => {
    const id = e.grp === 'ind' ? 'i' + e.no : e.grp === 'car' ? (e.layer === '1' ? 'c1' : 'c2') : null;
    if (!id || !laneIdx.has(id) || ['auto', 'sorter_auto'].includes(e.kind)) return '';
    const y = mt + laneIdx.get(id) * lh;
    const x0 = ml + (Math.max(0, e.start - dayStart) / span) * iw, w = Math.max(2.5, ((Math.min(end, now) - Math.max(e.start, dayStart)) / span) * iw);
    const tip = `${devName(e)} · ${KINDS[e.kind].label}\n${hhmmss(e.start)} → ${e.end ? hhmmss(e.end) : 'em andamento'} (${dTxt(Math.max(0, (end - e.start) / 1000))})`;
    return `<rect x="${x0}" y="${y + 2}" width="${w}" height="${lh - 6}" rx="1.5" fill="${col(e.kind)}" opacity="${e.kind === 'stop' ? 0.45 : 0.9}" data-tip="${esc(tip)}"/>`;
  };
  for (const e of an.ev) s += draw(e, e.end ?? now);
  for (const x of an.inds) if (x.cur && x.cur.kind === 'stop') s += draw({ ...x.cur, grp: 'ind', start: x.cur.since, end: null, kind: 'stop' }, now);
  return s + '</svg>';
}

export function renderDevices(el, c) {
  const { an, now, flt, cfg } = c;
  const L = c.insights;
  const carMin = an.carriers.reduce((a, x) => a + x.secs, 0);
  const sens = (an.cnt.cortina || 0) + (an.cnt.sensor || 0);
  const sc = an.statusCount, nm = (st) => an.inds.filter((x) => x.status === st).map((x) => nn(x.no)).join(', ');
  const kp = [
    kpi('ok', 'Induções alimentando', `${sc.ativa}<em>/${an.inds.length}</em>`, 'com peça nos últimos 5 min'),
    kpi('', 'Ligadas, sem peças', sc.ociosa, sc.ociosa ? nm('ociosa') : 'nenhuma'),
    kpi(sc.parada ? 'warn' : 'ok', 'Induções paradas', sc.parada, sc.parada ? nm('parada') : 'nenhuma'),
    kpi(sc.falha ? 'bad' : 'ok', 'Em falha agora', sc.falha, sc.falha ? nm('falha') : 'nenhuma'),
    kpi(an.closed.length ? 'warn' : 'ok', 'Saídas fechadas', an.closed.length, `${an.full.length} cheia(s) agora`),
    kpi(an.intermit.length ? 'bad' : sens ? 'warn' : 'ok', 'Cortina / sensor hoje', sens, an.intermit.length ? `<b class="badt">oscilando: ind ${an.intermit.map((x) => nn(x.no)).join(', ')}</b>` : 'sem oscilação detectada')
  ].join('');
  const mx = {};
  for (const k of IND_COLS) mx[k] = Math.max(1, ...an.inds.map((x) => x.counts[k] || 0));
  const th = IND_COLS.map((k) => `<th class="r" title="${esc(KINDS[k].label)}">${k === 'stop' ? 'Paradas' : KINDS[k].short}</th>`).join('');
  const rows = an.inds.map((x) => {
    const [cls, txt, since] = indState(x, now);
    const cells = IND_COLS.map((k) => {
      const n = x.counts[k] || 0, i = n ? Math.max(0.15, n / mx[k]) : 0;
      const sevk = KINDS[k].sev >= 3 ? 'bad' : KINDS[k].sev === 2 ? 'warn' : 'blue';
      return `<td class="c hz ${sevk}" style="--i:${i.toFixed(2)}" ${n ? `data-tip="${esc(KINDS[k].label + ': ' + n + ' ocorrência(s), ' + dTxt(x.secs[k] || 0) + ' somados')}"` : ''}>${n || ''}</td>`;
    }).join('');
    return `<tr data-sel="ind|${x.no}" data-goto2="1"><td><b>${nn(x.no)}</b>${x.intermit ? ' <span class="tag">⚠ oscilando</span>' : ''}</td>` +
      `<td><span class="pillstate sm ${cls}">${esc(txt)}</span> <span class="muted sm">${since}</span></td>` +
      `<td class="r">${x.avail == null ? '—' : `<span class="rate ${x.avail < 0.7 ? 'bad' : x.avail < 0.9 ? 'warn' : ''}">${dec(x.avail * 100, 0)}%</span>`}</td><td class="r">${x.stopS ? dTxt(x.stopS) : '—'}</td>${cells}` +
      `<td>${x.lastCrit ? `${KINDS[x.lastCrit.kind].short} ${hhmm(x.lastCrit.start)}` : '<span class="muted">—</span>'}</td></tr>`;
  }).join('');
  const closedRows = an.closed.map((x) => `<tr data-goto="chute|${x.no}"><td><b>${x.no}</b></td><td>${hhmm(x.since)} <span class="muted">(${dTxt((now - x.since) / 1000)})</span></td><td class="r">${fmt(x.pieces)}</td><td class="r">${x.rej ? `<b class="badt">${fmt(x.rej)}</b>` : '0'}</td></tr>`).join('');
  const fullRows = an.full.map((x) => `<tr data-goto="chute|${x.no}"><td><b>${x.no}</b></td><td>${hhmm(x.since)} <span class="muted">(${dTxt((now - x.since) / 1000)})</span></td><td class="r">${fmt(x.pieces)}</td><td class="r">${x.rej ? `<b class="badt">${fmt(x.rej)}</b>` : '0'}</td></tr>`).join('');
  const carRows = an.carriers.slice(0, 12).map((x) => `<tr><td><b>${x.no}</b> <span class="muted">L${x.layer}</span></td><td class="r">${x.n}</td><td class="r">${dTxt(x.secs)}</td><td class="r">${dTxt(x.maxS)}</td><td class="r">${hhmm(x.last)}</td></tr>`).join('');
  const fullTop = an.fullTop.map((x) => `<span class="pill" data-goto="chute|${x.no}">${x.no} <b>${x.n}×</b></span>`).join('');
  // feed
  const grp = flt.grp, feed = an.ev.filter((e) => (flt.auto || !['auto', 'sorter_auto'].includes(e.kind)) && (grp === 'all' || e.grp === grp) && (!flt.crit || e.sev >= 3)).sort((a, b) => b.start - a.start).slice(0, flt.more ? 300 : 40);
  const feedRows = feed.map((e) => `<tr class="${e.sev >= 3 ? 'rj' : ''}"><td>${hhmmss(e.start)}</td><td><b>${esc(devName(e))}</b></td><td><span class="sevdot ${sevCls(e.sev)}"></span>${esc(KINDS[e.kind].label)}${e.sensor ? ' (sensor ' + e.sensor + ')' : ''}</td><td class="r">${e.end ? dTxt((e.end - e.start) / 1000) : 'em andamento'}</td></tr>`).join('');
  const lg = (cl, t) => `<span><i class="lg" style="background:${cl}"></i>${t}</span>`;
  el.innerHTML =
    `<div class="vwbar"><div><h2>Equipamentos ao vivo <small>estado atual e histórico de falhas de induções, carrinhos e saídas · fonte: monitor e log de equipamentos do sorter</small></h2></div></div>` +
    `<div class="kpis kpis6">${kp}</div>` +
    `<section class="card insights"><h2>Diagnóstico dos equipamentos <small>leitura automática</small></h2><ul>${L.map((x) => `<li class="${x.lv}"><span>${x.t}</span></li>`).join('')}</ul></section>` +
    `<section class="card"><h2>Induções: estado agora e ocorrências de hoje <small>clique para abrir a indução · célula = nº de ocorrências</small></h2><div class="scroll"><table class="mx"><thead><tr><th>Ind.</th><th>Estado</th><th class="r" title="1 − tempo parada / tempo desde a 1ª peça">Disponib.</th><th class="r">Tempo parada</th>${th}<th>Última falha</th></tr></thead><tbody>${rows}</tbody></table></div></section>` +
    `<div class="grid2">` +
    `<section class="card"><h2>Saídas fechadas e cheias agora <small>impacto = peças destinadas à saída desde que mudou o estado</small></h2>` +
    (an.closed.length ? `<h4 class="sub">Fechadas (${an.closed.length})</h4><div class="scroll sm"><table><thead><tr><th>Saída</th><th>Desde</th><th class="r">Peças destinadas</th><th class="r">Viraram rejeito</th></tr></thead><tbody>${closedRows}</tbody></table></div>` : '<div class="okt">Nenhuma saída fechada.</div>') +
    (an.full.length ? `<h4 class="sub">Cheias (${an.full.length})</h4><table><thead><tr><th>Saída</th><th>Desde</th><th class="r">Peças destinadas</th><th class="r">Viraram rejeito</th></tr></thead><tbody>${fullRows}</tbody></table>` : '') +
    (fullTop ? `<h4 class="sub">Mais ocorrências de "saco cheio" hoje</h4><div>${fullTop}</div>` : '') + `</section>` +
    `<section class="card"><h2>Carrinhos com falha hoje <small>reincidência e tempo parado</small></h2>` +
    (carRows ? `<div class="scroll sm"><table><thead><tr><th>Carrinho</th><th class="r">Falhas</th><th class="r">Tempo total</th><th class="r">Maior</th><th class="r">Última</th></tr></thead><tbody>${carRows}</tbody></table></div>` : '<div class="okt">Nenhuma falha de carrinho hoje.</div>') + `</section></div>` +
    `<section class="card"><h2>Linha do tempo de equipamentos <small>cada barra é um evento (início → fim) · passe o mouse</small></h2><div class="lane">${swimlane(an, c)}</div>` +
    `<div class="legend">${lg('var(--muted)', 'Indução parada')}${lg('var(--bad)', 'Cortina / sensor / falha / WCS / carrinho')}${lg('var(--warn)', 'Pacote fora de medida')}${lg('var(--blue)', 'Partida / reverso / reset')}</div></section>` +
    `<section class="card"><h2>Eventos ao vivo <small>mais recentes primeiro</small><span class="tools">` +
    `<select data-devgrp>${[['all', 'Todos'], ['ind', 'Induções'], ['car', 'Carrinhos'], ['chute', 'Saídas'], ['sorter', 'Sorter']].map(([v, t]) => `<option value="${v}" ${v === grp ? 'selected' : ''}>${t}</option>`).join('')}</select>` +
    `<label class="chk"><input type="checkbox" data-devcrit ${flt.crit ? 'checked' : ''}/> só críticos</label><label class="chk"><input type="checkbox" data-devauto ${flt.auto ? 'checked' : ''}/> mostrar modo automático</label></span></h2>` +
    `<div class="scroll tall"><table><thead><tr><th>Início</th><th>Equipamento</th><th>Evento</th><th class="r">Duração</th></tr></thead><tbody>${feedRows}</tbody></table></div>` +
    `<button class="mini more" data-more="devfeed">${flt.more ? 'Ver menos' : 'Ver mais'}</button></section>`;
}

// ---------------- Produtividade ----------------
export function renderProd(el, c) {
  const { rows, now, dayStart, cfg, outlets } = c;
  const D = A.dupStats ? A.dupStats(rows) : null;
  const inds = new Map();
  const hours = new Set();
  const dupSeen = new Map();
  for (const r of rows) {
    if (r.t < dayStart || !r.ind) continue;
    let x = inds.get(r.ind);
    if (!x) { x = { ind: r.ind, n: 0, rej: 0, byH: new Map(), byM: new Map(), w: 0, wz: 0, wMax: 0, ly: r.ly || '', dup: 0, first: r.t, last: r.t }; inds.set(r.ind, x); }
    x.n++;
    if (r.t < x.first) x.first = r.t;
    if (r.t > x.last) x.last = r.t;
    const h = Math.floor(r.t / 3600000) * 3600000, m = Math.floor(r.t / 60000);
    hours.add(h);
    x.byH.set(h, (x.byH.get(h) || 0) + 1);
    x.byM.set(m, (x.byM.get(m) || 0) + 1);
    if (r.dc && A.isRej(r)) x.rej++;
    if (r.w > 0) { x.w += r.w; x.wMax = Math.max(x.wMax, r.w); } else x.wz++;
    if (r.wb) { const k = r.wb; const prev = dupSeen.get(k); if (prev !== undefined) x.dup++; else dupSeen.set(k, r.ind); }
  }
  const L = [...inds.values()].sort((a, b) => a.ind - b.ind);
  const H = [...hours].sort((a, b) => a - b);
  const tot = L.reduce((a, x) => a + x.n, 0);
  const mxCell = Math.max(1, ...L.flatMap((x) => [...x.byH.values()]));
  const best = L.slice().sort((a, b) => b.n - a.n)[0];
  const stats = L.map((x) => {
    const bh = [...x.byH].sort((a, b) => b[1] - a[1])[0];
    const pk = Math.max(...x.byM.values());
    const act = x.byM.size, span = Math.max(1, Math.round((now - x.first) / 60000));
    const activeH = [...x.byH.values()].filter((v) => v >= 50);
    const avgH = activeH.length ? activeH.reduce((a, b) => a + b, 0) / activeH.length : 0;
    return { ...x, bh, pk, act, span, avgH };
  });
  const off = outlets && outlets.length ? outlets : null;
  let chk = '';
  if (off) {
    const offTot = {};
    for (const o of off) for (let k = 1; k <= 40; k++) if (o['total_' + k] !== undefined) offTot[k] = (offTot[k] || 0) + (+o['total_' + k] || 0);
    const diff = L.reduce((a, x) => a + Math.abs((offTot[x.ind] || 0) - x.n), 0);
    chk = diff <= Math.max(10, tot * 0.002) ? `<b class="ok">✓ Confere com "Feeder feed quantity" do sistema</b> (Δ ${diff})` : `<b class="warn">⚠ Difere do "Feeder feed quantity"</b> (Δ ${fmt(diff)} peças)`;
  }
  const head = H.map((h) => `<th class="c">${p2(new Date(h).getHours())}h</th>`).join('');
  const matrix = stats.map((x) => `<tr data-sel="ind|${x.ind}"><td><b>${nn(x.ind)}</b></td>${H.map((h) => { const v = x.byH.get(h) || 0, i = v ? Math.max(0.08, v / mxCell) : 0; return `<td class="c hz blue" style="--i:${i.toFixed(2)}" ${v ? `data-tip="${esc(`Indução ${nn(x.ind)} · ${p2(new Date(h).getHours())}h: ${fmt(v)} peças`)}"` : ''}>${v ? fmt(v) : ''}</td>`; }).join('')}<td class="r"><b>${fmt(x.n)}</b></td></tr>`).join('');
  const rowsT = stats.map((x) => `<tr data-sel="ind|${x.ind}"><td><b>${nn(x.ind)}</b> <span class="muted">${x.ly.replace('Layer', 'L')}</span></td><td class="bar"><i style="width:${(x.n / (best ? best.n : 1)) * 100}%;--c:var(--blue)"></i><span>${fmt(x.n)}</span></td><td class="r">${pct(x.n, tot)}</td>` +
    `<td class="r">${x.bh ? `${p2(new Date(x.bh[0]).getHours())}h · ${fmt(x.bh[1])}` : '—'}</td><td class="r">${fmt(Math.round(x.avgH))}</td><td class="r">${x.pk}</td>` +
    `<td class="r">${pct(x.act, x.span, 0)}</td><td class="r">${pct(x.rej, x.n, 2)}</td><td class="r">${x.dup ? fmt(x.dup) : '—'}</td><td class="r">${x.n ? dec(x.w / Math.max(1, x.n - x.wz), 2) : '—'}</td><td class="r">${x.wz ? fmt(x.wz) : '—'}</td></tr>`).join('');
  el.innerHTML =
    `<div class="vwbar"><div><h2>Produtividade das induções <small>peças alimentadas hoje (trace) · cada porta = uma linha de operação manual</small></h2></div><div class="check">${chk}</div></div>` +
    `<section class="card"><h2>Mapa de calor: peças alimentadas por hora × indução <small>clique numa linha para abrir a indução</small></h2><div class="scroll"><table class="mx"><thead><tr><th>Ind.</th>${head}<th class="r">Total</th></tr></thead><tbody>${matrix}</tbody></table></div></section>` +
    `<section class="card"><h2>Indicadores por indução <small>ritmo médio considera só horas com ≥ 50 peças · "tempo ativo" = minutos com peça ÷ minutos desde a 1ª peça</small></h2><div class="scroll"><table><thead><tr><th>Indução</th><th>Peças hoje</th><th class="r">% do fluxo</th><th class="r">Melhor hora</th><th class="r">Ritmo médio (peças/h)</th><th class="r">Pico (peças/min)</th><th class="r">Tempo ativo</th><th class="r">Rejeito</th><th class="r" title="Waybills que já tinham sido alimentados em outra tentativa">Reinduções</th><th class="r">Peso médio (kg)</th><th class="r">Peso zerado</th></tr></thead><tbody>${rowsT}</tbody></table></div>` +
    `<p class="muted" style="margin:8px 2px 0">A tela "Ind Staff statistics" (produtividade por funcionário) está vazia no sistema: os operadores não se identificam na indução, então só é possível analisar por porta, não por pessoa.</p></section>`;
}
