// Painéis "executivos": saúde da operação, ritmo, meta, retrabalho manual, pulso de 60 min,
// estações de indução ao vivo, animação de números e alerta sonoro.
import * as A from './analysis.js';

const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
const dec = (n, d = 1) => Number(n).toFixed(d).replace('.', ',');
const pct = (a, b, d = 1) => (b ? dec((a / b) * 100, d) + '%' : '—');
const p2 = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hhmm = (ms) => { const d = new Date(ms); return p2(d.getHours()) + ':' + p2(d.getMinutes()); };

// ---- saúde da operação (0–100), componentes explicáveis ----
export function pulseHtml(tot, rj, mx, t0, anim) {
  const bars = tot.map((v, i) => { const h = (v / mx) * 100, r = v ? (rj[i] / v) * 100 : 0; return `<i class="pbar ${anim ? 'pb' : ''}" style="height:${Math.max(v ? 3 : 0, h)}%;animation-delay:${i * 8}ms" title="${hhmm(t0 + i * 60000)}: ${v} peças, ${rj[i]} rejeitos">${r ? `<u style="height:${r}%"></u>` : ''}</i>`; }).join('');
  return `<div class="pulsebox"><div class="pbars">${bars}</div><div class="paxis"><span>${hhmm(t0)}</span><span>${hhmm(t0 + 15 * 60000)}</span><span>${hhmm(t0 + 30 * 60000)}</span><span>${hhmm(t0 + 45 * 60000)}</span><span>agora</span></div></div>`;
}

export function health(ns, st, cfg) {
  if (ns.total < 10) return { idle: true, score: null, cls: 'idle', label: 'Sem fluxo', cause: 'Nenhuma peça relevante nos últimos ' + cfg.nowMin + ' min.', parts: [] };
  const th = cfg.rejectThreshold;
  const pRate = Math.round(40 * Math.min(1, ns.rate / (2 * th)));
  const pCh = Math.min(30, 10 * ns.activeChutes.length);
  const stuckPct = st.fed ? (st.n / st.fed) * 100 : 0;
  const pStuck = Math.round(15 * Math.min(1, stuckPct / 3));
  const score = Math.max(0, 100 - pRate - pCh - pStuck);
  const cls = score >= 85 ? 'ok' : score >= 60 ? 'warn' : 'bad';
  const label = { ok: 'Operação saudável', warn: 'Atenção', bad: 'Crítico' }[cls];
  const parts = [];
  if (pRate) parts.push(`rejeito ${dec(ns.rate, 2)}% (alerta ${dec(th, 1)}%)`);
  if (pCh) parts.push(`${ns.activeChutes.length} saída(s) bloqueando: ${ns.activeChutes.slice(0, 3).map(([c]) => A.chuteLabel(c)).join(', ')}`);
  if (pStuck) parts.push(`${fmt(st.n)} peças sem descarga`);
  return { idle: false, score, cls, label, cause: parts.length ? parts.join(' · ') : 'Rejeito dentro do limite, nenhuma saída bloqueando.', parts };
}

let prevScore = 0, firstPulse = true;
export function renderHero(el, c) {
  const { fall, now, ns, st, cfg, rejLabel } = c;
  const h = health(ns, st, cfg);
  const total = fall.length;
  const rej = fall.reduce((a, r) => a + (A.isRej(r) ? 1 : 0), 0);

  // ritmo vs média do dia (média só sobre minutos com produção)
  const mins = new Set();
  for (const r of fall) mins.add(Math.floor(r.t / 60000));
  const avg = mins.size ? (total / mins.size) * 60 : 0;
  const trend = avg ? (ns.perHour / avg - 1) * 100 : 0;
  const arrow = trend >= 0 ? '▲' : '▼';

  // meta
  let meta = '';
  if (cfg.metaDia > 0) {
    const pc = Math.min(100, (total / cfg.metaDia) * 100);
    const falta = Math.max(0, cfg.metaDia - total);
    const eta = ns.perHour > 0 && falta > 0 ? falta / ns.perHour : 0;
    meta = `<div class="hs"><label>Meta do dia</label><b>${dec(pc, 0)}%</b><div class="meter" style="--c:var(--blue)"><i style="width:${pc}%"></i></div>` +
      `<small>${fmt(total)} de ${fmt(cfg.metaDia)}${falta ? ` · faltam ${fmt(falta)}${eta ? ` (~${dec(eta, 1)} h no ritmo atual)` : ''}` : ' · meta batida'}</small></div>`;
  } else {
    meta = `<div class="hs"><label>Processado hoje</label><b>${fmt(total)}</b><small>peças · defina a meta do dia em ⚙ para ver o avanço</small></div>`;
  }

  // retrabalho manual
  const hrs = (rej * cfg.retrabSeg) / 3600;
  const hrsNow = (ns.rej * cfg.retrabSeg) / 3600;
  const retr = `<div class="hs" title="Estimativa: rejeitos × ${cfg.retrabSeg} s de tratamento manual por peça (ajustável em ⚙)"><label>Retrabalho manual</label>` +
    `<b>${dec(hrs, 1)} h</b><small>${fmt(rej)} pacotes tratados à mão · ${rejLabel.toLowerCase()} · ≈ ${dec(hrsNow * 60, 0)} min de operador nos últimos ${cfg.nowMin} min</small></div>`;

  const rate = `<div class="hs"><label>Ritmo agora</label><b>${fmt(Math.round(ns.perHour))}<em> peças/h</em></b>` +
    `<small class="${trend >= 0 ? 'up' : 'dn'}">${avg ? `${arrow} ${dec(Math.abs(trend), 0)}% vs média do dia (${fmt(Math.round(avg))}/h)` : '—'}</small></div>`;

  // pulso 60 min
  const N = 60, t1 = Math.floor(now / 60000) * 60000, t0 = t1 - (N - 1) * 60000;
  const tot = new Array(N).fill(0), rj = new Array(N).fill(0);
  for (const r of fall) {
    const i = Math.floor((r.t - t0) / 60000);
    if (i >= 0 && i < N) { tot[i]++; if (A.isRej(r)) rj[i]++; }
  }
  const mx = Math.max(10, ...tot);
  const pulse = pulseHtml(tot, rj, mx, t0, firstPulse);

  // anel
  const R = 54, C = 2 * Math.PI * R;
  const score = h.idle ? 0 : h.score;
  const off = (v) => C * (1 - v / 100);
  el.innerHTML =
    `<div class="hcard ring ${h.cls}"><div class="rwrap"><svg viewBox="0 0 130 130"><circle class="trk" cx="65" cy="65" r="${R}"/>` +
    `<circle class="val" id="ringVal" cx="65" cy="65" r="${R}" stroke-dasharray="${C}" style="stroke-dashoffset:${off(prevScore)}"/></svg>` +
    `<div class="rnum"><b>${h.idle ? '—' : score}</b><small>/100</small></div></div>` +
    `<div class="rtxt"><label>Saúde da operação</label><strong>${h.label}</strong><small>${esc(h.cause)}</small></div></div>` +
    `<div class="hstats">${rate}${meta}${retr}</div>` +
    `<div class="hcard pcard"><div class="ph"><label>Pulso da operação · últimos 60 min</label><span><i class="lg ok"></i>peças/min <i class="lg bad"></i>${esc(rejLabel.toLowerCase())}</span></div>${pulse}</div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const v = el.querySelector('#ringVal');
    if (v) v.style.strokeDashoffset = off(score);
  }));
  prevScore = score;
  firstPulse = false;
  return h;
}

// ---- estações de indução ao vivo ----
export function renderStations(el, c) {
  const { fall, now, cfg, filter } = c;
  const w0 = now - cfg.nowMin * 60000;
  const m = new Map();
  const lay = new Map();
  for (const r of fall) {
    if (r.ly && !lay.has(r.ind)) lay.set(r.ind, r.ly.replace('Layer', 'L'));
    let x = m.get(r.ind);
    if (!x) { x = { ind: r.ind, day: 0, tot: 0, rej: 0 }; m.set(r.ind, x); }
    x.day++;
    if (r.t >= w0) { x.tot++; if (A.isRej(r)) x.rej++; }
  }
  const L = [...m.values()].sort((a, b) => a.ind - b.ind);
  if (!L.length) { el.innerHTML = '<div class="empty">Sem dados.</div>'; return; }
  const mxT = Math.max(1, ...L.map((x) => x.tot));
  const sumT = L.reduce((a, x) => a + x.tot, 0), sumR = L.reduce((a, x) => a + x.rej, 0);
  const avgRate = sumT ? sumR / sumT : 0, th = cfg.rejectThreshold;
  el.innerHTML = '<div class="stations" style="--n:' + Math.min(L.length, 12) + '">' + L.map((x) => {
    const rate = x.tot ? (x.rej / x.tot) * 100 : 0;
    const idle = x.tot === 0;
    const out = x.tot >= 30 && x.rej >= 3 && rate >= Math.max(th, avgRate * 100 * 2);
    const di = c.an && c.an.inds.find((i) => i.no === x.ind);
    const cls = di && di.status === 'parada' ? 'idle' : di && di.status === 'falha' ? 'bad' : idle ? 'idle' : out ? 'bad' : rate >= th ? 'warn' : 'ok';
    const tip = `Indução ${x.ind}${lay.get(x.ind) ? ' · ' + lay.get(x.ind) : ''}\nÚltimos ${cfg.nowMin} min: ${fmt(x.tot)} peças, ${fmt(x.rej)} rejeitos (${pct(x.rej, x.tot, 2)})\nHoje: ${fmt(x.day)} peças`;
    return `<div class="st ${cls} ${filter.ind === x.ind ? 'sel' : ''}" data-f="ind" data-v="${x.ind}" data-tip="${esc(tip)}">` +
      `<div class="sh"><b>${String(x.ind).padStart(2, '0')}</b><span>${lay.get(x.ind) || ''}</span></div>` +
      `<div class="sv">${idle ? '—' : fmt(Math.round((x.tot * 60) / cfg.nowMin))}<em>/h</em></div>` +
      `<div class="sb"><i style="width:${(x.tot / mxT) * 100}%"></i></div>` +
      `<div class="sf">${di && di.status === 'parada' ? 'PARADA' : di && di.status === 'falha' ? 'EM FALHA' : idle ? 'ligada, sem peças' : `${fmt(x.rej)} rej · ${pct(x.rej, x.tot, 1)}`}</div></div>`;
  }).join('') + '</div>';
}

// ---- números animados ----
const prevN = {};
export function animateKpis(root) {
  root.querySelectorAll('b[data-n]').forEach((b) => {
    const to = +b.dataset.n, key = b.dataset.k, from = prevN[key] ?? 0;
    prevN[key] = to;
    if (from === to) { b.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 650;
    const step = (t) => {
      const k = Math.max(0, Math.min(1, (t - t0) / dur)), e = 1 - Math.pow(1 - k, 3);
      b.textContent = fmt(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// ---- alerta sonoro/visual quando uma saída começa a bloquear ----
let actx = null;
const alerted = new Set();
export function enableAudio() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (e) { /* sem áudio */ } }
export function beep() {
  if (!actx) return;
  [0, 0.22].forEach((d, i) => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = i ? 740 : 988; o.type = 'sine';
    g.gain.setValueAtTime(0.0001, actx.currentTime + d);
    g.gain.exponentialRampToValueAtTime(0.25, actx.currentTime + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + d + 0.2);
    o.connect(g); g.connect(actx.destination); o.start(actx.currentTime + d); o.stop(actx.currentTime + d + 0.22);
  });
}
export function alertCheck(ns, cfg) {
  const act = new Set(ns.activeChutes.map(([c]) => c));
  let fresh = false;
  for (const c of act) if (!alerted.has(c)) { alerted.add(c); fresh = true; }
  for (const c of [...alerted]) if (!act.has(c)) alerted.delete(c);
  document.title = act.size ? `🔴 ${act.size} saída(s) bloqueando · Sorter Monitor` : 'Sorter Monitor';
  if (fresh && cfg.sound) beep();
  return fresh;
}
