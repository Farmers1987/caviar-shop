// Simple limits per visitor, so nobody can guess the admin password by trying thousands of times,
// fill the stock with fake payments, or use our forms to send mail to strangers.
//
// Each counted event is a tiny file in Vercel Blob named after a scrambled form of the visitor's
// IP address (the IP itself is never stored). Old events are removed as new ones come in.
// If Blob cannot be reached the limits are skipped, so a Blob problem never stops real customers.
const crypto = require('crypto');

const ROOT = 'guard/';
function blob() { return require('@vercel/blob'); }
function token() { return process.env.BLOB_READ_WRITE_TOKEN; }

function visitor(req) {
  const h = req.headers || {};
  const ip = String(h['x-vercel-forwarded-for'] || h['x-real-ip'] || h['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  return crypto.createHash('sha256').update('fc-guard:' + ip).digest('hex').slice(0, 20);
}

// Events in the last `windowSec` for this bucket (and visitor, if given). Removes older ones.
async function recent(bucket, who, windowSec) {
  const prefix = ROOT + bucket + '/' + (who ? who + '-' : '');
  const { blobs } = await blob().list({ prefix, token: token(), limit: 1000 });
  const since = Date.now() - windowSec * 1000;
  const old = blobs.filter((b) => new Date(b.uploadedAt).getTime() < since).map((b) => b.url);
  if (old.length) blob().del(old, { token: token() }).catch(() => {});
  return blobs.length - old.length;
}

async function record(bucket, who) {
  await blob().put(ROOT + bucket + '/' + who + '-' + Date.now() + '.txt', '1', {
    access: 'public', token: token(), addRandomSuffix: true, contentType: 'text/plain',
  });
}

// true when this visitor has used up the limit. Counts this call when `count` is true.
async function over(req, bucket, { limit, windowSec, count = true }) {
  if (!token()) return false;
  try {
    const who = visitor(req);
    if ((await recent(bucket, who, windowSec)) >= limit) return true;
    if (count) await record(bucket, who);
    return false;
  } catch (e) {
    console.error('guard skipped', bucket, e.message);
    return false;
  }
}

// Admin login: after 5 wrong passwords from one visitor, or 30 from everyone together
// (an attack spread over many addresses), logins are refused for 15 minutes.
const ADMIN_WINDOW = 15 * 60;
async function adminLocked(req) {
  if (!token()) return false;
  try {
    const mine = await recent('admin-fail', visitor(req), ADMIN_WINDOW);
    const all = await recent('admin-fail', '', ADMIN_WINDOW);
    if (mine >= 5 || all >= 30) { console.warn('admin locked', { mine, all }); return true; }
    return false;
  } catch (e) { console.error('guard skipped', e.message); return false; }
}
async function adminFailed(req) {
  if (!token()) return;
  try { await record('admin-fail', visitor(req)); } catch (e) { console.error('guard record', e.message); }
}

module.exports = { over, adminLocked, adminFailed };
