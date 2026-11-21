// Associa as rotas obrigatórias (comunicado) aos nomes de saída do plano ativo (gridname), tolerando grafia:
// prefixos (DC / F / PA / CDC), UF no fim ("DC SBA-BA") ou no começo ("BA SBA"), espaços, hífens, números ("001", "02"), "S-" de São Paulo.
// Níveis: exata = mesmo código e mesma UF · provavel = mesmo código, UF ausente de um lado (ou número diferente) · verificar = mesmo código, UF diferente (NÃO aplicado).
const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));

export function parseRota(raw) {
  let s = String(raw || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const o = { raw: String(raw).trim(), pre: '', uf: '', num: '', code: '', alt: '' };
  let m = /^CDC\s*-\s*([A-Z]{2})$/.exec(s);
  if (m && UFS.has(m[1])) return { ...o, code: 'CDC', uf: m[1] };
  const tail = /\s*-\s*([A-Z]{2})$/.exec(s);
  const hasTailUF = tail && UFS.has(tail[1]);
  for (;;) { // prefixos
    const p = /^(DC|F|CDC)\s+/.exec(s) || (hasTailUF && /^(PA)\s+/.exec(s));
    if (!p) break; o.pre += (o.pre ? ' ' : '') + p[1]; s = s.slice(p[0].length);
  }
  if (hasTailUF) { const t = /\s*-\s*([A-Z]{2})$/.exec(s); if (t && UFS.has(t[1])) { o.uf = t[1]; s = s.slice(0, t.index); } }
  else { const l = /^([A-Z]{2})\s+(.+)$/.exec(s); if (l && UFS.has(l[1])) { o.uf = l[1]; s = l[2]; } else if (l && !o.pre) { o.ufBad = l[1]; s = l[2]; } }
  const n = /\s+0*(\d{1,3})$/.exec(s); if (n) { o.num = String(+n[1]); s = s.slice(0, n.index); }
  s = s.replace(/\s*-\s*$/, '');
  o.code = s.replace(/[^A-Z0-9]/g, '');
  if (/^S-/.test(s)) o.alt = o.code.slice(1); // "S-MOO" ~ "MOO"
  return o.code.length >= 3 ? o : null;
}

export function casar(rota, nomePlano) {
  const R = parseRota(rota); if (!R) return null;
  let best = null; const rank = { exata: 3, provavel: 2, verificar: 1 };
  for (const nm of String(nomePlano || '').split('/')) {
    const P = parseRota(nm); if (!P) continue;
    if (/\bF\b/.test(P.pre) && !/\bF\b/.test(R.pre)) continue; // base franqueada (F xxx) não é a rota do comunicado
    const ra = new Set([R.code, R.alt].filter(Boolean)), pa = new Set([P.code, P.alt].filter(Boolean));
    if (![...ra].some((c) => pa.has(c))) continue;
    let nivel;
    if (R.uf && P.uf) nivel = R.uf === P.uf ? 'exata' : 'verificar'; else nivel = 'provavel';
    if (nivel === 'exata' && (R.num || P.num) && R.num !== P.num) nivel = 'provavel';
    if (nivel === 'exata' && (R.alt || P.alt) && !(ra.has(P.code) && pa.has(R.code))) nivel = 'provavel';
    if (!best || rank[nivel] > rank[best.nivel]) best = { nivel, plano: nm.trim() };
  }
  return best;
}

// associa todas as rotas às LINHAS do plano (nome do destino + códigos de segmento) de cada saída:
// [{rota, saidas:[{k, nivel, plano, codes[]}]}]. Sem `rows` (plano antigo/simulado) usa o nome da saída.
export function associar(rotas, planMap) {
  return rotas.map((r) => {
    const saidas = [];
    for (const [k, e] of planMap) {
      const rows = e.rows && e.rows.length ? e.rows : [{ name: e.full, codes: e.codes || [] }];
      let best = null; const cod = new Set();
      for (const w of rows) { const c = casar(r, w.name); if (!c) continue; (w.codes || []).forEach((x) => cod.add(x)); if (!best || ({ exata: 3, provavel: 2, verificar: 1 }[c.nivel] > { exata: 3, provavel: 2, verificar: 1 }[best.nivel])) best = c; }
      if (best) saidas.push({ k, ...best, codes: [...cod] });
    }
    const R = parseRota(r); let aviso = '';
    if (R && R.ufBad) aviso = `UF “${R.ufBad}” não existe — grafia? (confira: ${[...UFS].filter((u) => (u[0] === R.ufBad[0]) !== (u[1] === R.ufBad[1])).join(', ')})`;
    // sem saída própria: o plano manda tudo da UF para a saída de código de UF (segmento mais genérico)
    if (R && R.uf && !saidas.some((s) => s.nivel !== 'verificar')) {
      const cand = [];
      for (const [k, e] of planMap) {
        const w = (e.rows || []).find((x) => (x.codes || []).some((c) => c === R.uf || c === R.uf + '1'));
        if (w && !String(w.name).toUpperCase().startsWith('F ')) cand.push({ k, nivel: 'uf', plano: w.name, codes: w.codes.filter((c) => c === R.uf || c === R.uf + '1') });
      }
      if (cand.length <= 4) saidas.push(...cand); // UF genérica (ex.: MG, presente em dezenas de saídas) não identifica a rota
    }
    saidas.sort((a, b) => +a.k - +b.k);
    return { rota: r, saidas, aviso };
  });
}
