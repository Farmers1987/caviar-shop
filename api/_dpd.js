// DPD Lietuva integration: shipment, label and pickup for one paid order.
//
// DPD_MODE controls what happens (set in Vercel):
//   off   (default) nothing is sent to DPD
//   label           create the shipment and the label, but order no pickup (for testing)
//   full            shipment, label and a pickup request
// Pickups: the first order of a day books one pickup at the sender address; later orders
// that day are told to go with it. Orders after DPD_PICKUP_CUTOFF (Vilnius time) or on a
// weekend go to the next working day.

const BASE = process.env.DPD_API_BASE || 'https://esiunta.dpd.lt/api/v1';
const SERVICE = process.env.DPD_SERVICE_ALIAS || 'B2C Fresh Food';
const WEIGHT = Number(process.env.DPD_PARCEL_WEIGHT_KG || 2);
const CUTOFF = process.env.DPD_PICKUP_CUTOFF || '14:00';
const WINDOW_FROM = process.env.DPD_PICKUP_FROM || '12:00';
const WINDOW_TO = process.env.DPD_PICKUP_TO || '17:00';

function sender() {
  return {
    name: 'Farmers & Company',
    contactName: process.env.DPD_SENDER_CONTACT || 'Farmers & Company',
    phone: process.env.DPD_SENDER_PHONE || '',
    street: 'Trakų g.', streetNo: '14', city: 'Vilnius', postalCode: '01132', country: 'LT',
  };
}

function mode() {
  const m = (process.env.DPD_MODE || 'off').toLowerCase();
  return m === 'label' || m === 'full' ? m : 'off';
}

async function dpd(path, method, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${process.env.DPD_API_TOKEN}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch (e) { data = text; }
  if (!r.ok) throw new Error(`DPD ${method} ${path} ${r.status}: ${String(text).slice(0, 300)}`);
  return data;
}

// Vilnius local date and time, independent of the server's time zone.
function vilniusNow(d = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(d).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute), weekday: parts.weekday };
}
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
function weekdayOf(isoDate) { return new Date(isoDate + 'T12:00:00Z').getUTCDay(); } // 0 = Sunday

// When the parcel should be picked up.
function pickupPlan(now = vilniusNow()) {
  const working = !['Sat', 'Sun'].includes(now.weekday);
  if (working && now.minutes < toMin(CUTOFF)) {
    // Earliest slot: at least 30 min from now, on a :00 or :30 mark, not before the window opens.
    const earliest = Math.max(toMin(WINDOW_FROM), Math.ceil((now.minutes + 30) / 30) * 30);
    if (earliest <= toMin(WINDOW_TO) - 60) return { date: now.date, from: fromMin(earliest), to: WINDOW_TO, sameDay: true };
  }
  let date = addDays(now.date, 1);
  while ([0, 6].includes(weekdayOf(date))) date = addDays(date, 1);
  return { date, from: WINDOW_FROM, to: WINDOW_TO, sameDay: false };
}

function fit(full, short) { return (full.length <= 35 ? full : String(short || full)).slice(0, 35); }

function cleanPostal(code) { return String(code || '').replace(/^LT-?/i, '').replace(/\s+/g, ''); }

function findShipment(data) {
  const list = Array.isArray(data) ? data : (data && (data.shipments || data.items || data.data)) || [data];
  const s = list[0] || {};
  const parcels = s.parcelNumbers || (s.parcels || []).map((p) => p.parcelNumber || p.number).filter(Boolean);
  return { id: s.id || s.uuid || s.shipmentId || null, parcel: (parcels && parcels[0]) || s.parcelNumber || null };
}

function trackingUrl(parcel) {
  return `https://www.dpdgroup.com/lt/mydpd/my-parcels/search?parcelNumber=${encodeURIComponent(parcel)}`;
}

// order: { ref, name, email, phone, address: { line1, line2, postal_code, city, country } }
async function createShipment(order) {
  const a = order.address || {};
  const body = [{
    senderAddress: (({ contactName, ...s }) => s)(sender()),
    receiverAddress: {
      name: order.name, email: order.email || undefined, phone: order.phone,
      // DPD allows 35 characters for street (street number and flat may be included).
      street: fit([a.line1, a.line2].filter(Boolean).join(', '), a.line1), city: a.city,
      contactInfo: order.note ? String(order.note).slice(0, 35) : undefined, postalCode: cleanPostal(a.postal_code), country: a.country || 'LT',
    },
    service: { serviceAlias: SERVICE },
    parcels: [{ weight: WEIGHT, mpsReferences: [order.ref] }],
    shipmentReferences: [order.ref],
  }];
  const s = findShipment(await dpd('/shipments', 'POST', body));
  if (!s.id || !s.parcel) throw new Error('DPD shipment created but no id or parcel number found in the response');
  return s;
}

async function labelPdf(shipmentId) {
  const data = await dpd('/shipments/labels', 'POST', {
    shipmentIds: [shipmentId], parcelNumbers: [], offsetPosition: 0, downloadLabel: true, emailLabel: false, labelFormat: 'application/pdf', paperSize: 'A4',
  });
  const pages = (data && data.pages) || [];
  return pages.length ? pages[0].binaryData : null; // base64 PDF
}

async function orderPickup(plan, shipmentId) {
  const s = sender();
  return dpd('/pickups', 'POST', {
    pickupDate: plan.date, pickupTimeFrom: plan.from, pickupTimeTo: plan.to,
    address: { name: s.name, contactName: s.contactName, phone: s.phone, street: s.street, streetNo: s.streetNo, city: s.city, postalCode: s.postalCode, country: s.country },
    shipmentUuids: [shipmentId],
  });
}

module.exports = { mode, sender, pickupPlan, createShipment, labelPdf, orderPickup, trackingUrl, vilniusNow };
