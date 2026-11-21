// Conferência de saca vermelha: as peças das rotas obrigatórias estão caindo em saída com saca vermelha?
// Peça obrigatória = o sortcode dela pertence ao plano de uma saída vermelha (regra do comunicado).
// Resultado de cada peça obrigatória: ok (caiu em saída vermelha) · errada (caiu em saída verde) · exceção (208/888) · sem descarga.
import { SACA, RED_ROUTES, segInfo as _si } from './saca.js';
import { PLAN } from './plan.js';
import * as A from './analysis.js';

const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
const pct = (a, b, d = 1) => (b ? (a / b * 100).toFixed(d).replace('.', ',') + '%' : '—');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const p3 = (n) => String(n).padStart(3, '0');
const hhmmss = (ms) => new Date(ms).toTimeString().slice(0, 8);
const no = (k) => String(parseInt(k, 10));
const isRed = (k) => { const q = SACA[no(k)]; return !!q && q.c === 'R'; };

// Cada peça é ligada ao SEGMENTO do plano: entre as saídas candidatas (chutelist) pega a linha cujo código de segmento
// aparece mais fundo no sortcode ("MG,C129-00,088": 1=UF, 2=rota, 3=sub). Essa linha tem nome de destino -> é (ou não) rota obrigatória.
const segInfo = _si;
function segmentoDe(r, cache) {
  const parts = String(r.sc || '').split(',').map((x) => x.trim());
  let best = null;
  for (const cand of String(r.cl || '').split(',')) {
    const o = no(cand); if (A.isExcChute(o) || o === 'NaN') continue;
    const e = PLAN.map.get(o); if (!e || !e.rows) continue;
    let si = cache.get(o); if (!si) cache.set(o, (si = segInfo(o) || { obr: [], comum: [] }));
    for (const w of e.rows) for (const c of w.codes) {
      const i = parts.indexOf(c); if (i < 0) continue;
      if (!best || i + 1 > best.nivel) best = { o, w, nivel: i + 1, obr: si.obr.includes(w) };
    }
  }
  return best;
}

export function analisarSaca(rows) {
  const por = new Map(), rd = new Map(), fora = [], cache = new Map();
  const T = { obr: 0, ok: 0, errada: 0, exc: 0, semd: 0, skip: 0, comum: 0 };
  const g = (m, k, mk) => { let x = m.get(k); if (!x) m.set(k, (x = mk())); return x; };
  for (const r of rows) {
    const seg = segmentoDe(r, cache), dc = String(r.dc || '').trim();
    const dcOk = dc && !A.isExcChute(dc);
    if (!seg) { T.skip++; continue; }
    if (!seg.obr) { // peça comum
      if (dcOk && isRed(dc)) { T.comum++; g(rd, no(dc), () => ({ k: no(dc), comum: 0, nomes: new Map() })).comum++; const x = rd.get(no(dc)); x.nomes.set(seg.w.name, (x.nomes.get(seg.w.name) || 0) + 1); }
      continue;
    }
    T.obr++;
    const x = g(por, seg.o, () => ({ k: seg.o, tot: 0, ok: 0, errada: 0, exc: 0, semd: 0, dest: new Map(), segs: new Map() }));
    x.tot++; x.segs.set(seg.w.codes.join(' ') || seg.w.name, 1);
    if (!dc) { if (r.ex) { x.exc++; T.exc++; } else { x.semd++; T.semd++; } continue; }
    if (!dcOk || r.ex) { x.exc++; T.exc++; continue; }
    if (isRed(dc)) { x.ok++; T.ok++; } else { x.errada++; T.errada++; x.dest.set(no(dc), (x.dest.get(no(dc)) || 0) + 1); if (fora.length < 400) fora.push({ t: r.t, wb: r.wb, sc: r.sc, alvo: seg.o, dc: no(dc) }); }
  }
  fora.sort((a, b) => b.t - a.t);
  return { T, por: [...por.values()], rd: [...rd.values()], fora };
}

export function renderConfSaca(rows) {
  if (!PLAN.map.size) return `<div class="card smconf"><h3>Conferência de saca vermelha</h3><div class="muted">Aguardando o plano de triagem carregar…</div></div>`;
  const R = analisarSaca(rows), T = R.T, nm = (k) => (SACA[k] ? SACA[k].rt.join(' / ') : '');
  const bad = T.errada, rate = T.ok + T.errada ? (T.ok / (T.ok + T.errada)) * 100 : 100;
  const cls = bad === 0 ? 'ok' : rate >= 95 ? 'warn' : 'bad';
  const kp = (l, v, s = '', c = '') => `<div class="bst ${c}"><b>${v}</b><label>${l}${s ? ' · ' + s : ''}</label></div>`;
  const rowsP = R.por.sort((a, b) => b.errada - a.errada || b.tot - a.tot).map((x) => {
    const dst = [...x.dest].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${p3(k)} <b>${n}</b>`).join(' · ');
    return `<tr data-sel="chute|${esc(x.k)}"><td><b>${p3(x.k)}</b></td><td>${esc(nm(x.k))}</td><td class="muted sm">${esc([...x.segs.keys()].slice(0, 3).join(' · '))}</td><td class="r">${fmt(x.tot)}</td><td class="r">${fmt(x.ok)}</td><td class="r ${x.errada ? 'badt' : ''}">${fmt(x.errada)}</td><td class="r">${fmt(x.exc)}</td><td class="r">${fmt(x.semd)}</td><td class="r"><span class="rate ${x.errada ? (x.errada / Math.max(1, x.ok + x.errada) > 0.05 ? 'bad' : 'warn') : ''}">${pct(x.ok, x.ok + x.errada)}</span></td><td>${dst || '<span class="muted">—</span>'}</td></tr>`;
  }).join('');
  const rowsR = R.rd.filter((x) => x.comum > 0).sort((a, b) => b.comum - a.comum).slice(0, 15).map((x) => `<tr data-sel="chute|${esc(x.k)}"><td><b>${p3(x.k)}</b></td><td>${esc(nm(x.k))}</td><td class="r warnt">${fmt(x.comum)}</td><td class="muted sm">${[...x.nomes].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => esc(n) + ' ' + c).join(' · ')}</td></tr>`).join('');
  const rowsF = R.fora.slice(0, 12).map((f) => `<tr><td>${hhmmss(f.t)}</td><td>${esc(f.wb)}</td><td>${esc(f.sc)}</td><td>${p3(f.alvo)} <span class="muted">${esc(nm(f.alvo))}</span></td><td><b>${p3(f.dc)}</b> <span class="muted">verde</span></td></tr>`).join('');
  return `<div class="card smconf"><h3>Conferência de saca vermelha <small>peças das rotas obrigatórias × cor da saída onde caíram · ${RED_ROUTES.length} rotas</small></h3>` +
    `<div class="bindk">${kp('peças obrigatórias', fmt(T.obr), 'na janela')}${kp('em saída vermelha', fmt(T.ok), pct(T.ok, T.ok + T.errada), 'ok')}${kp('em saída verde', fmt(T.errada), bad ? 'saca errada' : 'nenhuma', bad ? 'bad' : 'ok')}${kp('exceção / rejeito', fmt(T.exc))}${kp('sem descarga', fmt(T.semd))}</div>` +
    `<div class="muted sm">Cumprimento (vermelha ÷ vermelha+verde): <b class="${cls === 'ok' ? '' : cls + 't'}">${pct(T.ok, T.ok + T.errada)}</b> · meta 95% · ${fmt(T.skip)} peças sem segmento identificado no plano ignoradas.</div>` +
    (rowsP ? `<h4>Por saída vermelha</h4><div class="scroll"><table><thead><tr><th>Saída</th><th>Rotas</th><th>Segmentos</th><th class="r">Peças</th><th class="r">Em vermelha</th><th class="r">Em verde</th><th class="r">Exceção</th><th class="r">Sem descarga</th><th class="r">Cumprimento</th><th>Foram para (verde)</th></tr></thead><tbody>${rowsP}</tbody></table></div>` : '<div class="muted">Nenhuma peça de rota obrigatória na janela.</div>') +
    (rowsF ? `<h4>Últimas peças obrigatórias em saída verde</h4><div class="scroll"><table><thead><tr><th>Hora</th><th>Waybill</th><th>Sortcode</th><th>Deveria ir</th><th>Caiu em</th></tr></thead><tbody>${rowsF}</tbody></table></div>` : '') +
    (rowsR ? `<h4>Saca vermelha usada com peça comum <small>saídas vermelhas que receberam rotas fora do comunicado</small></h4><div class="scroll"><table><thead><tr><th>Saída</th><th>Rotas</th><th class="r">Peças comuns</th><th>Segmentos comuns</th></tr></thead><tbody>${rowsR}</tbody></table></div>` : '') +
    `</div>`;
}
