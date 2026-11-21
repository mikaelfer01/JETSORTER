// Envio automático da produtividade hora a hora para um grupo do Feishu (bot personalizado / webhook).
// Somente LEITURA no sorter (usa /statis/summary.data); o único POST de saída vai para o webhook do Feishu.
import { loadCfg, saveCfg, summary, fetchTrace, getJson, fmtQ } from './api.js';
import { compact } from './store.js';
import { reasonLabel, chuteKey, chuteLabel, routeKey } from './analysis.js';
import { PLAN } from './plan.js';

const HOUR = 3600000;
const p2 = (n) => String(n).padStart(2, '0');
const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
const dec = (n, d = 1) => Number(n).toFixed(d).replace('.', ',');
const hh = (ms) => p2(new Date(ms).getHours()) + 'h';

async function sign(secret, ts) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(`${ts}\n${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new Uint8Array(0));
  let s = ''; new Uint8Array(sig).forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s);
}

const okHost = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && /(^|\.)(feishu\.cn|larksuite\.com)$/.test(x.hostname); } catch (e) { return false; } };

export async function postFeishu(cfg, payload) {
  if (!okHost(cfg.feishuUrl)) throw new Error('URL do webhook inválida (precisa ser https://open.feishu.cn/open-apis/bot/v2/hook/…)');
  const body = { ...payload };
  if (cfg.feishuSecret) { const ts = String(Math.floor(Date.now() / 1000)); body.timestamp = ts; body.sign = await sign(cfg.feishuSecret, ts); }
  let r;
  if (typeof window !== 'undefined' && window.SORTER_PROXY) r = await fetch('/__feishu', { method: 'POST', headers: { 'content-type': 'application/json', 'x-feishu-url': cfg.feishuUrl }, body: JSON.stringify(body) });
  else r = await fetch(cfg.feishuUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch (e) { /* sem json */ }
  // O Feishu pode responder HTTP 200 com erro no corpo: o que vale é code === 0.
  if (!r.ok || !j || (j.code !== 0 && j.StatusCode !== 0)) throw new Error('Feishu recusou: ' + (j ? (j.msg || j.StatusMessage || JSON.stringify(j)) : 'HTTP ' + r.status));
  return j;
}

const sumRows = (rows) => (rows || []).reduce((a, r) => { a.tot += +r.sorter_sorttotal || 0; a.exc += +r.sorter_abnormaltotal || 0; a.abn += +r.sorter_abnormaltotal || 0; a.blk += +r.sorter_chuteblocktotal || 0; a.a += +r.ps01_sorttotal || 0; a.b += +r.ps02_sorttotal || 0; return a; }, { tot: 0, exc: 0, abn: 0, blk: 0, a: 0, b: 0 });

const parseArea = (t) => { const m = /(\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{2}):(\d{2})/.exec(String(t || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], 0, 0).getTime() : NaN; };

// Números da hora fechada [h, h+1h), do acumulado do dia e da série hora a hora do dia.
let cfgRota = 2;
export async function hourData(h, cfg) {
  cfgRota = (cfg && +cfg.routeLevel) || 2;
  const d0 = new Date(h); d0.setHours(0, 0, 0, 0);
  const fim = Math.max(Date.now(), h + HOUR);
  const [day, outl] = await Promise.all([
    summary({ start: d0.getTime(), end: fim, group: 60, create: false }),
    getJson('/statis/outlets', { method: 'POST', form: { start: fmtQ(d0.getTime()), end: fmtQ(fim), group: 60, page: 1, limit: 5000 } }).catch(() => ({ data: [] }))
  ]);
  const by = new Map();
  for (const r of day.data || []) {
    const k = parseArea(r.timearea); if (!Number.isFinite(k)) continue;
    const x = by.get(k) || { h: k, tot: 0, abn: 0, blk: 0, a: 0, b: 0 }; const t = sumRows([r]);
    x.tot += t.tot; x.abn += t.abn; x.blk += t.blk; x.a += t.a; x.b += t.b; by.set(k, x);
  }
  const all = [...by.values()].sort((a, b) => a.h - b.h);
  while (all.length && all[0].tot === 0 && all[0].h < h) all.shift(); // horas sem operação no começo do dia não entram nos gráficos
  const horas = all.filter((x) => x.h <= h);              // horas fechadas até a do relatório
  const parc = all.find((x) => x.h > h) || null;           // hora em andamento (se o relatório não for dela)
  const z = { tot: 0, abn: 0, blk: 0, a: 0, b: 0 };
  const temLinhas = (day.data || []).some((r) => r.ps01_sorttotal != null || r.ps02_sorttotal != null);
  // produção por linha de indução: total da hora do relatório e do dia até agora
  const ind = {};
  for (const r of outl.data || []) {
    const k = parseArea(r.timearea); if (!Number.isFinite(k)) continue;
    for (let i = 1; i <= 40; i++) { const v = +r['total_' + i]; if (!v) continue; const o = ind[i] || (ind[i] = { n: i, hora: 0, dia: 0 }); o.dia += v; if (k === h) o.hora += v; }
  }
  const linhas = Object.values(ind).sort((a, b) => a.n - b.n);
  return { horas, hora: by.get(h) || z, ant: by.get(h - HOUR) || z, dia: sumRows(horas.map((x) => ({ sorter_sorttotal: x.tot, sorter_abnormaltotal: x.abn, sorter_chuteblocktotal: x.blk, ps01_sorttotal: x.a, ps02_sorttotal: x.b }))), agora: sumRows(day.data), parc, linhas, temLinhas, todas: all, geradoEm: Date.now(), pareto: await paretoHour(h, cfgRota).catch(() => null) };
}

// Rejeitos da hora por motivo / saída pretendida / indução. A trace vem do mais novo para o mais antigo (sem filtro no servidor):
// lê só as páginas necessárias para cobrir [h, h+1h).
let PROV = null; // o painel entrega as linhas do dia que já tem em memória (evita reler a trace)
export const setRowsProvider = (rows, d0) => { PROV = rows ? { rows, d0 } : null; };

export function paretoFrom(rows, lvl) {
  // rejeito = TODAS as exceções (Chute block, Intercept, sem plano, sem sortcode, cancelado...), segmentadas por motivo.
  // Saída ofensora = só Chute block (as demais exceções não dependem da saída pretendida).
  const rej = rows.filter((r) => r.ex), blk = rej.filter((r) => r.ex === 'Chute block');
  const rank = (list, keyf) => { const m = new Map(); for (const r of list) { const k = keyf(r); if (k) m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]); };
  return { total: rows.length, rej: rej.length, blk: blk.length, outras: rej.length - blk.length,
    motivo: rank(rej, (r) => reasonLabel(r.ex)), saida: rank(blk, (r) => chuteLabel(chuteKey(r))), ind: rank(rej, (r) => (r.ind ? 'Ind ' + p2(r.ind) : '')), rota: rank(rej, (r) => routeKey(r, lvl)),
    indBlk: rank(blk, (r) => (r.ind ? 'Ind ' + p2(r.ind) : '')), lista: rej, hm: horaMotivo(rej), semPlano: semPlanoDe(rej), porErro: porErroDe(rej, lvl) };
}

// Pareto POR TIPO DE ERRO: para cada motivo (Chute block, Intercept, Sem plano, Sem sortcode...), as rotas, induções e (no Chute block) saídas que mais aparecem.
function porErroDe(rej, lvl) {
  const by = new Map(); for (const r of rej) { const k = reasonLabel(r.ex); (by.get(k) || by.set(k, []).get(k)).push(r); }
  const rank = (list, f) => { const m = new Map(); for (const r of list) { const k = f(r); if (k) m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]); };
  return [...by].map(([motivo, L]) => ({ motivo, n: L.length, rota: rank(L, (r) => routeKey(r, lvl)), ind: rank(L, (r) => (r.ind ? 'Ind ' + p2(r.ind) : '')), saida: /Chute block/.test(motivo) ? rank(L, (r) => chuteLabel(chuteKey(r))) : [] }))
    .sort((a, b) => (/Chute block/.test(a.motivo) ? -1 : /Chute block/.test(b.motivo) ? 1 : b.n - a.n));
}

// Rejeitos por hora × motivo (alimenta o gráfico empilhado e o texto ao passar o mouse).
function horaMotivo(rej) {
  const m = new Map();
  for (const r of rej) { const h = new Date(r.t).setMinutes(0, 0, 0), k = h + '|' + reasonLabel(r.ex); m.set(k, (m.get(k) || 0) + 1); }
  return [...m].map(([k, n]) => { const i = k.indexOf('|'); return { h: +k.slice(0, i), motivo: k.slice(i + 1), n }; });
}
export const tipoNaHora = (pa, h) => { const L = pa && pa.hm ? pa.hm.filter((x) => x.h === h).sort((a, b) => b.n - a.n) : []; return L.length ? L.map((x) => `${x.motivo}: ${fmt(x.n)}`).join(' · ') : ''; };

// Bases/rotas com FALTA DE PLANO: peças com exceção 996 (a rota não existe no plano ativo) e 995 (sem sortcode).
// sortcode = "UF,segmento,sub". O plano ativo é consultado para dizer em qual base o segmento existe e com quais prefixos.
const PREFIXOS_PLANO = (c) => !/-\d\d$/.test(c);
function semPlanoDe(rej) {
  const m = new Map(); let semCode = 0;
  for (const r of rej) {
    if (/995/.test(r.ex)) { semCode++; continue; }
    if (!/996/.test(r.ex)) continue;
    const p = String(r.sc || '').split(',').map((x) => x.trim()), uf = p[0] || '?', seg = p[1] || '(sem segmento)', k = uf + '|' + seg;
    const o = m.get(k) || { n: 0, subs: new Set() }; o.n++; if (p[2]) o.subs.add(p[2]); m.set(k, o);
  }
  const lista = [...m].map(([k, { n, subs }]) => {
    const [uf, seg] = k.split('|'), bases = new Set(), pref = new Set(), saidas = new Set();
    for (const [ch, e] of PLAN.map || []) for (const w of e.rows || []) if (w.codes.includes(seg)) { if (w.name) bases.add(w.name); saidas.add(ch); w.codes.filter(PREFIXOS_PLANO).forEach((c) => pref.add(c)); }
    return { uf, seg, n, subs: [...subs].slice(0, 3), bases: [...bases], saidas: [...saidas], pref: [...pref] };
  }).sort((a, b) => b.n - a.n);
  return { lista, semCode, total: lista.reduce((a, x) => a + x.n, 0) + semCode };
}
export function paretosErroMd(pa, escopo, n = 8) {
  if (!pa || !pa.porErro || !pa.porErro.length) return '';
  return `**PARETOS POR TIPO DE ERRO (${escopo})** — para cada erro, o que mais pesa (barra · quantidade · % do erro · % acumulado)\n\n` + pa.porErro.map((e) => {
    const dims = [e.saida.length ? paretoMd(pa, '↳ Saídas', e.saida, n) : '', e.rota.length ? paretoMd(pa, '↳ Rotas', e.rota, n) : '', e.ind.length ? paretoMd(pa, '↳ Induções', e.ind, n) : ''].filter(Boolean).join('\n');
    return `${/Chute block/.test(e.motivo) ? '⛔' : '▫️'} **${e.motivo}** — ${fmt(e.n)} rejeito(s) (${dec((e.n / (pa.rej || 1)) * 100, 0)}% dos rejeitos)\n${dims}`;
  }).join('\n\n');
}
// Campo de mensagem claro com as bases com falta de plano.
export function planoMd(pa, escopo) {
  const sp = pa && pa.semPlano;
  if (!sp || !sp.total) return `**✅ FALTA DE PLANO ${escopo}:** nenhuma peça rejeitada por falta de plano (996) ou sem sortcode (995).`;
  const L = sp.lista.slice(0, 10).map((x) => {
    const base = x.bases.length ? x.bases.join(' / ') : 'base não encontrada no plano ativo';
    const tem = x.pref.includes(x.uf);
    const onde = !x.bases.length ? ' · segmento não cadastrado em nenhuma saída'
      : tem ? ` · o segmento existe na saída ${x.saidas.join(', ')} (prefixos ${x.pref.join(', ')}), mas a combinação recebida não tem linha${x.subs.length ? ' — confira o sub-código ' + x.subs.join(', ') : ''}`
      : ` · existe no plano na saída ${x.saidas.join(', ')} com prefixo ${x.pref.length ? x.pref.join(', ') : '—'} → falta o prefixo **${x.uf}**`;
    return `• **${base}** — segmento **${x.seg}** (origem ${x.uf}): **${fmt(x.n)}** peça(s)${onde}`;
  });
  return `**⚠ BASES COM FALTA DE PLANO ${escopo}** — ${fmt(sp.total - sp.semCode)} peça(s) em ${fmt(sp.lista.length)} segmento(s) sem destino no plano ativo${PLAN && PLAN.code ? ' ' + PLAN.code : ''}\n` + L.join('\n') + (sp.lista.length > 10 ? `\n… +${sp.lista.length - 10} outros segmentos` : '') +
    (sp.semCode ? `\n• **Sem sortcode (995):** ${fmt(sp.semCode)} peça(s) — sem base identificável (etiqueta não lida/sem código)` : '') + `\n_O plano precisa de uma linha com o segmento e o prefixo de origem indicados._`;
}

async function paretoHour(h, lvl) {
  if (PROV && PROV.d0 <= h) {
    const rows = PROV.rows.filter((r) => r.t >= PROV.d0);
    return { ...paretoFrom(rows.filter((r) => r.t >= h && r.t < h + HOUR), lvl), parcial: false, dia: paretoFrom(rows, lvl) };
  }
  const rows = []; let parcial = true;
  for (let page = 1; page <= 20; page++) {
    const { data } = await fetchTrace(page, 1000);
    if (!data.length) break;
    let oldest = Infinity;
    for (const d of data) { const r = compact(d); oldest = Math.min(oldest, r.t); if (r.t >= h && r.t < h + HOUR) rows.push(r); }
    if (oldest < h) { parcial = false; break; }
  }
  return { ...paretoFrom(rows, lvl), parcial, dia: null };
}

// Confere a trace (por peça) com o Resumo do sorter: se divergirem, avisa em vez de mostrar número "bonito" porém errado.
export function paretoNota(pa, abnResumo) {
  if (!pa) return '';
  if (pa.parcial) return 'Atenção: a leitura da trace não cobriu a hora inteira; o Pareto pode estar incompleto.';
  const dif = Math.abs(pa.rej - abnResumo), ref = Math.max(abnResumo, 1);
  return dif / ref > 0.1 && dif > 5 ? `Atenção: a trace tem ${fmt(pa.rej)} rejeitos e o Resumo do sorter ${fmt(abnResumo)} (peças ainda em trânsito ou exceções lançadas depois). O Pareto usa a trace.` : '';
}
// TODOS os rejeitos segmentados por motivo (Chute block incluído, sempre primeiro e em destaque), com % dos rejeitos e % das peças.
const motivoIcon = (k) => (/Chute block/.test(k) ? '⛔' : '▫️');
export function segMd(pa, titulo) {
  if (!pa || !pa.rej) return `**${titulo}**\nSem rejeitos.`;
  const lista = pa.motivo.slice().sort((a, b) => (/Chute block/.test(a[0]) ? -1 : /Chute block/.test(b[0]) ? 1 : b[1] - a[1]));
  const max = Math.max(...lista.map((x) => x[1]), 1);
  return `**${titulo}** — ${fmt(pa.rej)} rejeitos (${dec((pa.rej / (pa.total || 1)) * 100, 2)}% das ${fmt(pa.total)} peças)\n` +
    lista.map(([k, v]) => `${motivoIcon(k)} ${bar(v, max, 10)} ${k} — **${fmt(v)}** (${dec((v / pa.rej) * 100, 0)}% dos rejeitos · ${dec((v / (pa.total || 1)) * 100, 2)}% das peças)`).join('\n') +
    `\n_Chute block: ${fmt(pa.blk)} · demais exceções: ${fmt(pa.outras)}_`;
}
function paretoMd(pa, titulo, lista, n = 5) {
  const tot = lista.reduce((a, x) => a + x[1], 0); let ac = 0;
  return `**${titulo}**\n` + lista.slice(0, n).map(([k, v]) => { ac += v; return `${bar(v, lista[0][1], 10)} ${k} — ${fmt(v)} (${dec((v / tot) * 100, 0)}% · acum. ${dec((ac / tot) * 100, 0)}%)`; }).join('\n') + (lista.length > n ? `\n… +${lista.length - n} outros (${fmt(lista.slice(n).reduce((a, x) => a + x[1], 0))})` : '');
}
const bar = (v, max, n = 12) => { const f = max ? Math.round((v / max) * n) : 0; return '█'.repeat(f) + '░'.repeat(n - f); };

const grade24 = (d) => { const m = new Map((d.todas || []).map((x) => [new Date(x.h).getHours(), x])); return Array.from({ length: 24 }, (_, hr) => ({ hr, hora: p2(hr), ...(m.get(hr) || { tot: 0, abn: 0, blk: 0, a: 0, b: 0 }) })); };

function partes(cfg, h, d) {
  const meta = +cfg.feishuMeta || 0, lim = +cfg.rejectThreshold || 3;
  const atg = meta ? (d.hora.tot / meta) * 100 : null;
  const pc = (a, b) => (b ? (a / b) * 100 : 0);
  const aprov = (x) => pc(x.tot - x.abn, x.tot);                       // aproveitamento = (processado − rejeito) ÷ processado
  const aprH = aprov(d.hora), aprDia = aprov(d.agora);
  const cor = atg != null ? (atg >= 100 ? 'green' : atg >= 80 ? 'orange' : 'red') : aprH >= 100 - lim ? 'blue' : 'red';
  const rej = pc(d.hora.abn, d.hora.tot);
  const delta = d.ant.tot ? pc(d.hora.tot - d.ant.tot, d.ant.tot) : null;
  const hs = d.horas.filter((x) => x.tot > 0);
  const media = hs.length ? d.dia.tot / hs.length : 0;
  const melhor = hs.reduce((m, x) => (!m || x.tot > m.tot ? x : m), null);
  const pior = hs.length > 1 ? hs.reduce((m, x) => (!m || x.tot < m.tot ? x : m), null) : null;
  const menorAp = hs.reduce((m, x) => (!m || aprov(x) < aprov(m) ? x : m), null);
  const fim = +cfg.feishuFim || 24, restam = Math.max(0, fim - (new Date(h).getHours() + 1));
  const proj = d.dia.tot + media * restam;
  const agoraT = new Date(d.geradoEm || Date.now());
  const G = grade24(d), max = Math.max(meta, ...G.map((x) => x.tot), 1);
  const serie = G.filter((x) => x.tot > 0).map((x) => {
    const ic = !meta ? '' : x.tot >= meta ? '🟢' : x.tot >= meta * 0.8 ? '🟠' : '🔴';
    return `${p2(x.hr)}h ${bar(x.tot, max)} ${fmt(x.tot)} · aproveit. ${dec(aprov(x))}%${d.temLinhas ? ` · A ${fmt(x.a)} / B ${fmt(x.b)}` : ''} ${ic}${x.hr === new Date(h).getHours() ? ' ◀' : ''}${new Date(d.parc ? d.parc.h : 0).getHours() === x.hr && d.parc ? ' (em andamento)' : ''}`;
  }).join('\n');
  const maxI = Math.max(1, ...d.linhas.map((x) => x.dia)), totI = d.linhas.reduce((a, x) => a + x.dia, 0);
  const rejInd = new Map((d.pareto && d.pareto.ind || []).map(([k, v]) => [k, v]));
  const linhasInd = d.linhas.length ? d.linhas.map((x) => `Ind ${p2(x.n)} ${bar(x.dia, maxI, 10)} hora ${fmt(x.hora)} · dia ${fmt(x.dia)} (${dec(pc(x.dia, totI), 0)}%)` + (rejInd.get('Ind ' + p2(x.n)) ? ` · ${fmt(rejInd.get('Ind ' + p2(x.n)))} rej. na hora` : '')).join('\n') : 'Sem dados por indução agora.';
  const pa = d.pareto && d.pareto.rej ? d.pareto : null, pd = pa && pa.dia && pa.dia.rej ? pa.dia : pa;
  const escopo = pa && pa.dia ? 'do dia' : 'da hora';
  const nota = pa ? paretoNota(pa, d.hora.abn) : '';
  const ofensoras = pd ? `**ROTA OFENSORA ${escopo}:** ${pd.rota[0] ? `${pd.rota[0][0]} com ${fmt(pd.rota[0][1])} pacotes` : '—'}  _(${fmt(pd.rota.length)} rotas · ${fmt(pd.rej)} pacotes rejeitados)_\n**SAÍDA OFENSORA ${escopo}:** ${pd.saida[0] ? `${pd.saida[0][0]} com ${fmt(pd.saida[0][1])} pacotes` : '—'}  _(${fmt(pd.saida.length)} saídas · ${fmt(pd.saida.reduce((a, x) => a + x[1], 0))} pacotes em Chute block)_` : '';
  const linhaDia = d.temLinhas && d.agora.a + d.agora.b ? `Linha A (L1): ${fmt(d.agora.a)} (${dec(pc(d.agora.a, d.agora.a + d.agora.b), 0)}%) · Linha B (L2): ${fmt(d.agora.b)} (${dec(pc(d.agora.b, d.agora.a + d.agora.b), 0)}%)` : '';
  const divL = d.temLinhas && Math.abs(d.agora.a + d.agora.b - d.agora.tot) > Math.max(5, d.agora.tot * 0.02) ? `Atenção: Linha A + Linha B (${fmt(d.agora.a + d.agora.b)}) não bate com o total do Resumo (${fmt(d.agora.tot)}).` : '';
  const analise = [
    `• Aproveitamento da hora: ${dec(aprH)}% (${fmt(d.hora.tot - d.hora.abn)} aproveitadas de ${fmt(d.hora.tot)}) · do dia: ${dec(aprDia)}%`,
    menorAp ? `• Menor aproveitamento do dia: ${hh(menorAp.h)} com ${dec(aprov(menorAp))}%` : null,
    delta == null ? null : `• Tendência: ${delta >= 0 ? '▲' : '▼'} ${dec(Math.abs(delta))}% vs hora anterior (${fmt(d.ant.tot)})`,
    melhor ? `• Melhor hora: ${hh(melhor.h)} com ${fmt(melhor.tot)}` : null,
    pior ? `• Pior hora: ${hh(pior.h)} com ${fmt(pior.tot)}` : null,
    `• Média do dia: ${fmt(Math.round(media))}/h em ${hs.length} h`,
    restam ? `• Projeção até ${p2(fim % 24)}h (mantendo a média): ${fmt(Math.round(proj))} peças` + (+cfg.metaDia ? ` (${dec(pc(proj, cfg.metaDia), 0)}% da meta do dia)` : '') : null,
    linhaDia ? `• ${linhaDia}` : null,
    rej > lim ? `• ⚠ Rejeitos da hora (${dec(rej)}%, todas as exceções) acima do limite de ${dec(lim)}%` : `• Rejeitos da hora (${dec(rej)}%, todas as exceções) dentro do limite de ${dec(lim)}%`,
    `• Da hora: Chute block ${fmt(d.hora.blk)} (${dec(pc(d.hora.blk, d.hora.tot), 2)}% das peças) + demais exceções ${fmt(Math.max(0, d.hora.abn - d.hora.blk))} (${dec(pc(Math.max(0, d.hora.abn - d.hora.blk), d.hora.tot), 2)}%)`,
    pa && pa.motivo.length ? `• Maior motivo de rejeito da hora: ${pa.motivo[0][0]} (${dec(pc(pa.motivo[0][1], pa.rej), 0)}% dos ${fmt(pa.rej)} rejeitos)` : null,
    pd && pd.rota[0] ? `• Rota com mais rejeitos ${escopo}: ${pd.rota[0][0]} (${dec(pc(pd.rota[0][1], pd.rej), 0)}% de todos os rejeitos) — confira o plano/etiqueta dessa rota` : null,
    pd && pd.saida[0] ? `• Saída ofensora ${escopo}: ${pd.saida[0][0]} (${fmt(pd.saida[0][1])} em Chute block) — esvaziar/trocar saco` : null,
    d.hora.blk ? `• Saída bloqueando: ${fmt(d.hora.blk)} ocorrência(s) na hora` : null
  ].filter(Boolean).join('\n');
  // Pareto com % acumulado no próprio rótulo (efeito Pareto visível sem linha extra)
  const par = (arr, f = (k) => String(k)) => { const tot = arr.reduce((a, x) => a + x[1], 0) || 1; let ac = 0; return arr.slice(0, 10).map(([k, v]) => { ac += v; return { item: `${f(k)} · ${Math.round((ac / tot) * 100)}%`, pecas: v }; }); };
  const topS = par(pd ? pd.saida : []), topR = par(pd ? pd.rota : []), topI = par(pd ? pd.ind : []);
  const dRej = G.filter((x) => x.tot > 0).flatMap((x) => [{ hora: x.hora, serie: 'Rejeitos (todos) %', v: +pc(x.abn, x.tot).toFixed(1) }, { hora: x.hora, serie: 'Chute block %', v: +pc(x.blk, x.tot).toFixed(1) }, { hora: x.hora, serie: 'Limite %', v: lim }]);
  return {
    cor, atg, meta, rej, titulo: `Sorter Contagem · ${hh(h)} às ${hh(h + HOUR)}`,
    kpis: [['Processado na hora', fmt(d.hora.tot)], ['Aproveitamento', dec(aprH) + '%'], ['Rejeitos (todos)', fmt(d.hora.abn) + ' · ' + dec(rej) + '%'], ['Chute block', fmt(d.hora.blk) + ' · ' + dec(pc(d.hora.blk, d.hora.tot)) + '%'], ...(meta ? [[`Meta ${fmt(meta)}/h`, dec(atg) + '%']] : [])],
    acum: `**Processado até agora (${p2(agoraT.getHours())}:${p2(agoraT.getMinutes())}):** ${fmt(d.agora.tot)} peças · aproveitado ${fmt(d.agora.tot - d.agora.abn)} (${dec(aprDia)}%) · rejeitos ${fmt(d.agora.abn)} (Chute block ${fmt(d.agora.blk)} · demais ${fmt(Math.max(0, d.agora.abn - d.agora.blk))})` + (+cfg.metaDia ? ` · ${dec(pc(d.agora.tot, cfg.metaDia))}% da meta do dia (${fmt(cfg.metaDia)})` : '') + `\n**Fechado até ${hh(h + HOUR)}:** ${fmt(d.dia.tot)} peças` + (linhaDia ? `\n${linhaDia}` : ''),
    ofensoras, serie, serieTit: '**Hora a hora do dia**' + (meta ? ' (🟢 ≥ meta · 🟠 ≥ 80% · 🔴 abaixo)' : ''), serieNota: '_◀ marca a hora deste relatório. Aproveitamento = (processado − rejeito) ÷ processado._',
    linhas: linhasInd, linhasTit: `**Produção por indução** (hora ${hh(h)} e total do dia)`, divL,
    msgPlano: planoMd(d.pareto, 'DA HORA') + (d.pareto && d.pareto.dia ? '\n\n' + planoMd(d.pareto.dia, 'DO DIA (acumulado)') : ''),
    dTipo: (() => { const hm = d.pareto ? (d.pareto.dia || d.pareto).hm || [] : []; return hm.map((x) => ({ hora: p2(new Date(x.h).getHours()), tipo: x.motivo, rejeitos: x.n })).sort((a, b) => a.hora.localeCompare(b.hora)); })(),
    paretosErro: (() => { const n = cfg && cfg.__compact ? 5 : 8, pr = d.pareto; if (!pr) return ''; const a = paretosErroMd(pr, 'DA HORA ' + hh(h), n), b = pr.dia && !(cfg && cfg.__compact) ? paretosErroMd(pr.dia, 'DO DIA (acumulado)', n) : ''; return [a, b].filter(Boolean).join('\n\n━━━━━━━━━━\n\n'); })(),
    segHora: segMd(d.pareto, 'REJEITOS DA HORA ' + hh(h) + ' · por motivo'), segDia: d.pareto && d.pareto.dia ? segMd(d.pareto.dia, 'REJEITOS DO DIA · por motivo') : '',
    pareto: pa ? { tit: `**Pareto dos rejeitos da hora** (${fmt(pa.rej)} rejeitos em ${fmt(pa.total)} peças lidas)\n_Como ler: os itens do topo são os que mais pesam; 'acum.' é a soma até aquele item. Atacar os 2–3 primeiros resolve a maior parte do problema._` + (nota ? '\n⚠ ' + nota : ''), motivo: segMd(pa, 'Por motivo'), saida: pa.saida.length ? paretoMd(pa, 'Saídas com Chute block (hora)', pa.saida) : '', ind: pa.ind.length ? paretoMd(pa, 'Induções que mais rejeitaram (hora)', pa.ind) : '' } : null,
    analise,
    dHH: G.flatMap((x) => [{ hora: x.hora, serie: 'Processado', v: x.tot }, { hora: x.hora, serie: 'Aproveitado', v: x.tot - x.abn }]),
    dLinha: G.flatMap((x) => [{ hora: x.hora, linha: 'Linha B (L2)', pecas: x.b }, { hora: x.hora, linha: 'Linha A (L1)', pecas: x.a }]),
    dAprov: G.filter((x) => x.tot > 0).map((x) => ({ hora: x.hora, pct: +aprov(x).toFixed(1) })),
    dSaida: topS, dRota: topR, dInd: topI, dRej, escopo,
    expl: {
      hh: '_Barras = peças processadas na hora; linha = peças aproveitadas (processado − rejeito). Quanto mais distantes, mais rejeito naquela hora._',
      linha: '_Produção de cada linha por hora (Linha A = camada L1, Linha B = camada L2). Barras muito desiguais indicam carga mal distribuída ou uma linha com problema._' + (d.temLinhas ? '' : ' (o sorter não devolveu a divisão por linha agora)'),
      aprov: '_Aproveitamento por hora = (processado − rejeito) ÷ processado. Abaixo de ' + dec(100 - lim, 0) + '% (limite de rejeito ' + dec(lim, 0) + '%) merece atenção._',
      rej: '_Barras = % de rejeitos (todas as exceções) por hora; linha "Chute block %" = só a parte de saída bloqueada; linha "Limite %" = ' + dec(lim, 0) + '%. Barra acima do limite = hora fora do limite._',
      saida: '_Pareto das saídas com Chute block ' + escopo + ': a barra mais alta é a saída ofensora (cheia/bloqueada). Ataque primeiro as primeiras barras._'
    }
  };
}

// Cartão clássico (texto + barras em caracteres): aceito por qualquer webhook.
export function buildCard(cfg, h, d) {
  const P = partes(cfg, h, d), md = (c) => ({ tag: 'div', text: { tag: 'lark_md', content: c } });
  const kpi = ([t, v]) => ({ tag: 'column', width: 'weighted', weight: 1, elements: [md(`${t}\n**${v}**`)] });
  return { msg_type: 'interactive', card: { header: { template: P.cor, title: { tag: 'plain_text', content: P.titulo } }, elements: [
    { tag: 'column_set', flex_mode: 'none', background_style: 'grey', columns: P.kpis.map(kpi) },
    md(P.acum), { tag: 'column_set', flex_mode: 'none', background_style: 'grey', columns: [{ tag: 'column', width: 'weighted', weight: 1, elements: [md(P.msgPlano)] }] }, { tag: 'hr' }, md(P.segHora), ...(P.segDia ? [md(P.segDia)] : []), ...(P.ofensoras ? [{ tag: 'hr' }, md(P.ofensoras)] : []), { tag: 'hr' }, md(P.serieTit + '\n' + P.serie + '\n' + P.serieNota), { tag: 'hr' }, md(P.linhasTit + '\n' + P.linhas),
    ...(P.pareto ? [{ tag: 'hr' }, md(P.pareto.tit), ...(P.pareto.saida ? [md(P.pareto.saida)] : []), ...(P.pareto.ind ? [md(P.pareto.ind)] : [])] : []),
    ...(P.paretosErro ? [{ tag: 'hr' }, md(P.paretosErro)] : []),
    { tag: 'hr' }, md('**Análise**\n' + P.analise + (P.divL ? '\n⚠ ' + P.divL : '')),
    { tag: 'note', elements: [{ tag: 'plain_text', content: 'Sorter Monitor · dados lidos do sistema do sorter' }] }] } };
}

// Cartão 2.0 com gráficos (componente "chart" do Feishu), no mesmo layout do relatório H/H: processado × aproveitado,
// produção por linha (A/B empilhado), aproveitamento por hora e Pareto por saída. Se o Feishu recusar, sendHour usa o clássico.
export function buildCardV2(cfg, h, d) {
  const P = partes(cfg, h, d), md = (c) => ({ tag: 'markdown', content: c });
  const kpi = ([t, v]) => ({ tag: 'column', width: 'weighted', weight: 1, elements: [md(`${t}\n**${v}**`)] });
  const ch = (spec) => ({ tag: 'chart', aspect_ratio: '16:9', chart_spec: spec });
  const tit = (t) => ({ visible: true, text: t });
  const cHH = ch({ type: 'common', title: tit('H/H PRODUÇÃO · processado × aproveitado'), data: [{ id: 'b', values: P.dHH.filter((x) => x.serie === 'Processado') }, { id: 'l', values: P.dHH.filter((x) => x.serie === 'Aproveitado') }],
    series: [{ type: 'bar', dataIndex: 0, seriesField: 'serie', xField: 'hora', yField: 'v', label: { visible: true } }, { type: 'line', dataIndex: 1, seriesField: 'serie', xField: 'hora', yField: 'v', label: { visible: false }, point: { visible: true } }],
    axes: [{ orient: 'left', seriesIndex: [0, 1] }, { orient: 'bottom', seriesIndex: [0, 1] }], legends: { visible: true, orient: 'top' } });
  const cLin = ch({ type: 'bar', title: tit('PRODUÇÃO POR LINHA'), data: [{ values: P.dLinha }], xField: 'hora', yField: 'pecas', seriesField: 'linha', stack: true, label: { visible: false }, legends: { visible: true, orient: 'top' } });
  const cApr = ch({ type: 'line', title: tit('APROVEITAMENTO (%)'), data: [{ values: P.dAprov }], xField: 'hora', yField: 'pct', point: { visible: true }, label: { visible: true }, axes: [{ orient: 'left', min: 0, max: 100 }] });
  const cRej = ch({ type: 'common', title: tit('REJEITOS POR HORA (%) · todos × Chute block × limite'), data: [{ id: 'r', values: P.dRej.filter((x) => x.serie === 'Rejeitos (todos) %') }, { id: 'm', values: P.dRej.filter((x) => x.serie !== 'Rejeitos (todos) %') }],
    series: [{ type: 'bar', dataIndex: 0, seriesField: 'serie', xField: 'hora', yField: 'v', label: { visible: true } }, { type: 'line', dataIndex: 1, seriesField: 'serie', xField: 'hora', yField: 'v', label: { visible: false }, point: { visible: false } }],
    axes: [{ orient: 'left', seriesIndex: [0, 1] }, { orient: 'bottom', seriesIndex: [0, 1] }], legends: { visible: true, orient: 'top' } });
  const cTipo = ch({ type: 'bar', title: tit('REJEITOS POR HORA · por tipo (passe o mouse)'), data: [{ values: P.dTipo }], xField: 'hora', yField: 'rejeitos', seriesField: 'tipo', stack: true, label: { visible: false }, legends: { visible: true, orient: 'top' }, tooltip: { visible: true }, axes: [{ orient: 'left' }, { orient: 'bottom' }] });
  // Pareto em barras horizontais (rótulos longos não se sobrepõem); o % acumulado vai no rótulo de cada item
  const pareto = (titulo, data) => ({ tag: 'chart', aspect_ratio: '4:3', chart_spec: { type: 'bar', direction: 'horizontal', title: tit(titulo), data: [{ values: data }], xField: 'pecas', yField: 'item', label: { visible: true }, bar: { style: { fill: '#e60012' } }, axes: [{ orient: 'left', type: 'band', inverse: true }] } });
  const sec = (t) => md(`**${t}**`);
  return { msg_type: 'interactive', card: { schema: '2.0', config: { update_multi: true }, header: { template: P.cor, title: { tag: 'plain_text', content: P.titulo } }, body: { elements: [
    { tag: 'column_set', flex_mode: 'none', background_style: 'grey', columns: P.kpis.map(kpi) },
    md(P.acum), { tag: 'column_set', flex_mode: 'none', background_style: 'grey', columns: [{ tag: 'column', width: 'weighted', weight: 1, elements: [md(P.msgPlano)] }] }, ...(P.ofensoras ? [{ tag: 'hr' }, md(P.ofensoras)] : []), { tag: 'hr' },
    sec('📦 PRODUÇÃO'), cHH, md(P.expl.hh),
    ...(d.temLinhas ? [cLin, md(P.expl.linha + (P.divL ? '\n⚠ ' + P.divL : ''))] : []),
    { tag: 'hr' }, sec('⛔ REJEITOS (todos) · segmentados por motivo, com Chute block'), cRej, md(P.expl.rej), ...(P.dTipo.length ? [cTipo, md('_Cada cor = um tipo de rejeito (Chute block, Intercept, Sem plano, Sem sortcode…). Passe o mouse sobre a barra para ver a quantidade de cada tipo naquela hora._')] : []), md(P.segHora), ...(P.segDia ? [md(P.segDia)] : []),
    ...(P.pareto ? [md(P.pareto.tit.split('\n')[0])] : []),
    ...(P.dSaida.length ? [pareto(`PARETO · SAÍDA (${P.escopo})`, P.dSaida), md(P.expl.saida)] : []),
    ...(P.dRota.length ? [md('**Rotas com mais rejeitos (' + P.escopo + ')**\n' + P.dRota.slice(0, 8).map((x) => `• ${x.item} — ${fmt(x.pecas)}`).join('\n') + '\n_Rótulo = rota · % acumulado._')] : []),
    ...(P.paretosErro ? [{ tag: 'hr' }, md(P.paretosErro)] : []),
    ...(P.pareto && P.pareto.ind ? [md(P.pareto.ind)] : []), // o Feishu recomenda no máximo 5 gráficos por cartão
    ...(P.pareto && P.pareto.tit.includes('⚠') ? [md('⚠ ' + P.pareto.tit.split('⚠ ')[1])] : []),
    { tag: 'hr' }, sec('🧭 DETALHES'), md(P.linhasTit + '\n' + P.linhas),
    { tag: 'collapsible_panel', expanded: false, header: { title: { tag: 'plain_text', content: 'Hora a hora em texto' } }, elements: [md(P.serie + '\n' + P.serieNota)] },
    { tag: 'hr' }, md('**Análise**\n' + P.analise), md('<font color="grey">Sorter Monitor · dados lidos do sistema do sorter</font>')] } } };
}

// Tenta o cartão com gráficos; se o Feishu recusar, envia o clássico (nunca deixa de reportar a hora).
// LISTA COMPLETA, 1 por 1: cada peça rejeitada da hora (horário, waybill, motivo, indução, saída pretendida → onde caiu, rota).
// Vai em mensagens separadas (o cartão do Feishu aceita ~30 KB): LINHAS_POR_MSG por mensagem, na ordem em que ocorreram.
const LINHAS_POR_MSG = 150, MAX_MSGS = 25;
export const ULT = { lista: 0, partes: 0, cortado: 0 };
const hms = (t) => { const x = new Date(t); return `${p2(x.getHours())}:${p2(x.getMinutes())}:${p2(x.getSeconds())}`; };
export function buildListaCards(cfg, h, d) {
  const L = d.pareto && d.pareto.lista ? d.pareto.lista.slice().sort((a, b) => a.t - b.t) : [];
  if (!L.length) return [];
  const md = (c) => ({ tag: 'div', text: { tag: 'lark_md', content: c } });
  const partes = []; for (let i = 0; i < L.length; i += LINHAS_POR_MSG) partes.push(L.slice(i, i + LINHAS_POR_MSG));
  const usados = partes.slice(0, MAX_MSGS), cortado = L.length - usados.reduce((a, x) => a + x.length, 0);
  return usados.map((P, i) => {
    const linhas = P.map((r) => {
      const ic = r.ex === 'Chute block' ? '⛔' : '▫️', saida = r.ex === 'Chute block' ? chuteLabel(chuteKey(r)) : (r.cl ? chuteLabel(r.cl) : '—');
      return `${hms(r.t)} ${ic} ${r.wb || '(sem waybill)'} · ${reasonLabel(r.ex)} · Ind ${p2(r.ind || 0)} · saída ${saida}${r.dc ? ' → ' + r.dc : ''} · rota ${r.sc || '(sem sortcode)'}`;
    }).join('\n');
    return { msg_type: 'interactive', card: { header: { template: 'orange', title: { tag: 'plain_text', content: `Rejeitos ${hh(h)} · lista completa ${i + 1}/${usados.length} (${fmt(L.length)} no total)` } }, elements: [
      md(linhas), ...(i === usados.length - 1 && cortado > 0 ? [md(`⚠ Lista cortada: mais ${fmt(cortado)} rejeitos não couberam em ${MAX_MSGS} mensagens.`)] : []),
      { tag: 'note', elements: [{ tag: 'plain_text', content: 'Cada linha = 1 peça rejeitada · horário · waybill · motivo · indução · saída pretendida → saída onde caiu · rota' }] }] } };
  });
}
async function postLista(cfg, h, d) {
  ULT.lista = 0; ULT.partes = 0; ULT.cortado = 0;
  if (cfg.feishuLista === false) return;
  const cards = buildListaCards(cfg, h, d); if (!cards.length) return;
  for (let i = 0; i < cards.length; i++) { await postFeishu(cfg, cards[i]); ULT.partes++; if (i < cards.length - 1) await new Promise((r) => setTimeout(r, 1300)); }
  ULT.lista = d.pareto.lista.length; ULT.cortado = Math.max(0, d.pareto.lista.length - cards.length * LINHAS_POR_MSG);
}

const LIMITE_CARTAO = 27000; // o Feishu recusa cartões acima de ~30 KB: se passar, reduz os paretos por erro (top 5, só a hora)
const caber = (build, cfg, h, d) => { let c = build(cfg, h, d); if (JSON.stringify(c).length > LIMITE_CARTAO) c = build({ ...cfg, __compact: true }, h, d); return c; };
export async function postRelatorio(cfg, h, d) {
  let modo;
  try { await postFeishu(cfg, caber(buildCardV2, cfg, h, d)); modo = 'graficos'; }
  catch (e) { if (/URL do webhook|Sem conexão|Failed to fetch/i.test(e.message)) throw e; await postFeishu(cfg, caber(buildCard, cfg, h, d)); modo = 'classico'; }
  await new Promise((r) => setTimeout(r, 1300));
  await postLista(cfg, h, d); // rejeitos 1 por 1 (mensagens seguintes)
  return modo;
}

export async function sendHour(cfg, h) {
  const d = await hourData(h, cfg);
  return postRelatorio(cfg, h, d);
}

export async function sendTest(cfg) {
  return postFeishu(cfg, { msg_type: 'text', content: { text: 'Teste do Sorter Monitor: o bot está conectado ✔' } });
}

// Chamado a cada ~30 s: envia a ÚLTIMA hora fechada, uma única vez, a partir do minuto configurado.
let busy = false;
export async function checkFeishu() {
  return; // envio automático desligado: o relatório H/H é disparado manualmente (aba Relatório ou Configurações)
}
async function checkFeishuAuto() {
  if (busy) return; busy = true;
  try {
    const cfg = await loadCfg();
    if (!cfg.feishuOn || !cfg.feishuUrl) return;
    const now = new Date();
    if (now.getMinutes() < (+cfg.feishuMin || 5)) return;
    const h = Math.floor(now.getTime() / HOUR) * HOUR - HOUR;
    const hr = new Date(h).getHours();
    if (hr < (+cfg.feishuIni || 0) || hr >= (+cfg.feishuFim || 24)) return;
    if (+cfg.feishuLast >= h) return;
    await saveCfg({ feishuLast: h }); // marca antes: evita duplicar se duas telas checarem juntas
    const again = await loadCfg(); if (again.feishuLast !== h) return;
    let lastErr;
    for (let i = 0; i < 3; i++) {
      try { await sendHour(cfg, h); await saveCfg({ feishuStatus: `✔ ${hh(h)} enviado às ${p2(now.getHours())}:${p2(new Date().getMinutes())}` }); return; }
      catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 4000 * (i + 1))); }
    }
    await saveCfg({ feishuLast: h - HOUR, feishuStatus: '✖ ' + hh(h) + ': ' + (lastErr && lastErr.message) }); // permite nova tentativa
  } catch (e) { /* sem conexão agora: tenta no próximo ciclo */ } finally { busy = false; }
}
