// Segmentos: cada código de segmento do plano ativo (ex.: A129-00, C116-00, RS, SJP) com a saída, a rota (nome do destino no plano),
// a rota obrigatória do comunicado e a cor da saca. Colunas "código antigo" e "código novo" editáveis / importáveis (de-para).
import { PLAN } from './plan.js';
import { SACA, assocRotas } from './saca.js';

const KEY = 'segMap';
export const SEG = { q: '', f: '', map: null, imp: false, redraw: null, csv: null };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const p3 = (n) => String(n).padStart(3, '0');
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export async function loadSeg() {
  if (SEG.map) return;
  try { SEG.map = (await chrome.storage.local.get(KEY))[KEY] || {}; } catch { SEG.map = {}; }
}
async function save() { try { await chrome.storage.local.set({ [KEY]: SEG.map }); } catch { /* sem storage */ } }

// "A129-00" -> { tipo: 'A', fam: '129', suf: '00' } ; "RS1" / "SJP" -> só o código
export const parseSeg = (c) => { const m = /^([A-Z])(\d{3})-(\d{2})$/.exec(c) || /^(\d{3})-(\d{2})$/.exec(c); return m ? (m.length === 4 ? { tipo: m[1], fam: m[2], suf: m[3] } : { tipo: '', fam: m[1], suf: m[2] }) : null; };

// de-para salvo para um código (procura como código atual, antigo ou novo)
export function aliasDe(code) { const m = SEG.map || {}; return m[code] || null; }
export const aliasesOutlet = (k) => { const e = PLAN.map.get(String(parseInt(k, 10))); if (!e) return []; const out = []; for (const c of e.codes || []) { const a = aliasDe(c); if (a) out.push(a.antigo, a.novo, a.rota); } return out.filter(Boolean); };

function linhas() {
  const as = assocRotas(), rotaDe = new Map();
  for (const a of as) for (const s of a.saidas) if (s.nivel !== 'verificar') { const l = rotaDe.get(s.k) || []; if (!l.includes(a.rota)) l.push(a.rota); rotaDe.set(s.k, l); }
  const L = [];
  for (const [k, e] of PLAN.map) for (const w of e.rows || []) for (const c of w.codes || []) L.push({ code: c, k, plano: w.name, obr: rotaDe.get(k) || [], cor: (SACA[k] || {}).c, man: (SACA[k] || {}).man });
  const seen = new Set(); return L.filter((x) => { const id = x.code + '|' + x.k + '|' + x.plano; if (seen.has(id)) return false; seen.add(id); return true; })
    .sort((a, b) => a.code.localeCompare(b.code, 'pt', { numeric: true }) || +a.k - +b.k);
}

function tsv(rows) { return ['Segmento;Família;Saída;Rota no plano;Rota obrigatória (comunicado);Cor da saca;Código antigo;Código novo;Observação'].concat(rows.map((x) => { const a = aliasDe(x.code) || {}, p = parseSeg(x.code); return [x.code, p ? p.fam : '', x.k, x.plano, x.obr.join(' / '), x.cor === 'R' ? 'vermelha' : 'verde', a.antigo || '', a.novo || '', a.rota || ''].join(';'); })).join('\n'); }

export function renderSegmentos(c) {
  SEG.redraw = c.redraw;
  if (!SEG.map) { loadSeg().then(() => c.redraw && c.redraw()); return '<div class="empty">Carregando segmentos…</div>'; }
  if (!PLAN.map.size) return '<div class="empty">Aguardando o plano de triagem carregar…</div>';
  let L = linhas(); const total = L.length, nSem = L.filter((x) => !aliasDe(x.code)).length;
  const toks = norm(SEG.q).split(/\s+/).filter(Boolean);
  L = L.filter((x) => {
    if (SEG.f === 'R' && !x.obr.length) return false;
    if (SEG.f === 'D' && aliasDe(x.code)) return false;
    if (SEG.f === 'E' && !aliasDe(x.code)) return false;
    if (!toks.length) return true;
    const a = aliasDe(x.code) || {}, p = parseSeg(x.code);
    const h = norm([x.code, p ? p.fam : '', 'saida ' + p3(x.k), x.k, x.plano, x.obr.join(' '), x.cor === 'R' ? 'vermelha' : 'verde', a.antigo, a.novo, a.rota].join(' | '));
    return toks.every((t) => h.includes(t));
  });
  SEG.csv = tsv(L);
  const chip = (v, t) => `<button class="vqchip ${SEG.f === v ? 'on' : ''}" data-segf="${v}">${t}</button>`;
  const rows = L.slice(0, 400).map((x) => {
    const a = aliasDe(x.code) || {};
    const inp = (f, v, ph) => `<input class="seginp" data-segc="${esc(x.code)}" data-segfld="${f}" value="${esc(v || '')}" placeholder="${ph}" spellcheck="false"/>`;
    return `<tr><td><b>${esc(x.code)}</b></td><td class="muted">${esc((parseSeg(x.code) || {}).fam || '')}</td><td><b>${p3(x.k)}</b></td><td>${esc(x.plano)}</td>` +
      `<td>${x.obr.length ? `<span class="pillstate sm bad">${esc(x.obr.join(' / '))}</span>` : '<span class="muted">—</span>'}</td>` +
      `<td><span class="scdot ${x.cor === 'R' ? 'R' : 'G'}"></span>${x.cor === 'R' ? 'Vermelha' : 'Verde'}${x.man ? ' ✎' : ''}</td>` +
      `<td>${inp('antigo', a.antigo, 'antigo')}</td><td>${inp('novo', a.novo, 'novo')}</td><td>${inp('rota', a.rota, 'rota / obs.')}${a.auto ? ' <span class="muted sm">auto</span>' : ''}</td></tr>`;
  }).join('');
  carregarAlteracoes(!ALT.at || Date.now() - ALT.at > 30000).then(() => { if (!ALT.drawn) { ALT.drawn = 1; c.redraw && c.redraw(); } });
  return `<div class="card">${htmlAlteracoes()}</div><div class="card"><h3>Segmentos do plano <small class="muted">${total} segmentos · ${total - nSem} com de-para (código antigo / novo / rota)</small></h3>` +
    `<div class="vqbar"><div class="vqin"><span class="vqic">⌕</span><input type="text" id="segQ" value="${esc(SEG.q)}" placeholder="Pesquisar código (antigo, novo, atual), saída, rota, cor…" autocomplete="off" spellcheck="false"/></div>` +
    `${chip('', 'Todos')}${chip('R', 'Rotas obrigatórias')}${chip('D', 'Sem de-para')}${chip('E', 'Com de-para')}` +
    `<button class="vqchip" data-segimp>Importar de-para</button><button class="vqchip on" data-segcsv>Exportar CSV</button><button class="vqchip" data-segcsvalt>Exportar alterações</button></div>` +
    (SEG.imp ? `<div class="segimp"><div class="muted sm">Cole uma linha por segmento: <b>código antigo ; código novo ; rota</b> (separador ; ou tabulação). O código antigo ou o novo precisa existir no plano ativo para ser vinculado.</div><textarea id="segImpTxt" rows="6" placeholder="C129-00;A129-00;DC MTC-MG"></textarea><div class="scbtn"><button class="btn" data-segimp>Cancelar</button><button class="btn on" data-segimpok>Importar</button></div></div>` : '') +
    `<div class="scroll" style="max-height:560px"><table class="tnt"><thead><tr><th>Segmento (código atual)</th><th>Família</th><th>Saída</th><th>Rota no plano</th><th>Rota obrigatória</th><th>Saca</th><th>Código antigo</th><th>Código novo</th><th>Rota / obs.</th></tr></thead><tbody>${rows || '<tr><td colspan="9" class="muted">Nenhum segmento encontrado.</td></tr>'}</tbody></table></div>` +
    `<div class="muted sm" style="margin-top:6px">${L.length > 400 ? `Mostrando 400 de ${L.length}. ` : ''}“Família” é o número do meio do código (A129-00, B129-00 e C129-00 são a família 129). O app só lê o plano; o de-para fica salvo neste computador e passa a valer na busca de Saídas.</div></div>`;
}

let wired = false;
export function wireSegmentos(csvFn) {
  if (wired) return; wired = true;
  document.addEventListener('input', (e) => {
    const t = e.target; if (!t.matches) return;
    if (t.id === 'segQ') { SEG.q = t.value; clearTimeout(SEG._t); SEG._t = setTimeout(() => { const p = t.selectionStart; SEG.on = true; setTimeout(() => { SEG.on = false; }, 600); SEG.redraw && Promise.resolve(SEG.redraw()).then(() => { const i = document.getElementById('segQ'); if (i) { i.focus(); try { i.setSelectionRange(p, p); } catch { /* */ } } }); }, 120); return; }
    if (t.matches('.seginp')) {
      const code = t.dataset.segc, f = t.dataset.segfld; const a = { ...(SEG.map[code] || {}) }; a[f] = t.value.trim(); delete a.auto;
      if (!a.antigo && !a.novo && !a.rota) delete SEG.map[code]; else SEG.map[code] = a; clearTimeout(SEG._s); SEG._s = setTimeout(save, 400);
    }
  });
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-segf],[data-segimp],[data-segimpok],[data-segcsv],[data-segcsvalt]'); if (!t) return;
    if ('segf' in t.dataset) SEG.f = t.dataset.segf;
    else if ('segimp' in t.dataset) SEG.imp = !SEG.imp;
    else if ('segcsvalt' in t.dataset) { if (csvFn && ALT.list) csvFn(['Quando;Saída;Rota;Tipo;Código antigo;Código novo;Confiança'].concat(ALT.list.map((x) => [fdt(x.t), x.k, x.rota, x.tipo, x.de, x.para, x.conf].join(';'))).join('\n')); return; }
    else if ('segcsv' in t.dataset) { if (csvFn && SEG.csv) csvFn(SEG.csv); return; }
    else if ('segimpok' in t.dataset) {
      const txt = (document.getElementById('segImpTxt') || {}).value || '', known = new Set(); for (const e2 of PLAN.map.values()) for (const w of e2.rows || []) (w.codes || []).forEach((c) => known.add(c));
      let n = 0;
      for (const ln of txt.split(/\r?\n/)) { const [antigo, novo, ...r] = ln.split(/[;\t]/).map((x) => x.trim()); if (!antigo && !novo) continue; const alvo = [novo, antigo].find((c) => c && known.has(c)); if (!alvo) continue; SEG.map[alvo] = { antigo: antigo || '', novo: novo || '', rota: r.join(' ') }; n++; }
      SEG.imp = false; save(); SEG.msg = n;
    }
    SEG.on = true; setTimeout(() => { SEG.on = false; }, 600); SEG.redraw && SEG.redraw();
  });
}

// ---------- alterações de código detectadas (consolidado) ----------
// O sorter não guarda versões antigas do plano; o app tira uma foto a cada leitura e guarda o que mudou (Histórico do plano).
// Aqui esses eventos viram "código antigo -> código novo": pareia o que saiu e o que entrou na MESMA saída pela família do código
// (C129-00 -> A129-00) e, sobrando um só de cada lado, por posição (confiança menor). Os pares alimentam o de-para sozinhos.
import { planEvents } from './planhist.js';
const isUF = (c) => /^[A-Z]{2}\d?$/.test(c) || c === 'CHV';

export function consolidar(events) {
  const out = [];
  for (const ev of events) {
    const porSaida = new Map(); const get = (k) => { let x = porSaida.get(k); if (!x) porSaida.set(k, (x = { D: [], A: [] })); return x; };
    for (const [k, c] of ev.del || []) get(String(k)).D.push(c);
    for (const [k, c] of ev.add || []) get(String(k)).A.push(c);
    const nomeDe = (k) => { const b = (ev.base || []).find((x) => String(x[0]) === String(k)); return b ? b[2] : ((PLAN.map.get(String(k)) || {}).full || ''); };
    for (const [k, x] of porSaida) {
      const D = [...x.D], A = [...x.A], rota = nomeDe(k);
      for (const d of [...D]) { // 1) mesma família (número do meio)
        const pd = parseSeg(d); if (!pd) continue;
        const i = A.findIndex((a) => { const pa = parseSeg(a); return pa && pa.fam === pd.fam; });
        if (i >= 0) { out.push({ t: ev.t, k, tipo: 'troca', de: d, para: A[i], conf: 'alta', rota }); A.splice(i, 1); D.splice(D.indexOf(d), 1); }
      }
      const D2 = D.filter((c) => !isUF(c)), A2 = A.filter((c) => !isUF(c));
      if (D2.length === 1 && A2.length === 1) { out.push({ t: ev.t, k, tipo: 'troca', de: D2[0], para: A2[0], conf: 'provável', rota }); D.splice(D.indexOf(D2[0]), 1); A.splice(A.indexOf(A2[0]), 1); }
      D.forEach((c) => out.push({ t: ev.t, k, tipo: 'removido', de: c, para: '', conf: '', rota }));
      A.forEach((c) => out.push({ t: ev.t, k, tipo: 'novo', de: '', para: c, conf: '', rota }));
    }
    for (const [k, de, para] of ev.base || []) out.push({ t: ev.t, k: String(k), tipo: 'destino', de, para, conf: '', rota: para });
    for (const [k, n] of ev.pAdd || []) out.push({ t: ev.t, k: String(k), tipo: 'saída nova', de: '', para: n, conf: '', rota: n });
    for (const [k, n] of ev.pDel || []) out.push({ t: ev.t, k: String(k), tipo: 'saída removida', de: n, para: '', conf: '', rota: n });
  }
  return out;
}

export const ALT = { list: null, busy: false };
export async function carregarAlteracoes(force) {
  if (ALT.busy || (ALT.list && !force)) return;
  ALT.busy = true; ALT.at = Date.now();
  try {
    const evs = await planEvents(); ALT.list = consolidar(evs);
    // de-para automático (não sobrescreve o que foi digitado à mão)
    let n = 0;
    for (const x of ALT.list) if (x.tipo === 'troca') { const a = SEG.map && SEG.map[x.para]; if (SEG.map && !(a && !a.auto)) { SEG.map[x.para] = { antigo: x.de, novo: x.para, rota: x.rota, auto: true }; n++; } }
    if (n) await save();
  } finally { ALT.busy = false; }
}
const fdt = (t) => { const d = new Date(t), p = (n) => String(n).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`; };
export function htmlAlteracoes() {
  const L = ALT.list; if (!L) return '<div class="muted">Lendo histórico do plano…</div>';
  const cnt = (t) => L.filter((x) => x.tipo === t).length, ativ = new Set(L.map((x) => x.t)).size;
  const kp = (l, v, c = '') => `<div class="bst ${c}"><b>${v}</b><label>${l}</label></div>`;
  const rows = L.slice(0, 300).map((x) => `<tr><td>${fdt(x.t)}</td><td><b>${x.k ? p3(x.k) : ''}</b></td><td>${esc(x.rota)}</td><td><span class="pillstate sm ${x.tipo === 'troca' ? 'warn' : x.tipo === 'removido' || x.tipo === 'saída removida' ? 'bad' : 'ok'}">${esc(x.tipo)}</span></td><td>${esc(x.de)}${x.de && x.para ? ' → ' : ''}<b>${esc(x.para)}</b></td><td class="muted">${esc(x.conf)}</td></tr>`).join('');
  return `<h4>Alterações de código detectadas <small class="muted">consolidado do histórico do plano · só mudanças que o app presenciou</small></h4>` +
    `<div class="bindk">${kp('mudanças de plano', ativ)}${kp('códigos trocados (antigo → novo)', cnt('troca'), cnt('troca') ? 'warn' : '')}${kp('códigos novos', cnt('novo'))}${kp('códigos removidos', cnt('removido'), cnt('removido') ? 'bad' : '')}${kp('destinos alterados', cnt('destino'))}${kp('saídas novas / removidas', cnt('saída nova') + ' / ' + cnt('saída removida'))}</div>` +
    (L.length ? `<div class="scroll" style="max-height:300px"><table class="tnt"><thead><tr><th>Quando</th><th>Saída</th><th>Rota (destino)</th><th>Tipo</th><th>Código antigo → novo</th><th>Confiança</th></tr></thead><tbody>${rows}</tbody></table></div><div class="muted sm">Trocas viram de-para automático (marcado “auto”; o que você digita à mão não é sobrescrito). “alta” = mesma família de código na mesma saída; “provável” = um código saiu e outro entrou na mesma saída.</div>` : '<div class="muted">Nenhuma alteração registrada ainda. O app guarda uma foto do plano a cada leitura e anota as mudanças a partir da próxima ativação de plano.</div>');
}
