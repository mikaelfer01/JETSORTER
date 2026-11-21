// Agregações puras (sem DOM) sobre as linhas da trace.
//
// DEFINIÇÃO (padrão do sistema): REJEITO = qualquer exceção (Chute block, Intercept, sem plano, sem sortcode...).
// Modo alternativo 'block': rejeito = somente "Chute block"; as demais exceções viram "outras exceções".
//
// Filtro cruzado: cada painel ignora o filtro da própria dimensão (ind / chute / route).

export const BLOCK = 'Chute block';

export const REASON_LABEL = {
  'Chute block': 'Chute block (saída bloqueada)',
  '999:Intercept': 'Intercept (999)',
  '996:No sortPlan': 'Sem plano (996)',
  '995:No sortCode': 'Sem sortcode (995)',
  '998:Cancel': 'Cancelado (998)',
  'Get chute fail': 'Falha ao obter saída'
};
export const reasonLabel = (ex) => REASON_LABEL[ex] || ex;

export const isBlock = (r) => r.ex === BLOCK;

let rejectMode = 'all'; // 'all' | 'block'
export const setRejectMode = (m) => { rejectMode = m === 'block' ? 'block' : 'all'; };
export const getRejectMode = () => rejectMode;
export const isRej = (r) => (rejectMode === 'all' ? !!r.ex : r.ex === BLOCK);
// com filtro de motivo ativo, só o motivo escolhido conta como rejeito
// Atribuição a uma SAÍDA: só 'Chute block' (saída cheia/bloqueada) é "culpa" da saída. Intercept/sem plano/sem sortcode
// não dependem da saída pretendida, então não entram no ranking de saídas.
export const isChuteFault = (r, f) => r.ex === BLOCK && isRejF(r, f);
export const isRejF = (r, f) => isRej(r) && (!f || !f.reason || r.ex === f.reason);

// Saída ofensora = saída pretendida/bloqueada (chutelist). `dc` é a saída de exceção onde a peça caiu.
// 208/888 são as saídas de EXCEÇÃO (onde o rejeito cai): nunca podem ser "ofensoras" — seriam sempre o topo por definição.
export const isExcChute = (c) => /^(0*208|0*888)$/.test(String(c || '').trim());
const realChute = (c) => (c && !isExcChute(c) ? c : '');
export const chuteKey = (r) => realChute(r.cl) || realChute(r.pc) || '(sem saída pretendida)';
// chutelist pode ter 2+ saídas candidatas ("180,27"): a peça cai numa delas. Rotas assim nunca aparecem em Chute block.
export const chuteLabel = (k) => String(k).replace(/,/g, ' / ');
export const isMulti = (r) => String(r.cl || '').includes(',');

export const ROUTE_LEVELS = { 1: 'UF', 2: 'UF + base', 3: 'Completa' };
export function routeKey(r, level) {
  if (!r.sc) return '(sem sortcode)';
  return r.sc.split(',').slice(0, level).join(',');
}

function dimOk(r, f, level, except) {
  if (f.ind && except !== 'ind' && r.ind !== f.ind) return false;
  if (f.chute && except !== 'chute' && chuteKey(r) !== f.chute) return false;
  if (f.route && except !== 'route' && routeKey(r, level) !== f.route) return false;
  return true;
}

export const dimPass = (r, f, level) => dimOk(r, f, level, null);
export const hasFilter = (f) => !!(f.reason || f.ind || f.chute || f.route);

export function kpis(rows, f, level) {
  let total = 0, rej = 0, other = 0;
  const others = new Map();
  for (const r of rows) {
    if (!dimOk(r, f, level, null)) continue;
    total++;
    if (isRejF(r, f)) rej++;
    else if (r.ex && !isRej(r)) {
      other++;
      others.set(r.ex, (others.get(r.ex) || 0) + 1);
    }
  }
  return { total, rej, other, others };
}

export function timeline(rows, f, level, t0, t1, bucketMs) {
  const base = Math.floor(t0 / bucketMs) * bucketMs;
  const n = Math.max(1, Math.ceil((t1 - base) / bucketMs));
  const b = Array.from({ length: n }, (_, i) => ({ t: base + i * bucketMs, total: 0, rej: 0, other: 0 }));
  for (const r of rows) {
    if (r.t < base || r.t >= t1) continue;
    if (!dimOk(r, f, level, null)) continue;
    const i = Math.floor((r.t - base) / bucketMs);
    if (i < 0 || i >= n) continue;
    b[i].total++;
    if (isRejF(r, f)) b[i].rej++;
    else if (r.ex && !isRej(r)) b[i].other++;
  }
  return b;
}

export function autoBucketMin(spanMs) {
  const target = spanMs / 60000 / 72;
  for (const m of [1, 5, 10, 15, 30, 60]) if (m >= target) return m;
  return 60;
}

// Distribuição de todas as exceções (Chute block em destaque na UI).
export function byException(rows, f, level) {
  const m = new Map();
  for (const r of rows) {
    if (!r.ex || !dimOk(r, f, level, null)) continue;
    m.set(r.ex, (m.get(r.ex) || 0) + 1);
  }
  return [...m].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n);
}

export function groupBy(rows, f, level, keyFn, except, fault = false) {
  const m = new Map();
  for (const r of rows) {
    if (!dimOk(r, f, level, except)) continue;
    const k = keyFn(r);
    let g = m.get(k);
    if (!g) m.set(k, (g = { key: k, total: 0, rej: 0, other: 0, landed: new Map() }));
    g.total++;
    if (fault ? isChuteFault(r, f) : isRejF(r, f)) {
      g.rej++;
      if (r.dc) g.landed.set(r.dc, (g.landed.get(r.dc) || 0) + 1);
    } else if (r.ex && !isRej(r)) g.other++;
  }
  return m;
}

export function byInduction(rows, f, level) {
  const m = groupBy(rows, f, level, (r) => r.ind, 'ind');
  for (let i = 1; i <= 12; i++) if (!m.has(i)) m.set(i, { key: i, total: 0, rej: 0, other: 0, landed: new Map() });
  return [...m.values()].sort((a, b) => a.key - b.key);
}

export function ranking(map, sortBy, minVol = 20) {
  const a = [...map.values()].filter((g) => g.rej > 0);
  if (sortBy === 'rate') {
    return a
      .filter((g) => g.total >= minVol)
      .sort((x, y) => y.rej / y.total - x.rej / x.total || y.rej - x.rej);
  }
  return a.sort((x, y) => y.rej - x.rej || y.rej / y.total - x.rej / x.total);
}

// Indução x saída ofensora: de onde vêm as peças que bloqueiam cada saída.
export function matrix(rows, f, level, maxCols = 8) {
  const cells = new Map();
  const chutes = new Map();
  for (const r of rows) {
    if (!isChuteFault(r, f) || !dimOk(r, f, level, 'ind')) continue;
    if (f.chute && chuteKey(r) !== f.chute) continue;
    const c = chuteKey(r);
    chutes.set(c, (chutes.get(c) || 0) + 1);
    const k = r.ind + '|' + c;
    cells.set(k, (cells.get(k) || 0) + 1);
  }
  const cols = [...chutes].sort((a, b) => b[1] - a[1]).slice(0, maxCols).map((x) => x[0]);
  const inds = new Set();
  for (let i = 1; i <= 12; i++) inds.add(i);
  for (const k of cells.keys()) inds.add(+k.split('|')[0]);
  return { cols, inds: [...inds].sort((a, b) => a - b), cells };
}

export function recent(rows, f, level, limit = 100) {
  const out = [];
  for (const r of rows) if (isRejF(r, f) && dimOk(r, f, level, null)) out.push(r);
  out.sort((a, b) => b.t - a.t || b.id - a.id);
  return out.slice(0, limit);
}

// Painel "Agora": janela móvel, sem filtros (visão operacional).
export function nowStats(rows, now, windowMin, level, chuteAlert) {
  const t0 = now - windowMin * 60000;
  const w = rows.filter((r) => r.t >= t0 && r.t <= now + 60000);
  const total = w.length;
  const blocks = w.filter(isRej);
  const rej = blocks.length;
  const rank = (keyFn) => {
    const m = new Map();
    for (const r of blocks) {
      const k = keyFn(r);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  const chutes = (() => { const m = new Map(); for (const r of blocks) if (r.ex === BLOCK) { const k = chuteKey(r); m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]); })();
  return {
    total,
    rej,
    rate: total ? (rej / total) * 100 : 0,
    perHour: (total * 60) / windowMin,
    topChutes: chutes.slice(0, 3),
    topRoutes: rank((r) => routeKey(r, level)).slice(0, 3),
    topInds: rank((r) => r.ind).slice(0, 3),
    activeChutes: chutes.filter(([, n]) => n >= chuteAlert)
  };
}

// Rejeito hora a hora (trace), respeitando os filtros; inclui as saídas/rotas/induções mais ofensoras de cada hora.
export function hourly(rows, f, level) {
  const H = new Map();
  for (const r of rows) {
    if (!dimOk(r, f, level, null)) continue;
    const h = Math.floor(r.t / 3600000) * 3600000;
    let g = H.get(h);
    if (!g) H.set(h, (g = { t: h, total: 0, rej: 0, other: 0, ch: new Map(), rt: new Map(), ind: new Map() }));
    g.total++;
    if (isRejF(r, f)) {
      g.rej++;
      const c = chuteKey(r), rt = routeKey(r, level);
      if (r.ex === BLOCK) g.ch.set(c, (g.ch.get(c) || 0) + 1);
      g.rt.set(rt, (g.rt.get(rt) || 0) + 1);
      g.ind.set(r.ind, (g.ind.get(r.ind) || 0) + 1);
    } else if (r.ex && !isRej(r)) g.other++;
  }
  const top = (m) => [...m].sort((a, b) => b[1] - a[1])[0] || null;
  return [...H.values()]
    .sort((a, b) => a.t - b.t)
    .map((g) => ({ t: g.t, total: g.total, rej: g.rej, other: g.other, topChute: top(g.ch), topRoute: top(g.rt), topInd: top(g.ind) }));
}

export function parseArea(area) {
  // "2026-11-05 06:00:00~2026-11-05 06:59:59"
  const [a, b] = String(area || '').split('~');
  const p = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : NaN;
  };
  return [p(a), p(b)];
}


const topOf = (m) => [...m].sort((a, b) => b[1] - a[1])[0] || null;

// Peças alimentadas há mais de minAge min sem registro de descarga (não entram na contagem oficial).
export function stuckStats(all, now, f, level, minAgeMin = 20) {
  const lim = now - minAgeMin * 60000;
  const byInd = new Map();
  let n = 0, fed = 0;
  for (const r of all) {
    if (!dimOk(r, f, level, null)) continue;
    fed++;
    if (!r.dc && r.t < lim) { n++; byInd.set(r.ind, (byInd.get(r.ind) || 0) + 1); }
  }
  return { n, fed, byInd };
}

// Episódios de bloqueio: rejeitos consecutivos na mesma saída (separados por gapMs sem rejeito).
export function episodes(rows, f, level, gapMs = 10 * 60000) {
  const m = new Map();
  for (const r of rows) {
    if (!isChuteFault(r, f) || !dimOk(r, f, level, null)) continue;
    const k = chuteKey(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  const eps = [];
  for (const [k, a] of m) {
    a.sort((x, y) => x.t - y.t);
    let cur = null;
    for (const r of a) {
      if (!cur || r.t - cur.e > gapMs) {
        if (cur) eps.push(cur);
        cur = { key: k, s: r.t, e: r.t, n: 0, rt: new Map(), ind: new Map() };
      }
      cur.n++; cur.e = r.t;
      const rk = r.sc ? r.sc.split(',').slice(0, 2).join(',') : '(sem sortcode)';
      cur.rt.set(rk, (cur.rt.get(rk) || 0) + 1);
      cur.ind.set(r.ind, (cur.ind.get(r.ind) || 0) + 1);
    }
    if (cur) eps.push(cur);
  }
  for (const e of eps) {
    e.simul = eps.filter((o) => o !== e && o.n >= 3 && o.s <= e.e && o.e >= e.s).length;
    e.topRoute = topOf(e.rt);
    e.topInd = topOf(e.ind);
  }
  return eps.sort((a, b) => b.n - a.n || b.s - a.s);
}

// Paradas: intervalos sem nenhuma peça (entre peças consecutivas) >= minGapMs.
export function gaps(rows, minGapMs = 5 * 60000) {
  const t = rows.map((r) => r.t).sort((a, b) => a - b);
  const out = [];
  for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] >= minGapMs) out.push({ s: t[i - 1], e: t[i], min: Math.round((t[i] - t[i - 1]) / 60000) });
  return out;
}

export function peakPerMin(rows) {
  const m = new Map();
  for (const r of rows) { const k = Math.floor(r.t / 60000); m.set(k, (m.get(k) || 0) + 1); }
  let best = null;
  for (const [k, n] of m) if (!best || n > best.n) best = { t: k * 60000, n };
  return best || { t: 0, n: 0 };
}

// Waybills alimentadas mais de uma vez (reentrada/releitura): inflam o processado.
export function dupStats(all) {
  const m = new Map();
  for (const r of all) if (r.wb) m.set(r.wb, (m.get(r.wb) || 0) + 1);
  let waybills = 0, extra = 0;
  for (const n of m.values()) if (n > 1) { waybills++; extra += n - 1; }
  return { waybills, extra, unique: m.size };
}
