// Produtividade por turno: consolidado e detalhado (hora a hora dentro de cada turno).
// Janelas minuto a minuto (T1 06:00, T2 14:00, T3 22:20 por padrão; cada turno vai até o início do próximo).
// Números vêm do Summary statistics do sorter (só leitura), recortados exatamente no horário do turno.
import { summary } from './api.js';
import * as A from './analysis.js';

const durTxt = (d) => { const t = Math.round(d); return Math.floor(t / 60) + 'h' + String(t % 60).padStart(2, '0'); };
const p2 = (n) => String(n).padStart(2, '0');
const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
const dec = (n, d = 1) => Number(n).toFixed(d).replace('.', ',');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pc = (a, b) => (b ? (a / b) * 100 : 0);
const DAY = 86400000, MIN = 60000;
const hm = (ms) => p2(new Date(ms).getHours()) + ':' + p2(new Date(ms).getMinutes());
const dm = (ms) => p2(new Date(ms).getDate()) + '/' + p2(new Date(ms).getMonth() + 1);
const mins = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim()); return m ? (+m[1]) * 60 + (+m[2]) : null; };

export function turnoCfg(cfg) {
  return [mins(cfg.turnoT1) ?? 360, mins(cfg.turnoT2) ?? 840, mins(cfg.turnoT3) ?? 1340];
}

// Janelas relativas a hoje: T3 que virou o dia (ontem → hoje), T1, T2 e T3 que começa hoje (termina amanhã).
export function janelas(now, cfg) {
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0); const D = d0.getTime();
  const [t1, t2, t3] = turnoCfg(cfg).map((m) => m * MIN);
  const J = [
    { id: 'T3o', nome: 'T3', sub: 'virou o dia', ini: D - DAY + t3, fim: D + t1 },
    { id: 'T1', nome: 'T1', sub: '', ini: D + t1, fim: D + t2 },
    { id: 'T2', nome: 'T2', sub: '', ini: D + t2, fim: D + t3 },
    { id: 'T3', nome: 'T3', sub: 'começa hoje', ini: D + t3, fim: D + DAY + t1 }
  ];
  for (const j of J) j.st = now < j.ini ? 'futuro' : now >= j.fim ? 'fechado' : 'andamento';
  return J;
}

const T = { cache: new Map(), busy: new Set(), day: 0, err: '', redraw: null };

export const rowsToTurno = (rows) => {
  const b = (rows || []).map((r) => {
    const tt = String(r.timearea || '').match(/(\d{2}):(\d{2}):\d{2}/g) || [];
    return { lab: tt.length ? tt[0].slice(0, 5) + '–' + (tt[1] || tt[0]).slice(0, 5) : '?', tot: +r.sorter_sorttotal || 0, abn: +r.sorter_abnormaltotal || 0, blk: +r.sorter_chuteblocktotal || 0, a: +r.ps01_sorttotal || 0, b: +r.ps02_sorttotal || 0 };
  });
  const s = b.reduce((x, y) => ({ tot: x.tot + y.tot, abn: x.abn + y.abn, blk: x.blk + y.blk, a: x.a + y.a, b: x.b + y.b }), { tot: 0, abn: 0, blk: 0, a: 0, b: 0 });
  return { buckets: b, ...s, temLinhas: (rows || []).some((r) => r.ps01_sorttotal != null || r.ps02_sorttotal != null) };
};

async function carregar(j, now) {
  if (j.st === 'futuro') return;
  const key = j.id + ':' + j.ini + (j.st === 'andamento' ? ':' + Math.floor(now / MIN) : ':f');
  if (T.cache.has(key) || T.busy.has(j.id + j.ini)) return;
  T.busy.add(j.id + j.ini);
  try {
    const r = await summary({ start: j.ini, end: Math.min(j.fim, now) - 1000, group: 60, create: false });
    for (const k of [...T.cache.keys()]) if (k.startsWith(j.id + ':' + j.ini + ':')) T.cache.delete(k);
    T.cache.set(key, rowsToTurno(r.data)); T.err = '';
  } catch (e) { T.err = e.message || String(e); }
  T.busy.delete(j.id + j.ini);
  if (T.redraw) T.redraw();
}
const dado = (j, now) => T.cache.get(j.id + ':' + j.ini + (j.st === 'andamento' ? ':' + Math.floor(now / MIN) : ':f')) || [...T.cache].filter(([k]) => k.startsWith(j.id + ':' + j.ini + ':')).map((x) => x[1])[0] || null;

// Ofensoras do turno, quando a trace carregada no painel cobre toda a janela.
export function ofensoras(rows, j, now, lvl) {
  if (!rows || !rows.length) return null;
  const ini = j.ini, fim = Math.min(j.fim, now);
  let min = Infinity; for (const r of rows) if (r.t < min) min = r.t;
  if (min > ini + 2 * MIN) return null;
  const rej = rows.filter((r) => r.t >= ini && r.t < fim && r.ex);
  const top = (kf) => { const m = new Map(); for (const r of rej) { const k = kf(r); if (k) m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1])[0] || null; };
  return { rej: rej.length, motivo: top((r) => A.reasonLabel(r.ex)), rota: top((r) => A.routeKey(r, lvl)), saida: top((r) => (r.ex === 'Chute block' ? A.chuteLabel(A.chuteKey(r)) : '')) };
}

export function metricas(j, d, now, cfg) {
  const fim = Math.min(j.fim, now), dur = Math.max(0, (fim - j.ini) / MIN), horas = dur / 60;
  const meta = +cfg.feishuMeta || 0, ap = d.tot - d.abn;
  const ativos = d.buckets.filter((x) => x.tot > 0);
  const melhor = ativos.reduce((m, x) => (!m || x.tot > m.tot ? x : m), null), pior = ativos.length > 1 ? ativos.reduce((m, x) => (!m || x.tot < m.tot ? x : m), null) : null;
  return { ...d, ap, apPct: pc(ap, d.tot), taxa: pc(d.abn, d.tot), dur, pph: horas ? d.tot / horas : 0, melhor, pior, metaTot: meta ? meta * horas : 0, metaPct: meta && horas ? pc(d.tot, meta * horas) : null };
}


// ---------- gráficos de análise (um card por gráfico) ----------
const W = 640, PL = 58, PR = 22, PT = 22, PB = 34;
const COR = { T3o: '#f59e0b', T1: '#2563eb', T2: '#16a34a', T3: '#0d9488' };
const nice = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v || 1))); for (const m of [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p; return 10 * p; };
const svg = (H, inner) => `<svg viewBox="0 0 ${W} ${H}" class="rsvg tnsvg" role="img">${inner}</svg>`;
const grid = (max, H, f = fmt, lo = 0) => { let s = ''; for (let i = 0; i <= 4; i++) { const y = PT + (H - PT - PB) * (1 - i / 4); s += `<line x1="${PL}" x2="${W - PR}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${PL - 6}" y="${y + 4}" text-anchor="end" class="rt">${f(lo + (max - lo) * i / 4)}</text>`; } return s; };
const lbl = (e) => (e.j.id === 'T3o' ? 'T3 (virou o dia)' : e.j.id === 'T3' ? 'T3 (hoje)' : e.j.nome);
const leg = (L) => L.map((e, i) => `<rect x="${PL + i * 128}" y="2" width="9" height="9" rx="2" fill="${COR[e.j.id]}"/><text x="${PL + i * 128 + 13}" y="10" class="rt">${esc(lbl(e))}</text>`).join('');

function colunas(L, H, valor, max, fmtV, extra) {
  const bw = (W - PL - PR) / L.length; let s = grid(max, H, fmtV);
  L.forEach((e, i) => { const v = valor(e), x = PL + i * bw + bw * 0.22, w = bw * 0.56, y = PT + (H - PT - PB) * (1 - v / max);
    s += `<rect x="${x}" y="${y}" width="${w}" height="${H - PB - y}" rx="4" fill="${COR[e.j.id]}"><title>${esc(lbl(e))}: ${fmtV(v)}</title></rect><text x="${x + w / 2}" y="${y - 6}" text-anchor="middle" class="rt b">${fmtV(v)}</text><text x="${x + w / 2}" y="${H - 12}" text-anchor="middle" class="rt">${esc(lbl(e))}</text>`;
    if (extra) s += extra(e, x, w, y, H);
  });
  return s;
}

function pontos(L, f) { // hora a hora: só faixas completas (≥ 58 min), eixo = hora do turno
  return L.map((e) => ({ e, p: e.m.buckets.map((b, i) => { const mm = /(\d+):(\d+)–(\d+):(\d+)/.exec(b.lab); const dur = mm ? ((+mm[3] * 60 + +mm[4] - (+mm[1] * 60 + +mm[2])) + 1440 + 1) % 1440 : 60; return { i, ok: dur >= 58 && b.tot > 0, b, v: f(b) }; }).filter((x) => x.ok) }));
}
function linhas(L, H, f, lo, hi, fmtV) {
  const P = pontos(L, f), n = Math.max(1, ...P.map((x) => Math.max(0, ...x.p.map((q) => q.i + 1))));
  const X = (i) => PL + ((i + 0.5) / n) * (W - PL - PR), Y = (v) => PT + (H - PT - PB) * (1 - (v - lo) / (hi - lo));
  let s = grid(hi, H, fmtV, lo);
  for (let i = 0; i < n; i++) s += `<text x="${X(i)}" y="${H - 12}" text-anchor="middle" class="rt">${i + 1}ª hora</text>`;
  P.forEach(({ e, p }) => { if (!p.length) return; s += `<polyline fill="none" stroke="${COR[e.j.id]}" stroke-width="2.5" points="${p.map((q) => X(q.i) + ',' + Y(q.v)).join(' ')}"/>` + p.map((q) => `<circle cx="${X(q.i)}" cy="${Y(q.v)}" r="4" fill="${COR[e.j.id]}" stroke="var(--card)" stroke-width="2"><title>${esc(lbl(e))} · ${esc(q.b.lab)}: ${fmtV(q.v)}</title></circle>`).join(''); });
  return { svg: svg(H, s + leg(L)), vazio: !P.some((x) => x.p.length), P };
}

const acard = (t, sub, what, body, ins, cls = '') => `<section class="card tnch ${cls}"><h3>${t}${sub ? ` <small>${sub}</small>` : ''}</h3><p class="muted rwhat">${what}</p>${body}${ins ? `<p class="tnins"><b>Leitura:</b> ${ins}</p>` : ''}</section>`;

function analises(L, cfg, now) {
  if (!L.length) return '';
  const lim = +cfg.rejectThreshold || 3, meta = +cfg.feishuMeta || 0, H = 250;
  const maxT = nice(Math.max(...L.map((e) => e.m.tot), 10) * 1.15);
  const gA = colunas(L, H, (e) => e.m.tot, maxT, fmt, (e, x, w, y) => { const yy = PT + (H - PT - PB) * (1 - e.m.ap / maxT); return `<rect x="${x + w * 0.25}" y="${yy}" width="${w * 0.5}" height="${H - PB - yy}" rx="3" fill="#fff" opacity=".45"><title>Aproveitado: ${fmt(e.m.ap)}</title></rect>`; });
  const top = L.reduce((a, b) => (b.m.tot > a.m.tot ? b : a)), low = L.reduce((a, b) => (b.m.tot < a.m.tot ? b : a));
  const insA = L.length > 1 ? `${esc(lbl(top))} processou mais (${fmt(top.m.tot)}); ${esc(lbl(low))} menos (${fmt(low.m.tot)}), ${dec(pc(top.m.tot - low.m.tot, low.m.tot), 0)}% de diferença. Turnos em andamento ainda estão parciais.` : `${esc(lbl(top))}: ${fmt(top.m.tot)} peças.`;
  // aproveitamento
  const loA = 100 - Math.min(100, Math.max(4, Math.ceil((100 - Math.min(...L.map((e) => e.m.apPct), 100 - lim) + 1) / 4) * 4));
  const bwA = (W - PL - PR) / L.length; let sA = grid(100, H, (v) => dec(v, 0) + '%', loA);
  const YA = (v) => PT + (H - PT - PB) * (1 - (v - loA) / (100 - loA));
  sA += `<line x1="${PL}" x2="${W - PR}" y1="${YA(100 - lim)}" y2="${YA(100 - lim)}" stroke="var(--bad)" stroke-dasharray="6 4"/>`;
  L.forEach((e, i) => { const x = PL + i * bwA + bwA * 0.22, w = bwA * 0.56, y = YA(e.m.apPct), c = e.m.apPct < 100 - lim ? 'var(--bad)' : COR[e.j.id];
    sA += `<rect x="${x}" y="${y}" width="${w}" height="${H - PB - y}" rx="4" fill="${c}"><title>${esc(lbl(e))}: ${dec(e.m.apPct, 2)}%</title></rect><text x="${x + w / 2}" y="${y - 6}" text-anchor="middle" class="rt b">${dec(e.m.apPct)}%</text><text x="${x + w / 2}" y="${H - 12}" text-anchor="middle" class="rt">${esc(lbl(e))}</text>`; });
  const bst = L.reduce((a, b) => (b.m.apPct > a.m.apPct ? b : a)), wst = L.reduce((a, b) => (b.m.apPct < a.m.apPct ? b : a));
  const insB = `${esc(lbl(bst))} teve o melhor aproveitamento (${dec(bst.m.apPct)}%)` + (L.length > 1 ? `; ${esc(lbl(wst))} o pior (${dec(wst.m.apPct)}%)` : '') + `. ${L.some((e) => e.m.apPct < 100 - lim) ? 'Barras vermelhas ficaram abaixo do mínimo definido pelo limite de rejeito.' : 'Todos dentro do mínimo definido pelo limite de rejeito.'} (Eixo recortado para destacar a diferença.)`;
  // ritmo
  const maxP = nice(Math.max(meta, ...L.map((e) => e.m.pph), 10) * 1.15);
  const gC = colunas(L, H, (e) => Math.round(e.m.pph), maxP, fmt) + (meta ? `<line x1="${PL}" x2="${W - PR}" y1="${PT + (H - PT - PB) * (1 - meta / maxP)}" y2="${PT + (H - PT - PB) * (1 - meta / maxP)}" stroke="var(--ink)" stroke-dasharray="2 4"/><text x="${W - PR}" y="${PT + (H - PT - PB) * (1 - meta / maxP) - 4}" text-anchor="end" class="rt b">meta ${fmt(meta)}/h</text>` : '');
  const fast = L.reduce((a, b) => (b.m.pph > a.m.pph ? b : a));
  const insC = `${esc(lbl(fast))} manteve o maior ritmo (${fmt(Math.round(fast.m.pph))} peças/h).` + (meta ? ` Meta de ${fmt(meta)}/h: ${L.map((e) => `${esc(lbl(e))} ${dec(pc(e.m.pph, meta), 0)}%`).join(' · ')}.` : ' Defina a meta por hora em ⚙ Configurações › Feishu para ver a linha de meta.');
  // linhas A x B
  const comL = L.filter((e) => e.m.temLinhas && e.m.a + e.m.b > 0);
  let gD = '', insD = '';
  if (comL.length) {
    const mx = nice(Math.max(...comL.map((e) => e.m.a + e.m.b)) * 1.15), bw = (W - PL - PR) / comL.length; gD = grid(mx, H, fmt);
    comL.forEach((e, i) => { const x = PL + i * bw + bw * 0.22, w = bw * 0.56, yA = PT + (H - PT - PB) * (1 - e.m.a / mx), yT = PT + (H - PT - PB) * (1 - (e.m.a + e.m.b) / mx);
      gD += `<rect x="${x}" y="${yA}" width="${w}" height="${H - PB - yA}" fill="#f6d77a"><title>Linha A (L1): ${fmt(e.m.a)}</title></rect><rect x="${x}" y="${yT}" width="${w}" height="${yA - yT}" rx="3" fill="#d9958b"><title>Linha B (L2): ${fmt(e.m.b)}</title></rect>${H - PB - yA > 16 ? `<text x="${x + w / 2}" y="${(yA + H - PB) / 2 + 4}" text-anchor="middle" class="rt b">${dec(pc(e.m.a, e.m.a + e.m.b), 0)}%</text>` : ''}${yA - yT > 16 ? `<text x="${x + w / 2}" y="${(yT + yA) / 2 + 4}" text-anchor="middle" class="rt b">${dec(pc(e.m.b, e.m.a + e.m.b), 0)}%</text>` : ''}<text x="${x + w / 2}" y="${H - 12}" text-anchor="middle" class="rt">${esc(lbl(e))}</text>`; });
    gD += `<rect x="${PL}" y="2" width="9" height="9" fill="#d9958b"/><text x="${PL + 13}" y="10" class="rt">Linha B (L2)</text><rect x="${PL + 90}" y="2" width="9" height="9" fill="#f6d77a"/><text x="${PL + 103}" y="10" class="rt">Linha A (L1)</text>`;
    insD = comL.map((e) => `${esc(lbl(e))}: A ${dec(pc(e.m.a, e.m.a + e.m.b), 0)}% / B ${dec(pc(e.m.b, e.m.a + e.m.b), 0)}%`).join(' · ') + '. Divisão muito desigual pode indicar carga mal distribuída ou uma linha com problema.';
  }
  // rejeito
  const maxR = nice(Math.max(lim * 1.4, ...L.map((e) => e.m.taxa)) * 1.15);
  const bwR = (W - PL - PR) / L.length; let sR = grid(maxR, H, (v) => dec(v, 1) + '%');
  const YR = (v) => PT + (H - PT - PB) * (1 - v / maxR);
  sR += `<line x1="${PL}" x2="${W - PR}" y1="${YR(lim)}" y2="${YR(lim)}" stroke="var(--bad)" stroke-dasharray="6 4"/><text x="${W - PR}" y="${YR(lim) - 4}" text-anchor="end" class="rt b" style="fill:var(--bad)">limite ${dec(lim)}%</text>`;
  L.forEach((e, i) => { const x = PL + i * bwR + bwR * 0.22, w = bwR * 0.56, y = YR(e.m.taxa), c = e.m.taxa > lim ? 'var(--bad)' : COR[e.j.id];
    sR += `<rect x="${x}" y="${y}" width="${w}" height="${H - PB - y}" rx="4" fill="${c}"><title>${esc(lbl(e))}: ${fmt(e.m.abn)} rejeitos (${dec(e.m.taxa, 2)}%)</title></rect><text x="${x + w / 2}" y="${y - 6}" text-anchor="middle" class="rt b">${dec(e.m.taxa)}% · ${fmt(e.m.abn)}</text><text x="${x + w / 2}" y="${H - 12}" text-anchor="middle" class="rt">${esc(lbl(e))}</text>`; });
  const wr = L.reduce((a, b) => (b.m.taxa > a.m.taxa ? b : a));
  const insE = `${esc(lbl(wr))} teve a maior taxa de rejeito (${dec(wr.m.taxa)}%, ${fmt(wr.m.abn)} peças).` + (wr.m.blk ? ` Foram ${fmt(wr.m.blk)} ocorrência(s) de saída bloqueando nesse turno.` : '') + (wr.m.taxa > lim ? ' Acima do limite — veja as ofensoras no cartão do turno.' : ' Dentro do limite configurado.');
  // hora a hora dentro do turno
  const mxF = nice(Math.max(...L.flatMap((e) => e.m.buckets.map((b) => b.tot)), 10) * 1.15);
  const F = linhas(L, H, (b) => b.tot, 0, mxF, fmt);
  const pk = F.P.flatMap(({ e, p }) => p.map((q) => ({ e, q }))).sort((a, b) => b.q.v - a.q.v)[0];
  const insF = pk ? `Pico: ${esc(lbl(pk.e))} na ${pk.q.i + 1}ª hora (${esc(pk.q.b.lab)}) com ${fmt(pk.q.v)} peças. Compara o mesmo ponto de cada turno (1ª hora, 2ª hora…); só faixas completas de 60 min.` : '';
  const loG = 100 - Math.min(100, Math.max(4, Math.ceil((100 - Math.min(...L.flatMap((e) => e.m.buckets.filter((b) => b.tot > 0).map((b) => pc(b.tot - b.abn, b.tot))), 100 - lim) + 1) / 4) * 4));
  const G = linhas(L, H, (b) => pc(b.tot - b.abn, b.tot), loG, 100, (v) => dec(v, 0) + '%');
  const dip = G.P.flatMap(({ e, p }) => p.map((q) => ({ e, q }))).sort((a, b) => a.q.v - b.q.v)[0];
  const insG = dip ? `Menor aproveitamento: ${esc(lbl(dip.e))} na ${dip.q.i + 1}ª hora (${esc(dip.q.b.lab)}) com ${dec(dip.q.v)}% — ${fmt(dip.q.b.abn)} rejeitos em ${fmt(dip.q.b.tot)} peças. Quedas isoladas costumam ser evento pontual (saída cheia, cortina).` : '';
  return `<div class="tnan">` +
    acard('Produção por turno', 'processado × aproveitado', 'Barra colorida = peças processadas; faixa clara por dentro = peças aproveitadas (processado − rejeito).', svg(H, gA + leg(L)), insA) +
    acard('Aproveitamento por turno', '(processado − rejeito) ÷ processado', 'Ex.: processou 100 e rejeitou 10 → 90%. A linha vermelha é o mínimo aceitável pelo limite de rejeito.', svg(H, sA + leg(L) + `<line x1="${W - PR - 92}" x2="${W - PR - 76}" y1="6.5" y2="6.5" stroke="var(--bad)" stroke-dasharray="4 3" stroke-width="2"/><text x="${W - PR}" y="10" text-anchor="end" class="rt b" style="fill:var(--bad)">mínimo ${dec(100 - lim, 0)}%</text>`), insB) +
    acard('Ritmo médio por turno', 'peças por hora', 'Processado ÷ horas decorridas do turno. Compara a velocidade real, independentemente da duração de cada turno.', svg(H, gC + leg(L)), insC) +
    (comL.length ? acard('Linha A × Linha B por turno', 'A = camada L1 · B = camada L2', 'Participação de cada linha na produção do turno.', svg(H, gD), insD) : '') +
    acard('Rejeito por turno', 'taxa e quantidade', 'Rejeitos ÷ processado de cada turno. Barras vermelhas passaram do limite definido em Configurações.', svg(H, sR + leg(L)), insE) +
    acard('Hora a hora dentro do turno', 'produção', 'Cada linha é um turno; o eixo é a hora do turno (1ª, 2ª…), para comparar o ritmo no mesmo ponto.', F.vazio ? '<p class="muted">Ainda sem hora completa.</p>' : F.svg, insF) +
    acard('Aproveitamento hora a hora dentro do turno', '%', 'Mesma comparação, agora do aproveitamento: mostra em que ponto do turno o rejeito aumenta.', G.vazio ? '<p class="muted">Ainda sem hora completa.</p>' : G.svg, insG, 'wide') + `</div>`;
}

const kv = (l, v, c = '') => `<div class="tnk ${c}"><b>${v}</b><span>${l}</span></div>`;
const tag = (st) => (st === 'andamento' ? '<i class="tg on">em andamento</i>' : st === 'fechado' ? '<i class="tg ok">encerrado</i>' : '<i class="tg">ainda não começou</i>');

function bars(m, lim) {
  const mx = Math.max(1, ...m.buckets.map((x) => x.tot));
  return `<div class="tnb">${m.buckets.map((x) => `<div class="tnc" title="${esc(x.lab)}: ${fmt(x.tot)} processadas · ${fmt(x.abn)} rejeitos (${dec(pc(x.abn, x.tot))}%)"><em>${fmt(x.tot)}</em><u style="height:${Math.max(3, (x.tot / mx) * 100)}%"><s style="height:${Math.min(100, pc(x.abn, x.tot) * 6)}%"></s></u><span>${esc(x.lab.slice(0, 5))}</span></div>`).join('')}</div>`;
}

function cartao(j, d, rows, now, cfg) {
  const head = `<div class="tnh"><h3>${j.nome} <small>${hm(j.ini)} – ${hm(j.fim - MIN)}${j.sub ? ' · ' + j.sub : ''}</small></h3>${tag(j.st)}</div><p class="muted tnd">${dm(j.ini)} ${hm(j.ini)} → ${dm(j.fim - MIN)} ${hm(j.fim - MIN)}</p>`;
  if (j.st === 'futuro') return `<section class="card tn off">${head}<p class="muted tnw">Este turno ainda não começou.</p></section>`;
  if (!d) return `<section class="card tn">${head}<p class="muted tnw">Carregando do sorter…</p></section>`;
  const m = metricas(j, d, now, cfg), lim = +cfg.rejectThreshold || 3, of = ofensoras(rows, j, now, +cfg.routeLevel || 2);
  const cor = m.taxa > lim ? 'bad' : 'ok';
  return `<section class="card tn">${head}<div class="tnkg">` +
    kv('Processado', fmt(m.tot), 'blue') + kv('Aproveitado', fmt(m.ap) + ' · ' + dec(m.apPct) + '%', cor) + kv('Rejeito', fmt(m.abn) + ' · ' + dec(m.taxa) + '%', cor) + kv('Ritmo médio', fmt(Math.round(m.pph)) + '/h', '') +
    `</div><div class="tnm"><span>Linha A (L1) <b>${m.temLinhas ? fmt(m.a) : '—'}</b></span><span>Linha B (L2) <b>${m.temLinhas ? fmt(m.b) : '—'}</b></span><span>Saída bloqueando <b>${fmt(m.blk)}</b></span><span>Duração <b>${durTxt(m.dur)}</b></span>` + (m.metaPct != null ? `<span>Meta do turno <b>${dec(m.metaPct, 0)}%</b></span>` : '') + `</div>` +
    bars(m, lim) +
    `<p class="tnl">${m.melhor ? `Melhor faixa: <b>${esc(m.melhor.lab)}</b> (${fmt(m.melhor.tot)})` : ''}${m.pior ? ` · Pior: <b>${esc(m.pior.lab)}</b> (${fmt(m.pior.tot)})` : ''}</p>` +
    (of && of.rej ? `<p class="tnl">Principal motivo: <b>${esc(of.motivo ? of.motivo[0] : '—')}</b> · Rota ofensora: <b>${esc(of.rota ? of.rota[0] : '—')}</b> · Saída ofensora: <b>${esc(of.saida ? of.saida[0] : '—')}</b></p>` : '') + `</section>`;
}

export function renderTurnos(el, c) {
  const { now, cfg, rows } = c; T.redraw = c.redraw;
  const day = new Date(now).setHours(0, 0, 0, 0); if (T.day !== day) { T.cache.clear(); T.day = day; }
  const J = janelas(now, cfg); J.forEach((j) => carregar(j, now));
  const D = J.map((j) => dado(j, now)), lim = +cfg.rejectThreshold || 3;
  const hoje = J.map((j, i) => ({ j, d: D[i] })).filter((x) => x.j.id !== 'T3o' && x.d);
  const cons = hoje.reduce((a, x) => ({ tot: a.tot + x.d.tot, abn: a.abn + x.d.abn, blk: a.blk + x.d.blk, a: a.a + x.d.a, b: a.b + x.d.b }), { tot: 0, abn: 0, blk: 0, a: 0, b: 0 });
  const durH = hoje.reduce((a, x) => a + Math.max(0, (Math.min(x.j.fim, now) - x.j.ini) / 3600000), 0);
  const [m1, m2, m3] = turnoCfg(cfg), fh = (m) => p2(Math.floor(m / 60) % 24) + ':' + p2(m % 60), fe = (m) => fh((m + 1440 - 1) % 1440);
  const head = `<section class="card tnhead"><div><h2>Produtividade por turno <small>consolidado e detalhado</small></h2><p class="muted">T1 ${fh(m1)}–${fe(m2)} · T2 ${fh(m2)}–${fe(m3)} · T3 ${fh(m3)}–${fe(m1)} (vira o dia). Cada turno termina quando o próximo começa. Números do Summary statistics do sorter, recortados no minuto do turno; aproveitamento = (processado − rejeito) ÷ processado. Nos gráficos: azul = processado na faixa; vermelho no topo = parcela de rejeito (exagerada 6× para aparecer). Horários editáveis em ⚙ Configurações › Turnos.</p></div></section>`;
  const consol = `<section class="card tncons"><h3>Consolidado de hoje <small>T1 + T2 + T3 que começa hoje · o T3 que virou o dia fica à parte</small></h3><div class="tnkg five">` +
    kv('Processado', fmt(cons.tot), 'blue') + kv('Aproveitado', fmt(cons.tot - cons.abn) + ' · ' + dec(pc(cons.tot - cons.abn, cons.tot)) + '%', pc(cons.abn, cons.tot) > lim ? 'bad' : 'ok') + kv('Rejeito', fmt(cons.abn) + ' · ' + dec(pc(cons.abn, cons.tot)) + '%', pc(cons.abn, cons.tot) > lim ? 'bad' : 'ok') + kv('Ritmo médio', durH ? fmt(Math.round(cons.tot / durH)) + '/h' : '—') + kv('Linha A / B', hoje.some((x) => x.d.temLinhas) ? fmt(cons.a) + ' / ' + fmt(cons.b) : '—') + `</div></section>`;
  const cards = J.map((j, i) => cartao(j, D[i], rows, now, cfg)).join('');
  const L = J.map((j, i) => ({ j, m: D[i] && j.st !== 'futuro' && Math.min(j.fim, now) > j.ini ? metricas(j, D[i], now, cfg) : null })).filter((x) => x.m && x.m.tot > 0);
  const an = analises(L, cfg, now);
  const lin = J.map((j, i) => {
    if (j.st === 'futuro') return `<tr class="off"><td><b>${j.nome}</b>${j.sub ? ' <small class="muted">' + j.sub + '</small>' : ''}</td><td>${hm(j.ini)}–${hm(j.fim - MIN)}</td><td colspan="9" class="muted">ainda não começou</td></tr>`;
    if (!D[i]) return `<tr><td><b>${j.nome}</b></td><td>${hm(j.ini)}–${hm(j.fim - MIN)}</td><td colspan="9" class="muted">carregando…</td></tr>`;
    const m = metricas(j, D[i], now, cfg);
    return `<tr><td><b>${j.nome}</b>${j.sub ? ' <small class="muted">' + j.sub + '</small>' : ''}</td><td>${hm(j.ini)}–${hm(j.fim - MIN)}</td><td class="r">${durTxt(m.dur)}</td><td class="r"><b>${fmt(m.tot)}</b></td><td class="r">${fmt(m.ap)}</td><td class="r"><span class="rate ${m.taxa > lim ? 'bad' : 'ok'}">${dec(m.apPct)}%</span></td><td class="r">${fmt(m.abn)}</td><td class="r">${fmt(Math.round(m.pph))}/h</td><td class="r">${m.temLinhas ? fmt(m.a) : '—'}</td><td class="r">${m.temLinhas ? fmt(m.b) : '—'}</td><td class="r">${m.metaPct != null ? dec(m.metaPct, 0) + '%' : '—'}</td></tr>`;
  }).join('');
  const tab = `<section class="card"><h3>Comparativo entre turnos</h3><div class="scroll"><table><thead><tr><th>Turno</th><th>Horário</th><th class="r">Duração</th><th class="r">Processado</th><th class="r">Aproveitado</th><th class="r">Aproveit.</th><th class="r">Rejeito</th><th class="r">Ritmo médio</th><th class="r">Linha A</th><th class="r">Linha B</th><th class="r">Meta</th></tr></thead><tbody>${lin}</tbody></table></div><p class="muted" style="margin:8px 2px 0">Ritmo médio = processado ÷ horas decorridas do turno. Meta = processado ÷ (meta por hora × horas decorridas), se a meta por hora estiver definida.${T.err ? ' · ⚠ ' + esc(T.err) : ''}</p></section>`;
  el.innerHTML = head + consol + an + `<div class="tngrid">${cards}</div>` + tab;
}
