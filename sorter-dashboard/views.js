import { pulseHtml } from './hero.js';
import { SACA, RED_OUTLETS, RED_ROUTES, isProv, assocRotas, OV } from './saca.js';
import { explainBind, bindKindText } from './bind.js';
const sacaChip = (k) => { const q = SACA[String(k)]; if (!q) return ''; const n = { G: 'Saca verde', R: 'Saca vermelha', M: 'Saca mista' }[q.c]; return ` <span class="sacachip ${q.c}" title="${q.c === 'R' ? 'Saca vermelha OBRIGATÓRIA — rotas: ' + q.rt.join(', ') : 'Saca verde (saída fora da lista de rotas com saca vermelha obrigatória)'}">${n}</span>`; };
// Abas "Induções ao vivo" e "Saídas ao vivo": o que cada estação de indução / cada saída está processando.
import * as A from './analysis.js';
import { renderConfSaca } from './confsaca.js';
import { aliasesOutlet } from './segmentos.js';
import { baseOf, codesOf, PLAN } from './plan.js';
import { IND_STATUS } from './devices.js';

const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
const dec = (n, d = 1) => Number(n).toFixed(d).replace('.', ',');
const pct = (a, b, d = 1) => (b ? dec((a / b) * 100, d) + '%' : '—');
const p2 = (n) => String(n).padStart(2, '0');
const hhmm = (ms) => { const d = new Date(ms); return p2(d.getHours()) + ':' + p2(d.getMinutes()); };
const hhmmss = (ms) => hhmm(ms) + ':' + p2(new Date(ms).getSeconds());
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const agoTxt = (ms, now) => {
  if (!ms) return '—';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  return s < 90 ? `${s} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${dec(s / 3600, 1)} h`;
};
const inc = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);
const topN = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n);

const keyOf = (kind) => (kind === 'ind' ? (r) => r.ind : (r) => A.chuteKey(r));
const labelOf = (kind, k) => (kind === 'ind' ? String(k).padStart(2, '0') : A.chuteLabel(k));
const otherKind = (kind) => (kind === 'ind' ? 'chute' : 'ind');
const otherKey = (kind) => (kind === 'ind' ? (r) => A.chuteKey(r) : (r) => r.ind);
const otherLabel = (kind, k) => (kind === 'ind' ? A.chuteLabel(k) : String(k).padStart(2, '0'));

export const WINDOWS = [[-1, 'Hora atual (desde HH:00)'], [60, 'Últimos 60 min'], [240, 'Últimas 4 h'], [0, 'Hoje'], [30, 'Últimos 30 min'], [15, 'Últimos 15 min']];

function aggregate(kind, c) {
  const { fall, all, now, win, dayStart } = c;
  const w0 = win > 0 ? now - win * 60000 : dayStart;
  const kf = keyOf(kind), of = otherKey(kind);
  const M = new Map();
  const get = (k) => {
    let x = M.get(k);
    if (!x) { x = { key: k, tot: 0, rej: 0, reasons: new Map(), others: new Map(), routes: new Map(), last: 0, stuck: 0, ly: '', day: 0, w: 0 }; M.set(k, x); }
    return x;
  };
  for (const r of fall) {
    const k = kf(r);
    if (k === '' || k === undefined) continue;
    const x = get(k);
    x.day++;
    if (r.ly && !x.ly) x.ly = r.ly.replace('Layer', 'L');
    if (r.t < w0) continue;
    x.tot++;
    x.w += r.w;
    if (r.t > x.last) x.last = r.t;
    inc(x.others, of(r));
    inc(x.routes, A.routeKey(r, c.lvl));
    if (kind === 'ind' ? A.isRej(r) : A.isChuteFault(r)) { x.rej++; inc(x.reasons, r.ex); }
  }
  if (kind === 'ind' && c.an) for (const i of c.an.inds) get(i.no);
  if (kind === 'chute' && c.an) for (const q of [...c.an.closed, ...c.an.full]) get(String(q.no));
  for (const r of all) {
    if (r.dc || r.t < w0 || now - r.t < 20 * 60000) continue;
    const k = kf(r);
    if (M.has(k)) M.get(k).stuck++;
  }
  return { M, w0 };
}


const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const QSTAT = [['', 'Todas'], ['bad', 'Com problema'], ['rej', 'Com rejeito'], ['warn', 'Atenção'], ['ok', 'Normais'], ['idle', 'Sem peças']];
function hay(x, c) {
  const [, txt] = status('chute', x, c), q = SACA[String(x.key)];
  const sc = q ? { G: 'saca verde', R: 'saca vermelha', M: 'saca mista' }[q.c] : '';
  return norm([x.key, labelOf('chute', x.key), 'saida ' + labelOf('chute', x.key), baseOf(x.key, false), codesOf(x.key).join(' '), aliasesOutlet(x.key).join(' '), x.ly, txt, sc].join(' | '));
}
function matchQ(x, c) {
  const toks = norm(c.q).split(/\s+/).filter(Boolean);
  if (toks.length) { const h = hay(x, c); if (!toks.every((t) => h.includes(t))) return false; }
  const f = c.qs || '';
  if (f) { const cls = status('chute', x, c)[0]; if (f === 'rej' ? !(x.rej > 0) : cls !== f) return false; }
  return true;
}
const hl = (txt, q) => {
  const t = esc(txt); const toks = norm(q).split(/\s+/).filter((v) => v.length > 0);
  if (!toks.length) return t;
  const n = norm(txt); if (n.length !== String(txt).length) return t;
  const m = new Array(n.length).fill(false);
  for (const k of toks) { let i = n.indexOf(k); while (i >= 0) { for (let j = i; j < i + k.length; j++) m[j] = true; i = n.indexOf(k, i + k.length); } }
  let o = '', on = false; const raw = String(txt);
  for (let i = 0; i < raw.length; i++) { if (m[i] !== on) { o += on ? '</mark>' : '<mark>'; on = m[i]; } o += esc(raw[i]); }
  return o + (on ? '</mark>' : '');
};

const SM_N = (() => { const a = []; for (let i = 1; i <= 207; i++) a.push(String(i)); return a; })();
const p3 = (n) => String(n).padStart(3, '0');
function sacaMapHTML(c, agg) {
  const f = c.sm || '', open = c.smOpen !== false, searching = !!(c.q || c.qs);
  const nRed = SM_N.filter((k) => SACA[k].c === 'R').length, nSem = SM_N.filter((k) => SACA[k].sem).length, nGreen = SM_N.length - nRed - nSem;
  const SC = { bad: 'var(--bad)', warn: 'var(--warn)', ok: 'var(--ok)', idle: 'var(--muted)' };
  let tiles = '';
  if (open) tiles = SM_N.filter((k) => !f || (f === 'N' ? SACA[k].sem : f === 'G' ? SACA[k].c === 'G' && !SACA[k].sem : SACA[k].c === f)).map((k) => {
    const q = SACA[k], x = agg.M.get(k) || { key: k, tot: 0, rej: 0, reasons: new Map(), others: new Map(), routes: new Map(), last: 0, stuck: 0, ly: '', day: 0, w: 0, stub: 1 };
    const [cls, txt] = status('chute', x, c), dim = searching && !matchQ(x, c);
    const base = baseOf(k) || (q.d[0] || '');
    const tip = `Saída ${p3(k)} · saca ${q.sem ? 'sem rota vinculada (rosa)' : q.c === 'R' ? 'VERMELHA (obrigatória)' : 'VERDE'}${q.rt.length ? ' · rotas: ' + q.rt.join(', ') : ''}${base ? ' · ' + base : ''} · ${txt}${x.tot ? ' · ' + x.tot + ' peças' : ''}`;
    const pv = isProv(k);
    return `<div class="smt ${q.sem ? 'N' : q.c} ${pv ? 'pv' : ''} ${String(c.sel) === k ? 'sel' : ''} ${dim ? 'dim' : ''}" data-sel="chute|${k}" title="${esc(tip + (pv ? ' · correspondência provável (só pelo código do DC): confirme' : ''))}"><i class="smd" style="background:${SC[cls] || SC.idle}"></i><b>${p3(k)}${q.man ? ' ✎' : ''}</b><span>${esc(q.rt[0] || base || '')}</span></div>`;
  }).join('');
  return `<div class="card smap"><div class="smh"><h3>Mapa de cor de saca por saída <small>${SM_N.length} saídas · regra: ${RED_ROUTES.length} rotas com saca vermelha obrigatória; as demais, verde</small></h3>` +
    `<div class="smctl"><span class="smlg R"><i></i>Vermelha <b>${nRed}</b></span><span class="smlg G"><i></i>Verde <b>${nGreen}</b></span><span class="smlg N"><i></i>Sem rota <b>${nSem}</b></span>` +
    [['', 'Todas'], ['R', 'Só vermelhas'], ['G', 'Só verdes'], ['N', 'Sem rota']].map(([v2, t]) => `<button class="vqchip ${f === v2 ? 'on' : ''}" data-vsm="${v2}">${t}</button>`).join('') +
    `<button class="vqchip" data-vsmopen>${open ? 'Recolher' : 'Expandir'}</button><button class="vqchip on" data-vsmpng>Exportar PNG</button>${Object.keys(OV).length ? `<button class="vqchip" data-sacaclear>Limpar ${Object.keys(OV).length} edição(ões) manual(is)</button>` : ''}</div></div>` +
    (open ? `<div class="smgrid">${tiles}</div><div class="muted sm smfoot">Ponto no canto = status ao vivo da saída (verde normal · amarelo atenção · vermelho problema · cinza sem peças). Clique numa saída para ver o detalhe${searching ? '. Saídas apagadas não correspondem à pesquisa' : ''}. Tile com “?” = correspondência provável (só pelo código do DC).</div>` + semSaida() : '') + `</div>`;
}

const NV = { exata: ['✓', 'ok'], provavel: ['?', 'warn'], uf: ['UF', 'warn'], verificar: ['!', 'bad'] };
const semSaida = () => {
  const A2 = assocRotas(), com = A2.filter((a) => a.saidas.some((s) => s.nivel !== 'verificar')), ver = A2.filter((a) => !a.saidas.some((s) => s.nivel !== 'verificar') && a.saidas.length), sem = A2.filter((a) => !a.saidas.length);
  const rows = A2.map((a) => {
    const ok = a.saidas.filter((s) => s.nivel !== 'verificar'), vf = a.saidas.filter((s) => s.nivel === 'verificar');
    const st = ok.length ? (ok.every((s) => s.nivel === 'exata') ? ['Associada', 'ok'] : ok.every((s) => s.nivel === 'uf') ? ['Por UF', 'warn'] : ['Provável', 'warn']) : (vf.length || a.aviso) ? ['Verificar', 'bad'] : ['Sem saída no plano', 'idle'];
    const chip = (s) => `<span class="pill plain" title="${esc(s.plano)} · ${s.nivel} · segmentos: ${esc((s.codes || []).join(' '))}" data-sel="chute|${esc(s.k)}">${p3(s.k)} ${NV[s.nivel][0]} <span class="muted">${esc(s.plano)}${s.codes && s.codes.length ? ' · ' + esc(s.codes.slice(0, 4).join(' ')) : ''}</span></span>`;
    return `<tr class="asr ${st[1]}"><td><b>${esc(a.rota)}</b></td><td><span class="pillstate sm ${st[1]}">${st[0]}</span></td><td>${[...ok, ...vf].map(chip).join(' ') || '<span class="muted">—</span>'}${a.aviso ? `<div class="badt sm">${esc(a.aviso)}</div>` : ''}</td></tr>`;
  }).join('');
  return `<details class="smsem"><summary>Associação das ${A2.length} rotas obrigatórias ao plano: ${com.length} associadas · ${ver.length} a verificar · ${sem.length} sem saída no plano</summary>` +
    `<div class="muted sm">Comparo código, UF, prefixo (DC/F/PA) e número, ignorando espaço e hífen. ✓ = mesmo código e UF · ? = mesmo código, UF ausente de um lado (aplicada em vermelho, confirme) · UF = sem saída própria: o plano manda tudo daquela UF para a saída de código de UF (já vermelha) · ! = mesmo código com UF diferente (NÃO aplicada). Bases com prefixo “F ” (franquia) não entram. Se o plano ganhar uma saída com o nome, ela fica vermelha sozinha.</div>` +
    `<div class="scroll"><table class="tnt"><thead><tr><th>Rota do comunicado</th><th>Situação</th><th>Saída(s) no plano · segmentos (códigos)</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
};

// exporta o mapa de cor de saca como imagem PNG (desenhado em canvas, independe do tema)
export function exportSacaPng(filter = '') {
  const L = SM_N.filter((k) => !filter || SACA[k].c === filter);
  const cols = 16, tw = 92, th = 54, gap = 6, pad = 20, top = 92;
  const rowsN = Math.ceil(L.length / cols);
  const W = pad * 2 + cols * tw + (cols - 1) * gap, H = top + rowsN * (th + gap) + 70;
  const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2;
  const g = cv.getContext('2d'); g.scale(2, 2);
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#111827'; g.font = 'bold 22px sans-serif'; g.fillText('Mapa de cor de saca por saída', pad, 34);
  const nR = SM_N.filter((k) => SACA[k].c === 'R').length;
  g.font = '13px sans-serif'; g.fillStyle = '#4b5563';
  g.fillText(`Regra: rotas com saca vermelha obrigatória (comunicado, meta 95%) = vermelha · demais = verde · gerado em ${new Date().toLocaleString('pt-BR')}`, pad, 56);
  g.fillStyle = '#e11d48'; g.fillRect(pad, 68, 14, 14); g.fillStyle = '#111827'; g.font = 'bold 13px sans-serif'; g.fillText(`Vermelha: ${nR}`, pad + 20, 80);
  const nS = SM_N.filter((k) => SACA[k].sem).length; g.fillStyle = '#15803d'; g.fillRect(pad + 120, 68, 14, 14); g.fillStyle = '#111827'; g.fillText(`Verde: ${SM_N.length - nR - nS}`, pad + 140, 80); g.fillStyle = '#fbcfe8'; g.fillRect(pad + 240, 68, 14, 14); g.strokeStyle = '#d946a8'; g.strokeRect(pad + 240, 68, 14, 14); g.fillStyle = '#111827'; g.fillText(`Sem rota vinculada: ${nS}`, pad + 260, 80);
  const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  L.forEach((k, i) => {
    const q = SACA[k], x = pad + (i % cols) * (tw + gap), y = top + Math.floor(i / cols) * (th + gap);
    g.fillStyle = q.sem ? '#fbcfe8' : q.c === 'R' ? '#e11d48' : '#15803d'; rr(x, y, tw, th, 8); g.fill(); if (q.sem) { g.strokeStyle = '#d946a8'; g.lineWidth = 1.2; g.stroke(); }
    g.fillStyle = q.sem ? '#831843' : '#fff'; g.textAlign = 'center'; g.font = 'bold 16px sans-serif'; g.fillText(p3(k) + (isProv(k) ? ' ?' : '') + (q.man ? ' ✎' : ''), x + tw / 2, y + 23);
    g.font = '10.5px sans-serif'; const t = q.rt[0] || baseOf(k) || ''; g.fillText(t.length > 15 ? t.slice(0, 14) + '…' : t, x + tw / 2, y + 40);
    g.textAlign = 'left';
  });
  g.fillStyle = '#6b7280'; g.font = '11.5px sans-serif';
  g.fillText('Texto do tile = rota que exige saca vermelha (ou base de destino nas saídas verdes). “?” = correspondência provável pelo código do DC.', pad, H - 40);
  const sem = assocRotas().filter((a) => !a.saidas.some((s) => s.nivel !== 'verificar')).length;
  g.fillText(`${sem} das ${RED_ROUTES.length} rotas obrigatórias não têm saída no plano ativo.`, pad, H - 22);
  cv.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `mapa-cor-saca-${new Date().toISOString().slice(0, 10)}.png`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }, 'image/png');
}

const pillK = (kind, txt) => (kind === 'ind' ? (/rejeito alto/.test(txt) ? 'i-rej' : 'i') : txt === 'Bloqueando' ? 's-blk' : txt === 'Fechada' ? 's-off' : txt === 'Cheia' ? 's-full' : '');
function status(kind, x, c) {
  const th = c.cfg.rejectThreshold;
  const rate = x.tot ? (x.rej / x.tot) * 100 : 0;
  if (kind === 'ind') {
    const di = c.an && c.an.inds.find((i) => i.no === x.key);
    if (di) {
      if (di.status === 'ativa' && x.tot >= 30 && x.rej >= 3 && rate >= th) return ['bad', 'Alimentando · rejeito alto'];
      const [cls, txt] = IND_STATUS[di.status];
      return [cls, txt];
    }
    if (!x.tot || c.now - x.last > 5 * 60000) return ['idle', 'Sem peças'];
    return ['ok', 'Alimentando'];
  }
  const cl = c.an && c.an.closed.find((q) => String(q.no) === String(x.key));
  if (cl) return ['bad', 'Fechada'];
  const fu = c.an && c.an.full.find((q) => String(q.no) === String(x.key));
  if (fu) return ['warn', 'Cheia'];
  if (!x.tot) return ['idle', 'Sem peças'];
  if (x.rej >= c.cfg.chuteAlert && rate >= th) return ['bad', 'Bloqueando'];
  if (x.rej > 0) return ['warn', 'Peças desviadas'];
  return ['ok', 'Normal'];
}
const rateCls = (rate, th) => (rate >= th * 2 ? 'bad' : rate >= th ? 'warn' : '');
const gotoChip = (kind, k, n, label) => `<span class="pill" data-goto="${kind}|${esc(k)}">${esc(label)} <b>${fmt(n)}</b></span>`;

function listHTML(kind, c, agg) {
  const th = c.cfg.rejectThreshold, other = otherKind(kind);
  let L = [...agg.M.values()];
  if (kind === 'ind') L.sort((a, b) => a.key - b.key);
  else { const sp = (x) => (status('chute', x, c)[1] === 'Fechada' || status('chute', x, c)[1] === 'Cheia' ? 1 : 0); const srch = !!(c.q || c.qs); L = L.filter((x) => srch ? matchQ(x, c) : (x.tot > 0 || sp(x))).sort((a, b) => sp(b) - sp(a) || b.rej - a.rej || b.tot - a.tot); }
  const lim = c.expand ? 400 : (kind === 'chute' && (c.q || c.qs)) ? 150 : kind === 'ind' ? 400 : 30;
  const winTxt = c.winRaw === -1 ? 'hora atual' : c.win > 0 ? `${c.win} min` : 'hoje';
  const mxT = Math.max(1, ...L.map((x) => x.tot));
  const rows = L.slice(0, lim).map((x) => {
    const [cls, txt] = status(kind, x, c);
    const rate = x.tot ? (x.rej / x.tot) * 100 : 0;
    const perH = c.win > 0 ? (x.tot * 60) / c.win : x.tot / Math.max(1 / 60, (c.now - c.dayStart) / 3600000);
    const oth = topN(x.others, 3).map(([k, n]) => gotoChip(other, k, n, otherLabel(kind, k))).join('') || '<span class="muted">—</span>';
    const rt = topN(x.routes, 2).map(([k, n]) => `<span class="pill plain">${esc(k)} <b>${fmt(n)}</b></span>`).join('') || '<span class="muted">—</span>';
    return `<tr data-sel="${kind}|${esc(x.key)}" class="${c.sel === String(x.key) ? 'sel' : ''}">` +
      `<td><b>${kind === 'chute' && c.q ? hl(labelOf(kind, x.key), c.q) : esc(labelOf(kind, x.key))}</b>${x.ly ? ` <span class="muted">${x.ly}</span>` : ''}${kind === 'chute' && baseOf(x.key) ? `<div class="muted sm">${hl(baseOf(x.key), c.q)}</div>` : ''}${kind === 'chute' ? sacaChip(x.key) : ''}</td>` +
      `<td><span class="pillstate sm ${cls} ${pillK(kind, txt)}">${txt}</span></td>` +
      `<td class="bar"><i style="width:${(x.tot / mxT) * 100}%;--c:var(--blue)"></i><span>${fmt(x.tot)}</span></td>` +
      `<td class="r">${fmt(Math.round(perH))}</td>` +
      `<td class="r"><b>${fmt(x.rej)}</b></td><td class="r"><span class="rate ${rateCls(rate, th)}">${pct(x.rej, x.tot, 2)}</span></td>` +
      `<td>${oth}</td><td>${rt}</td><td class="r">${x.stuck ? fmt(x.stuck) : '—'}</td><td class="r">${kind === 'ind' && x.last ? agoTxt(x.last, c.now) : x.last ? agoTxt(x.last, c.now) : '—'}</td></tr>`;
  }).join('');
  const hasMore = L.length > lim;
  const empty = kind === 'chute' && !L.length ? `<div class="empty">Nenhuma saída encontrada${c.q ? ' para “' + esc(c.q) + '”' : ''}. Tente o número, a base de destino, um código de rota ou o status.</div>` : '';
  return `<div class="scroll tall"><table><thead><tr><th>${kind === 'ind' ? 'Indução' : 'Saída'}</th><th>Status</th><th>Peças (${winTxt})</th><th class="r">Peças/h</th><th class="r">Rej.</th><th class="r">Taxa</th>` +
    `<th>${kind === 'ind' ? 'Para onde está mandando' : 'De onde vem'}</th><th>Rotas</th><th class="r">Sem descarga</th><th class="r">Última peça há</th></tr></thead><tbody>${rows}</tbody></table></div>` + empty +
    (hasMore || c.expand ? `<button class="mini more" data-more="vw">${c.expand ? 'Ver menos' : `Ver todas (${L.length})`}</button>` : '');
}

function detailHTML(kind, c, agg) {
  const key = c.sel;
  const x = key != null ? [...agg.M.values()].find((e) => String(e.key) === key) : null;
  const other = otherKind(kind);
  if (!x && kind === 'chute' && key != null && (c.binds || []).some((r) => r.chute === key)) return `<div class="dhead"><h3>Saída ${esc(key)}</h3></div><div class="empty">Sem peças desta saída na janela.</div>` + bindBlock(c, key);
  if (!x) return `<div class="empty">Clique numa ${kind === 'ind' ? 'indução' : 'saída'} da tabela para ver o detalhe ao vivo.</div>`;
  const th = c.cfg.rejectThreshold, [cls, txt] = status(kind, x, c);
  const rate = x.tot ? (x.rej / x.tot) * 100 : 0;
  const kf = keyOf(kind);
  const mine = c.fall.filter((r) => String(kf(r)) === key);
  // pulso 60 min
  const N = 60, t1 = Math.floor(c.now / 60000) * 60000, t0 = t1 - (N - 1) * 60000;
  const tot = new Array(N).fill(0), rj = new Array(N).fill(0);
  for (const r of mine) {
    const i = Math.floor((r.t - t0) / 60000);
    if (i >= 0 && i < N) { tot[i]++; if (A.isRej(r)) rj[i]++; }
  }
  const pulse = pulseHtml(tot, rj, Math.max(5, ...tot), t0, false);
  const winTxt = c.winRaw === -1 ? 'hora atual' : c.win > 0 ? `últimos ${c.win} min` : 'hoje';
  const tb = (title, arr, tot2, fn) => `<div class="dcol"><h4>${title}</h4>` + (arr.length
    ? `<table><tbody>${arr.map(([k, n]) => `<tr ${fn.goto ? `data-goto="${fn.goto}|${esc(k)}"` : ''}><td>${esc(fn.label(k))}</td><td class="bar"><i style="width:${(n / arr[0][1]) * 100}%;--c:${fn.col || 'var(--blue)'}"></i><span>${fmt(n)}</span></td><td class="r muted">${pct(n, tot2, 0)}</td></tr>`).join('')}</tbody></table>`
    : '<div class="muted">sem dados</div>') + '</div>';
  const feed = mine.filter((r) => r.t >= agg.w0).filter((r) => !c.feedRej || A.isRej(r)).sort((a, b) => b.t - a.t).slice(0, 30);
  const feedRows = feed.map((r) => `<tr class="${A.isRej(r) ? 'rj' : ''}"><td>${hhmmss(r.t)}</td><td>${esc(r.wb)}</td><td>${kind === 'ind' ? '' : String(r.ind).padStart(2, '0')}${kind === 'ind' ? esc(A.chuteLabel(A.chuteKey(r))) : ''}</td><td>${A.isRej(r) ? `<b>${esc(A.reasonLabel(r.ex))}</b>` : '<span class="muted">ok</span>'}</td><td>${esc(r.sc || '—')}</td><td class="r">${r.w.toFixed(2)}</td></tr>`).join('');
  return `<div class="dhead"><h3>${kind === 'ind' ? 'Indução' : 'Saída'} ${esc(labelOf(kind, x.key))} <span class="pillstate sm ${cls} ${pillK(kind, txt)}">${txt}</span></h3>` +
    (kind === 'chute' && SACA[String(x.key)] && !baseOf(x.key) ? `<div class="dbase"><b>Saca:</b>${sacaChip(x.key)} <button class="mini" data-sacaedit="${esc(x.key)}">Editar</button></div>` : '') + (kind === 'chute' && baseOf(x.key) ? `<div class="dbase"><b>Base:</b> ${esc(baseOf(x.key, false))}${sacaChip(x.key)} <button class="mini" data-sacaedit="${esc(String(x.key).split(',')[0])}">Editar saca</button>${codesOf(x.key).length ? ` <span class="muted">· códigos de rota: ${esc(codesOf(x.key).slice(0, 10).join(', '))}${codesOf(x.key).length > 10 ? '…' : ''}</span>` : ''}</div>` : '') +
    `<div class="dk"><div><label>Peças (${winTxt})</label><b>${fmt(x.tot)}</b></div><div><label>${kind === 'ind' ? 'Rejeitos' : 'Rejeitos (Chute block)'}</label><b class="${x.rej ? 'badt' : ''}">${fmt(x.rej)}</b></div>` +
    `<div><label>Taxa</label><b class="${rateCls(rate, th) === 'bad' ? 'badt' : rateCls(rate, th) === 'warn' ? 'warnt' : ''}">${pct(x.rej, x.tot, 2)}</b></div>` +
    `<div><label>Hoje</label><b>${fmt(x.day)}</b></div><div><label>Peso médio</label><b>${x.tot ? dec(x.w / x.tot, 2) : '—'} kg</b></div><div><label>Sem descarga</label><b>${fmt(x.stuck)}</b></div>` +
    `<div><label>Última peça</label><b>${x.last ? 'há ' + agoTxt(x.last, c.now) : '—'}</b></div></div></div>` +
    `<div class="dpulse"><label>Pulso desta ${kind === 'ind' ? 'indução' : 'saída'} · últimos 60 min</label>${pulse}</div>` +
    `<div class="dcols">` +
    tb(kind === 'ind' ? 'Para onde está mandando (saídas)' : 'De onde vem (induções)', topN(x.others, 10), x.tot, { label: (k) => otherLabel(kind, k), goto: other }) +
    tb('Rotas (sortcode)', topN(x.routes, 10), x.tot, { label: (k) => k }) +
    tb('Motivos de rejeito', topN(x.reasons, 8), x.rej, { label: (k) => A.reasonLabel(k), col: 'var(--bad)' }) +
    `</div>` +
    (kind === 'chute' ? bindBlock(c, key) : '') +
    `<div class="dfeed"><h4>Fluxo ao vivo (últimas peças) <label class="chk"><input type="checkbox" data-feedrej ${c.feedRej ? 'checked' : ''}/> só rejeitos</label></h4>` +
    (feedRows ? `<div class="scroll"><table><thead><tr><th>Alimentação</th><th>Waybill</th><th>${kind === 'ind' ? 'Saída' : 'Ind.'}</th><th>Resultado</th><th>Rota</th><th class="r">Peso</th></tr></thead><tbody>${feedRows}</tbody></table></div>` : '<div class="empty">Sem peças na janela.</div>') + `</div>`;
}

function bindBlock(c, key) {
  const L = (c.binds || []).filter((r) => r.chute === key);
  if (!L.length) return '';
  const d0 = explainBind(L[0]);
  const reps = new Map(); for (const r of L) if (r.bag) reps.set(r.bag, (reps.get(r.bag) || 0) + 1);
  const rep = [...reps].filter(([, n]) => n > 1);
  return `<div class="dbind"><h4>Erros de rota nesta saída (hoje: ${L.length})</h4>` +
    `<div class="bdiag"><span class="tag">${esc(bindKindText(d0.kind))}</span> ${esc(d0.why)}<div class="muted">O que fazer: ${esc(d0.todo)}</div>` +
    `<div class="muted sm">A saída aceita (plano): ${esc(d0.allowed.slice(0, 8).join(', ') || '— nenhum código no plano')}${d0.allowed.length > 8 ? ` +${d0.allowed.length - 8}` : ''}${d0.etqNote ? ' · ' + esc(d0.etqNote) : ''}</div>` +
    (rep.length ? `<div class="badt sm">Lote repetido: ${rep.map(([b, n]) => `${esc(b)} ×${n}`).join(', ')} — o mesmo lote foi tentado mais de uma vez.</div>` : '') + `</div>` +
    `<table><thead><tr><th>Hora</th><th>Código recusado</th><th>Lote</th><th>Pertence a</th><th>Estação</th></tr></thead><tbody>` +
    L.slice(0, 8).map((r) => { const o = explainBind(r).owners; return `<tr><td>${hhmmss(r.t)}</td><td><b>${esc(r.code || '—')}</b></td><td>${esc(r.bag || '—')}</td><td>${o.length ? o.slice(0, 3).map((x) => 'saída ' + esc(x.chute)).join(', ') : '<span class="muted">fora do plano</span>'}</td><td class="muted">${esc(r.pc || '')}</td></tr>`; }).join('') + '</tbody></table></div>';
}

// Estado ao vivo de todas as induções/saídas (usado pelo mapa do sorter)
export function snapshot(kind, c) {
  const agg = aggregate(kind, c), out = new Map();
  for (const x of agg.M.values()) out.set(String(x.key), { x, st: status(kind, x, c) });
  return out;
}

export function renderEntityView(el, kind, c) {
  const agg = aggregate(kind, c);
  const searching = kind === 'chute' && !!(c.q || c.qs);
  if (kind === 'chute' && PLAN.map.size) for (const k of PLAN.map.keys()) if (!agg.M.has(k)) agg.M.set(k, { key: k, tot: 0, rej: 0, reasons: new Map(), others: new Map(), routes: new Map(), last: 0, stuck: 0, ly: '', day: 0, w: 0, stub: 1 });
  let nRes = 0;
  if (kind === 'chute') {
    const R = [...agg.M.values()].filter((x) => matchQ(x, c)).sort((a, b) => b.rej - a.rej || b.tot - a.tot || (parseInt(a.key, 10) || 0) - (parseInt(b.key, 10) || 0));
    nRes = R.length;
    if (c.q && R.length && !R.some((x) => String(x.key) === c.sel)) c.sel = String(R[0].key);
  }
  if (!c.sel) {
    const L0 = [...agg.M.values()].filter((x) => x.tot > 0);
    L0.sort((a, b) => (kind === 'ind' ? b.tot - a.tot : b.rej - a.rej || b.tot - a.tot));
    if (L0[0]) c.sel = String(L0[0].key);
  }
  const keys = [...agg.M.values()].filter((x) => kind === 'ind' || (!x.stub && x.tot > 0) || status('chute', x, c)[1] === 'Fechada' || status('chute', x, c)[1] === 'Cheia').sort((a, b) => (kind === 'ind' ? a.key - b.key : b.rej - a.rej || b.tot - a.tot));
  const opts = keys.map((x) => `<option value="${esc(x.key)}" ${String(x.key) === c.sel ? 'selected' : ''}>${kind === 'ind' ? 'Indução' : 'Saída'} ${esc(labelOf(kind, x.key))}</option>`).join('');
  const totW = keys.reduce((a, x) => a + x.tot, 0), rejW = keys.reduce((a, x) => a + x.rej, 0);
  const sc = c.an && c.an.statusCount;
  const act = kind === 'ind' ? 0 : keys.filter((x) => x.rej > 0).length;
  const ae = document.activeElement, hadQ = ae && ae.matches && ae.matches('[data-vq]') && el.contains(ae), caret = hadQ ? [ae.selectionStart, ae.selectionEnd] : null;
  const qbar = kind === 'chute' ? `<div class="vqbar"><div class="vqin"><span class="vqic">⌕</span><input type="text" data-vq value="${esc(c.q || '')}" placeholder="Pesquisar saída: nº, base de destino, código de rota, status…   ( / )" autocomplete="off" spellcheck="false"/>${c.q ? '<button class="vqx" data-vqclear title="Limpar (Esc)">✕</button>' : ''}</div>` + QSTAT.map(([v, t]) => `<button class="vqchip ${(c.qs || '') === v ? 'on' : ''}" data-vqs="${v}">${t}</button>`).join('') + `<span class="muted vqn">${searching ? `<b>${fmt(nRes)}</b> de ${fmt(agg.M.size)} saídas` : `${fmt(agg.M.size)} saídas no plano`} · atualiza ao vivo</span></div>` : '';
  el.innerHTML = qbar + (kind === 'chute' ? sacaMapHTML(c, agg) : '') +
    `<div class="vwbar"><div><h2>${kind === 'ind' ? 'Induções ao vivo' : 'Saídas ao vivo'} <small>${kind === 'ind' ? 'o que cada linha de indução está processando' : 'o que cada saída está recebendo'}</small></h2></div>` +
    `<div class="vwctl"><span class="muted">${kind === 'ind' ? sc ? `<b>${sc.ativa}</b> alimentando · <b>${sc.ociosa}</b> ligadas sem peças · <b>${sc.parada}</b> paradas · <b>${sc.falha}</b> em falha` : '' : `${act} saídas com rejeito`} · ${fmt(totW)} peças · ${fmt(rejW)} rejeitos</span>` +
    `<label>Janela <select data-vwwin>${WINDOWS.map(([v, t]) => `<option value="${v}" ${v === (c.winRaw ?? c.win) ? 'selected' : ''}>${t.replace('HH', String(new Date(c.now).getHours()).padStart(2, '0'))}</option>`).join('')}</select></label>` +
    `<label>Ir para <select data-vwpick><option value="">—</option>${opts}</select></label></div></div>` +
    `<div class="vwgrid"><div class="card vlist">${listHTML(kind, c, agg)}</div><div class="card vdet">${detailHTML(kind, c, agg)}</div></div>` + (kind === 'chute' ? renderConfSaca(c.fall.filter((r) => r.t >= agg.w0)) : '');
  if (hadQ) { const i = el.querySelector('[data-vq]'); if (i) { i.focus(); try { i.setSelectionRange(caret[0], caret[1]); } catch (e) {} } }
}
