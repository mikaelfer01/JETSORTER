# Sorter Cross-belt · Hub Contagem — mapa completo do sistema e dos dados

Sistema: painel web do sorter (`http://10.1.164.9`, xadmin + Layui + jQuery, CSRF `_token`). A extensão lê **somente** dados (nunca chama o endpoint de comando `/sortercmd/*`).
Acesso: visitante (Guest). Os menus "Data analysis" e "System config" não aparecem sem login e não foram usados.

## 1. Todas as telas e o que elas guardam
| Tela | Endpoint | Conteúdo | Usado na extensão |
|---|---|---|---|
| Sorter state | `POST /monitor/sorterstate?action=fetchdata` (device_en, type_en) | Estados ativos agora: induções (automático/parada/falha), saídas (fechada/cheia), sorter L1/L2, carrinhos | Equipamentos (estado atual) |
| Outlets state, Lower/Middle/Upper trolley | `POST /devicestatus?type=…` (a cada 10 s no site) | Mesmo estado por tipo (格口 saídas, 供包台 induções; carrinhos vazios) | coberto pelo sorter state |
| (comando) | `POST /sortercmd/chuteandvehicle` | **Abre/fecha saída/carrinho. Nunca usado.** | não |
| Sort plan / Sorte plan query | `POST /query/plan?action=fetchdata` | Plano de triagem: saída (`sortingportcode`) → base (`gridname`) + códigos de rota (`threesegmentcode`); `defaultplan=1` = plano ativo (53102-003-2, 196 saídas) | Base nas saídas, códigos |
| Summary statistics | `GET /statis/summary.data` | Totais oficiais por intervalo (processado, válido, anormal, chute block…) | Conferência |
| Feeder feed quantity | `POST /statis/outlets` (group=60) | Peças alimentadas por indução × hora (`total_1..12`) | Conferência na aba Produtividade |
| By discharge chute, Locked chutes, Ind Peak, Abnormal Weight, Ind Staff | `/statis/*` | **Vazias** neste sistema (funcionário/peso anormal/pico não são alimentados) | substituídos por cálculo a partir da trace |
| Sorte trace query | `POST /query/trace?action=fetchdata` | 1 linha por peça: waybill, indução, `chutelist`, `plcchute`, `dischargechute`, sortcode, exception, layer, peso, `gongtime` | **base de tudo** |
| History sort data | `/query/tracelong` | Histórico longo da trace | não |
| Adjacent query | `/query/adjacent` | Peças vizinhas de uma peça | não |
| Package record | `POST /query/packLogs` | Lotes (container) fechados por saída: contagem, bindtime/blocktime (255 mil registros; sem erros nesta tela) | não |
| **Operate logs** | `POST /query/optlogs` | Log de operação do WCS: `N#格口绑包失败` = **falha ao vincular lote à saída** (memo: código de rota ≠ plano da saída + nº do lote + PC) | Falhas ao abrir lote + notificação |
| **Device logs** | `POST /query/devicelogs` | **~957 mil eventos de equipamento** com início/fim: cortina de luz, sensor, pacote largo/comprido, alarme de falha, partida, reverso, reset, parada, WCS, CLP, carrinho, saída cheia/fechada | Equipamentos |

## 2. Regras de contagem (por que antes "não batia")
1. Só conta peça que já caiu (`dischargechute` preenchido) — igual ao Summary.
2. A peça pertence à hora de alimentação (`gongtime`).
3. "Group by 1 hour" da tela oficial desloca buckets; intervalo explícito bate exato (validado hora a hora: 00–11h idênticas; só a hora corrente difere por defasagem de segundos).
4. `chutelist` com vírgula = rota multi-saída (nunca bloqueia) → "A / B".
5. Rejeito padrão = qualquer exceção (Chute block, 999 Intercept, 996 Sem plano, 995 Sem sortcode, 998 Cancel, Get chute fail); opção "só Chute block".
6. Exceções caem na saída 208 (888 para Get chute fail); campos são atualizados depois (bloqueio leva 3–4 min).

## 3. Equipamentos: o que o log de eventos revela (amostra: 3,7 h)
- Cortina de luz: 72 falhas (mediana 4 s), concentradas nas induções 7 e 10. **Rajadas curtas e repetidas = sensor sujo/obstruído/desalinhado** (poeira, inseto, etiqueta).
- Falha de sensor 14; pacote > largura 42 / > comprimento 9; alarme de falha 129; partida 77; reverso 88; reset 18; parada 148 (108 min); sem WCS 4 (indução 6); CLP offline 2.
- Carrinhos: 25 falhas (mediana 5,6 min, ~397 min somados; carrinho 12 reincidente). Falhas de 66/67 terminam juntas → trecho comum.
- Saídas: ~600 eventos de "cheia" e ~600 de "fechada".
- Estado atual do dia da análise: induções 5 e 6 paradas desde 10:29; saída 186 fechada desde 04:41 (coincide com falhas de abrir lote nela); saída 148 fechou às 12:47.
- Logs são gravados no **fim** do evento (início+fim); o que está em curso aparece no estado atual.

## 4. Regras de alerta da extensão
| Gatilho | Onde | Detalhe |
|---|---|---|
| Falha ao abrir lote na saída | banner, card, notificação (30 s, com dashboard fechado) | evento `格口绑包失败` novo |
| Falha crítica de equipamento nova (alarme de falha, WCS, CLP, carrinho) | banner + notificação | sev 3, 1 aviso por equipamento a cada 5 min |
| **Cortina/sensor oscilando** | banner + notificação | ≥ N falhas (padrão 4, ajustável) na mesma indução em 30 min; reavisa se +3 ou 1 h |
| Saída bloqueando (≥ limite de rejeitos na janela) | banner, som, título da aba | rejeitos por saída |
| Indução parada/em falha, saída fechada com tráfego | diagnóstico e faixa "Equipamentos agora" | |
Todas as notificações podem ser desligadas em ⚙; 1ª execução só marca o histórico, não notifica.

## 5. Indicadores derivados
Saúde da operação (0–100) = 100 − 40·(taxa/2×limite) − 10·saídas bloqueando (máx. 30) − 15·(sem descarga/3%). Retrabalho manual = rejeitos × tempo de tratamento (ajustável, padrão 60 s). Disponibilidade da indução = 1 − tempo parada ÷ tempo desde a 1ª peça. Produtividade por indução (ritmo médio em horas ≥ 50 peças, pico/min, tempo ativo, reinduções = waybill já alimentado, peso zerado).
Limitação: produtividade **por pessoa** não existe (tela Ind Staff vazia); só por porta.

## 6. Pontos de atenção encontrados
- ~1,1 % das peças alimentadas ficam > 20 min sem descarga (não entram na contagem oficial).
- Waybills duplicados (reinduções) existem; rotas multi-saída não bloquearam (candidatas a reserva).
- Saída fechada recebendo tráfego gera rejeito/falha de lote — a extensão cruza estado × peças.

## 7. Status único da indução (regra usada em TODAS as telas)
| Status | Regra |
|---|---|
| Em falha | estado ativo no sorter com severidade crítica (alarme de falha, cortina, sensor, WCS, CLP) |
| Parada | estado `Induction-Stop` no sorter |
| Alimentando | ligada e com peça alimentada (trace, `gongtime`) nos últimos 5 min |
| Ligada, sem peças | modo automático, mas nenhuma peça há mais de 5 min (operador não está alimentando) |
| Sem sinal | sem estado e sem peças |
Conferido no sorter real às 13:04: 07, 08, 09, 10 alimentando; 05 parada; 01–04, 06, 11, 12 ligadas sem peças. Antes, "ativas" (fluxo) e "paradas" (estado) usavam critérios diferentes e pareciam contradizer-se.
Saídas: estado do sorter (Fechada / Cheia) tem prioridade sobre o status por rejeito (Bloqueando / Peças desviadas / Normal).
