// Cartão de explicação ao passar o mouse: aparece junto do cursor, descreve exatamente o que está sob ele
// (o que é, como é calculado, como ler e o que fazer) e some assim que o mouse sai.
// Fonte do texto: tabelas abaixo + glossário (help.js). Só descreve o que o painel realmente calcula.
import { H, TH } from './help.js';

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const lc = (s) => norm(s).toLowerCase();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- estados (selos, legenda, cores) ----------
const S = (what, how, read, todo) => ({ what, how, read, todo });
export const STATUS = {
  'normal': S('A saída está recebendo peças normalmente.', 'Peças com saída pretendida = esta saída e sem exceção na trace (janela escolhida).', 'Verde = nada a fazer.', ['Nada a fazer. Se quiser, clique para ver quem alimenta esta saída.']),
  'peças desviadas': S('Pacotes que deveriam cair nesta saída, mas foram mandados à saída de exceção (208/888) porque ela recusou: exceção "Chute block".', 'Na trace: saída pretendida (chutelist) = esta, saída real (dischargechute) = 208/888 e exceção = Chute block. Há pelo menos 1, mas abaixo do limite de bloqueio.', 'Um ou dois desvios isolados são comuns. Se aumentarem, a saída está enchendo.', ['Clique na saída para ver quantos desvios e a que horas.', 'Olhe o saco no chão: está cheio, travado ou mal encaixado?', 'Se continuar subindo, ela passa a "Bloqueando".']),
  'bloqueando': S('A saída está recusando peças repetidamente: muitos pacotes dela foram para a exceção.', 'Desvios por Chute block na janela ≥ limite de desvios e taxa ≥ limite de bloqueio (ajustáveis em ⚙). Magenta de propósito: não é falha de equipamento.', 'É o alarme operacional mais importante das saídas.', ['Vá até a saída e verifique o saco/lote: cheio ou travado?', 'Troque ou esvazie o saco; confirme que a saída está habilitada.', 'Volte ao painel: em poucos minutos ela deve sair de "Bloqueando".', 'Se persistir, avise a liderança: o painel mostra o padrão, não a causa física.']),
  'cheia': S('O sorter marcou a saída como cheia (saco cheio).', 'Estado atual "Chute full" lido do sorter, tendo ou não havido desvio.', 'Violeta = precisa trocar/esvaziar o saco.', ['Troque ou esvazie o saco desta saída.', 'Confirme no sorter que o estado voltou ao normal.']),
  'fechada': S('Saída fechada/desabilitada no sistema: peças destinadas a ela serão desviadas.', 'Estado atual "Chute closed" lido do sorter.', 'Escuro com X = fora de operação.', ['Confirme se o fechamento é intencional (ex.: fim de lote).', 'Se não for, peça para reabrir a saída no sorter (o painel é só leitura).']),
  'sem peças': S('Nenhuma peça destinada a esta saída/indução na janela.', 'Nenhuma linha da trace aponta para ela no período.', 'Normal em saídas de baixo volume; em indução pode ser parada.', ['Se for uma indução que deveria estar alimentando, veja se há operador e se o estado não é "Parada".']),
  'sem sinal': S('Indução ligada, mas sem informação de estado.', 'Nenhuma peça recente e nenhum estado lido.', 'Cinza = sem dados suficientes.', ['Aguarde alguns ciclos; se continuar, veja a aba Equipamentos.']),
  'alimentando': S('A indução registrou peça nos últimos 5 min e não tem alarme.', 'Última peça na trace + estado normal no sorter.', 'Azul = alimentando.', ['Nada a fazer.']),
  'alimentando · rejeito alto': S('A indução está alimentando, mas com rejeito alto na janela.', 'Taxa de rejeito ≥ limite (⚙), com pelo menos 30 peças e 3 rejeitos.', 'Magenta = problema nas peças ou na leitura, não no equipamento.', ['Clique na indução e veja os motivos de rejeito.', 'Se for Intercept/Sem plano, o problema vem da etiqueta/cadastro da peça.', 'Peça ao operador para conferir a leitura/posição das peças.']),
  'parada': S('Indução em estado de parada (Induction-Stop). Não é falha.', 'Estado lido do sorter (sorterstate / devicelogs).', 'Laranja = alguém parou ou desligou a indução.', ['Confirme se a parada é intencional (pausa, troca de operador).', 'Se não for, religue a indução no sorter.']),
  'em falha': S('Alarme crítico ativo na indução (cortina de luz, sobrelargura/comprimento, WCS desconectado…).', 'Estado de severidade crítica lido do sorter. Vermelho só aparece para falha de equipamento.', 'Vermelho = equipamento.', ['Abra a aba Equipamentos e veja o tipo de falha.', 'Inspecione/limpe o sensor ou chame a manutenção.']),
  'saudável': S('Nota da operação ≥ 85.', 'Nota 0–100 criada por este painel (não é métrica do sorter): desconta pontos por rejeito alto, saídas bloqueando e peças sem descarga.', 'Verde = operação saudável.', ['Nada a fazer; continue acompanhando.']),
  'atenção': S('Nota da operação entre 60 e 84.', 'Mesma nota 0–100 do painel.', 'Amarelo = algo pede olhar.', ['Veja "O que fazer agora" no Resumo do momento.']),
  'crítico': S('Nota da operação abaixo de 60.', 'Mesma nota 0–100 do painel.', 'Vermelho = ação imediata.', ['Siga os passos de "O que fazer agora" no Resumo do momento.', 'Comece pelas saídas bloqueando.']),
  'sem fluxo': S('Menos de 10 peças na janela: o painel não calcula a nota.', 'Peças descarregadas na janela "Agora".', 'Cinza = fábrica parada ou intervalo.', ['Se a operação deveria estar rodando, veja o estado do sorter na aba Equipamentos.']),
  'parcial': S('Hora ainda em andamento.', 'Peças de HH:00 até agora; o PPH é extrapolado (peças ÷ minutos decorridos × 60).', 'Compare só com horas fechadas.', ['Espere a hora fechar para comparar de forma justa.']),
  'pior hora': S('Hora com maior taxa de rejeito no período.', 'Só concorre quem tem ≥ 200 peças e ≥ 5 rejeitos.', 'Aponta quando o problema foi pior.', ['Clique na hora para filtrar o painel e ver saídas/induções daquele momento.']),
  'em trânsito': S('Peça com exceção já gravada, mas ainda sem saída (ainda na esteira).', 'Linha da trace com exceção e sem dischargechute.', 'Entra na contagem oficial só quando cair numa saída.', ['Normalmente nada. Se ficar muito tempo assim, veja "Sem descarga".']),
  'saca verde': S('Cor física do saco desta saída (etiqueta v57).', 'Tabela fixa importada do Mapa de Etiquetas v57; não vem do sorter ao vivo.', 'Verde = saco verde.', ['Confira se o saco instalado é verde.']),
  'saca vermelha': S('Cor física do saco desta saída (etiqueta v57). Vermelho aqui é só a cor do saco, não falha.', 'Tabela fixa do Mapa de Etiquetas v57 (em geral destinos DC/SE/RS e longa distância).', 'Não confundir com alarme.', ['Confira se o saco instalado é vermelho.']),
  'saca mista': S('A mesma saída tem etiquetas verde e vermelha conforme o lote.', 'Mapa de Etiquetas v57 (ex.: saídas 091 e 111).', 'A cor depende do lote em curso.', ['Veja a etiqueta do lote atual antes de trocar o saco.']),
  'lote na saída errada': S('O código de rota do lote pertence a outra saída do plano.', 'Log "格口绑包失败": código do lote comparado aos códigos aceitos por esta saída no plano ativo.', 'O lote foi levado para a saída errada.', ['Leve o lote para a saída indicada no diagnóstico.', 'Confira o saco/etiqueta instalados nesta saída.']),
  'código fora do plano': S('O código de rota do lote não existe no plano de triagem ativo.', 'Comparação do código do log com todos os códigos do plano ativo.', 'Lote com código desatualizado ou plano ainda não ativado.', ['Peça ao responsável pelo plano para conferir o código e a versão do plano.']),
  'plano × sorter divergem': S('O código consta no plano desta saída, mas o sorter recusou mesmo assim.', 'Código aceito no plano lido agora, recusado no log.', 'Provável troca de plano no meio do lote.', ['Confirme o plano ativo e tente vincular o lote de novo.'])
};
// motivos de exceção
const REASONS = {
  'chute block': S('Peça cuja saída pretendida estava bloqueada ou cheia. É o único motivo que pode ser atribuído a uma saída.', 'Campo exceção = "Chute block" na trace.', 'Concentração numa saída = saco cheio/travado.', ['Veja a aba Saídas e a coluna "Saída principal".', 'Vá ao chão verificar a saída apontada.']),
  'intercept': S('Peça interceptada pelo sistema; não depende da saída pretendida.', 'Exceção 999:Intercept.', 'Não tente resolver pela saída.', ['Trate a peça manualmente na saída de exceção.']),
  'sem plano': S('O plano de triagem não tem destino para a rota da peça.', 'Exceção 996:No sortPlan.', 'Sobe quando o plano está incompleto.', ['Avise o responsável pelo plano com a rota afetada (veja "Por rota").']),
  'sem sortcode': S('O código de rota da peça não foi lido.', 'Exceção 995:No sortCode.', 'Etiqueta ilegível ou leitura falha.', ['Confira a etiqueta/leitura na indução apontada.']),
  'cancelado': S('Peça cancelada no sistema.', 'Exceção 998:Cancel.', 'Não é falha do equipamento.', ['Trate manualmente conforme o procedimento de cancelados.']),
  'falha ao obter saída': S('O sistema não conseguiu definir a saída da peça.', 'Exceção "Get chute fail".', 'Pode indicar problema de comunicação com o WCS.', ['Veja a aba Sistema (tempo do WCS) e Equipamentos.'])
};
// rótulos de indicadores com orientação de ação (complementa o glossário)
const KPI = {
  'processados': { todo: ['Compare com a hora anterior na tabela "Rejeito hora a hora".'] },
  'peças processadas': { todo: ['Para ver por hora, use a tabela "Hora a hora" abaixo.'] },
  'rejeitos': { todo: ['Veja "Ofensores" para saber quem mais gera rejeito.', 'Troque "Rejeito" no topo entre "Todas as exceções" e "Só Chute block" para separar o problema de saída.'] },
  'taxa de rejeito': { todo: ['Verde < limite, amarelo ≥ limite, vermelho ≥ 2× o limite (⚙).', 'Se estiver alta, comece por "O que chamou atenção".'] },
  'vazão': { todo: ['Queda forte = olhe induções paradas ou saídas bloqueando.'] },
  'sem descarga': { todo: ['Abra a aba Induções e veja a coluna "Sem descarga".', 'Se o número crescer, procure peças presas na esteira.'] },
  'saída que mais bloqueou': { todo: ['Clique no nome da saída para abrir o detalhe.', 'Vá ao chão verificar o saco dessa saída.'] },
  'produção do dia · ao vivo': { todo: ['O gráfico "Produção do dia, hora a hora" mostra a hora atual parcial.'] },
  'pph · pacotes por hora': { todo: ['Troque a "Janela" do mapa entre "Hora atual" e "Hoje" para comparar.'] },
  'fechadas': { todo: ['Passe o mouse nas saídas escuras do mapa para ver quais são.'] },
  'cheias': { todo: ['Passe o mouse nas saídas violeta do mapa e troque o saco.'] },
  'bloqueando': { todo: ['Passe o mouse nas saídas magenta do mapa e vá ao chão conferir.'] }
};
const NAV = {
  geral: ['Visão geral', 'Resumo da operação agora: nota de saúde, ritmo, rejeitos, alertas e rankings do período.', ['Comece por "Resumo do momento" e "O que fazer agora".']],
  ind: ['Induções', 'Uma linha por indução (01–12): peças, rejeitos, para onde manda as peças e estado.', ['Escolha uma indução para ver o pulso da última hora e os motivos de rejeito.']],
  chute: ['Saídas', 'Uma linha por saída: peças, desvios, de onde vêm as peças, status, saco e erros de rota.', ['Escolha uma saída para ver quem a alimenta e o diagnóstico de erros de rota.']],
  rel: ['Relatório', 'O mesmo relatório que o bot manda ao Feishu: produção e rejeito hora a hora, acumulado e projeção, Pareto por motivo/saída/indução e análise.', ['Escolha a hora e clique em "Enviar esta hora ao Feishu" para mandar ao grupo.']],
  rej: ['Rejeitos', 'Rejeitos de qualquer período, hora a hora, com motivo, saída, indução e rota.', ['Escolha "Hora atual" ou um período e veja a "Pior hora".']],
  map: ['Mapa', 'Desenho do galpão: todas as saídas e induções ao vivo, PPH e produção do dia.', ['Troque "Colorir por" para ver status, volume, rejeitos, base ou cor da saca.']],
  lay: ['Camadas', 'L1 e L2 do sorter com os carrinhos (1–204) e onde caem as peças.', ['Use o modo "Falha"/"Presos" para achar carrinhos com problema.']],
  dev: ['Equipamentos', 'Estado dos equipamentos e histórico de falhas/paradas lidos do sorter.', ['Veja "Em falha" primeiro.']],
  prod: ['Produtividade', 'Produção por hora/dia e por indução; também por período escolhido.', ['Escolha "Período" para comparar dias.']],
  sys: ['Sistema', 'Tudo o que o sorter registra: lotes, exceções, WCS, comandos, consulta de pacote.', ['Use "Consulta" para rastrear um pacote.']]
};
const CTRL = {
  'período': ['Período', 'Intervalo de tempo que alimenta o painel (hoje, desde um horário ou últimos minutos).', ['Use "Hoje" para o dia inteiro; para uma hora específica use a aba Rejeitos.']],
  'rejeito': ['Rejeito', '"Todas as exceções" conta qualquer exceção como rejeito. "Só Chute block" conta apenas peças recusadas pela saída.', ['Use "Só Chute block" para achar problemas de saída; "Todas" para a visão total.']],
  'atualizar': ['Atualizar', 'Com que frequência o painel busca dados novos no sorter (somente leitura).', ['2 s é o padrão ao vivo; use "Manual" para congelar a tela.']],
  'colorir por': ['Colorir por', 'Muda o que as cores das saídas representam no mapa.', ['Status = situação; Volume = peças; Rejeitos = desvios; Base = destino; Cor da saca = saco físico.']],
  'janela': ['Janela', 'Período usado nos números (peças, PPH, desvios). "Hora atual" = de HH:00 até agora.', ['Prefira "Hora atual" ou "60 min" para medir hora a hora.']],
  'camada': ['Camada', 'Filtra o mapa por camada do sorter: L1 = induções 01–06, L2 = induções 07–12.', ['Use para comparar as duas camadas.']],
  'destacar base': ['Destacar base', 'Realça no mapa as saídas que atendem uma base de destino.', ['Escolha uma base para ver todas as suas saídas.']]
};
const BTN = {
  btnHelp: ['Explicações', 'Alterna entre cartão ao passar o mouse, cartão + texto fixo e desligado.', ['Clique para trocar o modo.']],
  btnGuide: ['Guia', 'Glossário completo: o que significa cada termo e cor.', ['Clique para abrir.']],
  btnNow: ['Atualizar agora', 'Busca dados novos imediatamente.', ['Clique se quiser forçar uma atualização.']],
  btnTV: ['Modo TV', 'Tela cheia limpa para painel de parede.', ['Clique para entrar/sair.']],
  btnSound: ['Alerta sonoro', 'Toca um aviso quando uma saída começa a bloquear.', ['Clique para ligar/desligar.']],
  btnTheme: ['Tema', 'Alterna entre tema claro e escuro.', []],
  btnSettings: ['Configurações', 'Limites de alerta, janela "Agora", meta do dia e outras opções.', ['Ajuste os limites de rejeito/bloqueio à sua operação.']]
};

// ---------- resolução do que está sob o mouse ----------
const hit = (map, text) => { const t = lc(text).replace(/\s*[\d.,]+%?\s*$/, '').trim(); return map[t] || map[lc(text)] || Object.entries(map).find(([k]) => t.startsWith(k) && k.length > 3)?.[1]; };
function lookupH(txt) {
  const t = norm(txt); if (!t) return '';
  if (H[t]) return H[t];
  for (const k of Object.keys(H)) { if (k.endsWith('*') && t.startsWith(k.slice(0, -1))) return H[k]; }
  const l = lc(t); for (const k of Object.keys(H)) if (lc(k) === l) return H[k];
  return '';
}
const firstText = (el) => { const n = [...el.childNodes].find((x) => x.nodeType === 3 && norm(x.textContent)); return norm(n ? n.textContent : el.textContent); };
const labelOf = (host) => { const l = host.querySelector(':scope > label'); return l ? firstText(l) : ''; };
const KEYSEL = '[data-tip],td,.kpi,.hs,.hcard,.rtxt,.ph,.pillstate,.tag,.sacachip,.lpill,.mlg,.ichip,button,label,h2';

function resolve(t) {
  if (!(t instanceof Element)) return null;
  if (t.closest('#helpcard,dialog,.tip')) return null;
  // 1) navegação, botões e controles
  const nav = t.closest('#views button[data-view]');
  if (nav) { const n = NAV[nav.dataset.view]; if (n) return { title: 'Aba ' + n[0], what: n[1], todo: n[2] }; }
  const btn = t.closest('button[id]');
  if (btn && BTN[btn.id]) { const b = BTN[btn.id]; return { title: b[0], what: b[1], todo: b[2] }; }
  const ctl = t.closest('.toolbar label, .vwctl label');
  if (ctl && !t.closest('option')) {
    const c = CTRL[lc(firstText(ctl))];
    if (c) { const sel = ctl.querySelector('select'); return { title: c[0], what: c[1], todo: c[2], value: sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '' }; }
  }
  // 2) selos de estado, motivos, tags
  const chip = t.closest('.pillstate, .tag, .sacachip, .lpill, .mlg, .ichip');
  if (chip) {
    const tx = norm(chip.textContent), st = hit(STATUS, tx) || hit(REASONS, tx);
    if (st) return { title: tx.replace(/\s*\d[\d.,]*%?$/, ''), ...st };
  }
  // 3) célula de tabela → coluna + valor da linha
  const td = t.closest('td');
  if (td && td.closest('table')) {
    const tb = td.closest('table'), idx = [...td.parentElement.children].indexOf(td), th = tb.tHead && tb.tHead.rows[0] && tb.tHead.rows[0].cells[idx];
    const head = th ? firstText(th) : '';
    const first = norm(td.parentElement.children[0] && td.parentElement.children[0].textContent);
    const r = hit(REASONS, norm(td.textContent));
    if (r && /motivo|exce/i.test(head)) return { title: norm(td.textContent).slice(0, 60), ...r, value: `linha: ${first.slice(0, 40)}` };
    if (head) return { title: `Coluna “${head}”`, what: TH[head] || lookupH(head) || `Valor desta coluna para a linha “${first.slice(0, 40)}”.`, value: `${norm(td.textContent).slice(0, 60) || '—'}  ·  linha: ${first.slice(0, 40)}`, todo: td.closest('tr[data-goto],tr[data-sel],tr[data-f]') ? ['Clique na linha para abrir/filtrar.'] : [] };
  }
  // 4) indicadores (KPI, cartões do topo)
  const host = t.closest('.kpi, .hs, .hcard, .rtxt, .ph, .dk > div, .lk > div, .bindk > div');
  if (host) {
    const lab = labelOf(host);
    if (lab) {
      const extra = hit(KPI, lab) || {}, base = lookupH(lab);
      const v = host.querySelector('b, .val, .num, .rnum'), sub = host.querySelector('span:not(.what), small');
      if (base || extra.todo) return { title: lab, what: base || '', value: v ? norm(v.textContent) + (sub ? ' — ' + norm(sub.textContent).slice(0, 90) : '') : '', todo: extra.todo };
    }
  }
  // 5) cabeçalhos de bloco
  const h2 = t.closest('h2');
  if (h2) { const tx = lookupH(firstText(h2)); if (tx) return { title: firstText(h2), what: tx }; }
  // 6) elementos com dica própria (mapa, gráficos)
  const tipEl = t.closest('[data-tip]');
  if (tipEl) {
    const raw = String(tipEl.dataset.tip), lines = raw.split('\n');
    const m = /Status:\s*(.+)$/m.exec(raw) || /^Indução \d+ · (.+)$/m.exec(lines[0]);
    const st = m ? hit(STATUS, m[1]) : null;
    return { title: lines[0], data: lines.slice(1), ...(st || {}) };
  }
  return null;
}

// ---------- cartão ----------
let card, cur = null, tmr = 0, mx = 0, my = 0, raf = 0;
const SEC = { what: 'O que é', how: 'Como é calculado', read: 'Como ler' };
function html(c) {
  const sec = (k) => (c[k] ? `<div class="hc-s"><i>${SEC[k]}</i><p>${esc(c[k])}</p></div>` : '');
  return `<div class="hc-h"><span class="hc-ico">i</span><b>${esc(c.title)}</b></div>` +
    (c.value ? `<div class="hc-val"><label>Agora</label> ${esc(c.value)}</div>` : '') +
    (c.data && c.data.length ? `<div class="hc-data">${c.data.map((l) => `<div>${esc(l)}</div>`).join('')}</div>` : '') +
    sec('what') + sec('how') + sec('read') +
    (c.todo && c.todo.length ? `<div class="hc-s todo"><i>O que fazer</i><ol>${c.todo.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>` : '');
}
function place() {
  raf = 0; if (!card || card.classList.contains('hidden')) return;
  const w = card.offsetWidth, h = card.offsetHeight, vw = innerWidth, vh = innerHeight;
  let x = mx + 18, y = my + 20;
  if (x + w > vw - 8) x = Math.max(8, mx - w - 18);
  if (y + h > vh - 8) y = Math.max(8, vh - h - 8);
  card.style.left = x + 'px'; card.style.top = y + 'px';
}
const hide = () => { clearTimeout(tmr); tmr = 0; cur = null; if (card) card.classList.add('hidden'); };
function show(c, el) { card.dataset.h = html(c); card.innerHTML = card.dataset.h; card.classList.remove('hidden'); cur = el; place(); }
const modeOn = () => document.body.classList.contains('hc-on');

export function initHover() {
  card = document.getElementById('helpcard');
  if (!card) { card = document.createElement('div'); card.id = 'helpcard'; card.className = 'helpcard hidden'; document.body.appendChild(card); }
  document.addEventListener('mouseover', (e) => {
    if (!modeOn()) { if (cur || tmr) hide(); return; }
    const t = e.target, key = (t.closest && t.closest(KEYSEL)) || t;
    if (key === cur) return;
    const c0 = resolve(t);
    if (!c0) { if (cur || tmr) hide(); return; }
    clearTimeout(tmr); mx = e.clientX; my = e.clientY;
    tmr = setTimeout(() => { tmr = 0; show(c0, key); }, card.classList.contains('hidden') ? 220 : 60);
  }, true);
  document.addEventListener('mouseout', (e) => {
    if (!cur && !tmr) return;
    const to = e.relatedTarget;
    if (to && cur && cur.contains && cur.contains(to)) return;
    hide();
  }, true);
  document.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; if (cur && !raf) raf = requestAnimationFrame(place); }, { passive: true });
  // a tela é redesenhada a cada ciclo: reidentifica o que está sob o mouse e atualiza o cartão (valores ao vivo)
  setInterval(() => {
    if (!cur || !modeOn()) return;
    const el = document.elementFromPoint(mx, my);
    if (!el) return hide();
    const c0 = resolve(el), key = (el.closest && el.closest(KEYSEL)) || el;
    if (!c0) return hide();
    const h = html(c0);
    if (!cur.isConnected || card.dataset.h !== h) { card.dataset.h = h; card.innerHTML = h; cur = key; place(); }
  }, 1000);
  document.addEventListener('mousedown', hide, true);
  document.addEventListener('scroll', hide, true);
  document.addEventListener('mouseleave', hide);
  window.addEventListener('blur', hide);
}
