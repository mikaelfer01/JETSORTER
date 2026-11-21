// Motor de alertas e agendas: avalia regras a cada atualização, avisa uma vez (com reaviso, escalonamento e "normalizado"),
// fecha turnos, resume a madrugada e envia o relatório semanal. Só LÊ o sorter; o único tráfego de saída vai ao destino configurado.
import { deliver, hasDest } from './notify.js';
import { summary } from './api.js';
import { rowsToTurno, metricas, janelas, ofensoras } from './turnos.js';
import { PH } from './planhist.js';
import { HS, dayList, ap as apd } from './history.js';
import * as A from './analysis.js';
import { p2, fmt, dec, pc, esc, MIN, HOUR, DAY, hm, dm, dkey, WD, dur, ago, card, kvs, table, tag, btn, grid2, note } from './kit.js';

const KEY = 'ruleState';
export const RS = { active: {}, log: [], marks: {}, loaded: false, sentToday: 0, sentDay: '', last: {}, rules: {} };

export async function loadRules() {
  if (RS.loaded) return;
  try {
    const o = (await chrome.storage.local.get(KEY))[KEY];
    if (o) { RS.active = o.active || {}; RS.log = o.log || []; RS.marks = o.marks || {}; }
  } catch { /* opcional */ }
  RS.loaded = true;
}
let saveT = 0;
function persist(force) {
  const now = Date.now();
  if (!force && now - saveT < 5000) return;
  saveT = now;
  try { chrome.storage.local.set({ [KEY]: { active: RS.active, log: RS.log.slice(0, 300), marks: RS.marks } }); } catch { /* opcional */ }
}

// ---------- janelas de silêncio ----------
export function silenced(cfg, now) {
  const d = new Date(now), cur = d.getHours() * 60 + d.getMinutes();
  if (RS.mutedUntil && now < RS.mutedUntil) return true;
  for (const part of String(cfg.silencio || '').split(/[;,]/)) {
    const m = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/.exec(part); if (!m) continue;
    const a = +m[1] * 60 + +m[2], b = +m[3] * 60 + +m[4];
    if (a <= b ? cur >= a && cur < b : cur >= a || cur < b) return true;
  }
  return false;
}

// ---------- mensagem no idioma escolhido ----------
function lang(cfg, c) {
  const [pt, zh] = [c.pt, c.zh || c.pt];
  const id = cfg.idioma || 'pt';
  if (id === 'zh') return { title: zh[0], body: zh[1] };
  if (id === 'pt+zh') return { title: pt[0] + ' / ' + zh[0], body: pt[1] + '\n\n' + zh[1] };
  return { title: pt[0], body: pt[1] };
}

function logIt(e) {
  RS.log.unshift({ t: Date.now(), ...e });
  if (RS.log.length > 300) RS.log.length = 300;
}

async function send(cfg, now, kind, c, extra = {}) {
  const m = lang(cfg, c);
  const msg = { title: m.title, body: m.body, sev: c.sev, mentionAll: !!extra.mentionAll, link: cfg.painelUrl };
  const row = { key: c.key, rule: c.rule, sev: c.sev, title: m.title, tipo: kind, canal: kind === 'fecho' ? 'fecho' : 'alert' };
  // Feishu: só o relatório hora a hora, com disparo MANUAL (aba Relatório). Nenhum envio automático de alertas/fechamento/semanal.
  return false;
  // eslint-disable-next-line no-unreachable
  if (silenced(cfg, now)) { logIt({ ...row, st: 'silenciado' }); return false; }
  if (!hasDest(cfg, row.canal)) { logIt({ ...row, st: 'sem destino' }); return false; }
  const r = await deliver(cfg, row.canal, msg);
  const day = dkey(now); if (RS.sentDay !== day) { RS.sentDay = day; RS.sentToday = 0; }
  if (r.ok) RS.sentToday++;
  logIt({ ...row, st: r.ok ? 'enviado' : 'erro', err: r.err || '', dest: r.dest.join(' + ') });
  return r.ok;
}

// ---------- regras ----------
const layerOf = (r) => (r.ly ? r.ly.replace('Layer', 'L') : r.ind <= 6 ? 'L1' : 'L2');
const kindsDev = { wcs: ['Sem comunicação com o WCS', 'WCS 通信中断'], plc: ['CLP da estação offline', 'PLC 站点离线'] };

export const RULES = [
  { id: 'rej', nome: 'Rejeito acima do limite', flag: 'alrRej' },
  { id: 'block', nome: 'Chute block recorrente por saída', flag: 'alrBlock' },
  { id: 'ind', nome: 'Indução parada ou sem alimentar', flag: 'alrInd' },
  { id: 'vazao', nome: 'Queda de vazão do sorter', flag: 'alrVazao' },
  { id: 'dev', nome: 'Equipamento (carrinho, cortina, WCS, CLP)', flag: 'alrDev' },
  { id: 'bind', nome: 'Falha ao abrir lote', flag: 'alrBind' },
  { id: 'plano', nome: 'Plano de triagem alterado', flag: 'alrPlano' },
  { id: 'meta', nome: 'Ritmo abaixo da meta do turno', flag: 'alrMetaOn' },
  { id: 'desb', nome: 'Desbalanceamento entre Linha A e B', flag: 'alrDesb' },
  { id: 'vigia', nome: 'Vigia da conexão com o sorter', flag: 'alrVigia' }
];

export function evaluate(ctx) {
  const { now, cfg, rows = [], an, binds, lastOk, err, ns } = ctx;
  const out = [], on = (r) => cfg.alrOn && cfg[RULES.find((x) => x.id === r).flag] !== false;
  const add = (c) => out.push(c);
  const thr = +cfg.rejectThreshold || 3;

  if (on('vigia') && lastOk && now - lastOk > (+cfg.vigiaMin || 5) * MIN) {
    const m = Math.round((now - lastOk) / MIN);
    add({ key: 'vigia', rule: 'vigia', sev: 3, pt: ['Painel sem dados do sorter', `Sem leitura do sorter há **${m} min**.${err ? '\nErro: ' + err : ''}\nVerifique a rede/VPN ou se o sistema do sorter está no ar.`], zh: ['面板无法读取分拣机数据', `已 **${m} 分钟** 未读取到分拣机数据。请检查网络/VPN 或分拣系统状态。`] });
  }
  if (!rows.length) return out;

  if (on('rej') && ns && ns.total >= 100 && ns.rate > thr) {
    const ch = ns.topChutes.map(([k, n]) => `${A.chuteLabel(k)} (${n})`).join(', ') || '—';
    add({ key: 'rej', rule: 'rej', sev: ns.rate > thr * 2 ? 3 : 2, pt: ['Rejeito acima do limite', `Rejeito **${dec(ns.rate)}%** nos últimos ${ctx.cfg.nowMin} min (limite ${dec(thr)}%) — ${fmt(ns.rej)} de ${fmt(ns.total)} peças.\nSaídas que mais bloqueiam: ${ch}`], zh: ['异常率超过阈值', `最近 ${cfg.nowMin} 分钟异常率 **${dec(ns.rate)}%**（阈值 ${dec(thr)}%），${fmt(ns.rej)}/${fmt(ns.total)} 件。\n阻塞最多的格口：${ch}`] });
  }

  if (on('block')) {
    const w = (+cfg.alrBlockMin || 30) * MIN, m = new Map();
    for (const r of rows) if (r.t >= now - w && r.ex === A.BLOCK) { const k = A.chuteKey(r); m.set(k, (m.get(k) || 0) + 1); }
    for (const [k, n] of m) if (n >= (+cfg.chuteAlert || 5)) {
      const l = A.chuteLabel(k);
      add({ key: 'block:' + k, rule: 'block', sev: n >= 3 * (+cfg.chuteAlert || 5) ? 3 : 2, pt: [`Chute block na saída ${l}`, `**${n}** peças bloqueadas na saída **${l}** nos últimos ${cfg.alrBlockMin} min.\nConfira se a saída está cheia/fechada ou se o lote falhou ao abrir.`], zh: [`格口 ${l} 反复阻塞`, `格口 **${l}** 最近 ${cfg.alrBlockMin} 分钟阻塞 **${n}** 件。请检查格口是否已满/关闭或建包失败。`] });
    }
  }

  if (on('ind') && an) {
    const lim = (+cfg.alrIndMin || 15) * MIN;
    const flowing = rows.filter((r) => r.t >= now - 10 * MIN).length > 20;
    for (const x of an.inds) {
      const no = p2(x.no);
      if ((x.status === 'parada' || x.status === 'falha') && x.cur && now - x.cur.since >= lim) {
        const k = x.cur.kind;
        add({ key: 'ind:' + x.no, rule: 'ind', sev: x.status === 'falha' ? 3 : 2, pt: [`Indução ${no} ${x.status === 'falha' ? 'com falha' : 'parada'}`, `Indução **${no}** ${x.status === 'falha' ? 'em falha' : 'parada'} há **${ago(x.cur.since, now)}**${k ? ' (' + (ctx.KINDS && ctx.KINDS[k] ? ctx.KINDS[k].label : k) + ')' : ''}.`], zh: [`${no} 号供件台${x.status === 'falha' ? '故障' : '停止'}`, `${no} 号供件台已${x.status === 'falha' ? '故障' : '停止'} **${ago(x.cur.since, now)}**。`] });
      } else if (flowing && x.status === 'ociosa' && x.lastPiece && now - x.lastPiece >= lim) {
        add({ key: 'ind:' + x.no, rule: 'ind', sev: 1, pt: [`Indução ${no} sem alimentar`, `Indução **${no}** ligada mas sem peças há **${ago(x.lastPiece, now)}**, enquanto o sorter segue operando.`], zh: [`${no} 号供件台未供件`, `${no} 号供件台开机但已 **${ago(x.lastPiece, now)}** 无包裹，其他供件台仍在运行。`] });
      }
    }
  }

  if (on('vazao')) {
    const a = rows.filter((r) => r.t >= now - 15 * MIN).length * 4, b = rows.filter((r) => r.t >= now - 75 * MIN && r.t < now - 15 * MIN).length;
    const pct = +cfg.alrVazaoPct || 50;
    if (b >= 600 && a < (b * pct) / 100) {
      add({ key: 'vazao', rule: 'vazao', sev: 2, pt: ['Queda de vazão do sorter', `Ritmo atual **${fmt(a)} peças/h** nos últimos 15 min contra **${fmt(b)} peças/h** na hora anterior (${dec(pc(a, b), 0)}%).`], zh: ['分拣机处理量下降', `最近 15 分钟折合 **${fmt(a)} 件/小时**，前一小时 **${fmt(b)} 件/小时**（${dec(pc(a, b), 0)}%）。`] });
    }
  }

  if (on('dev') && an) {
    for (const x of an.intermit) add({ key: 'inter:' + x.no, rule: 'dev', sev: 2, pt: [`${x.intermit.kind === 'cortina de luz' ? 'Cortina de luz' : 'Sensor'} oscilando na indução ${p2(x.no)}`, `**${x.intermit.n}** falhas curtas em 30 min (mediana ${dur(x.intermit.medS)}). Provável sujeira/desalinhamento — limpar e conferir.`], zh: [`${p2(x.no)} 号供件台光幕/传感器间歇故障`, `30 分钟内 **${x.intermit.n}** 次短故障，建议清洁并检查对位。`] });
    for (const s of ctx.state || []) if (kindsDev[s.kind] && s.sev >= 3) add({ key: 'dev:' + s.kind + ':' + s.no, rule: 'dev', sev: 3, pt: [kindsDev[s.kind][0], `${kindsDev[s.kind][0]} — ${s.grp === 'ind' ? 'Indução ' + p2(s.no) : s.grp === 'chute' ? 'Saída ' + s.no : 'Sorter'}, desde ${hm(s.since)}.`], zh: [kindsDev[s.kind][1], `${kindsDev[s.kind][1]}（自 ${hm(s.since)}）。`] });
    for (const c of an.carriers) if (c.n >= 3 && now - c.last <= 30 * MIN) add({ key: 'car:' + c.layer + '-' + c.no, rule: 'dev', sev: 2, pt: [`Carrinho ${c.no} com falhas repetidas`, `Carrinho **${c.no}**${c.layer ? ' (L' + c.layer + ')' : ''}: ${c.n} falhas hoje, última há ${ago(c.last, now)}.`], zh: [`小车 ${c.no} 反复故障`, `小车 **${c.no}**${c.layer ? '（L' + c.layer + '）' : ''} 今日故障 ${c.n} 次，最近一次 ${ago(c.last, now)} 前。`] });
  }

  if (on('bind') && binds) {
    const by = new Map();
    for (const r of binds.values()) if (now - r.t <= 15 * MIN) by.set(r.chute, (by.get(r.chute) || 0) + 1);
    for (const [ch, n] of by) add({ key: 'bind:' + ch, rule: 'bind', sev: n >= 3 ? 3 : 2, pt: [`Falha ao abrir lote na saída ${ch}`, `**${n}** falha(s) de abertura de lote na saída **${ch}** nos últimos 15 min. Peças dessa saída tendem a virar Chute block.`], zh: [`格口 ${ch} 建包失败`, `格口 **${ch}** 最近 15 分钟建包失败 **${n}** 次，该格口包裹易触发格口阻塞。`] });
  }

  if (on('desb')) {
    const w = rows.filter((r) => r.t >= now - 60 * MIN && !r.ex);
    const a = w.filter((r) => layerOf(r) === 'L1').length, b = w.length - a, t = a + b;
    const d = t >= 400 ? (Math.abs(a - b) / t) * 100 : 0;
    if (d > (+cfg.desbL || 20)) add({ key: 'desb', rule: 'desb', sev: 1, pt: ['Linhas A e B desbalanceadas', `Última hora: Linha A **${fmt(a)}**, Linha B **${fmt(b)}** (diferença de ${dec(d, 0)} pontos, limite ${cfg.desbL}).`], zh: ['A/B 线负载不均', `最近一小时 A 线 **${fmt(a)}**，B 线 **${fmt(b)}**（差 ${dec(d, 0)} 点，阈值 ${cfg.desbL}）。`] });
  }

  if (on('meta') && +cfg.feishuMeta > 0) {
    const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
    for (const j of janelas(now, cfg)) {
      if (j.st !== 'andamento' || j.ini < d0.getTime()) continue;
      const el = (now - j.ini) / HOUR; if (el < 1.5) continue;
      const tot = rows.filter((r) => r.t >= j.ini && r.t < now).length, horas = (j.fim - j.ini) / HOUR;
      const meta = +cfg['meta' + j.id.replace('T3o', 'T3')] || cfg.feishuMeta * horas, proj = (tot / el) * horas;
      if (proj < meta * 0.9) add({ key: 'meta:' + j.id, rule: 'meta', sev: 1, pt: [`Turno ${j.nome} abaixo do ritmo da meta`, `Processadas **${fmt(tot)}** em ${dec(el, 1)} h. No ritmo atual o turno fecha em ~**${fmt(proj)}** (meta ${fmt(meta)}, ${dec(pc(proj, meta), 0)}%).\nPara bater a meta é preciso ~${fmt((meta - tot) / Math.max(0.1, horas - el))} peças/h até o fim.`], zh: [`${j.nome} 班次进度低于目标`, `已处理 **${fmt(tot)}** 件（${dec(el, 1)} 小时）。按当前节奏班次预计 ~**${fmt(proj)}**（目标 ${fmt(meta)}，${dec(pc(proj, meta), 0)}%）。`] });
    }
  }
  return out;
}

// alertas de um disparo só (plano alterado)
function oneShots(ctx) {
  const { cfg, now } = ctx, out = [];
  if (!cfg.alrOn || cfg.alrPlano === false) return out;
  const ev = (PH.hist && PH.hist.events) || [];
  const seen = RS.marks.planoT || 0;
  if (!RS.marks.planoInit) { RS.marks.planoInit = 1; RS.marks.planoT = ev.length ? ev[0].t : now; return out; }
  for (const e of ev.filter((x) => x.t > seen).reverse()) {
    const n = e.add.length + e.del.length + e.pAdd.length + e.pDel.length + e.base.length;
    const lst = [...e.add.slice(0, 4).map((x) => `+ ${x[1]} → saída ${x[0]}`), ...e.del.slice(0, 4).map((x) => `− ${x[1]} ← saída ${x[0]}`)].join('\n');
    out.push({ key: 'plano:' + e.t, rule: 'plano', sev: 2, pt: ['Plano de triagem alterado', `Plano **${e.code || '—'}** (antes ${e.from || '—'}): ${n} mudança(s) — ${e.add.length} segmento(s) adicionado(s), ${e.del.length} removido(s), ${e.base.length} troca(s) de base.\n${lst}`], zh: ['分拣方案已变更', `方案 **${e.code || '—'}**（原 ${e.from || '—'}）：${n} 处变更（新增 ${e.add.length}，移除 ${e.del.length}，基地变更 ${e.base.length}）。\n${lst}`] });
    RS.marks.planoT = Math.max(RS.marks.planoT || 0, e.t);
  }
  return out;
}

let busy = false;
export async function runRules(ctx) {
  if (busy) return; busy = true;
  try {
    await loadRules();
    const { cfg, now } = ctx, cand = evaluate(ctx), keys = new Set(cand.map((c) => c.key));
    RS.rules = {}; for (const c of cand) RS.rules[c.rule] = (RS.rules[c.rule] || 0) + 1;
    const cool = (+cfg.alrCooldown || 0) * MIN, esc2 = (+cfg.alrEscalMin || 0) * MIN;
    for (const c of cand) {
      let a = RS.active[c.key];
      if (!a) {
        a = RS.active[c.key] = { key: c.key, rule: c.rule, sev: c.sev, since: now, sentAt: 0, n: 1, acked: false, esc: false };
        a.title = lang(cfg, c).title; a.body = lang(cfg, c).body;
        logIt({ key: c.key, rule: c.rule, sev: c.sev, title: a.title, tipo: 'novo', st: 'aberto' });
        await send(cfg, now, 'novo', c); a.sentAt = now;
      } else {
        delete a.goneAt; a.sev = c.sev; const m = lang(cfg, c); a.title = m.title; a.body = m.body;
        if (!a.acked) {
          if (esc2 && !a.esc && now - a.since >= esc2) { a.esc = true; a.sentAt = now; await send(cfg, now, 'escalonado', { ...c, sev: 3, pt: ['ESCALONADO · ' + c.pt[0], c.pt[1]], zh: ['升级 · ' + c.zh[0], c.zh[1]] }, { mentionAll: true }); }
          else if (cool && now - a.sentAt >= cool) { a.sentAt = now; a.n++; await send(cfg, now, 'reaviso', { ...c, pt: ['Ainda ativo · ' + c.pt[0], c.pt[1]], zh: ['仍在持续 · ' + c.zh[0], c.zh[1]] }); }
        }
      }
    }
    for (const k of Object.keys(RS.active)) {
      if (keys.has(k) || (ctx.partial && k !== 'vigia')) continue;
      const a = RS.active[k];
      if (!a.goneAt) { a.goneAt = now; continue; }
      if (now - a.goneAt < 2 * MIN) continue;
      delete RS.active[k];
      logIt({ key: k, rule: a.rule, sev: 0, title: a.title, tipo: 'normalizado', st: 'fechado' });
      if (cfg.alrRecup && a.sentAt && a.sev >= 2 && !a.acked) await send(cfg, now, 'normalizado', { key: k, rule: a.rule, sev: 0, pt: ['Normalizado · ' + a.title, `O alerta terminou (durou ${ago(a.since, a.goneAt)}).`], zh: ['已恢复 · ' + a.title, `告警已解除（持续 ${ago(a.since, a.goneAt)}）。`] });
    }
    for (const c of oneShots(ctx)) { logIt({ key: c.key, rule: c.rule, sev: c.sev, title: lang(cfg, c).title, tipo: 'evento', st: 'aberto' }); await send(cfg, now, 'evento', c); }
    persist(false);
  } finally { busy = false; }
}

export function ack(key) { if (RS.active[key]) { RS.active[key].acked = true; logIt({ key, rule: RS.active[key].rule, sev: 0, title: RS.active[key].title, tipo: 'reconhecido', st: 'ok' }); persist(true); } }
export function mute(min, now = Date.now()) { RS.mutedUntil = min ? now + min * MIN : 0; }
export async function clearLog() { RS.log = []; persist(true); }

export async function testAlert(cfg) {
  const c = { key: 'teste', rule: 'teste', sev: 1, pt: ['Teste de alerta', 'Mensagem de teste do Sorter Monitor. Se você leu isto, o destino de alertas está funcionando.'], zh: ['告警测试', '这是 Sorter Monitor 的测试消息，收到即表示告警渠道正常。'] };
  const m = lang(cfg, c);
  return deliver(cfg, 'alert', { title: m.title, body: m.body, sev: 1, link: cfg.painelUrl });
}

// ---------- fechamento de turno, resumo da madrugada e relatório semanal ----------
async function dadosTurno(j, cfg) {
  const r = await summary({ start: j.ini, end: j.fim - 1000, group: 60, create: false });
  return metricas(j, rowsToTurno(r.data), j.fim, cfg);
}

async function fechar(j, ctx) {
  const { cfg, now, rows, lvl } = ctx;
  const m = await dadosTurno(j, cfg);
  if (!m.tot) return false;
  const prevJ = janelas(j.ini - 1, cfg).filter((x) => x.fim <= j.ini).sort((a, b) => b.fim - a.fim)[0];
  let prev = null; try { if (prevJ) prev = await dadosTurno(prevJ, cfg); } catch { /* sem comparação */ }
  const of = ofensoras(rows, j, j.fim, lvl);
  const nome = j.id === 'T3o' ? 'T3' : j.nome, sev = m.taxa > (+cfg.rejectThreshold || 3) ? 2 : 0;
  const lim = +cfg.rejectThreshold || 3, ok = m.taxa <= lim;
  const dl = prev && prev.tot ? ` (${m.tot >= prev.tot ? '+' : ''}${dec(pc(m.tot - prev.tot, prev.tot), 1)}% vs ${prevJ.id === 'T3o' ? 'T3' : prevJ.nome})` : '';
  const pt = [`Fechamento do turno ${nome} · ${dm(j.ini)}`, [
    `**${fmt(m.tot)}** peças processadas${dl} · **${dec(m.apPct, 2)}%** de aproveitamento · rejeito **${dec(m.taxa, 2)}%** (${fmt(m.abn)}${m.blk ? ', ' + fmt(m.blk) + ' Chute block' : ''}) ${ok ? '✅' : '⚠️'}`,
    `Ritmo médio ${fmt(m.pph)} peças/h${m.melhor ? ` · melhor faixa ${m.melhor.lab} (${fmt(m.melhor.tot)})` : ''}${m.pior ? ` · pior ${m.pior.lab} (${fmt(m.pior.tot)})` : ''}`,
    m.temLinhas ? `Linha A ${fmt(m.a)} (${dec(pc(m.a, m.tot), 0)}%) · Linha B ${fmt(m.b)} (${dec(pc(m.b, m.tot), 0)}%)` : '',
    m.metaPct != null ? `Meta: ${dec(m.metaPct, 0)}% (${fmt(m.metaTot)})` : '',
    of && of.rej ? `Principais ofensores: ${[of.motivo && 'motivo ' + of.motivo[0], of.saida && 'saída ' + of.saida[0], of.rota && 'rota ' + of.rota[0]].filter(Boolean).join(' · ')}` : ''].filter(Boolean).join('\n')];
  const zh = [`${nome} 班次收班 · ${dm(j.ini)}`, `处理 **${fmt(m.tot)}** 件 · 有效率 **${dec(m.apPct, 2)}%** · 异常率 **${dec(m.taxa, 2)}%**（${fmt(m.abn)}）\n平均 ${fmt(m.pph)} 件/小时${m.temLinhas ? `\nA 线 ${fmt(m.a)} · B 线 ${fmt(m.b)}` : ''}`];
  if (j.id === 'T3o' && cfg.resumoOn) {
    const ev = RS.log.filter((x) => x.t >= j.ini && x.t < j.fim && x.tipo === 'novo' && x.sev >= 2);
    if (ev.length) {
      const l = ev.slice(0, 6).map((x) => `• ${hm(x.t)} ${x.title}`).join('\n');
      pt[1] += `\n\n**Pontos de atenção da madrugada (${ev.length}):**\n${l}`;
      zh[1] += `\n\n**夜班关注点（${ev.length}）：**\n${ev.slice(0, 6).map((x) => `• ${hm(x.t)} ${x.title}`).join('\n')}`;
    } else { pt[1] += '\n\nSem alertas relevantes durante a madrugada.'; zh[1] += '\n\n夜班无重要告警。'; }
  }
  return send(cfg, now, 'fecho', { key: 'fecho:' + j.id, rule: 'fecho', sev, pt, zh });
}

async function semanal(ctx) {
  const { cfg, now } = ctx;
  const ks = dayList().filter((k) => k < dkey(now)).slice(-14);
  if (ks.length < 3) return false;
  const cur = ks.slice(-7), old = ks.slice(0, -7);
  const sum = (a) => a.reduce((x, k) => { const d = HS.days[k]; return { tot: x.tot + d.tot, abn: x.abn + d.abn, blk: x.blk + (d.blk || 0) }; }, { tot: 0, abn: 0, blk: 0 });
  const c = sum(cur), o = sum(old);
  const best = [...cur].sort((a, b) => HS.days[b].tot - HS.days[a].tot)[0], worst = [...cur].sort((a, b) => apd(HS.days[a]) - apd(HS.days[b]))[0];
  const kd = (k) => { const [y, m, d] = k.split('-').map(Number); return WD[new Date(y, m - 1, d).getDay()] + ' ' + p2(d) + '/' + p2(m); };
  const dl = o.tot ? ` (${c.tot >= o.tot ? '+' : ''}${dec(pc(c.tot - o.tot, o.tot), 1)}% vs semana anterior)` : '';
  const pt = ['Relatório semanal do sorter', `Últimos ${cur.length} dias: **${fmt(c.tot)}** peças${dl} · média **${fmt(c.tot / cur.length)}**/dia\nAproveitamento **${dec(pc(c.tot - c.abn, c.tot), 2)}%**${o.tot ? ` (anterior ${dec(pc(o.tot - o.abn, o.tot), 2)}%)` : ''} · Chute block ${fmt(c.blk)}\nMaior volume: ${kd(best)} (${fmt(HS.days[best].tot)}) · Pior aproveitamento: ${kd(worst)} (${dec(apd(HS.days[worst]), 2)}%)`];
  const zh = ['分拣机周报', `近 ${cur.length} 天：**${fmt(c.tot)}** 件，日均 **${fmt(c.tot / cur.length)}**；有效率 **${dec(pc(c.tot - c.abn, c.tot), 2)}%**；格口阻塞 ${fmt(c.blk)}。`];
  return send(cfg, now, 'fecho', { key: 'semanal', rule: 'semanal', sev: 0, pt, zh });
}

let sBusy = false;
export async function runSchedules(ctx) {
  if (sBusy) return; sBusy = true;
  try {
    await loadRules();
    const { cfg, now } = ctx;
    if (cfg.fechoOn) {
      for (const j of janelas(now, cfg)) {
        if (j.st !== 'fechado') continue;
        const at = j.fim + (+cfg.fechoMin || 0) * MIN, mk = 'fecho:' + j.id + ':' + dkey(j.ini);
        if (now < at || now > at + 90 * MIN || RS.marks[mk]) continue;
        RS.marks[mk] = now; persist(true);
        try { await fechar(j, ctx); } catch (e) { logIt({ key: mk, rule: 'fecho', sev: 1, title: 'Fechamento ' + j.nome, tipo: 'fecho', st: 'erro', err: e.message || String(e) }); }
      }
    }
    if (cfg.semanalOn) {
      const d = new Date(now), mk = 'sem:' + dkey(now);
      if (d.getDay() === +cfg.semanalDia && d.getHours() >= +cfg.semanalHora && !RS.marks[mk]) { RS.marks[mk] = now; persist(true); try { await semanal(ctx); } catch { /* tenta no próximo dia */ } }
    }
    for (const k of Object.keys(RS.marks)) if (/^(fecho|sem):/.test(k) && now - RS.marks[k] > 10 * DAY) delete RS.marks[k];
  } finally { sBusy = false; }
}

// ---------- tela Alertas ----------
const SEV = ['ok', 'info', 'warn', 'bad'];
const SEVL = ['normal', 'informativo', 'atenção', 'crítico'];
export function renderAlertas(el, c) {
  const { now, cfg } = c;
  const act = Object.values(RS.active).filter((a) => !a.goneAt).sort((a, b) => b.sev - a.sev || a.since - b.since);
  const crit = act.filter((a) => a.sev >= 3).length, today = RS.log.filter((x) => dkey(x.t) === dkey(now));
  const dest = hasDest(cfg, 'alert') ? 'configurado' : 'não configurado';
  const mu = RS.mutedUntil && RS.mutedUntil > now ? ` · silenciado até ${hm(RS.mutedUntil)}` : silenced(cfg, now) ? ' · em janela de silêncio' : '';
  const kpi = kvs([['Alertas ativos', fmt(act.length), act.length ? 'bad' : 'ok'], ['Críticos', fmt(crit), crit ? 'bad' : 'ok'], ['Avisos hoje', fmt(today.filter((x) => x.tipo === 'novo').length)], ['Mensagens enviadas hoje', fmt(RS.sentToday || today.filter((x) => x.st === 'enviado').length)], ['Destino', dest, hasDest(cfg, 'alert') ? 'ok' : 'warn']]);
  const bar = `<div class="kbar">${btn('Configurar alertas', 'data-alr="cfg"')}${btn('Enviar teste', 'data-alr="test"')}${btn('Silenciar 1 h', 'data-alr="mute"')}${RS.mutedUntil > now ? btn('Reativar', 'data-alr="unmute"') : ''}${btn('Limpar histórico', 'data-alr="clear"')}<span class="muted">${cfg.alrOn ? 'Alertas ligados' : 'Alertas desligados'}${mu}</span></div>`;
  const ativos = table(['Gravidade', 'Alerta', 'Detalhe', 'Desde', 'Duração', ''], act.map((a) => [tag(SEVL[a.sev], SEV[a.sev]), `<b>${esc(a.title)}</b>`, esc(String(a.body).replace(/\*\*/g, '').split('\n')[0]).slice(0, 220), hm(a.since), ago(a.since, now), a.acked ? tag('reconhecido', 'ok') : btn('Reconhecer', `data-alr="ack" data-k="${esc(a.key)}"`)]), { empty: 'Nenhum alerta ativo agora. ✅', cls: 'tnt' });
  const regras = table(['Regra', 'Situação', 'Agora'], RULES.map((r) => { const on = cfg.alrOn && cfg[r.flag] !== false, n = RS.rules[r.id] || 0; return [r.nome, on ? tag('ligada', 'ok') : tag('desligada', ''), n ? tag(n + ' ativo(s)', 'bad') : '—']; }), { cls: 'tnt' });
  const hist = table(['Hora', 'Tipo', 'Alerta', 'Gravidade', 'Entrega'], RS.log.slice(0, 80).map((x) => [dm(x.t) + ' ' + hm(x.t), x.tipo, esc(x.title || ''), tag(SEVL[x.sev] || '', SEV[x.sev] || ''), x.st === 'erro' ? `<span class="rate bad" title="${esc(x.err)}">erro</span>` : esc(x.st + (x.dest ? ' · ' + x.dest : ''))]), { empty: 'Sem histórico ainda.', cls: 'tnt' });
  el.innerHTML = card('Alertas', 'regras avaliadas a cada atualização', 'Mostra o que está errado agora, o que já foi avisado e como cada aviso foi entregue. Os limites e destinos se configuram aqui mesmo.', bar + kpi) +
    card('Alertas ativos', '', '', ativos, act.length ? 'Reconhecer interrompe os reavisos desse alerta, mas ele segue listado até a condição terminar.' : '') +
    grid2(card('Regras', '', 'Liga/desliga em “Configurar alertas”.', regras) + card('Histórico de avisos', 'últimos 80', '', hist));
  el.onclick = async (e) => {
    const b = e.target.closest('[data-alr]'); if (!b) return;
    const a = b.dataset.alr;
    if (a === 'ack') { ack(b.dataset.k); c.redraw(); } else if (a === 'mute') { mute(60); c.redraw(); } else if (a === 'unmute') { mute(0); c.redraw(); } else if (a === 'clear') { await clearLog(); c.redraw(); } else if (a === 'cfg') c.openCfg('alertas');
    else if (a === 'test') { b.disabled = true; const r = await testAlert(cfg); b.disabled = false; logIt({ key: 'teste', rule: 'teste', sev: 1, title: 'Teste de alerta', tipo: 'teste', st: r.ok ? 'enviado' : 'erro', err: r.err, dest: r.dest.join(' + ') }); persist(true); c.redraw(); }
  };
}
