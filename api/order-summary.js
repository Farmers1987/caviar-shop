// What the thank-you page needs to report a purchase to Analytics: order ref, value and items.
// Only for paid sessions, and no personal data (no name, email, address).
const { CATALOG } = require('./_shared.js');
const stock = require('./_stock.js');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const key = process.env.STRIPE_SECRET_KEY;
  const id = String((req.query && req.query.session_id) || new URL(req.url, 'http://x').searchParams.get('session_id') || '');
  if (!key || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return res.status(400).json({ error: 'bad_session' });
  try {
    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${id}`, { headers: { Authorization: `Bearer ${key}` } });
    const s = await r.json();
    if (!r.ok || s.payment_status !== 'paid') return res.status(404).json({ error: 'not_paid' });
    const items = stock.decodeItems(s.metadata && s.metadata.items);
    return res.status(200).json({
      transaction_id: id.slice(-8).toUpperCase(),
      currency: 'EUR',
      value: (s.amount_total || 0) / 100,
      shipping: ((s.shipping_cost && s.shipping_cost.amount_total) || 0) / 100,
      items: Object.keys(items).map((k) => ({ item_id: k, item_name: CATALOG[k].name, price: CATALOG[k].cents / 100, quantity: items[k] })),
    });
  } catch (e) {
    console.error('order summary failed', e.message);
    return res.status(502).json({ error: 'failed' });
  }
};
