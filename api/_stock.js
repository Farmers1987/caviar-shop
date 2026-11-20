// Stock for the shop.
//
// Staff set "available to sell now" per product on the admin page. That snapshot is saved in
// Vercel Blob together with the time it was set. Sales are never written anywhere: what has
// been sold since then is counted from the Stripe checkout sessions themselves (paid ones, plus
// open ones that are still in payment, which reserve their tins for up to 30 minutes).
// So two orders at the same moment can never overwrite each other's numbers.
//
// If no snapshot has been saved yet, stock is "off": everything shows as available.
const { CATALOG } = require('./_shared.js');

const PREFIX = 'stock/';
const LOW = Number(process.env.STOCK_LOW_AT || 3);
const MAX_PER_LINE = 20;
let cache = null; // { at, data } – a short cache so every page view does not list Stripe sessions

function blob() { return require('@vercel/blob'); }
function enabled() { return !!process.env.BLOB_READ_WRITE_TOKEN; }

async function readSnapshot() {
  if (!enabled()) return null;
  const { blobs } = await blob().list({ prefix: PREFIX, token: process.env.BLOB_READ_WRITE_TOKEN });
  if (!blobs.length) return null;
  blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  const r = await fetch(blobs[0].url, { cache: 'no-store' });
  if (!r.ok) throw new Error('stock snapshot ' + r.status);
  const s = await r.json();
  return s && s.counts && s.setAt ? s : null;
}

async function saveSnapshot(counts, by) {
  const clean = {};
  for (const k of Object.keys(CATALOG)) {
    const n = Number(counts[k]);
    clean[k] = Number.isInteger(n) && n >= 0 && n <= 100000 ? n : 0;
  }
  const snap = { counts: clean, setAt: Math.floor(Date.now() / 1000), by: String(by || '').slice(0, 60) };
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  // Each save is a new file (unique address, so nothing is served from an old cache).
  await blob().put(PREFIX + 'snapshot-' + snap.setAt + '.json', JSON.stringify(snap), {
    access: 'public', token, addRandomSuffix: true, contentType: 'application/json',
  });
  // Keep the last 20 versions as a history; remove older ones.
  const { blobs } = await blob().list({ prefix: PREFIX, token });
  blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  const old = blobs.slice(20).map((b) => b.url);
  if (old.length) await blob().del(old, { token });
  cache = null;
  return snap;
}

// "sib5-30:2,spoon:1" ⇄ { 'sib5-30': 2, spoon: 1 }. Stored in each Stripe session's metadata.
function encodeItems(items) { return items.map((i) => `${i.id}:${i.qty}`).join(','); }
function decodeItems(s) {
  const out = {};
  String(s || '').split(',').forEach((p) => {
    const [k, q] = p.split(':');
    const n = Number(q);
    if (CATALOG[k] && Number.isInteger(n) && n > 0) out[k] = (out[k] || 0) + n;
  });
  return out;
}

// Units taken by checkout sessions created since `since`: paid, or still open (being paid).
async function takenSince(since, stripeKey, excludeId) {
  const taken = {};
  let after = null;
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ limit: '100', 'created[gte]': String(since) });
    if (after) q.set('starting_after', after);
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions?' + q, { headers: { Authorization: `Bearer ${stripeKey}` } });
    const d = await r.json();
    if (!r.ok) throw new Error('stripe list ' + r.status);
    for (const s of d.data) {
      if (s.id === excludeId) continue;
      const counts = s.payment_status === 'paid' || s.status === 'open';
      if (!counts || !s.metadata || !s.metadata.items) continue;
      const items = decodeItems(s.metadata.items);
      for (const k of Object.keys(items)) taken[k] = (taken[k] || 0) + items[k];
    }
    if (!d.has_more || !d.data.length) break;
    after = d.data[d.data.length - 1].id;
  }
  return taken;
}

// Returns null when stock is off, otherwise { available: {key: n}, setAt }.
async function availability(stripeKey, opts) {
  opts = opts || {};
  if (!opts.fresh && !opts.excludeId && cache && Date.now() - cache.at < 15000) return cache.data;
  const snap = await readSnapshot();
  if (!snap) return null;
  const taken = await takenSince(snap.setAt, stripeKey, opts.excludeId);
  const available = {};
  for (const k of Object.keys(CATALOG)) available[k] = (snap.counts[k] || 0) - (taken[k] || 0);
  const data = { available, setAt: snap.setAt, counts: snap.counts, taken };
  if (!opts.excludeId) cache = { at: Date.now(), data };
  return data;
}

// What the shop page may know: a status and how many can be put in the basket, not the stock figure.
function publicView(av) {
  const out = {};
  for (const k of Object.keys(CATALOG)) {
    if (!av) { out[k] = { status: 'in', max: MAX_PER_LINE }; continue; }
    const n = Math.max(0, av.available[k]);
    out[k] = { status: n <= 0 ? 'out' : n <= LOW ? 'low' : 'in', max: Math.min(n, MAX_PER_LINE) };
  }
  return out;
}

module.exports = { enabled, readSnapshot, saveSnapshot, availability, publicView, encodeItems, decodeItems, MAX_PER_LINE };
