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
  spoon: { name: 'Mother-of-pearl caviar spoon', lt: 'Perlamutrinis šaukštelis ikrams', cents: 1500 },
  opener: { name: 'Caviar tin opener', lt: 'Ikrų skardinių atidarytuvas', cents: 1500 },
};

const FREE_FROM_CENTS = 15000;

// Delivery fee for orders under the free-delivery limit. Set SHIPPING_FEE_CENTS in Vercel (e.g. 790 for 7,90 €).
function shippingFeeCents() {
  const raw = process.env.SHIPPING_FEE_CENTS;
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 10000 ? n : null;
}

// Product name in the customer's language (caviar names are the same in both).
function productName(id, lang) { const p = CATALOG[id]; return lang === 'lt' && p.lt ? p.lt : p.name; }

// ---- B2B (restaurants and shops) ------------------------------------------------
// Trade prices in euro cents EXCL. VAT, from the Antonius Caviar 2026 tin price list.
const VAT_RATE = 0.21;
const B2B_MIN_CENTS = 10000; // minimum order excl. VAT for free DPD delivery; pick-up has no minimum
const CAVIARS = {
  sib5: { name: 'Siberian 5*', latin: 'Acipenser baerii', stars: 5, cents: { 30: 2715, 50: 4525, 125: 11313, 250: 22625 } },
  sib6: { name: 'Siberian 6*', latin: 'Acipenser baerii', stars: 6, cents: { 30: 3135, 50: 5225, 125: 13063, 250: 26125 } },
  osc5: { name: 'Oscietra 5*', latin: 'Acipenser gueldenstaedtii', stars: 5, cents: { 30: 3135, 50: 5225, 125: 13063, 250: 26125 } },
  osc6: { name: 'Oscietra 6*', latin: 'Acipenser gueldenstaedtii', stars: 6, cents: { 30: 3420, 50: 5700, 125: 14250, 250: 28500 } },
};
const B2B_SIZES = [30, 50, 125, 250];
const MADE_TO_ORDER_SIZES = [125, 250]; // ordered from Antonius when not in stock (about a week)
// Spoon and opener for B2B: set a price (cents excl. VAT) to offer them; null hides them.
const B2B_EXTRAS = {
  spoon: { name: 'Mother-of-pearl caviar spoon', lt: 'Perlamutrinis šaukštelis ikrams', cents: null },
  opener: { name: 'Caviar tin opener', lt: 'Ikrų skardinių atidarytuvas', cents: null },
};
const B2B_CATALOG = {};
for (const k of Object.keys(CAVIARS)) for (const g of B2B_SIZES) {
  B2B_CATALOG[`${k}-${g}`] = { name: `Antonius Caviar ${CAVIARS[k].name}, ${g} g`, cents: CAVIARS[k].cents[g], caviar: k, grams: g, mto: MADE_TO_ORDER_SIZES.includes(g) };
}
for (const k of Object.keys(B2B_EXTRAS)) if (B2B_EXTRAS[k].cents) B2B_CATALOG[k] = { name: B2B_EXTRAS[k].name, lt: B2B_EXTRAS[k].lt, cents: B2B_EXTRAS[k].cents, mto: false };

// Everything the shared stock counts: the shop's products plus the 125 g and 250 g tins.
const STOCK_ITEMS = {};
for (const k of Object.keys(CATALOG)) STOCK_ITEMS[k] = { name: CATALOG[k].name };
for (const k of Object.keys(B2B_CATALOG)) if (!STOCK_ITEMS[k]) STOCK_ITEMS[k] = { name: B2B_CATALOG[k].name };

module.exports = { productName, CATALOG, FREE_FROM_CENTS, shippingFeeCents, VAT_RATE, B2B_MIN_CENTS, CAVIARS, B2B_SIZES, B2B_CATALOG, B2B_EXTRAS, STOCK_ITEMS };
