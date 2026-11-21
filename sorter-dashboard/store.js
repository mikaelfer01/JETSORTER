// Cache em memória das linhas da trace do dia, com sincronização incremental.
import { fetchTrace } from './api.js';

const RX = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

export function parseT(s) {
  const m = RX.exec(s || '');
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
}

export function compact(d) {
  return {
    id: +d.id,
    t: parseT(d.gongtime),
    ind: +d.inductionno || 0,
    pc: d.plcchute || '',
    cl: d.chutelist || '',
    dc: d.dischargechute || '',
    sc: d.sortcode || '',
    ex: d.exception || '',
    ly: d.layer || '',
    w: +d.weight || 0,
    wb: d.waybillno || '',
    plan: d.plancode || '',
    tr: +d.trayno || 0,
    dq: +d.decodeusems || 0,
    tm: +d.totalusems || 0,
    ps: +d.packsendms || 0,
    as: +d.arrivesendms || 0
  };
}

export class TraceStore {
  constructor() {
    this.rows = new Map();
    this.day = 0;
    this.maxId = 0;
    this._list = null;
  }

  reset(day) {
    this.rows.clear();
    this.day = day;
    this.maxId = 0;
    this._list = null;
  }

  get list() {
    if (!this._list) this._list = [...this.rows.values()];
    return this._list;
  }

  // since: início do dia (ms). force: recarrega tudo.
  // Incremental: rebusca as ~1000 linhas mais novas (linhas antigas podem ganhar exceção depois) e
  // avança páginas até cobrir o último id conhecido.
  async sync(since, force, onProgress, opt = {}) {
    const prevMax = this.maxId;
    if (force || this.rows.size === 0) {
      this.rows.clear();
      // carga do dia: páginas em lotes paralelos (4 por vez) até cobrir o início do dia
      const PER = 2000, PAR = 4;
      let done = false, total = 0;
      for (let page = 1; page <= 60 && !done; page += PAR) {
        const batch = await Promise.all(Array.from({ length: PAR }, (_, k) => fetchTrace(page + k, PER)));
        for (const { data, count } of batch) {
          total = Math.max(total, count || 0);
          if (!data.length) { done = true; continue; }
          let oldest = Infinity;
          for (const d of data) {
            const r = compact(d);
            if (!Number.isFinite(r.t)) continue;
            this.rows.set(r.id, r);
            if (r.t < oldest) oldest = r.t;
          }
          if (oldest < since || data.length < PER) done = true;
        }
        onProgress && onProgress({ rows: this.rows.size, total });
        if (page === 1 && opt.onFirst) opt.onFirst();
      }
    } else {
      const PER = opt.deep ? 2000 : opt.per || 800;
      for (let page = 1; page <= (opt.deep ? 4 : 30); page++) {
        const { data } = await fetchTrace(page, PER);
        if (!data.length) break;
        let oldestId = Infinity;
        for (const d of data) {
          const r = compact(d);
          if (!Number.isFinite(r.t)) continue;
          this.rows.set(r.id, r);
          if (r.id < oldestId) oldestId = r.id;
        }
        onProgress && onProgress({ rows: this.rows.size });
        if (oldestId <= prevMax || data.length < PER) break;
      }
    }
    for (const [id, r] of this.rows) {
      if (r.t < since) this.rows.delete(id);
      else if (id > this.maxId) this.maxId = id;
    }
    this._list = null;
  }
}
