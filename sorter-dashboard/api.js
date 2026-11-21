// Camada de acesso aos dados do sistema do sorter (mesmos endpoints que as telas usam).
// Transporte 1 (direct): fetch a partir da própria extensão (host_permissions).
// Transporte 2 (tab): se o direct falhar (cookie/sessão/CSRF), executa o fetch dentro de uma aba do sorter.

import { DEF2 } from './config2.js';

export const DEFAULTS = {
  ...DEF2,
  base: 'http://10.1.164.9',
  refreshSec: 2, // tempo real: ciclo leve a cada 2 s (consultas em paralelo)
  rejectMode: 'all', // 'all' = todas as exceções (padrão) | 'block' = somente Chute block
  rejectThreshold: 3, // % de rejeito que dispara alerta
  nowMin: 60, // janela do painel "Agora" (foco hora a hora: 60 min)
  chuteAlert: 5, // rejeitos na janela para marcar saída como ofensora ativa
  theme: 'light',
  period: { mode: 'today', start: '06:00', lastMin: 120 },
  bucketMin: 0, // 0 = automático
  routeLevel: 2,
  sortBy: 'count',
  metaDia: 0, // meta de peças do dia (0 = sem meta)
  retrabSeg: 60, // segundos de tratamento manual por rejeito (estimativa)
  sound: false,
  notifyDev: true, // notificação para falhas de equipamento
  intermitN: 4, // falhas de cortina/sensor em 30 min na mesma indução => "oscilando"
  turnoT1: '06:00', turnoT2: '14:00', turnoT3: '22:20',
  feishuOn: false, feishuUrl: '', feishuSecret: '', feishuMeta: 0, feishuLista: true, feishuMin: 5, feishuIni: 6, feishuFim: 24, feishuLast: 0, feishuStatus: '',
  mobUrl: 'https://sorter-mapa-contagem.vercel.app', mobKey: 'Nwb5wFSJz1T1L93n_zhK27v2', // Mapa no celular (já configurado)
  notifyBind: true // notificação do Chrome quando falhar abertura de lote na saída
};

export async function loadCfg() {
  const { cfg } = await chrome.storage.local.get('cfg');
  const c = { ...(cfg || {}) };
  if (c.v === 3 && +c.nowMin === 15) { c.nowMin = 60; c.v = 4; chrome.storage.local.set({ cfg: c }); } // migração: foco hora a hora
  if (c.v !== 3 && c.v !== 4) { c.v = 3; c.theme = 'light'; c.refreshSec = Math.min(+c.refreshSec || 2, 2); chrome.storage.local.set({ cfg: c }); } // migração: tema claro e atualização a cada 2 s
  const out = { ...DEFAULTS, ...c, period: { ...DEFAULTS.period, ...(c.period || {}) } };
  if (!out.mobUrl) out.mobUrl = DEFAULTS.mobUrl; if (!out.mobKey) out.mobKey = DEFAULTS.mobKey; // campo vazio volta ao padrão
  return out;
}

export async function saveCfg(patch) {
  const cur = await loadCfg();
  const next = { ...cur, ...patch };
  await chrome.storage.local.set({ cfg: next });
  return next;
}

let mode = 'direct';
let token = null;
let tokenP = null;
export const transport = () => mode;

const enc = encodeURIComponent;
const pad = (n) => String(n).padStart(2, '0');

// Formato que as telas do sorter enviam: 2026-11-5 06:00:00 (mês/dia sem zero à esquerda)
export function fmtQ(ms, secs = true) {
  const d = new Date(ms);
  const s = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return secs ? `${s}:${pad(d.getSeconds())}` : s;
}

function waitTabLoad(tabId, ms = 20000) {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpd);
      resolve();
    }
    function onUpd(id, info) {
      if (id === tabId && info.status === 'complete') done();
    }
    chrome.tabs.onUpdated.addListener(onUpd);
    chrome.tabs.get(tabId).then((t) => { if (t.status === 'complete') done(); }).catch(done);
  });
}

async function sorterTab(base, create) {
  const origin = new URL(base).origin;
  const [t] = await chrome.tabs.query({ url: origin + '/*' });
  if (t) return t.id;
  if (!create) throw new Error('Nenhuma aba do sorter aberta');
  const nt = await chrome.tabs.create({ url: origin + '/home', active: false, pinned: true });
  await waitTabLoad(nt.id);
  return nt.id;
}

async function viaTab(base, path, init, create) {
  const tabId = await sorterTab(base, create);
  const [out] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (url, opts) => {
      const r = await fetch(url, { credentials: 'same-origin', ...opts });
      return { status: r.status, text: await r.text() };
    },
    args: [base + path, init]
  });
  return out.result;
}

async function viaDirect(base, path, init) {
  // modo aplicativo: passa pelo proxy local (mantém cookie/CSRF do sorter e evita CORS)
  const px = typeof window !== 'undefined' && window.SORTER_PROXY;
  const r = px
    ? await fetch(px + path, { ...init, headers: { ...(init.headers || {}), 'x-sorter-base': base } })
    : await fetch(base + path, { credentials: 'include', ...init });
  return { status: r.status, text: await r.text() };
}

async function send(base, path, init, create) {
  if (mode === 'direct') {
    try {
      return await viaDirect(base, path, init);
    } catch (e) {
      if (typeof window !== 'undefined' && window.SORTER_PROXY) throw Object.assign(new Error('Sem conexão com o aplicativo local (' + (e && e.message ? e.message : e) + ')'), { fatal: true });
      mode = 'tab';
      token = null;
    }
  }
  return viaTab(base, path, init, create);
}

async function getToken(base, create) {
  if (token) return token;
  if (!tokenP) {
    tokenP = (async () => {
      const r = await send(base, '/query/trace', { method: 'GET' }, create);
      if (r.status === 401 || r.status === 502) {
        let msg = ''; try { msg = JSON.parse(r.text).msg; } catch (e) { /* sem json */ }
        throw Object.assign(new Error(msg || 'Sem acesso ao sorter (HTTP ' + r.status + ')'), { fatal: true });
      }
      const m =
        r.text.match(/name=["']_token["'][^>]*?value=["']([^"']+)["']/) ||
        r.text.match(/value=["']([^"']+)["'][^>]*?name=["']_token["']/) ||
        r.text.match(/name=["']csrf-token["'][^>]*?content=["']([^"']+)["']/);
      if (!m) throw new Error('Token CSRF não encontrado na página do sorter');
      token = m[1];
      return token;
    })();
    tokenP.then(() => { tokenP = null; }, () => { tokenP = null; });
  }
  return tokenP;
}

// Diagnóstico: latência e falhas por endpoint (tela Sistema › Diagnóstico)
export const DIAG = {};
export async function getJson(path, opts = {}) {
  const k = String(path).split('?')[0] + (/action=/.test(path) ? '' : ''), d = DIAG[k] || (DIAG[k] = { n: 0, err: 0, ms: 0, max: 0, last: 0, lastErr: 0, msg: '' });
  const t0 = performance.now();
  try { const j = await getJson0(path, opts); const ms = performance.now() - t0; d.n++; d.ms += ms; d.max = Math.max(d.max, ms); d.last = Date.now(); d.lastMs = ms; return j; }
  catch (e) { d.n++; d.err++; d.lastErr = Date.now(); d.msg = e && e.message ? e.message : String(e); throw e; }
}
async function getJson0(path, { method = 'GET', form = null, create = true } = {}) {
  const cfg = await loadCfg();
  const base = cfg.base.replace(/\/+$/, '');
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const init = { method, headers: { 'X-Requested-With': 'XMLHttpRequest' } };
      if (method === 'POST') {
        const tk = await getToken(base, create);
        init.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
        init.body = new URLSearchParams({ ...form, _token: tk }).toString();
      }
      const r = await send(base, path, init, create);
      let j = null;
      try { j = JSON.parse(r.text); } catch (e) { j = null; }
      if (j && (j.code === 1 || Array.isArray(j.data))) return j;
      if (typeof window !== 'undefined' && window.SORTER_PROXY && j && j.msg && (r.status === 401 || r.status === 502)) throw Object.assign(new Error(j.msg), { status: r.status, fatal: true });
      throw Object.assign(new Error(`Resposta inválida do sorter (HTTP ${r.status})`), { status: r.status });
    } catch (e) {
      lastErr = e;
      token = null;
      if (e && e.fatal) break; // aplicativo: sem login/sem rede — não adianta tentar de novo nem usar aba
      if (typeof window !== 'undefined' && window.SORTER_PROXY) { if (attempt >= 1) break; }
      else if (mode === 'direct') mode = 'tab';
      else if (attempt >= 1) break;
    }
  }
  throw lastErr;
}

// ---- Endpoints ----
export const summary = ({ start, end, group = 0, induction = 0, layer = 0, create = true }) =>
  getJson(
    `/statis/summary.data?page=1&limit=1000&start=${enc(fmtQ(start))}&end=${enc(fmtQ(end))}` +
      `&group=${group}&inductionno=${induction}&layerno=${layer}`,
    { create }
  );

export const byChute = ({ start, end }) =>
  getJson(`/statis/bychute?page=1&limit=3000&start=${enc(fmtQ(start, false))}&end=${enc(fmtQ(end, false))}`);

// Trace sem filtro: rápida e ordenada do mais novo para o mais antigo (filtros no servidor fazem varredura pesada).
export async function fetchTrace(page, perPage) {
  const j = await getJson('/query/trace?action=fetchdata', {
    method: 'POST',
    form: {
      page, perPage, advanced_query: 0, waybillno: '', gongtime: '', dischargetime: '',
      dischargechute: '', trayno: '', inductionno: '', containerno: '', exception: '', srflag: -1
    }
  });
  return { data: j.data || [], count: j.count || 0 };
}
