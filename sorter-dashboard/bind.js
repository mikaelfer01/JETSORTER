// Falhas ao abrir (vincular) lote/saco numa saída. Fonte: tela "operate logs" do sorter (/query/optlogs),
// evento "<saída>#格口绑包失败" (= falha ao vincular lote ao chute), memo "2段码校验失败:<código>;包号:<lote>".
import { getJson } from './api.js';
import { parseT } from './store.js';

export const isBindFail = (ev) => /格口绑包失败/.test(ev || '');

export function parseBind(x) {
  const m = /^(\d+)#/.exec(x.event || '');
  const mm = /段码校验失败\s*[:：]\s*([^;；]*)[;；]\s*包号\s*[:：]\s*(\S+)/.exec(x.memo || '');
  return {
    id: +x.id,
    t: parseT(x.logdate),
    chute: m ? m[1] : '',
    code: mm ? mm[1].trim() : '',
    bag: mm ? mm[2] : '',
    pc: x.pcname || '',
    memo: x.memo || ''
  };
}

export async function fetchBindFails(perPage = 100, create = true) {
  const j = await getJson('/query/optlogs?action=fetchdata', {
    method: 'POST',
    form: { page: 1, perPage, event: '', memo: '', logdate: '' },
    create
  });
  return (j.data || []).filter((x) => isBindFail(x.event)).map(parseBind).filter((r) => Number.isFinite(r.t));
}

export const bindText = (r) =>
  r.code ? `código de rota ${r.code} não confere com esta saída` : r.memo || 'falha ao vincular lote';

// ---------- diagnóstico detalhado de erro de rota (falha ao vincular lote à saída) ----------
import { PLAN, baseOf, codesOf } from './plan.js';
import { SACA, SACA_VERSAO } from './saca.js';

const fam = (c) => String(c || '').split('-')[0];
export function ownersOf(code) {
  const o = [];
  for (const [k, e] of PLAN.map) if (e.codes.includes(code)) o.push({ chute: k, base: e.short || e.full });
  return o;
}
// Explica UMA falha: por que o sorter recusou o lote nessa saída e para onde ele pertence.
export function explainBind(r) {
  const allowed = codesOf(r.chute), base = baseOf(r.chute) || '';
  const owners = r.code ? ownersOf(r.code) : [];
  const etq = SACA[String(parseInt(r.chute, 10))] || null;
  const sameFam = allowed.filter((c) => r.code && fam(c) === fam(r.code));
  let kind, why, todo;
  if (!r.code) { kind = 'sem'; why = 'O log não trouxe o código de rota do lote.'; todo = 'Abra o log de operação do sorter e confira o memo desta falha.'; }
  else if (allowed.includes(r.code)) { kind = 'plano'; why = `O código ${r.code} consta no plano desta saída, mas o sorter recusou mesmo assim (plano recarregado depois, ou lote em outro plano).`; todo = 'Confira se o plano de triagem ativo é o mesmo do lote e tente vincular de novo.'; }
  else if (owners.length) {
    kind = 'saida-errada';
    const lst = owners.slice(0, 4).map((o) => `saída ${o.chute}${o.base ? ' (' + o.base + ')' : ''}`).join(', ');
    why = `O código ${r.code} pertence a ${lst}${owners.length > 4 ? ` e mais ${owners.length - 4}` : ''}; o lote foi levado à saída ${r.chute}${base ? ' (' + base + ')' : ''}.`;
    todo = `Leve o lote ${r.bag || ''} para ${owners[0].chute === r.chute ? 'a saída correta' : 'a saída ' + owners[0].chute} ou confira se o saco/etiqueta instalados na saída ${r.chute} são os do plano.`;
  } else {
    kind = 'codigo-fora';
    why = `O código ${r.code} não existe no plano de triagem ativo${PLAN.code ? ' (' + PLAN.code + ')' : ''}${sameFam.length ? `; esta saída aceita ${sameFam.slice(0, 3).join(', ')} (mesma família ${fam(r.code)}, sufixo diferente)` : ''}.`;
    todo = 'Código de rota do lote desatualizado ou plano ainda não ativado: peça ao responsável pelo plano para conferir.';
  }
  const etqCodes = etq ? etq.l : [];
  const etqNote = etq ? `Etiqueta ${SACA_VERSAO}: destino ${etq.d.slice(0, 2).join(' / ') || '—'}; lotes impressos ${etqCodes.slice(0, 4).join(', ') || '—'}${r.code && etqCodes.includes(r.code) ? ' (este código BATE com a etiqueta: divergência está no plano)' : r.code && etqCodes.length ? ' (este código NÃO está na etiqueta)' : ''}.` : '';
  return { kind, why, todo, allowed, owners, base, etq, etqNote };
}
const KIND_TXT = { 'saida-errada': 'Lote na saída errada', 'codigo-fora': 'Código fora do plano', plano: 'Plano × sorter divergem', sem: 'Sem código no log' };
export const bindKindText = (k) => KIND_TXT[k] || k;

// Agrupa por saída: quantas falhas, quais códigos/lotes, repetição e diagnóstico mais frequente.
export function bindGroups(L, now) {
  const G = new Map();
  for (const r of L) {
    let g = G.get(r.chute);
    if (!g) G.set(r.chute, (g = { chute: r.chute, n: 0, hour: 0, last: 0, first: Infinity, codes: new Map(), bags: new Map(), pcs: new Set(), ex: null }));
    g.n++; if (now - r.t <= 3600000) g.hour++;
    g.last = Math.max(g.last, r.t); g.first = Math.min(g.first, r.t);
    g.codes.set(r.code || '—', (g.codes.get(r.code || '—') || 0) + 1);
    if (r.bag) g.bags.set(r.bag, (g.bags.get(r.bag) || 0) + 1);
    if (r.pc) g.pcs.add(r.pc);
    if (!g.ex || r.t > g.ex.t) g.ex = r;
  }
  return [...G.values()].map((g) => ({ ...g, diag: explainBind(g.ex), repBags: [...g.bags].filter(([, n]) => n > 1) })).sort((a, b) => b.n - a.n || b.last - a.last);
}
