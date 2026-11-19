// Read-only DPD connection check. It creates nothing at DPD.
// It confirms that DPD_API_TOKEN works and lists the services the account can use
// for domestic deliveries to private customers, so the right service alias
// (e.g. a chilled one) can be chosen. Remove before launch (see the checklist).

const BASE = process.env.DPD_API_BASE || 'https://esiunta.dpd.lt/api/v1';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const token = process.env.DPD_API_TOKEN;
  if (!token) return res.status(503).json({ ok: false, error: 'DPD_API_TOKEN is not set in Vercel' });

  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const out = { ok: false, base: BASE, services: {} };
  try {
    for (const serviceType of ['Private', 'Business']) {
      const url = `${BASE}/services?countryFrom=LT&countryTo=LT&serviceType=${serviceType}`;
      const r = await fetch(url, { headers });
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch (e) { data = null; }
      if (r.status === 401 || r.status === 403) {
        return res.status(200).json({ ok: false, base: BASE, status: r.status, error: 'DPD rejected the token' });
      }
      const list = Array.isArray(data) ? data : (data && (data.items || data.services || data.data)) || [];
      out.services[serviceType] = {
        status: r.status,
        items: Array.isArray(list)
          ? list.map((s) => ({
              alias: s.serviceAlias || s.alias || null,
              name: s.name || s.title || s.serviceName || null,
              additional: (s.additionalServices || s.additional_services || []).map((a) => a.serviceAlias || a.alias || a.name || a),
            }))
          : [],
        raw: Array.isArray(list) && list.length ? undefined : text.slice(0, 400),
      };
    }
    out.ok = true;
    return res.status(200).json(out);
  } catch (e) {
    return res.status(502).json({ ok: false, base: BASE, error: 'Could not reach DPD', detail: e && e.message });
  }
};
