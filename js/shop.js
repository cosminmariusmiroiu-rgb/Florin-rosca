/* Magazin: produse și stoc din panou (SmartBill), coș și comandă cu plata ramburs sau cu cardul (EuPlătesc).
   Pe hosting-ul static (fără server) pagina rămâne cu produsele scrise în HTML. */
(function () {
  'use strict';
  var grid = document.querySelector('.pgrid');
  if (!grid || !window.fetch) return;
  var KEY = 'fr-cart', PKEY = 'fr-pay';
  var products = [], shop = null, cart = load();
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var lei = function (n) { return (Number(n) || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei'; };
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {} }
  var JUDETE = ['Alba', 'Arad', 'Argeș', 'Bacău', 'Bihor', 'Bistrița-Năsăud', 'Botoșani', 'Brașov', 'Brăila', 'București', 'Buzău', 'Caraș-Severin', 'Călărași', 'Cluj', 'Constanța', 'Covasna', 'Dâmbovița', 'Dolj', 'Galați', 'Giurgiu', 'Gorj', 'Harghita', 'Hunedoara', 'Ialomița', 'Iași', 'Ilfov', 'Maramureș', 'Mehedinți', 'Mureș', 'Neamț', 'Olt', 'Prahova', 'Satu Mare', 'Sălaj', 'Sibiu', 'Suceava', 'Teleorman', 'Timiș', 'Tulcea', 'Vaslui', 'Vâlcea', 'Vrancea'];

  Promise.all([
    fetch('api/products', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }),
    fetch('api/shop', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); })
  ]).then(function (res) {
    products = res[0]; shop = res[1];
    if (!Array.isArray(products) || !products.length) return;
    fetch('api/categories', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (cats) {
      var box = document.querySelector('.chips');
      if (!cats || !box) return;
      var used = cats.filter(function (c) { return products.some(function (p) { return p.category === c.id; }); });
      box.innerHTML = '<button class="chip is-active" data-f="all" type="button">Toate</button>' + used.map(function (c) { return '<button class="chip" data-f="' + esc(c.id) + '" type="button">' + esc(c.name) + '</button>'; }).join('');
      box.querySelectorAll('.chip').forEach(function (c) {
        c.addEventListener('click', function () {
          box.querySelectorAll('.chip').forEach(function (x) { x.classList.toggle('is-active', x === c); });
          var f = c.getAttribute('data-f');
          document.querySelectorAll('.pcard').forEach(function (card) { card.hidden = !(f === 'all' || card.getAttribute('data-cat') === f); });
        });
      });
    }).catch(function () {});
    render();
    if (shop.enabled) buildCart();
    payReturn();
  }).catch(function () { /* static hosting: keep the HTML products */ });

  function render() {
    var count = document.querySelector('.shophead h1 span');
    if (count) count.textContent = '(' + products.length + ')';
    grid.innerHTML = products.map(function (p) {
      var off = p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
      var src = /^uploads\//.test(p.image) ? p.image : p.image;
      var buy = !shop.enabled ? '<a class="btn btn--gold pcard__buy" href="tel:+40732937622"><span>Comandă telefonic</span></a>'
        : p.inStock ? '<button class="btn btn--gold pcard__buy" type="button" data-add="' + esc(p.id) + '"><span>Adaugă în coș</span></button>'
        : '<button class="btn pcard__buy" type="button" disabled><span>Stoc epuizat</span></button>';
      return '<article class="pcard" data-cat="' + esc(p.category) + '">' +
        (off ? '<span class="pcard__tag">-' + off + '%</span>' : '') +
        '<div class="pcard__img"><img src="' + esc(src) + '" alt="' + esc(p.alt || p.name) + '" loading="lazy" width="600" height="600"></div>' +
        '<h2 class="pcard__name">' + esc(p.name) + (p.size ? ' <small>' + esc(p.size) + '</small>' : '') + '</h2>' +
        (p.description ? '<p class="pcard__desc">' + esc(p.description) + '</p>' : '') +
        '<p class="pcard__price">' + (p.oldPrice ? '<s>' + lei(p.oldPrice) + '</s> ' : '') + '<b>' + lei(p.price) + '</b></p>' +
        (p.stock != null && p.stock > 0 && p.stock <= 3 ? '<p class="pcard__low">Ultimele ' + p.stock + ' bucăți</p>' : '') +
        buy + '</article>';
    }).join('');
    // keep the active category filter
    var active = document.querySelector('.chip.is-active');
    if (active && active.getAttribute('data-f') !== 'all') active.click();
    var note = document.querySelector('.shopnote');
    var how = shop.card && shop.cod ? 'cu plata cu cardul sau ramburs la livrare' : shop.card ? 'cu plata cu cardul' : 'cu plata ramburs la livrare';
    if (note && shop.enabled) note.innerHTML = 'Comanzi direct de aici, ' + how + (shop.freeShippingFrom ? ' · livrare gratuită de la ' + lei(shop.freeShippingFrom) : '') + '. Pentru o recomandare potrivită părului tău, sună la <a href="tel:+40732937622">0732 937 622</a>.';
    grid.addEventListener('click', function (e) {
      var b = e.target.closest('[data-add]'); if (!b) return;
      add(b.getAttribute('data-add'), 1); openCart();
    });
  }

  /* ---------- cart ---------- */
  var fab, drawer;
  function find(id) { return products.find(function (p) { return p.id === id; }); }
  function lines() {
    return Object.keys(cart).map(function (id) { var p = find(id); return p ? { p: p, qty: cart[id] } : null; }).filter(Boolean);
  }
  function add(id, d) {
    var p = find(id); if (!p) return;
    var q = (cart[id] || 0) + d;
    if (p.stock != null) q = Math.min(q, p.stock);
    if (q <= 0) delete cart[id]; else cart[id] = Math.min(q, 50);
    if (d > 0 && drawer) drawer.querySelector('.cart__done').hidden = true; // shopping again: back to the order form
    save(); paint();
  }
  function totals() {
    var sub = lines().reduce(function (s, l) { return s + l.p.price * l.qty; }, 0);
    var ship = !sub ? 0 : shop.freeShippingFrom && sub >= shop.freeShippingFrom ? 0 : shop.shippingCost;
    return { sub: sub, ship: ship, total: sub + ship };
  }

  function buildCart() {
    // drop items that no longer exist
    Object.keys(cart).forEach(function (id) { if (!find(id)) delete cart[id]; }); save();
    fab = document.createElement('button');
    fab.className = 'cartfab'; fab.type = 'button'; fab.setAttribute('aria-label', 'Coșul de cumpărături');
    fab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7V6a5 5 0 0 1 10 0v1h3l-1.5 13.5a1.7 1.7 0 0 1-1.7 1.5H6.2a1.7 1.7 0 0 1-1.7-1.5L3 7zm2 0h6V6a3 3 0 0 0-6 0z"/></svg><b></b>';
    document.body.appendChild(fab);
    drawer = document.createElement('aside');
    drawer.className = 'cart'; drawer.setAttribute('aria-label', 'Coș'); drawer.hidden = true;
    drawer.innerHTML =
      '<div class="cart__in"><header class="cart__head"><h2>Coșul tău</h2><button type="button" class="cart__x" aria-label="Închide">×</button></header>' +
      '<div class="cart__lines"></div><div class="cart__sum"></div>' +
      '<form class="cart__form" novalidate><h3>Date de livrare</h3>' +
      '<label>Nume și prenume *<input name="name" autocomplete="name" required></label>' +
      '<label>Telefon *<input name="phone" type="tel" autocomplete="tel" required></label>' +
      '<label>E-mail <small>(pentru factură)</small><input name="email" type="email" autocomplete="email"></label>' +
      '<label>Adresă (stradă, număr, bloc, ap.) *<input name="address" autocomplete="street-address" required></label>' +
      '<div class="cart__2"><label>Localitate *<input name="city" autocomplete="address-level2" required></label>' +
      '<label>Județ *<select name="county" required><option value="">Alege</option>' + JUDETE.map(function (j) { return '<option>' + j + '</option>'; }).join('') + '</select></label></div>' +
      '<details><summary>Vreau factură pe firmă</summary><label>Denumire firmă<input name="company"></label><label>CUI<input name="cui"></label></details>' +
      '<label>Observații<textarea name="notes" rows="2"></textarea></label>' +
      '<label class="cart__check"><input type="checkbox" name="acceptTerms"><span>Am citit și accept <a href="termeni.html" target="_blank" rel="noopener">termenii și condițiile</a> și <a href="confidentialitate.html" target="_blank" rel="noopener">politica de confidențialitate</a>.</span></label>' +
      payBlock() +
      '<p class="cart__err" role="alert"></p>' +
      '<button class="btn btn--gold cart__go" type="submit"><span>Trimite comanda</span></button></form>' +
      '<div class="cart__done" hidden></div></div>';
    document.body.appendChild(drawer);
    fab.addEventListener('click', openCart);
    drawer.querySelector('.cart__x').addEventListener('click', closeCart);
    drawer.addEventListener('click', function (e) {
      if (e.target === drawer) return closeCart();
      var b = e.target.closest('[data-q]'); if (b) add(b.getAttribute('data-id'), +b.getAttribute('data-q'));
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !drawer.hidden) closeCart(); });
    drawer.querySelector('form').addEventListener('submit', submit);
    drawer.querySelector('form').addEventListener('change', function (e) { if (e.target.name === 'payment') goLabel(); });
    goLabel();
    paint();
  }

  /* ---------- payment: card (EuPlătesc) and / or ramburs ---------- */
  var CARD_TXT = function () { return 'Visa, Mastercard' + (shop.wallets ? ', Apple Pay, Google Pay' : '') + ' · plată securizată prin EuPlătesc'; };
  function payBlock() {
    if (shop.card && shop.cod) return '<fieldset class="cart__payopt"><legend>Cum plătești</legend>' +
      '<label class="cart__opt"><input type="radio" name="payment" value="card" checked><span><b>Card online</b><small>' + CARD_TXT() + '</small></span></label>' +
      '<label class="cart__opt"><input type="radio" name="payment" value="ramburs"><span><b>Ramburs</b><small>plătești la primirea coletului</small></span></label></fieldset>';
    if (shop.card) return '<input type="hidden" name="payment" value="card"><p class="cart__pay">Plata: <b>card online</b> (' + CARD_TXT() + ').</p>';
    return '<input type="hidden" name="payment" value="ramburs"><p class="cart__pay">Plata: <b>ramburs</b>, la primirea coletului.</p>';
  }
  function goLabel() {
    var f = drawer.querySelector('form');
    f.querySelector('.cart__go span').textContent = f.payment.value === 'card' ? 'Continuă spre plată' : 'Trimite comanda';
  }
  // sends the customer to the secure payment page (a form post with the signed fields)
  function goPay(pay) {
    var f = document.createElement('form');
    f.method = 'POST'; f.action = pay.url; f.style.display = 'none';
    Object.keys(pay.fields).forEach(function (k) { var i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = pay.fields[k]; f.appendChild(i); });
    document.body.appendChild(f); f.submit();
  }
  function pending() { try { return JSON.parse(localStorage.getItem(PKEY)); } catch (e) { return null; } }
  function forget() { try { localStorage.removeItem(PKEY); } catch (e) {} }
  function post(path, body) {
    return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'A apărut o eroare.'); return d; }); });
  }
  // back from the payment page (or an order that was left unpaid): show what happened
  var UNKNOWN = '<h3>Nu am putut confirma plata automat</h3><p>Dacă plata a fost făcută, comanda ta este în siguranță și te contactăm noi. Pentru detalii sună la <a href="tel:+40732937622">0732 937 622</a>.</p>';
  function payReturn() {
    var q = new URLSearchParams(location.search), flag = q.get('plata'), ord = pending();
    if (flag && q.get('comanda') && q.get('t')) ord = { number: q.get('comanda'), token: q.get('t'), at: Date.now() };
    if (flag && history.replaceState) history.replaceState(null, '', location.pathname);
    if (!drawer) return;
    var fresh = ord && ord.number && ord.token && (flag || Date.now() - (ord.at || 0) < 3 * 3600e3);
    if (!fresh) { forget(); if (flag) showDone(UNKNOWN); return; }
    fetch('api/order/status?n=' + encodeURIComponent(ord.number) + '&t=' + encodeURIComponent(ord.token), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (st) { payPanel(st, ord); })
      .catch(function () { forget(); if (flag) showDone(UNKNOWN); });
  }
  function showDone(html) {
    var done = drawer.querySelector('.cart__done');
    drawer.querySelector('.cart__form').hidden = true;
    done.hidden = false; done.innerHTML = html;
    paint(); openCart();
    return done;
  }
  function payPanel(st, ord) {
    if (st.paid) { forget(); return showDone('<div class="cart__ok">✓</div><h3>Plata a fost confirmată. Mulțumim!</h3><p>Comanda <b>#' + st.number + '</b> (' + lei(st.total) + ') este în pregătire. Te anunțăm când pleacă spre tine.</p>'); }
    if (st.payment === 'ramburs') { forget(); return; }
    if (st.cancelled || !st.canPay) { forget(); return showDone('<h3>Comanda #' + st.number + ' nu a fost plătită</h3><p>Comanda a fost anulată. Te rugăm să o plasezi din nou sau să suni la <a href="tel:+40732937622">0732 937 622</a>.</p>'); }
    var done = showDone('<h3>Plata pentru comanda #' + st.number + ' nu a fost finalizată</h3>' +
      (st.message ? '<p class="cart__warn">' + esc(st.message) + '</p>' : '') +
      '<p>Total de plată: <b>' + lei(st.total) + '</b>. Produsele rămân rezervate pentru scurt timp.</p>' +
      '<button class="btn btn--gold" type="button" data-pay="card"><span>Încearcă din nou cu cardul</span></button>' +
      (st.cod ? '<button class="btn btn--ghost" type="button" data-pay="cod"><span>Plătesc ramburs, la livrare</span></button>' : '') +
      '<p class="cart__err" role="alert"></p><button class="cart__link" type="button" data-pay="no">Renunț la comandă</button>');
    done.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pay]'); if (!b) return;
      var how = b.getAttribute('data-pay'), err = done.querySelector('.cart__err');
      if (how === 'no') { forget(); done.hidden = true; paint(); return closeCart(); }
      b.disabled = true; err.textContent = '';
      post(how === 'card' ? 'api/order/pay' : 'api/order/cod', { number: ord.number, token: ord.token })
        .then(function (d) {
          if (d.pay) return goPay(d.pay);
          forget();
          done.innerHTML = '<div class="cart__ok">✓</div><h3>Mulțumim! Comanda #' + d.number + ' a fost primită.</h3><p>Total de plată la livrare: <b>' + lei(d.total) + '</b>.</p><p>Te sunăm în cel mai scurt timp pentru confirmare.</p>';
        })
        .catch(function (x) { err.textContent = x.message; b.disabled = false; });
    });
  }
  function openCart() { drawer.hidden = false; requestAnimationFrame(function () { drawer.classList.add('on'); }); document.body.style.overflow = 'hidden'; }
  function closeCart() { drawer.classList.remove('on'); document.body.style.overflow = ''; setTimeout(function () { drawer.hidden = true; }, 300); }

  function paint() {
    if (!fab) return;
    var ls = lines(), n = ls.reduce(function (s, l) { return s + l.qty; }, 0), t = totals();
    fab.querySelector('b').textContent = n; fab.classList.toggle('has', n > 0);
    drawer.querySelector('.cart__lines').innerHTML = ls.length ? ls.map(function (l) {
      return '<div class="cline"><img src="' + esc(l.p.image) + '" alt=""><div><b>' + esc(l.p.name) + '</b> <small>' + esc(l.p.size) + '</small><span>' + lei(l.p.price) + '</span></div>' +
        '<div class="cline__q"><button type="button" data-id="' + esc(l.p.id) + '" data-q="-1" aria-label="Scade">−</button><span>' + l.qty + '</span><button type="button" data-id="' + esc(l.p.id) + '" data-q="1" aria-label="Adaugă">+</button></div></div>';
    }).join('') : (drawer.querySelector('.cart__done').hidden ? '<p class="cart__empty">Coșul este gol.</p>' : '');
    drawer.querySelector('.cart__sum').innerHTML = ls.length ?
      '<p><span>Produse</span><span>' + lei(t.sub) + '</span></p><p><span>Livrare</span><span>' + (t.ship ? lei(t.ship) : 'gratuită') + '</span></p>' +
      (shop.freeShippingFrom && t.ship ? '<p class="cart__hint">Mai adaugă ' + lei(shop.freeShippingFrom - t.sub) + ' pentru livrare gratuită.</p>' : '') +
      '<p class="cart__total"><span>Total</span><span>' + lei(t.total) + '</span></p>' : '';
    var done = drawer.querySelector('.cart__done');
    drawer.querySelector('.cart__form').hidden = !ls.length || (done && !done.hidden);
  }

  function submit(e) {
    e.preventDefault();
    var f = e.target, err = f.querySelector('.cart__err'), btn = f.querySelector('.cart__go');
    err.textContent = '';
    var body = { items: lines().map(function (l) { return { id: l.p.id, qty: l.qty }; }), acceptTerms: f.acceptTerms.checked, payment: f.payment.value, customer: {} };
    ['name', 'phone', 'email', 'address', 'city', 'county', 'company', 'cui', 'notes'].forEach(function (k) { body.customer[k] = f[k].value; });
    if (!body.customer.name || !body.customer.phone || !body.customer.address || !body.customer.city || !body.customer.county) { err.textContent = 'Completează câmpurile marcate cu *.'; return; }
    if (!body.acceptTerms) { err.textContent = 'Bifează acceptarea termenilor și condițiilor.'; return; }
    btn.disabled = true;
    fetch('api/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Comanda nu a putut fi trimisă.'); return d; }); })
      .then(function (d) {
        cart = {}; save(); paint();
        if (d.pay) { // card: remember the order, then go to the payment page
          try { localStorage.setItem(PKEY, JSON.stringify({ number: d.number, token: d.token, at: Date.now() })); } catch (e) {}
          f.hidden = true;
          var wait = drawer.querySelector('.cart__done');
          wait.hidden = false; wait.innerHTML = '<h3>Te ducem la pagina de plată…</h3><p>Comanda #' + d.number + ' · ' + lei(d.total) + '</p>';
          return goPay(d.pay);
        }
        f.hidden = true;
        var done = drawer.querySelector('.cart__done');
        done.hidden = false;
        done.innerHTML = '<div class="cart__ok">✓</div><h3>Mulțumim! Comanda #' + d.number + ' a fost primită.</h3><p>Total de plată la livrare: <b>' + lei(d.total) + '</b>.</p><p>Te sunăm în cel mai scurt timp pentru confirmare.</p>';
      })
      .catch(function (x) { err.textContent = x.message; })
      .then(function () { btn.disabled = false; });
  }
})();
