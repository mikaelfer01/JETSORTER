// Rejeitos — análises extras: semáforo, causa raiz do Chute block por saída, linha do tempo de uma saída, recorrência entre dias,
// rotas sem plano, indução fora do esperado, tendência por rota, peças reincidentes, retrabalho por turno, saturação das saídas de exceção.
import * as A from './analysis.js';
import { baseOf, PLAN } from './plan.js';
import { HS, dayList } from './history.js';
import { turnoCfg, janelas } from './turnos.js';
import { p2, fmt, dec, pc, esc, MIN, HOUR, hm, dm, dkey, WD, ago, card, grid2, kvs, table, tag, hbars, btn, note, colChart, csvDownload } from './kit.js';

const RX = { sel: '', tab: 'causa' };

function causa(ch, n, c) {
  const { binds, an, now } = c, no = String(parseInt(ch, 10)), ev = [];
  let tipo = 'sem causa identificada', cls = '';
  const bf = [...(binds ? binds.values() : [])].filter((b) => String(parseInt(b.chute, 10)) === no && now - b.t <= 3 * HOUR);
  const st = (c.state || []).find((s) => s.grp === 'chute' && String(s.no) === no && (s.kind === 'cheia' || s.kind === 'fechada'));
  const hist = an ? an.ev.filter((e) => e.grp === 'chute' && String(e.no) === no && (e.kind === 'cheia' || e.kind === 'fechada')) : [];
  if (PLAN.map.size && !PLAN.map.has(no)) { tipo = 'saída fora do plano ativo'; cls = 'bad'; ev.push('não consta no plano'); }
  else if (st) { tipo = st.kind === 'cheia' ? 'saída cheia' : 'saída fechada'; cls = 'bad'; ev.push(`${tipo} desde ${hm(st.since)}`); }
  else if (bf.length) { tipo = 'falha ao abrir lote'; cls = 'bad'; ev.push(`${bf.length} falha(s), última ${hm(bf.sort((a, b) => b.t - a.t)[0].t)}`); }
  else if (hist.length) { tipo = 'saída ficou cheia/fechada antes'; cls = 'warn'; ev.push(`${hist.length} evento(s) hoje`); }
  return { tipo, cls, ev: ev.join(' · ') || '—' };
}

export function renderRejExtra(el, c) {
  const { all, now, d0, cfg, an } = c, lvl = cfg.routeLevel, th = +cfg.rejectThreshold || 3;
  const fall = all.filter((r) => r.dc), rej = fall.filter((r) => r.ex), blk = rej.filter((r) => r.ex === A.BLOCK);
  const h1 = fall.filter((r) => r.t >= now - HOUR), r1 = h1.filter((r) => r.ex), rt = h1.length ? (r1.length / h1.length) * 100 : 0;
  const sem = rt >= th * 2 ? ['bad', 'Crítico'] : rt >= th ? ['warn', 'Atenção'] : ['ok', 'Normal'];
  const bind3 = c.binds ? [...c.binds.values()].filter((b) => now - b.t <= 30 * MIN).length : 0;

  // C13 semáforo
  const top = A.nowStats(fall, now, 60, lvl, +cfg.chuteAlert || 5);
  const kp = kvs([['Situação (última hora)', sem[1], sem[0], dec(rt, 2) + '% de rejeito · limite ' + dec(th, 1) + '%'], ['Chute block hoje', fmt(blk.length), blk.length ? 'warn' : 'ok', dec(pc(blk.length, fall.length), 2) + '% das peças'], ['Saídas ativas bloqueando', fmt(top.activeChutes.length), top.activeChutes.length ? 'bad' : 'ok'], ['Falhas de lote (30 min)', fmt(bind3), bind3 ? 'bad' : 'ok']]);

  // C1 causa raiz
  const byCh = new Map(); for (const r of blk) { const k = A.chuteKey(r); byCh.set(k, (byCh.get(k) || 0) + 1); }
  const rec = new Map(); for (const r of blk.filter((x) => x.t >= now - 2 * HOUR)) { const k = A.chuteKey(r); rec.set(k, (rec.get(k) || 0) + 1); }
  const topCh = [...byCh].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const c1 = table(['Saída', 'Base', 'Bloqueios hoje', 'Últimas 2 h', 'Causa provável', 'Evidência'], topCh.map(([k, n]) => { const x = causa(k, n, c); return [`<b>${esc(A.chuteLabel(k))}</b>`, esc(baseOf(k) || '—'), fmt(n), fmt(rec.get(k) || 0), tag(x.tipo, x.cls), esc(x.ev)]; }), { right: [2, 3], empty: 'Sem Chute block hoje. ✅', cls: 'tnt' });

  // C2 linha do tempo de uma saída
  if (!RX.sel && topCh[0]) RX.sel = topCh[0][0];
  const sel = RX.sel, tl = (() => {
    if (!sel) return note('Sem saída para detalhar.');
    const t0 = Math.floor((now - 6 * HOUR) / (30 * MIN)) * 30 * MIN, N = 12, B = Array(N).fill(0);
    for (const r of blk) if (A.chuteKey(r) === sel && r.t >= t0) { const i = Math.min(N - 1, Math.floor((r.t - t0) / (30 * MIN))); B[i]++; }
    const no = String(parseInt(sel, 10)), ev = [];
    for (const b of c.binds ? c.binds.values() : []) if (String(parseInt(b.chute, 10)) === no && b.t >= t0) ev.push({ t: b.t, x: 'Falha ao abrir lote' });
    for (const e of an ? an.ev : []) if (e.grp === 'chute' && String(e.no) === no && e.start >= t0 && (e.kind === 'cheia' || e.kind === 'fechada')) ev.push({ t: e.start, x: e.kind === 'cheia' ? 'Saída cheia' : 'Saída fechada' });
    ev.sort((a, b) => b.t - a.t);
    const opts = topCh.map(([k]) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(A.chuteLabel(k))}</option>`).join('');
    return `<div class="kbar"><label>Saída <select data-rx="sel">${opts}</select></label></div>` + colChart(B.map((_, i) => hm(t0 + i * 30 * MIN)), [{ name: 'Chute block', color: '#d9534f', vals: B }], { H: 180 }) + table(['Hora', 'Evento'], ev.slice(0, 8).map((e) => [hm(e.t), e.x]), { empty: 'Nenhum evento de saída/lote nas últimas 6 h.', cls: 'tnt' });
  })();

  // C3 recorrência entre dias
  const ks = dayList().filter((k) => k < dkey(now)).slice(-7), cnt = new Map();
  for (const k of ks) for (const [ch, n] of Object.entries(HS.days[k].chBlk || {})) { const x = cnt.get(ch) || { d: 0, n: 0 }; x.d++; x.n += n; cnt.set(ch, x); }
  const c3 = ks.length >= 2 ? table(['Saída', 'Base', 'Dias com bloqueio', 'Bloqueios (7 dias)'], [...cnt].filter(([, x]) => x.d >= 2).sort((a, b) => b[1].d - a[1].d || b[1].n - a[1].n).slice(0, 10).map(([k, x]) => [`<b>${esc(A.chuteLabel(k))}</b>`, esc(baseOf(k) || '—'), `${x.d}/${ks.length}`, fmt(x.n)]), { right: [2, 3], empty: 'Nenhuma saída com bloqueio recorrente.', cls: 'tnt' }) : note('Precisa de pelo menos 2 dias de histórico de saídas (o painel guarda uma foto por dia a partir de hoje).');

  // C4 sem plano 995/996
  const sp = rej.filter((r) => /99[56]/.test(r.ex)), spR = new Map(); for (const r of sp) { const k = (r.sc || '(sem código)') + ' · ' + A.routeKey(r, lvl); spR.set(k, (spR.get(k) || 0) + 1); }
  const c4 = table(['Segmento · rota', 'Peças', 'Motivo'], [...spR].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => [esc(k), fmt(n), '995/996 (sem sortcode / sem plano)']), { right: [1], empty: 'Nenhuma peça sem plano hoje. ✅', cls: 'tnt' });

  // C5 indução fora do esperado
  const indT = new Map(), indR = new Map(); for (const r of fall) { indT.set(r.ind, (indT.get(r.ind) || 0) + 1); if (r.ex) indR.set(r.ind, (indR.get(r.ind) || 0) + 1); }
  const c5 = table(['Indução', 'Peças', 'Rejeitos', 'Taxa', 'vs média'], [...indT].filter(([, n]) => n >= 100).map(([i, n]) => ({ i, n, r: indR.get(i) || 0 })).map((o) => ({ ...o, t: pc(o.r, o.n) })).filter((o) => o.t > Math.max(th, (pc(rej.length, fall.length) * 1.5))).sort((a, b) => b.t - a.t).slice(0, 8).map((o) => ['Indução ' + p2(o.i), fmt(o.n), fmt(o.r), `<span class="rate bad">${dec(o.t, 2)}%</span>`, dec(o.t / Math.max(0.01, pc(rej.length, fall.length)), 1) + '×']), { right: [1, 2, 3, 4], empty: 'Nenhuma indução rejeitando acima do esperado. ✅', cls: 'tnt' });

  // C6 tendência por rota (1ª metade × 2ª metade do dia útil)
  const mid = (d0 + now) / 2, rr = (f) => { const m = new Map(); for (const r of rej) if (f(r)) { const k = A.routeKey(r, lvl); m.set(k, (m.get(k) || 0) + 1); } return m; };
  const A1 = rr((r) => r.t < mid), A2 = rr((r) => r.t >= mid);
  const c6 = table(['Rota', '1ª metade do dia', '2ª metade', 'Tendência'], [...new Set([...A1.keys(), ...A2.keys()])].map((k) => ({ k, a: A1.get(k) || 0, b: A2.get(k) || 0 })).filter((o) => o.a + o.b >= 20).sort((x, y) => y.b - y.a - (x.b - x.a)).slice(0, 8).map((o) => [esc(o.k), fmt(o.a), fmt(o.b), o.b > o.a * 1.3 ? tag('subindo', 'bad') : o.b < o.a * 0.7 ? tag('caindo', 'ok') : tag('estável', '')]), { right: [1, 2], empty: 'Sem rotas com volume suficiente.', cls: 'tnt' });

  // C7 reincidentes
  const wb = new Map(); for (const r of rej) if (r.wb) wb.set(r.wb, (wb.get(r.wb) || 0) + 1);
  const rein = [...wb].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const c7 = table(['Waybill', 'Vezes rejeitada'], rein.map(([w, n]) => [esc(w), fmt(n)]), { right: [1], empty: 'Nenhuma peça rejeitada mais de uma vez. ✅', cls: 'tnt' }) + note(`${fmt([...wb].filter(([, n]) => n >= 2).length)} waybills voltaram a ser rejeitadas (retrabalho que não resolve).`);

  // C8 retrabalho por turno
  const seg = +cfg.retrabSeg || 60, tc = turnoCfg(cfg);
  const c8 = table(['Turno', 'Rejeitos', 'Tempo estimado de tratamento', 'Pessoas-hora'], janelas(now, cfg).filter((j) => j.st !== 'futuro' && j.ini >= d0 - HOUR * 3).map((j) => { const n = rej.filter((r) => r.t >= j.ini && r.t < j.fim).length; return [j.id === 'T3o' ? 'T3 (virou o dia)' : j.nome, fmt(n), dec((n * seg) / 60, 0) + ' min', dec((n * seg) / 3600, 1) + ' h']; }), { right: [1, 2, 3], cls: 'tnt' }) + note(`Estimativa: ${seg} s de tratamento manual por rejeito (ajustável em Configurações).`);

  // C9 saturação / C11 estoque nas saídas de exceção
  const exc = new Map(); for (const r of fall) { const d = String(parseInt(r.dc, 10)); if (A.isExcChute(r.dc)) exc.set(d, (exc.get(d) || 0) + 1); }
  const c9 = table(['Saída de exceção', 'Peças recebidas hoje', 'Última hora'], [...exc].map(([k, n]) => [k, fmt(n), fmt(fall.filter((r) => String(parseInt(r.dc, 10)) === k && r.t >= now - HOUR).length)]), { right: [1, 2], empty: 'Sem peças nas saídas de exceção.', cls: 'tnt' }) + note('Estoque acumulado nas saídas 208/888 que ainda não foi tratado: o painel não enxerga o conteúdo físico; use o número recebido como referência.');

  // C10 esperado × anormal  /  C12 qualidade
  const dupl = A.dupStats(all), semS = all.filter((r) => !r.ex && !r.dc && now - r.t > 20 * MIN).length, sem0 = all.filter((r) => !r.ind).length;
  const c12 = kvs([['Waybills lidas 2× ou mais', fmt(dupl.waybills), dupl.waybills ? 'warn' : 'ok', fmt(dupl.extra) + ' leituras a mais'], ['Sem descarga > 20 min', fmt(semS), semS ? 'warn' : 'ok'], ['Sem indução registrada', fmt(sem0), sem0 ? 'warn' : 'ok']]);

  const tabs = [['causa', 'Causa raiz'], ['padroes', 'Padrões'], ['qual', 'Qualidade e retrabalho']].map(([k, n]) => `<button class="btn ${RX.tab === k ? 'on' : ''}" data-rx="tab" data-k="${k}">${n}</button>`).join('');
  let body = '';
  if (RX.tab === 'causa') body = grid2(card('Causa raiz do Chute block', 'por saída', 'Cruza cada saída que mais bloqueia com o estado dela (cheia/fechada), falhas de abertura de lote e o plano ativo, e aponta a causa mais provável.', c1) + card('Linha do tempo da saída', 'últimas 6 h', 'Quando a saída bloqueou e o que aconteceu perto desses momentos.', tl)) + card('Recorrência entre dias', 'saídas que bloqueiam em vários dias', 'Saída que bloqueia todo dia costuma ser problema de capacidade ou de plano, não de acaso.', c3);
  else if (RX.tab === 'padroes') body = grid2(card('Rotas sem plano (995/996)', '', 'Peças cuja rota não tem saída no plano ativo.', c4) + card('Induções fora do esperado', '', 'Induções com taxa bem acima da média do sorter.', c5)) + card('Tendência por rota', 'início × fim do dia', 'Rotas cujo rejeito está crescendo ao longo do dia.', c6);
  else body = grid2(card('Peças reincidentes', '', '', c7) + card('Retrabalho por turno', '', 'Quanto tempo de tratamento manual os rejeitos consomem.', c8)) + grid2(card('Saídas de exceção', 'saturação', '', c9) + card('Qualidade do dado', '', 'Itens que distorcem os números ou indicam leitura problemática.', c12));
  el.innerHTML = card('Análise avançada de rejeitos', 'causa, padrão e qualidade', 'Complementa a tela acima: em vez de só contar, procura explicar por que a peça foi rejeitada e se o problema vai se repetir.', kp + `<div class="subtabs">${tabs}</div>`) + body;
  el.onclick = (e) => { const b = e.target.closest('[data-rx="tab"]'); if (b) { RX.tab = b.dataset.k; c.redraw(); } };
  el.onchange = (e) => { if (e.target.matches('[data-rx="sel"]')) { RX.sel = e.target.value; c.redraw(); } };
}
