// Tela "Metas, alertas e destinos": tudo configurável dentro do próprio app (sem editar arquivo).
// Esquema único: cada campo vira um controle; salvar grava na configuração (cfg) e aplica na hora.
import { jsonDownload } from './kit.js';

export const DEF2 = {
  // metas
  metaT1: 0, metaT2: 0, metaT3: 0, metaAprov: 0, metaRejT: 0, capHora: 0, capSaidaHora: 0, desbL: 20, pesoMeta: 0,
  // alertas
  alrOn: true, alrRej: true, alrBlock: true, alrBlockMin: 30, alrInd: true, alrIndMin: 15, alrVazao: true, alrVazaoPct: 50, alrDev: true, alrBind: true, alrPlano: true, alrVigia: true, vigiaMin: 5,
  alrCooldown: 30, alrRecup: true, alrEscalMin: 0, silencio: '', alrMetaOn: true,
  // destinos
  feishuUrlAlert: '', feishuUrlFecho: '', feishuSecretAlert: '', feishuMention: '', feishuMentionAll: false, feishuLista: true, genUrl: '', genFmt: 'text', idioma: 'pt', painelUrl: '', mobUrl: 'https://sorter-mapa-contagem.vercel.app', mobKey: 'Nwb5wFSJz1T1L93n_zhK27v2',
  fechoOn: true, fechoMin: 3, semanalOn: false, semanalDia: 1, semanalHora: 7, resumoOn: true,
  // plataforma
  perfil: 'completo', lite: false, fontPct: 100, daltonico: false, tvSeg: 20, tvViews: 'geral,rej,prod,alr'
};

const T = (k, label, opt = {}) => ({ k, label, ...opt });
export const SCHEMA = [
  { id: 'metas', nome: 'Metas e capacidade', desc: 'Usadas na tela Produtividade (meta, projeção, ocupação), no Feishu e nos alertas de ritmo. Valor 0 = não usar.', f: [
    T('feishuMeta', 'Meta por hora (peças)', { t: 'n', step: 100 }), T('metaDia', 'Meta do dia (peças)', { t: 'n', step: 1000 }),
    T('metaT1', 'Meta do turno T1 (peças; 0 = meta/hora × horas)', { t: 'n', step: 500 }), T('metaT2', 'Meta do turno T2 (peças)', { t: 'n', step: 500 }), T('metaT3', 'Meta do turno T3 (peças)', { t: 'n', step: 500 }),
    T('metaAprov', 'Aproveitamento mínimo (%; 0 = 100 − limite de rejeito)', { t: 'n', step: 0.1 }), T('metaRejT', 'Meta de rejeito por turno (%; 0 = limite geral)', { t: 'n', step: 0.1 }),
    T('capHora', 'Capacidade nominal do sorter (peças/h)', { t: 'n', step: 100 }), T('capSaidaHora', 'Capacidade nominal por saída (peças/h)', { t: 'n', step: 10 }),
    T('desbL', 'Desbalanceamento máximo entre Linha A e B (pontos percentuais)', { t: 'n', step: 1 }), T('pesoMeta', 'Meta de peso por hora (kg; 0 = sem)', { t: 'n', step: 100 })] },
  { id: 'alertas', nome: 'Alertas', desc: 'Regras avaliadas a cada atualização. Aparecem na tela Alertas. O envio automático ao Feishu está desligado: só o relatório hora a hora é enviado, manualmente.', f: [
    T('alrOn', 'Alertas ativados', { t: 'c' }),
    T('alrRej', 'Rejeito acima do limite (últimos 60 min)', { t: 'c' }), T('rejectThreshold', 'Limite de rejeito (%)', { t: 'n', step: 0.1 }),
    T('alrBlock', 'Chute block recorrente por saída', { t: 'c' }), T('chuteAlert', 'Bloqueios na janela para avisar', { t: 'n', step: 1 }), T('alrBlockMin', 'Janela do Chute block (min)', { t: 'n', step: 5 }),
    T('alrInd', 'Indução parada ou sem alimentar durante o turno', { t: 'c' }), T('alrIndMin', 'Minutos sem alimentar para avisar', { t: 'n', step: 5 }),
    T('alrVazao', 'Queda de vazão do sorter', { t: 'c' }), T('alrVazaoPct', 'Avisar abaixo de (% do ritmo da hora anterior)', { t: 'n', step: 5 }),
    T('alrDev', 'Equipamento (carrinho, cortina oscilando, WCS, CLP)', { t: 'c' }), T('alrBind', 'Falha ao abrir lote', { t: 'c' }), T('alrPlano', 'Plano de triagem alterado', { t: 'c' }),
    T('alrMetaOn', 'Ritmo abaixo do necessário para bater a meta', { t: 'c' }),
    T('alrVigia', 'Vigia: avisar se o painel perder o sorter', { t: 'c' }), T('vigiaMin', 'Minutos sem dados para avisar', { t: 'n', step: 1 }),
    T('alrCooldown', 'Reavisar o mesmo alerta só depois de (min)', { t: 'n', step: 5 }), T('alrRecup', 'Enviar “normalizado” quando o alerta termina', { t: 'c' }),
    T('alrEscalMin', 'Escalonar (repetir com @todos) se continuar após (min; 0 = não)', { t: 'n', step: 5 }),
    T('silencio', 'Janelas de silêncio (ex.: 12:00-12:30; 03:00-03:20)', { t: 's', wide: true })] },
  { id: 'destinos', nome: 'Destinos e mensagens', desc: 'Cada tipo de mensagem pode ir para um grupo diferente. Em branco = usa o webhook principal das Configurações.', f: [
    T('feishuUrlAlert', 'Webhook dos alertas (Feishu)', { t: 's', wide: true }), T('feishuSecretAlert', 'Chave de assinatura dos alertas (se o bot exigir)', { t: 'p' }),
    T('feishuUrlFecho', 'Webhook do fechamento de turno e relatório semanal', { t: 's', wide: true }),
    T('mobUrl', 'Mapa no celular: endereço do site (Vercel), ex.: https://meu-sorter.vercel.app', { t: 's', wide: true }), T('mobKey', 'Mapa no celular: chave de envio', { t: 'p' }),
    T('feishuMention', 'Mencionar (IDs de usuário do Feishu, separados por vírgula)', { t: 's', wide: true }), T('feishuMentionAll', 'Alertas críticos mencionam @todos', { t: 'c' }), T('feishuLista', 'Relatório do Feishu: enviar a lista completa dos rejeitos da hora, 1 por 1 (mensagens seguintes)', { t: 'c' }),
    T('fechoOn', 'Enviar fechamento de turno (T1, T2 e T3)', { t: 'c' }), T('fechoMin', 'Minutos após o fim do turno', { t: 'n', step: 1 }),
    T('resumoOn', 'Incluir “pontos de atenção” no fechamento do T3 (resumo da madrugada)', { t: 'c' }),
    T('semanalOn', 'Enviar relatório semanal', { t: 'c' }), T('semanalDia', 'Dia (0 = domingo … 6 = sábado)', { t: 'n', step: 1 }), T('semanalHora', 'Hora do envio', { t: 'n', step: 1 }),
    T('idioma', 'Idioma das mensagens novas', { t: 'sel', o: [['pt', 'Português'], ['zh', '中文 (chinês simplificado)'], ['pt+zh', 'Português + 中文']] }),
    T('painelUrl', 'Endereço do painel (vira botão “Abrir painel” no cartão)', { t: 's', wide: true }),
    T('genUrl', 'Webhook genérico (Slack, Teams, Discord…)', { t: 's', wide: true }), T('genFmt', 'Formato do webhook genérico', { t: 'sel', o: [['text', 'Slack / Teams: {"text"}'], ['content', 'Discord: {"content"}']] })] },
  { id: 'tela', nome: 'Aparência e perfil', desc: 'Ajustes de uso. O perfil escolhe quais telas aparecem no menu.', f: [
    T('perfil', 'Perfil', { t: 'sel', o: [['completo', 'Completo'], ['operador', 'Operador (visão geral, induções, saídas, rejeitos)'], ['supervisor', 'Supervisor (+ produtividade, alertas, relatório)'], ['gerencia', 'Gerência (visão geral, produtividade, histórico, relatório)'], ['manutencao', 'Manutenção (equipamentos, alertas, sistema, camadas)']] }),
    T('lite', 'Modo leve (computador fraco: atualiza a cada 5 s, menos animação)', { t: 'c' }), T('daltonico', 'Paleta para daltonismo', { t: 'c' }), T('fontPct', 'Tamanho da fonte (%)', { t: 'n', step: 5 }),
    ] }
];

const inp = (f, v) => {
  const id = 'cf_' + f.k;
  if (f.t === 'c') return `<label class="chkrow cfw"><input type="checkbox" name="${f.k}" ${v ? 'checked' : ''}/> ${f.label}</label>`;
  if (f.t === 'sel') return `<label class="${f.wide ? 'cfw' : ''}">${f.label}<select name="${f.k}">${f.o.map(([a, b]) => `<option value="${a}" ${String(v) === a ? 'selected' : ''}>${b}</option>`).join('')}</select></label>`;
  const type = f.t === 'n' ? 'number' : f.t === 'p' ? 'password' : 'text';
  return `<label class="${f.wide ? 'cfw' : ''}" for="${id}">${f.label}<input id="${id}" name="${f.k}" type="${type}" ${f.t === 'n' ? `min="0" step="${f.step || 1}"` : 'autocomplete="off"'} value="${String(v ?? '').replace(/"/g, '&quot;')}"/></label>`;
};

let dlg = null;
export function openConfig(cfg, setCfg, tab = 'metas', onSaved) {
  if (dlg) dlg.remove();
  dlg = document.createElement('dialog'); dlg.className = 'cfg2';
  const cur = { ...DEF2, ...cfg };
  const tabs = SCHEMA.map((s) => `<button type="button" class="btn ${s.id === tab ? 'on' : ''}" data-cftab="${s.id}">${s.nome}</button>`).join('');
  const panes = SCHEMA.map((s) => `<fieldset class="cfp" data-cfp="${s.id}" ${s.id === tab ? '' : 'hidden'}><p class="muted">${s.desc}</p><div class="cfg">${s.f.map((f) => inp(f, cur[f.k])).join('')}</div></fieldset>`).join('');
  dlg.innerHTML = `<form method="dialog"><h3>Metas, alertas e destinos</h3><div class="subtabs">${tabs}</div>${panes}<p class="muted" id="cfMsg"></p><menu><button type="button" class="btn" data-cf="exp">Exportar configurações</button><button type="button" class="btn" data-cf="imp">Importar</button><span style="flex:1"></span><button type="button" class="btn" data-cf="no">Cancelar</button><button type="submit" class="btn primary">Salvar</button></menu></form>`;
  document.body.appendChild(dlg);
  const form = dlg.querySelector('form');
  dlg.addEventListener('click', (e) => {
    const t = e.target.closest('[data-cftab]');
    if (t) { dlg.querySelectorAll('[data-cftab]').forEach((b) => b.classList.toggle('on', b === t)); dlg.querySelectorAll('[data-cfp]').forEach((p) => { p.hidden = p.dataset.cfp !== t.dataset.cftab; }); return; }
    const c = e.target.closest('[data-cf]'); if (!c) return;
    if (c.dataset.cf === 'no') dlg.close();
    else if (c.dataset.cf === 'exp') { const o = { ...cfg }; delete o.feishuSecret; delete o.feishuSecretAlert; jsonDownload('configuracoes-sorter-monitor.json', o); }
    else if (c.dataset.cf === 'imp') { const f = document.createElement('input'); f.type = 'file'; f.accept = 'application/json'; f.onchange = async () => { try { const o = JSON.parse(await f.files[0].text()); delete o.base; delete o.v; await setCfg(o); dlg.close(); onSaved && onSaved(); } catch (er) { dlg.querySelector('#cfMsg').textContent = 'Arquivo inválido: ' + er.message; } }; f.click(); }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const patch = {};
    for (const s of SCHEMA) for (const f of s.f) {
      const el = form.elements[f.k]; if (!el) continue;
      patch[f.k] = f.t === 'c' ? el.checked : f.t === 'n' ? Math.max(0, +el.value || 0) : String(el.value || '').trim();
    }
    if (patch.fontPct) patch.fontPct = Math.min(140, Math.max(80, patch.fontPct));
    await setCfg(patch); dlg.close(); onSaved && onSaved();
  });
  dlg.addEventListener('close', () => { dlg && dlg.remove(); dlg = null; });
  dlg.showModal();
}
