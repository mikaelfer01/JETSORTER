// Leitura automática do período: transforma os dados em frases diretas, ordenadas por gravidade.
import * as A from './analysis.js';

const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
const pc = (a, b, d = 1) => (b ? ((a / b) * 100).toFixed(d).replace('.', ',') + '%' : '—');
const p2 = (n) => String(n).padStart(2, '0');
const hm = (t) => { const d = new Date(t); return p2(d.getHours()) + ':' + p2(d.getMinutes()); };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ORDER = { bad: 0, warn: 1, info: 2, ok: 3 };

// fallen: peças descarregadas no período; all: todas as peças alimentadas no período (inclui sem descarga)
export function buildInsights({ fallen, all, now, cfg, ns }) {
  const f = {}, level = cfg.routeLevel, th = cfg.rejectThreshold;
  const out = [];
  const k = A.kpis(fallen, f, level);
  if (!k.total) return [{ lv: 'info', t: 'Sem peças descarregadas no período selecionado.' }];
  const overall = (k.rej / k.total) * 100;
  const blocks = fallen.reduce((a, r) => a + (A.isBlock(r) ? 1 : 0), 0);

  // 1) visão geral
  let t = `<b>${pc(k.rej, k.total, 2)}</b> de rejeito no período (${fmt(k.rej)} de ${fmt(k.total)} peças).`;
  if (A.getRejectMode() === 'all' && k.rej) t += ` Chute block responde por <b>${pc(blocks, k.rej, 0)}</b> dos rejeitos.`;
  out.push({ lv: overall >= th * 2 ? 'bad' : overall >= th ? 'warn' : 'ok', t });

  // 2) concentração por saída
  const cg = A.groupBy(fallen, f, level, A.chuteKey, null, true);
  const cl = A.ranking(cg, 'count');
  const cb = cl.reduce((a, x) => a + x.rej, 0); // rejeitos atribuíveis a saída (Chute block)
  if (cl.length && cb >= 10) {
    const top = cl[0], share = top.rej / cb;
    const top5 = cl.slice(0, 5).reduce((a, x) => a + x.rej, 0);
    if (share >= 0.15) {
      out.push({ lv: 'warn', t: `Saída <b>${esc(A.chuteLabel(top.key))}</b> concentra <b>${pc(top.rej, cb, 0)}</b> dos bloqueios por saída cheia (${fmt(top.rej)} Chute block) e bloqueou <b>${pc(top.rej, top.total)}</b> das peças destinadas a ela. As 5 maiores saídas somam ${pc(top5, cb, 0)}.` });
    } else {
      out.push({ lv: 'info', t: `Bloqueios pulverizados: a maior saída (<b>${esc(A.chuteLabel(top.key))}</b>) tem só ${pc(top.rej, cb, 0)} dos Chute block; 5 maiores somam ${pc(top5, cb, 0)}.` });
    }
  }

  // 3) pior hora
  const hrs = A.hourly(fallen, f, level).filter((h) => h.total >= 200);
  if (hrs.length > 1 && k.rej >= 10) {
    const w = hrs.reduce((a, h) => (h.rej / h.total > a.rej / a.total ? h : a));
    if (w.rej >= 10 && (w.rej / w.total) * 100 >= overall * 1.5) {
      out.push({ lv: 'warn', t: `Pior hora: <b>${p2(new Date(w.t).getHours())}h</b> com <b>${pc(w.rej, w.total)}</b> de rejeito (${fmt(w.rej)}), ${pc(w.rej, k.rej, 0)} de todos os rejeitos do período.` });
    }
  }

  // 4) bloqueio simultâneo (várias saídas ao mesmo tempo)
  const eps = A.episodes(fallen, f, level).filter((e) => e.n >= 5);
  let best = null;
  for (const e of eps) {
    const grp = eps.filter((o) => o.s <= e.e && o.e >= e.s);
    const chutes = new Set(grp.map((o) => o.key));
    if (chutes.size >= 3 && (!best || chutes.size > best.chutes.size)) best = { grp, chutes };
  }
  if (best) {
    const s = Math.min(...best.grp.map((o) => o.s)), e = Math.max(...best.grp.map((o) => o.e));
    const lst = [...best.chutes].slice(0, 6).map((c) => esc(A.chuteLabel(c))).join(', ');
    const n = best.grp.reduce((a, o) => a + o.n, 0);
    out.push({ lv: 'bad', t: `Bloqueio simultâneo: <b>${best.chutes.size} saídas</b> (${lst}) entre <b>${hm(s)}–${hm(e)}</b>, ${fmt(n)} rejeitos. Várias saídas ao mesmo tempo apontam para causa comum (ex.: limpeza/ensacamento parado ou falta de operador).` });
  }

  // 5) bloqueando agora
  if (ns && ns.activeChutes.length) {
    out.push({ lv: 'bad', t: `Bloqueando agora (últimos ${cfg.nowMin} min): ${ns.activeChutes.slice(0, 5).map(([c, n]) => `saída <b>${esc(A.chuteLabel(c))}</b> (${n})`).join(', ')}.` });
  }

  // 6) indução fora da curva
  const il = A.byInduction(fallen, f, level).filter((x) => x.total >= 500 && x.rej > 0);
  if (il.length) {
    const w = il.reduce((a, x) => (x.rej / x.total > a.rej / a.total ? x : a));
    const r = (w.rej / w.total) * 100;
    if (overall > 0 && r >= overall * 2 && w.rej >= 10) {
      out.push({ lv: 'warn', t: `Indução <b>${w.key}</b> rejeita <b>${pc(w.rej, w.total)}</b> das peças (${(r / overall).toFixed(1).replace('.', ',')}× a média).` });
    }
  }

  // 7) peças sem descarga
  const st = A.stuckStats(all, now, f, level, 20);
  if (st.n >= 20) {
    const ti = [...st.byInd].sort((a, b) => b[1] - a[1])[0];
    out.push({ lv: st.n / st.fed >= 0.01 ? 'warn' : 'info', t: `<b>${fmt(st.n)}</b> peças alimentadas há mais de 20 min sem registro de descarga (${pc(st.n, st.fed)} do alimentado); não entram na contagem oficial. Mais na indução <b>${ti[0]}</b> (${fmt(ti[1])}).` });
  }

  // 8) rotas com 2+ saídas nunca bloqueiam
  if (blocks >= 10) {
    const multi = fallen.filter(A.isMulti);
    const bm = multi.filter(A.isBlock).length;
    if (multi.length >= 200 && bm === 0) {
      const single = [...cg.values()].filter((g) => g.rej > 0 && !String(g.key).includes(',')).sort((a, b) => b.rej - a.rej).slice(0, 3).map((g) => esc(g.key)).join(', ');
      out.push({ lv: 'info', t: `Rotas com 2+ saídas (${pc(multi.length, k.total)} das peças) tiveram <b>0 bloqueios</b>; todos os ${fmt(blocks)} Chute block ocorreram em rotas de saída única. Candidatas a saída reserva: <b>${single}</b>.` });
    }
  }

  // 8b) waybills alimentadas mais de uma vez
  const dp = A.dupStats(all);
  if (dp.extra >= 20) out.push({ lv: 'info', t: `<b>${fmt(dp.waybills)}</b> waybills entraram mais de uma vez (releitura/reentrada): ${fmt(dp.extra)} alimentações a mais, ${pc(dp.extra, all.length)} do processado.` });

  // 9) paradas / sem fluxo
  const gp = A.gaps(fallen, 5 * 60000);
  const longs = gp.filter((g) => g.min >= 15);
  if (longs.length) out.push({ lv: 'info', t: `Paradas (sem peças ≥ 15 min): ${longs.slice(0, 5).map((g) => `<b>${hm(g.s)}–${hm(g.e)}</b> (${g.min} min)`).join(', ')}${longs.length > 5 ? ` e mais ${longs.length - 5}` : ''}.` });
  const last = fallen.reduce((a, r) => Math.max(a, r.t), 0);
  if (last && now - last > 5 * 60000) out.push({ lv: 'bad', t: `Sem fluxo há <b>${Math.round((now - last) / 60000)} min</b> (última peça às ${hm(last)}).` });

  return out.sort((a, b) => ORDER[a.lv] - ORDER[b.lv]).slice(0, 8);
}
