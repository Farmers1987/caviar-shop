// Prices in euro cents, incl. VAT. The server is the source of truth: the browser only sends ids and quantities.
const CATALOG = {
  'sib5-30': { name: 'Antonius Caviar Siberian 5*, 30 g', cents: 4500 },
  'sib5-50': { name: 'Antonius Caviar Siberian 5*, 50 g', cents: 7500 },
  'sib6-30': { name: 'Antonius Caviar Siberian 6*, 30 g', cents: 6000 },
  'sib6-50': { name: 'Antonius Caviar Siberian 6*, 50 g', cents: 10000 },
  'osc5-30': { name: 'Antonius Caviar Oscietra 5*, 30 g', cents: 6000 },
  'osc5-50': { name: 'Antonius Caviar Oscietra 5*, 50 g', cents: 10000 },
  'osc6-30': { name: 'Antonius Caviar Oscietra 6*, 30 g', cents: 7950 },
  'osc6-50': { name: 'Antonius Caviar Oscietra 6*, 50 g', cents: 13250 },
  spoon: { name: 'Mother-of-pearl caviar spoon', cents: 1500 },
  opener: { name: 'Caviar tin opener', cents: 1500 },
};

const FREE_FROM_CENTS = 15000;

// Delivery fee for orders under the free-delivery limit. Set SHIPPING_FEE_CENTS in Vercel (e.g. 790 for 7,90 €).
function shippingFeeCents() {
  const raw = process.env.SHIPPING_FEE_CENTS;
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 10000 ? n : null;
}

module.exports = { CATALOG, FREE_FROM_CENTS, shippingFeeCents };
