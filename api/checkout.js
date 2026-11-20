const { CATALOG, FREE_FROM_CENTS, shippingFeeCents, productName } = require('./_shared.js');
const stock = require('./_stock.js');
const guard = require('./_guard.js');

// Texts on the Stripe payment page, per language.
const TEXT = {
  en: {
    note: 'Note for the courier (door code, floor)',
    submit: 'Caviar is a perishable food and cannot be returned once delivered, unless it is faulty. If you add a note for the courier, we pass it on to DPD exactly as you write it. Please check door codes and instructions carefully, as the information you give is your responsibility.',
    shipping: 'Chilled delivery in Lithuania, within 3 working days',
  },
  lt: {
    note: 'Žinutė kurjeriui (durų kodas, aukštas)',
    submit: 'Ikrai yra greitai gendantis maisto produktas, todėl pristatyti negali būti grąžinami, nebent yra su trūkumais. Jei parašysite žinutę kurjeriui, perduosime ją DPD tiksliai taip, kaip parašėte. Atidžiai patikrinkite durų kodus ir nurodymus – už pateiktą informaciją atsakote jūs.',
    shipping: 'Atvėsintas pristatymas Lietuvoje per 3 darbo dienas',
  },
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(503).json({ error: 'not_configured' });
  // Open payments hold tins for 30 minutes, so limit how many one visitor can start.
  if (await guard.over(req, 'checkout', { limit: 15, windowSec: 600 })) return res.status(429).json({ error: 'too_many' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  const lang = body && body.lang === 'lt' ? 'lt' : 'en';
  const T = TEXT[lang];
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
    params.append(`line_items[${i}][price_data][product_data][name]`, productName(id, lang));
  }

  // Never sell more than is in stock. Open payments hold their tins until they expire (30 minutes).
  try {
    const av = await stock.availability(key, { fresh: true });
    if (av) {
      const short = {};
      for (const it of items) {
        const left = Math.max(0, av.available[String(it.id)]);
        if (Number(it.qty) > left) short[String(it.id)] = left;
      }
      if (Object.keys(short).length) return res.status(409).json({ error: 'stock', available: short });
    }
  } catch (e) {
    console.error('stock check failed', e.message);
    return res.status(503).json({ error: 'stock_unavailable' });
  }
  params.append('metadata[items]', stock.encodeItems(items.map((it) => ({ id: String(it.id), qty: Number(it.qty) }))));
  params.append('metadata[lang]', lang);
  params.append('locale', lang);
  params.append('expires_at', String(Math.floor(Date.now() / 1000) + 31 * 60));

  const fee = subtotal >= FREE_FROM_CENTS ? 0 : shippingFeeCents() || 0;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = `https://${host}`;

  params.append('mode', 'payment');
  // Payment methods are chosen in the Stripe Dashboard (Settings > Payment methods), not here.
  params.append('success_url', `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}${lang === 'lt' ? '&lang=lt' : ''}`);
  params.append('cancel_url', `${origin}/${lang === 'lt' ? '?lang=lt' : ''}#order`);
  params.append('shipping_address_collection[allowed_countries][0]', 'LT');
  params.append('phone_number_collection[enabled]', 'true');
  params.append('adaptive_pricing[enabled]', 'false');
  // Optional note for the courier. 35 characters is what DPD prints on the label.
  params.append('custom_fields[0][key]', 'delivery_note');
  params.append('custom_fields[0][type]', 'text');
  params.append('custom_fields[0][label][type]', 'custom');
  params.append('custom_fields[0][label][custom]', T.note);
  params.append('custom_fields[0][optional]', 'true');
  params.append('custom_fields[0][text][maximum_length]', '35');
  // Shown right above the Pay button.
  params.append('custom_text[submit][message]', T.submit);
  params.append('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
  params.append('shipping_options[0][shipping_rate_data][display_name]', T.shipping);
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
