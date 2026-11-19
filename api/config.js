const { FREE_FROM_CENTS, shippingFeeCents } = require('./_shared.js');

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ freeFromCents: FREE_FROM_CENTS, shippingFeeCents: shippingFeeCents() });
};
