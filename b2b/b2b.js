// Shared code for the B2B pages: language, texts, login session and API calls.
(function () {
  var LANGS = ['en', 'lt'];
  function pickLang() {
    var m = location.search.match(/[?&]lang=(en|lt)\b/);
    if (m) return m[1];
    try { var s = localStorage.getItem('fc-lang'); if (LANGS.indexOf(s) >= 0) return s; } catch (e) {}
    return /^lt\b/i.test(navigator.language || '') ? 'lt' : 'en';
  }
  var LANG = pickLang();

  var STR = {
    en: {
      tag: 'FOR PROFESSIONALS', logout: 'Log out', tabOrder: 'Order', tabOrders: 'My orders',
      // login page
      lEyebrow: 'Restaurants, hotels and shops', lH: 'Antonius Caviar at trade prices',
      lLead: 'Prices excl. VAT, payment by invoice and free chilled delivery with DPD anywhere in Lithuania, or pick up at Dirva in Vilnius.',
      lHome: 'Buying for your home?', lHomeLink: 'Go to the caviar shop',
      lLogin: 'Log in', email: 'Email', password: 'Password', loginBtn: 'Log in', forgot: 'Forgot your password?',
      badLogin: 'Wrong email or password.', loginFail: 'Login is not available right now. Please try again shortly.',
      noAccount: 'No account yet?', applyLead: 'Apply with your company details. We check them and send your login, usually within one working day.', applyLink: 'Apply for a business account',
      aH: 'Apply for a business account', company: 'Company name', companyCode: 'Company code', vatCode: 'VAT code (optional)', contact: 'Contact person', phone: 'Phone',
      address: 'Delivery address (street, postal code, city)', message: 'Message (optional)', applyBtn: 'Send application', back: 'Back to login',
      applied: 'Thank you. We have received your application and will get back to you, usually within one working day.',
      fill: 'Please fill in the required fields.', tooMany: 'Too many attempts. Please try again later.', failed: 'Something went wrong. Please try again.',
      fH: 'Forgot your password?', fLead: 'Enter your email and we send you a link to choose a new password.', fBtn: 'Send link',
      fSent: 'If the address has a business account, a link is on its way. Check your inbox.',
      // password page
      pNew: 'Choose your password', pReset: 'Choose a new password', pLead: 'At least 10 characters.', pRepeat: 'Repeat the password', pBtn: 'Save and log in',
      pShort: 'The password must be at least 10 characters.', pMismatch: 'The two passwords are not the same.',
      pExpired: 'The link has expired or has already been used. Ask for a new one with "Forgot your password?".', pToLogin: 'Go to login',
      // shop
      sEyebrow: 'Antonius Caviar · trade prices', sH: 'Order caviar for your kitchen',
      sLead: function (min) { return 'All prices are excl. VAT (21 %). Delivery is free on orders from ' + min + ' excl. VAT; pick-up at Dirva has no minimum. 30 g and 50 g tins are in stock; 125 g and 250 g are made to order, usually within a week. We invoice your company when the order ships, payment within 14 days.'; },
      exVat: 'excl. VAT', inStock: 'In stock', low: 'Only a few left', out: 'Sold out', mto: 'Made to order · about 1 week',
      partMto: function (n) { return n + ' in stock now, more made to order'; },
      more: 'More ', less: 'Less ',
      yourOrder: 'Your order', empty: 'Your order is empty. Choose tins on the left.',
      mtoLegend: 'Your order includes made-to-order tins',
      splitYes: 'Send stock tins now, the rest later', splitYesSub: 'Two deliveries, both free. Each is invoiced when it ships.',
      splitNo: 'Send everything together', splitNoSub: 'One delivery when the made-to-order tins arrive, usually within a week.',
      december: 'In December we cannot promise made-to-order tins before Christmas. We confirm the date by email.',
      delLegend: 'Delivery', dpd: 'DPD, chilled · free', dpdSub: function (a) { return 'To ' + a + ', usually 1–3 working days after it ships'; },
      dpdNoAddr: 'We have no delivery address for you yet. Write to sp@farmersandcompany.lt.',
      pickup: 'Pick up at Dirva · free', pickupSub: 'Dominikonų g. 11, Vilnius, from the next working day during Dirva\'s opening hours. Bring your order number.',
      minNote: function (min, gap) { return 'Free delivery from ' + min + ' excl. VAT. Add ' + gap + ' more, or choose pick-up.'; },
      po: 'Your PO / reference', poPh: 'Optional', note: 'Note for us', notePh: 'e.g. receiving hours, back door',
      subtotal: 'Subtotal excl. VAT', delivery: 'Delivery', free: 'Free', vat: 'VAT 21 %', total: 'Total',
      send: 'Send order – pay by invoice', sending: 'Sending…',
      invoiceTo: function (c) { return 'Invoiced to ' + c.company + ', company code ' + c.company_code + (c.vat_code ? ', VAT ' + c.vat_code : '') + '.'; },
      stockErr: 'Some tins are no longer in stock in that number. We have adjusted your order; please check it.',
      minErr: 'The order is below the minimum for free delivery. Add more, or choose pick-up.',
      okH: 'Thank you, we have your order', okRef: function (r) { return 'Order ' + r; },
      okText: 'A confirmation is on its way to your email. The invoice follows when the order ships.',
      okParcel: function (p) { return 'DPD parcel number ' + p + '. The tracking link is in your email.'; },
      okNew: 'New order', okOrders: 'My orders',
      oEmpty: 'You have no orders yet.', oDelivery: 'Delivery', oParcel: 'DPD parcel', oTrack: 'Track',
      status: { new: 'Received', waiting: 'Waiting for made-to-order tins', ready: 'Ready to collect', shipped: 'Sent', done: 'Collected', cancelled: 'Cancelled' },
      sStatus: { pending: 'Being prepared', shipped: 'Sent', ready: 'Ready to collect', collected: 'Collected', cancelled: 'Cancelled' },
      oPickup: 'Pick-up at Dirva', oDpd: 'DPD', oMto: 'made to order', oTotal: 'Total incl. VAT',
      loginAgain: 'Please log in again.'
    },
    lt: {
      tag: 'VERSLO KLIENTAMS', logout: 'Atsijungti', tabOrder: 'Užsakyti', tabOrders: 'Mano užsakymai',
      lEyebrow: 'Restoranams, viešbučiams ir parduotuvėms', lH: '„Antonius Caviar“ didmeninėmis kainomis',
      lLead: 'Kainos be PVM, apmokėjimas pagal sąskaitą faktūrą ir nemokamas atvėsintas DPD pristatymas visoje Lietuvoje arba atsiėmimas „Dirvoje“ Vilniuje.',
      lHome: 'Perkate namams?', lHomeLink: 'Eiti į ikrų parduotuvę',
      lLogin: 'Prisijungti', email: 'El. paštas', password: 'Slaptažodis', loginBtn: 'Prisijungti', forgot: 'Pamiršote slaptažodį?',
      badLogin: 'Neteisingas el. paštas arba slaptažodis.', loginFail: 'Šiuo metu prisijungti nepavyksta. Pabandykite netrukus.',
      noAccount: 'Dar neturite paskyros?', applyLead: 'Pateikite įmonės duomenis. Juos patikrinsime ir atsiųsime prisijungimą, dažniausiai per vieną darbo dieną.', applyLink: 'Pateikti paraišką verslo paskyrai',
      aH: 'Paraiška verslo paskyrai', company: 'Įmonės pavadinimas', companyCode: 'Įmonės kodas', vatCode: 'PVM mokėtojo kodas (nebūtina)', contact: 'Kontaktinis asmuo', phone: 'Telefonas',
      address: 'Pristatymo adresas (gatvė, pašto kodas, miestas)', message: 'Žinutė (nebūtina)', applyBtn: 'Siųsti paraišką', back: 'Grįžti į prisijungimą',
      applied: 'Ačiū. Gavome Jūsų paraišką ir susisieksime, dažniausiai per vieną darbo dieną.',
      fill: 'Užpildykite privalomus laukus.', tooMany: 'Per daug bandymų. Pabandykite vėliau.', failed: 'Kažkas nepavyko. Pabandykite dar kartą.',
      fH: 'Pamiršote slaptažodį?', fLead: 'Įveskite el. paštą ir atsiųsime nuorodą naujam slaptažodžiui susikurti.', fBtn: 'Siųsti nuorodą',
      fSent: 'Jei šiuo adresu yra verslo paskyra, nuoroda jau keliauja. Patikrinkite pašto dėžutę.',
      pNew: 'Susikurkite slaptažodį', pReset: 'Susikurkite naują slaptažodį', pLead: 'Bent 10 simbolių.', pRepeat: 'Pakartokite slaptažodį', pBtn: 'Išsaugoti ir prisijungti',
      pShort: 'Slaptažodį turi sudaryti bent 10 simbolių.', pMismatch: 'Slaptažodžiai nesutampa.',
      pExpired: 'Nuoroda nebegalioja arba jau panaudota. Naujos paprašykite pasirinkę „Pamiršote slaptažodį?“.', pToLogin: 'Eiti į prisijungimą',
      sEyebrow: '„Antonius Caviar“ · didmeninės kainos', sH: 'Užsisakykite ikrų savo virtuvei',
      sLead: function (min) { return 'Visos kainos nurodytos be PVM (21 %). Pristatymas nemokamas užsakymams nuo ' + min + ' be PVM; atsiimant „Dirvoje“ minimalios sumos nėra. 30 g ir 50 g skardinės yra sandėlyje; 125 g ir 250 g gaminamos pagal užsakymą, dažniausiai per savaitę. Sąskaitą faktūrą įmonei išrašome išsiuntus užsakymą; apmokėjimo terminas – 14 dienų.'; },
      exVat: 'be PVM', inStock: 'Yra sandėlyje', low: 'Liko nedaug', out: 'Išparduota', mto: 'Gaminama pagal užsakymą · apie 1 sav.',
      partMto: function (n) { return 'Sandėlyje ' + n + ', likusios – pagal užsakymą'; },
      more: 'Daugiau ', less: 'Mažiau ',
      yourOrder: 'Jūsų užsakymas', empty: 'Jūsų užsakymas tuščias. Pasirinkite skardines kairėje.',
      mtoLegend: 'Užsakyme yra pagal užsakymą gaminamų skardinių',
      splitYes: 'Sandėlyje esančias siųsti dabar, likusias vėliau', splitYesSub: 'Du pristatymai, abu nemokami. Už kiekvieną išrašoma sąskaita jį išsiuntus.',
      splitNo: 'Siųsti viską kartu', splitNoSub: 'Vienas pristatymas, kai gausime pagal užsakymą gaminamas skardines, dažniausiai per savaitę.',
      december: 'Gruodžio mėnesį negalime garantuoti, kad pagal užsakymą gaminamas skardines gausite iki Kalėdų. Datą patvirtinsime el. paštu.',
      delLegend: 'Pristatymas', dpd: 'DPD, atvėsinta · nemokamai', dpdSub: function (a) { return 'Adresu ' + a + ', dažniausiai per 1–3 darbo dienas po išsiuntimo'; },
      dpdNoAddr: 'Dar neturime Jūsų pristatymo adreso. Parašykite sp@farmersandcompany.lt.',
      pickup: 'Atsiėmimas „Dirvoje“ · nemokamai', pickupSub: 'Dominikonų g. 11, Vilnius, nuo kitos darbo dienos „Dirvos“ darbo valandomis. Turėkite užsakymo numerį.',
      minNote: function (min, gap) { return 'Nemokamas pristatymas nuo ' + min + ' be PVM. Pridėkite dar ' + gap + ' arba pasirinkite atsiėmimą.'; },
      po: 'Jūsų užsakymo nuoroda', poPh: 'Nebūtina', note: 'Pastaba mums', notePh: 'pvz., priėmimo valandos, galinės durys',
      subtotal: 'Suma be PVM', delivery: 'Pristatymas', free: 'Nemokamai', vat: 'PVM 21 %', total: 'Iš viso',
      send: 'Siųsti užsakymą – mokėti pagal sąskaitą', sending: 'Siunčiama…',
      invoiceTo: function (c) { return 'Sąskaita bus išrašyta ' + c.company + ', įmonės kodas ' + c.company_code + (c.vat_code ? ', PVM kodas ' + c.vat_code : '') + '.'; },
      stockErr: 'Kai kurių skardinių tokiu kiekiu sandėlyje nebėra. Užsakymą pakoregavome – patikrinkite jį.',
      minErr: 'Užsakymo suma mažesnė už minimalią nemokamam pristatymui. Pridėkite prekių arba pasirinkite atsiėmimą.',
      okH: 'Ačiū, gavome Jūsų užsakymą', okRef: function (r) { return 'Užsakymas ' + r; },
      okText: 'Patvirtinimas jau keliauja į Jūsų el. paštą. Sąskaitą faktūrą atsiųsime išsiuntę užsakymą.',
      okParcel: function (p) { return 'DPD siuntos numeris ' + p + '. Sekimo nuoroda – Jūsų el. laiške.'; },
      okNew: 'Naujas užsakymas', okOrders: 'Mano užsakymai',
      oEmpty: 'Užsakymų dar neturite.', oDelivery: 'Pristatymas', oParcel: 'DPD siunta', oTrack: 'Sekti',
      status: { new: 'Gautas', waiting: 'Laukiama pagal užsakymą gaminamų skardinių', ready: 'Paruošta atsiimti', shipped: 'Išsiųsta', done: 'Atsiimta', cancelled: 'Atšaukta' },
      sStatus: { pending: 'Ruošiama', shipped: 'Išsiųsta', ready: 'Paruošta atsiimti', collected: 'Atsiimta', cancelled: 'Atšaukta' },
      oPickup: 'Atsiėmimas „Dirvoje“', oDpd: 'DPD', oMto: 'pagal užsakymą', oTotal: 'Iš viso su PVM',
      loginAgain: 'Prisijunkite iš naujo.'
    }
  };

  function t(k) { var v = STR[LANG][k]; return v === undefined ? STR.en[k] : v; }
  function money(cents) {
    var s = (Math.round(cents) / 100).toFixed(2).split('.');
    return s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + s[1] + ' €';
  }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') e.textContent = v;
      else if (k === 'class') e.className = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }

  // ---- session (Supabase login) ----
  var KEY = 'fc-b2b-session';
  var cfg = null;
  function config() {
    if (cfg) return Promise.resolve(cfg);
    return fetch('/api/b2b?action=config').then(function (r) { return r.json(); }).then(function (c) { cfg = c; return c; });
  }
  function save(s) {
    try {
      if (!s) { localStorage.removeItem(KEY); return; }
      localStorage.setItem(KEY, JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || (Math.floor(Date.now() / 1000) + (s.expires_in || 3600)) }));
    } catch (e) {}
  }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function auth(path, body, token) {
    return config().then(function (c) {
      var h = { apikey: c.key, 'Content-Type': 'application/json' };
      if (token) h.Authorization = 'Bearer ' + token;
      return fetch(c.url + '/auth/v1/' + path, { method: body && body.__method ? body.__method : 'POST', headers: h, body: JSON.stringify(body || {}) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); });
    });
  }
  function login(email, password) {
    return auth('token?grant_type=password', { email: email, password: password }).then(function (r) {
      if (r.ok && r.data.access_token) { save(r.data); return true; }
      if (r.status === 400 || r.status === 401) return false;
      throw new Error('login');
    });
  }
  function token() {
    var s = load();
    if (!s) return Promise.resolve(null);
    if (s.expires_at - 60 > Date.now() / 1000) return Promise.resolve(s.access_token);
    return auth('token?grant_type=refresh_token', { refresh_token: s.refresh_token }).then(function (r) {
      if (r.ok && r.data.access_token) { save(r.data); return r.data.access_token; }
      save(null); return null;
    });
  }
  function logout() {
    var s = load(); save(null);
    var go = function () { location.href = '/b2b/' + (LANG === 'lt' ? '?lang=lt' : ''); };
    if (!s) return go();
    auth('logout', {}, s.access_token).then(go, go);
  }
  // Calls our own API with the session; sends the visitor to the login page when it has run out.
  function api(action, opts) {
    opts = opts || {};
    return token().then(function (tk) {
      if (!tk) { location.href = '/b2b/?next=shop' + (LANG === 'lt' ? '&lang=lt' : ''); return new Promise(function () {}); }
      return fetch('/api/b2b?action=' + action, { method: opts.body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined })
        .then(function (r) {
          if (r.status === 401) { save(null); location.href = '/b2b/' + (LANG === 'lt' ? '?lang=lt' : ''); return new Promise(function () {}); }
          return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, data: d }; });
        });
    });
  }
  function publicPost(action, body) {
    return fetch('/api/b2b?action=' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); });
  }

  // Header: brand, language switch, and (when logged in) tabs and log out.
  function header(opts) {
    opts = opts || {};
    var langBox = el('div', { class: 'lang', role: 'group', 'aria-label': 'Language' }, LANGS.map(function (l) {
      return el('button', { type: 'button', 'aria-pressed': String(l === LANG), text: l.toUpperCase(), onclick: function () {
        if (l === LANG) return;
        try { localStorage.setItem('fc-lang', l); } catch (e) {}
        var u = new URL(location.href); u.searchParams.set('lang', l); location.href = u.toString();
      } });
    }));
    var right = el('div', { class: 'right' }, [opts.extra || null, langBox, opts.logout ? el('button', { type: 'button', class: 'link', text: t('logout'), onclick: logout }) : null]);
    var top = el('header', { class: 'top' }, [el('div', { class: 'in' }, [
      el('a', { class: 'brand', href: '/b2b/' + (LANG === 'lt' ? '?lang=lt' : '') }, [el('img', { src: '/img/logo_light.png', alt: 'Farmers & Company' }), el('span', { text: t('tag') })]),
      right
    ])]);
    document.body.insertBefore(top, document.body.firstChild);
    document.documentElement.lang = LANG;
  }

  window.B2B = { LANG: LANG, t: t, money: money, el: el, login: login, logout: logout, token: token, api: api, auth: auth, save: save, load: load, publicPost: publicPost, header: header, config: config };
})();
