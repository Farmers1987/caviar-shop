// Admin: read and set the number of tins available to sell. Protected by ADMIN_PASSWORD (set in Vercel).
const crypto = require('crypto');
const { CATALOG } = require('./_shared.js');
const stock = require('./_stock.js');
const guard = require('./_guard.js');

function allowed(req) {
  const want = process.env.ADMIN_PASSWORD || '';
  const got = String(req.headers['x-admin-password'] || '');
  if (want.length < 12 || !got) return false;
  const a = crypto.createHash('sha256').update(want).digest();
  const b = crypto.createHash('sha256').update(got).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  // A password under 12 characters is treated as not set, so a weak one can never be used.
  if ((process.env.ADMIN_PASSWORD || '').length < 12) return res.status(503).json({ error: 'no_password' });
  if (!stock.enabled()) return res.status(503).json({ error: 'no_storage' });
  if (await guard.adminLocked(req)) return res.status(429).json({ error: 'locked' });
  if (!allowed(req)) {
    // Only an actual password counts as a guess; a visit without one (opening the page, link previews) does not.
    if (req.headers['x-admin-password']) await guard.adminFailed(req);
    await new Promise((r) => setTimeout(r, 600));
    return res.status(401).json({ error: 'wrong_password' });
  }
  const key = process.env.STRIPE_SECRET_KEY;
  try {
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
      if (!body || typeof body.counts !== 'object') return res.status(400).json({ error: 'invalid' });
      await stock.saveSnapshot(body.counts, 'admin', body.batches);
    } else if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'method' });
    }
    const av = key ? await stock.availability(key, { fresh: true }) : null;
    const products = Object.keys(CATALOG).map((k) => ({
      id: k, name: CATALOG[k].name,
      available: av ? av.available[k] : null,
      soldSince: av ? av.taken[k] || 0 : 0,
      batches: av && av.batches[k] ? stock.remainingBatches(av.batches[k], av.taken[k]) : [],
    }));
    return res.status(200).json({ on: !!av, setAt: av ? av.setAt : null, products });
  } catch (e) {
    console.error('admin stock failed', e.message);
    return res.status(500).json({ error: 'failed' });
  }
};
