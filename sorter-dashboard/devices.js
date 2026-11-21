// Equipamentos do sorter: estado atual (/monitor/sorterstate) e histórico de eventos (/query/devicelogs).
// Cobre induções (alarmes, parada, cortina de luz, sensores, medidas, comunicação), carrinhos (falha) e saídas (fechada/cheia).
import { getJson } from './api.js';
import { parseT } from './store.js';

// sev: 0 informativo · 1 atenção leve · 2 atenção · 3 crítico
export const KINDS = {
  auto: { label: 'Modo automático', sev: 0, short: 'Auto' },
  stop: { label: 'Indução parada', sev: 2, short: 'Parada' },
  reset: { label: 'Indução em reset', sev: 1, short: 'Reset' },
  start: { label: 'Alarme de partida', sev: 1, short: 'Partida' },
  rev: { label: 'Modo reverso', sev: 1, short: 'Reverso' },
  falha: { label: 'Alarme de falha da indução', sev: 3, short: 'Falha' },
  cortina: { label: 'Cortina de luz com falha', sev: 3, short: 'Cortina' },
  sensor: { label: 'Falha de sensor', sev: 3, short: 'Sensor' },
  larg: { label: 'Pacote acima da largura', sev: 2, short: 'Largura' },
  comp: { label: 'Pacote acima do comprimento', sev: 2, short: 'Compr.' },
  wcs: { label: 'Sem comunicação com o WCS', sev: 3, short: 'WCS' },
  plc: { label: 'CLP da estação offline', sev: 3, short: 'CLP' },
  car: { label: 'Falha de carrinho', sev: 3, short: 'Carrinho' },
  cheia: { label: 'Saída cheia (saco cheio)', sev: 1, short: 'Cheia' },
  fechada: { label: 'Saída fechada', sev: 2, short: 'Fechada' },
  sorter_auto: { label: 'Sorter em automático', sev: 0, short: 'Auto' },
  sorter_reset: { label: 'Sorter em reset', sev: 1, short: 'Reset' },
  outro: { label: 'Outro evento', sev: 1, short: 'Outro' }
};
export const IDLE_MS = 5 * 60000; // sem peça há mais que isso = sem alimentação
export const SENSOR_KINDS = ['cortina', 'sensor'];
export const IND_COLS = ['stop', 'cortina', 'sensor', 'larg', 'comp', 'falha', 'start', 'rev', 'wcs'];

export function classify(descEn, desc, devEn) {
  const s = String(descEn || desc || '');
  const m = /^(\d+)#(.*)$/.exec(s);
  const no = m ? +m[1] : 0;
  const rest = m ? m[2] : s;
  let kind = 'outro', sensor = '';
  if (devEn === 'INDUCTION') {
    if (/light curtain|光幕/i.test(rest)) kind = 'cortina';
    else if (/(\d+)#\s*sensor fault/i.test(rest)) { kind = 'sensor'; sensor = /(\d+)#/.exec(rest)[1]; }
    else if (/over width/i.test(rest)) kind = 'larg';
    else if (/over leng/i.test(rest)) kind = 'comp';
    else if (/disconnect with WCS/i.test(rest)) kind = 'wcs';
    else if (/Fault alarm/i.test(rest)) kind = 'falha';
    else if (/Starting alarm/i.test(rest)) kind = 'start';
    else if (/Reverse/i.test(rest)) kind = 'rev';
    else if (/Reset/i.test(rest)) kind = 'reset';
    else if (/Stop/i.test(rest)) kind = 'stop';
    else if (/Automatic/i.test(rest)) kind = 'auto';
    else if (/PLC off-?line/i.test(rest)) kind = 'plc';
  } else if (/Feed Station-PLC/i.test(rest)) kind = 'plc';
  else if (devEn === 'CHUTE') kind = /full|满袋/i.test(rest) ? 'cheia' : /clos|关闭/i.test(rest) ? 'fechada' : 'outro';
  else if (/CARRIER/.test(devEn)) kind = 'car';
  else if (/SORTER/.test(devEn)) kind = /Automatic/i.test(rest) ? 'sorter_auto' : /Reset/i.test(rest) ? 'sorter_reset' : 'outro';
  return { no, kind, sensor, sev: KINDS[kind].sev };
}

export const devGroup = (devEn) => (devEn === 'INDUCTION' ? 'ind' : devEn === 'CHUTE' ? 'chute' : /CARRIER/.test(devEn) ? 'car' : 'sorter');
export const layerOf = (devEn) => (/LAYER(\d)/.exec(devEn) || [, ''])[1];

export function devName(e) {
  const g = e.grp;
  if (g === 'ind') return 'Indução ' + String(e.no).padStart(2, '0');
  if (g === 'chute') return 'Saída ' + e.no;
  if (g === 'car') return `Carrinho ${e.no}${e.layer ? ' (L' + e.layer + ')' : ''}`;
  return 'Sorter' + (e.layer ? ' L' + e.layer : '');
}

function parseOne(x) {
  const devEn = x.device_en || '';
  const c = classify(x.description_en, x.description, devEn);
  return { ...c, id: +x.id || 0, key: x.keyid, devEn, grp: devGroup(devEn), layer: layerOf(devEn), machine: x.machine || '', loc: x.location, desc: x.description_en || x.description || '' };
}

export function parseEvent(x) {
  const e = parseOne(x);
  e.start = parseT(x.startdt);
  e.end = x.enddt ? parseT(x.enddt) : null;
  return Number.isFinite(e.start) ? e : null;
}
export function parseState(x) {
  const e = parseOne(x);
  e.since = parseT(x.syncdate);
  e.statusidx = +x.statusidx;
  e.type = x.type_en || '';
  return Number.isFinite(e.since) ? e : null;
}

export async function fetchState(create = true) {
  const j = await getJson('/monitor/sorterstate?action=fetchdata', { method: 'POST', form: { page: 1, perPage: 600, device_en: '', type_en: '' }, create });
  return (j.data || []).map(parseState).filter(Boolean);
}
// Sem filtro no servidor (a tabela tem ~1 milhão de linhas): pagina do mais novo para o mais antigo.
export async function fetchEvents(perPage = 400, create = true) {
  const j = await getJson('/query/devicelogs?action=fetchdata', { method: 'POST', form: { page: 1, perPage, device: '', description: '', location: '', startdt: '', enddt: '' }, create });
  return (j.data || []).map(parseEvent).filter(Boolean);
}

// ---------- análise ----------
const dur = (e, now) => Math.max(0, ((e.end ?? now) - e.start) / 1000);

export function analyze({ events, state, now, rows, dayStart, intermitN = 4, intermitMin = 30 }) {
  const ev = events.filter((e) => e.start >= dayStart);
  const inds = new Map();
  const get = (n) => {
    if (!inds.has(n)) inds.set(n, { no: n, cur: null, counts: {}, secs: {}, last: null, lastCrit: null, intermit: null, first: 0 });
    return inds.get(n);
  };
  for (const r of rows) { if (r.ind) { const x = get(r.ind); if (!x.first || r.t < x.first) x.first = r.t; if (!x.lastPiece || r.t > x.lastPiece) x.lastPiece = r.t; } }
  for (const s of state) if (s.grp === 'ind') get(s.no);
  for (const e of ev) {
    if (e.grp !== 'ind') continue;
    const x = get(e.no);
    x.counts[e.kind] = (x.counts[e.kind] || 0) + 1;
    x.secs[e.kind] = (x.secs[e.kind] || 0) + dur(e, now);
    if (e.kind !== 'auto' && (!x.last || e.start > x.last.start)) x.last = e;
    if (e.sev >= 3 && (!x.lastCrit || e.start > x.lastCrit.start)) x.lastCrit = e;
  }
  // estado atual: maior severidade entre os estados ativos da indução (empate: mais recente)
  for (const s of state) {
    if (s.grp !== 'ind') continue;
    const x = get(s.no);
    if (!x.cur || s.sev > x.cur.sev || (s.sev === x.cur.sev && s.since > x.cur.since)) x.cur = s;
  }
  // STATUS ÚNICO da indução (usado em todas as telas):
  //  falha (alarme crítico no estado) · parada (estado Stop) · ativa (ligada e alimentou nos últimos 5 min) · ociosa (ligada, sem peças) · semsinal
  const cs = { ativa: 0, ociosa: 0, parada: 0, falha: 0, semsinal: 0 };
  for (const x of inds.values()) {
    const flowing = !!x.lastPiece && now - x.lastPiece <= IDLE_MS;
    x.flowing = flowing;
    x.status = !x.cur ? (flowing ? 'ativa' : 'semsinal') : x.cur.sev >= 3 ? 'falha' : x.cur.kind === 'stop' ? 'parada' : flowing ? 'ativa' : 'ociosa';
    cs[x.status]++;
  }
  for (const x of inds.values()) {
    const open = x.cur && x.cur.kind === 'stop' ? (now - x.cur.since) / 1000 : 0;
    const stopS = (x.secs.stop || 0) + open;
    x.stopS = stopS;
    x.avail = x.first ? Math.max(0, Math.min(1, 1 - stopS / Math.max(60, (now - x.first) / 1000))) : null;
    // sensor/cortina intermitente: várias falhas curtas na mesma indução em poucos minutos
    const w = ev.filter((e) => e.grp === 'ind' && e.no === x.no && SENSOR_KINDS.includes(e.kind) && now - e.start <= intermitMin * 60000);
    if (w.length >= intermitN) {
      const med = w.map((e) => dur(e, now)).sort((a, b) => a - b)[Math.floor(w.length / 2)];
      x.intermit = { n: w.length, kind: w.filter((e) => e.kind === 'cortina').length >= w.length / 2 ? 'cortina de luz' : 'sensor', medS: med };
    }
  }
  // carrinhos
  const cm = new Map();
  for (const e of ev) {
    if (e.grp !== 'car') continue;
    const k = e.layer + '-' + e.no;
    let c = cm.get(k);
    if (!c) { c = { no: e.no, layer: e.layer, n: 0, secs: 0, maxS: 0, last: 0 }; cm.set(k, c); }
    const d = dur(e, now);
    c.n++; c.secs += d; c.maxS = Math.max(c.maxS, d); c.last = Math.max(c.last, e.start);
  }
  const carriers = [...cm.values()].sort((a, b) => b.n - a.n || b.secs - a.secs);
  // saídas: fechadas / cheias agora (com impacto em peças) e histórico de "cheia"
  const closed = [], full = [];
  for (const s of state) {
    if (s.grp !== 'chute') continue;
    const hit = rows.filter((r) => r.t >= s.since && String(r.cl || r.pc).split(',').map((q) => String(+q.trim())).includes(String(s.no)));
    const item = { no: s.no, since: s.since, pieces: hit.length, rej: hit.filter((r) => r.ex).length };
    (s.kind === 'fechada' ? closed : full).push(item);
  }
  closed.sort((a, b) => a.since - b.since); full.sort((a, b) => a.since - b.since);
  const fullHist = new Map();
  for (const e of ev) if (e.grp === 'chute' && e.kind === 'cheia') { const f = fullHist.get(e.no) || { no: e.no, n: 0, secs: 0 }; f.n++; f.secs += dur(e, now); fullHist.set(e.no, f); }
  const fullTop = [...fullHist.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  // contagens
  const cnt = {};
  for (const e of ev) cnt[e.kind] = (cnt[e.kind] || 0) + 1;
  const indList = [...inds.values()].sort((a, b) => a.no - b.no);
  const crit = ev.filter((e) => e.sev >= 3).sort((a, b) => b.start - a.start);
  return { statusCount: cs, inds: indList, carriers, closed, full, fullTop, cnt, ev, crit,
    indsStopped: indList.filter((x) => x.cur && x.cur.kind === 'stop'),
    indsFault: indList.filter((x) => x.cur && x.cur.sev >= 3),
    indsAuto: indList.filter((x) => x.cur && (x.cur.kind === 'auto')),
    intermit: indList.filter((x) => x.intermit) };
}

// ---------- alertas (usados no dashboard e no service worker) ----------
export function alertsFrom(events, lastId, now, { intermitN = 4, intermitMin = 30 } = {}) {
  const out = [];
  const fresh = events.filter((e) => e.id > lastId && e.sev >= 3 && e.kind !== 'sensor' && e.kind !== 'cortina').sort((a, b) => a.id - b.id);
  for (const e of fresh) out.push({ key: `ev-${e.kind}-${e.grp}-${e.no}`, id: e.id, title: `${KINDS[e.kind].label} — ${devName(e)}`, msg: `${e.start ? new Date(e.start).toTimeString().slice(0, 8) : ''} · duração ${Math.round(dur(e, now))} s`, sev: 3 });
  const byInd = new Map();
  for (const e of events) if (e.grp === 'ind' && SENSOR_KINDS.includes(e.kind) && now - e.start <= intermitMin * 60000) { const a = byInd.get(e.no) || []; a.push(e); byInd.set(e.no, a); }
  for (const [no, a] of byInd) {
    if (a.length < intermitN) continue;
    const c = a.filter((e) => e.kind === 'cortina').length >= a.length / 2 ? 'cortina de luz' : 'sensor';
    out.push({ key: `int-${no}`, id: Math.max(...a.map((e) => e.id)), count: a.length, title: `Indução ${String(no).padStart(2, '0')}: ${c} oscilando`, msg: `${a.length} falhas em ${intermitMin} min — padrão de sensor sujo, obstruído ou desalinhado. Inspecione/limpe o sensor.`, sev: 3, intermit: true });
  }
  return out;
}

export function deviceInsights(an, now, cfg) {
  const L = [];
  const dm = (s) => (s >= 5400 ? (s / 3600).toFixed(1).replace('.', ',') + ' h' : Math.round(s / 60) + ' min');
  const nn = (n) => String(n).padStart(2, '0');
  for (const x of an.intermit) L.push({ lv: 'bad', s: 3, t: `<b>Indução ${nn(x.no)}: ${x.intermit.kind} oscilando</b> — ${x.intermit.n} falhas em 30 min (mediana ${Math.round(x.intermit.medS)} s cada). Padrão típico de sensor sujo, obstruído (poeira, inseto, etiqueta) ou desalinhado.` });
  if (an.indsStopped.length) {
    const L2 = an.indsStopped.map((x) => `${nn(x.no)} (${dm((now - x.cur.since) / 1000)})`);
    L.push({ lv: an.indsStopped.length >= 3 ? 'warn' : 'info', s: 2, t: `<b>${an.indsStopped.length} indução(ões) parada(s):</b> ${L2.join(', ')}.` });
  const c = an.statusCount;
  L.push({ lv: 'info', s: 1, t: `Induções: <b>${c.ativa}</b> alimentando, <b>${c.ociosa}</b> ligadas sem peças (nos últimos 5 min), <b>${c.parada}</b> paradas, <b>${c.falha}</b> em falha.` });
  }
  for (const x of an.indsFault) L.push({ lv: 'bad', s: 3, t: `<b>Indução ${nn(x.no)} em falha agora:</b> ${KINDS[x.cur.kind].label.toLowerCase()} desde ${new Date(x.cur.since).toTimeString().slice(0, 5)}.` });
  const worst = an.carriers[0];
  if (worst && worst.n >= 2) L.push({ lv: 'warn', s: 2, t: `<b>Carrinho ${worst.no}${worst.layer ? ' (camada ' + worst.layer + ')' : ''} reincidente:</b> ${worst.n} falhas hoje, ${dm(worst.secs)} no total (a maior durou ${dm(worst.maxS)}). Carrinhos em falha derrubam peças e geram rejeito.` });
  else if (an.carriers.length) L.push({ lv: 'info', s: 1, t: `${an.carriers.length} carrinho(s) tiveram falha hoje (${dm(an.carriers.reduce((a, c) => a + c.secs, 0))} somados).` });
  for (const c of an.closed.filter((c) => c.pieces > 0).slice(0, 2)) L.push({ lv: 'warn', s: 2, t: `<b>Saída ${c.no} fechada</b> desde ${new Date(c.since).toTimeString().slice(0, 5)}: ${c.pieces} peça(s) destinada(s) a ela passaram por aqui${c.rej ? ` — ${c.rej} viraram rejeito` : ''}. Confirme se o fechamento é intencional.` });
  if (an.closed.length) L.push({ lv: 'info', s: 1, t: `${an.closed.length} saída(s) fechada(s) no momento${an.full.length ? ` e ${an.full.length} cheia(s)` : ''}.` });
  const ov = an.inds.map((x) => [x.no, (x.counts.larg || 0) + (x.counts.comp || 0)]).sort((a, b) => b[1] - a[1])[0];
  const ovT = (an.cnt.larg || 0) + (an.cnt.comp || 0);
  if (ov && ovT >= 10 && ov[1] / ovT >= 0.35) L.push({ lv: 'info', s: 1, t: `Indução ${nn(ov[0])} concentra ${ov[1]} de ${ovT} alertas de pacote fora de medida (largura/comprimento) — verifique o que está sendo induzido nela.` });
  const wcs = an.inds.filter((x) => (x.counts.wcs || 0) >= 2);
  for (const x of wcs) L.push({ lv: 'warn', s: 2, t: `Indução ${nn(x.no)} perdeu comunicação com o WCS ${x.counts.wcs}× hoje.` });
  if (!L.length) L.push({ lv: 'ok', s: 0, t: 'Equipamentos sem anomalias relevantes: induções em automático, nenhum carrinho ou sensor em falha.' });
  return L.sort((a, b) => b.s - a.s);
}

export const IND_STATUS = {
  ativa: ['ok', 'Alimentando'],
  ociosa: ['idle', 'Ligada, sem peças'],
  parada: ['warn', 'Parada'],
  falha: ['bad', 'Em falha'],
  semsinal: ['idle', 'Sem sinal']
};
