// Histórico diário guardado pelo painel (o sorter só guarda o dia corrente de trace).
// Fonte: Summary statistics do sorter (totais por hora, por linha) + foto do dia a partir da trace (indução, saída, motivo, rota).
// Somente leitura no sorter; o histórico fica no armazenamento local do app.
import { summary } from './api.js';
import * as A from './analysis.js';
import { dkey, kd, DAY, MIN, HOUR } from './kit.js';

const KEY = 'dayHist';
export const HS = { days: {}, loaded: false, busy: false, err: '', last: 0, today: null, todayAt: 0, prog: '' };

export async function loadHist() {
  if (HS.loaded) return HS;
  try { const o = await chrome.storage.local.get(KEY); HS.days = (o[KEY] && o[KEY].days) || {}; } catch { HS.days = {}; }
  HS.loaded = true;
  return HS;
}
const persist = () => chrome.storage.local.set({ [KEY]: { v: 1, days: HS.days } }).catch(() => {});

// linhas do summary (group 60) → { h:[[tot,abn,blk,l1,l2]×24], totais }
export function rowsToDay(rows) {
  const h = Array.from({ length: 24 }, () => [0, 0, 0, 0, 0]);
  for (const r of rows || []) {
    const m = String(r.timearea || '').match(/(\d{2}):\d{2}:\d{2}/);
    if (!m) continue;
    const i = +m[1];
    h[i][0] += +r.sorter_sorttotal || 0; h[i][1] += +r.sorter_abnormaltotal || 0; h[i][2] += +r.sorter_chuteblocktotal || 0; h[i][3] += +r.ps01_sorttotal || 0; h[i][4] += +r.ps02_sorttotal || 0;
  }
  const t = h.reduce((a, x) => x.map((v, k) => v + a[k]), [0, 0, 0, 0, 0]);
  return { h, tot: t[0], abn: t[1], blk: t[2], l1: t[3], l2: t[4] };
}

async function fetchDay(k, endMs) {
  const s = kd(k);
  const r = await summary({ start: s, end: endMs || s + DAY - 1000, group: 60, create: false });
  return rowsToDay(r.data);
}

// Preenche os últimos 31 dias que faltam e fecha ontem. Chamado ao abrir e a cada 30 min.
export async function syncHistory(now = Date.now(), force = false) {
  await loadHist();
  if (HS.busy || (!force && now - HS.last < 30 * MIN)) return;
  HS.busy = true; HS.err = '';
  try {
    const today = dkey(now), need = [];
    for (let i = 1; i <= 31; i++) { const k = dkey(now - i * DAY), d = HS.days[k]; if (!d || (!d.fin && k !== today)) need.push(k); }
    let n = 0;
    for (let i = 0; i < need.length; i += 3) {
      const part = need.slice(i, i + 3);
      const res = await Promise.all(part.map((k) => fetchDay(k).catch((e) => { HS.err = e.message || String(e); return null; })));
      part.forEach((k, j) => { if (res[j]) { HS.days[k] = { ...(HS.days[k] || {}), ...res[j], fin: true, at: now }; n++; } });
      HS.prog = `${Math.min(i + 3, need.length)}/${need.length}`;
    }
    if (n) await persist();
    HS.last = now;
  } catch (e) { HS.err = e.message || String(e); }
  HS.busy = false; HS.prog = '';
}

// hoje (parcial), com cache de 60 s
export async function getToday(now = Date.now()) {
  if (HS.today && now - HS.todayAt < 60000 && HS.todayDay === dkey(now)) return HS.today;
  const k = dkey(now);
  try { HS.today = await fetchDay(k, now); HS.todayAt = now; HS.todayDay = k; } catch (e) { HS.err = e.message || String(e); }
  return HS.today;
}

// foto da trace do dia (indução, saída, motivo, rota): guardada no mesmo registro do dia
let lastSnap = 0;
export async function snapToday(rows, now = Date.now(), lvl = 2) {
  await loadHist();
  if (!rows || !rows.length || now - lastSnap < 10 * MIN) return;
  lastSnap = now;
  const k = dkey(now), fall = rows.filter((r) => r.dc);
  const ind = {}, indRej = {}, chBlk = {}, ex = {}, rt = {}, chTot = {};
  for (const r of fall) {
    ind[r.ind] = (ind[r.ind] || 0) + 1;
    const c = A.chuteKey(r); chTot[c] = (chTot[c] || 0) + 1;
    if (r.ex) { indRej[r.ind] = (indRej[r.ind] || 0) + 1; ex[r.ex] = (ex[r.ex] || 0) + 1; const q = A.routeKey(r, lvl); rt[q] = (rt[q] || 0) + 1; if (r.ex === A.BLOCK) chBlk[c] = (chBlk[c] || 0) + 1; }
  }
  const top = (o, n) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n));
  HS.days[k] = { ...(HS.days[k] || {}), ind, indRej, chBlk: top(chBlk, 40), chTot: top(chTot, 80), ex, rt: top(rt, 25), snapAt: now };
  await persist();
}

// ---------- consultas ----------
export const dayList = () => Object.keys(HS.days).filter((k) => HS.days[k].h).sort();
export const ap = (d) => (d.tot ? ((d.tot - d.abn) / d.tot) * 100 : 0);
// soma das horas [0, hora) de um dia
export const upTo = (d, hour) => d.h.slice(0, hour).reduce((a, x) => ({ tot: a.tot + x[0], abn: a.abn + x[1], blk: a.blk + x[2] }), { tot: 0, abn: 0, blk: 0 });
export function avgDays(keys) {
  const L = keys.map((k) => HS.days[k]).filter((d) => d && d.h && d.tot > 0);
  if (!L.length) return null;
  const h = Array.from({ length: 24 }, (_, i) => [0, 1, 2, 3, 4].map((j) => L.reduce((a, d) => a + d.h[i][j], 0) / L.length));
  const s = (f) => L.reduce((a, d) => a + f(d), 0) / L.length;
  return { n: L.length, h, tot: s((d) => d.tot), abn: s((d) => d.abn), blk: s((d) => d.blk), l1: s((d) => d.l1), l2: s((d) => d.l2) };
}
export const keysBack = (now, n, skipToday = true, sameWd = false) => {
  const out = [];
  for (let i = skipToday ? 1 : 0; out.length < n && i < 120; i++) { const t = now - i * DAY; if (sameWd && new Date(t).getDay() !== new Date(now).getDay()) continue; out.push(dkey(t)); }
  return out;
};

// turno por hora cheia (aproximação): T1 = [T1h, T2h), T2 = [T2h, T3h), T3 = o resto
export function turnoDaHora(hr, tc) {
  const [a, b, c] = tc.map((m) => Math.floor(m / 60));
  return hr >= a && hr < b ? 'T1' : hr >= b && hr < c ? 'T2' : 'T3';
}

// backup / restauração
export const exportHist = () => ({ v: 1, at: Date.now(), days: HS.days });
export async function importHist(obj) {
  if (!obj || !obj.days || typeof obj.days !== 'object') throw new Error('Arquivo de histórico inválido.');
  let n = 0;
  for (const [k, d] of Object.entries(obj.days)) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && d && Array.isArray(d.h)) { HS.days[k] = d; n++; }
  await persist();
  return n;
}
