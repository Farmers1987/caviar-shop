const { CATALOG, FREE_FROM_CENTS, shippingFeeCents } = require('./_shared.js');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(503).json({ error: 'not_configured' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  const items = body && Array.isArray(body.items) ? body.items : null;
  if (!items || items.length === 0 || items.length > 20) return res.status(400).json({ error: 'invalid_order' });

  const params = new URLSearchParams();
  const seen = new Set();
  let subtotal = 0;
  for (let i = 0; i < items.length; i++) {
    const id = String(items[i].id);
    const qty = Number(items[i].qty);
    const product = Object.prototype.hasOwnProperty.call(CATALOG, id) ? CATALOG[id] : null;
    if (!product || seen.has(id) || !Number.isInteger(qty) || qty < 1 || qty > 20) {
      return res.status(400).json({ error: 'invalid_order' });
    }
    seen.add(id);
    subtotal += product.cents * qty;
    params.append(`line_items[${i}][quantity]`, String(qty));
    params.append(`line_items[${i}][price_data][currency]`, 'eur');
    params.append(`line_items[${i}][price_data][unit_amount]`, String(product.cents));
    params.append(`line_items[${i}][price_data][product_data][name]`, product.name);
  }

  const fee = subtotal >= FREE_FROM_CENTS ? 0 : shippingFeeCents() || 0;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = `https://${host}`;

  params.append('mode', 'payment');
  // Only cards (incl. Apple Pay and Google Pay) and Stripe Link, whatever the account has switched on.
  params.append('payment_method_types[0]', 'card');
  params.append('payment_method_types[1]', 'link');
  params.append('success_url', `${origin}/success.html`);
  params.append('cancel_url', `${origin}/#order`);
  params.append('shipping_address_collection[allowed_countries][0]', 'LT');
  params.append('phone_number_collection[enabled]', 'true');
  params.append('adaptive_pricing[enabled]', 'false');
  params.append('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
  params.append('shipping_options[0][shipping_rate_data][display_name]', 'Chilled delivery in Lithuania, within 3 working days');
  params.append('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(fee));
  params.append('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'eur');

  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await r.json();
    if (!r.ok || !data.url) {
      console.error('Stripe error', r.status, data && data.error ? data.error.message : '');
      return res.status(502).json({ error: 'payment_unavailable' });
    }
    return res.status(200).json({ url: data.url });
  } catch (e) {
    console.error('Stripe request failed', e && e.message);
    return res.status(502).json({ error: 'payment_unavailable' });
  }
};
