// "Resumo do momento": leitura em linguagem simples do estado atual, gerada dos mesmos números do painel.
// Só afirma o que os dados mostram; causas aparecem como "verifique", nunca como certeza.
import * as A from './analysis.js';
import { health } from './hero.js';

const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
const dec = (n, d = 1) => Number(n).toFixed(d).replace('.', ',');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mins = (ms) => Math.max(0, Math.round(ms / 60000));

export function renderBrief(el, c) {
  const { fall, now, ns, st, cfg, an, binds } = c;
  if (!fall.length) { el.innerHTML = '<div class="bf"><b>Sem peças descarregadas hoje ainda.</b></div>'; return; }
  const h = health(ns, st, cfg);
  const lines = [];
  const acts = [];

  // situação
  const sit = h.idle ? 'Sem fluxo nos últimos ' + cfg.nowMin + ' min.' : `${h.label} (nota ${h.score}/100).`;
  const last = Math.max(...fall.map((r) => r.t));
  const silent = mins(now - last);
  if (silent >= 5) acts.push(`Nenhuma peça descarregada há ${silent} min: confira se o sorter/induções estão rodando.`);

  // fluxo
  const mset = new Set(); for (const r of fall) mset.add(Math.floor(r.t / 60000));
  const avg = mset.size ? (fall.length / mset.size) * 60 : 0;
  const trend = avg ? (ns.perHour / avg - 1) * 100 : 0;
  lines.push(`<b>Fluxo:</b> ${fmt(Math.round(ns.perHour))} peças/h agora` + (avg ? (Math.abs(trend) < 5 ? ', em linha com a média do dia' : trend > 0 ? `, ${dec(trend, 0)}% acima da média do dia` : `, ${dec(-trend, 0)}% abaixo da média do dia`) : '') + `. ${fmt(fall.length)} peças processadas desde 00:00.`);

  // rejeitos
  const rej = fall.filter(A.isRej);
  const rate = fall.length ? (rej.length / fall.length) * 100 : 0;
  const by = new Map(); for (const r of rej) by.set(r.ex, (by.get(r.ex) || 0) + 1);
  const top = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
  let rt = `<b>Rejeitos:</b> ${dec(rate, 2)}% hoje (${fmt(rej.length)} peças; limite de alerta ${dec(cfg.rejectThreshold, 1)}%)`;
  if (top) rt += `. Motivo principal: ${esc(A.reasonLabel(top[0]))} (${dec((top[1] / rej.length) * 100, 0)}%)`;
  rt += ns.total >= 10 ? `. Nos últimos ${cfg.nowMin} min: ${dec(ns.rate, 2)}%.` : '.';
  lines.push(rt);
  if (ns.total >= 10 && ns.rate >= cfg.rejectThreshold) acts.push(`Rejeito de ${dec(ns.rate, 2)}% nos últimos ${cfg.nowMin} min está acima do limite: veja "Ofensores" e a aba Saídas.`);

  // saídas bloqueando
  if (ns.activeChutes.length) {
    const l = ns.activeChutes.slice(0, 4).map(([k, n]) => `${esc(A.chuteLabel(k))} (${n})`).join(', ');
    lines.push(`<b>Saídas bloqueando agora:</b> ${l}.`);
    acts.push(`Verifique/esvazie as saídas ${ns.activeChutes.slice(0, 4).map(([k]) => esc(A.chuteLabel(k))).join(', ')}: estão recusando peças (Chute block).`);
  }

  // induções
  if (an) {
    const falha = an.inds.filter((i) => i.status === 'falha').map((i) => String(i.no).padStart(2, '0'));
    const parada = an.inds.filter((i) => i.status === 'parada').map((i) => String(i.no).padStart(2, '0'));
    if (falha.length) { lines.push(`<b>Induções em falha:</b> ${falha.join(', ')}.`); acts.push(`Induções em falha (${falha.join(', ')}): ver aba Equipamentos.`); }
    if (parada.length) lines.push(`<b>Induções paradas:</b> ${parada.join(', ')} (o sorter as reporta como paradas; não é falha).`);
    if (an.full && an.full.length) acts.push(`${an.full.length} saída(s) cheia(s) segundo o sorter: ver aba Equipamentos.`);
  }

  // lotes e peças sem descarga
  const nb = binds ? [...binds.values()].filter((b) => b.t >= now - 30 * 60000).length : 0;
  if (nb) { lines.push(`<b>Falhas ao abrir lote:</b> ${nb} nos últimos 30 min.`); acts.push('Falha ao abrir lote: o código de rota do lote não bate com a saída. Confira o lote e a saída indicados no aviso.'); }
  if (st.fed && st.n / st.fed >= 0.01) acts.push(`${fmt(st.n)} peças (${dec((st.n / st.fed) * 100, 1)}%) alimentadas há mais de 20 min sem descarga: ver "Sem descarga" na aba Induções.`);

  el.innerHTML = `<div class="bf"><div class="bfh"><span class="bfdot ${h.cls}"></span><b>Resumo do momento</b><span>${esc(sit)}</span></div>` +
    `<ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>` +
    `<div class="bfa ${acts.length ? 'todo' : 'ok'}"><b>${acts.length ? 'O que fazer agora' : 'Nada urgente agora'}</b>${acts.length ? `<ol>${acts.map((a) => `<li>${a}</li>`).join('')}</ol>` : '<span> — sem saída bloqueando, sem falha ativa e rejeito dentro do limite.</span>'}</div></div>`;
}
