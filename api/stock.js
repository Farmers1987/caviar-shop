// Stock status for the shop page: per product "in" / "low" / "out" and how many can be ordered.
const stock = require('./_stock.js');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const key = process.env.STRIPE_SECRET_KEY;
    const av = key ? await stock.availability(key) : null;
    return res.status(200).json({ items: stock.publicView(av) });
  } catch (e) {
    console.error('stock failed', e.message);
    // If stock cannot be read, the page still works; checkout checks again before payment.
    return res.status(200).json({ items: stock.publicView(null), degraded: true });
  }
};
