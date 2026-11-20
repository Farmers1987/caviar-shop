/* Newsletter popup for the caviar shop (EN/LT).
 * Shows once, after the cookie choice has been made: after 25 seconds, when the visitor has
 * scrolled past half the page, or (on desktop) when the mouse leaves the window towards the top.
 * Closing it or signing up hides it for 30 days. Not shown on the thank-you or legal pages.
 */
(function () {
  var KEY = 'fc-newsletter';
  var T = {
    en: {
      eyebrow: 'Offers by email', title: 'Be the first to know',
      text: 'Now and then we have caviar with a shorter best-before date at a good discount, and we tell you when fresh tins arrive. Only a few emails, no spam.',
      placeholder: 'Your email', button: 'Sign me up', close: 'Close',
      legal: 'You will get an email to confirm. You can unsubscribe at any time. Read our <a href="/privacy.html">privacy policy</a>.',
      ok: 'Almost done: check your inbox and confirm your email.', bad: 'Please enter a valid email address.', fail: 'Something went wrong. Please try again later.'
    },
    lt: {
      eyebrow: 'Pasiūlymai el. paštu', title: 'Sužinokite pirmieji',
      text: 'Kartais turime ikrų su trumpesniu tinkamumo terminu už gerą kainą, be to, pranešame, kai atkeliauja šviežių skardinių. Tik keli laiškai, jokio šlamšto.',
      placeholder: 'Jūsų el. paštas', button: 'Užsiprenumeruoti', close: 'Uždaryti',
      legal: 'Gausite laišką prenumeratai patvirtinti. Atsisakyti galite bet kada. Susipažinkite su mūsų <a href="/privacy-lt.html">privatumo politika</a>.',
      ok: 'Beveik baigta: patikrinkite el. paštą ir patvirtinkite prenumeratą.', bad: 'Įveskite teisingą el. pašto adresą.', fail: 'Kažkas nepavyko. Bandykite vėliau.'
    }
  };
  function lang() { return (document.documentElement.lang || 'en').slice(0, 2) === 'lt' ? 'lt' : 'en'; }
  function snoozed() { try { var v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && Date.now() < v.until; } catch (e) { return false; } }
  function snooze(days) { try { localStorage.setItem(KEY, JSON.stringify({ until: Date.now() + days * 864e5 })); } catch (e) {} }
  function consentDone() { try { return !!localStorage.getItem('fc-consent'); } catch (e) { return true; } }
  if (snoozed()) return;

  var css = '#fc-nl-back{position:fixed;inset:0;z-index:60;background:rgba(5,14,10,.6);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .3s ease}'
    + '#fc-nl-back.in{opacity:1}'
    + '#fc-nl{position:relative;max-width:460px;width:100%;background:#12291E;color:#F1EEE4;border:1px solid #4C6A59;box-shadow:0 30px 60px rgba(0,0,0,.5);padding:32px 28px 26px;font:15px/1.55 Inter,system-ui,sans-serif;transform:translateY(16px);transition:transform .35s cubic-bezier(.2,.7,.2,1)}'
    + '#fc-nl-back.in #fc-nl{transform:none}'
    + '#fc-nl .eb{margin:0 0 6px;font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#8FD3A8}'
    + '#fc-nl h2{margin:0 0 10px;font:500 34px/1.05 "Barlow Condensed","Arial Narrow",sans-serif;text-transform:uppercase;letter-spacing:.03em}'
    + '#fc-nl p{margin:0 0 16px;color:#D5DACF}#fc-nl a{color:#F1EEE4}'
    + '#fc-nl form{display:flex;flex-wrap:wrap;gap:10px}'
    + '#fc-nl input[type=email]{flex:1 1 200px;min-height:48px;font:inherit;color:#F1EEE4;background:#0E2219;border:1px solid #4C6A59;padding:10px 14px}'
    + '#fc-nl button.go{flex:1 1 140px;min-height:48px;cursor:pointer;border:0;background:#8FD3A8;color:#0E2219;font:600 13px Inter,system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase}'
    + '#fc-nl button.go[disabled]{opacity:.6;cursor:wait}'
    + '#fc-nl .x{position:absolute;top:8px;right:8px;width:44px;height:44px;border:0;background:transparent;color:#D5DACF;font-size:26px;line-height:1;cursor:pointer}'
    + '#fc-nl .legal{margin:12px 0 0;font-size:12px;color:#B3BDB0}'
    + '#fc-nl .msg{margin:12px 0 0;font-size:14px;color:#8FD3A8}#fc-nl .msg.err{color:#F3B6A8}'
    + '#fc-nl .hp{position:absolute;left:-9999px}'
    + '#fc-nl button:focus-visible,#fc-nl input:focus-visible,#fc-nl a:focus-visible{outline:2px solid #8FD3A8;outline-offset:3px}'
    + '@media (prefers-reduced-motion:reduce){#fc-nl-back,#fc-nl{transition:none}}';

  var shown = false, lastFocus = null;
  function dl(o) { window.dataLayer = window.dataLayer || []; o.language = lang(); window.dataLayer.push(o); }
  function show(why) {
    if (shown || snoozed() || document.getElementById('fc-consent')) return;
    shown = true;
    var t = T[lang()];
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var back = document.createElement('div'); back.id = 'fc-nl-back';
    back.innerHTML = '<div id="fc-nl" role="dialog" aria-modal="true" aria-labelledby="fc-nl-h">'
      + '<button type="button" class="x" aria-label="' + t.close + '">×</button>'
      + '<p class="eb">' + t.eyebrow + '</p><h2 id="fc-nl-h">' + t.title + '</h2><p>' + t.text + '</p>'
      + '<form novalidate><label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>'
      + '<input type="email" name="email" required autocomplete="email" placeholder="' + t.placeholder + '" aria-label="' + t.placeholder + '">'
      + '<button class="go" type="submit">' + t.button + '</button></form>'
      + '<p class="msg" role="status" aria-live="polite"></p><p class="legal">' + t.legal + '</p></div>';
    document.body.appendChild(back);
    dl({ event: 'newsletter_popup_view', popup_trigger: why });
    lastFocus = document.activeElement;
    requestAnimationFrame(function () { back.classList.add('in'); });
    var done = false;
    var box = back.querySelector('#fc-nl'), form = back.querySelector('form'), msg = back.querySelector('.msg'), email = form.querySelector('input[type=email]');
    setTimeout(function () { email.focus(); }, 50);
    function close() { if (!done) dl({ event: 'newsletter_popup_close' }); snooze(30); back.remove(); document.removeEventListener('keydown', onKey); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
    function onKey(e) {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') { // keep focus inside the dialog
        var f = box.querySelectorAll('button, input:not([tabindex="-1"]), a'); var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    back.querySelector('.x').addEventListener('click', close);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { msg.className = 'msg err'; msg.textContent = t.bad; email.focus(); return; }
      var btn = form.querySelector('.go'); btn.disabled = true;
      fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: v, website: form.website.value, lang: lang() }) })
        .then(function (r) { if (!r.ok) throw new Error(); })
        .then(function () {
          done = true; form.remove(); msg.className = 'msg'; msg.textContent = t.ok; snooze(365);
          dl({ event: 'generate_lead', lead_source: 'newsletter_popup' });
        })
        .catch(function () { btn.disabled = false; msg.className = 'msg err'; msg.textContent = t.fail; });
    });
  }

  function arm() {
    if (!consentDone()) { setTimeout(arm, 1500); return; } // wait for the cookie choice first
    setTimeout(function () { show('time_25s'); }, 25000);
    window.addEventListener('scroll', function onS() {
      if (window.scrollY > (document.documentElement.scrollHeight - innerHeight) * 0.5) { window.removeEventListener('scroll', onS); show('scroll_50'); }
    }, { passive: true });
    if (window.matchMedia && window.matchMedia('(pointer:fine)').matches) {
      document.addEventListener('mouseout', function (e) { if (!e.relatedTarget && e.clientY <= 0) show('exit_intent'); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm); else arm();
})();
