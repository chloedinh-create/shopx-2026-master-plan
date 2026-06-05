// Vercel serverless function — shared comments storage (Vercel KV / Upstash Redis)
// GET  /api/comments       → returns { items: [...], updatedAt }
// POST /api/comments       → body { items: [...] } → stores full state, returns { ok, count, updatedAt }
//
// Uses raw fetch to Upstash REST API (works với both Vercel KV và Marketplace Upstash).
// Env vars: KV_REST_API_URL + KV_REST_API_TOKEN (Vercel KV)
//        OR UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (Marketplace Upstash)

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const STORAGE_KEY = 'shopx:comments';

async function kvGet(key) {
  const r = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  if (!r.ok) throw new Error(`KV GET failed: ${r.status}`);
  const j = await r.json();
  if (j.result == null) return null;
  try { return JSON.parse(j.result); } catch { return j.result; }
}

async function kvSet(key, value) {
  const body = JSON.stringify(value);
  const r = await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`KV SET failed: ${r.status}`);
  return true;
}

module.exports = async (req, res) => {
  // CORS not needed (same-origin) — but allow if accessed externally
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(500).json({
      error: 'KV storage not configured. Enable Vercel KV trong dashboard và connect to project.',
    });
  }

  try {
    if (req.method === 'GET') {
      const data = await kvGet(STORAGE_KEY);
      const payload = data || { items: [], updatedAt: null };
      return res.status(200).json(payload);
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      let body = req.body;
      // Vercel parses JSON body automatically; but handle string too
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      if (!body || !Array.isArray(body.items)) {
        return res.status(400).json({ error: 'Invalid body — expected { items: [...] }' });
      }
      const payload = {
        items: body.items,
        updatedAt: new Date().toISOString(),
        clientId: body.clientId || null,
      };
      await kvSet(STORAGE_KEY, payload);
      return res.status(200).json({ ok: true, count: payload.items.length, updatedAt: payload.updatedAt });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
};
