# Caviar shop – Farmers & Company

Static page (`index.html`) plus two Vercel functions in `api/`.

- `api/_shared.js`: price list in euro cents (incl. VAT) and the free-delivery limit.
- `api/checkout.js`: creates a Stripe Checkout session. Delivery addresses are limited to Lithuania.
- `api/config.js`: tells the page what the delivery fee is.

Environment variables in Vercel:

- `STRIPE_SECRET_KEY`: Stripe secret key (sandbox key for testing, live key for production).
- `SHIPPING_FEE_CENTS`: delivery fee for orders under 150 €, in cents (e.g. `790`). If unset, no fee is charged.
