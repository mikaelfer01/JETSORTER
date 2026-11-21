import { initTicker } from './alertticker.js';
import { renderTurnos } from './turnos.js';
import { renderRelatorio } from './relatorio.js';
import { checkFeishu, sendTest, sendHour, setRowsProvider } from './feishu.js';
import { loadCfg, saveCfg, summary, transport, getJson, fmtQ } from './api.js';
import './fast.js';
import { resolveWin, winText } from './hour.js';
import { TraceStore } from './store.js';
import * as A from './analysis.js';
import { buildInsights } from './insights.js';
import { fetchBindFails, bindText, explainBind, bindGroups, bindKindText } from './bind.js';
import { fetchState, fetchEvents, analyze, alertsFrom, deviceInsights, KINDS, devName } from './devices.js';
import { renderDevices, renderProd } from './devview.js';
import { renderMap, initMap } from './sorterMap.js';
import { renderLayers } from './layers.js';
import { renderRej } from './rejeitos.js';
import { renderBrief } from './brief.js';
import { initHelp } from './help.js';
import { initHover } from './hover.js';
import { renderSystem, syncSystem, sysCsv } from './system.js';
import { initPeriod, prMode, repaintPeriod } from './period.js';
import { loadPlan, baseOf, codesOf, PLAN } from './plan.js';
import { SACA, OV, loadSacaOv, setSacaOv, clearSacaOv } from './saca.js';
import { loadSeg, carregarAlteracoes } from './segmentos.js';
import { renderEntityView, exportSacaPng } from './views.js';
import { renderHist } from './histview.js';
import { renderAlertas, runRules, runSchedules, loadRules, RS } from './rules.js';
import { renderMetas } from './metas.js';
import { renderRejExtra } from './rejextra.js';
import { renderDevExtra } from './devextra.js';
import { renderBusca } from './busca.js';
import { openConfig } from './config2.js';
import { syncHistory, snapToday, loadHist } from './history.js';
import { renderHero, renderStations, animateKpis, alertCheck, enableAudio, beep } from './hero.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
const pct = (a, b, d = 2) => (b ? ((a / b) * 100).toFixed(d).replace('.', ',') + '%' : '—');
const p2 = (n) => String(n).padStart(2, '0');
const hhmm = (ms) => { const d = new Date(ms); return p2(d.getHours()) + ':' + p2(d.getMinutes()); };
const hhmmss = (ms) => hhmm(ms) + ':' + p2(new Date(ms).getSeconds());
const RL = () => (A.getRejectMode() === 'all' ? 'Rejeitos' : 'Rejeitos (Chute block)');

let cfg;
const store = new TraceStore();
const S = {
  devEv: new Map(), devState: [], devInit: false, devMax: 0, devFresh: [], devFreshAt: 0, devErr: '', devFlt: { grp: 'all', crit: false, auto: false, more: false }, outlets: [], outAt: 0,
  binds: new Map(), bindInit: false, bindMax: 0, bindNew: [], bindNewAt: 0, bindErr: '', expandBind: false,
  heavyAt: 0, deepAt: 0, renderMs: 0,
  view: 'geral', vsel: { ind: null, chute: null }, vq: '', vqs: '', vsm: '', vsmOpen: true, vwWin: -1, feedRej: false, filter: {}, sel: null, official: null, offAt: 0, offKey: '', tab: 'chutes',
  busy: false, timer: null, cycle: 0, fails: 0, err: '', lastOk: 0, ms: 0, nextAt: 0, loadTxt: '',
  expand: { offenders: false, recent: false }, last: {}
};
let drag = null;
let geo = null;

// ---------- períodos ----------
const dayStart = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
function periodRange(now) {
  const d0 = dayStart(now), p = cfg.period;
  if (p.mode === 'since') {
    const [h, m] = (p.start || '00:00').split(':').map(Number);
    return [d0 + (h * 60 + m) * 60000, now + 60000];
  }
  if (p.mode === 'last') return [Math.max(d0, now - p.lastMin * 60000), now + 60000];
  return [d0, now + 60000];
}
function effRange(now) {
  let [t0, t1] = periodRange(now);
  if (S.sel) { t0 = Math.max(t0, S.sel[0]); t1 = Math.min(t1, S.sel[1]); }
  return [t0, t1];
}

// ---------- DOM util (preserva a rolagem das tabelas ao redesenhar) ----------
function setHTML(sel, html) {
  const el = $(sel);
  if (!el) return;
  const sc = el.querySelector('.scroll');
  const top = sc ? sc.scrollTop : 0;
  el.innerHTML = html;
  const sc2 = el.querySelector('.scroll');
  if (sc2) sc2.scrollTop = top;
}

// ---------- indicador ao vivo ----------
function setLive(kind, txt) {
  const el = $('#live');
  el.className = 'live ' + kind;
  if (txt !== undefined) S.loadTxt = txt;
  paintLive();
}
function paintLive() {
  const el = $('#live');
  const st = $('#liveState'), tx = $('#liveTxt');
  const kind = el.className.replace('live', '').trim();
  if (kind === 'load') { st.textContent = 'ATUALIZANDO'; tx.textContent = S.loadTxt || ''; return; }
  if (kind === 'err') {
    st.textContent = 'SEM CONEXÃO';
    tx.textContent = `${S.err} · última atualização há ${Math.round((Date.now() - S.lastOk) / 1000)} s`;
    return;
  }
  const ago = Math.round((Date.now() - S.lastOk) / 1000);
  st.textContent = cfg.refreshSec ? 'AO VIVO' : 'MANUAL';
  const nxt = cfg.refreshSec ? ` · ciclo de ${cfg.refreshSec} s` : '';
  tx.textContent = `atualizado ${hhmmss(S.lastOk)} (há ${ago} s)${nxt} · busca ${S.ms} ms + tela ${S.renderMs || 0} ms · ${transport() === 'direct' ? 'acesso direto' : 'via aba do sorter'}`;
}
setInterval(() => { if (cfg && S.lastOk) paintLive(); }, 1000);

// ---------- ciclo de atualização ----------
async function fetchOfficial(now) {
  const [e0, e1] = effRange(now);
  const key = e0 + '|' + (S.sel ? e1 : 'live');
  if (S.official && S.offKey === key && now - S.offAt < 30000) return;
  try {
    const r = await summary({ start: e0, end: e1 });
    S.official = (r.data || [])[0] || null;
    S.offAt = now; S.offKey = key;
  } catch (e) { S.official = null; }
}

async function syncDevices(d0, heavy = true) {
  try {
    const [st, ev] = await Promise.all([fetchState(), fetchEvents(S.devInit ? (heavy ? 400 : 150) : 6000)]);
    S.devState = st;
    const fresh = [];
    for (const e of ev) {
      const old = S.devEv.get(e.id);
      S.devEv.set(e.id, e);
      if (!old && S.devInit && e.id > S.devMax && e.sev >= 3) fresh.push(e);
    }
    for (const [id, e] of S.devEv) if (e.start < d0) S.devEv.delete(id);
    S.devMax = Math.max(S.devMax, ...ev.map((e) => e.id));
    S.devInit = true; S.devErr = '';
    if (fresh.length) { S.devFresh = fresh; S.devFreshAt = Date.now(); if (cfg.sound) beep(); }
  } catch (e) { S.devErr = e && e.message ? e.message : String(e); }
}
async function syncOutlets(d0, now) {
  if (now - S.outAt < 60000 && S.outlets.length) return;
  try {
    const j = await getJson('/statis/outlets', { method: 'POST', form: { start: fmtQ(d0), end: fmtQ(now + 60000), group: 60, page: 1, limit: 300 } });
    S.outlets = j.data || []; S.outAt = now;
  } catch (e) { S.outlets = []; }
}

async function syncBinds(d0) {
  try {
    const rows = await fetchBindFails(S.bindInit ? 60 : 1500);
    const fresh = [];
    for (const r of rows) {
      if (S.binds.has(r.id)) continue;
      S.binds.set(r.id, r);
      if (S.bindInit && r.id > S.bindMax) fresh.push(r);
    }
    for (const [id, r] of S.binds) if (r.t < d0) S.binds.delete(id);
    S.bindMax = Math.max(S.bindMax, ...rows.map((r) => r.id));
    S.bindInit = true; S.bindErr = '';
    if (fresh.length) {
      S.bindNew = fresh.sort((a, b) => b.id - a.id);
      S.bindNewAt = Date.now();
      if (cfg.sound) beep();
    }
  } catch (e) { S.bindErr = e && e.message ? e.message : String(e); }
}

function partialMsg(n) {
  const el = $('#partialBar'); if (!el) return;
  el.classList.toggle('hidden', !S.partial);
  if (S.partial) el.innerHTML = `<b>Carregando o histórico do dia…</b> ${fmt(n)} registros lidos. O painel já mostra os dados mais recentes; os totais do dia ficam completos em instantes.`;
}
function bootMsg(t, err) {
  const el = $('#boot'); if (!el) return;
  el.classList.toggle('err', !!err);
  $('#bootTxt').textContent = t;
}
async function refresh(force = false) {
  if (S.busy) return;
  S.busy = true;
  const t0 = performance.now();
  if (force || !S.lastOk) setLive('load', 'buscando dados…');
  try {
    const now = Date.now(), d0 = dayStart(now);
    if (store.day !== d0) { store.reset(d0); force = true; S.sel = null; S.devEv.clear(); S.binds.clear(); S.devInit = false; S.bindInit = false; }
    // ciclo leve a cada tick (trace recente + estado + logs); a cada 10 s um ciclo "pesado" (relê mais linhas p/ pegar exceções/descargas
    // atualizadas depois + confere com o Summary); a cada 5 min recarga profunda. Tudo em paralelo.
    const heavy = force || now - S.heavyAt >= 10000;
    const deep = !force && now - S.deepAt >= 300000;
    let firstDone; const first = new Promise((r) => { firstDone = r; });
    const syncP = store.sync(d0, force, (p) => {
      if (!force) return;
      setLive('load', `carregando trace… ${fmt(p.rows)} linhas`);
      bootMsg(`Carregando o dia do sorter… ${fmt(p.rows)} registros`);
      partialMsg(p.rows);
    }, { deep, per: heavy ? 1000 : 300, onFirst: firstDone });
    syncP.catch(() => {});
    const others = Promise.all([
      syncDevices(d0, heavy),
      syncBinds(d0),
      loadPlan(force),
      heavy ? fetchOfficial(now) : null,
      S.view === 'prod' && prMode() === 'live' ? syncOutlets(d0, now) : null,
      (S.view === 'sys' || S.view === 'dev' || S.view === 'busca') ? syncSystem(d0, force).catch(() => {}) : null
    ]);
    if (force && !S.lastOk) {
      // primeira carga: mostra o painel assim que chegam os registros mais novos; o histórico do dia termina em segundo plano
      await Promise.race([first, syncP]);
      await others;
      S.partial = true; partialMsg(store.rows.size);
      $('#boot').classList.add('hidden');
      render();
    }
    await Promise.all([syncP, others]);
    if (S.partial) { S.partial = false; partialMsg(0); }
    if (heavy) S.heavyAt = now;
    if (deep) S.deepAt = now;
    S.fails = 0; S.err = ''; S.lastOk = Date.now(); S.ms = Math.round(performance.now() - t0);
    $('#boot').classList.add('hidden');
    // desenho adaptativo: se a tela é pesada, desenha no máximo ~1 em cada 6 ciclos de CPU (os dados seguem atualizando)
    if (!drag && !document.hidden && (force || !S.renderAt || Date.now() - S.renderAt >= (S.renderMs || 0) * 5)) { const r0 = performance.now(); render(); S.renderMs = Math.round(performance.now() - r0); S.renderAt = Date.now(); }
    setLive('ok');
    background(now, false);
    pushMobile(now).catch(() => {});
  } catch (e) {
    S.fails++; S.err = e && e.message ? e.message : String(e);
    if (S.partial) { S.partial = false; partialMsg(0); }
    if (!S.lastOk) bootMsg('Não foi possível carregar os dados do sorter: ' + S.err + ' — tentando de novo automaticamente…', true);
    setLive('err');
    background(Date.now(), true);
  } finally {
    S.busy = false;
    retime();
  }
}

// ---------- segundo plano: histórico, alertas e agendas (não dependem da tela aberta) ----------
function bgCtx(now) {
  const d0 = dayStart(now), rows = store.list.filter((r) => r.t >= d0), fall = rows.filter((r) => r.dc);
  const an = analyze({ events: [...S.devEv.values()], state: S.devState, now, rows, dayStart: d0, intermitN: cfg.intermitN });
  const ns = A.nowStats(fall, now, cfg.nowMin, cfg.routeLevel, cfg.chuteAlert);
  return { now, cfg, rows, an, ns, binds: S.binds, state: S.devState, lastOk: S.lastOk, err: S.err, KINDS, lvl: cfg.routeLevel };
}
function background(now, failed) {
  if (!cfg) return;
  try {
    if (failed) { if (now - (S.bgAt || 0) > 30000) { S.bgAt = now; runRules({ ...bgCtx(now), partial: true }).catch(() => {}); } return; }
    if (now - (S.bgAt || 0) < 10000) return;
    S.bgAt = now;
    const c = bgCtx(now);
    syncHistory(now).catch(() => {});
    snapToday(c.rows, now, cfg.routeLevel).catch(() => {});
    runRules(c).then(() => badge()).catch(() => {});
    publishState(c);
  } catch (e) { /* o segundo plano nunca derruba a tela */ }
}
// Mapa no celular: a cada 30 s desenha o Mapa fora da tela, comprime e envia ao site da Vercel (só envio; nada é lido de volta nem escrito no sorter).
let mobAt = 0, mobBusy = false;
async function pushMobile(now) {
  if (!cfg.mobUrl || !cfg.mobKey || mobBusy || now - mobAt < (S.mobWatch ? 4000 : 30000)) return; // com celular aberto: a cada ~4 s; sem ninguém olhando: a cada 30 s
  mobAt = now; mobBusy = true;
  try {
    const c = bgCtx(now), d0 = dayStart(now), fall = c.rows.filter((r) => r.dc);
    setRowsProvider(c.rows, d0);
    const div = document.createElement('div');
    renderMap(div, { fall, all: c.rows, now, cfg, dayStart: d0, lvl: cfg.routeLevel, an: c.an });
    const html = div.innerHTML;
    let body = { v: 1, at: now, html };
    if (typeof CompressionStream !== 'undefined') {
      const buf = await new Response(new Blob([html]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
      let bin = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 8192) bin += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
      body = { v: 1, at: now, z: btoa(bin) };
    }
    const r = await fetch(cfg.mobUrl.replace(/\/+$/, '') + '/api/push', { method: 'POST', headers: { 'content-type': 'text/plain', 'x-key': cfg.mobKey }, body: JSON.stringify(body) });
    S.mobOk = r.ok ? now : S.mobOk; S.mobErr = r.ok ? '' : 'HTTP ' + r.status;
    if (r.ok) { const j = await r.json().catch(() => ({})); S.mobWatch = !!j.watch; }
  } catch (e) { S.mobErr = (e && e.message) || String(e); console.warn('mobile push', S.mobErr); }
  mobBusy = false;
}
let pubAt = 0;
function publishState(c) { // API local do app Windows: GET http://127.0.0.1:<porta>/api/resumo
  if (!window.SORTER_PROXY || c.now - pubAt < 15000) return; pubAt = c.now;
  const fall = c.rows.filter((r) => r.dc), rej = fall.filter((r) => r.ex), h = fall.filter((r) => r.t >= c.now - 3600000);
  const st = { atualizadoEm: new Date(c.now).toISOString(), pecasHoje: fall.length, rejeitosHoje: rej.length, chuteBlockHoje: rej.filter((r) => r.ex === A.BLOCK).length,
    aproveitamentoPct: fall.length ? +(((fall.length - rej.length) / fall.length) * 100).toFixed(2) : null, ultimaHora: { pecas: h.length, rejeitos: h.filter((r) => r.ex).length },
    inducoes: c.an.statusCount, alertasAtivos: Object.values(RS.active).filter((a) => !a.goneAt).map((a) => ({ alerta: a.title, gravidade: a.sev, desde: new Date(a.since).toISOString() })) };
  fetch('/__state', { method: 'POST', body: JSON.stringify(st) }).catch(() => {});
}
function badge() {
  const el = $('#alrBadge'); if (!el) return;
  const act = Object.values(RS.active).filter((a) => !a.goneAt && !a.acked), n = act.length;
  el.textContent = n; el.classList.toggle('hidden', !n); el.className = 'nbadge' + (n ? '' : ' hidden') + (act.some((a) => a.sev >= 3) ? ' crit' : '');
}

// Relógio em Web Worker (não é freado em aba oculta); se indisponível, usa setInterval.
let worker = null, fallbackTimer = null, curMs = -1;
function startClock() {
  try {
    worker = new Worker('ticker.js');
    worker.onmessage = () => { if (!S.busy && cfg.refreshSec) refresh(false); };
  } catch (e) { worker = null; }
}
function retime() {
  const base = (cfg.lite && cfg.refreshSec ? Math.max(5, cfg.refreshSec) : cfg.refreshSec) * 1000;
  let d = base;
  if (d && S.fails) d = Math.min(30000, base * 2 ** Math.min(S.fails, 3));
  if (d === curMs) return;
  curMs = d;
  if (worker) worker.postMessage({ ms: d });
  else { clearInterval(fallbackTimer); if (d) fallbackTimer = setInterval(() => { if (!S.busy) refresh(false); }, d); }
}
async function kick(force = false) {
  curMs = -1;
  await refresh(force);
  retime();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && cfg && cfg.refreshSec) { S.renderAt = 0; refresh(false); } }); // janela oculta/minimizada: os dados seguem atualizando, mas não redesenha

// ---------- render ----------
function render() {
  const now = Date.now(), f = S.filter, lvl = cfg.routeLevel;
  const [p0, p1] = periodRange(now), [e0, e1] = effRange(now);
  const allRows = store.list, d0 = dayStart(now);
  const dayRows = allRows.filter((r) => r.t >= d0), fallDay = dayRows.filter((r) => r.dc);
  setRowsProvider(dayRows, d0);
  const inP = p0 <= d0 && p1 > now ? dayRows : dayRows.filter((r) => r.t >= p0 && r.t < p1);
  const fallP = inP === dayRows ? fallDay : inP.filter((r) => r.dc);
  const inE = S.sel ? inP.filter((r) => r.t >= e0 && r.t < e1) : inP;
  const fallE = inE.filter((r) => r.dc);
  const ns = A.nowStats(fallDay, now, cfg.nowMin, lvl, cfg.chuteAlert);
  const isAll = A.getRejectMode() === 'all';

  $('#legend').innerHTML = `<span><i class="lg ok"></i>Peças</span><span><i class="lg bad"></i>${RL()}</span>` +
    (isAll ? '' : '<span><i class="lg warn"></i>Outras exceções</span>') + '<span><i class="lg line"></i>% de rejeito</span><span>▒ parada (sem peças ≥ 10 min)</span>';
  $('#hourlySub').textContent = `${isAll ? 'todas as exceções' : 'Chute block'} por hora · clique numa hora para filtrar`;
  $('#recentTitle').textContent = isAll ? 'Últimos rejeitos (exceções)' : 'Últimos rejeitos (Chute block)';

  alertCheck(ns, cfg);
  renderBinds(now);
  const an = analyze({ events: [...S.devEv.values()], state: S.devState, now, rows: dayRows, dayStart: d0, intermitN: cfg.intermitN });
  renderDevAlert(an, now);
  if (S.view === 'hist') { renderHist($('#viewHist'), { now, cfg, redraw: render }); return; }
  if (S.view === 'alr') { renderAlertas($('#viewAlr'), { now, cfg, redraw: render, openCfg: openCfg2 }); return; }
  if (S.view === 'busca') {
    const ae = document.activeElement; if (ae && ae.closest && ae.closest('#viewBusca') && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return;
    renderBusca($('#viewBusca'), { now, rows: dayRows, an, binds: S.binds, state: S.devState, redraw: render }); return;
  }
  if (S.view === 'dev') { renderDevView(an, dayRows, now); renderDevExtra($('#viewDevX'), { an, now, rows: dayRows, cfg, d0, redraw: render }); return; }
  if (S.view === 'prod') { $('#prTurnos').hidden = $('#prMetas').hidden = prMode() === 'custom'; if (prMode() === 'custom') return; renderMetas($('#prMetas'), { now, cfg, rows: dayRows, an, redraw: render, openCfg: openCfg2 }); renderTurnos($('#prTurnos'), { now, cfg, rows: allRows, redraw: render }); renderProd($('#prLive'), { rows: dayRows, now, dayStart: d0, cfg, outlets: S.outlets }); return; }
  if (S.view === 'sys') {
    renderSystem($('#viewSys'), { cfg, diag: { lastOk: S.lastOk, ms: S.ms, fails: S.fails, err: S.err, renderMs: S.renderMs, rows: store.rows.size }, now, all: dayRows, fall: fallDay, now, d0, binds: S.binds, isRej: A.isRej, rejLabel: RL(), redraw: render,
      goto: (k, v) => { S.vsel[k] = v; setView(k); }, csv: (o) => exportCsvData(o.head, o.rows, o.name) });
    return;
  }
  if (S.view === 'rel') { renderRelatorio($('#viewRel'), { now, cfg, redraw: render }); return; }
  if (S.view === 'rej') {
    renderRej($('#viewRej'), { all: dayRows, now, d0, cfg, rejLabel: RL(), redraw: render, csv: (o) => exportCsvData(o.head, o.rows, o.name) });
    renderRejExtra($('#viewRejX'), { all: dayRows, now, d0, cfg, an, binds: S.binds, state: S.devState, redraw: render });
    $('#foot').textContent = 'Rejeitos: dentro de hoje, análise completa do trace; dias anteriores usam o resumo por hora do sorter. Somente leitura.';
    return;
  }
  if (S.view === 'lay') {
    renderLayers($('#viewLay'), { all: dayRows, now, an, state: S.devState, cfg, redraw: render });
    return;
  }
  const mlay = (rows) => (S.mapLayer ? rows.filter((r) => (r.ly ? r.ly.replace('Layer', 'L') : r.ind <= 6 ? 'L1' : 'L2') === S.mapLayer) : rows);
  if (S.view === 'map') { renderMap($('#mapBody'), { fall: mlay(fallDay), all: mlay(dayRows), now, cfg, dayStart: d0, lvl, an }); return; }
  if (S.view !== 'geral') { renderVw(allRows, fallDay, now, lvl, an); return; }
  renderDevStrip(an, now);
  const stDay = A.stuckStats(dayRows, now, {}, lvl, 20);
  renderBrief($('#brief'), { fall: fallDay, now, ns, st: stDay, cfg, an, binds: S.binds });
  renderHero($('#hero'), { fall: fallDay, now, ns, st: stDay, cfg, rejLabel: RL() });
  renderStations($('#stations'), { fall: fallDay, now, cfg, filter: S.filter, an });
  $('#stSub').textContent = `peças/h nos últimos ${cfg.nowMin} min · clique para filtrar`;
  renderChips();
  renderAlert(ns);
  renderKpis(fallE, inE, ns, now);
  renderCheck(fallE);
  renderInsights(fallE, inE, now, ns);
  renderTimeline(fallP, p0, Math.min(p1, now + 60000), now);
  renderNow(ns, allRows, now);
  renderHourly(fallP);
  renderOffenders(fallE, inE, now);
  renderChuteMap(fallE);
  renderMatrix(fallE);
  renderRecent(inE);
  $('#foot').textContent =
    `Trace do dia: ${fmt(allRows.length)} linhas (${fmt(fallDay.length)} descarregadas) · intervalo analisado ${hhmm(e0)}–${hhmm(Math.min(e1, now))} · ` +
    `contam só peças já descarregadas (mesma regra da tela Summary statistics) · rejeito = ${isAll ? 'todas as exceções' : 'somente Chute block'} · ` +
    `saída = chutelist (saída pretendida); rotas com 2+ saídas aparecem como "A / B".`;
}

function renderDevView(an, dayRows, now) {
  const el = $('#viewDev');
  const keep = [...el.querySelectorAll('.scroll')].map((x) => x.scrollTop);
  renderDevices(el, { an, now, dayStart: dayStart(now), cfg, flt: S.devFlt, insights: deviceInsights(an, now, cfg) });
  el.querySelectorAll('.scroll').forEach((x, i) => { if (keep[i]) x.scrollTop = keep[i]; });
  $('#foot').textContent = 'Equipamentos: estado = tela "sorter state"; eventos = log "device logs" (gravado quando o evento termina; induções paradas/falhas em curso vêm do estado atual). Disponibilidade = 1 − tempo parada ÷ tempo desde a 1ª peça da indução.';
}

function renderDevStrip(an, now) {
  const el = $('#devStrip');
  const bad = an.indsFault.length || an.intermit.length, warn = an.indsStopped.length || an.closed.length;
  el.className = 'card devStrip vg ' + (bad ? 'bad' : warn ? 'warn' : '');
  const carMin = an.carriers.reduce((a, c) => a + c.secs, 0);
  el.setAttribute('data-gotoview', 'dev');
  if (S.devErr && !S.devInit) { el.innerHTML = `<h2>Equipamentos</h2><span class="muted">não foi possível ler o estado dos equipamentos: ${esc(S.devErr)}</span>`; return; }
  const nn = (l) => l.map((x) => String(x.no).padStart(2, '0')).join(', ');
  const tile = (cls, v, lab, sub = '') => `<div class="dst ${cls}"><b>${v}</b><span>${lab}</span><small>${sub || '&nbsp;'}</small></div>`;
  el.innerHTML = `<div class="dsh"><h2>Equipamentos agora</h2>` + (an.intermit.length ? `<span class="dsw">⚠ cortina/sensor oscilando: ind ${nn(an.intermit)}</span>` : '') + `<span class="go">ver equipamentos →</span></div>` +
    `<div class="dsg">` +
    tile('ok', `${an.statusCount.ativa}<em>/${an.inds.length}</em>`, 'induções alimentando', 'recebendo peças agora') +
    tile('', an.statusCount.ociosa, 'ligadas sem peças', 'sem pacote no momento') +
    tile(an.indsStopped.length ? 'warn' : 'ok', an.indsStopped.length, 'induções paradas', an.indsStopped.length ? 'ind ' + nn(an.indsStopped) : 'nenhuma') +
    tile(an.indsFault.length ? 'bad' : 'ok', an.indsFault.length, 'induções em falha', an.indsFault.length ? 'ind ' + nn(an.indsFault) : 'nenhuma') +
    tile(an.closed.length ? 'warn' : '', `${an.closed.length}<em> · ${an.full.length}</em>`, 'saídas fechadas · cheias', 'fechada = fora de uso') +
    tile(an.carriers.length ? 'warn' : 'ok', an.carriers.length, 'carrinhos com falha hoje', `${Math.round(carMin / 60)} min acumulados`) +
    `</div>`;
}

function renderDevAlert(an, now) {
  const el = $('#devAlert');
  const items = [];
  const liveSensor = (no) => [...S.devEv.values()].some((e) => e.grp === 'ind' && e.no === no && ['cortina', 'sensor'].includes(e.kind) && (!e.end || now - e.end <= 120000)); // só oscilação acontecendo agora
  for (const x of an.intermit.filter((y) => liveSensor(y.no))) items.push(`<b>Indução ${String(x.no).padStart(2, '0')}: ${x.intermit.kind} oscilando</b> — ${x.intermit.n} falhas em 30 min. Inspecione/limpe o sensor.`);
  for (const x of an.indsFault) items.push(`<b>Indução ${String(x.no).padStart(2, '0')} em falha:</b> ${esc(KINDS[x.cur.kind].label.toLowerCase())} desde ${hhmm(x.cur.since)}.`);
  const recent = an.crit.filter((e) => (!e.end || now - e.end <= 60000) && !['cortina', 'sensor'].includes(e.kind)).slice(0, 3); // só o que está aberto ou acabou de fechar
  for (const e of recent) items.push(`<b>${esc(KINDS[e.kind].label)} — ${esc(devName(e))}</b> às ${hhmmss(e.start)}${e.end ? ` (${Math.round((e.end - e.start) / 1000)} s)` : ''}.`);
  if (items.length) { el.className = 'alert crit'; el.innerHTML = '<ul>' + items.slice(0, 5).map((t) => `<li>${t}</li>`).join('') + '</ul>'; }
  else el.className = 'alert crit hidden';
}

function renderBinds(now) {
  const L = [...S.binds.values()].sort((a, b) => b.id - a.id);
  const last = L[0];
  const hour = L.filter((r) => now - r.t <= 3600000).length;
  const el = $('#bindAlert');
  const recent = L.filter((r) => now - r.t <= 2 * 60000); // tempo real: só falhas dos últimos 2 min
  if (recent.length) {
    const r = recent[0];
    el.className = 'alert crit';
    el.innerHTML = `<b>Falha ao abrir lote na saída ${esc(r.chute)}${baseOf(r.chute) ? ' (' + esc(baseOf(r.chute)) + ')' : ''}</b> · ${esc(bindText(r))} · lote ${esc(r.bag || '—')} · há ${Math.max(0, Math.round((now - r.t) / 60000))} min` +
      (recent.length > 1 ? ` <span class="muted">(+${recent.length - 1} nos últimos 2 min: saídas ${[...new Set(recent.slice(1).map((x) => x.chute))].slice(0, 6).map(esc).join(', ')})</span>` : '');
  } else el.className = 'alert crit hidden';
  const byCh = new Map();
  for (const r of L) byCh.set(r.chute, (byCh.get(r.chute) || 0) + 1);
  const top = [...byCh].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const lim = S.expandBind ? 100 : 6;
  const rows = L.slice(0, lim).map((r) => { const dx = explainBind(r); return `<tr data-goto="chute|${esc(r.chute)}"><td>${hhmmss(r.t)}</td><td><b>${esc(r.chute)}</b></td><td>${esc(baseOf(r.chute) || '—')}</td><td>${esc(r.code || '—')}</td><td>${esc(r.bag || '—')}</td><td><span class="tag">${esc(bindKindText(dx.kind))}</span> ${esc(dx.why)}</td><td>${esc(r.pc || '—')}</td></tr>`; }).join('');
  const groups = bindGroups(L, now), gl = S.expandBindG ? groups : groups.slice(0, 5);
  const gHtml = groups.length ? `<h3 class="sub">Diagnóstico por saída <small>o que o sorter recusou, para onde o lote pertencia e o que conferir</small></h3><div class="scroll"><table class="bdx"><thead><tr><th>Saída</th><th>Falhas (hoje · última hora)</th><th>Códigos recusados</th><th>Lotes</th><th>A saída aceita (plano)</th><th>Diagnóstico</th><th>O que fazer</th></tr></thead><tbody>` +
    gl.map((g) => { const d = g.diag, acc = d.allowed.slice(0, 5).join(', ') + (d.allowed.length > 5 ? ` +${d.allowed.length - 5}` : '');
      return `<tr data-goto="chute|${esc(g.chute)}"><td><b>${esc(g.chute)}</b><div class="muted sm">${esc(d.base || '—')}</div></td><td><b>${g.n}</b> · ${g.hour}<div class="muted sm">${hhmm(g.first)}–${hhmm(g.last)}</div></td>` +
        `<td>${[...g.codes].map(([c, n]) => `${esc(c)} <span class="muted">×${n}</span>`).join('<br>')}</td>` +
        `<td>${[...g.bags].slice(0, 3).map(([b, n]) => `${esc(b)}${n > 1 ? ` <span class="badt">×${n} repetido</span>` : ''}`).join('<br>') || '—'}${g.pcs.size ? `<div class="muted sm">${[...g.pcs].slice(0, 2).map(esc).join(', ')}</div>` : ''}</td>` +
        `<td>${esc(acc || '— (saída sem códigos no plano)')}${d.etq ? `<div class="muted sm">${esc(d.etqNote)}</div>` : ''}</td>` +
        `<td><span class="tag">${esc(bindKindText(d.kind))}</span><div>${esc(d.why)}</div></td><td>${esc(d.todo)}</td></tr>`; }).join('') +
    `</tbody></table></div>` + (groups.length > 5 ? `<button class="mini more" data-more="bindg">${S.expandBindG ? 'Ver menos' : `Ver todas as saídas (${groups.length})`}</button>` : '') : '';
  const head = `<h2>Falhas ao abrir lote na saída <small>log de operação do sorter · tentativa de vincular o lote à saída recusada</small></h2>`;
  if (S.bindErr && !L.length) { setHTML('#binds', head + `<div class="muted">Não foi possível ler o log de operação: ${esc(S.bindErr)}</div>`); return; }
  setHTML('#binds', head +
    `<div class="bindk"><div class="bst ${L.length ? 'bad' : 'ok'}"><b>${fmt(L.length)}</b><label>falhas hoje</label></div><div class="bst ${hour ? 'bad' : 'ok'}"><b>${fmt(hour)}</b><label>na última hora</label></div>` +
    `<div class="bst"><b>${last ? 'há ' + (now - last.t < 90000 ? Math.round((now - last.t) / 1000) + ' s' : Math.round((now - last.t) / 60000) + ' min') : '—'}</b><label>última falha</label></div>` +
    `<div class="bst bt"><label>Saídas com mais falhas hoje</label><div class="btp">${top.length ? top.map(([c, n]) => `<span class="pill" data-goto="chute|${esc(c)}">${esc(c)} <b>${n}</b></span>`).join('') : '<span class="okt"><b>Nenhuma falha hoje</b></span>'}</div></div></div>` +
    (gHtml + (rows ? `<h3 class="sub">Últimas ocorrências</h3><div class="scroll"><table><thead><tr><th>Hora</th><th>Saída</th><th>Base da saída</th><th>Código de rota do lote</th><th>Lote</th><th>Diagnóstico</th><th>Estação (PC)</th></tr></thead><tbody>${rows}</tbody></table></div>` +
      (L.length > 6 ? `<button class="mini more" data-more="bind">${S.expandBind ? 'Ver menos' : `Ver todas (${L.length})`}</button>` : '') : '')));
}

function renderVw(allRows, fallDay, now, lvl, an) {
  const kind = S.view, d0 = dayStart(now);
  const el = $(kind === 'ind' ? '#viewInd' : '#viewChute');
  const keep = [...el.querySelectorAll('.scroll')].map((x) => x.scrollTop);
  const c = { fall: fallDay, all: allRows.filter((r) => r.t >= d0), now, cfg, win: resolveWin(S.vwWin, now), winRaw: S.vwWin, dayStart: d0, lvl, sel: S.vsel[kind], q: kind === 'chute' ? S.vq : '', qs: kind === 'chute' ? S.vqs : '', sm: S.vsm, smOpen: S.vsmOpen, feedRej: S.feedRej, expand: S.expand.vw, binds: [...S.binds.values()].sort((a, b) => b.id - a.id), an };
  renderEntityView(el, kind, c);
  S.vsel[kind] = c.sel;
  el.querySelectorAll('.scroll').forEach((x, i) => { if (keep[i]) x.scrollTop = keep[i]; });
  $('#foot').textContent = `Aba ao vivo · janela ${winText(S.vwWin, now)} · só peças já descarregadas (igual ao sistema); "sem descarga" = alimentadas há mais de 20 min sem registro de descarga. Os filtros da visão geral não se aplicam a esta aba.`;
}

function renderChips() {
  const f = S.filter, c = [];
  if (S.sel) c.push(`<span class="chip" data-clear="sel">Intervalo ${hhmm(S.sel[0])}–${hhmm(S.sel[1])} ✕</span>`);
  if (f.ind) c.push(`<span class="chip" data-clear="ind">Indução ${f.ind} ✕</span>`);
  if (f.chute) c.push(`<span class="chip" data-clear="chute">Saída ${esc(A.chuteLabel(f.chute))} ✕</span>`);
  if (f.route) c.push(`<span class="chip" data-clear="route">Rota ${esc(f.route)} ✕</span>`);
  if (f.reason) c.push(`<span class="chip" data-clear="reason">${esc(A.reasonLabel(f.reason))} ✕</span>`);
  if (c.length > 1) c.push(`<span class="chip" data-clear="all">Limpar tudo</span>`);
  setHTML('#chips', c.join(''));
}

function renderAlert(ns) {
  const el = $('#alert'), th = cfg.rejectThreshold;
  if (ns.total >= 20 && (ns.rate >= th || ns.activeChutes.length)) {
    const crit = ns.rate >= th * 2;
    el.className = 'alert ' + (crit ? 'crit' : 'warn');
    el.innerHTML = `Últimos ${cfg.nowMin} min: <b>${pct(ns.rej, ns.total)}</b> de rejeito (${fmt(ns.rej)} em ${fmt(ns.total)} peças).` +
      (ns.activeChutes.length ? ` Saídas bloqueando: ${ns.activeChutes.slice(0, 6).map(([c, n]) => `<b>${esc(A.chuteLabel(c))}</b> (${n})`).join(', ')}.` : '');
  } else el.className = 'alert hidden';
}

function kpi(cls, label, val, sub = '', extra = '', num = null) {
  const dn = num === null ? '' : ` data-n="${num}" data-k="${label}"`;
  return `<div class="kpi ${cls}"><label>${label}</label><b${dn}>${val}</b><small>${sub}</small>${extra}</div>`;
}
function renderKpis(fallE, inE, ns, now) {
  const f = S.filter, lvl = cfg.routeLevel, th = cfg.rejectThreshold, hasF = A.hasFilter(f);
  const t = A.kpis(fallE, f, lvl);
  const block = fallE.reduce((a, r) => a + (A.isBlock(r) && A.dimPass(r, f, lvl) ? 1 : 0), 0);
  const rate = t.total ? (t.rej / t.total) * 100 : 0;
  const rc = rate >= th * 2 ? 'bad' : rate >= th ? 'warn' : 'ok';
  const peak = A.peakPerMin(fallE);
  const st = A.stuckStats(inE, now, f, lvl, 20);
  const cl = A.ranking(A.groupBy(fallE, f, lvl, A.chuteKey, 'chute', true), 'count');
  const top = cl[0], clRej = cl.reduce((a, x) => a + x.rej, 0);
  const meter = `<div class="meter" style="--c:var(--${rc === 'ok' ? 'ok' : rc === 'warn' ? 'warn' : 'bad'})"><i style="width:${Math.min(100, (rate / (th * 2)) * 100)}%"></i><u style="left:50%"></u></div>`;
  setHTML('#kpis', [
    kpi('blue', 'Processados', fmt(t.total), hasF ? 'com filtro ativo' : 'peças já descarregadas', '', t.total),
    kpi('bad', RL(), fmt(t.rej), A.getRejectMode() === 'all' ? `${pct(t.rej, t.total)} · Chute block ${fmt(block)}` : `${pct(t.rej, t.total)} do processado`, '', t.rej),
    kpi(rc, 'Taxa de rejeito', pct(t.rej, t.total), `alerta a partir de ${String(th).replace('.', ',')}%`, meter),
    kpi('blue', `Vazão (últ. ${cfg.nowMin} min)`, fmt(Math.round(ns.perHour)), `peças/h · pico ${fmt(peak.n)} peças/min`),
    kpi(st.fed && st.n / st.fed >= 0.01 ? 'warn' : '', 'Sem descarga (> 20 min)', fmt(st.n), `${pct(st.n, st.fed)} do alimentado`),
    kpi('blk', 'Saída que mais bloqueou', top ? (top.key[0] === '(' ? '' : 'Saída ') + esc(A.chuteLabel(top.key)) : '—', top ? `${pct(top.rej, clRej, 0)} dos Chute block · bloqueou ${pct(top.rej, top.total)} das peças dela` : 'sem rejeitos')
  ].join(''));
  animateKpis($('#kpis'));
}

function renderCheck(fallE) {
  const o = S.official, el = $('#check');
  if (S.partial) { el.innerHTML = 'conferência com o sistema após carregar o histórico…'; return; }
  if (!o || A.hasFilter(S.filter)) { el.innerHTML = A.hasFilter(S.filter) ? 'Filtro ativo: conferência com o sistema desligada' : ''; return; }
  const t = A.kpis(fallE, {}, cfg.routeLevel);
  const offTot = +o.sorter_sorttotal;
  const offRej = A.getRejectMode() === 'all' ? +o.sorter_abnormaltotal : +o.sorter_chuteblocktotal;
  const dT = t.total - offTot, dR = t.rej - offRej;
  const ok = Math.abs(dT) <= Math.max(5, offTot * 0.0005) && Math.abs(dR) <= Math.max(3, offRej * 0.01);
  el.innerHTML = ok
    ? `<b class="ok">✓ Confere com o sistema</b> (Summary: ${fmt(offTot)} peças · ${fmt(offRej)} rejeitos${dT || dR ? ` · Δ ${dT} / ${dR}` : ''})`
    : `<b class="warn">⚠ Difere do sistema</b> (trace ${fmt(t.total)} / ${fmt(t.rej)} vs Summary ${fmt(offTot)} / ${fmt(offRej)} · Δ ${dT} / ${dR})`;
}

function renderInsights(fallE, inE, now, ns) {
  const L = buildInsights({ fallen: fallE, all: inE, now, cfg, ns });
  setHTML('#insights', L.map((x) => `<li class="${x.lv}"><span>${x.t}</span></li>`).join(''));
}

// ---------- linha do tempo ----------
function renderTimeline(fallP, p0, p1, now) {
  const span = Math.max(60000, p1 - p0);
  const bm = (cfg.bucketMin || A.autoBucketMin(span)) * 60000;
  const b = A.timeline(fallP, S.filter, cfg.routeLevel, p0, p1, bm);
  const W = 1000, H = 290, ml = 54, mr = 46, mt = 14, mb = 30;
  const iw = W - ml - mr, ih = H - mt - mb, n = b.length, bw = iw / n, base = b[0].t;
  const th = cfg.rejectThreshold;
  const maxV = Math.max(5, ...b.map((x) => x.total));
  const rates = b.map((x) => (x.total ? (x.rej / x.total) * 100 : 0));
  const pmax = Math.max(2, Math.ceil(Math.max(...rates, th * 1.2)));
  const y = (v) => mt + ih - (v / maxV) * ih;
  let s = `<svg id="tlsvg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  for (let i = 0; i <= 4; i++) {
    const yy = y((maxV * i) / 4);
    s += `<line x1="${ml}" x2="${W - mr}" y1="${yy}" y2="${yy}" stroke="var(--line)"/>`;
    s += `<text x="${ml - 7}" y="${yy + 4}" text-anchor="end" fill="var(--muted)" font-size="11">${fmt(Math.round((maxV * i) / 4))}</text>`;
    s += `<text x="${W - mr + 7}" y="${yy + 4}" fill="var(--muted)" font-size="11">${((pmax * i) / 4).toFixed(1).replace('.', ',')}%</text>`;
  }
  for (const g of A.gaps(fallP, 10 * 60000)) {
    const x0 = Math.max(ml, ml + ((g.s - base) / bm) * bw), x1 = Math.min(W - mr, ml + ((g.e - base) / bm) * bw);
    if (x1 - x0 < 2) continue;
    s += `<rect x="${x0}" y="${mt}" width="${x1 - x0}" height="${ih}" fill="var(--line)" opacity=".55" data-tip="${esc(`Parada ${hhmm(g.s)}–${hhmm(g.e)} (${g.min} min sem peças)`)}"/>`;
  }
  const step = Math.ceil(n / 12);
  b.forEach((x, i) => {
    const cx = ml + i * bw, w = Math.max(1, bw - 2);
    const hOk = ((x.total - x.rej - x.other) / maxV) * ih, hOt = (x.other / maxV) * ih, hRj = (x.rej / maxV) * ih;
    s += `<rect x="${cx + 1}" y="${mt + ih - hOk}" width="${w}" height="${hOk}" fill="var(--valid)"/>`;
    s += `<rect x="${cx + 1}" y="${mt + ih - hOk - hOt}" width="${w}" height="${hOt}" fill="var(--warn)"/>`;
    s += `<rect x="${cx + 1}" y="${mt + ih - hOk - hOt - hRj}" width="${w}" height="${hRj}" fill="var(--bad)"/>`;
    if (i % step === 0) s += `<text x="${cx + bw / 2}" y="${H - 9}" text-anchor="middle" fill="var(--muted)" font-size="11">${hhmm(x.t)}</text>`;
  });
  const ty = mt + ih - (th / pmax) * ih;
  s += `<line x1="${ml}" x2="${W - mr}" y1="${ty}" y2="${ty}" stroke="var(--bad)" stroke-dasharray="5 4" opacity=".7"/>`;
  s += `<text x="${W - mr - 4}" y="${ty - 4}" text-anchor="end" fill="var(--bad)" font-size="10.5">alerta ${String(th).replace('.', ',')}%</text>`;
  const pts = b.map((x, i) => `${ml + i * bw + bw / 2},${mt + ih - (rates[i] / pmax) * ih}`).join(' ');
  s += `<polyline points="${pts}" fill="none" stroke="var(--ink)" stroke-width="1.8" stroke-linejoin="round"/>`;
  if (S.sel) {
    const i0 = Math.max(0, Math.floor((S.sel[0] - base) / bm)), i1 = Math.min(n, Math.ceil((S.sel[1] - base) / bm));
    s += `<rect x="${ml + i0 * bw}" y="${mt}" width="${Math.max(2, (i1 - i0) * bw)}" height="${ih}" fill="var(--brand)" opacity=".13" pointer-events="none"/>`;
  }
  s += `<rect id="dragrect" x="0" y="${mt}" width="0" height="${ih}" fill="var(--brand)" opacity=".22" pointer-events="none"/>`;
  b.forEach((x, i) => {
    const tip = `${hhmm(x.t)}–${hhmm(x.t + bm)}\nPeças: ${fmt(x.total)}\n${RL()}: ${fmt(x.rej)} (${pct(x.rej, x.total)})` +
      (A.getRejectMode() === 'all' ? '' : `\nOutras exceções: ${fmt(x.other)}`);
    s += `<rect class="hit" x="${ml + i * bw}" y="${mt}" width="${bw}" height="${ih}" fill="transparent" data-tip="${esc(tip)}"/>`;
  });
  s += '</svg>';
  setHTML('#timeline', s);
  geo = { W, ml, bw, n, buckets: b, bm };
}
function bucketAt(e) {
  const svg = $('#tlsvg');
  if (!svg || !geo) return 0;
  const r = svg.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * geo.W;
  return Math.max(0, Math.min(geo.n - 1, Math.floor((x - geo.ml) / geo.bw)));
}
function drawDrag() {
  const el = $('#dragrect');
  if (!el || !drag) return;
  const a = Math.min(drag.i0, drag.i1), b = Math.max(drag.i0, drag.i1);
  el.setAttribute('x', geo.ml + a * geo.bw);
  el.setAttribute('width', (b - a + 1) * geo.bw);
}

// ---------- agora ----------
function renderNow(ns, allRows, now) {
  $('#nowTitle').textContent = `últimos ${cfg.nowMin} min · peças descarregadas`;
  const th = cfg.rejectThreshold;
  const idle = ns.total < 10;
  const cls = idle ? 'idle' : ns.rate >= th * 2 ? 'crit' : ns.rate >= th ? 'warn' : 'ok';
  const label = { idle: 'SEM FLUXO', crit: 'CRÍTICO', warn: 'ATENÇÃO', ok: 'NORMAL' }[cls];
  const inflight = allRows.filter((r) => !r.dc && r.ex && A.isRej(r) && r.t >= now - cfg.nowMin * 60000).length;
  const pills = (arr, f, hot) => arr.length
    ? arr.map(([k, n]) => `<span class="pill ${hot && n >= cfg.chuteAlert ? 'hot' : ''}" data-f="${f}" data-v="${esc(k)}">${esc(f === 'chute' ? A.chuteLabel(k) : k)} · ${n}</span>`).join('')
    : '<span class="muted">nenhum rejeito</span>';
  setHTML('#now',
    `<span class="pillstate ${cls}">${label}</span>` +
    `<div class="now-rate ${cls}">${idle ? '—' : pct(ns.rej, ns.total)}</div>` +
    `<div class="muted">${fmt(ns.rej)} rejeitos em ${fmt(ns.total)} peças · ${fmt(Math.round(ns.perHour))} peças/h</div>` +
    (inflight ? `<div class="muted" style="margin-top:4px">+${fmt(inflight)} com exceção ainda em trânsito (sem descarga)</div>` : '') +
    `<div class="nowh">Saídas</div>${pills(ns.topChutes, 'chute', true)}` +
    `<div class="nowh">Induções</div>${pills(ns.topInds, 'ind', false)}` +
    `<div class="nowh">Rotas</div>${pills(ns.topRoutes, 'route', false)}`);
}

// ---------- hora a hora ----------
function rateCls(rate) {
  const th = cfg.rejectThreshold;
  return rate >= th * 2 ? 'bad' : rate >= th ? 'warn' : '';
}
function renderHourly(fallP) {
  const H = A.hourly(fallP, S.filter, cfg.routeLevel).filter((g) => g.total > 0);
  S.last.hourly = H;
  if (!H.length) { setHTML('#hourly', '<div class="empty">Sem peças no período.</div>'); return; }
  const maxRej = Math.max(1, ...H.map((g) => g.rej));
  const eligible = H.filter((g) => g.total >= 200 && g.rej >= 5);
  const worst = eligible.length ? eligible.reduce((a, g) => (g.rej / g.total > a.rej / a.total ? g : a)) : null;
  const cur = Math.floor(Date.now() / 3600000) * 3600000;
  const tot = H.reduce((a, g) => ({ total: a.total + g.total, rej: a.rej + g.rej, other: a.other + g.other }), { total: 0, rej: 0, other: 0 });
  const rows = H.map((g) => {
    const rate = g.total ? (g.rej / g.total) * 100 : 0;
    const c = g.topChute, r = g.topRoute, i = g.topInd;
    return `<tr data-hour="${g.t}" class="${S.sel && S.sel[0] === g.t ? 'sel' : ''} ${worst === g ? 'worst' : ''}">` +
      `<td><b>${hhmm(g.t)}</b>${g.t === cur ? ' <span class="muted">agora</span>' : ''}${worst === g ? '<span class="tag">pior hora</span>' : ''}</td>` +
      `<td class="r">${fmt(g.total)}</td><td class="bar"><i style="width:${(g.rej / maxRej) * 100}%"></i><span>${fmt(g.rej)}</span></td>` +
      `<td><span class="rate ${rateCls(rate)}">${pct(g.rej, g.total)}</span></td>` +
      `<td>${c ? `<b>${esc(A.chuteLabel(c[0]))}</b> <span class="muted">(${c[1]})</span>` : '—'}</td>` +
      `<td>${r ? `${esc(r[0])} <span class="muted">(${r[1]})</span>` : '—'}</td>` +
      `<td>${i ? `${i[0]} <span class="muted">(${i[1]})</span>` : '—'}</td></tr>`;
  }).join('');
  setHTML('#hourly', `<div class="scroll"><table><thead><tr><th>Hora</th><th class="r">Processados</th><th>${RL()}</th><th>Taxa</th><th>Saída</th><th>Rota</th><th>Ind.</th></tr></thead><tbody>${rows}` +
    `<tr><td><b>Total</b></td><td class="r"><b>${fmt(tot.total)}</b></td><td><b>${fmt(tot.rej)}</b></td><td><span class="rate ${rateCls(tot.total ? (tot.rej / tot.total) * 100 : 0)}">${pct(tot.rej, tot.total)}</span></td><td colspan="3"></td></tr></tbody></table></div>`);
}

// ---------- ofensores ----------
function offTable(list, labelHead, keyName, labelFn = (k) => k) {
  const lim = S.expand.offenders ? 200 : 10;
  const max = Math.max(1, ...list.map((x) => x.rej)), totRej = list.reduce((a, x) => a + x.rej, 0);
  S.last.offenders = {
    head: [labelHead, 'Rejeitos', 'PctDosRejeitos', 'Pecas', 'Taxa%'],
    rows: list.map((g) => [labelFn(g.key), g.rej, ((g.rej / totRej) * 100).toFixed(1), g.total, ((g.rej / g.total) * 100).toFixed(2)])
  };
  if (!list.length) return '<div class="empty">Sem rejeitos no período/filtro.</div>';
  const rows = list.slice(0, lim).map((g, i) =>
    `<tr data-f="${keyName}" data-v="${esc(g.key)}" class="${S.filter[keyName] === g.key ? 'sel' : ''}"><td>${i + 1}</td><td><b>${esc(labelFn(g.key))}</b></td>` +
    `<td class="bar"><i style="width:${(g.rej / max) * 100}%"></i><span>${fmt(g.rej)}</span></td><td class="r">${pct(g.rej, totRej, 0)}</td>` +
    `<td class="r">${fmt(g.total)}</td><td class="r"><span class="rate ${rateCls((g.rej / g.total) * 100)}">${pct(g.rej, g.total)}</span></td></tr>`).join('');
  return `<div class="scroll"><table><thead><tr><th>#</th><th>${labelHead}</th><th>${RL()}</th><th class="r">% rej.</th><th class="r">Peças</th><th class="r">Taxa</th></tr></thead><tbody>${rows}</tbody></table></div>` +
    (list.length > 10 ? `<button class="mini more" data-more="offenders">${S.expand.offenders ? 'Ver menos' : `Ver todas (${list.length})`}</button>` : '');
}
function renderOffenders(fallE, inE, now) {
  const f = S.filter, lvl = cfg.routeLevel;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  let html = '';
  if (S.tab === 'chutes') {
    html = offTable(A.ranking(A.groupBy(fallE, f, lvl, A.chuteKey, 'chute', true), cfg.sortBy), 'Saída · base', 'chute', (k) => A.chuteLabel(k) + (baseOf(k) ? ' · ' + baseOf(k) : ''));
  } else if (S.tab === 'routes') {
    html = offTable(A.ranking(A.groupBy(fallE, f, lvl, (r) => A.routeKey(r, lvl), 'route'), cfg.sortBy), 'Rota (sortcode)', 'route');
  } else if (S.tab === 'inds') {
    const L = A.byInduction(fallE, f, lvl);
    const f2 = { ...f }; delete f2.ind;
    const st = A.stuckStats(inE, now, f2, lvl, 20);
    const lay = {};
    for (const r of fallE) if (r.ly && !lay[r.ind]) lay[r.ind] = r.ly.replace('Layer', 'L');
    const list = L.slice().sort((a, b) => (cfg.sortBy === 'rate' ? (b.rej / (b.total || 1)) - (a.rej / (a.total || 1)) : b.rej - a.rej));
    const max = Math.max(1, ...list.map((x) => x.rej)), tot = list.reduce((a, x) => a + x.total, 0);
    S.last.offenders = { head: ['Inducao', 'Camada', 'Pecas', 'Rejeitos', 'Taxa%', 'SemDescarga'], rows: list.map((g) => [g.key, lay[g.key] || '', g.total, g.rej, g.total ? ((g.rej / g.total) * 100).toFixed(2) : '0', st.byInd.get(g.key) || 0]) };
    html = `<div class="scroll"><table><thead><tr><th>Indução</th><th>Camada</th><th class="r">Peças</th><th class="r">% do fluxo</th><th>${RL()}</th><th class="r">Taxa</th><th class="r">Sem descarga</th></tr></thead><tbody>` +
      list.map((g) => `<tr data-f="ind" data-v="${g.key}" class="${f.ind === g.key ? 'sel' : ''}"><td><b>${g.key}</b></td><td>${lay[g.key] || '—'}</td><td class="r">${fmt(g.total)}</td><td class="r">${pct(g.total, tot, 1)}</td>` +
        `<td class="bar"><i style="width:${(g.rej / max) * 100}%"></i><span>${fmt(g.rej)}</span></td><td class="r"><span class="rate ${rateCls(g.total ? (g.rej / g.total) * 100 : 0)}">${pct(g.rej, g.total)}</span></td><td class="r">${fmt(st.byInd.get(g.key) || 0)}</td></tr>`).join('') + '</tbody></table></div>';
  } else {
    const E = A.episodes(fallE, f, lvl).filter((e) => e.n >= 3);
    S.last.offenders = { head: ['Saida', 'Inicio', 'Fim', 'DuracaoMin', 'Rejeitos', 'RotaPrincipal', 'Inducao', 'SaidasSimultaneas'], rows: E.map((e) => [A.chuteLabel(e.key), hhmm(e.s), hhmm(e.e), Math.max(1, Math.round((e.e - e.s) / 60000)), e.n, e.topRoute ? e.topRoute[0] : '', e.topInd ? e.topInd[0] : '', e.simul]) };
    const lim = S.expand.offenders ? 200 : 10;
    html = E.length
      ? `<div class="muted" style="margin-bottom:6px">Sequência de rejeitos na mesma saída, separados por mais de 10 min sem rejeito (mínimo 3).</div><div class="scroll"><table><thead><tr><th>Saída</th><th>Início–Fim</th><th class="r">Duração</th><th>${RL()}</th><th>Rota</th><th>Ind.</th></tr></thead><tbody>` +
        E.slice(0, lim).map((e) => `<tr data-f="chute" data-v="${esc(e.key)}"><td><b>${esc(A.chuteLabel(e.key))}</b>${e.simul >= 2 ? `<span class="tag">+${e.simul} saídas juntas</span>` : ''}</td><td>${hhmm(e.s)}–${hhmm(e.e)}</td><td class="r">${Math.max(1, Math.round((e.e - e.s) / 60000))} min</td><td><b>${fmt(e.n)}</b></td><td>${e.topRoute ? esc(e.topRoute[0]) : '—'}</td><td>${e.topInd ? e.topInd[0] : '—'}</td></tr>`).join('') +
        '</tbody></table></div>' + (E.length > 10 ? `<button class="mini more" data-more="offenders">${S.expand.offenders ? 'Ver menos' : `Ver todos (${E.length})`}</button>` : '')
      : '<div class="empty">Nenhum episódio de bloqueio no período/filtro.</div>';
  }
  setHTML('#offenders', html);
}

// ---------- mapa de saídas ----------
function renderChuteMap(fallE) {
  const f = S.filter, lvl = cfg.routeLevel;
  const g = A.groupBy(fallE, f, lvl, A.chuteKey, 'chute', true);
  const set = new Set([...g.keys()].filter((k) => k !== '—' && k !== '(sem saída pretendida)' && !String(k).includes(',')));
  for (const k of PLAN.map.keys()) set.add(k);
  const keys = [...set].sort((a, b) => (+a || 1e9) - (+b || 1e9) || String(a).localeCompare(String(b)));
  const multi = fallE.filter(A.isMulti).length;
  const max = Math.max(1, ...keys.map((k) => (g.get(k) || { rej: 0 }).rej));
  setHTML('#chutemap', `<div class="cmap">` + keys.map((k) => {
    const x = g.get(k) || { rej: 0, total: 0 }, i = x.rej ? Math.max(0.2, x.rej / max) : 0;
    const base = baseOf(k), full = baseOf(k, false), codes = codesOf(k);
    const tip = `Saída ${k}${full ? ' · base ' + full : ''}\n${RL()}: ${fmt(x.rej)} (${pct(x.rej, x.total)})\nPeças pretendidas: ${fmt(x.total)}` +
      (codes.length ? `\nCódigos de rota: ${codes.slice(0, 8).join(', ')}${codes.length > 8 ? '…' : ''}` : '');
    return `<div class="tile ${i >= 0.55 ? 'hot' : ''} ${!x.total ? 'none' : ''} ${f.chute === k ? 'sel' : ''}" style="--i:${i.toFixed(2)}" data-f="chute" data-v="${esc(k)}" data-tip="${esc(tip)}">` +
      `<span class="tn">${esc(k)}${x.rej ? `<b>${x.rej}</b>` : ''}</span><span class="tb">${esc(base || '—')}</span></div>`;
  }).join('') + `</div><div class="scale"><span>0</span><i></i><span>${fmt(max)} rejeitos</span><span style="margin-left:auto">${keys.length} saídas${PLAN.map.size ? ` · base = plano de triagem ativo ${esc(PLAN.code)}` : ' · plano de triagem indisponível'} · rotas com 2+ saídas (${pct(multi, fallE.length, 1)} das peças) ficam fora do mapa</span></div>`);
}

function renderMatrix(fallE) {
  const m = A.matrix(fallE, S.filter, cfg.routeLevel, 6);
  if (!m.cols.length) { setHTML('#matrix', '<div class="empty">Sem rejeitos no período/filtro.</div>'); return; }
  let mx = 1;
  for (const v of m.cells.values()) mx = Math.max(mx, v);
  setHTML('#matrix', `<div class="scroll"><table class="mx"><thead><tr><th>Ind.</th>${m.cols.map((c) => `<th class="r">Saída ${esc(A.chuteLabel(c))}</th>`).join('')}</tr></thead><tbody>` +
    m.inds.map((i) => `<tr><td><b>${i}</b></td>` + m.cols.map((c) => {
      const v = m.cells.get(i + '|' + c) || 0, k = v ? Math.max(0.2, v / mx) : 0;
      return `<td class="c ${k >= 0.55 ? 'hot' : ''}" style="--i:${k.toFixed(2)}" ${v ? `data-cell="${i}|${esc(c)}"` : ''}>${v || ''}</td>`;
    }).join('') + '</tr>').join('') + '</tbody></table></div>');
}

const seenRej = new Set();
let seenInit = false;
function renderRecent(inE) {
  // todos os rejeitos do período, ao vivo; inclui os que ainda estão em trânsito (exceção já gravada, sem descarga)
  const L = A.recent(inE, S.filter, cfg.routeLevel, 5000);
  S.last.recent = L;
  const fresh = new Set();
  for (const r of L) { if (!seenRej.has(r.id)) { seenRej.add(r.id); if (seenInit) fresh.add(r.id); } }
  seenInit = true;
  const transit = L.filter((r) => !r.dc).length;
  const el = $('#recent');
  const sc = el.querySelector('.scroll');
  const top = sc ? sc.scrollTop : 0;
  el.innerHTML = L.length
    ? `<div class="recbar"><b>${fmt(L.length)}</b> rejeitos no período${transit ? ` · <span class="tag">${fmt(transit)} em trânsito (ainda sem descarga)</span>` : ''}<span class="muted"> · atualiza sozinho a cada ciclo; os mais novos ficam no topo e piscam</span></div>` +
      `<div class="scroll rec"><table><thead><tr><th>Alimentação</th><th>Waybill</th><th>Ind.</th><th>Saída · base</th><th>Motivo</th><th>Rota</th><th>Layer</th><th class="r">Peso (kg)</th></tr></thead><tbody>` +
      L.slice(0, S.recMax || 200).map((r) => `<tr class="${fresh.has(r.id) ? 'newrow' : ''} ${r.dc ? '' : 'transit'}"><td>${hhmmss(r.t)}</td><td>${esc(r.wb)}</td><td>${r.ind}</td><td><b>${esc(A.chuteLabel(A.chuteKey(r)))}</b> <span class="muted">${esc(baseOf(A.chuteKey(r)))}</span></td><td>${esc(A.reasonLabel(r.ex))}${r.dc ? '' : ' <span class="muted">(em trânsito)</span>'}</td><td>${esc(r.sc || '—')}</td><td>${esc(r.ly)}</td><td class="r">${r.w.toFixed(2)}</td></tr>`).join('') +
      '</tbody></table>' + (L.length > (S.recMax || 200) ? `<button class="btn" id="recMore" style="margin:8px">Mostrar mais (+500) · exibindo ${fmt(Math.min(L.length, S.recMax || 200))} de ${fmt(L.length)}</button>` : '') + '</div>'
    : '<div class="empty">Sem rejeitos no período/filtro.</div>';
  const sc2 = el.querySelector('.scroll');
  if (sc2) sc2.scrollTop = top;
}

// ---------- interações ----------
document.addEventListener('click', (e) => { if (e.target.id === 'recMore') { S.recMax = (S.recMax || 200) + 500; render(); } });
function toggleFilter(k, v) {
  const val = k === 'ind' ? +v : v;
  if (S.filter[k] === val) delete S.filter[k]; else S.filter[k] = val;
  render();
}
function setView(v) {
  S.view = v;
  $('#main').dataset.view = v;
  document.querySelectorAll('#views button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  render();
}
let vqT = 0;
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!t.matches || !t.matches('[data-vq]')) return;
  S.vq = t.value; clearTimeout(vqT); vqT = setTimeout(render, 90);
});
document.addEventListener('keydown', (e) => {
  const t = e.target, inq = t.matches && t.matches('[data-vq]');
  if (inq && e.key === 'Escape') { S.vq = ''; S.vqs = ''; render(); const i = document.querySelector('[data-vq]'); if (i) i.focus(); return; }
  if (inq && e.key === 'Enter') { e.preventDefault(); const r = document.querySelector('#viewChute tr[data-sel]'); if (r) { const [k, v] = r.dataset.sel.split('|'); S.vsel[k] = v; render(); } return; }
  if (!inq && e.key === '/' && S.view === 'chute' && !/INPUT|TEXTAREA|SELECT/.test(t.tagName || '')) { e.preventDefault(); const i = document.querySelector('[data-vq]'); if (i) i.focus(); }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'mapLayer') { S.mapLayer = t.value; render(); return; }
  if (t.matches('[data-vwwin]')) { S.vwWin = +t.value; render(); }
  else if (t.matches('[data-vwpick]')) { if (t.value) { S.vsel[S.view] = t.value; render(); } }
  else if (t.matches('[data-feedrej]')) { S.feedRej = t.checked; render(); }
  else if (t.matches('[data-devgrp]')) { S.devFlt.grp = t.value; render(); }
  else if (t.matches('[data-devcrit]')) { S.devFlt.crit = t.checked; render(); }
  else if (t.matches('[data-devauto]')) { S.devFlt.auto = t.checked; render(); }
});
document.addEventListener('click', (e) => {
  const t = e.target;
  const smc = t.closest && t.closest('[data-vsm],[data-vsmopen],[data-vsmpng]');
  if (smc) { if ('vsmpng' in smc.dataset) { exportSacaPng(S.vsm); return; } if ('vsmopen' in smc.dataset) S.vsmOpen = !S.vsmOpen; else S.vsm = smc.dataset.vsm; render(); return; }
  const vqc = t.closest && t.closest('[data-vqs],[data-vqclear]');
  if (vqc) { if ('vqclear' in vqc.dataset) S.vq = ''; else S.vqs = vqc.dataset.vqs; render(); const i = document.querySelector('[data-vq]'); if (i && 'vqclear' in vqc.dataset) i.focus(); return; }
  const vb = t.closest('#views [data-view]');
  if (vb) { setView(vb.dataset.view); return; }
  const gv = t.closest('[data-gotoview]');
  if (gv) { setView(gv.dataset.gotoview); return; }
  const sed = t.closest && t.closest('[data-sacaedit]');
  if (sed) { e.preventDefault(); e.stopPropagation(); openSacaEdit(sed.dataset.sacaedit); return; }
  if (t.closest && t.closest('[data-sacaclear]')) { if (confirm('Remover todas as edições manuais de cor de saca e voltar à regra automática?')) clearSacaOv().then(render); return; }
  const gt = t.closest('[data-goto]');
  if (gt) { const [k, v] = gt.dataset.goto.split('|'); S.vsel[k] = v; setView(k); return; }
  const sl = t.closest('[data-sel]');
  if (sl) { const [k, v] = sl.dataset.sel.split('|'); S.vsel[k] = v; if (S.view === 'dev' || S.view === 'prod') { setView(k); return; } render(); return; }
  const clr = t.closest('[data-clear]');
  if (clr) {
    const k = clr.dataset.clear;
    if (k === 'all') { S.filter = {}; S.sel = null; kick(false); return; }
    if (k === 'sel') { S.sel = null; kick(false); return; }
    delete S.filter[k]; render(); return;
  }
  const tab = t.closest('[data-tab]');
  if (tab) { S.tab = tab.dataset.tab; S.expand.offenders = false; render(); return; }
  const more = t.closest('[data-more]');
  if (more) { if (more.dataset.more === 'bind') S.expandBind = !S.expandBind; else if (more.dataset.more === 'bindg') S.expandBindG = !S.expandBindG; else if (more.dataset.more === 'devfeed') S.devFlt.more = !S.devFlt.more; else S.expand[more.dataset.more] = !S.expand[more.dataset.more]; render(); return; }
  const csv = t.closest('[data-csv]');
  if (csv) { exportCsv(csv.dataset.csv); return; }
  const cell = t.closest('[data-cell]');
  if (cell) { const [i, c] = cell.dataset.cell.split('|'); S.filter.ind = +i; S.filter.chute = c; render(); return; }
  const hr = t.closest('[data-hour]');
  if (hr) { const a = +hr.dataset.hour; S.sel = S.sel && S.sel[0] === a ? null : [a, a + 3600000]; kick(false); return; }
  const fl = t.closest('[data-f]');
  if (fl) toggleFilter(fl.dataset.f, fl.dataset.v);
});

const tip = $('#tip');
document.addEventListener('mousemove', (e) => {
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (!el || document.body.classList.contains('hc-on')) { tip.classList.add('hidden'); return; } // com explicações ligadas, o cartão flutuante mostra os dados
  tip.textContent = el.dataset.tip;
  tip.classList.remove('hidden');
  tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 10, e.clientX + 14) + 'px';
  tip.style.top = e.clientY + 16 + 'px';
});

$('#timeline').addEventListener('mousedown', (e) => {
  if (!geo || !e.target.closest('#tlsvg')) return;
  const i = bucketAt(e);
  drag = { i0: i, i1: i };
  drawDrag();
  e.preventDefault();
});
window.addEventListener('mousemove', (e) => { if (drag) { drag.i1 = bucketAt(e); drawDrag(); } });
window.addEventListener('mouseup', () => {
  if (!drag) return;
  const a = Math.min(drag.i0, drag.i1), b = Math.max(drag.i0, drag.i1);
  const t0 = geo.buckets[a].t, t1 = geo.buckets[b].t + geo.bm;
  drag = null;
  S.sel = [t0, t1];
  kick(false);
});

function exportCsv(which) {
  let head = [], rows = [];
  if (which === 'hourly') {
    head = ['Hora', 'Processados', 'Rejeitos', 'Taxa%', 'SaidaOfensora', 'RotaOfensora', 'Inducao'];
    rows = (S.last.hourly || []).map((g) => [hhmm(g.t), g.total, g.rej, g.total ? ((g.rej / g.total) * 100).toFixed(2) : '0', g.topChute ? A.chuteLabel(g.topChute[0]) : '', g.topRoute ? g.topRoute[0] : '', g.topInd ? g.topInd[0] : '']);
  } else if (which === 'offenders') {
    head = (S.last.offenders || {}).head || []; rows = (S.last.offenders || {}).rows || [];
  } else if (which === 'recent') {
    head = ['Alimentacao', 'Waybill', 'Inducao', 'Saida', 'Motivo', 'Sortcode', 'Layer', 'PesoKg'];
    rows = (S.last.recent || []).map((r) => [hhmmss(r.t), r.wb, r.ind, A.chuteLabel(A.chuteKey(r)), r.ex, r.sc, r.ly, r.w]);
  }
  downloadCsv(head, rows, which);
}
function exportCsvData(head, rows, name) { downloadCsv(head, rows, name); }
function downloadCsv(head, rows, name = 'dados') {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [head, ...rows].map((r) => r.map(q).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `sorter_${name}_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------- controles ----------
function syncControls() {
  const p = cfg.period;
  $('#period').value = p.mode === 'last' ? `last:${p.lastMin}` : p.mode;
  $('#sinceTime').value = p.start || '06:00';
  $('#sinceTime').classList.toggle('hidden', p.mode !== 'since');
  $('#refresh').value = String(cfg.refreshSec);
  if (!$('#refresh').value) { $('#refresh').value = '0'; }
  $('#routeLevel').value = String(cfg.routeLevel);
  $('#sortBy').value = cfg.sortBy;
  $('#rejMode').value = cfg.rejectMode;
  document.documentElement.dataset.theme = cfg.theme;
  $('#btnSound').textContent = cfg.sound ? '🔔' : '🔕';
  $('#btnSound').classList.toggle('on', !!cfg.sound);
  A.setRejectMode(cfg.rejectMode);
  applyLook();
}
const PERFIS = {
  operador: ['geral', 'ind', 'chute', 'rej', 'busca', 'map'],
  supervisor: ['geral', 'ind', 'chute', 'rej', 'rel', 'map', 'prod', 'alr', 'busca', 'dev'],
  gerencia: ['geral', 'prod', 'hist', 'rel', 'rej'],
  manutencao: ['geral', 'dev', 'alr', 'sys', 'lay', 'ind', 'map']
};
function applyLook() {
  const root = document.documentElement;
  root.style.fontSize = (+cfg.fontPct && +cfg.fontPct !== 100 ? Math.min(140, Math.max(80, +cfg.fontPct)) : 100) + '%';
  root.dataset.cb = cfg.daltonico ? '1' : '';
  document.body.classList.toggle('lite', !!cfg.lite);
  const allow = PERFIS[cfg.perfil];
  document.querySelectorAll('#views button').forEach((b) => { b.hidden = !!allow && !allow.includes(b.dataset.view); });
  if (allow && !allow.includes(S.view)) setView(allow[0]);
}
function openCfg2(tab) { openConfig(cfg, setCfg, tab || 'metas', () => { kick(false); render(); badge(); }); }
$('#btnMetas').addEventListener('click', () => openCfg2('metas'));
async function setCfg(patch) { cfg = await saveCfg(patch); syncControls(); }

$('#period').addEventListener('change', async (e) => {
  const v = e.target.value;
  const period = v.startsWith('last:') ? { ...cfg.period, mode: 'last', lastMin: +v.split(':')[1] } : { ...cfg.period, mode: v };
  S.sel = null;
  await setCfg({ period });
  kick(false);
});
$('#sinceTime').addEventListener('change', async (e) => { S.sel = null; await setCfg({ period: { ...cfg.period, start: e.target.value || '00:00' } }); kick(false); });
$('#refresh').addEventListener('change', async (e) => { await setCfg({ refreshSec: +e.target.value }); kick(false); });
$('#rejMode').addEventListener('change', async (e) => { S.filter = {}; await setCfg({ rejectMode: e.target.value }); repaintPeriod(); kick(false); });
$('#routeLevel').addEventListener('change', async (e) => { delete S.filter.route; await setCfg({ routeLevel: +e.target.value }); render(); });
$('#sortBy').addEventListener('change', async (e) => { await setCfg({ sortBy: e.target.value }); render(); });
$('#btnSound').addEventListener('click', async () => { enableAudio(); await setCfg({ sound: !cfg.sound }); });
$('#btnTV').addEventListener('click', () => {
  const on = !document.body.classList.contains('tv');
  document.body.classList.toggle('tv', on);
  $('#btnTV').textContent = on ? 'Sair do modo TV' : 'Modo TV';
  if (on) setView('map'); // modo TV: tela cheia fixa no Mapa, sem trocar de aba sozinho
  if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  setTimeout(() => window.dispatchEvent(new Event('resize')), 120);
});
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && document.body.classList.contains('tv')) { document.body.classList.remove('tv'); $('#btnTV').textContent = 'Modo TV'; }
  setTimeout(() => window.dispatchEvent(new Event('resize')), 120);
});
let tvTimer = null;
function tvRotate(on) {
  clearInterval(tvTimer); tvTimer = null;
  return; // rotação de telas desativada: o modo TV fica fixo no Mapa
  // eslint-disable-next-line no-unreachable
  if (!on) return;
  const vs = String(cfg.tvViews || '').split(/[,\s]+/).filter((v) => document.querySelector(`#views [data-view="${v}"]`));
  if (vs.length < 2 || !(+cfg.tvSeg > 0)) return;
  let i = Math.max(0, vs.indexOf(S.view));
  tvTimer = setInterval(() => { i = (i + 1) % vs.length; setView(vs[i]); }, Math.max(5, +cfg.tvSeg) * 1000);
}
$('#btnTV').addEventListener('click', () => tvRotate(document.body.classList.contains('tv')));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tvTimer) tvRotate(false); });
$('#btnSaveHtml').addEventListener('click', () => {
  let css = ''; for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) css += r.cssText + '\n'; } catch (e) { /* folha externa */ } }
  const live = $('#main'), copy = live.cloneNode(true);
  const prune = (l, c) => { // remove da cópia tudo o que está escondido na tela
    const lk = [...l.children], ck = [...c.children];
    lk.forEach((x, i) => { const y = ck[i]; if (!y) return; if (x.tagName === 'SCRIPT' || x.tagName === 'BUTTON' || x.tagName === 'DIALOG' || getComputedStyle(x).display === 'none') y.remove(); else prune(x, y); });
  };
  prune(live, copy);
  copy.querySelectorAll('.scroll').forEach((x) => { x.style.maxHeight = 'none'; });
  const now = new Date().toLocaleString('pt-BR');
  const html = `<!doctype html><html lang="pt-BR" data-theme="${cfg.theme}"><head><meta charset="utf-8"><title>Sorter Monitor — ${now}</title><style>${css}\nmain{padding:16px;max-width:1500px;margin:auto}</style></head><body><main data-view="${S.view}">${copy.innerHTML}</main><p class="muted" style="padding:0 16px 16px;text-align:center">Salvo do Sorter Monitor em ${now} · imagem estática, não atualiza</p></body></html>`;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = `sorter-${S.view}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.html`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
});
$('#btnNow').addEventListener('click', () => kick(false));
$('#btnTheme').addEventListener('click', async () => { await setCfg({ theme: cfg.theme === 'dark' ? 'light' : 'dark' }); render(); });

const dlg = $('#settings');
$('#btnSettings').addEventListener('click', () => {
  const f = $('#settingsForm').elements;
  f.base.value = cfg.base; f.rejectThreshold.value = cfg.rejectThreshold; f.nowMin.value = cfg.nowMin; f.chuteAlert.value = cfg.chuteAlert; f.bucketMin.value = String(cfg.bucketMin); f.notifyBind.checked = cfg.notifyBind !== false; f.notifyDev.checked = cfg.notifyDev !== false; f.intermitN.value = cfg.intermitN; f.metaDia.value = cfg.metaDia; f.retrabSeg.value = cfg.retrabSeg;
  f.turnoT1.value = cfg.turnoT1 || '06:00'; f.turnoT2.value = cfg.turnoT2 || '14:00'; f.turnoT3.value = cfg.turnoT3 || '22:20';
  f.feishuOn.checked = !!cfg.feishuOn; f.feishuUrl.value = cfg.feishuUrl || ''; f.feishuSecret.value = cfg.feishuSecret || ''; f.feishuMeta.value = cfg.feishuMeta || 0; f.feishuMin.value = cfg.feishuMin || 5; f.feishuIni.value = cfg.feishuIni ?? 6; f.feishuFim.value = cfg.feishuFim || 24;
  $('#feishuStatus').textContent = cfg.feishuStatus ? 'Último envio: ' + cfg.feishuStatus : 'Ainda sem envios.';
  $('#settingsMsg').textContent = '';
  dlg.showModal();
});
const turnoForm = () => { const f = $('#settingsForm').elements, ok = (v, d) => (/^\d{1,2}:\d{2}$/.test(v) ? v : d); return { turnoT1: ok(f.turnoT1.value, '06:00'), turnoT2: ok(f.turnoT2.value, '14:00'), turnoT3: ok(f.turnoT3.value, '22:20') }; };
const feishuForm = () => { const f = $('#settingsForm').elements; return { feishuOn: false, feishuUrl: f.feishuUrl.value.trim(), feishuSecret: f.feishuSecret.value.trim(), feishuMeta: Math.max(0, +f.feishuMeta.value || 0), feishuMin: Math.min(30, Math.max(1, +f.feishuMin.value || 5)), feishuIni: Math.min(23, Math.max(0, +f.feishuIni.value || 0)), feishuFim: Math.min(24, Math.max(1, +f.feishuFim.value || 24)) }; };
async function feishuBtn(fn, okMsg) {
  const m = $('#feishuStatus'); m.textContent = 'Enviando…';
  try { await fn({ ...cfg, ...feishuForm(), ...turnoForm() }); m.textContent = okMsg; } catch (e) { m.textContent = '✖ ' + e.message; }
}
$('#feishuTest').addEventListener('click', () => feishuBtn(sendTest, '✔ Mensagem de teste enviada. Confira o grupo.'));
$('#feishuNow').addEventListener('click', () => feishuBtn((c) => sendHour(c, Math.floor(Date.now() / 3600000) * 3600000 - 3600000), '✔ Última hora fechada enviada.'));
$('#settingsCancel').addEventListener('click', () => dlg.close());
$('#settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = $('#settingsForm').elements;
  let base = f.base.value.trim().replace(/\/+$/, '');
  try {
    const origin = new URL(base).origin;
    if (origin !== new URL(cfg.base).origin) {
      const ok = await chrome.permissions.request({ origins: [origin + '/*'] });
      if (!ok) { $('#settingsMsg').textContent = 'Permissão para o novo endereço foi negada.'; return; }
    }
    base = origin;
  } catch (err) { $('#settingsMsg').textContent = 'Endereço inválido.'; return; }
  await setCfg({ base, rejectThreshold: +f.rejectThreshold.value || 3, nowMin: +f.nowMin.value || 15, chuteAlert: +f.chuteAlert.value || 5, bucketMin: +f.bucketMin.value || 0, notifyBind: f.notifyBind.checked, notifyDev: f.notifyDev.checked, intermitN: Math.max(2, +f.intermitN.value || 4), metaDia: Math.max(0, +f.metaDia.value || 0), retrabSeg: Math.max(5, +f.retrabSeg.value || 60), ...feishuForm() });
  dlg.close();
  kick(true);
});

// ---------- início ----------
(async () => {
  cfg = await loadCfg();
  await loadSacaOv();
  syncControls();
  loadHist().catch(() => {}); loadRules().then(badge).catch(() => {});
  initMap(); initTicker();
  initHelp(); initHover();
  initPeriod({ rejMode: () => A.getRejectMode() });
  startClock();
  await kick(true);
  loadSeg().then(() => carregarAlteracoes(true)).catch(() => {}); // de-para automático a partir do histórico do plano
  checkFeishu(); setInterval(checkFeishu, 30000);
  setInterval(() => { if (cfg && S.lastOk) runSchedules(bgCtx(Date.now())).catch(() => {}); }, 30000);
})();


// ---------- edição manual da cor da saca ----------
function openSacaEdit(key) {
  const k = String(parseInt(key, 10)), q = SACA[k]; if (!q) return;
  const auto = q.man ? q.auto : q.c, cur = OV[k] || '';
  let dlg = document.getElementById('sacaDlg'); if (dlg) dlg.remove();
  dlg = document.createElement('dialog'); dlg.id = 'sacaDlg'; dlg.className = 'cfg2 sced';
  const base = baseOf(k) || (q.d && q.d[0]) || '';
  const nome = (c) => (c === 'R' ? 'Vermelha' : 'Verde');
  const opt = (v, t, extra = '') => `<label class="scopt ${cur === v ? 'on' : ''}"><input type="radio" name="sc" value="${v}" ${cur === v ? 'checked' : ''}/> ${t}${extra}</label>`;
  dlg.innerHTML = `<form method="dialog"><h3>Saída ${k.padStart(3, '0')} · cor da saca</h3>` +
    `<div class="muted">${esc(base || 'sem base no plano')}${q.rt && q.rt.length ? ' · rotas obrigatórias: ' + esc(q.rt.join(', ')) : ' · sem rota de saca vermelha obrigatória'}</div>` +
    `<div class="scopts">${opt('', 'Automática', ` <span class="muted">(regra do comunicado: <b>${nome(auto)}</b>)</span>`)}${opt('R', '<span class="scdot R"></span>Vermelha')}${opt('G', '<span class="scdot G"></span>Verde')}</div>` +
    `<div class="muted sm">A edição fica salva neste computador e vale em todas as telas (Mapa, Saídas, PNG e conferência). “Automática” volta à regra.</div>` +
    `<div class="scbtn"><button value="cancel" class="btn">Cancelar</button><button value="ok" class="btn on" id="sacaOk">Salvar</button></div></form>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('close', async () => {
    if (dlg.returnValue === 'ok') { const v = (dlg.querySelector('input[name=sc]:checked') || {}).value || ''; await setSacaOv(k, v); render(); }
    dlg.remove();
  });
  dlg.showModal();
}
