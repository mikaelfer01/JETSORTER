// Tela "Histórico": hoje contra dias anteriores, tendência, sazonalidade, mapa de calor, ranking de turnos e semanas.
import { HS, loadHist, syncHistory, getToday, dayList, ap, upTo, avgDays, keysBack, turnoDaHora, exportHist, importHist } from './history.js';
import { turnoCfg } from './turnos.js';
import { esc, fmt, dec, pc, p2, dkey, kd, WD, DAY, HOUR, hm, card, grid2, kvs, note, table, rate, colChart, lineChart, heat, hbars, tag, btn, jsonDownload, csvDownload } from './kit.js';

const delta = (a, b) => { if (!b) return '—'; const d = pc(a - b, b); return Math.abs(d) < 0.05 ? '= 0,0%' : `${d > 0 ? '▲' : '▼'} ${dec(Math.abs(d), 1)}%`; };
const dcls = (a, b, goodUp = true) => (!b ? '' : (a >= b) === goodUp ? 'ok' : 'bad');
let busyToday = false;

export async function renderHist(el, ctx) {
  const { now, cfg } = ctx;
  await loadHist();
  if (!el._bound) {
    el._bound = true;
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-hist]'); if (!b) return;
      const k = b.dataset.hist;
      if (k === 'sync') { b.disabled = true; await syncHistory(Date.now(), true); ctx.redraw(); }
      else if (k === 'export') jsonDownload(`historico-sorter-${dkey(Date.now())}.json`, exportHist());
      else if (k === 'csv') { const L = dayList().map((d) => [d, HS.days[d].tot, HS.days[d].abn, HS.days[d].blk, HS.days[d].l1, HS.days[d].l2]); csvDownload('historico-diario.csv', ['dia', 'processado', 'rejeito', 'chute_block', 'linha_A', 'linha_B'], L); }
      else if (k === 'import') { const f = document.createElement('input'); f.type = 'file'; f.accept = 'application/json'; f.onchange = async () => { try { const n = await importHist(JSON.parse(await f.files[0].text())); alert(`${n} dia(s) importado(s).`); ctx.redraw(); } catch (er) { alert(er.message); } }; f.click(); }
    });
  }
  if (!HS.last && !HS.busy) syncHistory(now).then(() => ctx.redraw());
  if (!busyToday && (!HS.today || now - HS.todayAt > 60000)) { busyToday = true; getToday(now).then(() => { busyToday = false; ctx.redraw(); }); }
  const today = HS.today;
  const days = dayList();
  const curH = new Date(now).getHours();
  const head = `<section class="card"><h2>Histórico guardado <small>${days.length ? `${days.length} dia(s) · ${days[0].split('-').reverse().join('/')} a ${days[days.length - 1].split('-').reverse().join('/')}` : 'ainda sem dias'}${HS.busy ? ' · atualizando ' + HS.prog : ''}</small></h2>` +
    `<p class="muted nt">O sorter só guarda o dia corrente de trace; por isso o painel guarda o fechamento de cada dia (totais por hora e por linha do Summary, mais indução, saída e motivo da trace). Os últimos 31 dias são recuperados do Summary do sorter na primeira abertura.${HS.err ? ` <b style="color:var(--bad)">${esc(HS.err)}</b>` : ''}</p>` +
    `<div class="kbar">${btn('Atualizar histórico', 'data-hist="sync"')}${btn('Exportar backup (JSON)', 'data-hist="export"')}${btn('Importar backup', 'data-hist="import"')}${btn('Exportar dias (CSV)', 'data-hist="csv"')}</div></section>`;
  if (!days.length || !today) { el.innerHTML = head + `<section class="card"><p class="muted">${HS.busy ? 'Recuperando os últimos dias do sorter…' : 'Aguardando dados do sorter.'}</p></section>`; return; }

  // ----- hoje contra referências (horas fechadas) -----
  const refs = [['mesmo dia da semana passada', keysBack(now, 1, true, true).concat(keysBack(now, 99, true, true)).slice(0, 1)], ['média dos últimos 7 dias', keysBack(now, 7)], ['média dos últimos 30 dias', keysBack(now, 30)]];
  const tn = upTo({ h: today.h }, curH);
  const rows = refs.map(([nm, ks]) => { const a = avgDays(ks); if (!a) return null; const u = upTo(a, curH); return { nm, a, u }; });
  const kp = [['Hoje até ' + p2(curH) + ':00', fmt(tn.tot), 'blue', `${fmt(today.tot)} no total até agora`], ['Aproveitamento hoje', dec(pc(tn.tot - tn.abn, tn.tot)) + '%', pc(tn.abn, tn.tot) > (+cfg.rejectThreshold || 3) ? 'bad' : 'ok', `${fmt(tn.abn)} rejeitos`]];
  for (const r of rows) if (r) kp.push(['vs ' + r.nm, delta(tn.tot, r.u.tot), dcls(tn.tot, r.u.tot), `${fmt(Math.round(r.u.tot))} no mesmo recorte`]);

  // ----- hora a hora -----
  const hrs = Array.from({ length: 24 }, (_, i) => p2(i) + 'h');
  const wk = avgDays(keysBack(now, 1, true, true).slice(0, 1)), a7 = avgDays(keysBack(now, 7)), a30 = avgDays(keysBack(now, 30));
  const serH = [{ name: 'Hoje', vals: today.h.map((x, i) => (i <= curH ? x[0] : null)) }];
  if (wk) serH.push({ name: 'Semana passada', vals: wk.h.map((x) => x[0]), dash: true });
  if (a7) serH.push({ name: 'Média 7 dias', vals: a7.h.map((x) => Math.round(x[0])), dash: true });
  const cc = [];
  // evento do dia: plano ativado / alertas
  const ev = (ctx.events ? ctx.events(now) : []).filter((x) => x.t >= kd(dkey(now)));
  const evHtml = ev.length ? `<p class="muted nt"><b>Linha do tempo de hoje:</b> ${ev.slice(0, 14).map((x) => `${hm(x.t)} ${esc(x.txt)}`).join(' · ')}${ev.length > 14 ? ` · +${ev.length - 14}` : ''}</p>` : '';
  const insH = (() => { if (!a7) return 'Faltam dias para comparar.'; const peak = a7.h.map((x, i) => [x[0], i]).sort((a, b) => b[0] - a[0])[0][1], tp = today.h.map((x, i) => [x[0], i]).sort((a, b) => b[0] - a[0])[0]; return `Pico típico às ${p2(peak)}h; hoje o maior volume foi às ${p2(tp[1])}h (${fmt(tp[0])}). ${tp[1] !== peak ? 'O pico de hoje saiu do horário habitual.' : 'O pico está no horário habitual.'}`; })();

  // ----- 30 dias -----
  const d30 = days.slice(-30);
  const lab30 = d30.map((k) => k.slice(8) + '/' + k.slice(5, 7));
  const lim = +cfg.rejectThreshold || 3;
  const med = d30.map((k) => HS.days[k].tot).filter((v) => v > 0).sort((a, b) => a - b), mean = med.reduce((a, b) => a + b, 0) / (med.length || 1);
  const sd = Math.sqrt(med.reduce((a, b) => a + (b - mean) ** 2, 0) / (med.length || 1));
  const atip = d30.filter((k) => HS.days[k].tot > mean + 1.5 * sd || (HS.days[k].tot > 0 && HS.days[k].tot < mean - 1.5 * sd)).map((k) => `${k.slice(8)}/${k.slice(5, 7)} (${fmt(HS.days[k].tot)})`);
  const insV = `Média de ${fmt(Math.round(mean))} peças/dia nos últimos ${d30.length} dias.${atip.length ? ' Dias fora do padrão (picos ou quedas): ' + atip.join(', ') + '.' : ''}`;
  const worst = d30.filter((k) => HS.days[k].tot > 0).map((k) => [k, ap(HS.days[k])]).sort((a, b) => a[1] - b[1])[0];

  // ----- sazonalidade e mapa de calor -----
  const byWd = Array.from({ length: 7 }, () => []);
  for (const k of days.slice(-60)) if (HS.days[k].tot > 0) byWd[new Date(kd(k)).getDay()].push(k);
  const wdAvg = byWd.map((ks) => avgDays(ks));
  const order = [1, 2, 3, 4, 5, 6, 0];
  const insW = (() => { const v = order.map((w) => [w, wdAvg[w] ? wdAvg[w].tot : 0]).filter((x) => x[1]); if (v.length < 2) return 'Poucos dias para comparar.'; v.sort((a, b) => b[1] - a[1]); return `${WD[v[0][0]]} é o dia mais forte (${fmt(Math.round(v[0][1]))}/dia) e ${WD[v[v.length - 1][0]]} o mais fraco (${fmt(Math.round(v[v.length - 1][1]))}/dia): diferença de ${dec(pc(v[0][1] - v[v.length - 1][1], v[v.length - 1][1]), 0)}%.`; })();
  const heatHtml = heat(order.map((w) => WD[w]), hrs, (i, j) => (wdAvg[order[i]] ? Math.round(wdAvg[order[i]].h[j][0]) : null));
  const slots = []; order.forEach((w) => { if (wdAvg[w]) wdAvg[w].h.forEach((x, h) => slots.push({ w, h, v: x[0] })); });
  const mxs = Math.max(1, ...slots.map((s) => s.v));
  const idle = slots.filter((s) => s.v > mxs * 0.02 && s.v < mxs * 0.3).sort((a, b) => a.v - b.v).slice(0, 8);
  const insHeat = idle.length ? `Janelas de baixo volume (boas para manutenção e limpeza de sensores): ${idle.map((s) => `${WD[s.w]} ${p2(s.h)}h (${fmt(Math.round(s.v))})`).join(', ')}.` : 'Sem janelas ociosas claras no período.';

  // ----- turnos -----
  const tc = turnoCfg(cfg), TN = ['T1', 'T2', 'T3'];
  const tAgg = (ks) => { const o = { T1: { tot: 0, abn: 0, blk: 0 }, T2: { tot: 0, abn: 0, blk: 0 }, T3: { tot: 0, abn: 0, blk: 0 } }; for (const k of ks) { const d = HS.days[k]; if (!d || !d.h) continue; d.h.forEach((x, hr) => { const t = o[turnoDaHora(hr, tc)]; t.tot += x[0]; t.abn += x[1]; t.blk += x[2]; }); } return o; };
  const k7 = keysBack(now, 7).filter((k) => HS.days[k]), k30 = keysBack(now, 30).filter((k) => HS.days[k]);
  const T7 = tAgg(k7), T30 = tAgg(k30);
  const trows = TN.map((t) => [`<b>${t}</b>`, fmt(Math.round(T7[t].tot / (k7.length || 1))), rate(pc(T7[t].tot - T7[t].abn, T7[t].tot), pc(T7[t].abn, T7[t].tot) > lim), fmt(Math.round(T7[t].blk / (k7.length || 1))), fmt(Math.round(T30[t].tot / (k30.length || 1))), rate(pc(T30[t].tot - T30[t].abn, T30[t].tot), pc(T30[t].abn, T30[t].tot) > lim), fmt(Math.round(T30[t].blk / (k30.length || 1)))]);
  const best = TN.slice().sort((a, b) => T7[b].tot - T7[a].tot)[0], lossy = TN.slice().sort((a, b) => pc(T7[b].abn, T7[b].tot) - pc(T7[a].abn, T7[a].tot))[0];
  const insT = `Nos últimos 7 dias, ${best} é o turno que mais processa e ${lossy} o que mais perde (${dec(pc(T7[lossy].abn, T7[lossy].tot), 2)}% de rejeito). Aproximação por hora cheia (a virada às ${p2(Math.floor(tc[2] / 60))}:${p2(tc[2] % 60)} cai dentro de uma hora).`;

  // ----- semanas -----
  const wkOf = (k) => { const t = kd(k), d = new Date(t), off = (d.getDay() + 6) % 7; return dkey(t - off * DAY); };
  const W = new Map(); for (const k of days) { const w = wkOf(k), d = HS.days[k]; if (d.tot <= 0) continue; const o = W.get(w) || { tot: 0, abn: 0, blk: 0, n: 0 }; o.tot += d.tot; o.abn += d.abn; o.blk += d.blk; o.n++; W.set(w, o); }
  const wl = [...W].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 6);
  const wrows = wl.map(([k, o], i) => { const prev = wl[i + 1] ? wl[i + 1][1] : null; return [`semana de ${k.slice(8)}/${k.slice(5, 7)}${i === 0 ? ' ' + tag('em curso', 'on') : ''}`, o.n, fmt(o.tot), fmt(Math.round(o.tot / o.n)), rate(pc(o.tot - o.abn, o.tot), pc(o.abn, o.tot) > lim), fmt(o.blk), prev ? delta(o.tot / o.n, prev.tot / prev.n) : '—']; });

  // ----- induções e saídas no tempo -----
  const snap = days.filter((k) => HS.days[k].ind);
  const last7 = snap.slice(-7), prev7 = snap.slice(-14, -7);
  const sumKey = (ks, f) => { const m = {}; for (const k of ks) { const o = HS.days[k][f] || {}; for (const c in o) m[c] = (m[c] || 0) + o[c]; } return m; };
  const iT = sumKey(last7, 'ind'), iR = sumKey(last7, 'indRej'), iP = sumKey(prev7, 'ind'), iPR = sumKey(prev7, 'indRej');
  const irows = Object.keys(iT).sort((a, b) => a - b).map((n) => { const r1 = pc(iR[n] || 0, iT[n]), r0 = iP[n] ? pc(iPR[n] || 0, iP[n]) : null; return [`<b>${p2(n)}</b>`, fmt(Math.round(iT[n] / last7.length)), r0 == null ? '—' : delta(iT[n] / last7.length, iP[n] / prev7.length), rate(r1, r1 > lim), r0 == null ? '—' : `<span class="${r1 > r0 ? 'bad' : 'ok'}">${r1 > r0 ? '▲' : '▼'} ${dec(Math.abs(r1 - r0), 2)} p.p.</span>`]; });
  const cb = sumKey(last7, 'chBlk'), cbp = sumKey(prev7, 'chBlk');
  const crows = Object.entries(cb).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([c, n]) => [`<b>${esc(c)}</b>`, fmt(n), fmt(cbp[c] || 0), cbp[c] ? `<span class="${n > cbp[c] ? 'bad' : 'ok'}">${n > cbp[c] ? '▲' : '▼'} ${dec(Math.abs(pc(n - cbp[c], cbp[c])), 0)}%</span>` : tag('novo', 'on')]);

  el.innerHTML = head +
    card('Hoje contra os dias anteriores', 'horas fechadas até ' + p2(curH) + ':00', 'Compara o volume e o aproveitamento de hoje com o mesmo recorte de horário em outros dias.', kvs(kp), '') +
    grid2(
      card('Hora a hora: hoje × referências', 'peças', 'Linha cheia = hoje; tracejadas = semana passada e média dos 7 dias anteriores.', lineChart(hrs, serH) + evHtml, insH, 'wide') +
      card('Volume por dia', 'últimos ' + d30.length + ' dias', 'Total processado de cada dia fechado.', colChart(lab30, [{ name: 'Processado', vals: d30.map((k) => HS.days[k].tot), color: '#2563eb' }], { ref: { v: Math.round(mean), label: 'média ' + fmt(Math.round(mean)) } }), insV) +
      card('Aproveitamento por dia', '(processado − rejeito) ÷ processado', 'Linha tracejada = mínimo aceitável pelo limite de rejeito.', lineChart(lab30, [{ name: 'Aproveitamento %', vals: d30.map((k) => (HS.days[k].tot > 0 ? +ap(HS.days[k]).toFixed(2) : null)), color: '#16a34a' }], { fmtV: (v) => dec(v, 1) + '%', lo: Math.max(0, Math.floor(Math.min(...d30.map((k) => (HS.days[k].tot > 0 ? ap(HS.days[k]) : 100)), 100 - lim) - 1)), hi: 100, ref: { v: 100 - lim, label: 'mínimo ' + dec(100 - lim, 0) + '%' } }), worst ? `Pior dia: ${worst[0].slice(8)}/${worst[0].slice(5, 7)} com ${dec(worst[1], 2)}% de aproveitamento.` : '') +
      card('Sazonalidade por dia da semana', 'média dos últimos 60 dias', 'Volume médio de cada dia da semana (só dias com produção).', colChart(order.map((w) => WD[w]), [{ name: 'Média/dia', vals: order.map((w) => (wdAvg[w] ? Math.round(wdAvg[w].tot) : 0)), color: '#0d9488' }]), insW) +
      card('Mapa de calor: dia da semana × hora', 'peças por hora (média)', 'Mais escuro = mais volume. Mostra os picos e as horas ociosas da semana.', heatHtml, insHeat, 'wide')) +
    card('Ranking de turnos', 'média por dia', 'Volume, aproveitamento e Chute block por turno nos últimos 7 e 30 dias.', table(['Turno', 'Média/dia 7d', 'Aproveit. 7d', 'Chute block/dia 7d', 'Média/dia 30d', 'Aproveit. 30d', 'Chute block/dia 30d'], trows, { right: [1, 2, 3, 4, 5, 6] }), insT, 'wide') +
    card('Tendência semanal', 'segunda a domingo', 'Cada linha é uma semana; a última está em curso.', table(['Semana', 'Dias', 'Processado', 'Média/dia', 'Aproveit.', 'Chute block', 'Média/dia vs anterior'], wrows, { right: [1, 2, 3, 4, 5, 6] }), '', 'wide') +
    (snap.length >= 2 ? grid2(
      card('Induções no tempo', 'últimos 7 dias contra os 7 anteriores', 'Média diária, variação de volume e variação da taxa de rejeito (p.p. = pontos percentuais).', table(['Indução', 'Média/dia', 'Volume', 'Rejeito', 'Variação'], irows, { right: [1, 2, 3, 4] }), 'Aumento de rejeito numa indução com volume estável aponta para o posto (sensor, etiqueta, operação).') +
      card('Saídas com Chute block no tempo', 'últimos 7 dias contra os 7 anteriores', 'Total de Chute block por saída; as 12 maiores.', table(['Saída', '7 dias', '7 anteriores', 'Variação'], crows, { right: [1, 2, 3] }), '')) : card('Induções e saídas no tempo', '', '', note('A foto diária de induções e saídas começa a ser guardada agora; as comparações aparecem a partir do segundo dia com o painel aberto.'), ''));
}
