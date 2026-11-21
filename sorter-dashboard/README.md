# Sorter Monitor (extensão Chrome MV3)

**Instalar:** `chrome://extensions` → Modo do desenvolvedor → *Carregar sem compactação* → pasta desta extensão. Clique no ícone para abrir o dashboard (o ícone mostra a % de rejeito do dia).

- Acesso a `http://10.1.164.9` (outro endereço: ⚙ Configurações). Se a sessão do sorter exigir login, abra o sorter e entre uma vez; a extensão usa a sessão (acesso direto, ou via aba do sorter como alternativa).
- Atualização automática a cada 5 s (3/5/10/30/60 s ou manual).
- Rejeito: padrão = todas as exceções; seletor para "Somente Chute block".
- Contagem = peças já descarregadas, igual à tela Summary; o chip "Confere com o sistema" compara com o oficial.
- Clique em saídas/rotas/induções/horas ou arraste na linha do tempo para filtrar.

Regras e achados detalhados: `ANALISE_DADOS.md`.

## Painel executivo
- **Saúde da operação (0–100):** combina taxa de rejeito vs. alerta, saídas bloqueando agora e peças sem descarga; mostra a causa em texto.
- **Ritmo, meta do dia e retrabalho manual:** peças/h vs. média do dia; avanço da meta (defina em ⚙); horas de operador gastas tratando rejeitos (tempo por rejeito ajustável em ⚙; é estimativa).
- **Pulso 60 min** e **Estações de indução ao vivo** (peças/h e rejeito por porta; destaca porta fora do padrão).
- **Modo TV** (tela cheia para telão) e **alerta sonoro** 🔔 quando uma saída começa a bloquear (o título da aba também avisa).

## Abas ao vivo
- **Induções ao vivo:** todas as induções numa tabela (status, peças e peças/h, rejeitos, para quais saídas e rotas está mandando, peças sem descarga, última peça). Clique numa linha: detalhe com pulso de 60 min, saídas de destino, rotas, motivos de rejeito e fluxo das últimas peças.
- **Saídas ao vivo:** a mesma visão por saída (de quais induções vem, rotas, motivos, status Normal/Com rejeito/Bloqueando). Chips clicáveis levam de uma aba à outra.
- Janela ajustável (15 min, 30 min, 1 h, 4 h, hoje) e seletor "Ir para".

## Falhas ao abrir lote na saída
Lê o log de operação do sorter (`operate logs`), evento "N#格口绑包失败" (falha ao vincular o lote à saída N; motivo: o código de rota do lote não confere com a saída). Mostra:
- banner vermelho + (opcional) som 🔔 quando surge uma falha nova;
- card com total de hoje, última hora, última falha, saídas com mais falhas e a lista (hora, saída, código, lote, estação/PC);
- bloco "Falhas ao abrir lote nesta saída" no detalhe da aba Saídas ao vivo;
- **notificação do Chrome** (mesmo com o dashboard fechado; checa a cada 30 s). Pode desligar em ⚙. Ao atualizar a extensão, aceite a nova permissão "notificações".

## Base de cada saída
O mapa de saídas, a tabela de ofensores, os últimos rejeitos, a aba Saídas ao vivo e as falhas de lote mostram a **base de destino** de cada saída (campo `gridname` do plano de triagem ativo, tela "sorte plan query"). O tooltip do mapa e o detalhe da saída listam também os códigos de rota atendidos. O plano é recarregado a cada 10 min.

## Equipamentos e Produtividade (novas abas)
- **Equipamentos:** estado agora e histórico de falhas de induções (parada, alarmes, cortina de luz, sensores, pacote fora de medida, WCS/CLP), carrinhos (reincidência) e saídas (fechada/cheia, com impacto em peças). Linha do tempo por evento, detecção de **cortina/sensor oscilando** e diagnóstico automático. Alertas e notificações do Chrome (ajustáveis em ⚙).
- **Produtividade:** mapa de calor hora × indução, ritmo médio, pico/min, tempo ativo, rejeito, reinduções, peso; conferência com "Feeder feed quantity".
- **Últimos rejeitos:** agora lista todos os rejeitos do período, ao vivo (novos piscam; os ainda em trânsito aparecem em cinza).
- Mapa completo do sistema, dicionário e regras: `ANALISE_DADOS.md`.

## Novidades da v1.2.0

**Atualização o mais ao vivo possível**
- Ciclo padrão de **2 s** (opções 1 s, 2 s, 3 s, 5 s…). Trace, equipamentos, falhas de lote, plano e Summary são consultados **em paralelo**; um ciclo nunca começa antes do anterior terminar.
- Ciclo leve a cada tick (~300 linhas mais novas do trace + estado/logs de equipamentos); a cada 10 s um ciclo mais completo (relê 1000 linhas para pegar exceções/descargas atualizadas e confere com o Summary); a cada 5 min recarga profunda.
- O relógio roda em um **Web Worker** (`ticker.js`): a aba **não é freada** pelo Chrome quando está em segundo plano, então o painel (e os avisos) continuam em tempo real.
- Indicador no topo mostra a hora da última atualização, tempo de busca e de desenho da tela.

**Novo visual corporativo**
- Cabeçalho branco com faixa vermelha, abas de navegação no topo e barra de filtros própria.
- Grade simétrica: topo com 4 blocos iguais (saúde, ritmo, processado/meta, retrabalho), 6 KPIs iguais, 12 estações de indução em uma linha, cards 6/6 com a mesma altura e cabeçalho padronizado.

**v1.2.1 — primeira carga**: o painel aparece assim que chegam os registros mais recentes (cerca de 2 s); o histórico do dia (~60 mil registros, ~25 s no sorter real) termina em segundo plano, com aviso de progresso. Antes disso há uma tela de "Carregando…" e, se falhar, o motivo do erro é exibido.

## v1.3.0 — Produtividade por período escolhido

Na aba **Produtividade**, o botão **Período escolhido** abre a análise de qualquer **dia e hora inicial até dia e hora final** (até 31 dias):
- Atalhos: Hoje, Ontem, Últimas 24 h, Últimos 7 dias, Esta semana, Este mês. "Fim = agora (acompanhar)" reatualiza a cada minuto.
- KPIs (alimentadas, processadas, rejeitos e taxa, ritmo médio, melhor hora, horas com operação), gráfico por hora ou por dia, mapa de calor indução × hora/dia, indicadores por indução e resumo por dia. Exporta CSV (hora × indução).
- Fonte: telas agregadas do sorter (Feeder feed quantity + Summary agrupados por hora) — 2 consultas por trecho, ~1 s mesmo para vários dias. Início/fim com minutos (ex.: 06:30) são respeitados.
- O filtro "Rejeito" do topo (todas as exceções / só Chute block) também vale aqui.

## v1.4.0/1.4.1 — Mapa do sorter (ao vivo, geometria real)

Nova aba **Mapa**, desenhada na geometria real do galpão: anel com **Trecho A** (portas 009–132) em cima, **Trecho B** (141–208) embaixo e as extremidades com 001–008 (direita) e 133–140 (esquerda); **ímpares por dentro, pares por fora**; induções **IND07–12** dentro do anel e **IND01–06** abaixo do trecho B. Atualiza a cada ciclo (2 s).
- **Colorir por**: Status (Fechada, Cheia, Bloqueando, Peças desviadas, Normal, Sem peças), Volume, Rejeitos ou Base de destino; "Destacar base" isola as saídas de uma base. A sacolinha acima de cada porta mostra o status.
- **Janela**: 15 min, 30 min, 1 h, 4 h ou hoje. Passar o mouse mostra base, status, peças, rejeitos e última peça; clicar abre a saída/indução. Portas fora do plano de triagem ativo aparecem apagadas.

## v1.5.0 · aplicativo Windows 2.1.0
- **Nova aba Sistema**: Descobertas automáticas, Lotes (packLogs), Exceções por motivo (× indução × hora), Desempenho do WCS (p50/p95/p99), Comandos do operador (optlogs), Consulta de pacote/lote, Plano de triagem completo e Cobertura das telas do sorter.
- **Correção**: as saídas de exceção 208/888 não entram mais no ranking de "saídas ofensoras" (são o destino dos rejeitos). Peças rejeitadas sem saída pretendida aparecem como "(sem saída pretendida)".
- **Aplicativo Windows** (`SorterMonitor.exe`, Electron): mesmo painel, sem extensão. Servidor local na porta 8750 que faz proxy para o sorter (cookie/CSRF próprios), bandeja do sistema, iniciar com o Windows, instância única, notificações. Alternativa sem exe: `node app/server.js` e abrir http://localhost:8750.
- Somente leitura: nenhum endpoint `/sortercmd/*` é chamado.

### App Windows 2.2.0 — login e instalador
- O sorter exige sessão. A extensão usa o login do seu Chrome; o app abre a janela **Entrar no sorter** (tela de login do próprio sorter) e guarda a sessão. Reaparece sozinha se expirar; também em Painel › Entrar no sorter e no menu da bandeja.
- Mensagens de erro do app agora dizem o problema real (sem login / sem rede) em vez de erro técnico.
- Instalador `SorterMonitor-Setup-2.2.0.exe` (por usuário, sem administrador): atalhos na área de trabalho e no menu Iniciar, desinstalador.

## v1.7.0 · app 2.4.0
- **Explicações em todo o painel** (botão "Explicações" liga/desliga; botão "Guia" abre o glossário): cada bloco e indicador diz o que mostra e como é calculado; heurísticas e estimativas (nota de saúde, retrabalho) estão identificadas como tal.
- **Resumo do momento** no topo da Visão geral: situação, fluxo, rejeitos e "o que fazer agora", em linguagem simples.
- **Precisão**: só "Chute block" é atribuído a uma saída (Intercept, sem plano etc. não dependem da saída); 208/888 nunca são "ofensoras".
- **Aba Camadas**: L1 (induções 01–06) e L2 (07–12) lado a lado, estado de cada camada, 204 carrinhos por camada com mapa (peças, rejeitos, sem descarga, falhas), histórico por carrinho e lista de carrinhos que merecem atenção. O mapa do sorter ganhou filtro de camada.
- **Instalador** (`SorterMonitor-Setup-x.y.z.exe`): versão nova atualiza no mesmo lugar, sem desinstalar; mantém configurações e login.

## v1.8.0 · app 2.5.0
- **PPH (pacotes por hora)** no mapa: cada indução mostra PPH além das peças da janela, e há um cartão de PPH total. Cálculo: peças da janela × 60 ÷ minutos da janela ("hoje": peças do dia ÷ horas desde a primeira peça).
- **Cores**: bloqueio (saída recusando peças) agora é **magenta**; **vermelho** ficou só para falha de equipamento. Aplicado ao mapa, ao mapa de saídas, à matriz indução × saída e aos cartões.
- **"Entenda as cores do mapa"**: legenda no próprio painel com o significado de cada cor, como o sistema detecta (campo/estado do sorter) e o que fazer; inclui "pacotes desviados" (Chute block → saída de exceção 208/888).

## v1.9.0 · app 2.6.0 — Cor da saca
- Novo `saca.js`: cor física do saco por saída (verde / vermelha / mista), extraída do **Mapa de Etiquetas v57** (507 etiquetas, 195 saídas: 140 verdes, 53 vermelhas, 2 mistas — 091 e 111, cuja cor depende do lote). Saídas sem etiqueta: 2, 4–8, 134–140, 178, 186, 208.
- Mapa → **Colorir por → Cor da saca** (quadrado e sacola); listrado = mista; legenda e tooltip explicam. Vermelho nesse modo é só a cor do saco, nunca falha.
- Aba Saídas: selo "Saca verde/vermelha/mista" por saída; glossário e "Entenda as cores do mapa" atualizados.
- Para atualizar a tabela quando sair uma nova versão das etiquetas, regenere `saca.js` a partir do PDF.
- Induções e saídas com paletas de status distintas (induções: azul/laranja; saídas: verde/âmbar/magenta/violeta/escuro; vermelho = só falha).
- Mapa: estado escrito além da cor (FECH./CHEIA/BLOQ./DESV. nas saídas; ALIMENTANDO/PARADA… nas induções).

## v1.10.0 · app 2.7.0 — Hora a hora, Rejeitos, cartões de explicação e janela nativa
- **Foco na hora**: janelas "Hora atual" (desde HH:00) e horas fechadas; PPH = peças × 60 ÷ minutos da janela.
- **Aba Rejeitos**: período livre, motivo/saída/indução/rota, exportação CSV; histórico via resumo horário do sorter.
- **Mapa**: produção do dia ao vivo, hora a hora; induções com espaçamento simétrico.
- **Erros de rota**: diagnóstico por saída (plano × etiquetas v57).
- **Explicações**: ao passar o mouse, um cartão flutuante explica o que está sob o cursor e some ao sair.
- **Desempenho**: renderização adaptativa, sem reescrever HTML idêntico, filtros do dia reaproveitados.
- **Janela do app (Windows)**: barra de título integrada ao cabeçalho, sem barra de menu, tamanho/posição lembrados, atalhos e menu de contexto, rolagem e foco no estilo nativo. Ainda não testado em Windows real.

## v1.11.0 · app 2.8.0 — Bot do Feishu (produtividade hora a hora)
- Em ⚙ Configurações › Feishu: cole a URL do webhook (e a chave de assinatura, se ativar), meta por hora, minuto de envio e horário de operação.
- A cada hora fechada (a partir do minuto configurado) envia um cartão colorido: verde ≥100% da meta, laranja ≥80%, vermelho abaixo (azul se sem meta). Traz peças, rejeito, hora anterior e acumulado do dia.
- Sem duplicar a mesma hora; 3 tentativas; verifica `code == 0` na resposta do Feishu; só lê o sorter.
- No app, o envio roda enquanto ele estiver aberto (fica na bandeja). Na extensão, roda em segundo plano com o Chrome aberto.
- Botões de teste e "enviar agora a última hora fechada" na mesma tela.

- v1.12.0 / app 2.9.0: cartão com gráfico hora a hora, análise (melhor/pior hora, projeção) e Pareto dos rejeitos da hora (motivo, saídas com Chute block, induções).

## v1.13.0 · app 2.10.0 — Relatório no layout H/H
- Cartão do Feishu e aba Relatório: H/H produção (processado × aproveitado), produção por linha (A = camada L1, B = L2, empilhado), aproveitamento por hora, ofensoras (rota e saída) e Pareto por saída, com explicação e análise.
- Aproveitamento = (processado − rejeito) ÷ processado.
- O cartão tenta o formato com gráficos do Feishu e, se o grupo não aceitar, envia a versão em texto (o relatório nunca deixa de sair).
- Pareto do dia usa as linhas já carregadas no painel (sem consultas extras ao sorter).

## v1.14.0 · app 2.11.0 — Produtividade por turno
- Aba Produtividade (ao vivo): consolidado de hoje (T1 + T2 + T3 que começa hoje) e um cartão por turno (T3 que virou o dia, T1, T2, T3), com processado, aproveitado, rejeito, ritmo médio, Linha A/B, bloqueios, hora a hora dentro do turno, melhor/pior faixa e ofensoras; mais tabela comparativa.
- Turnos padrão: T1 06:00, T2 14:00, T3 22:20; cada um termina quando o próximo começa (T3 até 06:00). Editáveis em Configurações › Turnos.
- Números do Summary do sorter recortados no minuto exato de cada turno.
- v1.15.0 / app 2.12.0: análises dos turnos em cards individuais com gráfico e leitura automática (produção, aproveitamento, ritmo, Linha A×B, rejeito, hora a hora de produção e de aproveitamento dentro do turno).

## v1.16.0 · app 2.13.0 — Histórico do plano de triagem
- Sistema › "Histórico do plano": a cada leitura do plano ativo o painel compara com a foto anterior (guardada no navegador) e registra o que mudou: códigos de rota incluídos/removidos por porta, base alterada, portas novas/removidas e troca de código de plano.
- O sorter não guarda versões antigas do plano; por isso o registro só enxerga mudanças a partir da instalação desta versão.
- Mesma tela: linha do tempo do log de operações (download, sincronização 极昼, ativação) dos últimos 3 meses, carregada sob demanda. O log só traz código do plano e hora, não o conteúdo.
- Somente leitura.

## v1.17.0 · app 2.14.0 — Filtro de motivo em Rejeitos
- Aba Rejeitos: linha "Motivo" com Padrão (config.), Chute block (principal) e cada outro motivo do período, com a quantidade.
- O motivo escolhido vale para KPIs, hora a hora, rankings (motivo/saída/indução/rota) e lista de peças; as taxas continuam sobre todas as peças.
- Períodos com dias anteriores usam o resumo do sorter: Padrão, Chute block e Outras exceções.

## v1.18.0 · app 2.15.0 — Fluidez e polimento visual
- Janela oculta/minimizada: os dados seguem atualizando, mas o painel não redesenha (volta a desenhar ao reaparecer).
- Produtividade: duração de turno não mostra mais "4h60" (arredondamento); tabelas das induções não cortam a última linha.
- Mapa de saídas: legenda sem quebra no número de rejeitos. Histórico do plano: espaçamento e botão ajustados.
- Auditoria em 1280 e 1920 px em todas as telas: sem rolagem horizontal, sem textos sobrepostos; renderizações de 31 a 176 ms.

## v1.19.0 / app 2.16.0 — app completo

Novas telas: **Histórico** (31 dias guardados localmente, sazonalidade, mapa de calor, ranking de turnos), **Alertas** (regras com cooldown, reaviso, escalonamento com @todos, "normalizado", silêncio e reconhecimento), **Rastreio** (waybill único/em lote, "por que foi rejeitada?", lote × peças, sem descarga, por saída) e botão **Metas** (metas, capacidade, alertas, destinos, idioma pt/zh, perfis, modo leve, daltonismo, rotação do Modo TV — tudo dentro do app, com exportar/importar).
Em telas existentes: **Produtividade › Metas e desempenho**, **Rejeitos › análise avançada** (causa raiz do Chute block, recorrência, rotas sem plano, reincidentes, retrabalho), **Equipamentos › análise avançada** (carrinhos, MTBF/MTTR, Pareto, auditoria de comandos, ficha, OEE), **Sistema › Auditoria do plano** e **Diagnóstico**.
Fechamento de turno (T1/T2/T3 + resumo da madrugada) e relatório semanal por Feishu; webhook genérico (Slack/Teams/Discord). Somente leitura no sorter: nenhum `/sortercmd/*` é chamado.

## v1.20.0 / app 2.17.0
- **Salvar tela**: botão que grava a tela atual como arquivo HTML autônomo (com estilo), para enviar ou arquivar.
- **API local (app Windows)**: `http://127.0.0.1:8750/api/resumo` devolve em JSON as peças do dia, rejeito, aproveitamento, última hora, estado das induções e alertas ativos. Só aceita conexões da própria máquina.

## v1.20.1 / app 2.17.1
Correções visuais: tema escuro voltou a valer (cartões, avisos e botões), Modo TV não mostra mais o cartão de falhas de lote nas outras telas, abas do menu mais compactas em telas de até 1560 px.

## v1.20.2 / app 2.17.2
Revisão visual completa (13 telas, 3 larguras, 2 temas): botões ativos no tema escuro, gráficos do Histórico mais largos em telas grandes, variação "= 0,0%" em vez de seta quando não há mudança, tempos do Diagnóstico arredondados.

### v1.20.3 / app 2.17.3
- Saídas: pesquisa dinâmica (nº da saída, base de destino, código de rota, camada, status, saca), filtros por status, destaque do termo, contador, atalhos `/` (focar), `Enter` (abrir 1º resultado) e `Esc` (limpar). Mostra também saídas do plano sem peças; o detalhe ao vivo da saída encontrada abre automaticamente e atualiza em tempo real.

### v1.20.4 / app 2.17.4
- Saídas: **Mapa de cor de saca por saída** (207 tiles, vermelho/verde, ponto de status ao vivo, filtros Todas/Só vermelhas/Só verdes, clique abre o detalhe, respeita a pesquisa). Regra vinda da planilha "Rotas saca vermelha obrigatória": 39 saídas vermelhas (rotas listadas), todas as demais verdes. Mapa do sorter, detalhe e chips usam a mesma regra.

### v1.20.5 / app 2.17.5
- Mapa de saca: conferido contra o plano ativo do sorter (gridname). 58 saídas vermelhas (comunicado + lista complementar); 4 por correspondência provável (marcadas com "?"). Lista das rotas obrigatórias sem saída no plano. Botão **Exportar PNG** do mapa.

### v1.20.6 / app 2.17.6
- Rotas obrigatórias sem saída fixa (SC BRE, DC EXT-MG, DC NSR 001-MG etc.): se o plano ativo passar a ter uma saída com o mesmo nome, ela fica vermelha automaticamente.

### v1.20.7 / app 2.17.7
- Saídas: **Conferência de saca vermelha** — cruza o sortcode de cada peça com o plano e mostra quantas peças de rotas obrigatórias caíram em saída vermelha, verde ou exceção; cumprimento vs meta 95%, lista por saída, últimas peças em saída verde e saídas vermelhas usadas com peça comum. Códigos compartilhados com saídas verdes não são contados.

### v1.20.8 / app 2.17.8
- Associação automática rota do comunicado × nome da saída no plano (tolera DC/F/PA, UF, espaços, 001/02, "S-"): níveis exata / provável / verificar, tabela de associações no mapa de saca, e a Conferência de saca vermelha passa a usar o mesmo critério.

### v1.20.9 / app 2.17.9
- Segmentos: o plano agora é lido por linha (nome do destino + códigos de segmento). Cada rota obrigatória é associada ao segmento/saída; a Conferência liga cada peça ao segmento mais específico do sortcode (UF › rota › sub) dentre as saídas candidatas e diz se é obrigatória, onde caiu e se uma saída vermelha recebeu segmentos comuns.

### v1.20.10 / app 2.17.10
- Associação "Por UF": rotas sem código próprio (ex.: DC FRC-SP, DC PFB-RS) são atendidas pela saída de código de UF do plano (SP→133/135, RS→125, PR→143/145…), já vermelha. UF genérica (MG) não é usada. UF inexistente na grafia (ex.: "SN RAO") é sinalizada para verificação.

### v1.20.11 / app 2.17.11
- Mapa do sorter: o ícone do saco de cada saída mostra sempre a cor da saca (vermelha/verde), em qualquer modo "Colorir por"; legenda com a contagem.

### v1.20.12 / app 2.17.12
- Edição manual da cor da saca: clique na sacolinha da saída no Mapa (ou no botão "Editar saca" no detalhe da saída) e escolha Vermelha / Verde / Automática. Fica salvo no computador, vale em Mapa, Saídas, PNG e conferência; editadas aparecem com ponto preto / ✎; "Limpar edições" volta tudo à regra.

### v1.20.13 / app 2.17.13
- Mapa: posições sem rota vinculada no plano ativo também mostram o saco (verde pela regra; editável) e entram na contagem da legenda, com o total de "sem rota vinculada".

### v1.20.14 / app 2.17.14
- Posições sem rota vinculada no plano ativo ganham cor própria (rosa bem clarinho) no ícone do saco do Mapa, no mapa de saca de Saídas, no PNG e nas legendas, com filtro "Sem rota". Editar à mão sobrepõe.

### v1.20.15 / app 2.17.15
- Sistema › **Segmentos**: cada código de segmento do plano ativo com família, saída, rota no plano, rota obrigatória do comunicado, cor da saca e colunas editáveis/importáveis de código antigo, código novo e rota (de-para salvo no computador). Busca por qualquer código; os códigos antigo/novo também entram na pesquisa de Saídas. Exporta CSV.

### v1.20.16 / app 2.17.16
- Segmentos: **alterações de código detectadas** — consolida o histórico do plano (fotos a cada leitura) em trocas antigo → novo (mesma família na mesma saída = alta; um sai/um entra = provável), códigos novos/removidos, destinos alterados e saídas novas/removidas. As trocas preenchem o de-para sozinhas (sem sobrescrever o que foi digitado). Exporta CSV.

## v1.20.17 / app 2.17.17
- Cabeçalho reorganizado em duas linhas: marca, status e controles em cima; todos os módulos numa barra própria embaixo (sem cortar abas, com rolagem suave só em telas muito estreitas).
- Inclui a consolidação inteligente de alterações de código (aba Sistema › Segmentos).

## v1.20.18 / app 2.17.18
- Corrigido: exportação CSV não baixava (Sistema › Lotes/Exceções/WCS/Comandos/Plano/Segmentos, Rejeitos e demais). Causa: erro de variável na função de download. Os arquivos agora têm nome por tela.

## v1.20.19 / app 2.17.19
- Feishu: somente o relatório hora a hora, com disparo manual (aba Relatório › “Enviar esta hora ao Feishu” ou ⚙ › “Enviar relatório da última hora fechada”).
- Desligados todos os envios automáticos: hora fechada, alertas, fechamento de turno e relatório semanal.

## v1.20.20 / app 2.17.20
- Feishu/Relatório: rejeito = somente Chute block (processado, aproveitamento, rejeito %, séries H/H e Pareto usam essa regra).

## v1.20.21 / app 2.17.21
- Cartão do Feishu reorganizado em blocos (Produção · Rejeito · Detalhes): H/H processado×aproveitado, produção por linha, rejeito por hora (%) × limite, Pareto por saída e por rota (barras horizontais, % acumulado no rótulo), Pareto por indução em texto. Máx. 5 gráficos (recomendação do Feishu), sem rótulos sobrepostos.

## v1.20.22 / app 2.17.22
- Aba Mapa em tela única, sem rolagem: mapa + números ao vivo (gerais e por saída/indução) juntos; ajuda movida para o botão “? Como usar”.
- Rejeito do dia (total e hora atual) e rejeito hora a hora (barra vermelha + “N rej · %”) na própria tela do Mapa.

## v1.20.23 / app 2.17.23
- Mapa: “Processado hora a hora” e “Rejeito hora a hora” lado a lado (escala própria, % por hora, destaque acima de 3%), mais o total de rejeito do dia nos números ao vivo.

## v1.20.24 / app 2.17.24
- Alertas em faixa rolante no topo (estilo letreiro de jornal): todos os alertas ativos, mesmo tamanho, loop contínuo; passa o mouse para pausar; fixo se couber na tela.

## v1.20.25 / app 2.17.25
- Modo TV: tela cheia fixa no Mapa (sem trocar de aba sozinho; menu oculto).
- Mapa: novo indicador “Melhor hora do dia”; rejeito do Mapa (total, hora atual e hora a hora) considera somente Chute block.

## v1.20.26 / app 2.17.26
- Janela do app: botões minimizar/maximizar/fechar alinhados à primeira linha do cabeçalho (altura 54), sem cobrir o menu de módulos.
- Faixa de alertas sempre rolando (repete os alertas até preencher a largura).
- Mapa: rótulo de status das induções abreviado (“PARADA · 0 PÇ”) e com fonte ajustada para não sair da caixa.

## v1.20.28 · app 2.17.28
- Alertas do letreiro só em tempo real (falhas de lote: últimos 2 min; equipamentos: abertos ou recém-fechados; oscilação só se ainda ocorrendo).
- **Histórico do plano / saídas automático**: o log de operações (downloads, ativações, sincronizações) carrega sozinho ao abrir a tela (consulta filtrada no servidor, ~0,6 s em vez de varrer ~20 mil linhas) e renova a cada 5 min. Um vigia (1 consulta/min) detecta nova ativação de plano e relê o plano na hora, gravando o que mudou por saída. A tela mostra o status do registro. Corrigido rótulo corrompido "Sincronização".

## v1.20.29 · app 2.17.29
- **Mapa no celular via Vercel**: Configurações › Destinos › "Mapa no celular" (endereço do site + chave). O app desenha o Mapa fora da tela a cada 30 s e envia (comprimido, ~20 KB) a /api/push; o site (pasta sorter-mapa-web) mostra no celular como PWA. Só envio; nada é escrito no sorter.

## v1.20.33 · app 2.17.33
- Feishu: após o cartão do relatório, o bot envia a LISTA COMPLETA dos rejeitos da hora, 1 por 1 (uma linha por peça: horário, waybill, motivo, indução, saída pretendida → saída onde caiu, rota). 150 peças por mensagem, em ordem de ocorrência, até 25 mensagens (3.750 peças; avisa se cortar), com pausa entre mensagens.
- Pode ser desligada em Metas › Destinos e mensagens › “enviar a lista completa dos rejeitos”.

## v1.20.32 · app 2.17.32
- Feishu/Relatório: agora mostram TODOS os rejeitos (todas as exceções), segmentados por motivo, com o Chute block sempre em destaque (primeiro da lista e KPI próprio).
  - KPIs: "Rejeitos (todos)" e "Chute block" (quantidade e % das peças); aproveitamento = (processado − todos os rejeitos) ÷ processado.
  - Bloco "Rejeitos da hora / do dia · por motivo": Chute block, Intercept (999), Sem plano (996), Sem sortcode (995), Cancelado (998), Falha ao obter saída — cada um com quantidade, % dos rejeitos e % das peças.
  - Gráfico de rejeito por hora: barras = todos os rejeitos (%), linha = Chute block (%), linha = limite.
  - Pareto por rota e por indução passam a considerar todos os rejeitos; Pareto por saída segue só Chute block (as outras exceções não dependem da saída pretendida).
  - Campo de mensagem em caixa cinza "BASES COM FALTA DE PLANO" (hora e dia): para cada segmento sem destino no plano (996), mostra a base (quando existe no plano), a origem/prefixo, a quantidade e o que falta (prefixo ou linha); inclui os sem sortcode (995). Também na aba Relatório.
  - Gráfico "Rejeitos por hora · por tipo" (barras empilhadas): ao passar o mouse mostra cada tipo de rejeito da hora. Na aba Relatório, o tooltip dos gráficos também lista os rejeitos por tipo.
  - "Paretos por tipo de erro": para cada erro (Chute block, Intercept, Sem plano, Sem sortcode…), top saídas (no Chute block), rotas e induções, da hora e do dia, com % do erro e % acumulado. O cartão se reduz sozinho (top 5, só a hora) se passar de ~27 KB.
  - O Pareto por rota do cartão virou lista de texto (o Feishu aceita no máximo 5 gráficos por cartão).
  - Substitui a regra da v1.20.20 ("somente Chute block") no Feishu e na aba Relatório.

## v1.20.30 · app 2.17.30
- Mapa no celular já vem configurado no código (endereço e chave de envio); o campo vazio volta ao padrão.
- Atualização quase instantânea: com um celular aberto o app envia o Mapa a cada ~4 s (sem ninguém olhando, a cada 30 s); o celular consulta a cada 4 s.

## v1.20.34 · app 2.17.34
- Mapa (app e celular): "Rejeito do dia" e o gráfico "Rejeito hora a hora" agora contam **todas as exceções** (qualquer motivo), não só Chute block.
