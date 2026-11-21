// Rastreio de peças e lotes: busca por waybill (uma ou várias), "por que foi rejeitada?", vizinhas, histórico longo, lote × peças,
// peças sem descarga e peças por saída. Somente consultas de leitura (POST de busca do próprio sistema; nenhum comando é enviado).
import { getJson } from './api.js';
import { compact } from './store.js';
import * as A from './analysis.js';
import { baseOf, PLAN } from './plan.js';
import { parseLote } from './system.js';
import { p2, fmt, esc, MIN, hm, dm, dur, ago, card, grid2, kvs, table, tag, btn, note, csvDownload } from './kit.js';

export const BS = { q: '', res: null, busy: false, err: '', tab: 'pecas', lote: null, ch: '', chRes: null };

const post = (p, f) => getJson(p, { method: 'POST', form: f });
const FORM = (q) => ({ page: 1, perPage: 20, advanced_query: 0, waybillno: q, gongtime: '', dischargetime: '', dischargechute: '', trayno: '', inductionno: '', containerno: '', exception: '', srflag: -1 });

// explica a rejeição em linguagem simples, cruzando saída, plano, falhas de lote e estado
export function explicar(r, c) {
  const { binds, an, now } = c;
  if (!r.ex) return r.dc ? 'Peça processada normalmente.' : 'Peça lida, ainda sem descarga registrada.';
  const ch = A.chuteKey(r), no = String(parseInt(ch, 10)), base = baseOf(ch);
  const out = [];
  if (r.ex === A.BLOCK) {
    out.push(`Saída pretendida ${A.chuteLabel(ch)}${base ? ' (' + base + ')' : ''} estava indisponível quando a peça passou; ela seguiu para a saída de exceção ${r.dc || '—'}.`);
    for (const b of binds ? binds.values() : []) if (String(parseInt(b.chute, 10)) === no && Math.abs(b.t - r.t) <= 15 * MIN) { out.push(`Havia falha de abertura de lote nessa saída às ${hm(b.t)}.`); break; }
    for (const s of c.state || []) if (s.grp === 'chute' && String(s.no) === no && (s.kind === 'cheia' || s.kind === 'fechada')) out.push(`Hoje a saída consta como ${s.kind === 'cheia' ? 'cheia' : 'fechada'} desde ${hm(s.since)}.`);
    if (an) for (const e of an.ev) if (e.grp === 'chute' && String(e.no) === no && e.start <= r.t && (!e.end || e.end >= r.t)) { out.push(`Evento de saída no momento: ${e.kind === 'cheia' ? 'saída cheia' : e.kind === 'fechada' ? 'saída fechada' : e.kind}.`); break; }
    if (PLAN.map.size && !PLAN.map.has(no)) out.push('Essa saída não consta no plano de triagem ativo.');
  } else if (/996/.test(r.ex)) out.push('A rota da peça não está no plano de triagem ativo (sem plano). Confira o segmento no plano.');
  else if (/995/.test(r.ex)) out.push('Sem sortcode: a peça não trouxe código de segmento para decidir a saída.');
  else if (/999/.test(r.ex)) out.push('Peça interceptada pelo sistema (intercept).');
  else if (/998/.test(r.ex)) out.push('Peça cancelada.');
  else if (/Get chute fail/i.test(r.ex)) out.push('O sistema não conseguiu obter uma saída para a peça.');
  else out.push('Exceção: ' + A.reasonLabel(r.ex));
  return out.join(' ');
}

async function buscar(q, c) {
  const L = [...new Set(String(q).split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))].slice(0, 60);
  BS.q = q; BS.busy = true; BS.err = ''; BS.res = null; c.redraw();
  const res = [];
  try {
    for (let i = 0; i < L.length; i += 4) {
      await Promise.all(L.slice(i, i + 4).map(async (w) => {
        const o = { q: w, rows: [], adj: [], long: [], err: '' };
        try {
          const tr = await post('/query/trace?action=fetchdata', FORM(w));
          o.rows = (tr.data || []).map(compact).map((r, k) => ({ ...r, raw: tr.data[k] }));
          if (!o.rows.length) { try { const tl = await post('/query/tracelong?action=fetchdata', FORM(w)); o.long = (tl.data || []).map(compact); } catch { /* histórico longo opcional */ } }
          if (L.length <= 3 && (o.rows[0] || o.long[0])) {
            try { const base = o.rows[0] || o.long[0]; const a = await post('/query/adjacent?action=fetchdata', { page: 1, perPage: 20, waybillno: w, previous: 5, next: 5, time: base.raw ? base.raw.gongtime : '', layer: -1, dependson: 1 }); o.adj = a.data || []; } catch { /* vizinhas opcionais */ }
          }
        } catch (e) { o.err = e.message || String(e); }
        res.push(o);
      }));
    }
  } catch (e) { BS.err = e.message || String(e); }
  const idx = new Map(L.map((w, i) => [w, i])); res.sort((a, b) => idx.get(a.q) - idx.get(b.q));
  BS.res = res; BS.busy = false; c.redraw();
}

async function buscarLote(q, c) {
  BS.busy = true; BS.lote = null; c.redraw();
  try {
    const pk = await post('/query/packLogs?action=fetchdata', { page: 1, perPage: 20, dischargechute: '', containerno: q, bindtime: '' });
    const L = (pk.data || []).map(parseLote);
    const out = [];
    for (const l of L.slice(0, 5)) {
      const pcs = c.rows.filter((r) => r.dc && String(parseInt(r.dc, 10)) === String(parseInt(l.ch, 10)) && r.t >= l.open - 1000 && r.t <= (l.close || c.now) + 1000);
      out.push({ l, n: pcs.length, dif: l.n - pcs.length, ex: pcs.filter((r) => r.ex).length });
    }
    BS.lote = { q, items: out };
  } catch (e) { BS.err = e.message || String(e); }
  BS.busy = false; c.redraw();
}

const linhaPeca = (r, c) => [esc(r.wb), dm(r.t), 'Ind. ' + p2(r.ind), esc(A.chuteLabel(A.chuteKey(r))), esc(r.dc || '—'), r.ex ? tag(esc(A.reasonLabel(r.ex)), 'bad') : tag('ok', 'ok'), r.tm ? dec1(r.tm / 1000) + ' s' : '—', esc(explicar(r, c))];
const dec1 = (n) => Number(n).toFixed(1).replace('.', ',');
const HEAD = ['Waybill', 'Lida em', 'Indução', 'Saída pretendida', 'Saída final', 'Resultado', 'Trânsito', 'Leitura'];

export function renderBusca(el, c) {
  const { now, rows } = c;
  const bar = `<div class="kbar kfind"><textarea id="bsq" rows="2" placeholder="Cole um ou vários waybills (separados por espaço, vírgula ou linha)…">${esc(BS.q)}</textarea>${btn('Buscar peças', 'data-bs="go"')}<input id="bslote" type="text" placeholder="Número do lote (container)" value="${esc(BS.lote ? BS.lote.q : '')}"/>${btn('Buscar lote', 'data-bs="lote"')}</div>`;
  const tabs = [['pecas', 'Resultado da busca'], ['semdesc', 'Sem descarga'], ['saida', 'Por saída']].map(([k, n]) => `<button class="btn ${BS.tab === k ? 'on' : ''}" data-bs="tab" data-k="${k}">${n}</button>`).join('');
  let body = '';
  if (BS.tab === 'pecas') {
    if (BS.busy) body = note('Consultando o sorter…');
    else if (BS.err) body = `<p class="alert warn">${esc(BS.err)}</p>`;
    else if (BS.res) {
      const ach = BS.res.filter((o) => o.rows.length), perd = BS.res.filter((o) => !o.rows.length);
      const lines = ach.flatMap((o) => o.rows.map((r) => linhaPeca(r, c)));
      body = kvs([['Buscadas', fmt(BS.res.length)], ['Encontradas', fmt(ach.length), 'ok'], ['Não encontradas', fmt(perd.length), perd.length ? 'warn' : 'ok'], ['Rejeitadas', fmt(ach.filter((o) => o.rows.some((r) => r.ex)).length), 'bad']]) +
        table(HEAD, lines, { empty: 'Nenhuma peça encontrada no trace do sorter.', cls: 'tnt wide', max: 100 }) +
        (perd.length ? `<p class="muted nt">Não encontradas no trace atual: ${perd.map((o) => esc(o.q) + (o.long.length ? ' (achada no histórico longo)' : '')).join(', ')}.</p>` : '') +
        BS.res.filter((o) => o.long.length).map((o) => `<h4>Histórico longo · ${esc(o.q)}</h4>` + table(HEAD, o.long.map((r) => linhaPeca(r, c)), { cls: 'tnt wide' })).join('') +
        BS.res.filter((o) => o.adj.length).map((o) => `<h4>Peças vizinhas · ${esc(o.q)}</h4>` + table(['Waybill', 'Posição'], o.adj.map((a) => [esc(a.waybillno), esc(a.previous != null ? 'antes' : a.next != null ? 'depois' : '')]), { cls: 'tnt' })).join('') +
        `<div class="kbar">${btn('Exportar CSV', 'data-bs="csv"')}</div>`;
    } else body = note('Digite waybills e clique em “Buscar peças”. A busca também encontra o lote em que a peça foi descarregada.');
    if (BS.lote) body += `<h4>Lote ${esc(BS.lote.q)} × peças descarregadas</h4>` + table(['Lote', 'Saída', 'Abertura', 'Fechamento', 'Total do lote', 'Peças vistas na trace', 'Diferença', 'Rejeitos na janela'], BS.lote.items.map(({ l, n, dif, ex }) => [esc(l.lote), esc(l.ch), l.open ? dm(l.open) : '—', l.close ? dm(l.close) : 'aberto', fmt(l.n), fmt(n), `<b class="${Math.abs(dif) > 2 ? 'bad' : 'ok'}">${dif > 0 ? '+' : ''}${fmt(dif)}</b>`, fmt(ex)]), { right: [4, 5, 6, 7], empty: 'Lote não encontrado.', cls: 'tnt' }) + note('Diferença = total registrado no lote − peças descarregadas na saída durante a vida do lote. Diferenças grandes indicam peça sem leitura, lote reaberto ou peça de outro turno.');
  } else if (BS.tab === 'semdesc') {
    const L = rows.filter((r) => !r.dc && !r.ex && now - r.t > 20 * MIN).sort((a, b) => a.t - b.t);
    body = kvs([['Sem descarga há mais de 20 min', fmt(L.length), L.length ? 'warn' : 'ok']]) + table(['Waybill', 'Lida em', 'Há', 'Indução', 'Saída pretendida'], L.slice(0, 200).map((r) => [esc(r.wb), dm(r.t), ago(r.t, now), 'Ind. ' + p2(r.ind), esc(A.chuteLabel(A.chuteKey(r)))]), { empty: 'Nenhuma peça parada no sorter. ✅', cls: 'tnt', max: 200 }) + `<div class="kbar">${btn('Exportar CSV', 'data-bs="csvsd"')}</div>`;
  } else {
    const opts = [...new Set(rows.map((r) => A.chuteKey(r)))].filter((k) => k && !k.startsWith('(')).sort((a, b) => parseInt(a) - parseInt(b));
    const L = BS.ch ? rows.filter((r) => A.chuteKey(r) === BS.ch).sort((a, b) => b.t - a.t) : [];
    body = `<div class="kbar"><label>Saída <select data-bs="ch"><option value="">— escolha —</option>${opts.map((k) => `<option value="${esc(k)}" ${BS.ch === k ? 'selected' : ''}>${esc(A.chuteLabel(k))}${baseOf(k) ? ' · ' + esc(baseOf(k)) : ''}</option>`).join('')}</select></label></div>` +
      (BS.ch ? kvs([['Peças hoje', fmt(L.length)], ['Rejeitadas', fmt(L.filter((r) => r.ex).length), 'bad'], ['Base', esc(baseOf(BS.ch) || '—')]]) + table(HEAD, L.slice(0, 150).map((r) => linhaPeca(r, c)), { cls: 'tnt wide', max: 150 }) + `<div class="kbar">${btn('Exportar CSV', 'data-bs="csvch"')}</div>` : note('Escolha uma saída para listar todas as peças que tinham essa saída como destino hoje.'));
  }
  el.innerHTML = card('Rastreio de peças e lotes', 'consulta somente leitura', 'Encontre uma peça pelo waybill (ou várias de uma vez), veja por que foi rejeitada, quais peças passaram antes e depois, e confira um lote contra as peças descarregadas.', bar + `<div class="subtabs">${tabs}</div>` + body);
  const rowsCsv = (L) => L.map((r) => [r.wb, new Date(r.t).toLocaleString('pt-BR'), r.ind, A.chuteLabel(A.chuteKey(r)), r.dc, r.ex ? A.reasonLabel(r.ex) : 'ok', r.tm ? r.tm / 1000 : '', explicar(r, c)]);
  el.onclick = (e) => {
    const b = e.target.closest('[data-bs]'); if (!b) return; const a = b.dataset.bs;
    if (a === 'go') buscar(el.querySelector('#bsq').value, c); else if (a === 'lote') { const v = el.querySelector('#bslote').value.trim(); if (v) buscarLote(v, c); }
    else if (a === 'tab') { BS.tab = b.dataset.k; c.redraw(); }
    else if (a === 'csv' && BS.res) csvDownload('rastreio-pecas.csv', HEAD, rowsCsv(BS.res.flatMap((o) => o.rows)));
    else if (a === 'csvsd') csvDownload('pecas-sem-descarga.csv', HEAD, rowsCsv(rows.filter((r) => !r.dc && !r.ex && now - r.t > 20 * MIN)));
    else if (a === 'csvch') csvDownload('pecas-por-saida.csv', HEAD, rowsCsv(rows.filter((r) => A.chuteKey(r) === BS.ch)));
  };
  el.oninput = (e) => { if (e.target.id === 'bsq') BS.q = e.target.value; };
  el.onchange = (e) => { if (e.target.matches('[data-bs="ch"]')) { BS.ch = e.target.value; c.redraw(); } };
}
