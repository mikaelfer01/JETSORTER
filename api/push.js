// Recebe o Mapa que o app do Windows envia (protegido por PUSH_KEY) e guarda no Upstash Redis por 10 min.
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-key');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'use POST' });
  if (!process.env.PUSH_KEY || req.headers['x-key'] !== process.env.PUSH_KEY) return res.status(401).json({ error: 'chave inválida' });
  if (!URL_ || !TOKEN) return res.status(500).json({ error: 'Upstash Redis não configurado (variáveis de ambiente)' });
  let body = '';
  if (typeof req.body === 'string') body = req.body; else if (req.body) body = JSON.stringify(req.body);
  if (!body || body.length > 900000) return res.status(413).json({ error: 'corpo vazio ou grande demais' });
  try {
    const r = await fetch(`${URL_}/set/sorter_map?EX=600`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body });
    if (!r.ok) return res.status(502).json({ error: 'falha ao gravar', status: r.status });
    let watch = false;
    try { const w = await fetch(`${URL_}/get/sorter_watch`, { headers: { Authorization: `Bearer ${TOKEN}` } }); watch = !!(await w.json()).result; } catch (e) {}
    return res.status(200).json({ ok: true, watch });
  } catch (e) { return res.status(502).json({ error: String(e && e.message || e) }); }
};
