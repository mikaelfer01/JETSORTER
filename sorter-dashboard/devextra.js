// Equipamentos — análises extras: ranking de carrinhos (falhas e rejeito por carrinho), trecho comum, cortina/sensor com registro de limpeza,
// disponibilidade (MTBF/MTTR), Pareto de paradas, pacote fora de medida, auditoria de comandos manuais, ficha do equipamento, OEE e falhas repetitivas.
import * as A from './analysis.js';
import { KINDS } from './devices.js';
import { SYS, cmdList } from './system.js';
import { p2, fmt, dec, pc, esc, MIN, HOUR, hm, dm, dkey, dur, ago, card, grid2, kvs, table, tag, hbars, btn, note } from './kit.js';

const DX = { tab: 'car', ficha: '', clean: null };
const CKEY = 'cleanLog';
async function loadClean() {
  if (DX.clean) return;
  try { DX.clean = (await chrome.storage.local.get(CKEY))[CKEY] || {}; } catch { DX.clean = {}; }
}
const secs = (e, now) => Math.max(0, ((e.end ?? now) - e.start) / 1000);
const nn = (n) => p2(n);

export function renderDevExtra(el, c) {
  loadClean().then(() => { if (!DX.cleanDrawn) { DX.cleanDrawn = 1; c.redraw(); } });
  const { an, now, rows, cfg } = c, d0 = c.d0, fall = rows.filter((r) => r.dc), clean = DX.clean || {};
  const ev = an.ev;

  // E1 carrinhos: falhas (devicelogs) + rejeito por carrinho (trayno da trace)
  const tray = new Map(); for (const r of fall) if (r.tr) { const x = tray.get(r.tr) || { n: 0, r: 0 }; x.n++; if (r.ex) x.r++; tray.set(r.tr, x); }
  const tm = [...tray].map(([k, x]) => ({ k, ...x, t: pc(x.r, x.n) })), tn = tm.length ? tm.reduce((a, x) => a + x.n, 0) : 0, tr = tm.reduce((a, x) => a + x.r, 0), avg = pc(tr, tn);
  const badTray = tm.filter((x) => x.n >= 30 && x.t > Math.max(avg * 2, (+cfg.rejectThreshold || 3))).sort((a, b) => b.t - a.t).slice(0, 10);
  const e1 = table(['Carrinho', 'Peças', 'Rejeitos', 'Taxa', 'vs média'], badTray.map((x) => ['<b>' + x.k + '</b>', fmt(x.n), fmt(x.r), `<span class="rate bad">${dec(x.t, 2)}%</span>`, dec(x.t / Math.max(0.01, avg), 1) + '×']), { right: [1, 2, 3, 4], empty: tm.length ? 'Nenhum carrinho rejeitando muito acima da média. ✅' : 'A trace não traz o número do carrinho.', cls: 'tnt' }) + note('Carrinho que rejeita muito acima da média costuma ter bandeja/basculamento com problema, mesmo sem alarme registrado.');
  const e1b = table(['Carrinho', 'Camada', 'Falhas', 'Tempo em falha', 'Maior', 'Última'], an.carriers.slice(0, 10).map((x) => [x.no, 'L' + (x.layer || '?'), fmt(x.n), dur(x.secs), dur(x.maxS), ago(x.last, now) + ' atrás']), { right: [2], empty: 'Nenhuma falha de carrinho hoje. ✅', cls: 'tnt' });

  // E2 trecho comum: falhas por camada e por faixa de 10 carrinhos
  const faixa = new Map(); for (const x of an.carriers) { const k = `L${x.layer || '?'} · ${Math.floor(x.no / 10) * 10}–${Math.floor(x.no / 10) * 10 + 9}`; faixa.set(k, (faixa.get(k) || 0) + x.n); }
  const e2 = table(['Camada · faixa de carrinhos', 'Falhas'], [...faixa].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => [k, fmt(n)]), { right: [1], empty: 'Sem falhas de carrinho para agrupar.', cls: 'tnt' }) + note('Várias falhas na mesma faixa sugerem problema de trecho (trilho, carregador), não de um carrinho só.');

  // E3 cortina/sensor + limpeza
  const sens = an.inds.map((x) => ({ x, n: (x.counts.cortina || 0) + (x.counts.sensor || 0), s: (x.secs.cortina || 0) + (x.secs.sensor || 0) })).filter((o) => o.n > 0).sort((a, b) => b.n - a.n).slice(0, 10);
  const e3 = table(['Indução', 'Falhas hoje', 'Tempo', 'Última limpeza', 'Falhas desde a limpeza', ''], sens.map(({ x, n, s }) => {
    const lc = clean[x.no], since = lc ? ev.filter((e) => e.grp === 'ind' && e.no === x.no && (e.kind === 'cortina' || e.kind === 'sensor') && e.start >= lc).length : null;
    return ['Indução ' + nn(x.no), fmt(n), dur(s), lc ? dm(lc) + ' ' + hm(lc) : '—', since != null ? fmt(since) : '—', btn('Registrei limpeza', `data-dx="clean" data-k="${x.no}"`)];
  }), { right: [1], empty: 'Nenhuma falha de cortina/sensor hoje. ✅', cls: 'tnt' }) + note('O registro de limpeza fica só neste computador e serve para comparar as falhas antes e depois.');

  // E4 disponibilidade / MTBF / MTTR
  const e4 = table(['Indução', 'Disponib.', 'Paradas', 'MTBF', 'MTTR', 'Parada total'], an.inds.filter((x) => x.first).map((x) => { const n = (x.counts.stop || 0) + (x.counts.falha || 0), op = Math.max(60, (now - x.first) / 1000), dn = (x.secs.stop || 0) + (x.secs.falha || 0); return { x, n, op, dn }; }).sort((a, b) => a.x.avail - b.x.avail).slice(0, 12).map(({ x, n, op, dn }) => ['Indução ' + nn(x.no), x.avail != null ? `<b class="${x.avail < 0.9 ? 'bad' : ''}">${dec(x.avail * 100, 1)}%</b>` : '—', fmt(n), n ? dur(op / n) : '—', n ? dur(dn / n) : '—', dur(x.stopS)]), { right: [1, 2, 3, 4, 5], empty: 'Sem induções com atividade hoje.', cls: 'tnt' }) + note('MTBF = tempo médio entre paradas; MTTR = tempo médio de cada parada.');

  // E5 Pareto de paradas
  const par = new Map(); for (const e of ev) if (e.grp === 'ind' && e.kind !== 'auto' && e.kind !== 'sorter_auto') par.set(e.kind, (par.get(e.kind) || 0) + secs(e, now));
  const parT = [...par].sort((a, b) => b[1] - a[1]), parS = parT.reduce((a, [, v]) => a + v, 0); let ac = 0;
  const e5 = table(['Motivo', 'Tempo', '% do total', '% acumulado'], parT.slice(0, 8).map(([k, v]) => { ac += v; return [esc((KINDS[k] || { label: k }).label), dur(v), dec(pc(v, parS), 1) + '%', dec(pc(ac, parS), 1) + '%']; }), { right: [1, 2, 3], empty: 'Sem paradas de indução hoje.', cls: 'tnt' });

  // E6 pacote fora de medida
  const med = an.inds.map((x) => ({ x, l: x.counts.larg || 0, p: x.counts.comp || 0 })).filter((o) => o.l + o.p > 0).sort((a, b) => b.l + b.p - a.l - a.p).slice(0, 8);
  const e6 = table(['Indução', 'Acima da largura', 'Acima do comprimento'], med.map(({ x, l, p }) => ['Indução ' + nn(x.no), fmt(l), fmt(p)]), { right: [1, 2], empty: 'Nenhum pacote fora de medida hoje. ✅', cls: 'tnt' });

  // E7/E8 comandos manuais
  const cm = cmdList(d0).filter((x) => /command/i.test(x.ev || '')), who = new Map(); for (const x of cm) who.set(x.who || '—', (who.get(x.who || '—') || 0) + 1);
  const e7 = (cm.length ? kvs([['Comandos hoje', fmt(cm.length)], ['Usuários', fmt(who.size)], ['Saídas desabilitadas', fmt(cm.filter((x) => /disable/i.test(x.memo)).length), 'warn']]) : '') +
    table(['Hora', 'Usuário', 'Tipo', 'Detalhe'], cm.slice(0, 15).map((x) => [hm(x.t), esc(x.who || '—'), esc(x.kind || x.ev), esc(String(x.memo).slice(0, 110))]), { empty: SYS.cmdInit ? 'Nenhum comando manual hoje.' : 'Carregando o registro de comandos…', cls: 'tnt' }) + note('Somente registro do que já foi feito no sistema do sorter. Este painel não envia comandos.');

  // E10 OEE do sorter
  const ult = fall.filter((r) => r.t >= now - HOUR).length, cap = +cfg.capHora || 0, g = A.gaps(fall, 5 * MIN).filter((x) => x.e <= now), par2 = g.reduce((a, x) => a + x.min, 0), prim = fall.length ? Math.min(...fall.map((r) => r.t)) : now, opM = Math.max(1, (now - prim) / MIN);
  const disp = Math.max(0, 1 - par2 / opM), perf = cap ? Math.min(1, ult / cap) : null, qual = fall.length ? 1 - fall.filter((r) => r.ex).length / fall.length : 1, oee = perf != null ? disp * perf * qual : null;
  const e10 = kvs([['Disponibilidade', dec(disp * 100, 1) + '%', disp < 0.9 ? 'warn' : 'ok', fmt(par2) + ' min parado'], ['Desempenho', perf != null ? dec(perf * 100, 1) + '%' : '—', '', cap ? 'vs ' + fmt(cap) + '/h nominal' : 'informe a capacidade em Metas'], ['Qualidade', dec(qual * 100, 2) + '%', qual < 0.97 ? 'warn' : 'ok'], ['OEE', oee != null ? dec(oee * 100, 1) + '%' : '—', oee != null ? (oee < 0.6 ? 'bad' : oee < 0.8 ? 'warn' : 'ok') : '']]) + note('OEE = disponibilidade × desempenho × qualidade. Estimativa a partir do que a trace mostra.');

  // E11 falhas repetitivas
  const rep = new Map(); for (const e of ev) if (e.sev >= 2 && e.kind !== 'auto') { const k = `${e.grp}|${e.no}|${e.layer || ''}|${e.kind}`; const x = rep.get(k) || { e, n: 0, s: 0 }; x.n++; x.s += secs(e, now); rep.set(k, x); }
  const e11 = table(['Equipamento', 'Falha', 'Vezes hoje', 'Tempo total'], [...rep.values()].filter((x) => x.n >= 3).sort((a, b) => b.n - a.n).slice(0, 10).map((x) => [esc(devN(x.e)), esc((KINDS[x.e.kind] || { label: x.e.kind }).label), fmt(x.n), dur(x.s)]), { right: [2, 3], empty: 'Nenhuma falha se repetiu 3 vezes ou mais. ✅', cls: 'tnt' });

  // E9 ficha do equipamento
  const opts = [...an.inds.map((x) => ['ind|' + x.no, 'Indução ' + nn(x.no)]), ...[...new Set(ev.filter((e) => e.grp === 'chute').map((e) => e.no))].sort((a, b) => a - b).map((n) => ['chute|' + n, 'Saída ' + n]), ...an.carriers.map((x) => ['car|' + x.no, 'Carrinho ' + x.no])];
  let ficha = note('Escolha um equipamento para ver tudo o que aconteceu com ele hoje.');
  if (DX.ficha) {
    const [g, n] = DX.ficha.split('|'), L = ev.filter((e) => e.grp === g && String(e.no) === n).sort((a, b) => b.start - a.start), cnt = new Map(); for (const e of L) { const x = cnt.get(e.kind) || { n: 0, s: 0 }; x.n++; x.s += secs(e, now); cnt.set(e.kind, x); }
    const pcs = g === 'ind' ? fall.filter((r) => String(r.ind) === n) : g === 'chute' ? fall.filter((r) => String(parseInt(r.dc, 10)) === n) : g === 'car' ? fall.filter((r) => String(r.tr) === n) : [];
    ficha = kvs([['Peças hoje', fmt(pcs.length)], ['Rejeitos', fmt(pcs.filter((r) => r.ex).length), pcs.some((r) => r.ex) ? 'warn' : 'ok'], ['Eventos', fmt(L.length)]]) +
      table(['Tipo', 'Vezes', 'Tempo'], [...cnt].map(([k, x]) => [esc((KINDS[k] || { label: k }).label), fmt(x.n), dur(x.s)]), { right: [1, 2], empty: 'Sem eventos hoje. ✅', cls: 'tnt' }) +
      table(['Início', 'Fim', 'Evento'], L.slice(0, 10).map((e) => [hm(e.start), e.end ? hm(e.end) : 'em aberto', esc((KINDS[e.kind] || { label: e.kind }).label)]), { cls: 'tnt' });
  }
  const sel = `<div class="kbar"><label>Equipamento <select data-dx="ficha"><option value="">— escolha —</option>${opts.map(([v, t]) => `<option value="${v}" ${DX.ficha === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>`;

  const tabs = [['car', 'Carrinhos'], ['ind', 'Induções'], ['out', 'Comandos e ficha']].map(([k, n]) => `<button class="btn ${DX.tab === k ? 'on' : ''}" data-dx="tab" data-k="${k}">${n}</button>`).join('');
  let body = '';
  if (DX.tab === 'car') body = grid2(card('Carrinhos que mais rejeitam', 'pela trace', 'Mostra os carrinhos cuja taxa de rejeito está bem acima da média.', e1) + card('Carrinhos com falha registrada', '', '', e1b)) + card('Trecho comum das falhas', '', '', e2);
  else if (DX.tab === 'ind') body = grid2(card('Disponibilidade das induções', 'MTBF / MTTR', '', e4) + card('Pareto das paradas', 'por motivo', '', e5)) + grid2(card('Cortina de luz e sensor', 'com registro de limpeza', 'Falhas de cortina/sensor por indução. Registre quando limpar para saber se ajudou.', e3) + card('Pacote fora de medida', '', '', e6)) + card('Falhas repetitivas', '3 vezes ou mais hoje', '', e11);
  else body = grid2(card('Comandos manuais', 'auditoria', 'Quem habilitou/desabilitou saídas ou mexeu em carrinhos hoje, segundo o log do sorter.', e7) + card('Ficha do equipamento', '', '', sel + ficha)) + card('OEE do sorter', 'estimativa', '', e10);
  el.innerHTML = card('Análise avançada de equipamentos', 'carrinhos, induções e comandos', 'Vai além do estado atual: mostra quem falha mais, por quanto tempo, se o problema se repete e como o sorter se sai como um todo.', `<div class="subtabs">${tabs}</div>`) + body;
  el.onclick = async (e) => {
    const b = e.target.closest('[data-dx]'); if (!b) return;
    if (b.dataset.dx === 'tab') { DX.tab = b.dataset.k; c.redraw(); }
    else if (b.dataset.dx === 'clean') { DX.clean = { ...(DX.clean || {}), [b.dataset.k]: Date.now() }; try { await chrome.storage.local.set({ [CKEY]: DX.clean }); } catch { /* local */ } c.redraw(); }
  };
  el.onchange = (e) => { if (e.target.matches('[data-dx="ficha"]')) { DX.ficha = e.target.value; c.redraw(); } };
}
const devN = (e) => (e.grp === 'ind' ? 'Indução ' + nn(e.no) : e.grp === 'chute' ? 'Saída ' + e.no : e.grp === 'car' ? 'Carrinho ' + e.no : 'Sorter');
