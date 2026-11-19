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
  // Payment methods are chosen in the Stripe Dashboard (Settings > Payment methods), not here.
  params.append('success_url', `${origin}/success.html`);
  params.append('cancel_url', `${origin}/#order`);
  params.append('shipping_address_collection[allowed_countries][0]', 'LT');
  params.append('phone_number_collection[enabled]', 'true');
  params.append('adaptive_pricing[enabled]', 'false');
  // Optional note for the courier. 35 characters is what DPD prints on the label.
  params.append('custom_fields[0][key]', 'delivery_note');
  params.append('custom_fields[0][type]', 'text');
  params.append('custom_fields[0][label][type]', 'custom');
  params.append('custom_fields[0][label][custom]', 'Note for the courier (door code, floor)');
  params.append('custom_fields[0][optional]', 'true');
  params.append('custom_fields[0][text][maximum_length]', '35');
  // Shown right above the Pay button.
  params.append('custom_text[submit][message]', 'If you add a note for the courier, we pass it on to DPD exactly as you write it. Please check door codes and instructions carefully, as the information you give is your responsibility.');
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
