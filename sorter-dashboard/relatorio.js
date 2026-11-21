// Aba "Relatório": o mesmo relatório que o bot envia ao Feishu, com gráficos completos (SVG), para qualquer hora do dia.
// Só lê o sorter. Cores seguem o tema (variáveis CSS).
import { hourData, buildCard, postRelatorio, paretoNota, tipoNaHora, planoMd, paretosErroMd, ULT } from './feishu.js';

const HOUR = 3600000;
const p2 = (n) => String(n).padStart(2, '0');
const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
const dec = (n, d = 1) => Number(n).toFixed(d).replace('.', ',');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hh = (ms) => p2(new Date(ms).getHours()) + 'h';
const pc = (a, b) => (b ? (a / b) * 100 : 0);

let cfgNow = {};
const R = { h: 0, data: null, busy: false, err: '', msg: '', key: '' };

async function load(h, redraw) {
  R.busy = true; R.err = ''; redraw();
  try { R.data = await hourData(h, R.cfg || cfgNow); R.h = h; R.key = h + ':' + Math.floor(Date.now() / 60000); } catch (e) { R.err = e.message || String(e); }
  R.busy = false; redraw();
}

// ---------- gráficos ----------
const W = 640, PL = 58, PR = 40, PT = 16, PB = 30;
const nice = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v || 1))); for (const m of [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p; return 10 * p; };
const axis = (max, H, fmtY = fmt) => {
  const n = 4; let s = '';
  for (let i = 0; i <= n; i++) { const y = PT + (H - PT - PB) * (1 - i / n); s += `<line x1="${PL}" x2="${W - PR}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${PL - 6}" y="${y + 4}" text-anchor="end" class="rt">${fmtY(max * i / n)}</text>`; }
  return s;
};
const svg = (H, inner) => `<svg viewBox="0 0 ${W} ${H}" class="rsvg" role="img">${inner}</svg>`;

const tt = (d, h) => { const t = tipoNaHora(d.pareto && (d.pareto.dia || d.pareto), h); return t ? '\nRejeitos por tipo — ' + t : ''; };
const serieHoras = (d) => (d.parc ? [...d.horas, d.parc] : d.horas);
function chartProd(d, cfg, h) {
  const H = 260, hs = serieHoras(d), meta = +cfg.feishuMeta || 0;
  if (!hs.length) return '<p class="muted">Sem dados.</p>';
  const max = nice(Math.max(meta * 1.1, ...hs.map((x) => x.tot), 10) * 1.12), bw = (W - PL - PR) / hs.length;
  const Y = (v) => PT + (H - PT - PB) * (1 - v / max), cx = (i) => PL + i * bw + bw / 2;
  let s = axis(max, H);
  hs.forEach((x, i) => {
    const bx = PL + i * bw + bw * 0.16, w = bw * 0.68, c = !meta ? 'var(--brand)' : x.tot >= meta ? 'var(--ok)' : x.tot >= meta * 0.8 ? 'var(--warn)' : 'var(--bad)';
    s += `<rect x="${bx}" y="${Y(x.tot)}" width="${w}" height="${H - PB - Y(x.tot)}" rx="3" fill="${c}" opacity="${x.h === h ? 1 : 0.75}" ${x.h === h ? 'stroke="var(--ink)" stroke-width="2"' : ''}><title>${hh(x.h)}: processado ${fmt(x.tot)} · aproveitado ${fmt(x.tot - x.abn)} (${dec(pc(x.tot - x.abn, x.tot))}%)${x.h > h ? ' · hora em andamento' : ''}${tt(d, x.h)}</title></rect>`;
    s += `<text x="${cx(i)}" y="${Y(x.tot) - 14}" text-anchor="middle" class="rt b">${fmt(x.tot)}</text><text x="${cx(i)}" y="${H - 10}" text-anchor="middle" class="rt">${p2(new Date(x.h).getHours())}h</text>`;
  });
  s += `<polyline fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-dasharray="7 4" points="${hs.map((x, i) => `${cx(i)},${Y(x.tot - x.abn)}`).join(' ')}"/>` + hs.map((x, i) => `<circle cx="${cx(i)}" cy="${Y(x.tot - x.abn)}" r="3.5" fill="var(--blue)"/><text x="${cx(i)}" y="${Y(x.tot - x.abn) + 14}" text-anchor="middle" class="rt" fill="var(--blue)" style="fill:var(--blue)">${fmt(x.tot - x.abn)}</text>`).join('');
  if (meta) s += `<line x1="${PL}" x2="${W - PR}" y1="${Y(meta)}" y2="${Y(meta)}" stroke="var(--ink)" stroke-dasharray="2 4"/><text x="${W - PR}" y="${Y(meta) - 4}" text-anchor="end" class="rt b">meta ${fmt(meta)}/h</text>`;
  s += `<rect x="${PL}" y="2" width="9" height="9" fill="var(--brand)"/><text x="${PL + 13}" y="10" class="rt">Processado</text><line x1="${PL + 80}" x2="${PL + 98}" y1="6.5" y2="6.5" stroke="var(--blue)" stroke-width="2.5" stroke-dasharray="5 3"/><text x="${PL + 102}" y="10" class="rt">Aproveitado (processado − rejeito)</text>`;
  return svg(H, s);
}

function chartAB(d) {
  const hs = serieHoras(d); if (!hs.length || !d.temLinhas) return '<p class="muted">O sorter não devolveu a divisão por linha (camada L1/L2) agora.</p>';
  const H = 250, max = nice(Math.max(...hs.map((x) => x.a + x.b), 10) * 1.12), bw = (W - PL - PR) / hs.length, Y = (v) => PT + (H - PT - PB) * (1 - v / max);
  let s = axis(max, H);
  hs.forEach((x, i) => {
    const bx = PL + i * bw + bw * 0.16, w = bw * 0.68;
    s += `<rect x="${bx}" y="${Y(x.a)}" width="${w}" height="${H - PB - Y(x.a)}" fill="#f6d77a"><title>${hh(x.h)} · Linha A (L1): ${fmt(x.a)}${tt(d, x.h)}</title></rect><rect x="${bx}" y="${Y(x.a + x.b)}" width="${w}" height="${Y(x.a) - Y(x.a + x.b)}" rx="2" fill="#d9958b"><title>${hh(x.h)} · Linha B (L2): ${fmt(x.b)}${tt(d, x.h)}</title></rect>`;
    s += `<text x="${bx + w / 2}" y="${Y(x.a) - 3}" text-anchor="middle" class="rt">${fmt(x.a)}</text><text x="${bx + w / 2}" y="${Y(x.a + x.b) - 4}" text-anchor="middle" class="rt b">${fmt(x.b)}</text><text x="${bx + w / 2}" y="${H - 10}" text-anchor="middle" class="rt">${p2(new Date(x.h).getHours())}h</text>`;
  });
  s += `<rect x="${PL}" y="2" width="9" height="9" fill="#d9958b"/><text x="${PL + 13}" y="10" class="rt">Linha B (L2)</text><rect x="${PL + 90}" y="2" width="9" height="9" fill="#f6d77a"/><text x="${PL + 103}" y="10" class="rt">Linha A (L1)</text>`;
  return svg(H, s);
}

function chartAprov(d, cfg) {
  const hs = serieHoras(d).filter((x) => x.tot > 0); if (!hs.length) return '<p class="muted">Sem dados.</p>';
  const H = 230, v = hs.map((x) => pc(x.tot - x.abn, x.tot)), lo = Math.max(0, Math.floor((Math.min(...v) - 3) / 5) * 5), hi = 100, step = (W - PL - PR) / hs.length;
  const Y = (p) => PT + (H - PT - PB) * (1 - (p - lo) / (hi - lo)), X = (i) => PL + step * (i + 0.5), lim = 100 - (+cfg.rejectThreshold || 3);
  let s = ''; for (let i = 0; i <= 4; i++) { const p = lo + ((hi - lo) * i) / 4, y = Y(p); s += `<line x1="${PL}" x2="${W - PR}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${PL - 6}" y="${y + 4}" text-anchor="end" class="rt">${dec(p, 0)}%</text>`; }
  if (lim > lo) s += `<line x1="${PL}" x2="${W - PR}" y1="${Y(lim)}" y2="${Y(lim)}" stroke="var(--bad)" stroke-dasharray="6 4"/><text x="${W - PR}" y="${Y(lim) - 4}" text-anchor="end" class="rt b" style="fill:var(--bad)">mínimo ${dec(lim, 0)}%</text>`;
  s += `<polyline fill="none" stroke="var(--ok)" stroke-width="2.5" points="${v.map((p, i) => `${X(i)},${Y(p)}`).join(' ')}"/>` + hs.map((x, i) => `<circle cx="${X(i)}" cy="${Y(v[i])}" r="${x.h === d.hora.h ? 6 : 4.5}" fill="${v[i] < lim ? 'var(--bad)' : 'var(--ok)'}" stroke="var(--card)" stroke-width="2"><title>${hh(x.h)}: ${dec(v[i], 2)}% (${fmt(x.tot - x.abn)} de ${fmt(x.tot)})${tt(d, x.h)}</title></circle><text x="${X(i)}" y="${Y(v[i]) - 9}" text-anchor="middle" class="rt b">${dec(v[i])}%</text><text x="${X(i)}" y="${H - 10}" text-anchor="middle" class="rt">${p2(new Date(x.h).getHours())}h</text>`).join('');
  return svg(H, s);
}

function chartRejRate(d, cfg, h) {
  const H = 210, hs = d.horas.filter((x) => x.tot > 0), lim = +cfg.rejectThreshold || 3;
  if (!hs.length) return '<p class="muted">Sem dados.</p>';
  const rate = hs.map((x) => pc(x.abn, x.tot)), max = nice(Math.max(lim * 1.4, ...rate) * 1.1), step = (W - PL - PR) / hs.length;
  const Y = (v) => PT + (H - PT - PB) * (1 - v / max), X = (i) => PL + step * (i + 0.5);
  let s = axis(max, H, (v) => dec(v, 1) + '%');
  s += `<rect x="${PL}" y="${PT}" width="${W - PL - PR}" height="${Y(lim) - PT}" fill="var(--bad)" opacity=".07"/><line x1="${PL}" x2="${W - PR}" y1="${Y(lim)}" y2="${Y(lim)}" stroke="var(--bad)" stroke-dasharray="6 4"/><text x="${W - PR}" y="${Y(lim) - 4}" text-anchor="end" class="rt b" fill="var(--bad)">limite ${dec(lim)}%</text>`;
  s += `<polyline fill="none" stroke="var(--blue)" stroke-width="2.5" points="${rate.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}"/>`;
  hs.forEach((x, i) => { const bad = rate[i] > lim; s += `<circle cx="${X(i)}" cy="${Y(rate[i])}" r="${x.h === h ? 6 : 4}" fill="${bad ? 'var(--bad)' : 'var(--blue)'}" stroke="var(--card)" stroke-width="2"><title>${hh(x.h)}: ${dec(rate[i], 2)}% (${fmt(x.abn)} de ${fmt(x.tot)})${tt(d, x.h)}</title></circle><text x="${X(i)}" y="${Y(rate[i]) - 9}" text-anchor="middle" class="rt">${dec(rate[i])}%</text><text x="${X(i)}" y="${H - 10}" text-anchor="middle" class="rt">${p2(new Date(x.h).getHours())}h</text>`; });
  return svg(H, s);
}

function chartAcum(d, cfg) {
  const H = 230, hs = d.horas.filter((x) => x.tot > 0), fim = +cfg.feishuFim || 24;
  if (!hs.length) return '<p class="muted">Sem dados.</p>';
  const ini = new Date(hs[0].h).getHours(), last = new Date(hs[hs.length - 1].h).getHours();
  const media = d.dia.tot / hs.length, metaDia = +cfg.metaDia || 0;
  let ac = 0; const pts = hs.map((x) => { ac += x.tot; return [new Date(x.h).getHours() + 1, ac]; });
  const proj = []; let pa = ac; for (let hr = last + 2; hr <= fim; hr++) { pa += media; proj.push([hr, pa]); }
  const max = nice(Math.max(metaDia * 1.05, pa, ac, 10) * 1.06), span = Math.max(1, fim - ini);
  const X = (hr) => PL + ((hr - ini) / span) * (W - PL - PR), Y = (v) => PT + (H - PT - PB) * (1 - v / max);
  let s = axis(max, H);
  for (let hr = ini; hr <= fim; hr += span > 14 ? 2 : 1) s += `<text x="${X(hr)}" y="${H - 10}" text-anchor="middle" class="rt">${p2(hr % 24)}h</text>`;
  if (metaDia) s += `<line x1="${PL}" x2="${W - PR}" y1="${Y(metaDia)}" y2="${Y(metaDia)}" stroke="var(--ink)" stroke-dasharray="6 4"/><text x="${PL + 4}" y="${Y(metaDia) - 4}" class="rt b">meta do dia ${fmt(metaDia)}</text>`;
  s += `<polyline fill="none" stroke="var(--blue)" stroke-width="3" points="${[[ini, 0], ...pts].map(([a, b]) => `${X(a)},${Y(b)}`).join(' ')}"/>`;
  if (proj.length) s += `<polyline fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-dasharray="3 5" points="${[pts[pts.length - 1], ...proj].map(([a, b]) => `${X(a)},${Y(b)}`).join(' ')}"/><text x="${X(fim)}" y="${Y(pa) - 8}" text-anchor="end" class="rt b">projeção ${fmt(Math.round(pa))}</text>`;
  s += `<circle cx="${X(pts[pts.length - 1][0])}" cy="${Y(ac)}" r="5" fill="var(--blue)"/><text x="${X(pts[pts.length - 1][0])}" y="${Y(ac) - 9}" text-anchor="middle" class="rt b">${fmt(ac)}</text>`;
  return svg(H, s);
}

// Pareto clássico: barras em ordem decrescente + linha de % acumulado + marca dos 80%.
function pareto(list, color = 'var(--bad)', top = 8) {
  if (!list || !list.length) return '<p class="muted">Sem rejeitos nesta hora.</p>';
  const tot = list.reduce((a, x) => a + x[1], 0), L = list.slice(0, top), H = 250, bw = (W - PL - PR - 20) / L.length, mx = nice(L[0][1] * 1.12);
  const Y = (v) => PT + (H - PT - 44) * (1 - v / mx), Yp = (p) => PT + (H - PT - 44) * (1 - p / 100);
  let s = '';
  for (let i = 0; i <= 4; i++) { const y = PT + (H - PT - 44) * (1 - i / 4); s += `<line x1="${PL}" x2="${W - PR - 10}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${PL - 6}" y="${y + 4}" text-anchor="end" class="rt">${fmt(Math.round(mx * i / 4))}</text><text x="${W - PR - 2}" y="${y + 4}" class="rt">${i * 25}%</text>`; }
  s += `<line x1="${PL}" x2="${W - PR - 10}" y1="${Yp(80)}" y2="${Yp(80)}" stroke="var(--warn)" stroke-dasharray="4 4"/>`;
  let ac = 0; const pts = [];
  L.forEach(([k, v], i) => {
    ac += v; const x = PL + i * bw + bw * 0.14, w = bw * 0.72;
    s += `<rect x="${x}" y="${Y(v)}" width="${w}" height="${H - 44 - Y(v)}" rx="3" fill="${color}" opacity=".85"><title>${esc(k)}: ${fmt(v)} (${dec(pc(v, tot), 1)}%)</title></rect><text x="${x + w / 2}" y="${Y(v) - 4}" text-anchor="middle" class="rt b">${fmt(v)}</text>`;
    const lab = String(k).length > 15 ? String(k).slice(0, 14) + '…' : k;
    s += `<text x="${x + w / 2}" y="${H - 28}" text-anchor="middle" class="rt">${esc(lab)}</text><text x="${x + w / 2}" y="${H - 14}" text-anchor="middle" class="rt m">${dec(pc(v, tot), 0)}%</text>`;
    pts.push([x + w / 2, Yp(pc(ac, tot)), pc(ac, tot)]);
  });
  s += `<polyline fill="none" stroke="var(--ink)" stroke-width="2" points="${pts.map((p) => p[0] + ',' + p[1]).join(' ')}"/>` + pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="var(--ink)"><title>acumulado ${dec(p[2], 1)}%</title></circle>`).join('');
  const n80 = pts.findIndex((p) => p[2] >= 80) + 1;
  return svg(H, s) + `<p class="muted rp">${n80 ? `<b>${n80}</b> de ${list.length} item(ns) respondem por ${dec(pts[n80 - 1][2], 0)}% dos rejeitos (regra 80/20).` : ''}${list.length > top ? ` Mostrando os ${top} maiores de ${list.length}.` : ''}</p>`;
}

function chartLinhas(d, h) {
  const L = d.linhas; if (!L.length) return '<p class="muted">Sem dados por indução.</p>';
  const H = 250, mx = nice(Math.max(...L.map((x) => x.dia), 10) * 1.1), bw = (W - PL - PR) / L.length;
  const Y = (v) => PT + (H - PT - PB) * (1 - v / mx);
  let s = axis(mx, H);
  L.forEach((x, i) => {
    const bx = PL + i * bw + bw * 0.12, w = bw * 0.76, w2 = w * 0.48;
    s += `<rect x="${bx}" y="${Y(x.dia)}" width="${w2}" height="${H - PB - Y(x.dia)}" rx="2" fill="var(--blue)" opacity=".8"><title>Ind ${p2(x.n)} no dia: ${fmt(x.dia)}</title></rect>`;
    s += `<text x="${bx + w2 / 2}" y="${Y(x.dia) - 4}" text-anchor="middle" class="rt b">${fmt(x.dia)}</text>`;
    s += `<text x="${bx + w / 2}" y="${H - 10}" text-anchor="middle" class="rt">${p2(x.n)}</text>`;
  });
  return svg(H, s);
}

function insights(d, cfg, h) {
  const hs = d.horas.filter((x) => x.tot > 0), meta = +cfg.feishuMeta || 0, lim = +cfg.rejectThreshold || 3;
  const media = hs.length ? d.dia.tot / hs.length : 0, best = hs.reduce((m, x) => (!m || x.tot > m.tot ? x : m), null), worst = hs.length > 1 ? hs.reduce((m, x) => (!m || x.tot < m.tot ? x : m), null) : null;
  const L = [];
  const delta = d.ant.tot ? pc(d.hora.tot - d.ant.tot, d.ant.tot) : null;
  if (delta != null) L.push(`${delta >= 0 ? '▲' : '▼'} Produção ${dec(Math.abs(delta))}% ${delta >= 0 ? 'acima' : 'abaixo'} da hora anterior (${fmt(d.ant.tot)} → ${fmt(d.hora.tot)}).`);
  if (meta) L.push(`Hora ${hh(h)} fechou em ${dec(pc(d.hora.tot, meta))}% da meta de ${fmt(meta)}/h (${d.hora.tot >= meta ? 'meta batida' : 'faltaram ' + fmt(meta - d.hora.tot) + ' peças'}).`);
  const hb = hs.filter((x) => meta && x.tot >= meta).length; if (meta) L.push(`${hb} de ${hs.length} hora(s) do dia bateram a meta.`);
  if (best) L.push(`Melhor hora: ${hh(best.h)} (${fmt(best.tot)}).` + (worst ? ` Pior: ${hh(worst.h)} (${fmt(worst.tot)}).` : ''));
  L.push(`Média do dia: ${fmt(Math.round(media))} peças/h em ${hs.length} hora(s).`);
  const rej = pc(d.hora.abn, d.hora.tot);
  L.push(rej > lim ? `⚠ Rejeito da hora em ${dec(rej)}%, acima do limite de ${dec(lim)}%.` : `Rejeito da hora em ${dec(rej)}%, dentro do limite de ${dec(lim)}%.`);
  const pa = d.pareto;
  if (pa && pa.motivo && pa.motivo[0]) L.push(`Principal motivo de rejeito: ${pa.motivo[0][0]} (${dec(pc(pa.motivo[0][1], pa.rej), 0)}% dos ${fmt(pa.rej)} rejeitos da hora).`);
  if (pa && pa.saida && pa.saida[0]) L.push(`Saída que mais bloqueou: ${pa.saida[0][0]} (${fmt(pa.saida[0][1])}).`);
  if (pa && pa.ind && pa.ind[0]) L.push(`Indução que mais rejeitou: ${pa.ind[0][0]} (${fmt(pa.ind[0][1])}).`);
  if (d.hora.blk) L.push(`Houve ${fmt(d.hora.blk)} ocorrência(s) de saída bloqueando na hora.`);
  return L;
}

const card = (t, sub, body, cls = '', what = '') => `<section class="card rcard ${cls}"><h3>${t}${sub ? ` <small>${sub}</small>` : ''}</h3>${what ? `<p class="muted rwhat">${what}</p>` : ''}${body}</section>`;
const kpi = (l, v, s, c = '') => `<div class="kpi ${c}"><span>${l}</span><b>${v}</b><small>${s || '&nbsp;'}</small></div>`;

export function renderRelatorio(root, c) {
  const { now, cfg } = c; cfgNow = cfg;
  const cur = Math.floor(now / HOUR) * HOUR, last = cur - HOUR;
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  if (!R.h) { R.h = last; load(last, c.redraw); }
  const hours = []; for (let t = d0.getTime(); t <= cur; t += HOUR) hours.push(t);
  const sel = `<select id="rpHour">${hours.map((t) => `<option value="${t}" ${t === R.h ? 'selected' : ''}>${hh(t)} às ${hh(t + HOUR)}${t === cur ? ' (hora em andamento)' : t === last ? ' (última fechada)' : ''}</option>`).join('')}</select>`;
  const bar = `<div class="vwbar"><div><h2>Relatório hora a hora <small>o mesmo que o bot envia ao Feishu</small></h2><p class="muted what">Escolha a hora: produção do dia, rejeito, Pareto por motivo/saída/indução e análise. Dados lidos do sorter; nada é alterado.</p></div><div class="vwctl"><label>Hora ${sel}</label><button class="btn" id="rpReload">Atualizar</button><button class="btn primary" id="rpSend" ${cfg.feishuUrl ? '' : 'disabled title="Configure o webhook em ⚙ Configurações › Feishu"'}>Enviar esta hora ao Feishu</button></div></div>`;
  if (R.busy && !R.data) { root.innerHTML = bar + '<p class="muted rpwait">Carregando o relatório do sorter…</p>'; return; }
  if (R.err && !R.data) { root.innerHTML = bar + `<div class="alert bad">Não foi possível montar o relatório: ${esc(R.err)}</div>`; return; }
  const d = R.data; if (!d) { root.innerHTML = bar; return; }
  const h = R.h, meta = +cfg.feishuMeta || 0, atg = meta ? pc(d.hora.tot, meta) : null, rej = pc(d.hora.abn, d.hora.tot), lim = +cfg.rejectThreshold || 3;
  const kpis = `<div class="kpis rpk">` +
    kpi('Processado na hora', fmt(d.hora.tot), `${hh(h)} às ${hh(h + HOUR)}`, 'blue') +
    kpi('Aproveitamento da hora', dec(pc(d.hora.tot - d.hora.abn, d.hora.tot)) + '%', meta ? `${dec(atg)}% da meta de ${fmt(meta)}/h` : 'meta/h: defina em ⚙ › Feishu', pc(d.hora.tot - d.hora.abn, d.hora.tot) >= 100 - lim ? 'ok' : 'bad') +
    kpi('Rejeito da hora', fmt(d.hora.abn), dec(rej) + '% · limite ' + dec(lim) + '%', rej > lim ? 'bad' : 'ok') +
    kpi('Saída bloqueando', fmt(d.hora.blk), 'ocorrências na hora', d.hora.blk ? 'blk' : '') +
    kpi('Processado até agora', fmt(d.agora.tot), 'fechado até ' + hh(h + HOUR) + ': ' + fmt(d.dia.tot) + ' · rejeito ' + dec(pc(d.agora.abn, d.agora.tot)) + '%' + (+cfg.metaDia ? ' · ' + dec(pc(d.agora.tot, cfg.metaDia), 0) + '% da meta' : ''), 'blue') + `</div>`;
  const pa = d.pareto;
  const nota = pa ? paretoNota(pa, d.hora.abn) : '';
  const pd = pa && pa.dia && pa.dia.rej ? pa.dia : pa, esc2 = pa && pa.dia ? 'do dia' : 'da hora';
  const ofTab = (l, lab, n) => l && l.length ? `<table class="oft"><thead><tr><th>${lab}</th><th class="r">Qtd.</th></tr></thead><tbody>${l.slice(0, n).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="bar"><i style="width:${(v / l[0][1]) * 100}%"></i><span>${fmt(v)}</span></td></tr>`).join('')}</tbody></table>` : '<p class="muted">—</p>';
  const md2html = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/_(.+?)_/g, '<i>$1</i>').replace(/\n/g, '<br>');
  const planMsg = planoMd(pa, 'DA HORA') + (pa && pa.dia ? '\n\n' + planoMd(pa.dia, 'DO DIA (acumulado)') : '');
  const erroMsg = pa ? [paretosErroMd(pa, 'DA HORA', 10), pa.dia ? paretosErroMd(pa.dia, 'DO DIA (acumulado)', 10) : ''].filter(Boolean).join('\n\n━━━━━━━━━━\n\n') : '';
  const erroCard = erroMsg ? `<section class="card rcard wide"><h3>Paretos por tipo de erro <small>para cada erro: saídas, rotas e induções que mais pesam</small></h3><div class="rplano" style="line-height:1.55;font-family:ui-monospace,Consolas,monospace;font-size:12.5px">${md2html(erroMsg)}</div></section>` : '';
  const planCard = `<section class="card rcard wide"><h3>Bases com falta de plano</h3><div class="rplano" style="background:#f6f7f8;border-radius:8px;padding:10px 14px;line-height:1.6">${md2html(planMsg)}</div></section>`;
  const ofCard = pd ? `<section class="card rcard wide"><h3>Ofensoras ${esc2} <small>${fmt(pd.rej)} pacotes rejeitados</small></h3><div class="ofg"><div><div class="ofh">ROTA OFENSORA ${pd.rota[0] ? esc(pd.rota[0][0]) + '<small>com ' + fmt(pd.rota[0][1]) + ' pacotes</small>' : '—'}</div><p class="muted sm">${fmt(pd.rota.length)} rotas</p>${ofTab(pd.rota, 'Rota', 10)}</div><div><div class="ofh">SAÍDA OFENSORA ${pd.saida[0] ? esc(pd.saida[0][0]) + '<small>com ' + fmt(pd.saida[0][1]) + ' pacotes</small>' : '—'}</div><p class="muted sm">${fmt(pd.saida.length)} saídas · só Chute block</p>${ofTab(pd.saida, 'Saída', 10)}</div></div><p class="muted rwhat">Rota = código de rota da peça rejeitada; saída = onde a peça tentava descer e encontrou a saída cheia/bloqueada. A primeira de cada lista é a ofensora.</p></section>` : '';
  const par = pa ? [card('Pareto por motivo', `${fmt(pa.rej)} rejeitos de ${fmt(pa.total)} peças na hora`, pareto(pa.motivo), '', 'Barras = quantidade; linha preta = % acumulado; linha laranja = 80%. Os itens à esquerda, até a linha cruzar 80%, são os que valem atacar primeiro.'), card('Pareto das saídas com Chute block', 'saída pretendida', pareto(pa.saida, 'var(--blk)'), '', 'Só rejeitos por Chute block (saída cheia/bloqueada), agrupados pela saída que a peça tentava usar. Saída no topo = candidata a esvaziar/trocar saco.'), card('Pareto das induções', 'quem mais rejeitou', pareto(pa.ind, 'var(--warn)'), 'wide', 'Induções de onde saíram as peças rejeitadas. Concentração em poucas induções sugere problema de leitura, cortina ou operação nelas; rejeito espalhado sugere causa de rota/saída.')] : [card('Pareto dos rejeitos', '', '<p class="muted">Não foi possível ler o detalhe por peça agora.</p>')];
  const txt = buildCard(cfg, h, d).card.elements.filter((e) => e.text).map((e) => e.text.content).join('\n\n');
  root.innerHTML = bar + (nota ? `<div class="alert warn">${esc(nota)}</div>` : '') + (R.msg ? `<p class="rpmsg">${esc(R.msg)}</p>` : '') + kpis +
    `<div class="rpgrid">` +
    card('H/H produção', 'processado × aproveitado', chartProd(d, cfg, h), '', 'Barras = peças processadas na hora; linha tracejada = peças aproveitadas (processado − rejeito). Se há meta, verde = meta batida, laranja = 80–100%, vermelho = abaixo. Quanto mais a linha se afasta da barra, mais rejeito na hora.') + card('Produção por linha', 'Linha A = L1 · Linha B = L2', chartAB(d), '', 'Peças de cada linha (camada do sorter) por hora, empilhadas. Barras muito desiguais indicam carga mal distribuída ou uma linha com problema.') + card('Aproveitamento por hora', '(processado − rejeito) ÷ processado', chartAprov(d, cfg), '', 'Ex.: o sorter processou 100 e rejeitou 10 → aproveitamento de 90%. Pontos vermelhos ficaram abaixo do mínimo definido pelo limite de rejeito.') +
    card('Taxa de rejeito por hora', 'linha azul · vermelho = acima do limite', chartRejRate(d, cfg, h), '', 'Rejeitos ÷ peças de cada hora. Pontos vermelhos passaram do limite definido em Configurações; a faixa rosada é a zona de alerta.') +
    card('Produção por indução', 'peças no dia até agora', chartLinhas(d, h), '', 'Cada barra é uma indução (linha de alimentação manual): quanto ela processou no dia. Barras muito diferentes indicam carga mal distribuída ou indução parada.') +
    card('Acumulado do dia e projeção', 'linha cheia = real · pontilhada = mantendo a média', chartAcum(d, cfg), '', 'Soma das peças desde o início da operação. A linha pontilhada projeta o fim do dia se o ritmo médio se mantiver (é estimativa, não promessa).') +
    card('Análise', '', `<ul class="rpl">${insights(d, cfg, h).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`, 'wide') +
    planCard + ofCard + par.join('') + erroCard +
    card('Tabela hora a hora', '', `<div class="scroll"><table><thead><tr><th>Hora</th><th class="r">Processado</th><th class="r">Aproveitado</th><th class="r">Aproveit.</th><th class="r">Linha A</th><th class="r">Linha B</th><th class="r">% meta</th><th class="r">Rejeitos</th><th class="r">Taxa</th><th class="r">Bloqueio</th></tr></thead><tbody>${serieHoras(d).map((x) => `<tr class="${x.h === h ? 'sel' : ''}"><td><b>${hh(x.h)}</b>${x.h > h ? ' <small class="muted">em andamento</small>' : ''}</td><td class="r">${fmt(x.tot)}</td><td class="r">${fmt(x.tot - x.abn)}</td><td class="r">${dec(pc(x.tot - x.abn, x.tot))}%</td><td class="r">${d.temLinhas ? fmt(x.a) : '—'}</td><td class="r">${d.temLinhas ? fmt(x.b) : '—'}</td><td class="r">${meta ? dec(pc(x.tot, meta), 0) + '%' : '—'}</td><td class="r">${fmt(x.abn)}</td><td class="r"><span class="rate ${pc(x.abn, x.tot) > lim ? 'bad' : 'ok'}">${dec(pc(x.abn, x.tot))}%</span></td><td class="r">${fmt(x.blk)}</td></tr>`).join('')}</tbody></table></div>`, 'wide') +
    `</div><details class="rpraw"><summary>Texto enviado ao Feishu</summary><pre>${esc(txt)}</pre></details>`;
  R.redraw = c.redraw; R.cfg = cfg;
}

document.addEventListener('change', (e) => { if (e.target.id === 'rpHour') { R.data = null; load(+e.target.value, R.redraw || (() => {})); } });
document.addEventListener('click', async (e) => {
  const t = e.target.closest && e.target.closest('#rpReload, #rpSend'); if (!t) return;
  if (t.id === 'rpReload') { R.data = null; load(R.h, R.redraw); return; }
  if (!R.data || !R.cfg) return;
  R.msg = 'Enviando ao Feishu…'; R.redraw();
  try { const modo = await postRelatorio(R.cfg, R.h, R.data); R.msg = `✔ Relatório de ${hh(R.h)} enviado ao grupo` + (modo === 'classico' ? ' (formato texto: o Feishu não aceitou o cartão com gráficos).' : ' com gráficos.') + (ULT.lista ? ` Lista completa: ${ULT.lista.toLocaleString('pt-BR')} rejeitos em ${ULT.partes} mensagem(ns).` : ''); } catch (err) { R.msg = '✖ ' + err.message; }
  R.redraw();
});
