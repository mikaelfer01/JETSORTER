// Explicações do painel: cada bloco/indicador ganha uma linha "o que mostra e como é calculado".
// Um observador de DOM aplica os textos (por título/rótulo) sempre que uma tela é redesenhada.
// Só descreve regras que o código realmente usa; o que é estimativa/heurística está dito como tal.

export const GLOSSARY = [
  ['Peça / pacote', 'Item que passou por uma indução (porta de alimentação) e foi para a esteira. "Peça processada" = peça que JÁ caiu numa saída (tem registro de descarga). Peça ainda na esteira não conta.'],
  ['Indução (porta)', 'Posição onde o operador coloca a peça na esteira (01–12). Camada L1 = nível de baixo, L2 = nível de cima.'],
  ['Saída (chute)', 'Porta onde a peça é descarregada, associada a uma base de destino pelo plano de triagem. 208 e 888 são as saídas de EXCEÇÃO (onde os rejeitos caem).'],
  ['Rejeito', 'Peça descarregada com qualquer exceção (modo "Todas as exceções", padrão) ou somente "Chute block" (modo "Só Chute block"). Todo rejeito vai para a saída de exceção e precisa de tratamento manual.'],
  ['Chute block', 'Exceção em que a saída pretendida da peça estava bloqueada/cheia. É o único motivo que pode ser atribuído a uma SAÍDA.'],
  ['Intercept (999)', 'Peça interceptada pelo sistema; não depende da saída pretendida.'],
  ['Sem plano (996) / Sem sortcode (995)', 'O plano de triagem não tem destino para a rota da peça (996) ou o código de rota (sortcode) não foi lido (995).'],
  ['Cancelado (998) / Falha ao obter saída', 'Peça cancelada no sistema / sistema não conseguiu definir a saída.'],
  ['Sem descarga', 'Peça alimentada há mais de 20 min sem registro de saída. Não entra em "Processados". Pode estar presa, ter saído da esteira ou aguardar atualização do sistema: o painel não diz qual.'],
  ['Hora atual', 'Janela que vai de HH:00 até agora. O PPH dela é extrapolado: peças ÷ minutos decorridos × 60. Quando a hora fecha, o PPH é simplesmente a contagem da hora.'],
  ['Aba Rejeitos', 'Rejeitos de qualquer período, hora a hora (hoje, hora atual, hora anterior, últimas horas ou um período escolhido). Dentro de hoje mostra motivo, saída, indução e rota; para dias anteriores usa o resumo por hora do sorter.'],
  ['Aba Relatório', 'Relatório de uma hora fechada (o mesmo enviado ao Feishu): peças, meta, rejeito, produção hora a hora, acumulado com projeção, Pareto dos rejeitos (motivo, saída, indução) e análise em texto.'],
  ['Pareto', 'Ranking em barras do maior para o menor, com linha de % acumulado. Regra 80/20: poucos itens costumam causar a maior parte dos rejeitos; ataque os primeiros.'],
  ['Taxa de rejeito', 'Rejeitos ÷ peças processadas, no mesmo período e filtro.'],
  ['Vazão / ritmo', 'Peças processadas por hora, calculadas sobre a janela "Agora" (min) e extrapoladas para 1 hora.'],
  ['Lote (saco)', 'Conjunto de peças fechado numa saída. "Enchimento" = tempo entre abrir e fechar o lote. Falha ao abrir lote = o código de rota do lote não confere com o plano da saída.'],
  ['Base', 'Destino (unidade) que a saída atende, vindo do plano de triagem ativo.'],
  ['WCS', 'Sistema que decide o destino de cada peça. "Tempo do WCS" = tempo que ele levou para decodificar/responder por peça.'],
  ['PPH (pacotes por hora)', 'Ritmo de peças por hora. Em janela de N min: peças × 60 ÷ N. Em "hoje": peças do dia ÷ horas desde a primeira peça. É extrapolação do ritmo, não contagem de uma hora fechada.'],
  ['Pacotes desviados', 'Pacotes que deveriam ir para uma saída, mas foram mandados à saída de exceção (208/888) porque ela recusou: exceção "Chute block". Na trace: saída pretendida = a saída, saída real = 208/888. Cada um vira tratamento manual.'],
  ['Cores de bloqueio e falha', 'MAGENTA = saída bloqueando (recusando peças) ou indução com rejeito alto: problema de fluxo/peças. VERMELHO = falha de equipamento (indução ou carrinho em falha). VIOLETA = saída cheia. CINZA ESCURO = saída fechada. ÂMBAR = parada ou peças desviadas abaixo do limite. VERDE = normal.'],
  ['Saúde da operação', 'Nota 0–100 CRIADA por este painel (não vem do sorter): desconta pontos por taxa de rejeito, saídas bloqueando e peças sem descarga. Serve como termômetro rápido.'],
  ['Retrabalho manual', 'ESTIMATIVA: rejeitos × tempo médio de tratamento por peça (valor configurado em ⚙, não medido).']
];

// título/rótulo → explicação. Chave com "*" no fim = casa por prefixo.
export const H = {
  // ---- Visão geral ----
  'O que chamou atenção': 'Frases geradas automaticamente a partir dos números do período (taxa geral, saída que concentra bloqueios, pior hora, bloqueios simultâneos…). É leitura estatística: aponta onde olhar, não diz a causa.',
  'Estações de indução ao vivo': 'Uma caixa por indução. Número grande = peças/h nos últimos N min. Barra = volume relativo entre induções. Vermelho = em falha ou rejeito muito acima da média; amarelo = taxa acima do alerta; cinza = parada ou sem peças. Rodapé = rejeitos e taxa dessa indução na janela.',
  'Processamento e rejeito': 'Peças descarregadas ao longo do tempo (barra cinza) e a parte rejeitada (vermelho). Linha = % de rejeito. Arraste no gráfico para filtrar todo o painel naquele intervalo. ▒ = mais de 10 min sem peças (parada).',
  'Agora': 'Janela móvel dos últimos N min (⚙): peças, rejeitos, taxa e onde estão concentrados (saídas, rotas, induções). Ignora filtros: é a visão do momento.',
  'Rejeito hora a hora': 'Por hora cheia: total de peças, rejeitos, taxa e a saída (só Chute block), rota e indução que mais rejeitaram naquela hora. Clique numa hora para filtrar o painel.',
  'Ofensores': 'Quem mais gera rejeito. Saídas: saída pretendida com mais Chute block. Rotas: sortcode das peças rejeitadas (todas as exceções). Induções: porta onde a peça foi alimentada. Episódios: sequência de 3+ bloqueios na mesma saída sem pausa maior que 10 min.',
  'Mapa de saídas': 'Cada quadrado é uma saída do plano. Cor = quantidade de bloqueios (Chute block) no período; cinza = nenhuma. Passe o mouse para ver base e códigos de rota. Clique para filtrar.',
  'Cor da saca': 'Cor física do saco da saída (verde ou vermelha), vinda do Mapa de Etiquetas v57. Não é status: vermelho aqui é só a cor do saco. Ative em Mapa → Colorir por → Cor da saca; também aparece como selo na aba Saídas.',
  'Entenda as cores do mapa': 'Legenda completa: cada cor das saídas e induções, o que significa, como o sistema detecta (qual campo/estado do sorter) e o que fazer. Magenta = bloqueio por saída; vermelho = falha de equipamento.',
  'Indução × saída': 'De onde vêm os bloqueios: cada célula = peças de uma indução (linha) rejeitadas por Chute block na saída (coluna). Mostra as 8 saídas com mais bloqueios.',
  'Últimos rejeitos': 'Exceções mais recentes: hora da alimentação, pacote, indução, saída pretendida ("sem saída pretendida" = a peça não tinha destino válido), motivo, rota (sortcode), camada e peso (kg). "Em trânsito" = ainda sem descarga.',
  'Equipamentos agora': 'Resumo do estado dos equipamentos lido do sorter: induções alimentando/paradas/em falha, saídas fechadas ou cheias e carrinhos com falha hoje. Detalhes na aba Equipamentos.',
  'Falhas ao abrir lote na saída': 'Eventos "格口绑包失败" do log de operação: o sistema tentou vincular um lote à saída e recusou porque o código de rota do lote não confere com o plano daquela saída. Não é peça rejeitada, é lote no lugar errado.',
  // KPIs e cartões do topo
  'Saúde da operação': 'Nota 0–100 criada por este painel (não é métrica do sorter). Começa em 100 e desconta: até 40 pts pela taxa de rejeito nos últimos N min (cheio quando a taxa chega a 2× o alerta), até 30 pts por saídas bloqueando (10 por saída) e até 15 pts por peças sem descarga (cheio em 3% do alimentado). ≥ 85 saudável · 60–84 atenção · < 60 crítico.',
  'Ritmo agora': 'Peças/h = peças descarregadas nos últimos N min × 60 ÷ N. A seta compara com a média do dia, calculada só sobre minutos COM produção — por isso, se houve paradas, a média fica mais alta que a média de relógio.',
  'Meta do dia': 'Peças descarregadas desde 00:00 ÷ meta (⚙). "Faltam" e o tempo estimado usam o ritmo atual, então oscilam com ele.',
  'Processado hoje': 'Peças já descarregadas desde 00:00. Defina uma meta em ⚙ para ver o avanço.',
  'Retrabalho manual': 'ESTIMATIVA: rejeitos × tempo de tratamento manual por peça (valor configurado em ⚙, não medido) = horas de operador gastas tratando rejeitos.',
  'Pulso da operação': 'Peças descarregadas por minuto nos últimos 60 min; vermelho = parte rejeitada.',
  'Processados': 'Peças que já caíram numa saída (têm registro de descarga) no período e filtro atuais. Mesma regra da tela Summary do sorter; peça ainda na esteira não entra.',
  'Rejeitos*': 'Peças descarregadas com exceção: no modo "Todas as exceções", qualquer motivo; no modo "Só Chute block", apenas esse. O número menor mostra a taxa e quantos foram Chute block.',
  'Taxa de rejeito': 'Rejeitos ÷ processados. A barra enche até 2× o limite de alerta (⚙); o traço no meio marca o limite. Verde abaixo do limite, amarelo acima, vermelho acima de 2×.',
  'Vazão*': 'Peças/h nos últimos N min (⚙). "Pico" = maior número de peças descarregadas em um único minuto do período.',
  'Sem descarga*': 'Peças alimentadas há mais de 20 min sem saída registrada. Não entram em Processados. Podem estar presas, fora da esteira ou aguardando atualização do sistema.',
  'Saída que mais bloqueou': 'Saída pretendida com mais Chute block (peça que não entrou porque a saída estava cheia/bloqueada). Motivos que não dependem da saída (Intercept, sem plano…) não contam. 208/888 nunca aparecem: são as saídas de exceção.',
  // ---- Induções / Saídas ----
  'Induções ao vivo': 'Uma linha por indução. Escolha uma para ver o pulso dos últimos 60 min, para onde suas peças vão, motivos de rejeito e o feed de peças. Janela = período das métricas.',
  'Saídas ao vivo': 'Uma linha por saída. Escolha uma para ver quem alimenta, a base de destino, Chute block e o feed de peças. "Rejeitos" aqui = Chute block da saída.',
  'Peças*': 'Peças descarregadas na janela escolhida (para saída: as destinadas a ela).',
  'Hoje': 'Peças do dia (desde 00:00) dessa indução/saída.',
  'Peso médio': 'Média do peso registrado (kg) das peças da janela.',
  'Última peça': 'Há quanto tempo foi a última peça registrada.',
  // ---- Mapa ----
  'Mapa do sorter': 'Desenho do hall: anel da esteira, Trecho A (portas 009–132, em cima), Trecho B (141–208, embaixo) e as 12 induções. Cada saída é colorida conforme o modo escolhido: Status (fechada/cheia/bloqueando/normal), Volume (peças), Rejeitos (Chute block) ou Base de destino. As induções mostram PPH (pacotes por hora). O quadro "Entenda as cores" abaixo do mapa explica cada cor e de onde vem a informação.',
  // ---- Equipamentos ----
  'Equipamentos ao vivo': 'Estado atual e histórico do dia de induções, carrinhos e saídas, lidos do log de dispositivos e do estado do sorter.',
  'Diagnóstico dos equipamentos': 'Frases automáticas sobre falhas de equipamentos (cortina/sensor oscilando, carrinho reincidente, indução desconectada do WCS, saída cheia).',
  'Induções: estado agora e ocorrências de hoje': 'Para cada indução: estado atual (alimentando = peça nos últimos 5 min; ligada sem peças; parada; em falha) e quantas ocorrências de cada tipo hoje.',
  'Saídas fechadas e cheias agora': 'Saídas que o sorter marcou como fechadas ou cheias. Impacto = peças destinadas à saída desde que o estado mudou.',
  'Carrinhos com falha hoje': 'Carrinhos (bandejas da esteira) com falha no dia: quantas vezes e quanto tempo ficaram parados.',
  'Linha do tempo de equipamentos': 'Cada barra é um evento de equipamento, do início ao fim. Passe o mouse para ver detalhes.',
  'Eventos ao vivo': 'Log de eventos dos equipamentos, do mais recente para o mais antigo.',
  'Induções alimentando': 'Induções que registraram peça nos últimos 5 min, sobre o total.',
  'Ligadas, sem peças': 'Induções ligadas e sem falha, mas sem peça recente.',
  'Induções paradas': 'Induções que o sorter reporta como paradas.',
  'Em falha agora': 'Induções com falha ativa neste momento.',
  'Saídas fechadas': 'Saídas fechadas pelo sorter; abaixo, quantas estão cheias.',
  // ---- Produtividade ----
  'Produtividade das induções': 'Peças ALIMENTADAS hoje por cada indução (dados da trace). Cada porta = uma linha de operação.',
  'Mapa de calor: peças alimentadas por hora × indução': 'Cada célula = peças alimentadas por uma indução em uma hora; mais escuro = mais peças. Clique numa linha para abrir a indução.',
  'Mapa de calor: indução*': 'Cada célula = peças alimentadas por uma indução na hora/dia; mais escuro = mais peças.',
  'Indicadores por indução*': 'Total, participação no fluxo, melhor hora e ritmo por indução. O ritmo médio considera só horas com 50+ peças; "tempo ativo" = horas em que a indução alimentou.',
  'Peças por hora': 'Barra cinza = peças ALIMENTADAS (tela Feed quantity); vermelho = parte que virou rejeito (tela Summary). Fonte agregada do sorter, por hora.',
  'Peças por dia': 'Barra cinza = peças ALIMENTADAS por dia; vermelho = parte rejeitada.',
  'Resumo por dia': 'Alimentadas, processadas, rejeitos e taxa por dia, com média por hora ativa.',
  'Alimentadas no período': 'Peças colocadas nas induções (tela Feed quantity). Pode diferir de "Processadas" porque nem toda peça alimentada já caiu numa saída.',
  'Processadas (Summary)': 'Peças que já caíram numa saída, pela tela Summary do sorter (mesma base de "Processados" da Visão geral).',
  'Ritmo médio': 'Média de peças/h considerando só as horas com 50 peças ou mais.',
  'Melhor hora': 'Hora com mais peças alimentadas no período.',
  'Horas com operação': 'Horas com alimentação, sobre o total de horas do período.',
  // ---- Camadas e carrinhos ----
  'Camadas e carrinhos': 'O sorter tem 2 camadas (L1 e L2). Esta aba mostra cada camada separada: induções, estado, peças, rejeito, falhas e cada carrinho (1 a 204 por camada). Os dados vêm da trace (peça → carrinho/camada) e do log de dispositivos (falhas de carrinho).',
  'Como o sorter está organizado': 'Estrutura lida dos dados de hoje: quais induções alimentam cada camada, quantos carrinhos cada uma tem (maior número de carrinho visto) e como as peças se dividem entre L1 e L2.',
  'Camada*': 'Resumo de uma camada: estado do sorter dessa camada (modo automático, online, velocidade), peças e rejeito de hoje, ritmo dos últimos 15 min, carrinhos que receberam peça, carrinhos em falha agora e falhas do dia.',
  'Peças por hora e camada': 'Peças descarregadas por hora em cada camada (azul = L1, roxo = L2). Camadas desbalanceadas podem indicar indução ou carrinhos com problema.',
  'Mapa de carrinhos': 'Cada quadrado é um carrinho (nº dentro). Troque o modo para ver peças, rejeitos, peças sem descarga ou falhas. Passe o mouse para detalhes e clique para o histórico do carrinho. Em condições normais cada carrinho recebe quantidade parecida de peças; carrinho muito abaixo da mediana merece verificação.',
  'Carrinhos que merecem atenção': 'Lista automática: carrinho em falha agora, com 2+ falhas hoje, recebendo bem menos peças que a mediana da camada (40% ou menos), com 3+ peças sem descarga ou com taxa de rejeito 3× a da camada. São sinais para inspeção, não diagnóstico.',
  // ---- Sistema ----
  'Sistema': 'Tudo o que o sorter registra, em um lugar: descobertas automáticas, lotes, exceções por motivo, desempenho do WCS, comandos do operador, consulta de pacote, plano e cobertura das telas.',
  'Lotes fechados por hora': 'Quantidade de lotes fechados em cada hora (log de pacotes do sorter).',
  'Saídas acumulando sem fechar lote': 'Para cada saída: peças descarregadas depois do último lote fechado. Número alto = lote grande aberto ou fechamento atrasado.',
  'Por saída': 'Lotes do dia por saída: quantidade, peças, peças por lote e mediana do tempo para encher.',
  'Por base': 'Lotes e peças por base de destino (segundo o plano ativo).',
  'Últimos lotes': 'Lotes fechados mais recentes. Clique para consultar o lote. Enchimento = fechamento − abertura.',
  'Exceções por motivo': 'Peças com exceção hoje, por motivo (todas as exceções, independente do modo escolhido).',
  'Motivo × indução': 'Em qual indução cada tipo de exceção nasce. Mais escuro = mais ocorrências.',
  'Motivo × hora do dia': 'Em que hora cada tipo de exceção aparece. Mais escuro = mais ocorrências.',
  'p95 por hora*': 'Tempo do WCS por hora: 95% das peças foram atendidas abaixo desse valor (ms).',
  'Por hora': 'Mediana, p95 e máximo do tempo de resposta do WCS por hora.',
  'Linha do tempo de comandos': 'Comandos registrados no operate log (ligar/parar sorter, habilitar/desabilitar saída, ações de plano), com usuário e PC. Linhas idênticas no mesmo segundo são agrupadas (×N).',
  'Consulta de pacote ou lote': 'Digite um pacote para ver por onde passou (indução, rota, saída, exceção) e o lote em que entrou; ou um lote para ver saída e tamanho.',
  'Plano de triagem ativo': 'Regras do plano em uso: qual código de rota vai para qual saída/base.',
  'Cobertura do sorter': 'Cada tela do sistema do sorter e onde ela aparece aqui: coberta, substituída por cálculo, vazia nesta instalação ou propositalmente não usada.',
  'Lotes fechados hoje': 'Lotes com fechamento hoje. "Por hora" = média desde 00:00.',
  'Peças em lotes': 'Soma das peças dos lotes fechados hoje.',
  'Mediana por lote': 'Metade dos lotes tem menos peças que isso, metade mais.',
  'Tempo p/ encher': 'Mediana do tempo entre abrir e fechar o lote.',
  'Lotes pequenos': 'Lotes fechados com menos de 5 peças.',
  'Mais lento': 'Maior tempo entre abrir e fechar um lote hoje.',
  'Mediana': 'Mediana do tempo total do WCS por peça (ms).',
  'p95': '95% das peças tiveram tempo total abaixo deste valor.',
  'p99': '99% das peças tiveram tempo total abaixo deste valor.',
  'Pior caso': 'Maior tempo do WCS registrado no dia.',
  'Decodificação': 'Mediana do tempo de decodificação da leitura por peça (campo decodeusems).',
  'Peças medidas': 'Peças com tempo do WCS registrado e a hora com pior p95.'
};

// dicas de colunas (tooltip)
export const TH = {
  'Taxa': 'Rejeitos ÷ peças',
  '% do fluxo': 'Parcela das peças processadas',
  'Sem descarga': 'Alimentadas há mais de 20 min sem saída registrada',
  'Camada': 'L1 = nível de baixo · L2 = nível de cima',
  'Base da saída': 'Destino da saída pelo plano ativo',
  'Estação (PC)': 'Computador que registrou a falha',
  'Código de rota do lote': 'Código do lote que não confere com a saída',
  'Enchimento': 'Tempo entre abrir e fechar o lote',
  'Peças desde o último lote': 'Peças descarregadas após o último fechamento',
  'Impacto': 'Peças destinadas à saída desde a mudança de estado'
};

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
function find(txt) {
  const t = norm(txt);
  if (!t) return '';
  if (H[t]) return H[t];
  for (const k of Object.keys(H)) if (k.endsWith('*') && t.startsWith(k.slice(0, -1))) return H[k];
  return '';
}
const headText = (el) => { const n = [...el.childNodes].find((x) => x.nodeType === 3 && norm(x.textContent)); return n ? norm(n.textContent) : norm(el.firstChild && el.firstChild.textContent); };

let on = true, busy = false, timer = 0;
export function helpOn() { return on; }

function decorate(root = document.body) {
  busy = true;
  try {
    root.querySelectorAll('h2').forEach((h) => {
      if (h.closest('dialog')) return;
      const nx = h.nextElementSibling;
      if (nx && nx.classList.contains('what')) return;
      const txt = find(headText(h)); if (!txt) return;
      const p = document.createElement('p'); p.className = 'what'; p.textContent = txt;
      h.insertAdjacentElement('afterend', p);
    });
    root.querySelectorAll('.kpi > label, .hs > label, .dk > div > label, .rtxt > label, .ph > label, .hcard > label').forEach((l) => {
      const host = l.parentElement;
      if (host.querySelector(':scope > .what')) return;
      const txt = find(l.textContent); if (!txt) return;
      const p = document.createElement('div'); p.className = 'what'; p.textContent = txt;
      host.appendChild(p);
    });
    root.querySelectorAll('th').forEach((th) => { if (!th.title) { const t = TH[norm(th.textContent)]; if (t) th.title = t; } });
  } finally { busy = false; }
}

const MODES = { '2': 'Explicações: cartão', '1': 'Explicações: cartão + texto', '0': 'Explicações: off' };
export function initHelp() {
  let mode = '2';
  try { mode = localStorage.getItem('sorterHelpMode') || '2'; } catch (e) { mode = '2'; }
  const btn = document.getElementById('btnHelp');
  const sync = () => {
    on = mode !== '0';
    if (btn) { btn.textContent = MODES[mode]; btn.classList.toggle('on', on); }
    document.body.classList.toggle('helpoff', !on); document.body.classList.toggle('hc-on', on); document.body.classList.toggle('helptext', mode === '1');
  };
  sync();
  if (btn) btn.addEventListener('click', () => { mode = mode === '2' ? '1' : mode === '1' ? '0' : '2'; try { localStorage.setItem('sorterHelpMode', mode); } catch (e) { /* ok */ } sync(); });
  const g = document.getElementById('btnGuide'), dlg = document.getElementById('guide');
  if (g && dlg) {
    dlg.querySelector('#guideBody').innerHTML = GLOSSARY.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join('');
    g.addEventListener('click', () => dlg.showModal());
    dlg.querySelector('#guideClose').addEventListener('click', () => dlg.close());
  }
  const run = () => { timer = 0; if (!busy) decorate(); };
  new MutationObserver(() => { if (!busy && !timer) timer = requestAnimationFrame(run); }).observe(document.body, { childList: true, subtree: true });
  decorate();
}
