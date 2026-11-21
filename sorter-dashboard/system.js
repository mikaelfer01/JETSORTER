// Aba "Sistema": cobertura total do sorter em um lugar só.
// Lotes (packLogs) · Comandos (optlogs) · Exceções por motivo · Desempenho do WCS · Consulta de pacote/lote · Plano · Cobertura.
// Tudo somente leitura (nunca chama /sortercmd/*).
import { renderPlanAudit } from './planaudit.js';
import { renderSegmentos, wireSegmentos, SEG as SEGOWN } from './segmentos.js';
import { renderPlanHist, loadLog } from './planhist.js';
import { getJson, DIAG, transport } from './api.js';
import { parseT } from './store.js';
import { PLAN, baseOf, codesOf } from './plan.js';

const HOUR = 3600000;
const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
const dec = (n, d = 1) => Number(n).toFixed(d).replace('.', ',');
const pct = (a, b, d = 1) => (b ? dec((a / b) * 100, d) + '%' : '—');
const p2 = (n) => String(n).padStart(2, '0');
const hhmm = (t) => { const d = new Date(t); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const hhmmss = (t) => `${hhmm(t)}:${p2(new Date(t).getSeconds())}`;
const dm = (t) => { const d = new Date(t); return `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${hhmm(t)}`; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dur = (ms) => (ms < 90000 ? Math.round(ms / 1000) + ' s' : ms < 5400000 ? Math.round(ms / 60000) + ' min' : dec(ms / HOUR, 1) + ' h');
const EXC = (c) => /^(0*208|0*888)$/.test(String(c || ''));
const pctl = (arr, p) => { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };

export const SYS = {
  tab: 'desc', lotes: new Map(), cmds: new Map(), loteInit: false, cmdInit: false, loteDay: 0, cmdDay: 0,
  loteAt: 0, cmdAt: 0, err: '', look: { q: '', res: null, busy: false }, planQ: '', planRows: null, planAt: 0, reasonMode: 'all'
};
const TABS = [['desc', 'Descobertas'], ['lotes', 'Lotes'], ['exc', 'Exceções'], ['wcs', 'Desempenho do WCS'], ['cmd', 'Comandos'], ['look', 'Consulta'], ['plano', 'Plano de triagem'], ['hist', 'Histórico do plano'], ['cob', 'Cobertura'], ['audit', 'Auditoria do plano'], ['seg', 'Segmentos'], ['diag', 'Diagnóstico']];

// ---------- coleta ----------
export function parseLote(x) {
  return {
    id: +x.id, lote: x.containerno || '', ch: String(x.dischargechute || ''), n: +x.total || 0,
    open: parseT(x.bindtime), close: parseT(x.blocktime), flag: x.packflag, ms: x.packsendms == null ? null : +x.packsendms, chip: x.chipno || ''
  };
}
export function parseCmd(x) {
  return { id: +x.id, t: parseT(x.logdate), ev: x.event || '', memo: x.memo || '', who: x.adminname || '', pc: x.pcname || '' };
}
const isFail = (e) => /格口绑包失败/.test(e);

async function pagesUntil(fetchPage, parse, stopT, maxPages, per) {
  const out = [];
  for (let p = 1; p <= maxPages; p++) {
    const rows = await fetchPage(p, per);
    if (!rows.length) break;
    const ps = rows.map(parse).filter((r) => Number.isFinite(r.id));
    out.push(...ps);
    const oldest = Math.min(...ps.map((r) => r.t ?? r.close ?? Infinity));
    if (rows.length < per || oldest < stopT) break;
  }
  return out;
}

export async function syncSystem(d0, force = false) {
  const now = Date.now();
  if (SYS.loteDay !== d0) { SYS.lotes.clear(); SYS.loteInit = false; SYS.loteDay = d0; }
  if (SYS.cmdDay !== d0) { SYS.cmds.clear(); SYS.cmdInit = false; SYS.cmdDay = d0; }
  const jobs = [];
  if (force || now - SYS.loteAt > (SYS.loteInit ? 8000 : 0)) {
    SYS.loteAt = now;
    jobs.push((async () => {
      const per = SYS.loteInit ? 150 : 500;
      const rows = await pagesUntil(async (page, pp) => (await getJson('/query/packLogs?action=fetchdata', { method: 'POST', form: { page, perPage: pp, dischargechute: '', containerno: '', bindtime: '' } })).data || [],
        (x) => { const r = parseLote(x); r.t = r.close; return r; }, d0, SYS.loteInit ? 1 : 12, per);
      for (const r of rows) if (r.close >= d0 || r.open >= d0) SYS.lotes.set(r.id, r);
      SYS.loteInit = true;
    })());
  }
  if (force || now - SYS.cmdAt > (SYS.cmdInit ? 15000 : 0)) {
    SYS.cmdAt = now;
    jobs.push((async () => {
      const per = SYS.cmdInit ? 200 : 1000;
      const rows = await pagesUntil(async (page, pp) => (await getJson('/query/optlogs?action=fetchdata', { method: 'POST', form: { page, perPage: pp, event: '', memo: '', logdate: '' } })).data || [],
        parseCmd, d0, SYS.cmdInit ? 1 : 6, per);
      for (const r of rows) if (r.t >= d0 && !isFail(r.ev)) SYS.cmds.set(r.id, r);
      SYS.cmdInit = true;
    })());
  }
  try { await Promise.all(jobs); SYS.err = ''; } catch (e) { SYS.err = e && e.message ? e.message : String(e); }
}

export async function lookup(q) {
  q = String(q || '').trim();
  const L = SYS.look; L.q = q; L.busy = true; L.res = null;
  try {
    const post = (p, f) => getJson(p, { method: 'POST', form: f });
    const res = { q, pieces: [], lotes: [], adj: [] };
    const tr = await post('/query/trace?action=fetchdata', { page: 1, perPage: 20, advanced_query: 0, waybillno: q, gongtime: '', dischargetime: '', dischargechute: '', trayno: '', inductionno: '', containerno: q, exception: '', srflag: -1 });
    res.pieces = tr.data || [];
    const pk = await post('/query/packLogs?action=fetchdata', { page: 1, perPage: 20, dischargechute: '', containerno: q, bindtime: '' });
    res.lotes = (pk.data || []).map(parseLote);
    if (res.pieces.length) {
      try {
        const adj = await post('/query/adjacent?action=fetchdata', { page: 1, perPage: 20, waybillno: res.pieces[0].waybillno || q, previous: 5, next: 5, time: res.pieces[0].gongtime || '', layer: -1, dependson: 1 });
        res.adj = adj.data || [];
      } catch (e) { /* tela opcional */ }
    }
    L.res = res;
  } catch (e) { L.res = { q, err: e && e.message ? e.message : String(e), pieces: [], lotes: [], adj: [] }; }
  L.busy = false;
}

async function loadFullPlan() {
  if (SYS.planRows && Date.now() - SYS.planAt < 600000) return;
  SYS.planAt = Date.now();
  const j = await getJson('/query/plan?action=fetchdata', { method: 'POST', form: { page: 1, perPage: 5000, sortingplancode: '', sortingportcode: '', gridname: '', threesegmentcode: '' } });
  SYS.planRows = (j.data || []).filter((x) => String(x.defaultplan) === '1').map((x) => ({ port: String(parseInt(x.sortingportcode, 10)), base: x.gridname || '', code: x.threesegmentcode || '' }));
}

// ---------- análises ----------
export function loteStats(now, d0, fall) {
  const L = [...SYS.lotes.values()].filter((l) => l.close >= d0).sort((a, b) => b.close - a.close);
  const fill = L.map((l) => l.close - l.open).filter((x) => x > 0);
  const byCh = new Map();
  for (const l of L) { let g = byCh.get(l.ch); if (!g) { g = { ch: l.ch, n: 0, pecas: 0, last: 0, fill: [] }; byCh.set(l.ch, g); } g.n++; g.pecas += l.n; g.last = Math.max(g.last, l.close); if (l.close > l.open) g.fill.push(l.close - l.open); }
  // peças caídas depois do último lote fechado, por saída (indicador de lote "atrasado"/saída cheia)
  const since = new Map();
  for (const r of fall) {
    const k = String(parseInt(r.dc, 10)); if (!k || EXC(k)) continue;
    const g = byCh.get(k); const lastC = g ? g.last : 0;
    if (r.t > lastC) since.set(k, (since.get(k) || 0) + 1);
  }
  const hours = new Map();
  for (const l of L) { const h = Math.floor(l.close / HOUR) * HOUR; const x = hours.get(h) || { h, n: 0, pecas: 0 }; x.n++; x.pecas += l.n; hours.set(h, x); }
  return { L, fill, byCh, since, hours: [...hours.values()].sort((a, b) => a.h - b.h), pecas: L.reduce((a, l) => a + l.n, 0) };
}

export function wcsStats(rows) {
  const dq = [], tm = [], hours = new Map();
  let sent = 0, sentMs = [];
  for (const r of rows) {
    if (!r.tm && !r.dq) continue;
    dq.push(r.dq); tm.push(r.tm);
    const h = Math.floor(r.t / HOUR) * HOUR; let x = hours.get(h); if (!x) { x = { h, dq: [], tm: [] }; hours.set(h, x); }
    x.dq.push(r.dq); x.tm.push(r.tm);
    if (r.ps) { sent++; sentMs.push(r.ps); }
  }
  return {
    n: dq.length, dq, tm, p50: pctl(tm, 50), p95: pctl(tm, 95), p99: pctl(tm, 99), max: tm.length ? Math.max(...tm) : 0, dq50: pctl(dq, 50), dq95: pctl(dq, 95),
    sentMs: pctl(sentMs, 50), sent, hours: [...hours.values()].sort((a, b) => a.h - b.h).map((x) => ({ h: x.h, n: x.tm.length, p50: pctl(x.tm, 50), p95: pctl(x.tm, 95), max: Math.max(...x.tm) }))
  };
}

const cmdKind = (c) => {
  const m = c.memo || '', e = c.ev || '';
  if (/Plan/i.test(e)) return /Active/i.test(e) ? 'Plano ativado' : /Download/i.test(e) ? 'Plano baixado' : /Refresh/i.test(e) ? 'Plano atualizado' : 'Plano';
  if (/chute/i.test(m) || /chute command/i.test(e)) return /disable/i.test(m) ? 'Saída desabilitada' : /enable/i.test(m) ? 'Saída habilitada' : 'Comando de saída';
  if (/carrier/i.test(e)) return 'Comando de carrinho';
  if (/start|启动/i.test(m)) return 'Sorter ligado';
  if (/stop|停止|暂停/i.test(m)) return 'Sorter parado';
  if (/sorter|分拣/i.test(e + m)) return 'Comando do sorter';
  return 'Outro comando';
};
export function cmdList(d0) {
  const L = [...SYS.cmds.values()].filter((c) => c.t >= d0).sort((a, b) => b.t - a.t);
  const out = []; // remove repetições idênticas no mesmo segundo (o SCADA grava 1 linha por camada)
  for (const c of L) { const p = out[out.length - 1]; if (p && p.t === c.t && p.memo === c.memo && p.ev === c.ev) { p.rep++; continue; } out.push({ ...c, kind: cmdKind(c), rep: 1 }); }
  return out;
}

export function gaps(fall, now, minMs = 600000) {
  const ts = fall.map((r) => r.t).sort((a, b) => a - b);
  const out = [];
  for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] >= minMs) out.push({ a: ts[i - 1], b: ts[i], ms: ts[i] - ts[i - 1] });
  if (ts.length && now - ts[ts.length - 1] >= minMs) out.push({ a: ts[ts.length - 1], b: now, ms: now - ts[ts.length - 1], open: true });
  return out.sort((x, y) => y.ms - x.ms);
}

// ---------- descobertas automáticas ----------
export function discoveries(c) {
  const { all, fall, now, d0, binds, isRej, rejLabel } = c;
  const D = [];
  const add = (lvl, title, text, go) => D.push({ lvl, title, text, go });
  const tot = fall.length;
  if (!tot) return [{ lvl: 'info', title: 'Sem peças ainda hoje', text: 'Assim que o sorter descarregar peças, as descobertas aparecem aqui.' }];
  const rej = fall.filter(isRej);
  const hrs = new Map();
  for (const r of fall) { const h = Math.floor(r.t / HOUR) * HOUR; const x = hrs.get(h) || { n: 0, rej: 0 }; x.n++; if (isRej(r)) x.rej++; hrs.set(h, x); }
  const hl = [...hrs.entries()].sort((a, b) => a[0] - b[0]);
  const full = hl.filter(([h]) => h + HOUR <= now);
  if (full.length >= 2) {
    const best = full.reduce((a, b) => (b[1].n > a[1].n ? b : a)), worst = full.reduce((a, b) => (b[1].n < a[1].n ? b : a));
    add('info', 'Hora de pico e de vale', `Pico às ${hhmm(best[0])} com ${fmt(best[1].n)} peças; menor hora cheia às ${hhmm(worst[0])} com ${fmt(worst[1].n)} (${pct(worst[1].n, best[1].n, 0)} do pico).`);
  }
  const cur = hrs.get(Math.floor(now / HOUR) * HOUR);
  if (cur && full.length) {
    const avg = full.reduce((a, [, x]) => a + x.n, 0) / full.length;
    const el = (now % HOUR) / HOUR;
    if (el > 0.25) { const proj = cur.n / el; add(proj < avg * 0.8 ? 'warn' : 'ok', 'Ritmo da hora atual', `Projeção de ${fmt(Math.round(proj))} peças nesta hora contra média de ${fmt(Math.round(avg))} nas horas fechadas (${proj >= avg ? '+' : ''}${dec(((proj - avg) / avg) * 100, 0)}%).`); }
  }
  // indução com maior taxa de rejeito
  const bi = new Map();
  for (const r of fall) { const x = bi.get(r.ind) || { n: 0, rej: 0 }; x.n++; if (isRej(r)) x.rej++; bi.set(r.ind, x); }
  const il = [...bi.entries()].filter(([, x]) => x.n >= 200).map(([k, x]) => ({ k, ...x, rate: x.rej / x.n })).sort((a, b) => b.rate - a.rate);
  if (il.length >= 2) {
    const w = il[0], b = il[il.length - 1];
    add(w.rate > b.rate * 2 && w.rate > 0.01 ? 'bad' : 'info', 'Indução com mais rejeito', `Indução ${w.k}: ${pct(w.rej, w.n, 2)} de ${rejLabel}; a melhor é a ${b.k} com ${pct(b.rej, b.n, 2)}. ${w.rate > b.rate * 2 ? 'A diferença sugere problema de leitura/operação naquela indução.' : ''}`, 'ind|' + w.k);
  }
  // motivo dominante
  const rs = new Map();
  for (const r of all) if (r.ex && r.dc) rs.set(r.ex, (rs.get(r.ex) || 0) + 1);
  const rl = [...rs.entries()].sort((a, b) => b[1] - a[1]);
  if (rl.length) { const s = rl.reduce((a, [, v]) => a + v, 0); add('info', 'Motivo de exceção dominante', `${rl[0][0]} responde por ${pct(rl[0][1], s, 0)} das ${fmt(s)} exceções do dia.`, 'exc'); }
  // sem saída pretendida
  const noDest = rej.filter((r) => !(r.cl && !EXC(r.cl)) && !(r.pc && !EXC(r.pc)));
  if (rej.length && noDest.length / rej.length > 0.15) add('warn', 'Rejeitos sem saída pretendida', `${pct(noDest.length, rej.length, 0)} dos rejeitos (${fmt(noDest.length)}) não têm saída de destino: normalmente falha de leitura ou ausência no plano. Não são culpa de nenhuma saída específica.`);
  // paradas
  const g = gaps(fall, now);
  if (g.length) add(g[0].ms >= 1800000 ? 'warn' : 'info', 'Maior parada do dia', `${dur(g[0].ms)} sem descargas (${hhmm(g[0].a)} → ${g[0].open ? 'agora' : hhmm(g[0].b)}). Total: ${g.length} paradas ≥ 10 min somando ${dur(g.reduce((a, x) => a + x.ms, 0))}.`);
  // concentração e saídas ociosas
  const vc = new Map();
  for (const r of fall) { const k = String(parseInt(r.dc, 10)); if (!k || EXC(k)) continue; vc.set(k, (vc.get(k) || 0) + 1); }
  const normal = [...vc.values()].reduce((a, b) => a + b, 0);
  if (normal) {
    const top = [...vc.entries()].sort((a, b) => b[1] - a[1]);
    const t10 = top.slice(0, 10).reduce((a, [, v]) => a + v, 0);
    add('info', 'Concentração de volume', `As 10 maiores saídas recebem ${pct(t10, normal, 0)} das peças (#1: saída ${top[0][0]}${baseOf(top[0][0]) ? ' · ' + baseOf(top[0][0]) : ''} com ${fmt(top[0][1])}).`);
    if (PLAN.map.size) { const idle = [...PLAN.map.keys()].filter((k) => !vc.has(String(parseInt(k, 10))) && !EXC(k)); if (idle.length) add('info', 'Saídas do plano sem nenhuma peça hoje', `${idle.length} de ${PLAN.map.size} saídas: ${idle.slice(0, 12).join(', ')}${idle.length > 12 ? '…' : ''}.`); }
  }
  // lotes
  if (SYS.loteInit) {
    const ls = loteStats(now, d0, fall);
    if (ls.L.length) {
      const f = pctl(ls.fill, 50), sm = ls.L.filter((l) => l.n > 0 && l.n < 5).length;
      add('info', 'Lotes do dia', `${fmt(ls.L.length)} lotes fechados, mediana de ${fmt(pctl(ls.L.map((l) => l.n), 50))} peças e ${dur(f)} para encher. ${sm ? `${sm} lote(s) fechado(s) com menos de 5 peças.` : ''}`, 'lotes');
      const late = [...ls.since.entries()].sort((a, b) => b[1] - a[1])[0];
      if (late && late[1] >= 30) add('warn', 'Saída acumulando sem fechar lote', `Saída ${late[0]}${baseOf(late[0]) ? ' (' + baseOf(late[0]) + ')' : ''} recebeu ${fmt(late[1])} peças desde o último lote fechado.`, 'lotes');
    }
  }
  if (binds && binds.size) add('warn', 'Falhas de vínculo de lote hoje', `${fmt(binds.size)} falhas (código de rota não confere com a saída). Veja a lista na Visão geral.`);
  // WCS
  const w = wcsStats(all);
  if (w.n > 100) add(w.p95 > 1000 ? 'warn' : 'ok', 'Tempo do WCS', `Mediana ${fmt(w.p50)} ms, p95 ${fmt(w.p95)} ms, pior ${fmt(w.max)} ms em ${fmt(w.n)} peças.`, 'wcs');
  // comandos
  const cl = cmdList(d0);
  const dis = cl.filter((x) => x.kind === 'Saída desabilitada').length, plans = cl.filter((x) => /^Plano/.test(x.kind)).length, st = cl.filter((x) => /^Sorter/.test(x.kind));
  if (cl.length) add(dis ? 'warn' : 'info', 'Intervenções do operador', `${cl.length} comandos hoje: ${st.length} no sorter, ${dis} saídas desabilitadas, ${plans} ações de plano. Último: ${cl[0].kind} às ${hhmm(cl[0].t)}.`, 'cmd');
  return D;
}

// ---------- render ----------
const kpi = (cls, l, v, s = '') => `<div class="kpi ${cls}"><label>${l}</label><b>${v}</b><small>${s}</small></div>`;
const tbl = (head, rows, empty = 'Nada a mostrar.') => rows.length ? `<div class="scroll"><table><thead><tr>${head.map((h) => `<th${h[0] === '>' ? ' class="r"' : ''}>${h.replace(/^>/, '')}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : `<div class="empty">${empty}</div>`;
const csvBtn = (k) => `<button class="mini" data-syscsv="${k}">CSV</button>`;
function spark(vals, labels, cls = '') {
  const max = Math.max(1, ...vals);
  return `<div class="sysbars ${cls}">` + vals.map((v, i) => `<div title="${esc(labels[i])}: ${fmt(v)}"><i style="height:${Math.max(2, (v / max) * 100)}%"></i><span>${esc(String(labels[i]).slice(0, 2))}</span></div>`).join('') + '</div>';
}
export const sysCsv = {};

function vDesc(c) {
  const D = discoveries(c);
  const ic = { bad: '⛔', warn: '⚠️', ok: '✅', info: '💡' };
  return `<div class="sysnote">Cada item abaixo é calculado automaticamente com os dados do dia. Clique para ir ao detalhe.</div><div class="discs">` +
    D.map((d) => `<div class="disc ${d.lvl}" ${d.go ? `data-sysgo="${esc(d.go)}"` : ''}><span class="di">${ic[d.lvl] || '💡'}</span><div><b>${esc(d.title)}</b><p>${esc(d.text)}</p></div></div>`).join('') + '</div>';
}
function vLotes(c) {
  if (!SYS.loteInit) return '<div class="empty">Carregando lotes…</div>';
  const s = loteStats(c.now, c.d0, c.fall), hrs = Math.max(1, (c.now - c.d0) / HOUR);
  const rows = [...s.byCh.values()].sort((a, b) => b.n - a.n);
  sysCsv.lotes = { head: ['Lote', 'Saida', 'Base', 'Pecas', 'Abertura', 'Fechamento', 'EnchimentoMin'], rows: s.L.map((l) => [l.lote, l.ch, baseOf(l.ch) || '', l.n, dm(l.open), dm(l.close), Math.round((l.close - l.open) / 60000)]) };
  const baseAgg = new Map();
  for (const l of s.L) { const b = baseOf(l.ch) || '(sem base)'; const x = baseAgg.get(b) || { b, n: 0, p: 0 }; x.n++; x.p += l.n; baseAgg.set(b, x); }
  return `<div class="kpis sys6">${kpi('blue', 'Lotes fechados hoje', fmt(s.L.length), `${dec(s.L.length / hrs, 1)} por hora`)}${kpi('ok', 'Peças em lotes', fmt(s.pecas), 'soma dos lotes fechados')}${kpi('blue', 'Mediana por lote', fmt(pctl(s.L.map((l) => l.n), 50)), 'peças')}${kpi('blue', 'Tempo p/ encher', dur(pctl(s.fill, 50)), 'mediana (abertura→fechamento)')}${kpi('warn', 'Lotes pequenos', fmt(s.L.filter((l) => l.n > 0 && l.n < 5).length), 'menos de 5 peças')}${kpi('warn', 'Mais lento', s.fill.length ? dur(Math.max(...s.fill)) : '—', 'maior tempo para encher')}</div>
  <div class="grid2"><div class="card"><h2>Lotes fechados por hora</h2>${spark(s.hours.map((x) => x.n), s.hours.map((x) => p2(new Date(x.h).getHours()) + 'h'))}</div>
  <div class="card"><h2>Saídas acumulando sem fechar lote <small>peças desde o último fechamento</small></h2>${tbl(['Saída', 'Base', '>Peças desde o último lote', '>Último lote'], [...s.since.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `<tr data-goto="chute|${esc(k)}"><td><b>${esc(k)}</b></td><td>${esc(baseOf(k) || '—')}</td><td class="r"><b>${fmt(v)}</b></td><td class="r">${s.byCh.get(k) ? hhmm(s.byCh.get(k).last) : 'nenhum hoje'}</td></tr>`))}</div></div>
  <div class="grid2"><div class="card"><h2>Por saída <small>lotes do dia</small> ${csvBtn('lotes')}</h2>${tbl(['Saída', 'Base', '>Lotes', '>Peças', '>Peças/lote', '>Enchimento'], rows.slice(0, 40).map((g) => `<tr data-goto="chute|${esc(g.ch)}"><td><b>${esc(g.ch)}</b></td><td>${esc(baseOf(g.ch) || '—')}</td><td class="r">${g.n}</td><td class="r">${fmt(g.pecas)}</td><td class="r">${dec(g.pecas / g.n, 0)}</td><td class="r">${g.fill.length ? dur(pctl(g.fill, 50)) : '—'}</td></tr>`))}</div>
  <div class="card"><h2>Por base</h2>${tbl(['Base', '>Lotes', '>Peças'], [...baseAgg.values()].sort((a, b) => b.p - a.p).slice(0, 40).map((x) => `<tr><td>${esc(x.b)}</td><td class="r">${x.n}</td><td class="r">${fmt(x.p)}</td></tr>`))}</div></div>
  <div class="card"><h2>Últimos lotes</h2>${tbl(['Fechou', 'Lote', 'Saída', 'Base', '>Peças', '>Enchimento'], s.L.slice(0, 25).map((l) => `<tr data-look="${esc(l.lote)}"><td>${hhmmss(l.close)}</td><td><b>${esc(l.lote)}</b></td><td>${esc(l.ch)}</td><td>${esc(baseOf(l.ch) || '—')}</td><td class="r">${l.n}</td><td class="r">${dur(l.close - l.open)}</td></tr>`))}</div>`;
}
function vExc(c) {
  const ex = c.all.filter((r) => r.ex && r.dc);
  if (!ex.length) return '<div class="empty">Nenhuma exceção hoje.</div>';
  const by = new Map(), ind = new Map(), hr = new Map();
  for (const r of ex) {
    by.set(r.ex, (by.get(r.ex) || 0) + 1);
    const k = r.ex + '|' + r.ind; ind.set(k, (ind.get(k) || 0) + 1);
    const h = new Date(Math.floor(r.t / HOUR) * HOUR).getHours(); const m = hr.get(r.ex) || new Array(24).fill(0); m[h]++; hr.set(r.ex, m);
  }
  const rs = [...by.entries()].sort((a, b) => b[1] - a[1]), tot = ex.length, inds = [...new Set(ex.map((r) => r.ind))].sort((a, b) => a - b);
  const mx = Math.max(1, ...ind.values());
  sysCsv.exc = { head: ['Motivo', 'Pecas', 'Pct'], rows: rs.map(([k, v]) => [k, v, ((v / tot) * 100).toFixed(2)]) };
  return `<div class="grid2"><div class="card"><h2>Exceções por motivo <small>${fmt(tot)} no dia</small> ${csvBtn('exc')}</h2>${tbl(['Motivo', '>Peças', '>%'], rs.map(([k, v]) => `<tr data-reason="${esc(k)}"><td><b>${esc(k)}</b></td><td class="bar"><i style="width:${(v / rs[0][1]) * 100}%"></i><span>${fmt(v)}</span></td><td class="r">${pct(v, tot)}</td></tr>`))}</div>
  <div class="card"><h2>Motivo × indução <small>onde cada tipo de exceção nasce</small></h2><div class="scroll"><table class="hm"><thead><tr><th></th>${inds.map((i) => `<th class="r">${i}</th>`).join('')}</tr></thead><tbody>${rs.slice(0, 8).map(([k]) => `<tr><td>${esc(k)}</td>${inds.map((i) => { const v = ind.get(k + '|' + i) || 0; return `<td class="r" style="background:rgba(214,0,28,${v ? 0.08 + 0.7 * (v / mx) : 0})">${v || ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div></div></div>
  <div class="card"><h2>Motivo × hora do dia</h2><div class="scroll"><table class="hm"><thead><tr><th></th>${[...Array(24).keys()].map((h) => `<th class="r">${p2(h)}</th>`).join('')}</tr></thead><tbody>${rs.slice(0, 8).map(([k]) => { const m = hr.get(k), mm = Math.max(1, ...m); return `<tr><td>${esc(k)}</td>${m.map((v) => `<td class="r" style="background:rgba(214,0,28,${v ? 0.08 + 0.7 * (v / mm) : 0})">${v || ''}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div></div>`;
}
function vWcs(c) {
  const w = wcsStats(c.all);
  if (w.n < 10) return '<div class="empty">Sem dados de tempo do WCS ainda (campos decodeusems / totalusems da trace).</div>';
  sysCsv.wcs = { head: ['Hora', 'Pecas', 'P50ms', 'P95ms', 'Maxms'], rows: w.hours.map((x) => [hhmm(x.h), x.n, x.p50, x.p95, x.max]) };
  const slow = w.hours.slice().sort((a, b) => b.p95 - a.p95)[0];
  return `<div class="sysnote">Tempo que o WCS levou para decodificar/responder cada peça (campos <b>decodeusems</b> e <b>totalusems</b>). Quanto menor, melhor; picos indicam lentidão do servidor/rede.</div>
  <div class="kpis sys6">${kpi('blue', 'Mediana', fmt(w.p50) + ' ms', 'tempo total por peça')}${kpi(w.p95 > 1000 ? 'warn' : 'ok', 'p95', fmt(w.p95) + ' ms', '95% das peças abaixo disso')}${kpi(w.p99 > 3000 ? 'bad' : 'blue', 'p99', fmt(w.p99) + ' ms', '')}${kpi('warn', 'Pior caso', fmt(w.max) + ' ms', 'maior tempo do dia')}${kpi('blue', 'Decodificação', fmt(w.dq50) + ' ms', `mediana · p95 ${fmt(w.dq95)} ms`)}${kpi('blue', 'Peças medidas', fmt(w.n), slow ? `pior hora: ${hhmm(slow.h)} (p95 ${fmt(slow.p95)} ms)` : '')}</div>
  <div class="grid2"><div class="card"><h2>p95 por hora (ms)</h2>${spark(w.hours.map((x) => x.p95), w.hours.map((x) => p2(new Date(x.h).getHours()) + 'h'))}</div>
  <div class="card"><h2>Por hora ${csvBtn('wcs')}</h2>${tbl(['Hora', '>Peças', '>Mediana', '>p95', '>Máx'], w.hours.map((x) => `<tr><td>${hhmm(x.h)}</td><td class="r">${fmt(x.n)}</td><td class="r">${fmt(x.p50)}</td><td class="r"><b>${fmt(x.p95)}</b></td><td class="r">${fmt(x.max)}</td></tr>`))}</div></div>`;
}
function vCmd(c) {
  if (!SYS.cmdInit) return '<div class="empty">Carregando auditoria…</div>';
  const L = cmdList(c.d0), k = new Map();
  for (const x of L) k.set(x.kind, (k.get(x.kind) || 0) + 1);
  sysCsv.cmd = { head: ['Hora', 'Tipo', 'Detalhe', 'Usuario', 'PC', 'Repeticoes'], rows: L.map((x) => [dm(x.t), x.kind, x.memo, x.who, x.pc, x.rep]) };
  const tone = (t) => (/desabil|parado/i.test(t) ? 'bad' : /plano|habil|ligado/i.test(t) ? 'warn' : 'blue');
  return `<div class="sysnote">Auditoria do operate log do sorter: quem mandou o quê e quando (somente leitura — este painel nunca envia comandos).</div>
  <div class="kpis sys6">${[...k.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, v]) => kpi(tone(n), esc(n), fmt(v), 'hoje')).join('') || kpi('blue', 'Comandos', '0', 'hoje')}</div>
  <div class="card"><h2>Linha do tempo de comandos ${csvBtn('cmd')}</h2>${tbl(['Hora', 'Tipo', 'Detalhe', 'Usuário', 'PC'], L.slice(0, 200).map((x) => `<tr><td>${hhmmss(x.t)}</td><td><span class="tag ${tone(x.kind)}">${esc(x.kind)}</span></td><td>${esc(x.memo || x.ev)}${x.rep > 1 ? ` <span class="muted">×${x.rep}</span>` : ''}</td><td>${esc(x.who || '—')}</td><td>${esc(x.pc || '—')}</td></tr>`), 'Nenhum comando hoje.')}</div>`;
}
function pieceRow(p) {
  return `<tr><td>${esc(p.gongtime || '')}</td><td><b>${esc(p.waybillno || '')}</b></td><td>${esc(p.inductionno || '')}</td><td>${esc(p.sortcode || '')}</td><td>${esc(p.chutelist || p.plcchute || '')}</td><td>${esc(p.dischargechute || '—')}</td><td>${esc(p.exception || '')}</td><td class="r">${esc(p.weight || '')}</td></tr>`;
}
function vLook() {
  const L = SYS.look, r = L.res;
  let out = `<div class="card"><h2>Consulta de pacote ou lote</h2><div class="lookbar"><input id="sysQ" placeholder="Número do pacote (waybill) ou código do lote" value="${esc(L.q)}"><button class="btn on" id="sysGo">Consultar</button></div>`;
  if (L.busy) out += '<div class="empty">Consultando…</div>';
  else if (r) {
    if (r.err) out += `<div class="empty">Falha na consulta: ${esc(r.err)}</div>`;
    else {
      out += `<h3>Percurso da peça (trace)</h3>${tbl(['Hora', 'Pacote', 'Ind.', 'Rota', 'Saída pretendida', 'Saída real', 'Exceção', '>Peso'], r.pieces.map(pieceRow), 'Nenhuma peça com este número.')}`;
      out += `<h3>Lote</h3>${tbl(['Fechou', 'Lote', 'Saída', 'Base', '>Peças', '>Enchimento'], r.lotes.map((l) => `<tr><td>${dm(l.close)}</td><td><b>${esc(l.lote)}</b></td><td>${esc(l.ch)}</td><td>${esc(baseOf(l.ch) || '—')}</td><td class="r">${l.n}</td><td class="r">${dur(l.close - l.open)}</td></tr>`), 'Nenhum lote com este código.')}`;
      if (r.adj.length) out += `<h3>Peças vizinhas na esteira</h3>${tbl(['Hora', 'Pacote', 'Ind.', 'Rota', 'Saída pretendida', 'Saída real', 'Exceção', '>Peso'], r.adj.map(pieceRow))}`;
    }
  } else out += '<div class="sysnote">Digite um pacote para ver por onde passou (indução, rota, saída, exceção) e o lote em que entrou; ou um código de lote para ver sua saída e tamanho.</div>';
  return out + '</div>';
}
async function vPlano() {
  try { await loadFullPlan(); } catch (e) { return `<div class="empty">Não foi possível ler o plano: ${esc(e.message || e)}</div>`; }
  const q = SYS.planQ.toLowerCase();
  const R = (SYS.planRows || []).filter((x) => !q || (x.port + ' ' + x.base + ' ' + x.code).toLowerCase().includes(q));
  sysCsv.plano = { head: ['Saida', 'Base', 'CodigoRota'], rows: R.map((x) => [x.port, x.base, x.code]) };
  return `<div class="card"><h2>Plano de triagem ativo <small>${fmt(R.length)} regras${PLAN.code ? ' · plano ' + esc(PLAN.code) : ''}</small> ${csvBtn('plano')}</h2><div class="lookbar"><input id="sysPlanQ" placeholder="Filtrar por saída, base ou código de rota" value="${esc(SYS.planQ)}"></div>${tbl(['Saída', 'Base', 'Código de rota'], R.slice(0, 500).map((x) => `<tr><td><b>${esc(x.port)}</b></td><td>${esc(x.base)}</td><td>${esc(x.code)}</td></tr>`))}</div>`;
}
const COVER = [
  ['Trace (rastreio de peças)', 'Coberto', 'Visão geral, Induções, Saídas, Mapa, Consulta'],
  ['Summary / Outlets (agregados por hora)', 'Coberto', 'Produtividade por período, conferência com o oficial'],
  ['Pack logs (lotes)', 'Coberto', 'Aba Sistema › Lotes'],
  ['Operate logs (comandos, falhas de vínculo)', 'Coberto', 'Sistema › Comandos; falhas na Visão geral'],
  ['Plano de triagem (sorte plan query)', 'Coberto', 'Sistema › Plano; base de cada saída em todo o painel'],
  ['Estado do sorter / equipamentos (sorterstate)', 'Coberto', 'Equipamentos + alertas'],
  ['Adjacent (vizinhança de peça)', 'Coberto', 'Sistema › Consulta'],
  ['Estatística por saída (bychute)', 'Substituído', 'Calculado a partir da trace (a tela está vazia nesta instalação)'],
  ['Bloqueio de saída (chutelock)', 'Substituído', 'Episódios de bloqueio em Visão geral › Saídas'],
  ['Pico por indução (indPeak)', 'Substituído', 'Produtividade e Induções'],
  ['Peso anormal (abnormalWeight)', 'Substituído', 'Calculado da trace (peso)'],
  ['Exceções por motivo (sortException)', 'Substituído', 'Sistema › Exceções'],
  ['Produtividade por operador (indstaff)', 'Vazio', 'Tela sem dados nesta instalação'],
  ['Trace longa / devicestatus', 'Vazio', 'Retornam vazio no servidor'],
  ['Comandos (/sortercmd/*)', 'Bloqueado', 'Propositalmente não usado: o painel é somente leitura']
];

function vDiag(c) {
  const d = c.diag || {}, rel = (t) => (t ? Math.max(0, Math.round((Date.now() - t) / 1000)) + ' s atrás' : '—');
  const rows = Object.entries(DIAG).sort((a, b) => b[1].n - a[1].n).map(([k, x]) => `<tr><td>${esc(k)}</td><td class="r">${fmt(x.n)}</td><td class="r"><b class="${x.err ? 'bad' : ''}">${fmt(x.err)}</b></td><td class="r">${x.n - x.err ? fmt(Math.round(x.ms / Math.max(1, x.n - x.err))) : '—'} ms</td><td class="r">${fmt(Math.round(x.max))} ms</td><td>${rel(x.last)}</td><td>${x.err ? esc(x.msg).slice(0, 90) : ''}</td></tr>`).join('');
  const kp = (l, v, k = '') => `<div class="tnk ${k}"><b>${v}</b><span>${l}</span></div>`;
  return `<section class="card tnch"><h3>Diagnóstico <small>saúde da conexão e do painel</small></h3><p class="muted rwhat">Mostra se o painel está lendo o sorter sem problemas: última leitura, tempo de cada ciclo, quantidade de falhas e o tempo de resposta de cada tela do sorter.</p>` +
    `<div class="tnkg kk">${kp('Última leitura', rel(d.lastOk), d.fails ? 'bad' : 'ok')}${kp('Tempo do ciclo', fmt(d.ms) + ' ms')}${kp('Tempo de desenho', fmt(d.renderMs) + ' ms')}${kp('Falhas seguidas', fmt(d.fails), d.fails ? 'bad' : 'ok')}${kp('Peças em memória', fmt(d.rows))}${kp('Transporte', transport() === 'direct' ? 'direto' : 'via aba')}</div>` +
    (d.err ? `<p class="alert warn">Último erro: ${esc(d.err)}</p>` : '') +
    `<div class="scroll"><table class="tnt"><thead><tr><th>Consulta ao sorter</th><th class="r">Chamadas</th><th class="r">Falhas</th><th class="r">Tempo médio</th><th class="r">Maior</th><th>Última</th><th>Último erro</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="muted">Ainda sem consultas.</td></tr>'}</tbody></table></div><p class="muted nt">Somente leitura: o painel nunca chama os comandos do sorter.</p></section>`;
}
function vCob() {
  const cl = { Coberto: 'ok', Substituído: 'blue', Vazio: 'warn', Bloqueado: 'bad' };
  return `<div class="card"><h2>Cobertura do sorter <small>${COVER.length} telas/fontes mapeadas</small></h2>${tbl(['Tela / fonte', 'Situação', 'Onde está no painel'], COVER.map((c) => `<tr><td>${esc(c[0])}</td><td><span class="tag ${cl[c[1]]}">${c[1]}</span></td><td>${esc(c[2])}</td></tr>`))}</div>`;
}

export async function renderSystem(root, c) {
  if (!root.dataset.ready) {
    root.dataset.ready = '1';
    root.innerHTML = `<div class="vwbar"><div><h2>Sistema <small>o sorter inteiro em um lugar</small></h2></div><div class="seg" id="sysTabs"></div></div><div id="sysBody"></div>`;
    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-systab]'); if (t) { SYS.tab = t.dataset.systab; c.redraw && c.redraw(); return; }
      const g = e.target.closest('[data-sysgo]'); if (g) { const [k, v] = g.dataset.sysgo.split('|'); if (v) { c.goto(k, v); } else { SYS.tab = k; c.redraw(); } return; }
      const lk = e.target.closest('[data-look]'); if (lk) { SYS.tab = 'look'; SYS.look.q = lk.dataset.look; lookup(lk.dataset.look).then(() => c.redraw()); c.redraw(); return; }
      if (e.target.id === 'sysGo') { lookup($('#sysQ').value).then(() => c.redraw()); c.redraw(); return; }
      if (e.target.closest('[data-phlog]')) { loadLog().then(() => c.redraw()); c.redraw(); return; }
      const cv = e.target.closest('[data-syscsv]'); if (cv && c.csv) c.csv({ ...sysCsv[cv.dataset.syscsv], name: 'sistema_' + cv.dataset.syscsv });
    });
    root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'sysQ') { e.target.blur(); lookup(e.target.value).then(() => c.redraw()); c.redraw(); } });
    root.addEventListener('input', (e) => { if (e.target.id === 'sysPlanQ') { SYS.planQ = e.target.value; const p = e.target.selectionStart; Promise.resolve(vPlano()).then((h) => { $('#sysBody').innerHTML = h; const i = $('#sysPlanQ'); i.focus(); i.setSelectionRange(p, p); }); } });
  }
  wireSegmentos((t) => { const [h, ...r] = t.split('\n'); c.csv && c.csv({ head: h.split(';'), rows: r.map((x) => x.split(';')), name: 'segmentos' }); });
  $('#sysTabs').innerHTML = TABS.map(([k, n]) => `<button data-systab="${k}" class="${SYS.tab === k ? 'on' : ''}">${n}</button>`).join('');
  const body = $('#sysBody');
  if (SYS.err) c.err = SYS.err;
  // não recria a tela de consulta/plano enquanto o usuário digita
  if ((SYS.tab === 'look' || SYS.tab === 'plano') && document.activeElement && document.activeElement.closest && document.activeElement.closest('#sysBody') && document.activeElement.tagName === 'INPUT') return;
  if (SYS.tab === 'seg' && document.activeElement && document.activeElement.classList && (document.activeElement.classList.contains('seginp') || document.activeElement.id === 'segQ') && !SEGOWN.on) return; // editando: não recria a tela por baixo
  const h = { desc: vDesc, lotes: vLotes, exc: vExc, wcs: vWcs, cmd: vCmd, look: vLook, cob: vCob }[SYS.tab];
  body.innerHTML = SYS.tab === 'audit' ? await renderPlanAudit(c) : SYS.tab === 'seg' ? renderSegmentos(c) : SYS.tab === 'diag' ? vDiag(c) : SYS.tab === 'plano' ? await vPlano() : SYS.tab === 'hist' ? await renderPlanHist(c) : h(c);
}
function $(s) { return document.querySelector(s); }
export { codesOf };
