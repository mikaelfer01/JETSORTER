// Plano de triagem ativo (tela "sorte plan query"): relaciona cada saída à BASE de destino (gridname)
// e aos códigos de rota que ela atende (threesegmentcode).
import { getJson } from './api.js';
import { trackPlan, newActivation } from './planhist.js';

export const PLAN = { map: new Map(), loadedAt: 0, code: '', err: '' };

const chuteNo = (c) => String(parseInt(c, 10));
const zh = (n) => n.replace(/综合异常口/g, 'Saída de exceção').replace(/异常口?/g, 'Exceção');
const shortName = (n) => zh(n).replace(/^F\s+/i, '').replace(/\s*-\s*MG$/i, '').replace(/\s+/g, ' ').trim();

export async function loadPlan(force = false) {
  if (!force && PLAN.map.size) {
    const age = Date.now() - PLAN.loadedAt;
    if (age < 5 * 60000 && (age < 60000 || !(await newActivation()))) return; // relê o plano na hora se o sorter registrou nova ativação; senão a cada 5 min
  }
  try {
    const j = await getJson('/query/plan?action=fetchdata', {
      method: 'POST',
      form: { page: 1, perPage: 3000, sortingplancode: '', sortingportcode: '', gridname: '', threesegmentcode: '' }
    });
    const rows = (j.data || []).filter((x) => String(x.defaultplan) === '1');
    trackPlan(rows);
    const m = new Map();
    for (const x of rows) {
      const k = chuteNo(x.sortingportcode);
      if (k === 'NaN') continue;
      let e = m.get(k);
      if (!e) { e = { names: new Set(), codes: new Set(), rows: [] }; m.set(k, e); }
      if (x.gridname) e.names.add(String(x.gridname).trim());
      const rc = String(x.threesegmentcode || '').split(/\s+/).filter(Boolean);
      for (const c of rc) e.codes.add(c);
      // cada linha do plano = (nome do destino, códigos de segmento): é o que liga o segmento à rota
      e.rows.push({ name: zh(String(x.gridname || '').trim()), codes: rc });
      PLAN.code = x.sortingplancode;
    }
    const out = new Map();
    for (const [k, e] of m) {
      const names = [...e.names];
      out.set(k, { rows: e.rows, full: names.map(zh).join(' / '), short: names.map(shortName).filter((v, i, a) => a.indexOf(v) === i).join(' / '), codes: [...e.codes] });
    }
    PLAN.map = out; PLAN.loadedAt = Date.now(); PLAN.err = '';
  } catch (e) { PLAN.err = e && e.message ? e.message : String(e); }
}

// Base de uma saída (aceita "89" ou lista "89,161").
export function baseOf(key, short = true) {
  const parts = String(key).split(',').map((s) => chuteNo(s.trim()));
  const names = parts.map((p) => { const e = PLAN.map.get(p); return e ? (short ? e.short : e.full) : ''; }).filter(Boolean);
  return [...new Set(names)].join(' / ');
}
export const codesOf = (key) => { const e = PLAN.map.get(chuteNo(String(key).split(',')[0])); return e ? e.codes : []; };
