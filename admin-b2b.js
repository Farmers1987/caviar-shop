// Admin: B2B orders, applications and customers. Loaded by admin.html after login.
(function () {
  var pw = '', data = null, filter = 'all', openId = null;
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') e.textContent = v;
      else if (k === 'class') e.className = v;
      else if (k === 'style') e.setAttribute('style', v);
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function money(c) { var s = (Math.round(c) / 100).toFixed(2).split('.'); return s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + s[1] + ' €'; }
  function date(iso) { return iso ? new Date(iso).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' }) : ''; }
  var C = { line: '#274536', band: '#12291E', soft: '#D5DACF', muted: '#B3BDB0', accent: '#8FD3A8', warn: '#f6e7b0', bad: '#F3B6A8' };
  var STATUS = { new: ['Ny', C.accent], waiting: ['Venter på bestillingsvarer', C.warn], ready: ['Klar til afhentning', '#B8E6C8'], shipped: ['Sendt', C.soft], done: ['Afhentet', C.soft], cancelled: ['Annulleret', C.bad] };
  var SSTATUS = { pending: 'Ikke sendt', shipped: 'Sendt', ready: 'Klar til afhentning', collected: 'Afhentet', cancelled: 'Annulleret' };
  var ERR = { dpd_off: 'DPD er slået fra (DPD_MODE). Skriv pakkenummeret manuelt, eller slå DPD til.', address: 'Udfyld gade, postnummer og by.', email_exists: 'Der findes allerede en bruger med den mail.', already_shipped: 'Leveringen er allerede sendt.', no_database: 'Databasen er ikke forbundet endnu (SUPABASE_SECRET_KEY mangler i Vercel).', failed: 'Noget gik galt. Prøv igen.' };

  function call(action, body) {
    return fetch('/api/b2b-admin?action=' + action, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': pw }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || 'failed'); e.detail = d.detail; throw e; } return d; }); });
  }
  function note(box, text, bad) { var p = el('p', { class: 'note', role: bad ? 'alert' : 'status', style: bad ? 'border-color:' + C.bad : null, text: text }); box.appendChild(p); setTimeout(function () { if (p.parentNode) p.remove(); }, 8000); }
  function badge(s) { var x = STATUS[s] || [s, C.soft]; return el('span', { style: 'display:inline-block;padding:2px 8px;font-size:12px;font-weight:600;color:#0E2219;background:' + x[1] + ';white-space:nowrap', text: x[0] }); }
  function btn(text, onclick, ghost) { return el('button', { type: 'button', style: 'padding:10px 14px;font:inherit;cursor:pointer;border:1px solid ' + C.accent + ';background:' + (ghost ? 'none' : C.accent) + ';color:' + (ghost ? C.accent : '#0E2219') + ';font-weight:600', text: text, onclick: onclick }); }

  // ---- tabs ----
  document.querySelectorAll('.atabs button').forEach(function (b) {
    b.addEventListener('click', function () { tab(b.getAttribute('data-tab')); });
  });
  function tab(name) {
    document.querySelectorAll('.atabs button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-tab') === name)); });
    ['stock', 'b2b', 'apps', 'customers'].forEach(function (n) { $('tab-' + n).hidden = n !== name; });
    history.replaceState(null, '', name === 'stock' ? location.pathname : '#' + (name === 'apps' ? 'applications' : name));
    if (name !== 'stock' && !data) reload();
  }

  function reload() {
    return call('overview').then(function (d) { data = d; counts(); renderOrders(); renderApps(); renderCustomers(); })
      .catch(function (e) { ['b2b', 'apps', 'customers'].forEach(function (n) { var b = $('tab-' + n); b.textContent = ''; note(b, ERR[e.message] || ERR.failed, true); }); });
  }
  function counts() {
    var nNew = data.orders.filter(function (o) { return o.status === 'new' || o.status === 'ready'; }).length;
    var nApps = data.applications.filter(function (a) { return a.status === 'pending'; }).length;
    $('nOrders').hidden = !nNew; $('nOrders').textContent = nNew;
    $('nApps').hidden = !nApps; $('nApps').textContent = nApps;
  }

  // ---- orders ----
  function missingInvoice(o) { return o.status !== 'cancelled' && o.shipments.some(function (s) { return (s.status === 'shipped' || s.status === 'collected') && !s.invoiced; }); }
  var FILTERS = [['all', 'Alle'], ['new', 'Ny'], ['waiting', 'Venter'], ['ready', 'Klar til afhentning'], ['shipped', 'Sendt / afhentet'], ['invoice', 'Mangler faktura'], ['cancelled', 'Annulleret']];
  function match(o) {
    if (filter === 'all') return o.status !== 'cancelled';
    if (filter === 'invoice') return missingInvoice(o);
    if (filter === 'shipped') return o.status === 'shipped' || o.status === 'done';
    return o.status === filter;
  }
  function renderOrders() {
    var box = $('tab-b2b'); box.textContent = '';
    box.appendChild(el('h1', { text: 'B2B-ordrer' }));
    box.appendChild(el('p', { class: 'hint', text: 'Nye ordrer kommer også som mail til sp@. Her sender du leveringer, markerer afhentning og holder styr på fakturaer.' }));
    box.appendChild(el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px' }, FILTERS.map(function (f) {
      var n = data.orders.filter(function (o) { var keep = filter; filter = f[0]; var m = match(o); filter = keep; return m; }).length;
      var on = filter === f[0];
      return el('button', { type: 'button', 'aria-pressed': String(on), style: 'padding:8px 12px;font:inherit;cursor:pointer;border:1px solid ' + (f[0] === 'invoice' ? C.bad : on ? C.accent : '#4C6A59') + ';background:' + (on ? C.accent : 'none') + ';color:' + (on ? '#0E2219' : f[0] === 'invoice' ? C.bad : 'inherit') + ';font-weight:' + (on ? 600 : 400), text: f[1] + ' · ' + n, onclick: function () { filter = f[0]; renderOrders(); } });
    })));
    var list = data.orders.filter(match);
    if (!list.length) { box.appendChild(el('p', { class: 'hint', text: 'Ingen ordrer her.' })); return; }
    list.forEach(function (o) {
      var open = openId === o.id;
      var head = el('button', { type: 'button', 'aria-expanded': String(open), style: 'width:100%;display:grid;grid-template-columns:110px minmax(0,1fr) 80px 110px auto;gap:12px;align-items:center;padding:12px 14px;background:' + (open ? '#173325' : 'none') + ';border:0;color:inherit;font:inherit;text-align:left;cursor:pointer',
        onclick: function () { openId = open ? null : o.id; renderOrders(); } }, [
        el('strong', { text: o.ref }),
        el('span', { text: (o.customer ? o.customer.company : '?') + ' · ' + (o.delivery === 'pickup' ? 'Dirva' : 'DPD') + (o.split ? ' · delt' : '') }),
        el('span', { style: 'color:' + C.soft, text: date(o.created_at) }),
        el('span', { style: 'text-align:right', text: money(o.subtotal_cents) }),
        el('span', { style: 'display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap' }, [badge(o.status), missingInvoice(o) ? el('span', { style: 'font-size:12px;color:' + C.bad, text: 'faktura' }) : null])
      ]);
      var wrap = el('div', { style: 'border:1px solid ' + C.line + ';margin-bottom:8px;overflow-x:auto' }, [head]);
      if (open) wrap.appendChild(detail(o));
      box.appendChild(wrap);
    });
  }

  function detail(o) {
    var d = el('div', { style: 'padding:6px 14px 16px;display:flex;flex-direction:column;gap:12px;border-top:1px solid ' + C.line });
    var c = o.customer || {};
    d.appendChild(el('p', { style: 'margin:8px 0 0;color:' + C.soft }, [
      c.company + ' · ' + c.contact_name + ' · ', el('a', { href: 'mailto:' + c.email, text: c.email }), c.phone ? ' · ' + c.phone : '', el('br'),
      o.delivery === 'pickup' ? 'Afhentning i Dirva' : 'DPD til ' + [o.ship.street, o.ship.postal_code + ' ' + o.ship.city].join(', '),
      o.po_ref ? ' · Kundens ref.: ' + o.po_ref : '', o.note ? el('br') : null, o.note ? el('strong', { text: 'Note: ' + o.note }) : null
    ]));
    var msgs = el('div');
    o.shipments.forEach(function (s) {
      var lines = o.shipments.length > 1 ? o.lines.filter(function (l) { return l.shipment_no === s.no; }) : o.lines;
      var sub = lines.reduce(function (a, l) { return a + l.unit_cents * l.qty; }, 0);
      var waitingMto = lines.some(function (l) { return l.made_to_order; });
      var b = el('div', { style: 'border:1px solid ' + (s.status === 'pending' && waitingMto ? C.warn : C.line) + ';background:#0E2219;padding:12px 14px;display:flex;flex-direction:column;gap:6px' }, [
        el('div', { style: 'display:flex;justify-content:space-between;gap:10px;font-weight:600;flex-wrap:wrap' }, [
          el('span', { text: o.shipments.length > 1 ? 'Levering ' + s.no + (s.no === 1 ? ' · lagervarer' : ' · bestillingsvarer') : 'Levering' }),
          el('span', { style: 'color:' + (s.status === 'pending' ? C.warn : C.accent), text: SSTATUS[s.status] + (s.shipped_at ? ' ' + date(s.shipped_at) : '') })
        ])
      ].concat(lines.map(function (l) {
        return el('div', { style: 'display:flex;justify-content:space-between;gap:10px;color:' + C.soft }, [el('span', { text: l.name.replace(/^Antonius Caviar /, '') + ' × ' + l.qty + (l.made_to_order ? ' · bestillingsvare' : '') }), el('span', { text: money(l.unit_cents * l.qty) })]);
      })));
      if (s.dpd_parcel) b.appendChild(el('div', { style: 'font-size:13px' }, ['DPD ' + s.dpd_parcel + ' · ', el('a', { href: s.track, target: '_blank', rel: 'noopener', text: 'Spor pakken' })]));
      if (o.status !== 'cancelled') {
        var inv = el('input', { type: 'checkbox', checked: s.invoiced ? true : null, style: 'width:16px;height:16px;accent-color:' + C.accent });
        inv.addEventListener('change', function () { call('invoice', { order_id: o.id, no: s.no, value: inv.checked }).then(function () { s.invoiced = inv.checked; counts(); }, function (e) { inv.checked = !inv.checked; note(msgs, ERR[e.message] || ERR.failed, true); }); });
        b.appendChild(el('label', { style: 'display:flex;gap:8px;align-items:center;font-size:13px;margin-top:4px' }, [inv, 'Faktura lavet (' + money(sub) + ' ekskl. moms + ' + money(Math.round(sub * 0.21)) + ' moms)']));
        var acts = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;align-items:center' });
        if (o.delivery === 'dpd' && s.status === 'pending') {
          acts.appendChild(btn(waitingMto ? 'Varerne er her: send med DPD' : 'Send med DPD', function () { act('ship', { order_id: o.id, no: s.no }, msgs, 'Sendt. Kunden har fået sporingslink.'); }));
          var manual = el('input', { type: 'text', placeholder: 'eller pakkenummer', 'aria-label': 'Pakkenummer lavet i DPD-portalen', style: 'width:170px' });
          acts.appendChild(manual);
          acts.appendChild(btn('Gem som sendt', function () { if (!manual.value.trim()) { note(msgs, 'Skriv pakkenummeret først.', true); return; } act('ship', { order_id: o.id, no: s.no, parcel: manual.value.trim() }, msgs, 'Gemt som sendt. Kunden har fået sporingslink.'); }, true));
        }
        if (o.delivery === 'pickup' && s.status === 'pending') acts.appendChild(btn(waitingMto ? 'Varerne er her: klar til afhentning' : 'Klar til afhentning', function () { act('ready', { order_id: o.id, no: s.no }, msgs, 'Kunden har fået besked om, at ordren er klar.'); }));
        if (o.delivery === 'pickup' && s.status === 'ready') acts.appendChild(btn('Afhentet', function () { act('collected', { order_id: o.id, no: s.no }, msgs, 'Markeret som afhentet.'); }));
        if (acts.childNodes.length) b.appendChild(acts);
      }
      d.appendChild(b);
    });
    d.appendChild(el('div', { style: 'display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center' }, [
      el('span', { style: 'color:' + C.soft, text: 'I alt ' + money(o.subtotal_cents) + ' ekskl. moms · ' + money(o.total_cents) + ' inkl. 21 % moms' }),
      o.status !== 'cancelled' && o.shipments.every(function (s) { return s.status !== 'shipped' && s.status !== 'collected'; }) ? btn('Annullér ordre', function () {
        if (!window.confirm('Annullér ' + o.ref + '? Dåserne frigives til lageret igen. Kunden får ingen automatisk besked.')) return;
        act('cancel', { order_id: o.id }, msgs, 'Ordren er annulleret.');
      }, true) : null
    ]));
    d.appendChild(msgs);
    return d;
  }
  function act(action, body, msgs, okText) {
    return call(action, body).then(function (r) {
      if (r.label) {
        var a = el('a', { href: 'data:application/pdf;base64,' + r.label, download: 'DPD-label-' + (r.parcel || 'pakke') + '.pdf', text: 'Hent DPD-label (PDF)' });
        reload().then(function () { var m = document.querySelector('#tab-b2b [aria-expanded="true"]'); var box = m && m.parentNode; if (box) { var p = el('p', { class: 'note' }, [okText + ' ', a]); box.appendChild(p); } });
        return;
      }
      reload().then(function () { var m = document.querySelector('#tab-b2b [aria-expanded="true"]'); if (m) note(m.parentNode, okText); });
    }, function (e) { note(msgs, (ERR[e.message] || ERR.failed) + (e.detail ? ' (' + e.detail + ')' : ''), true); });
  }

  // ---- applications ----
  function renderApps() {
    var box = $('tab-apps'); box.textContent = '';
    box.appendChild(el('h1', { text: 'Ansøgninger' }));
    box.appendChild(el('p', { class: 'hint', text: 'Godkend en ansøgning, og kunden får en mail med et link til at vælge adgangskode. Ret gerne oplysningerne og skriv leveringsadressen i felterne, før du godkender.' }));
    var pending = data.applications.filter(function (a) { return a.status === 'pending'; });
    if (!pending.length) box.appendChild(el('p', { class: 'hint', text: 'Ingen nye ansøgninger.' }));
    pending.forEach(function (a) {
      var f = {};
      function inp(k, label, val, w) { f[k] = el('input', { type: 'text', value: val || '', style: 'width:100%' }); return el('label', { style: 'display:flex;flex-direction:column;gap:4px;font-size:13px;flex:1 1 ' + (w || 200) + 'px' }, [label, f[k]]); }
      var lang = el('select', { style: 'padding:8px;font:inherit;background:#0E2219;color:inherit;border:1px solid #4C6A59' }, [el('option', { value: 'lt', text: 'Litauisk', selected: a.lang === 'lt' ? true : null }), el('option', { value: 'en', text: 'Engelsk', selected: a.lang !== 'lt' ? true : null })]);
      var msgs = el('div');
      var card = el('section', { class: 'card' }, [
        el('div', { style: 'display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap' }, [el('h2', { text: a.company }), el('span', { class: 'sold', text: 'Modtaget ' + date(a.created_at) })]),
        el('p', { style: 'margin:6px 0 10px;color:' + C.soft }, [a.contact_name + ' · ', el('a', { href: 'mailto:' + a.email, text: a.email }), a.phone ? ' · ' + a.phone : '', a.address ? el('br') : null, a.address ? 'Adresse oplyst: ' + a.address : null, a.message ? el('br') : null, a.message ? 'Besked: ' + a.message : null]),
        el('div', { style: 'display:flex;flex-wrap:wrap;gap:10px' }, [
          inp('company', 'Firmanavn', a.company, 260), inp('company_code', 'Virksomhedskode', a.company_code, 150), inp('vat_code', 'Momsnummer', a.vat_code, 150),
          inp('contact_name', 'Kontaktperson', a.contact_name, 200), inp('phone', 'Telefon', a.phone, 150),
          inp('street', 'Gade og nr. (til DPD)', '', 260), inp('postal_code', 'Postnummer', '', 110), inp('city', 'By', '', 150),
          el('label', { style: 'display:flex;flex-direction:column;gap:4px;font-size:13px' }, ['Sprog i mails', lang])
        ]),
        el('div', { style: 'display:flex;gap:10px;margin-top:12px;flex-wrap:wrap' }, [
          btn('Godkend og send login-mail', function () {
            var body = { id: a.id, lang: lang.value }; Object.keys(f).forEach(function (k) { body[k] = f[k].value.trim(); });
            call('approve', body).then(function () { reload().then(function () { note($('tab-apps'), a.company + ' er godkendt. Kunden har fået en mail til at vælge adgangskode.'); }); }, function (e) { note(msgs, ERR[e.message] || ERR.failed, true); });
          }),
          btn('Afvis', function () { if (!window.confirm('Afvis ' + a.company + '? Kunden får ingen automatisk besked.')) return; call('reject', { id: a.id }).then(reload, function (e) { note(msgs, ERR[e.message] || ERR.failed, true); }); }, true)
        ]),
        msgs
      ]);
      box.appendChild(card);
    });
    var done = data.applications.filter(function (a) { return a.status !== 'pending'; }).slice(0, 20);
    if (done.length) {
      box.appendChild(el('h2', { style: 'margin-top:28px', text: 'Behandlet' }));
      box.appendChild(el('ul', { style: 'color:' + C.soft }, done.map(function (a) { return el('li', { text: a.company + ' · ' + a.email + ' · ' + (a.status === 'approved' ? 'godkendt' : 'afvist') + ' ' + date(a.decided_at) }); })));
    }
  }

  // ---- customers ----
  function renderCustomers() {
    var box = $('tab-customers'); box.textContent = '';
    box.appendChild(el('h1', { text: 'B2B-kunder' }));
    if (!data.customers.length) { box.appendChild(el('p', { class: 'hint', text: 'Ingen kunder endnu. Godkend en ansøgning under "Ansøgninger".' })); return; }
    data.customers.forEach(function (c) {
      var f = {};
      function inp(k, label, w) { f[k] = el('input', { type: 'text', value: c[k] || '', style: 'width:100%' }); return el('label', { style: 'display:flex;flex-direction:column;gap:4px;font-size:13px;flex:1 1 ' + (w || 160) + 'px' }, [label, f[k]]); }
      var msgs = el('div');
      box.appendChild(el('section', { class: 'card', style: c.active ? null : 'opacity:.6' }, [
        el('div', { style: 'display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap' }, [el('h2', { text: c.company + (c.active ? '' : ' (spærret)') }), el('span', { class: 'sold' }, [el('a', { href: 'mailto:' + c.email, text: c.email })])]),
        el('div', { style: 'display:flex;flex-wrap:wrap;gap:10px;margin-top:10px' }, [inp('contact_name', 'Kontaktperson', 180), inp('phone', 'Telefon', 140), inp('street', 'Gade og nr.', 220), inp('postal_code', 'Postnr.', 90), inp('city', 'By', 130)]),
        el('div', { style: 'display:flex;gap:10px;margin-top:12px;flex-wrap:wrap' }, [
          btn('Gem', function () { var body = { id: c.id }; Object.keys(f).forEach(function (k) { body[k] = f[k].value.trim(); }); call('customer', body).then(function () { note(msgs, 'Gemt.'); reload(); }, function (e) { note(msgs, ERR[e.message] || ERR.failed, true); }); }),
          btn('Send login-mail igen', function () { call('resend', { id: c.id }).then(function () { note(msgs, 'Mail sendt til ' + c.email + '.'); }, function (e) { note(msgs, ERR[e.message] || ERR.failed, true); }); }, true),
          btn(c.active ? 'Spær adgang' : 'Åbn adgang igen', function () { call('customer', { id: c.id, active: !c.active }).then(reload, function (e) { note(msgs, ERR[e.message] || ERR.failed, true); }); }, true)
        ]),
        msgs
      ]));
    });
  }

  window.FCB2B = {
    ready: function (p) {
      pw = p;
      var h = location.hash;
      if (h === '#b2b' || h === '#applications' || h === '#customers') tab(h === '#applications' ? 'apps' : h.slice(1));
      else if (!data) reload();
    }
  };
})();
