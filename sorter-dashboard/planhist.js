// Histórico do plano de triagem. Só lê o sorter.
// 1) Registro automático: a cada leitura do plano ativo, compara com a última foto guardada e anota o que mudou
//    (porta × base × códigos de rota). O sorter não guarda versões antigas, por isso a foto fica no navegador.
// 2) Linha do tempo do log de operações (download / sincronização / ativação), carregada sob demanda.
import { getJson } from './api.js';

const KEY = 'planHist';
const MAXEV = 400;
const p2 = (n) => String(n).padStart(2, '0');
const when = (t) => { const d = new Date(t); return `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const chuteNo = (c) => String(parseInt(c, 10));

export const PH = { hist: null, log: null, logBusy: false, logErr: '', logProg: 0, logAt: 0, actId: undefined, chkAt: 0, chkErr: '', trackAt: 0, trackErr: '' };

export async function planEvents() { const h = await loadStore(); return h.events || []; }
async function loadStore() {
  if (PH.hist) return PH.hist;
  const o = await chrome.storage.local.get(KEY);
  PH.hist = o[KEY] || { snap: null, code: '', act: '', since: 0, events: [] };
  return PH.hist;
}

// rows = linhas do plano ativo (defaultplan === '1'). Chamado por plan.js a cada leitura.
export async function trackPlan(rows) {
  if (!rows || !rows.length) return;
  try {
    const h = await loadStore();
    PH.trackAt = Date.now(); PH.trackErr = '';
    const snap = {};
    for (const x of rows) {
      const k = chuteNo(x.sortingportcode); if (k === 'NaN') continue;
      const e = snap[k] || (snap[k] = { b: [], c: [] });
      const b = String(x.gridname || '').trim(); if (b && !e.b.includes(b)) e.b.push(b);
      for (const c of String(x.threesegmentcode || '').split(/\s+/)) if (c && !e.c.includes(c)) e.c.push(c);
    }
    for (const k in snap) { snap[k].b.sort(); snap[k].c.sort(); }
    const code = rows[0].sortingplancode || '', act = rows[0].defaulttime || '';
    const now = Date.now();
    if (!h.snap) { h.snap = snap; h.code = code; h.act = act; h.since = now; await chrome.storage.local.set({ [KEY]: h }); return; }
    const ev = { t: now, code, act, from: h.code, add: [], del: [], base: [], pAdd: [], pDel: [] };
    const old = h.snap;
    for (const k in snap) {
      if (!old[k]) { ev.pAdd.push([k, snap[k].b.join(' / ')]); continue; }
      const a = snap[k].c.filter((c) => !old[k].c.includes(c)), d = old[k].c.filter((c) => !snap[k].c.includes(c));
      a.forEach((c) => ev.add.push([k, c])); d.forEach((c) => ev.del.push([k, c]));
      if (snap[k].b.join('~') !== old[k].b.join('~')) ev.base.push([k, old[k].b.join(' / '), snap[k].b.join(' / ')]);
    }
    for (const k in old) if (!snap[k]) ev.pDel.push([k, old[k].b.join(' / ')]);
    const changed = ev.add.length || ev.del.length || ev.base.length || ev.pAdd.length || ev.pDel.length || code !== h.code;
    const reactivated = act && act !== h.act;
    if (changed) { h.events.unshift(ev); h.events.length = Math.min(h.events.length, MAXEV); }
    if (changed || reactivated) { h.snap = snap; h.code = code; h.act = act; await chrome.storage.local.set({ [KEY]: h }); }
  } catch (e) { PH.trackErr = (e && e.message) || String(e); }
}

// ---------- log de operações ----------
const KIND = (e) => (/同步/.test(e) ? 'S' : /Download/i.test(e) ? 'D' : /Active|启用/.test(e) ? 'A' : /Refresh|刷新/.test(e) ? 'R' : '');
const KN = { S: 'Sincronização do plano (SCADA)', D: 'Download', A: 'Ativação', R: 'Atualização' };

// O sorter filtra por texto do evento no servidor: busco só os 5 tipos que interessam (poucas páginas) em vez de varrer as ~20 mil linhas do log.
const LOGQ = ['Download', 'Active', 'Refresh', '同步', '启用'];
export async function loadLog(days = 100) {
  if (PH.logBusy) return;
  PH.logBusy = true; PH.logErr = ''; PH.logProg = 0;
  try {
    const cut = new Date(Date.now() - days * 86400000), cutS = `${cut.getFullYear()}-${p2(cut.getMonth() + 1)}-${p2(cut.getDate())}`;
    const seen = new Map();
    await Promise.all(LOGQ.map(async (ev) => {
      for (let pg = 1; pg <= 60; pg += 4) {
        const res = await Promise.all([0, 1, 2, 3].map((i) => getJson('/query/optlogs?action=fetchdata', { method: 'POST', form: { page: pg + i, limit: 50, perPage: 50, event: ev, memo: '', logdate: '' } }).then((j) => j.data || [])));
        let stop = false;
        for (const d of res) { for (const x of d) if (KIND(x.event)) seen.set(x.id, x); if (d.length < 50) stop = true; }
        const all = res.flat(); if (all.length && all[all.length - 1].logdate < cutS) stop = true;
        PH.logProg += res.length;
        if (stop) break;
      }
    }));
    PH.log = [...seen.values()].filter((x) => x.logdate >= cutS).sort((a, b) => (a.logdate < b.logdate ? 1 : -1));
    PH.logAt = Date.now();
  } catch (e) { PH.logErr = e.message || String(e); }
  PH.logBusy = false;
}
// automático: carrega ao abrir a tela e renova a cada 5 min
export function autoLog() { if (!PH.logBusy && (!PH.log || Date.now() - PH.logAt > 5 * 60000)) return loadLog(); }

// Vigia leve (1 consulta/min): se o sorter registrou uma nova ativação de plano, o painel relê o plano na hora e grava a mudança.
export async function newActivation() {
  const now = Date.now();
  if (now - PH.chkAt < 60000) return false;
  PH.chkAt = now;
  try {
    const j = await getJson('/query/optlogs?action=fetchdata', { method: 'POST', form: { page: 1, limit: 1, perPage: 1, event: 'Active', memo: '', logdate: '' } });
    const id = j.data && j.data[0] ? String(j.data[0].id) : '';
    const prev = PH.actId; PH.actId = id; PH.chkErr = '';
    return prev !== undefined && prev !== id;
  } catch (e) { PH.chkErr = (e && e.message) || String(e); return false; }
}

// ---------- tela ----------
export async function renderPlanHist(c) {
  const h = await loadStore();
  const lg = autoLog(); if (lg) lg.then(() => c && c.redraw && c.redraw());
  const evs = h.events;
  const since = h.since ? when(h.since) + '/' + new Date(h.since).getFullYear() : '—';
  const hm = (t) => (t ? when(t) : '—');
  const stat = `<p class="muted sm" style="margin:0 0 8px">Registro automático ${PH.trackErr || PH.chkErr ? '<b class="badt">com erro: ' + esc(PH.trackErr || PH.chkErr) + '</b>' : '<b>ativo</b>'} · último plano lido ${hm(PH.trackAt)} · última checagem de ativação ${hm(PH.chkAt)} · o painel precisa estar aberto para registrar.</p>`;
  let html = `<div class="card" style="margin-bottom:14px"><h2>Mudanças de segmento detectadas <small>foto do plano ${esc(h.code || '—')} guardada desde ${since}; cada leitura é comparada com a anterior</small></h2>` + stat;
  if (!evs.length) html += `<p class="muted">Nenhuma mudança detectada desde que o registro começou. Quando o plano for baixado/ativado com alterações, aparece aqui o que entrou e saiu em cada porta.</p>`;
  else {
    html += `<div class="scroll tall"><table class="bdx"><thead><tr><th>Detectado em</th><th>Plano</th><th>Códigos incluídos (porta ← código)</th><th>Códigos removidos</th><th>Base alterada</th><th>Portas novas / removidas</th></tr></thead><tbody>`;
    for (const e of evs) {
      const l = (a, f) => (a.length ? a.slice(0, 60).map(f).join('<br>') + (a.length > 60 ? `<br>… +${a.length - 60}` : '') : '—');
      html += `<tr><td>${when(e.t)}</td><td>${esc(e.code)}${e.from && e.from !== e.code ? `<div class="muted sm">antes: ${esc(e.from)}</div>` : ''}${e.act ? `<div class="muted sm">ativado ${esc(e.act)}</div>` : ''}</td>` +
        `<td>${l(e.add, (x) => `<b>${esc(x[0])}</b> + ${esc(x[1])}`)}</td><td>${l(e.del, (x) => `<b>${esc(x[0])}</b> − ${esc(x[1])}`)}</td>` +
        `<td>${l(e.base, (x) => `<b>${esc(x[0])}</b>: ${esc(x[1])} → ${esc(x[2])}`)}</td>` +
        `<td>${e.pAdd.length || e.pDel.length ? [...e.pAdd.map((x) => `+ ${esc(x[0])} ${esc(x[1])}`), ...e.pDel.map((x) => `− ${esc(x[0])} ${esc(x[1])}`)].join('<br>') : '—'}</td></tr>`;
    }
    html += `</tbody></table></div>`;
  }
  html += `</div><div class="card"><h2>Log do sistema: downloads, sincronizações e ativações <small>o log só guarda o código do plano e a hora, não o conteúdo</small></h2>`;
  if (!PH.log) {
    html += PH.logBusy || !PH.logErr ? `<p class="muted"><i class="spin"></i> Lendo o log de operações… (${PH.logProg} páginas)</p>` : `<p class="muted">${esc(PH.logErr)}</p><button data-phlog="1" style="width:auto;display:inline-block;padding:6px 14px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:inherit;cursor:pointer;font:inherit">Tentar de novo</button>`;
  } else {
    const n = (k) => PH.log.filter((x) => KIND(x.event) === k).length;
    html += `<p class="muted">${PH.log.length} eventos · ${n('A')} ativações · ${n('D')} downloads · ${n('S')} sincronizações · ${n('R')} atualizações. Mostrando ativações, downloads e sincronizações.</p><div class="scroll tall"><table class="bdx"><thead><tr><th>Data/hora</th><th>Evento</th><th>Plano</th></tr></thead><tbody>` +
      PH.log.filter((x) => KIND(x.event) !== 'R').map((x) => `<tr><td>${esc(x.logdate.slice(8, 10) + '/' + x.logdate.slice(5, 7) + ' ' + x.logdate.slice(11, 16))}</td><td>${KN[KIND(x.event)]}</td><td>${esc((String(x.memo || '').match(/\d{5}-\d{3}-\d/) || [''])[0])}</td></tr>`).join('') + `</tbody></table></div>`;
  }
  return html + `</div>`;
}
