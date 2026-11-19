# Caviar shop – Farmers & Company

Static page (`index.html`) plus two Vercel functions in `api/`.

- `api/_shared.js`: price list in euro cents (incl. VAT) and the free-delivery limit.
- `api/checkout.js`: creates a Stripe Checkout session. Delivery addresses are limited to Lithuania.
- `api/config.js`: tells the page what the delivery fee is.

Environment variables in Vercel:

- `STRIPE_SECRET_KEY`: Stripe secret key (sandbox key for testing, live key for production).
- `SHIPPING_FEE_CENTS`: delivery fee for orders under 150 €, in cents (e.g. `1000`). If unset, no fee is charged.
- `RESEND_API_KEY`: key for the mail service that sends order mails. Until it is set, no order mails go out.

Order mails: `api/stripe-webhook.js` is called by a Stripe webhook (`checkout.session.completed`). It mails the customer from hello@farmersandcompany.lt and notifies sp@farmersandcompany.lt.
