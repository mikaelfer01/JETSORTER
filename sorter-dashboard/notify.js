// Entrega de mensagens: Feishu (cartão com cor, menção e botão) e webhook genérico (Slack, Teams, Discord).
// O único tráfego de saída do painel; o sorter nunca recebe nada.
import { postFeishu } from './feishu.js';

const COR = { 0: 'green', 1: 'blue', 2: 'orange', 3: 'red' };
const ICON = { 0: '✅', 1: 'ℹ️', 2: '⚠️', 3: '🚨' };

const okGeneric = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && /(^|\.)(slack\.com|discord\.com|discordapp\.com|office\.com|office365\.com|webhook\.office\.com|logic\.azure\.com)$/.test(x.hostname); } catch (e) { return false; } };

// destino por tipo: alert | fecho | main
export function destFor(cfg, kind) {
  const main = { url: cfg.feishuUrl, secret: cfg.feishuSecret };
  if (kind === 'alert' && cfg.feishuUrlAlert) return { url: cfg.feishuUrlAlert, secret: cfg.feishuSecretAlert || (cfg.feishuUrlAlert === cfg.feishuUrl ? cfg.feishuSecret : '') };
  if (kind === 'fecho' && cfg.feishuUrlFecho) return { url: cfg.feishuUrlFecho, secret: cfg.feishuUrlFecho === cfg.feishuUrl ? cfg.feishuSecret : '' };
  return main;
}

function mentions(cfg, sev, force) {
  const ids = String(cfg.feishuMention || '').split(/[,;\s]+/).filter(Boolean).map((i) => `<at id=${i}></at>`);
  if ((cfg.feishuMentionAll && sev >= 3) || force) ids.push('<at id=all></at>');
  return ids.join(' ');
}

// msg = { title, body, sev (0 ok · 1 info · 2 atenção · 3 crítico), mentionAll?, link? }
export function buildCardSimple(cfg, msg) {
  const els = [{ tag: 'div', text: { tag: 'lark_md', content: msg.body } }];
  const mt = mentions(cfg, msg.sev, msg.mentionAll);
  if (mt) els.push({ tag: 'div', text: { tag: 'lark_md', content: mt } });
  const link = msg.link || cfg.painelUrl;
  if (link && /^https?:\/\//.test(link)) els.push({ tag: 'action', actions: [{ tag: 'button', text: { tag: 'plain_text', content: cfg.idioma === 'zh' ? '打开面板' : 'Abrir painel' }, url: link, type: 'default' }] });
  els.push({ tag: 'note', elements: [{ tag: 'plain_text', content: 'Sorter Monitor' }] });
  return { msg_type: 'interactive', card: { config: { wide_screen_mode: true }, header: { template: COR[msg.sev] || 'blue', title: { tag: 'plain_text', content: `${ICON[msg.sev] || ''} ${msg.title}`.trim() } }, elements: els } };
}

async function postGeneric(cfg, msg) {
  if (!okGeneric(cfg.genUrl)) throw new Error('Webhook genérico inválido (use https de Slack, Teams ou Discord).');
  const text = `${ICON[msg.sev] || ''} ${msg.title}\n${String(msg.body).replace(/\*\*/g, '*')}`;
  const body = cfg.genFmt === 'content' ? { content: text } : { text };
  let r;
  if (typeof window !== 'undefined' && window.SORTER_PROXY) r = await fetch('/__feishu', { method: 'POST', headers: { 'content-type': 'application/json', 'x-feishu-url': cfg.genUrl }, body: JSON.stringify(body) });
  else r = await fetch(cfg.genUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('Webhook genérico recusou: HTTP ' + r.status);
}

// Envia para o destino do tipo e, se houver, também para o webhook genérico. Retorna { ok, err, dest }.
export async function deliver(cfg, kind, msg) {
  const res = { ok: false, err: '', dest: [] };
  const d = destFor(cfg, kind);
  if (d.url) {
    try { await postFeishu({ ...cfg, feishuUrl: d.url, feishuSecret: d.secret }, buildCardSimple(cfg, msg)); res.ok = true; res.dest.push('Feishu'); }
    catch (e) { res.err = e.message || String(e); }
  }
  if (cfg.genUrl) {
    try { await postGeneric(cfg, msg); res.ok = true; res.dest.push('Webhook genérico'); }
    catch (e) { res.err = (res.err ? res.err + ' · ' : '') + (e.message || String(e)); }
  }
  if (!d.url && !cfg.genUrl) res.err = 'Sem destino configurado';
  return res;
}
export const hasDest = (cfg, kind) => !!(destFor(cfg, kind).url || cfg.genUrl);
