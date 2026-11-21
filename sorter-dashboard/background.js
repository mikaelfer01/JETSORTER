import { loadCfg, summary } from './api.js';
import { fetchBindFails } from './bind.js';
import { checkFeishu } from './feishu.js';
import { fetchEvents, alertsFrom } from './devices.js';

async function openDash() {
  const url = chrome.runtime.getURL('dashboard.html');
  const [tab] = await chrome.tabs.query({ url });
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
}
chrome.action.onClicked.addListener(openDash);
chrome.notifications.onClicked.addListener((id) => { chrome.notifications.clear(id); openDash(); });

function schedule() {
  chrome.alarms.create('badge', { periodInMinutes: 1 });
  chrome.alarms.create('bind', { periodInMinutes: 0.5 });
  chrome.alarms.create('dev', { periodInMinutes: 0.5 });
  chrome.alarms.create('feishu', { periodInMinutes: 1 });
  updateBadge();
  checkBind();
  checkDev();
}
chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'badge') updateBadge();
  if (a.name === 'bind') checkBind();
  if (a.name === 'dev') checkDev();
  if (a.name === 'feishu') checkFeishu();
});

// Badge = % de rejeito do dia (leve: um único GET no resumo, sem abrir abas).
export async function updateBadge() {
  try {
    const cfg = await loadCfg();
    const d0 = new Date();
    d0.setHours(0, 0, 0, 0);
    const res = await summary({ start: d0.getTime(), end: Date.now() + 60000, create: false });
    const r = res.data && res.data[0];
    const tot = r ? Number(r.sorter_sorttotal) : 0;
    const rej = r ? Number(cfg.rejectMode === 'block' ? r.sorter_chuteblocktotal : r.sorter_abnormaltotal) : 0;
    const pct = tot ? (rej / tot) * 100 : 0;
    const text = (pct < 10 ? pct.toFixed(1) : String(Math.round(pct))) + '%';
    const color = pct >= cfg.rejectThreshold * 2 ? '#dc2626' : pct >= cfg.rejectThreshold ? '#d97706' : '#16a34a';
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color });
    await chrome.action.setTitle({ title: `Sorter: ${tot.toLocaleString('pt-BR')} peças hoje, ${rej.toLocaleString('pt-BR')} rejeitos (${pct.toFixed(2)}%)` });
  } catch (e) {
    await chrome.action.setBadgeText({ text: '—' });
    await chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
  }
}

// Aviso de falha ao abrir lote numa saída (log de operação do sorter). Roda mesmo com o dashboard fechado.
export async function checkBind() {
  try {
    const cfg = await loadCfg();
    const rows = await fetchBindFails(100, false);
    const { bindLast } = await chrome.storage.local.get('bindLast');
    const max = rows.reduce((a, r) => Math.max(a, r.id), 0);
    if (bindLast === undefined) { await chrome.storage.local.set({ bindLast: max }); return; } // 1ª execução: não notifica histórico
    const fresh = rows.filter((r) => r.id > bindLast).sort((a, b) => a.id - b.id);
    if (!fresh.length) return;
    await chrome.storage.local.set({ bindLast: max });
    if (cfg.notifyBind === false) return;
    const one = fresh[fresh.length - 1];
    const detail = (r) => `Saída ${r.chute}: ${r.code ? 'código ' + r.code + ' não confere' : r.memo} · lote ${r.bag || '—'}`;
    await chrome.notifications.create('bind-' + one.id, {
      type: 'basic',
      iconUrl: 'icons/128.png',
      title: fresh.length === 1 ? 'Falha ao abrir lote na saída ' + one.chute : `${fresh.length} falhas ao abrir lote (${[...new Set(fresh.map((r) => r.chute))].slice(0, 4).join(', ')})`,
      message: fresh.length === 1 ? detail(one) + (one.pc ? ' · estação ' + one.pc : '') : fresh.slice(-3).map(detail).join('\n'),
      priority: 2,
      requireInteraction: true
    });
  } catch (e) { /* sem sessão/aba do sorter: tenta de novo no próximo ciclo */ }
}

// Alertas de equipamento: falha crítica nova (carrinho, alarme de falha, WCS, CLP...) e cortina/sensor oscilando.
export async function checkDev() {
  try {
    const cfg = await loadCfg();
    const events = await fetchEvents(400, false);
    const { devLast, devSent } = await chrome.storage.local.get(['devLast', 'devSent']);
    const max = events.reduce((a, e) => Math.max(a, e.id), 0);
    const now = Date.now();
    if (devLast === undefined) { await chrome.storage.local.set({ devLast: max, devSent: {} }); return; } // 1ª execução: não notifica histórico
    const sent = { ...(devSent || {}) };
    const list = alertsFrom(events, devLast, now, { intermitN: cfg.intermitN || 4 });
    const out = [];
    for (const a of list) {
      const prev = sent[a.key];
      if (a.intermit) { if (prev && now - prev.t < 3600000 && a.count < prev.n + 3) continue; sent[a.key] = { t: now, n: a.count }; }
      else { if (prev && now - prev.t < 300000) continue; sent[a.key] = { t: now, n: 1 }; }
      out.push(a);
    }
    for (const k of Object.keys(sent)) if (now - sent[k].t > 6 * 3600000) delete sent[k];
    await chrome.storage.local.set({ devLast: max, devSent: sent });
    if (!out.length || cfg.notifyDev === false) return;
    await chrome.notifications.create('dev-' + now, {
      type: 'basic', iconUrl: 'icons/128.png', priority: 2, requireInteraction: true,
      title: out.length === 1 ? out[0].title : `${out.length} alertas de equipamento`,
      message: out.length === 1 ? out[0].msg : out.slice(0, 3).map((a) => a.title).join('\n')
    });
  } catch (e) { /* sem sessão: tenta de novo no próximo ciclo */ }
}
