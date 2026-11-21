// Metas e desempenho: meta por hora/turno/dia, projeção, ritmo necessário, ocupação, linhas A/B, custo das paradas, induções subutilizadas,
// tempo em trânsito e peso. Todos os valores de meta vêm da configuração do próprio app (botão "Editar metas").
import { summary } from './api.js';
import { rowsToTurno, metricas, janelas } from './turnos.js';
import { HS, getToday, loadHist } from './history.js';
import * as A from './analysis.js';
import { p2, fmt, dec, pc, esc, MIN, HOUR, hm, dur, card, grid2, kvs, table, tag, hbars, btn, note } from './kit.js';

export const MS = { turnos: [], at: 0, busy: false, today: null, state: {} };

async function load(now, cfg, redraw) {
  if (MS.busy || now - MS.at < 60000) return;
  MS.busy = true;
  try {
    await loadHist();
    const t = await getToday(now);
    const J = janelas(now, cfg).filter((j) => j.st !== 'futuro');
    const res = await Promise.all(J.map(async (j) => {
      try { const r = await summary({ start: j.ini, end: Math.min(j.fim, now) - 1000, group: 60, create: false }); return { j, m: metricas(j, rowsToTurno(r.data), now, cfg) }; } catch { return null; }
    }));
    MS.turnos = res.filter(Boolean); MS.today = t; MS.at = now;
  } catch { /* tenta no próximo ciclo */ }
  MS.busy = false;
  if (redraw) redraw();
}

const metaTurno = (j, cfg) => {
  const k = 'meta' + j.id.replace('T3o', 'T3');
  return +cfg[k] || (+cfg.feishuMeta ? +cfg.feishuMeta * ((j.fim - j.ini) / HOUR) : 0);
};
const bar = (v, c = '') => `<span class="mbar ${c}"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></span>`;
const cls = (p) => (p >= 100 ? 'ok' : p >= 85 ? 'warn' : 'bad');

export function renderMetas(el, c) {
  const { now, cfg, rows, an, redraw, openCfg } = c;
  load(now, cfg, redraw);
  const mh = +cfg.feishuMeta || 0, md = +cfg.metaDia || 0;
  const T = MS.turnos, td = MS.today;
  const semMeta = !mh && !md && !T.some((x) => metaTurno(x.j, cfg));
  const head = `<div class="kbar">${btn('Editar metas', 'data-meta="cfg"')}<span class="muted">${semMeta ? 'Nenhuma meta definida — clique em “Editar metas” para informar meta por hora, por turno e do dia.' : 'Metas e limites configurados no próprio app.'}</span></div>`;

  // --- visão do dia
  const tot = td ? td.tot : T.reduce((a, x) => a + x.m.tot, 0), h = new Date(now).getHours() + new Date(now).getMinutes() / 60;
  const horasAt = td ? td.h.filter((x) => x[0] > 0).length : 0;
  const ritmoMed = horasAt ? tot / Math.max(1, horasAt - 1 + (new Date(now).getMinutes() / 60 || 1)) : 0;
  const proj = td ? tot + ritmoMed * Math.max(0, 24 - h) : 0;
  const falta = md ? Math.max(0, md - tot) : 0, restH = Math.max(0.1, 24 - h);
  const ult = rows.filter((r) => r.dc && r.t >= now - 60 * MIN).length;
  const cap = +cfg.capHora || 0, occ = cap ? pc(ult, cap) : null;
  const kp = [['Processado hoje', fmt(tot)], ['Meta do dia', md ? fmt(md) : '—'], ['% da meta', md ? dec(pc(tot, md), 1) + '%' : '—', md ? cls(pc(tot, md)) : ''],
    ['Projeção do dia', td ? '~' + fmt(proj) : '—', md ? cls(pc(proj, md)) : '', md ? dec(pc(proj, md), 0) + '% da meta' : 'ritmo médio × horas restantes'],
    ['Ritmo necessário', md ? fmt(falta / restH) + '/h' : '—', '', md ? 'para bater a meta do dia' : ''], ['Ritmo agora (60 min)', fmt(ult) + '/h'],
    ['Ocupação da capacidade', occ != null ? dec(occ, 0) + '%' : '—', occ != null ? (occ < 60 ? 'warn' : 'ok') : '', cap ? 'de ' + fmt(cap) + '/h' : 'informe a capacidade nominal']];
  const kpi = kvs(kp);

  // --- por turno
  const tt = table(['Turno', 'Estado', 'Meta', 'Realizado', '% da meta', '', 'Projeção', 'Ritmo/h', 'Aproveit.', 'Rejeito'], T.map(({ j, m }) => {
    const meta = metaTurno(j, cfg), el = (Math.min(j.fim, now) - j.ini) / HOUR, horas = (j.fim - j.ini) / HOUR, pr = j.st === 'andamento' && el > 0.25 ? (m.tot / el) * horas : m.tot, p = meta ? pc(m.tot, meta) : null;
    return [`<b>${j.id === 'T3o' ? 'T3 (virou o dia)' : j.id === 'T3' ? 'T3 (hoje)' : j.nome}</b> <span class="muted">${hm(j.ini)}–${hm(j.fim)}</span>`, j.st === 'andamento' ? tag('em andamento', 'info') : tag('fechado', ''), meta ? fmt(meta) : '—', fmt(m.tot), p != null ? `<b class="${cls(p)}">${dec(p, 1)}%</b>` : '—', p != null ? bar(p, cls(p)) : '',
      j.st === 'andamento' && meta ? `<span class="${cls(pc(pr, meta))}">~${fmt(pr)}</span>` : '—', fmt(m.pph), dec(m.apPct, 2) + '%', `<span class="rate ${m.taxa > (+cfg.metaRejT || +cfg.rejectThreshold || 3) ? 'bad' : 'ok'}">${dec(m.taxa, 2)}%</span>`];
  }), { right: [2, 3, 4, 6, 7, 8, 9], empty: 'Carregando os turnos…', cls: 'tnt' });

  // --- hora a hora
  const hh = td ? td.h.map((x, i) => ({ i, tot: x[0], abn: x[1] })).filter((x) => x.tot > 0 || x.i <= new Date(now).getHours()) : [];
  const ativas = hh.filter((x) => x.tot > 0), medTop = ativas.length ? [...ativas.map((x) => x.tot)].sort((a, b) => a - b)[Math.floor(ativas.length / 2)] : 0;
  const hr = table(['Hora', 'Peças', mh ? 'Meta' : '', mh ? '% da meta' : '', '', 'Aproveit.'], hh.filter((x) => x.tot > 0).map((x) => { const p = mh ? pc(x.tot, mh) : null; return [p2(x.i) + ':00', fmt(x.tot), mh ? fmt(mh) : '', p != null ? `<b class="${cls(p)}">${dec(p, 0)}%</b>` : '', p != null ? bar(p, cls(p)) : '', dec(pc(x.tot - x.abn, x.tot), 2) + '%']; }).slice(-12), { right: [1, 2, 3, 5], empty: 'Sem horas fechadas ainda.', cls: 'tnt' });

  // --- Linha A x B
  const l1 = td ? td.l1 : 0, l2 = td ? td.l2 : 0, lt = l1 + l2, d = lt ? (Math.abs(l1 - l2) / lt) * 100 : 0, lim = +cfg.desbL || 20;
  const lin = lt ? hbars([{ k: 'Linha A', v: l1, c: '#2563eb' }, { k: 'Linha B', v: l2, c: '#f59e0b' }]) + note(`Diferença de ${dec(d, 1)} pontos (limite ${lim}). ${d > lim ? 'Acima do limite: uma linha está bem mais carregada que a outra.' : 'Dentro do limite.'}`) : note('Sem dados de linha no resumo.');

  // --- paradas e perdas
  const fd = rows.filter((r) => r.dc), gp = A.gaps(fd, 5 * MIN).filter((g) => g.e <= now), minPar = gp.reduce((a, g) => a + g.min, 0);
  const primeira = fd.length ? Math.min(...fd.map((r) => r.t)) : now, opMin = Math.max(1, (now - primeira) / MIN), ppm = fd.length / Math.max(1, opMin - minPar);
  const perdidas = ppm * minPar, perdBaixa = ativas.reduce((a, x) => a + (x.tot < medTop * 0.5 && x.i !== new Date(now).getHours() ? medTop - x.tot : 0), 0);
  const pr = grid2(kvs([['Paradas ≥ 5 min', fmt(gp.length), gp.length ? 'warn' : 'ok'], ['Tempo parado', dur(minPar * 60), minPar ? 'warn' : 'ok'], ['Peças não processadas (estim.)', '~' + fmt(perdidas), perdidas ? 'bad' : 'ok', 'tempo parado × ritmo médio'], ['Horas muito abaixo da mediana', fmt(ativas.filter((x) => x.tot < medTop * 0.5).length), '', '~' + fmt(perdBaixa) + ' peças a menos']]) +
    table(['Início', 'Fim', 'Duração'], gp.slice(-6).reverse().map((g) => [hm(g.s), hm(g.e), g.min + ' min']), { right: [2], empty: 'Nenhuma parada longa hoje. ✅', cls: 'tnt' }));

  // --- induções subutilizadas
  const byI = new Map(); for (const r of fd) byI.set(r.ind, (byI.get(r.ind) || 0) + 1);
  const act = an ? an.inds.filter((x) => (byI.get(x.no) || 0) > 0 || x.status === 'ativa') : [];
  const med = act.length ? act.reduce((s, x) => s + (byI.get(x.no) || 0), 0) / act.length : 0;
  const sub = act.map((x) => ({ x, n: byI.get(x.no) || 0 })).filter((o) => o.n < med * 0.6).sort((a, b) => a.n - b.n).slice(0, 8);
  const ut = an ? pc(an.statusCount.ativa, an.inds.length) : 0;
  const ind = kvs([['Induções ativas', an ? `${an.statusCount.ativa}/${an.inds.length}` : '—', ut < 50 ? 'warn' : 'ok', dec(ut, 0) + '% do parque'], ['Peças/h por indução ativa', an && an.statusCount.ativa ? fmt(ult / an.statusCount.ativa) : '—'], ['Média de peças por indução (hoje)', fmt(med)]]) +
    table(['Indução', 'Peças hoje', '% da média', 'Estado'], sub.map(({ x, n }) => ['Indução ' + p2(x.no), fmt(n), dec(pc(n, med), 0) + '%', x.status]), { right: [1, 2], empty: 'Nenhuma indução bem abaixo da média. ✅', cls: 'tnt' });

  // --- trânsito e peso
  const tm = fd.map((r) => r.tm).filter((v) => v > 0).sort((a, b) => a - b), q = (p) => (tm.length ? tm[Math.min(tm.length - 1, Math.floor(tm.length * p))] : 0);
  const wt = fd.reduce((s, r) => s + (r.w || 0), 0), wn = fd.filter((r) => r.w > 0).length, pesoH = fd.filter((r) => r.t >= now - 60 * MIN).reduce((s, r) => s + (r.w || 0), 0);
  const lento = tm.length ? tm.filter((v) => v > q(0.5) * 3).length : 0;
  const tr = kvs([['Trânsito mediano', tm.length ? dec(q(0.5) / 1000, 1) + ' s' : '—'], ['Trânsito p90', tm.length ? dec(q(0.9) / 1000, 1) + ' s' : '—'], ['Peças com trânsito > 3× a mediana', fmt(lento), lento > tm.length * 0.02 ? 'warn' : ''], ['Peso total lido', wn ? dec(wt / 1000, 1) + ' t' : '—', '', wn ? dec(wt, 0) + ' kg em ' + fmt(wn) + ' peças com peso' : 'sem peso na trace'], ['Peso na última hora', wn ? fmt(pesoH) + ' kg' : '—', +cfg.pesoMeta ? cls(pc(pesoH, cfg.pesoMeta)) : '', +cfg.pesoMeta ? dec(pc(pesoH, cfg.pesoMeta), 0) + '% da meta' : '']]);

  el.innerHTML = card('Metas e desempenho', 'tudo configurável no app', 'Compara o que foi processado com as metas que você definiu: por hora, por turno e do dia; projeta o fechamento e mostra o ritmo necessário para bater a meta.', head + kpi,
    semMeta ? '' : (md && proj < md * 0.9 ? 'No ritmo atual o dia fecha abaixo da meta; veja o ritmo necessário acima.' : 'Ritmo compatível com as metas definidas.')) +
    card('Metas por turno', 'realizado, projeção e qualidade', 'Cada turno é comparado com a própria meta (ou meta por hora × duração). A projeção só aparece para o turno em andamento.', tt) +
    grid2(card('Hora a hora', 'últimas 12 horas com operação', '', hr) + card('Linha A × Linha B', 'balanceamento do dia', 'Quando uma linha trabalha muito mais que a outra, há capacidade parada.', lin)) +
    grid2(card('Paradas e perdas', 'sem peças por 5 min ou mais', 'Estimativa do que deixou de ser processado enquanto o sorter ficou parado.', pr) + card('Induções subutilizadas', 'abaixo de 60% da média', '', ind)) +
    card('Tempo em trânsito e peso', 'leitura da trace do dia', 'Trânsito = tempo da peça dentro do sorter até a descarga. Muitas peças acima de 3× a mediana indicam recirculação.', tr);
  el.onclick = (e) => { const b = e.target.closest('[data-meta]'); if (b && openCfg) openCfg('metas'); };
}
