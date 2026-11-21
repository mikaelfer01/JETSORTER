// Auditoria do plano de triagem (aba do Sistema): cobertura, consistência, saídas ociosas/sobrecarregadas, balanceamento, capacidade,
// rota × saída, impacto antes/depois de uma ativação, simulador a partir de CSV e exportação. Só lê o plano; nada é enviado ao sorter.
import { getJson } from './api.js';
import * as A from './analysis.js';
import { PH } from './planhist.js';
import { p2, fmt, dec, pc, esc, MIN, HOUR, hm, dm, card, grid2, kvs, table, tag, hbars, btn, note, csvDownload } from './kit.js';

const PA = { rows: null, at: 0, busy: false, err: '', sim: null, simName: '' };
const no = (c) => String(parseInt(c, 10));

async function loadPlanRows(redraw) {
  if (PA.busy || (PA.rows && Date.now() - PA.at < 600000)) return;
  PA.busy = true;
  try {
    const j = await getJson('/query/plan?action=fetchdata', { method: 'POST', form: { page: 1, perPage: 5000, sortingplancode: '', sortingportcode: '', gridname: '', threesegmentcode: '' } });
    PA.rows = (j.data || []).filter((x) => String(x.defaultplan) === '1').map((x) => ({ port: no(x.sortingportcode), base: String(x.gridname || '').trim(), code: String(x.threesegmentcode || '').trim(), plan: x.sortingplancode }));
    PA.at = Date.now(); PA.err = '';
  } catch (e) { PA.err = e.message || String(e); }
  PA.busy = false; redraw && redraw();
}

function parseCsv(txt) {
  const out = [];
  for (const ln of String(txt).split(/\r?\n/)) {
    const p = ln.split(/[;,\t]/).map((s) => s.trim().replace(/^"|"$/g, '')); if (p.length < 2 || !/^\d+$/.test(p[0])) continue;
    out.push({ port: no(p[0]), code: p[1], base: p[2] || '' });
  }
  return out;
}

export async function renderPlanAudit(c) {
  const { all, now, cfg, redraw } = c;
  loadPlanRows(redraw);
  if (!PA.rows) return `<section class="card tnch"><p class="muted nt">${PA.err ? 'Não foi possível ler o plano: ' + esc(PA.err) : 'Lendo o plano de triagem ativo…'}</p></section>`;
  const P = PA.rows, fall = all.filter((r) => r.dc);
  const ports = new Map(), codes = new Map();
  for (const x of P) {
    const p = ports.get(x.port) || { port: x.port, codes: new Set(), bases: new Set() }; p.codes.add(x.code); if (x.base) p.bases.add(x.base); ports.set(x.port, p);
    for (const cd of x.code.split(/\s+/).filter(Boolean)) { const q = codes.get(cd) || new Set(); q.add(x.port); codes.set(cd, q); }
  }
  const per = new Map(), perRej = new Map(); for (const r of fall) { const k = no(r.dc); if (A.isExcChute(r.dc)) continue; per.set(k, (per.get(k) || 0) + 1); if (r.ex) perRej.set(k, (perRej.get(k) || 0) + 1); }
  const hours = Math.max(0.25, (now - (all.length ? Math.min(...all.map((r) => r.t)) : now)) / HOUR);
  const capS = +cfg.capSaidaHora || 0;
  const tot = fall.length, sem = fall.filter((r) => /99[56]/.test(r.ex)).length;

  // D1/D12 cobertura
  const cov = kvs([['Saídas no plano ativo', fmt(ports.size)], ['Segmentos (códigos) no plano', fmt(codes.size)], ['Peças sem plano hoje (995/996)', fmt(sem), sem ? 'bad' : 'ok', dec(pc(sem, tot), 3) + '% das peças'], ['Cobertura do dia', dec(100 - pc(sem, tot), 2) + '%', sem ? 'warn' : 'ok'], ['Plano ativo', esc(P[0].plan || '—')]]);
  const unc = new Map(); for (const r of fall) if (/99[56]/.test(r.ex)) { const k = r.sc || '(sem código)'; unc.set(k, (unc.get(k) || 0) + 1); }
  const dUnc = table(['Segmento sem plano', 'Peças'], [...unc].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => [esc(k), fmt(n)]), { right: [1], empty: 'Todas as peças de hoje encontraram plano. ✅', cls: 'tnt' });

  // D2 consistência
  const multi = [...codes].filter(([, s]) => s.size > 1), semCod = [...ports.values()].filter((p) => ![...p.codes].some(Boolean)), multiBase = [...ports.values()].filter((p) => p.bases.size > 1);
  const cons = kvs([['Segmentos em mais de uma saída', fmt(multi.length), multi.length ? 'warn' : 'ok', 'normal em saída compartilhada'], ['Saídas sem segmento', fmt(semCod.length), semCod.length ? 'bad' : 'ok'], ['Saídas com mais de uma base', fmt(multiBase.length), multiBase.length ? 'warn' : 'ok']]) +
    table(['Saída', 'Bases'], multiBase.slice(0, 8).map((p) => [p.port, esc([...p.bases].join(' / '))]), { empty: '', cls: 'tnt' });

  // D3 ociosas / D4 sobrecarregadas / D9 capacidade
  const real = [...ports.keys()].filter((k) => !A.isExcChute(k));
  const idle = real.filter((k) => !per.get(k)), load = real.map((k) => ({ k, n: per.get(k) || 0 })).sort((a, b) => b.n - a.n);
  const med = load.length ? [...load.map((x) => x.n)].sort((a, b) => a - b)[Math.floor(load.length / 2)] : 0;
  const over = load.filter((x) => x.n > Math.max(med * 3, 50)).slice(0, 10);
  const dBase = (k) => [...(ports.get(k) || { bases: [] }).bases].join(' / ');
  const dIdle = table(['Saída', 'Base'], idle.slice(0, 15).map((k) => [k, esc(dBase(k))]), { empty: 'Todas as saídas do plano receberam peças hoje.', cls: 'tnt' }) + note(`${fmt(idle.length)} de ${fmt(real.length)} saídas do plano sem nenhuma peça hoje (pode ser normal para destinos de pouco volume).`);
  const dOver = table(['Saída', 'Base', 'Peças hoje', 'Peças/h', 'vs mediana', capS ? 'vs capacidade' : '', 'Rejeito'], over.map((x) => [`<b>${x.k}</b>`, esc(dBase(x.k)), fmt(x.n), fmt(x.n / hours), dec(x.n / Math.max(1, med), 1) + '×', capS ? `<b class="${pc(x.n / hours, capS) > 90 ? 'bad' : ''}">${dec(pc(x.n / hours, capS), 0)}%</b>` : '', dec(pc(perRej.get(x.k) || 0, x.n), 1) + '%']), { right: [2, 3, 4, 5, 6], empty: 'Nenhuma saída muito acima da mediana.', cls: 'tnt' });

  // D8 balanceamento
  const vals = load.map((x) => x.n), mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length), sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, vals.length));
  const top10 = load.slice(0, 10).reduce((a, x) => a + x.n, 0), sumAll = vals.reduce((a, b) => a + b, 0);
  const bal = kvs([['Concentração nas 10 maiores saídas', dec(pc(top10, sumAll), 1) + '%'], ['Coeficiente de variação', dec(mean ? sd / mean : 0, 2), mean && sd / mean > 1.5 ? 'warn' : ''], ['Mediana por saída', fmt(med) + ' peças']]) + hbars(load.slice(0, 10).map((x) => ({ k: 'Saída ' + x.k, v: x.n })));

  // D10 rota × saída (plano manda para X, desceu em Y)
  const desv = fall.filter((r) => !r.ex && r.cl && !A.isExcChute(r.dc) && !String(r.cl).split(',').map(no).includes(no(r.dc)));
  const dv = new Map(); for (const r of desv) { const k = A.chuteLabel(A.chuteKey(r)) + ' → ' + no(r.dc); dv.set(k, (dv.get(k) || 0) + 1); }
  const d10 = kvs([['Peças que desceram em saída diferente da planejada', fmt(desv.length), desv.length ? 'warn' : 'ok', dec(pc(desv.length, tot), 2) + '% das peças']]) + table(['Planejada → real', 'Peças'], [...dv].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => [esc(k), fmt(n)]), { right: [1], empty: 'Nenhuma divergência. ✅', cls: 'tnt' });

  // D7 impacto antes/depois das ativações de hoje
  const ev = ((PH.hist && PH.hist.events) || []).filter((e) => e.t >= now - 12 * HOUR);
  const imp = ev.map((e) => { const a = all.filter((r) => r.dc && r.t >= e.t - HOUR && r.t < e.t), b = all.filter((r) => r.dc && r.t >= e.t && r.t < e.t + HOUR); return { e, an: a.length, ar: a.filter((r) => r.ex).length, bn: b.length, br: b.filter((r) => r.ex).length }; });
  const dImp = table(['Quando', 'Plano', 'Mudanças', 'Rejeito 1 h antes', 'Rejeito 1 h depois', 'Efeito'], imp.map(({ e, an, ar, bn, br }) => { const x = pc(ar, an), y = pc(br, bn), m = e.add.length + e.del.length + e.base.length + e.pAdd.length + e.pDel.length; return [dm(e.t) + ' ' + hm(e.t), esc(e.code), fmt(m), an ? dec(x, 2) + '%' : '—', bn >= 50 ? dec(y, 2) + '%' : 'aguardando…', an && bn >= 50 ? (y > x * 1.2 ? tag('piorou', 'bad') : y < x * 0.8 ? tag('melhorou', 'ok') : tag('igual', '')) : '—']; }), { empty: 'Nenhuma alteração de plano nas últimas 12 h registradas pelo painel.', cls: 'tnt' });

  // D5 simulador
  let sim = note('Escolha um arquivo CSV com o plano que quer testar (colunas: saída; segmento; base opcional). O painel aplica esse plano às peças de hoje e mostra o que mudaria. Nada é enviado ao sorter.');
  if (PA.sim) {
    const m = new Map(); for (const x of PA.sim) for (const cd of x.code.split(/\s+/).filter(Boolean)) { if (!m.has(cd)) m.set(cd, new Set()); m.get(cd).add(x.port); }
    const cur = new Map(); for (const [cd, s] of codes) cur.set(cd, s);
    let cobre = 0, perde = 0, muda = 0; const lc = new Map(), ln = new Map();
    for (const r of fall) { if (!r.sc) continue; const a = cur.get(r.sc), b = m.get(r.sc); if (a && !b) perde++; if (!a && b) cobre++; if (a && b && [...a].sort().join() !== [...b].sort().join()) { muda++; for (const p of b) ln.set(p, (ln.get(p) || 0) + 1 / b.size); for (const p of a) lc.set(p, (lc.get(p) || 0) + 1 / a.size); } }
    sim = kvs([['Arquivo', esc(PA.simName), '', fmt(PA.sim.length) + ' linhas'], ['Peças que passariam a ter saída', fmt(cobre), cobre ? 'ok' : ''], ['Peças que ficariam sem saída', fmt(perde), perde ? 'bad' : 'ok'], ['Peças que mudariam de saída', fmt(muda), muda ? 'warn' : '']]) +
      table(['Saída', 'Hoje (peças)', 'Recebe a mais', 'Deixa de receber'], [...new Set([...ln.keys(), ...lc.keys()])].map((k) => ({ k, a: Math.round(ln.get(k) || 0), b: Math.round(lc.get(k) || 0) })).sort((x, y) => y.a + y.b - x.a - x.b).slice(0, 12).map((o) => [o.k, fmt(per.get(o.k) || 0), '+' + fmt(o.a), '−' + fmt(o.b)]), { right: [1, 2, 3], empty: 'Sem mudança de saída para as peças de hoje.', cls: 'tnt' }) + note('A simulação compara códigos de segmento da peça (campo sortcode) com os do plano. Se o formato não bater, o resultado aparece zerado.');
  }
  const bar = `<div class="kbar">${btn('Exportar plano ativo (CSV)', 'data-pa="csv"')}${btn('Carregar plano para simular', 'data-pa="sim"')}${PA.sim ? btn('Limpar simulação', 'data-pa="clr"') : ''}</div>`;

  setTimeout(() => {
    const root = document.getElementById('sysBody'); if (!root || root.dataset.paBound) return; root.dataset.paBound = '1';
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pa]'); if (!b) return; const a = b.dataset.pa;
      if (a === 'csv') csvDownload('plano-ativo.csv', ['Saída', 'Segmentos', 'Base'], PA.rows.map((x) => [x.port, x.code, x.base]));
      else if (a === 'clr') { PA.sim = null; redraw(); } else if (a === 'sim') { const f = document.createElement('input'); f.type = 'file'; f.accept = '.csv,.txt'; f.onchange = async () => { PA.sim = parseCsv(await f.files[0].text()); PA.simName = f.files[0].name; redraw(); }; f.click(); }
    });
  }, 0);
  return card('Auditoria do plano', esc(P[0].plan || ''), 'Verifica se o plano ativo cobre o que o sorter recebe, se há saídas sobrando ou sobrecarregadas e se alguma mudança de plano piorou o rejeito.', bar + cov) +
    grid2(card('Peças sem plano', 'cobertura do dia', '', dUnc) + card('Consistência', '', 'Segmentos repetidos, saídas sem segmento, bases duplicadas.', cons)) +
    grid2(card('Saídas ociosas', 'sem peças hoje', '', dIdle) + card('Saídas sobrecarregadas', 'muito acima da mediana', capS ? 'Comparado também com a capacidade por saída.' : 'Defina a capacidade por saída em Metas para comparar.', dOver)) +
    grid2(card('Balanceamento de carga', '', 'Uma distribuição muito concentrada sobrecarrega poucas saídas.', bal) + card('Rota × saída', 'o planejado × o que aconteceu', '', d10)) +
    card('Impacto das mudanças de plano', 'rejeito 1 h antes × 1 h depois', 'Compara o rejeito da hora anterior e posterior a cada alteração de plano registrada pelo painel.', dImp) +
    card('Simulador de plano', 'teste sem risco', '', sim);
}
