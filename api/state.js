// Entrega o último Mapa ao celular (protegido por VIEW_KEY).
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const k = req.headers['x-key'] || (req.query && req.query.k);
  if (!process.env.VIEW_KEY || k !== process.env.VIEW_KEY) return res.status(401).json({ error: 'chave inválida' });
  if (!URL_ || !TOKEN) return res.status(500).json({ error: 'Upstash Redis não configurado (variáveis de ambiente)' });
  try {
    // avisa o app do Windows que há alguém olhando (ele passa a enviar a cada ~4 s)
    fetch(`${URL_}/set/sorter_watch/1?EX=20`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` } }).catch(() => {});
    const r = await fetch(`${URL_}/get/sorter_map`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const j = await r.json();
    if (!j.result) return res.status(404).json({ empty: true });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).send(j.result);
  } catch (e) { return res.status(502).json({ error: String(e && e.message || e) }); }
};
