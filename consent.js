/* Cookie consent + Google Tag Manager for the caviar shop.
 *
 * Nothing from Google is loaded until the visitor accepts statistics or marketing cookies.
 * Google Consent Mode v2 is set to "denied" by default and updated from the visitor's choice,
 * so tags inside GTM know what they may do. "Reject all" is as easy as "Accept all".
 *
 * To switch tracking on, put the Tag Manager container ID below (looks like GTM-XXXXXXX).
 * GA4 itself is set up inside Tag Manager. With no ID, the banner still works but loads nothing.
 */
(function () {
  var GTM_ID = '';            // e.g. 'GTM-ABC1234'
  var KEY = 'fc-consent';
  var VERSION = 1;            // raise to ask everyone again (e.g. after adding new tools)

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  gtag('consent', 'default', {
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    analytics_storage: 'denied', functionality_storage: 'granted', security_storage: 'granted',
    wait_for_update: 500
  });

  var T = {
    en: {
      title: 'Cookies',
      text: 'We use necessary cookies to run the shop. With your consent we also use cookies to see how the site is used and to improve our marketing. You can change your choice at any time under "Cookie settings" at the bottom of the page.',
      accept: 'Accept all', reject: 'Reject all', settings: 'Settings', save: 'Save choices',
      necessary: 'Necessary', necessaryText: 'Keep your basket and make payment work. Always on.',
      analytics: 'Statistics', analyticsText: 'Google Analytics shows us how visitors use the site, so we can improve it.',
      marketing: 'Marketing', marketingText: 'Help us measure our ads and show relevant offers.',
      policy: 'Privacy policy', policyHref: '/privacy.html', on: 'On'
    },
    lt: {
      title: 'Slapukai',
      text: 'Parduotuvei veikti naudojame būtinuosius slapukus. Jums sutikus, taip pat naudojame slapukus, kad matytume, kaip naudojamasi svetaine, ir gerintume rinkodarą. Savo pasirinkimą bet kada galite pakeisti puslapio apačioje esančiuose „Slapukų nustatymuose“.',
      accept: 'Priimti visus', reject: 'Atmesti visus', settings: 'Nustatymai', save: 'Išsaugoti pasirinkimą',
      necessary: 'Būtinieji', necessaryText: 'Išsaugo krepšelį ir užtikrina mokėjimą. Visada įjungti.',
      analytics: 'Statistikos', analyticsText: 'Google Analytics parodo, kaip lankytojai naudojasi svetaine, kad galėtume ją gerinti.',
      marketing: 'Rinkodaros', marketingText: 'Padeda įvertinti mūsų reklamą ir rodyti aktualius pasiūlymus.',
      policy: 'Privatumo politika', policyHref: '/privacy-lt.html', on: 'Įjungti'
    }
  };
  function lang() { return (document.documentElement.lang || 'en').slice(0, 2) === 'lt' ? 'lt' : 'en'; }

  function read() {
    try { var c = JSON.parse(localStorage.getItem(KEY) || 'null'); return c && c.v === VERSION ? c : null; } catch (e) { return null; }
  }
  function store(analytics, marketing) {
    var c = { v: VERSION, analytics: !!analytics, marketing: !!marketing, at: new Date().toISOString() };
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
    return c;
  }
  var loaded = false;
  function apply(c) {
    gtag('consent', 'update', {
      analytics_storage: c.analytics ? 'granted' : 'denied',
      ad_storage: c.marketing ? 'granted' : 'denied',
      ad_user_data: c.marketing ? 'granted' : 'denied',
      ad_personalization: c.marketing ? 'granted' : 'denied'
    });
    window.dataLayer.push({ event: 'consent_update', consent_analytics: c.analytics, consent_marketing: c.marketing });
    if ((c.analytics || c.marketing) && GTM_ID && !loaded) {
      loaded = true;
      window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
      var s = document.createElement('script');
      s.async = true; s.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(GTM_ID);
      document.head.appendChild(s);
    }
  }

  var css = '#fc-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:50;max-width:560px;margin-left:auto;background:#12291E;color:#F1EEE4;border:1px solid #4C6A59;box-shadow:0 20px 50px rgba(0,0,0,.45);padding:22px;font:15px/1.55 Inter,system-ui,sans-serif}'
    + '#fc-consent h2{margin:0 0 8px;font:500 22px/1.1 "Barlow Condensed","Arial Narrow",sans-serif;text-transform:uppercase;letter-spacing:.04em}'
    + '#fc-consent p{margin:0 0 14px;color:#D5DACF}#fc-consent a{color:#F1EEE4}'
    + '#fc-consent .row{display:flex;flex-wrap:wrap;gap:10px}'
    + '#fc-consent button{flex:1 1 140px;min-height:46px;cursor:pointer;font:600 13px Inter,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;border:1px solid #8FD3A8;background:transparent;color:#F1EEE4;padding:10px 14px}'
    + '#fc-consent button.primary{background:#8FD3A8;color:#0E2219}'
    + '#fc-consent button:focus-visible,#fc-consent input:focus-visible{outline:2px solid #8FD3A8;outline-offset:3px}'
    + '#fc-consent .cat{border-top:1px solid #274536;padding:12px 0;display:flex;gap:12px;align-items:flex-start;justify-content:space-between}'
    + '#fc-consent .cat p{margin:2px 0 0;font-size:13px}#fc-consent .cat strong{font-weight:600}'
    + '#fc-consent .cat input{width:22px;height:22px;accent-color:#8FD3A8;flex:none;margin-top:2px}'
    + '#fc-consent .always{font-size:12px;color:#8FD3A8;white-space:nowrap}'
    + '@media (max-width:480px){#fc-consent{left:8px;right:8px;bottom:8px;padding:18px}}';

  var box = null, detailed = false;
  function close() { if (box) { box.remove(); box = null; } }
  function render(showDetails) {
    var t = T[lang()], cur = read() || { analytics: false, marketing: false };
    detailed = !!showDetails;
    if (!document.getElementById('fc-consent-css')) {
      var st = document.createElement('style'); st.id = 'fc-consent-css'; st.textContent = css; document.head.appendChild(st);
    }
    close();
    box = document.createElement('div');
    box.id = 'fc-consent'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'false'); box.setAttribute('aria-labelledby', 'fc-consent-h');
    var cats = !detailed ? '' :
      '<div class="cat"><div><strong>' + t.necessary + '</strong><p>' + t.necessaryText + '</p></div><span class="always">' + t.on + '</span></div>'
      + '<div class="cat"><label for="fc-c-a"><strong>' + t.analytics + '</strong><p>' + t.analyticsText + '</p></label><input type="checkbox" id="fc-c-a"' + (cur.analytics ? ' checked' : '') + '></div>'
      + '<div class="cat" style="margin-bottom:12px"><label for="fc-c-m"><strong>' + t.marketing + '</strong><p>' + t.marketingText + '</p></label><input type="checkbox" id="fc-c-m"' + (cur.marketing ? ' checked' : '') + '></div>';
    box.innerHTML = '<h2 id="fc-consent-h">' + t.title + '</h2><p>' + t.text + ' <a href="' + t.policyHref + '">' + t.policy + '</a></p>' + cats
      + '<div class="row">'
      + '<button type="button" data-a="reject">' + t.reject + '</button>'
      + (detailed ? '<button type="button" data-a="save">' + t.save + '</button>' : '<button type="button" data-a="settings">' + t.settings + '</button>')
      + '<button type="button" class="primary" data-a="accept">' + t.accept + '</button></div>';
    box.addEventListener('click', function (e) {
      var a = e.target.closest('button') && e.target.closest('button').getAttribute('data-a');
      if (!a) return;
      if (a === 'settings') { render(true); var f = document.getElementById('fc-c-a'); if (f) f.focus(); return; }
      var c = a === 'accept' ? store(true, true) : a === 'reject' ? store(false, false)
        : store(document.getElementById('fc-c-a').checked, document.getElementById('fc-c-m').checked);
      close(); apply(c);
    });
    document.body.appendChild(box);
  }

  // Public: open settings from a "Cookie settings" link, re-render after a language switch.
  window.fcConsent = {
    open: function () { render(true); },
    relabel: function () { if (box) render(detailed); },
    get: read
  };
  document.addEventListener('click', function (e) {
    var l = e.target.closest && e.target.closest('[data-cookie-settings]');
    if (l) { e.preventDefault(); render(true); }
  });

  function start() {
    var c = read();
    if (c) apply(c); else render(false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
