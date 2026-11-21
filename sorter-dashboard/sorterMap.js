import { SACA, SACA_VERSAO } from './saca.js';
// Aba "Mapa do sorter": todas as saídas (e as induções) num desenho do anel, coloridas ao vivo.
// Geometria real do galpão (cross-belt em anel): Trecho A (portas 009–132) em cima, Trecho B (141–208) embaixo,
// extremidades com 001–008 (direita) e 133–140 (esquerda); ímpares por dentro, pares por fora; induções IND01–06 / IND07–12.
import { snapshot } from './views.js';
import { resolveWin, winText, winShort } from './hour.js';
import { PLAN, baseOf } from './plan.js';
import * as A from './analysis.js';

const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
const dec = (n, d = 1) => Number(n).toFixed(d).replace('.', ',');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s) => document.querySelector(s);
const p2 = (n) => String(n).padStart(2, '0');

const ST = {
  Fechada: ['#2f3542', '#fff', 'Fechada'],
  Cheia: ['#7c3aed', '#fff', 'Cheia'],
  Bloqueando: ['#c2189b', '#fff', 'Bloqueando'],
  'Peças desviadas': ['#f5a623', '#3b2a00', 'Peças desviadas'],
  Normal: ['#1fa95b', '#fff', 'Normal'],
  'Sem peças': ['#e6e9f0', '#6b7589', 'Sem peças']
};
const KEY = 'sorterMapPrefs';
let EW = 0, NOW = 0;
const cfgMap = { color: 'status', win: -1, base: '', v: 2 };
try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); if (o.v !== 2 && o.win === 15) delete o.win; Object.assign(cfgMap, o, { v: 2 }); } catch (e) { /* sem storage */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfgMap)); } catch (e) { /* ok */ } };
let lastC = null;
let firstT = 0;
// PPH = pacotes por hora. Janela de N min: peças × 60 ÷ N. "Hoje": peças do dia ÷ horas desde a primeira peça do dia.
const pphOf = (n, now) => {
  if (EW) return Math.round((n * 60) / EW);
  const h = Math.max(1 / 6, (now - (firstT || now)) / 3600000);
  return Math.round(n / h);
};

const hue = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
const isExc = (k) => {
  const n = String(k);
  if (n === '208' || n === '888') return true;
  const nm = (PLAN.map.get(n) || {}).full || '';
  return /exce[cç]/i.test(nm);
};

// Posição de cada porta no desenho (viewBox 1400 x 560)
const POS = (() => {
  const P = [];
  const sT = (1247 - 140) / 61, sB = (693 - 139) / 33;
  for (let i = 0; i < 62; i++) {
    const xo = 140 + i * sT;
    P.push({ k: 132 - 2 * i, x: xo - 8.5, y: 50, w: 17, h: 28, ic: 38 }); // trecho A, fora (pares)
    P.push({ k: 131 - 2 * i, x: xo - 9.5, y: 116, w: 17, h: 28, ic: 105 }); // trecho A, dentro (ímpares)
  }
  for (let i = 0; i < 34; i++) {
    const xb = 139 + i * sB;
    P.push({ k: 141 + 2 * i, x: xb - 7.5, y: 383, w: 15, h: 28, ic: 372 }); // trecho B, dentro
    P.push({ k: 142 + 2 * i, x: xb - 7.5, y: 453, w: 15, h: 28, ic: 442 }); // trecho B, fora
  }
  for (let j = 0; j < 4; j++) {
    const yc = 175 + j * 57.5;
    P.push({ k: 133 + 2 * j, x: 86, y: yc - 14, w: 20, h: 28, ic: yc - 27 }); // esquerda, dentro
    P.push({ k: 134 + 2 * j, x: 20, y: yc - 14, w: 20, h: 28, ic: yc - 27 }); // esquerda, fora
    const yr = 347 - j * 57.5;
    P.push({ k: 1 + 2 * j, x: 1280, y: yr - 14, w: 20, h: 28, ic: yr - 27 }); // direita, dentro
    P.push({ k: 2 + 2 * j, x: 1346, y: yr - 14, w: 20, h: 28, ic: yr - 27 }); // direita, fora
  }
  return P;
})();
const SLBL = { Fechada: 'FECH.', Cheia: 'CHEIA', Bloqueando: 'BLOQ.', 'Peças desviadas': 'DESV.' };
const BAG = 'M3.2 1.2h3.6l-.7 2.2c1.8.9 2.7 2.6 2.7 4.4 0 .6-.5 1-1.1 1H2.3c-.6 0-1.1-.4-1.1-1 0-1.8.9-3.5 2.7-4.4z';
const pad3 = (k) => String(k).padStart(3, '0');

export const sacaOf = (k) => SACA[String(k)] || null;
const SACA_N = { G: 'Verde', R: 'Vermelha', M: 'Mista' };
const SACA_C = { G: '#15803d', R: '#e11d48' };
const SEM_C = '#fbcfe8', SEM_S = '#d946a8'; // posição sem rota vinculada: rosa bem clarinho
function cellFill(k, d, mx) {
  if (cfgMap.color === 'saca') { const q = sacaOf(k); if (!q) return ['#eef1f7', '#8a94a8']; return q.c === 'M' ? ['url(#mixsaca)', '#fff'] : [SACA_C[q.c], '#fff']; }
  const st = d.st[1];
  if (cfgMap.color === 'status') { const s = ST[st] || ST['Sem peças']; return [s[0], s[1]]; }
  if (cfgMap.color === 'vol') { const v = d.x.tot / mx.tot; return v ? [`color-mix(in srgb, #2f6fed ${Math.round(18 + 82 * v)}%, #eef1f7)`, v > 0.55 ? '#fff' : '#1b2740'] : ['#eef1f7', '#8a94a8']; }
  if (cfgMap.color === 'rej') { const v = mx.rej ? d.x.rej / mx.rej : 0; return v ? [`color-mix(in srgb, #c2189b ${Math.round(22 + 78 * v)}%, #f6eaf3)`, v > 0.5 ? '#fff' : '#4a0b11'] : ['#eef1f7', '#8a94a8']; }
  const b = baseOf(k) || '—';
  return b === '—' ? ['#eef1f7', '#8a94a8'] : [`hsl(${hue(b)} 55% 52%)`, '#fff'];
}

function tip(k, d, now) {
  const b = baseOf(k, false), x = d.x, rate = x.tot ? (x.rej / x.tot) * 100 : 0;
  const win = winText(cfgMap.win, NOW);
  return `Saída ${k}${b ? ' · base ' + b : ''}\nStatus: ${d.st[1]}\nPeças (${win}): ${fmt(x.tot)} · PPH: ${fmt(pphOf(x.tot, now))}\nDesviadas p/ exceção (Chute block): ${fmt(x.rej)} (${dec(rate, 1)}% das peças dela)` +
    (x.last ? `\nÚltima peça: ${p2(new Date(x.last).getHours())}:${p2(new Date(x.last).getMinutes())}:${p2(new Date(x.last).getSeconds())}` : '') + (sacaOf(k) ? `\nSaca física: ${SACA_N[sacaOf(k).c].toUpperCase()}${sacaOf(k).c === 'M' ? ' (depende do lote)' : ''}` : '') + `\nClique para abrir a saída`;
}

const gi = (col, name, what, how, todo) => `<div class="cgi"><i style="background:${col}"></i><div><b>${name}</b><p>${what}</p><p><em>Como o sistema mostra:</em> ${how}</p>${todo ? `<p><em>O que fazer:</em> ${todo}</p>` : ''}</div></div>`;
function colorGuide(cfg) {
  const al = cfg.chuteAlert, th = dec(cfg.rejectThreshold, 1);
  return `<div class="card colorguide"><h2>Entenda as cores do mapa <small>o que cada cor quer dizer e de onde vem a informação</small></h2>` +
    `<p class="pphnote"><b>PPH</b> = pacotes por hora. Janela de N min: peças da janela × 60 ÷ N (ex.: 500 peças em 15 min = 2.000 PPH). Em "hoje": peças do dia ÷ horas desde a primeira peça. É um ritmo extrapolado, não uma contagem de 1 hora fechada.</p>` +
    `<div class="cg2"><div><h3>Saídas (quadrado numerado e sacola acima dele) <small>paleta própria: verde/âmbar/violeta</small></h3>` +
    gi('#1fa95b', 'Normal', 'Recebeu peças na janela e nenhuma foi desviada.', 'peças com saída pretendida = esta saída e sem exceção na trace.') +
    gi('#e6e9f0', 'Sem peças', 'Nenhuma peça destinada a esta saída na janela. É normal em saídas de baixo volume.', 'nenhuma linha da trace aponta para ela no período.') +
    gi('#f5a623', 'Peças desviadas', `<b>Pacotes desviados</b> são pacotes que deveriam cair nesta saída, mas foram mandados para a saída de exceção (208/888) porque a saída recusou: exceção <i>Chute block</i>. Aqui há pelo menos 1 desvio, mas abaixo do limite de bloqueio (${al} desvios e ${th}% das peças dela).`, 'na trace, saída pretendida (chutelist) = esta saída, saída real (dischargechute) = 208/888 e exceção = "Chute block (saída bloqueada)". Cada pacote desviado vai para tratamento manual.', 'um ou dois desvios isolados são comuns. Se aumentarem, veja se a saída está enchendo.') +
    gi('#c2189b', 'Bloqueando (pisca)', `${al} ou mais pacotes desviados na janela <b>e</b> pelo menos ${th}% das peças destinadas a ela: a saída está recusando peças repetidamente.`, 'mesmo cálculo de "Peças desviadas", acima dos dois limites (configuráveis em ⚙). Magenta de propósito: não é falha de equipamento.', 'verifique no chão se o saco/lote está cheio ou travado e se a saída está habilitada. O painel mostra o padrão, não a causa física.') +
    gi('#7c3aed', 'Cheia', 'O sorter marcou a saída como cheia, tendo havido desvio ou não.', 'estado atual "Chute full" lido do sorter (sorterstate).', 'trocar/esvaziar o saco da saída.') +
    gi('#2f3542', 'Fechada (com X)', 'Saída fechada/desabilitada no sistema: peças destinadas a ela serão desviadas.', 'estado atual "Chute closed" lido do sorter.', 'confirme se o fechamento é intencional.') +
    gi('#f1f3f8', 'Apagada', 'A porta não faz parte do plano de triagem ativo.', 'não existe regra de rota para ela no plano.') +
    `</div><div><h3>Induções (barras diagonais) <small>paleta própria: azul/laranja, diferente das saídas</small></h3>` +
    gi('#0284c7', 'Alimentando (azul)', 'Registrou peça nos últimos 5 min e não tem alarme.', 'última peça da trace + estado normal no sorter.') +
    gi('#9fb0c3', 'Ligada sem peças / sem sinal', 'Indução ligada mas sem peças recentes, ou sem informação de estado.', 'nenhuma peça nos últimos 5 min e nenhum alarme ativo.') +
    gi('#ea580c', 'Parada (laranja)', 'Indução em estado de parada (Induction-Stop). Não é falha: alguém parou ou ela foi desligada.', 'estado lido do sorter (sorterstate / devicelogs).') +
    gi('#e60012', 'Em falha', 'Alarme crítico ativo na indução (cortina de luz, sobrelargura ou sobrecomprimento, desconexão do WCS, alarme de falha).', 'estado de severidade crítica lido do sorter. <b>Vermelho só aparece para falha de equipamento.</b>', 'inspecione o equipamento (aba Equipamentos mostra o histórico).') +
    gi('#c2189b', 'Alimentando com rejeito alto', `Está alimentando, mas com ${th}% ou mais de rejeito na janela (mínimo de 30 peças e 3 rejeitos). Problema nas peças ou leitura, não no equipamento.`, 'taxa de rejeito da indução na janela.', 'veja os motivos de rejeito da indução (aba Induções).') +
    `<h3>Cor da saca (modo "Colorir por → Cor da saca")</h3>` +
    gi('#15803d', 'Saca verde', 'Cor <b>física</b> do saco que o operador coloca na saída, conforme a regra vigente (planilha de rotas com saca vermelha obrigatória): toda saída fora da lista usa saca verde. Não é status: não diz se a saída está boa ou ruim.', 'tabela fixa importada das etiquetas impressas (não vem do sorter ao vivo).', 'use para conferir se o saco instalado na saída é da cor certa.') +
    gi('#e11d48', 'Saca vermelha', 'Saco vermelho <b>obrigatório</b>: a saída atende uma das 95 rotas da planilha (saídas de SC, DCs e bases listadas). <b>Vermelho aqui é a cor do saco, não falha.</b>', 'mesma tabela de etiquetas.', 'se a saca instalada for verde numa saída vermelha, troque.') +
    gi('repeating-linear-gradient(45deg,#15803d 0 3px,#e11d48 3px 6px)', 'Mista (listrada)', 'A mesma saída tem etiquetas verdes e vermelhas conforme o lote de destino (ex.: 091 e 111). Veja o tooltip para os lotes.', 'tabela de etiquetas.') +
    gi('#eef1f7', 'Sem etiqueta', 'Saída que não aparece no Mapa de Etiquetas ' + SACA_VERSAO + ' (ex.: 002, 004–008, 134–140, 178, 186, 208).', 'ausente na tabela.') +
    `<h3>Outros termos</h3>` +
    gi('#fde8ea', 'Rejeito × desviada', '<b>Rejeito</b> é qualquer peça que caiu em exceção (qualquer motivo: Intercept, sem plano, Chute block…). <b>Desviada</b> é o rejeito por Chute block atribuído à saída que a recusou.', 'campo "exceção" da trace.') +
    `</div></div></div>`;
}

// Produção do dia ao vivo, hora a hora (peças descarregadas por hora cheia; a hora atual mostra o ritmo extrapolado)
function dayProd(c) {
  const H = new Map(), now = c.now;
  for (const r of c.fall) {
    const h = Math.floor(r.t / 3600000) * 3600000; let g = H.get(h);
    if (!g) H.set(h, (g = { t: h, n: 0, rej: 0 }));
    g.n++; if (r.ex) g.rej++; // rejeito = todas as exceções (qualquer motivo), não só Chute block
  }
  const list = [...H.values()].sort((a, b) => a.t - b.t), cur = Math.floor(now / 3600000) * 3600000;
  const tot = list.reduce((a, g) => a + g.n, 0), rej = list.reduce((a, g) => a + g.rej, 0);
  const done = list.filter((g) => g.t < cur), curG = list.find((g) => g.t === cur);
  const el = curG ? Math.max(1, (now - cur) / 60000) : 0;
  const curPph = curG ? Math.round((curG.n * 60) / el) : 0;
  const mx = Math.max(1, ...list.map((g) => (g.t === cur ? Math.max(g.n, curPph) : g.n)));
  const avg = done.length ? Math.round(done.reduce((a, g) => a + g.n, 0) / done.length) : 0;
  const bars = list.map((g) => {
    const isCur = g.t === cur, v = isCur ? curPph : g.n, rate = g.n ? (g.rej / g.n) * 100 : 0;
    return `<div class="pcol${isCur ? ' cur' : ''}" title="${p2(new Date(g.t).getHours())}h · ${fmt(g.n)} peças${isCur ? ` até agora (ritmo ${fmt(curPph)}/h)` : ''} · ${fmt(g.rej)} rejeitos (${dec(rate, 1)}%)"><span class="hv">${fmt(g.n)}</span><div class="hb"><i style="height:${Math.max(2, (g.n / mx) * 100)}%"></i>${isCur ? `<u style="bottom:${(curPph / mx) * 100}%"></u>` : ''}</div><span class="hl">${p2(new Date(g.t).getHours())}h</span></div>`;
  }).join('');
  const mr = Math.max(1, ...list.map((g) => g.rej));
  const barsRej = list.map((g) => {
    const rate = g.n ? (g.rej / g.n) * 100 : 0, isCur = g.t === cur;
    return `<div class="pcol rcol${isCur ? ' cur' : ''}" title="${p2(new Date(g.t).getHours())}h · ${fmt(g.rej)} rejeitos em ${fmt(g.n)} peças (${dec(rate, 2)}%)${isCur ? ' · hora em andamento' : ''}"><span class="hv rv${rate > 3 ? ' bad' : ''}">${fmt(g.rej)}</span><div class="hb"><i class="rb${isCur ? ' cur' : ''}" style="height:${g.rej ? Math.max(3, (g.rej / mr) * 100) : 0}%"></i></div><span class="hl">${p2(new Date(g.t).getHours())}h</span><span class="hrj${rate > 3 ? ' bad' : ''}">${dec(rate, 1)}%</span></div>`;
  }).join('');
  const best = list.filter((g) => g.t < cur).reduce((m, g) => (!m || g.n > m.n ? g : m), null);
  return { best, barsRej, tot, rej, avg, curRej: curG ? curG.rej : 0, curN: curG ? curG.n : 0, curPph, cur, bars, nh: list.length };
}

// rótulo de status da indução: abrevia e reduz a fonte para nunca passar da caixa
const stTxt = (t) => String(t || '').toUpperCase().replace(/,?\s*SEM PEÇAS/, ' · 0 PÇ').replace('SEM SINAL', 'SEM SINAL');
const stFs = (t) => Math.min(7.4, +(58 / (Math.max(1, t.length) * 0.64)).toFixed(2));

function fitMap() {
  const vm = document.getElementById('viewMap'); if (!vm || !vm.offsetParent) return;
  const mn = document.getElementById('main'); if (mn) mn.style.setProperty('--maptop', Math.round(mn.getBoundingClientRect().top) + 'px');
  vm.style.height = Math.max(420, innerHeight - vm.getBoundingClientRect().top - 10) + 'px';
}
window.addEventListener('resize', () => { if (typeof fitMap === 'function') fitMap(); });

export function renderMap(el, c) {
  lastC = c;
  firstT = (c.fall || []).reduce((m, r) => (r.t < m ? r.t : m), Infinity); if (!Number.isFinite(firstT)) firstT = 0;
  EW = resolveWin(cfgMap.win, c.now); NOW = c.now;
  const mw = document.getElementById('mapWin'); if (mw && mw.options[0] && mw.options[0].value === '-1') mw.options[0].textContent = `Hora atual (desde ${p2(new Date(c.now).getHours())}:00)`;
  const cc = { ...c, win: EW, all: c.all || c.fall };
  const snap = snapshot('chute', cc);
  const isnap = snapshot('ind', cc);
  const empty = { x: { tot: 0, rej: 0, last: 0 }, st: ['idle', 'Sem peças'] };
  const get = (k) => snap.get(String(k)) || empty;
  const inPlan = (k) => PLAN.map.has(String(k)) || (snap.has(String(k)) && snap.get(String(k)).x.day > 0);
  const posKeys = new Set(POS.map((p) => p.k));
  const keys = POS.map((p) => p.k).filter((k) => inPlan(k) || get(k).st[1] !== 'Sem peças');
  const extra = [...snap.keys()].filter((k) => /^\d+$/.test(k) && !posKeys.has(+k));
  const mx = { tot: Math.max(1, ...keys.map((k) => get(k).x.tot)), rej: Math.max(0, ...keys.map((k) => get(k).x.rej)) };
  const hi = cfgMap.base;
  const cnt = { Fechada: 0, Cheia: 0, Bloqueando: 0, 'Peças desviadas': 0, Normal: 0, 'Sem peças': 0 };
  const bagCol = { Fechada: '#2f3542', Cheia: '#7c3aed', Bloqueando: '#c2189b', 'Peças desviadas': '#f5a623' };
  let g = `<defs><pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#e3e7ef"/></pattern><pattern id="mixsaca" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="6" fill="#15803d"/><rect x="3" width="3" height="6" fill="#e11d48"/></pattern></defs><rect width="1400" height="585" fill="url(#dots)"/>` +
    `<rect x="62" y="94" width="1261" height="340" rx="84" fill="none" stroke="#243447" stroke-width="22"/>` +
    `<rect x="62" y="94" width="1261" height="340" rx="84" fill="none" stroke="#8fa3b8" stroke-width="1.5" stroke-dasharray="7 6"/>` +
    `<text x="700" y="26" text-anchor="middle" font-size="12.5" fill="#647087" letter-spacing=".05em">TRECHO A · PORTAS 009 A 132</text>` +
    `<text x="395" y="514" text-anchor="middle" font-size="12.5" fill="#647087" letter-spacing=".05em">TRECHO B · PORTAS 141 A 208</text>` +
    `<text x="470" y="240" text-anchor="middle" font-size="19" fill="#7c879b" letter-spacing=".06em">ÁREA INTERNA DO SORTER</text>` +
    `<text x="470" y="264" text-anchor="middle" font-size="12.5" fill="#9aa4b8">ímpares por dentro · pares por fora</text>` +
    `<text x="1000" y="214" text-anchor="middle" font-size="13" fill="#647087" letter-spacing=".08em">ALIMENTAÇÃO</text>`;
  for (const p of POS) {
    const used = keys.includes(p.k), d = get(p.k);
    const st = d.st[1];
    if (used) cnt[st] = (cnt[st] || 0) + 1;
    const [bg, fg] = used ? cellFill(p.k, d, mx) : ['#f1f3f8', '#b3bccd'];
    const sel = hi && used && (baseOf(p.k) || '') === hi;
    const unl = PLAN.map.size > 0 && !PLAN.map.has(String(parseInt(p.k, 10)));
    const dim = hi && used && !sel ? ' opacity=".32"' : '', dimCell = !used && !dim ? ' opacity=".45"' : '';
    const cls = st === 'Bloqueando' ? ' class="mpulse"' : '';
    const k3 = pad3(p.k);
    const mark = st === 'Fechada' ? `<path d="M${p.x + 3},${p.y + 3} L${p.x + p.w - 3},${p.y + p.h - 3} M${p.x + p.w - 3},${p.y + 3} L${p.x + 3},${p.y + p.h - 3}" stroke="#fff" stroke-width="1.4"/>` : '';
    const sq = sacaOf(p.k); const bag = sq && sq.sem ? SEM_C : sq ? (sq.c === 'M' ? 'url(#mixsaca)' : SACA_C[sq.c]) : '#fff'; // todas as posições, inclusive as sem rota vinculada (regra: o que não é obrigatório é verde) // ícone do saco = cor da saca, em qualquer modo de cor
    g += `<g data-goto="chute|${p.k}" data-tip="${esc(used ? tip(p.k, d) : `Saída ${p.k}\n${unl ? 'Sem rota vinculada no plano de triagem ativo' : 'Sem peças na janela'}\nSaca ${sq ? (sq.sem ? 'sem rota vinculada (rosa)' : sq.c === 'R' ? 'VERMELHA' : 'VERDE') + (sq.man ? ' (editada)' : ' (regra: sem rota obrigatória)') : '—'}\nClique no ícone do saco para editar`)}" style="cursor:pointer"${dim}>` +
      `<g data-sacaedit="${p.k}" style="cursor:pointer"><title>Clique para editar a cor da saca</title><rect x="${p.x + p.w / 2 - 8}" y="${p.ic - 2}" width="16" height="16" fill="transparent"/>` + (sq && sq.man ? `<circle cx="${p.x + p.w / 2 + 6}" cy="${p.ic + 1}" r="2.6" fill="#111" stroke="#fff" stroke-width=".8"/>` : '') +
      `<path transform="translate(${p.x + p.w / 2 - 5},${p.ic}) scale(1.15)" d="${BAG}" fill="${bag}" stroke="${bag === '#fff' ? '#9aa4b8' : bag === SEM_C ? SEM_S : 'rgba(16,24,40,.35)'}" stroke-width="${bag === SEM_C ? 1 : 0.7}"/></g>` +
      `<rect${cls}${dimCell} x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="2.5" fill="${bg}" stroke="${sel ? '#111' : 'rgba(16,24,40,.28)'}" stroke-width="${sel ? 2 : 0.9}"${unl ? ' stroke-dasharray="2 1.6"' : ''}/>` +
      `<text${dimCell} x="${p.x + p.w / 2}" y="${p.y + p.h / 2 + 2.6}" text-anchor="middle" font-size="${p.w > 16 ? 7.4 : 7}" font-weight="700" fill="${fg}">${k3}</text>${mark}${used && cfgMap.color !== 'saca' && SLBL[st] ? `<text x="${p.x + p.w / 2}" y="${p.y + p.h - 3.2}" text-anchor="middle" font-size="4.6" font-weight="800" fill="${fg}" letter-spacing=".02em">${SLBL[st]}</text>` : ''}</g>`;
  }
  // induções: IND07–12 dentro do anel (apontando para o trecho B), IND01–06 fora, abaixo do trecho B
  const indCol = { ok: '#0284c7', idle: '#9fb0c3', warn: '#ea580c', bad: '#e60012', rej: '#c2189b' };
  const indTxt = { ok: '#075985', idle: '#5d6b80', warn: '#c2410c', bad: '#c20010', rej: '#a0127f' };
  for (let n = 1; n <= 12; n++) {
    const d = isnap.get(String(n)) || { x: { tot: 0, rej: 0, key: n }, st: ['idle', 'Sem sinal'] };
    const j = (n - 1) % 6, top = n > 6, lx = 779 + j * 78, cl = /rejeito alto/.test(d.st[1]) ? 'rej' : d.st[0];
    const [x1, y1, x2, y2] = top ? [lx + 6, 292, lx + 52, 397] : [lx + 52, 444, lx - 1, 507];
    const CW = 72, CH = 62, cx = top ? lx + 6 : lx - 1, cy = top ? 226 : 512, cxl = cx - CW / 2;
    g += `<g data-goto="ind|${n}" data-tip="${esc(`Indução ${p2(n)} · ${d.st[1]}\nPeças (${winText(cfgMap.win, c.now)}): ${fmt(d.x.tot)}\nPPH (pacotes por hora): ${fmt(pphOf(d.x.tot, c.now))}\nRejeitos: ${fmt(d.x.rej)}`)}" style="cursor:pointer">` +
      `<line${cl === 'bad' ? ' class="mpulse"' : ''} x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${indCol[cl] || '#9fb0c3'}" stroke-width="16" stroke-linecap="butt"/>` +
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="1.6" stroke-dasharray="6 5" opacity=".8"/>` +
      `<rect x="${cxl}" y="${cy}" width="${CW}" height="${CH}" rx="7" fill="#fff" stroke="${indCol[cl] || '#9fb0c3'}" stroke-width="1.6"/>` +
      `<text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="11" font-weight="800" letter-spacing=".03em" fill="${indTxt[cl] || '#5d6b80'}">IND${p2(n)}</text>` +
      `<text x="${cx}" y="${cy + 31}" text-anchor="middle" font-size="15" font-weight="800" fill="#1b2740">${fmt(pphOf(d.x.tot, c.now))}<tspan font-size="7.5" font-weight="700" fill="#647087" dx="2">PPH</tspan></text>` +
      `<text x="${cx}" y="${cy + 41}" text-anchor="middle" font-size="8" fill="#647087">${fmt(d.x.tot)} pç${cfgMap.win ? '/' + winShort(cfgMap.win, c.now) : ' hoje'}</text>` +
      `<rect x="${cxl + 5}" y="${cy + 46}" width="${CW - 10}" height="11" rx="5.5" fill="${indCol[cl] || '#9fb0c3'}"/>` +
      `<text x="${cx}" y="${cy + 54.2}" text-anchor="middle" font-size="${stFs(stTxt(cl === 'rej' ? 'REJEITO ALTO' : d.st[1]))}" font-weight="800" fill="#fff">${esc(stTxt(cl === 'rej' ? 'REJEITO ALTO' : d.st[1]))}</text></g>`;
  }
  if (extra.length) {
    g += `<text x="470" y="300" text-anchor="middle" font-size="11.5" fill="#647087">outras saídas: ${extra.map((k) => `<tspan data-goto="chute|${k}" style="cursor:pointer;font-weight:700">${k}</tspan>`).join(' · ')}</text>`;
  }
  const W = 1400, H = 585;
  const inds = [...isnap.values()].sort((a, b) => a.x.key - b.x.key);
  // legenda
  const legend = cfgMap.color === 'status'
    ? Object.entries(ST).map(([k, v]) => `<span class="mlg"><i style="background:${v[0]}"></i>${v[2]} <b>${cnt[k] || 0}</b></span>`).join('')
    : cfgMap.color === 'saca' ? `<span class="mlg"><i style="background:#15803d"></i>Saca verde <b>${POS.filter((p) => { const q = sacaOf(p.k) || {}; return q.c === 'G' && !q.sem; }).length}</b></span><span class="mlg"><i style="background:#fbcfe8;border:1px solid #d946a8"></i>Sem rota <b>${POS.filter((p) => (sacaOf(p.k) || {}).sem).length}</b></span><span class="mlg"><i style="background:#e11d48"></i>Saca vermelha <b>${POS.filter((p) => (sacaOf(p.k) || {}).c === 'R').length}</b></span><span class="mlg"><i style="background:repeating-linear-gradient(45deg,#15803d 0 3px,#e11d48 3px 6px)"></i>Mista <b>${keys.filter((k) => (sacaOf(k) || {}).c === 'M').length}</b></span><span class="mlg"><i style="background:#eef1f7"></i>Sem etiqueta <b>${keys.filter((k) => !sacaOf(k)).length}</b></span>`
    : cfgMap.color === 'vol' ? `<span class="mlg"><i style="background:#eef1f7"></i>0</span><span class="mlg grad vol"></span><span class="mlg">${fmt(mx.tot)} peças</span>`
    : cfgMap.color === 'rej' ? `<span class="mlg"><i style="background:#eef1f7"></i>0</span><span class="mlg grad rej"></span><span class="mlg">${fmt(mx.rej)} rejeitos</span>`
    : `<span class="mlg">cada cor = uma base de destino · use "Destacar base" para isolar uma</span>`;
  const tot = keys.reduce((a, k) => a + get(k).x.tot, 0), rej = keys.reduce((a, k) => a + get(k).x.rej, 0);
  const exc = keys.filter(isExc), norm = keys.filter((k) => !isExc(k));
  const sc = c.an && c.an.statusCount;
  const DP = dayProd(c);
  const helpHTML = (cfgMap.color === 'saca' ? `<p class="muted" style="margin:6px 2px 0"><b>Modo Cor da saca:</b> as cores mostram o saco físico de cada saída (Mapa de Etiquetas ${SACA_VERSAO}), não o status. Vermelho aqui é só a cor do saco. Passe o mouse numa saída para ver destino e lote; troque para "Status" para ver bloqueios, cheias e fechadas.</p>` : '') + `<p class="muted" style="margin:6px 2px 0">Cada saída/indução traz o estado escrito além da cor (FECH., CHEIA, BLOQ., DESV.; induções: ALIMENTANDO, PARADA…). Mapa na geometria real do galpão (ímpares por dentro, pares por fora). A sacolinha acima de cada porta mostra a cor da saca (vermelha = rota com saca vermelha obrigatória; verde = demais rotas; rosa claro = posição sem nenhuma rota vinculada no plano), e o quadrado mostra o status. Clique na sacolinha para editar a cor manualmente (aparece um ponto preto nas editadas). Induções têm paleta própria: azul = alimentando, laranja = parada, cinza = sem peças, magenta = rejeito alto, vermelho = falha; portas apagadas não estão no plano de triagem ativo. Atualiza junto com o painel.${PLAN.map.size ? '' : ' (plano de triagem indisponível: bases não exibidas)'}</p>` + colorGuide(c.cfg);
  const hb = document.getElementById('mapHelpBody'); if (hb && hb.dataset.h !== String(helpHTML.length) + cfgMap.color) { hb.innerHTML = helpHTML; hb.dataset.h = String(helpHTML.length) + cfgMap.color; }
  fitMap();
  el.innerHTML =
    `<div class="mapgrid"><div class="mapmain">` + `<div class="card mapcard"><div class="maplg">${legend}<span class="mlg" style="margin-left:auto">ícone do saco:</span><span class="mlg"><i style="background:#e11d48;border-radius:3px"></i>vermelho <b>${POS.filter((p) => (sacaOf(p.k) || {}).c === 'R').length}</b></span><span class="mlg"><i style="background:#15803d;border-radius:3px"></i>verde <b>${POS.filter((p) => { const q = sacaOf(p.k) || {}; return q.c === 'G' && !q.sem; }).length}</b></span><span class="mlg"><i style="background:#fbcfe8;border:1px solid #d946a8;border-radius:3px"></i>rosa = sem rota vinculada <b>${POS.filter((p) => (sacaOf(p.k) || {}).sem).length}</b></span></div><svg viewBox="0 0 ${W} ${H}" class="sorterMap" role="img" aria-label="Mapa do sorter">${g}</svg>` + `</div>` + `<div class="dayrow">` + `<div class="card dayprod"><h2>Processado hora a hora <small>peças por hora cheia · hoje ${fmt(DP.tot)} peças · ${fmt(DP.rej)} rejeitos · a barra da hora atual é a parcial, o traço mostra o ritmo por hora</small></h2><div class="pcols">${DP.bars || '<span class="muted">Sem peças hoje.</span>'}</div></div>` + `<div class="card dayprod dayrej"><h2>Rejeito (todos os motivos) hora a hora <small>total do dia ${fmt(DP.rej)} (${dec(DP.tot ? (DP.rej / DP.tot) * 100 : 0, 2)}%) · vermelho forte = acima de 3%</small></h2><div class="pcols">${DP.barsRej || '<span class="muted">Sem rejeitos hoje.</span>'}</div></div></div>` + `</div><aside class="mapside">` +
    `<div class="mapkpis">` +
    `<div class="kpi"><label>Saídas no mapa</label><b>${keys.length}</b><span>${norm.length} comuns · ${exc.length} de exceção</span></div>` +
    `<div class="kpi ${cnt.Fechada ? 'warn' : ''}"><label>Fechadas</label><b>${cnt.Fechada || 0}</b><span>fora de operação agora</span></div>` +
    `<div class="kpi ${cnt.Cheia ? 'warn' : ''}"><label>Cheias</label><b>${cnt.Cheia || 0}</b><span>saco cheio</span></div>` +
    `<div class="kpi ${cnt.Bloqueando ? 'blk' : ''}"><label>Bloqueando</label><b>${cnt.Bloqueando || 0}</b><span>recusando peças repetidamente</span></div>` +
    `<div class="kpi rejk ${DP.tot && DP.rej / DP.tot > 0.03 ? 'warn' : ''}"><label>Rejeito do dia · todos os motivos</label><b>${fmt(DP.rej)}<small> · ${dec(DP.tot ? (DP.rej / DP.tot) * 100 : 0, 2)}%</small></b><span>hora atual: ${fmt(DP.curRej)} rej (${dec(DP.curN ? (DP.curRej / DP.curN) * 100 : 0, 1)}%) · hora a hora no gráfico</span></div>` +
    `<div class="kpi dayk"><label>Produção do dia · ao vivo</label><b>${fmt(DP.tot)}</b><span>${DP.nh ? `média ${fmt(DP.avg)}/h nas horas fechadas · hora atual ${fmt(DP.curN)} pç (ritmo ${fmt(DP.curPph)}/h)` : 'sem peças hoje'}</span></div>` +
    `<div class="kpi ok"><label>PPH · pacotes por hora</label><b>${fmt(pphOf(tot, c.now))}</b><span>${cfgMap.win ? 'janela: ' + winText(cfgMap.win, c.now) + ', ritmo por hora' : 'média do dia desde a 1ª peça'}</span></div>` +
    `<div class="kpi"><label>Peças · ${winText(cfgMap.win, c.now)}</label><b>${fmt(tot)}</b><span>${fmt(rej)} desviadas p/ exceção (${dec(tot ? (rej / tot) * 100 : 0, 2)}%)</span></div>` +
    `<div class="kpi okb"><label>Melhor hora do dia</label><b>${DP.best ? p2(new Date(DP.best.t).getHours()) + 'h' : '—'}</b><span>${DP.best ? `${fmt(DP.best.n)} peças · ${fmt(DP.best.rej)} rej (${dec(DP.best.n ? (DP.best.rej / DP.best.n) * 100 : 0, 1)}%)` : 'sem hora fechada ainda'}</span></div>` +
    `<div class="kpi"><label>Induções</label><b>${sc ? sc.ativa : '—'}<small> / ${inds.length}</small></b><span>${sc ? `${sc.parada} paradas · ${sc.falha} em falha` : ''}</span></div></div>` + `</aside></div>`;
  // opções de base (preenche uma vez por plano)
  const sel = $('#mapBase');
  if (sel && sel.dataset.n !== String(PLAN.map.size)) {
    const bases = [...new Set(norm.map((k) => baseOf(k)).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">—</option>' + bases.map((b) => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
    sel.value = cfgMap.base; sel.dataset.n = String(PLAN.map.size);
  }
}

export function initMap() {
  const bind = (id, key, num) => {
    const el = $(id); if (!el) return;
    el.value = cfgMap[key];
    el.addEventListener('change', () => { cfgMap[key] = num ? +el.value : el.value; save(); if (lastC) renderMap($('#mapBody'), lastC); });
  };
  bind('#mapColor', 'color'); bind('#mapWin', 'win', true); bind('#mapBase', 'base');
  const dlg = $('#mapHelpDlg');
  $('#mapHelpBtn')?.addEventListener('click', () => { if (dlg && !dlg.open) dlg.showModal(); });
  $('#mapHelpClose')?.addEventListener('click', () => dlg && dlg.close());
  dlg?.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
}
