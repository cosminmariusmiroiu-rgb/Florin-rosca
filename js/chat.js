/* =========================================================
   Florin — asistentul virtual al salonului Florin Roșca (se prezintă mereu ca asistent virtual, nu ca stilistul)
   Răspunde din informațiile reale ale salonului (fără AI extern).
   Pe serverul site-ului, întrebările se salvează pentru salon (panou → Asistent virtual),
   iar vizitatorul își poate lăsa numele și telefonul ca să fie sunat.
   ========================================================= */
(function () {
  'use strict';
  const TEL = '0732 937 622', TEL_HREF = 'tel:+40732937622';
  const MAPS = 'https://www.google.com/maps/search/Florin+Rosca+Hair+Art+Concept/';
  const SHOP = 'magazin.html';
  const callBtn = `<a class="aur-act" href="${TEL_HREF}">📞 Sună: ${TEL}</a>`;

  // Knowledge base: real information from the salon's website.
  const KB = [
    { id: 'programare', label: 'Programare', keys: ['programare', 'programez', 'rezerv', 'liber', 'loc', 'vin', 'veni', 'cand pot', 'disponibil', 'appointment'],
      a: `Cel mai simplu: completezi <b>fișa de consultație</b> (2 minute), cu pozele părului și dovada avansului de minimum <b>200 lei</b> (se scade din bon și nu se returnează). Te contactăm în maximum <b>2 zile lucrătoare</b>.<a class="aur-act" href="consultatie.html">📋 Completează fișa</a>Sau sună la <b>${TEL}</b>.${callBtn}` },
    { id: 'orar', label: 'Program & adresă', keys: ['orar', 'programul', 'deschis', 'inchis', 'ora', 'ore', 'adresa', 'unde', 'locatie', 'harta', 'ghencea', 'dimri', 'sector', 'cum ajung', 'weekend', 'duminica', 'sambata'],
      a: `📍 <b>Prelungirea Ghencea 350–356</b>, Cartier Dimri, Bloc C3, AP7, București, Sector 6.<br>🕚 <b>Luni – Sâmbătă:</b> 11:00 – 21:00<br>Duminică: închis<a class="aur-act" href="${MAPS}" target="_blank" rel="noopener">🗺️ Deschide în Google Maps</a>` },
    { id: 'servicii', label: 'Servicii', keys: ['servici', 'ce faceti', 'oferiti', 'tuns', 'tunsoare', 'vopsit', 'vopsea', 'culoare', 'corectie', 'transformare', 'schimbare'],
      a: `În salon, <b>Florin Roșca</b> se ocupă de:<br>✦ <b>Balayage Premium Dubai</b>: blonduri și șuvițe dimensionale, tehnici Mounir Academy<br>✦ <b>Transformări complete de lux</b>: schimbări de look, corecții de culoare, tunsori personalizate<br>✦ <b>Tratamente intensive</b>: Hair Botox, reparare și hidratare profundă<br>Totul pornește de la o <b>consultație gratuită</b> de 15 minute.` },
    { id: 'balayage', label: 'Balayage', keys: ['balayage', 'balaiaj', 'blond', 'suvite', 'suvita', 'perlat', 'platinat', 'ombre', 'decolor'],
      a: `<b>Balayage Premium Dubai</b>: blonduri și șuvițe dimensionale, realizate prin tehnici <b>Mounir Academy</b>. Nuanțele sunt alese în funcție de părul tău și de rezultatul dorit, iar la final primești recomandări de menținere a culorii.<br>Începe cu o consultație gratuită: sună la <b>${TEL}</b>.${callBtn}` },
    { id: 'tratamente', label: 'Tratamente', keys: ['tratament', 'botox', 'hidrat', 'reparare', 'deteriorat', 'ars', 'uscat', 'rupt', 'varfuri', 'cadere'],
      a: `<b>Tratamente intensive</b>: Hair Botox și tratamente profesionale pentru reparare și hidratare profundă, adaptate nevoilor părului, cu recomandări pentru rutina de acasă.<br>Pentru acasă poți folosi și gama <b>Luxury Repair</b> din magazin.<a class="aur-act" href="${SHOP}">🛍️ Vezi produsele</a>` },
    { id: 'magazin', label: 'Magazin', keys: ['magazin', 'produs', 'cumpar', 'sampon', 'masca', 'fiole', 'spray', 'spuma', 'kit', 'set', 'luxury repair', 'anti-yellow', 'anti yellow', 'livrare', 'comanda'],
      a: `În magazin găsești gama <b>Luxury Repair</b>: 12 produse, între care șampon, mască, fiole, spray-uri, gama Anti-Yellow pentru blond, kituri și seturi, toate cu reducere.<br>De exemplu: Fiole reparatoare <b>350 lei</b> (în loc de 499), Kit Hair Botox & Argan Oil <b>299 lei</b> (în loc de 465).<a class="aur-act" href="${SHOP}">🛍️ Intră în magazin</a>` },
    { id: 'preturi', label: 'Prețuri', keys: ['pret', 'cost', 'costa', 'cat e', 'cat este', 'tarif', 'lei', 'bani', 'scump', 'ieftin'],
      a: `Prețul la balayage, culoare sau tratament depinde de părul tău: lungime, densitate, starea firului și rezultatul dorit. Îl afli exact la <b>consultația gratuită</b> sau la telefon, <b>${TEL}</b>.<br>Prețurile produselor din magazin sunt afișate direct pe produse.${callBtn}` },
    { id: 'florin', label: 'Despre Florin Roșca', keys: ['florin', 'cine', 'despre', 'experienta', 'mounir', 'dubai', 'formare', 'academie', 'curs', 'seminar'],
      a: `<b>Florin Roșca</b> are <b>peste 10 ani</b> de experiență în hairstyling și s-a format la <b>Mounir Academy Dubai</b> în tehnici de culoare și balayage.<br>⭐ Este <b>primul hair-stylist publicat pe paginile lui Mounir</b>.<br>Salonul are <b>4,9 din 5</b> din 581 de recenzii pe Google.` },
    { id: 'consultatie', label: 'Consultație gratuită', keys: ['consult', 'gratis', 'gratuit', 'sfat', 'recomand', 'nu stiu', 'ce mi se potriveste'],
      a: `Prima consultație este <b>gratuită și durează 15 minute</b>. Florin Roșca îți analizează părul și stilul și îți recomandă tehnica de culoare, tunsoarea și îngrijirea potrivite.<br>Pentru o transformare completă există și o consultație dedicată de 30 de minute.${callBtn}` },
    { id: 'recenzii', label: 'Recenzii', keys: ['recenz', 'pareri', 'review', 'stele', 'google', 'nota'],
      a: `Salonul Florin Roșca are <b>4,9 din 5 stele</b> din <b>581 de recenzii</b> pe Google.<a class="aur-act" href="${MAPS}" target="_blank" rel="noopener">⭐ Vezi recenziile</a>` },
    { id: 'contact', label: 'Contact', keys: ['telefon', 'numar', 'suna', 'contact', 'whatsapp', 'instagram', 'facebook', 'tiktok', 'mesaj'],
      a: `📞 Programări doar telefonic: <b>${TEL}</b><br>Ne găsești și pe <a href="https://www.instagram.com/florinroscaconcept/" target="_blank" rel="noopener">Instagram</a>, <a href="https://www.tiktok.com/@florinroscasalon" target="_blank" rel="noopener">TikTok</a> și <a href="https://www.facebook.com/FlorinRoscaHairArtConcept" target="_blank" rel="noopener">Facebook</a>.${callBtn}` },
    { id: 'salut', label: null, keys: ['buna', 'salut', 'hello', 'hei', 'hey', 'neata', 'seara', 'ziua'],
      a: `Bună! 😊 Cu ce te pot ajuta? Alege un subiect de mai jos sau scrie-mi întrebarea ta.` },
    { id: 'multumesc', label: null, keys: ['multum', 'mersi', 'merci', 'thanks', 'pa ', 'la revedere'],
      a: `Cu mare drag! ✨ Te așteptăm în salon. Pentru programare: <b>${TEL}</b>.` }
  ];
  const QUICK = ['programare', 'orar', 'servicii', 'balayage', 'tratamente', 'magazin', 'preturi', 'florin'];
  const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ș]/g, 's').replace(/[ț]/g, 't');

  function match(text) {
    const q = ' ' + norm(text) + ' ';
    let best = null, score = 0;
    for (const item of KB) {
      let s = 0;
      for (const k of item.keys) if (q.includes(norm(k))) s += k.length;
      if (s > score) { score = s; best = item; }
    }
    return best;
  }
  const unknown = () => `Nu sunt sigur că am înțeles. 🙏 Poți alege un subiect de mai jos, sau suni direct la salon, la <b>${TEL}</b>, unde primești răspuns la orice întrebare.${callBtn}` +
    (callbackOn ? '<button type="button" class="aur-act aur-act--line" data-call>📲 Vreau să fiu sunat(ă)</button>' : '');

  // ---------- what visitors ask is kept for the salon (no names, unless they leave them) ----------
  let sid = '', callbackOn = false;
  try { sid = sessionStorage.getItem('aur-sid') || ''; } catch (e) {}
  if (!/^[a-z0-9]{16,40}$/.test(sid)) {
    const rnd = window.crypto && crypto.getRandomValues ? Array.from(crypto.getRandomValues(new Uint8Array(12))) : Array.from({ length: 12 }, () => Math.floor(Math.random() * 256));
    sid = rnd.map((b) => b.toString(36).padStart(2, '0')).join('');
    try { sessionStorage.setItem('aur-sid', sid); } catch (e) {}
  }
  const page = (location.pathname.split('/').pop() || 'index.html').slice(0, 60);
  const post = (path, body) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify(Object.assign({ sid: sid, page: page }, body)) });
  function save(text, topic, quick) { if (window.fetch) post('api/chat', { text: text, topic: topic, quick: !!quick }).catch(() => {}); }

  // ---------- UI ----------
  const root = document.createElement('div');
  root.className = 'aur';
  root.innerHTML = `
    <button class="aur-fab" type="button" aria-label="Deschide chatul cu Florin, asistentul virtual" aria-expanded="false">
      <span class="aur-fab__icon" aria-hidden="true">✦</span><span class="aur-fab__ping"></span>
    </button>
    <section class="aur-win" role="dialog" aria-label="Chat cu Florin, asistentul virtual" hidden>
      <header class="aur-head">
        <span class="aur-ava" aria-hidden="true">F</span>
        <div><b>Florin</b><small><i></i> Asistentul virtual al salonului</small></div>
        <button class="aur-x" type="button" aria-label="Închide chatul">×</button>
      </header>
      <div class="aur-log" aria-live="polite"></div>
      <div class="aur-quick"></div>
      <form class="aur-form" autocomplete="off">
        <label class="aur-sr" for="aur-in">Scrie un mesaj</label>
        <input id="aur-in" class="aur-in" type="text" placeholder="Scrie întrebarea ta…" maxlength="300">
        <button class="aur-send" type="submit" aria-label="Trimite">➤</button>
      </form>
    </section>`;
  document.body.appendChild(root);

  const fab = root.querySelector('.aur-fab'), win = root.querySelector('.aur-win'), log = root.querySelector('.aur-log');
  const quick = root.querySelector('.aur-quick'), form = root.querySelector('.aur-form'), input = root.querySelector('.aur-in');
  let greeted = false;

  function bubble(html, who) {
    const b = document.createElement('div');
    b.className = 'aur-msg aur-msg--' + who;
    b.innerHTML = html;
    log.appendChild(b);
    log.scrollTop = log.scrollHeight;
    return b;
  }
  function botSay(html) {
    const t = bubble('<span class="aur-typing"><i></i><i></i><i></i></span>', 'bot');
    setTimeout(() => { t.innerHTML = html; log.scrollTop = log.scrollHeight; }, 650 + Math.min(900, html.length * 3));
  }
  function ask(text) {
    bubble(text.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])), 'me');
    const item = match(text);
    save(text, item ? item.id : null);
    botSay(item ? item.a : unknown());
  }
  QUICK.forEach((id) => {
    const item = KB.find((k) => k.id === id);
    const c = document.createElement('button');
    c.type = 'button'; c.className = 'aur-chip'; c.textContent = item.label;
    c.addEventListener('click', () => { bubble(item.label, 'me'); save(item.label, item.id, true); botSay(item.a); });
    quick.appendChild(c);
  });

  // ---------- "sună-mă înapoi": the visitor leaves a name and a phone number ----------
  function callForm() {
    const b = bubble('<form class="aur-call" novalidate><b>Lasă-ne numărul și te sunăm noi</b>' +
      '<input name="name" placeholder="Numele tău" autocomplete="name" maxlength="80">' +
      '<input name="phone" type="tel" placeholder="Telefon" autocomplete="tel" maxlength="30">' +
      '<input name="note" placeholder="Despre ce vrei să vorbim? (opțional)" maxlength="300">' +
      '<label class="aur-ok"><input type="checkbox" name="consent"><span>Sunt de acord să fiu contactat(ă) telefonic de salon.</span></label>' +
      '<p class="aur-err" role="alert"></p><button type="submit" class="aur-act">Trimite</button></form>', 'bot');
    const f = b.querySelector('form'), err = f.querySelector('.aur-err');
    f.addEventListener('submit', (e) => {
      e.preventDefault(); err.textContent = '';
      const name = f.name.value.trim(), phone = f.phone.value.trim();
      if (!name || !/^[+0-9 ()-]{9,20}$/.test(phone)) { err.textContent = 'Scrie numele și un număr de telefon corect.'; return; }
      if (!f.consent.checked) { err.textContent = 'Bifează acordul, ca să te putem suna.'; return; }
      const btn = f.querySelector('button'); btn.disabled = true;
      post('api/chat/contact', { name: name, phone: phone, note: f.note.value.trim(), consent: true })
        .then((r) => r.json().then((d) => { if (!r.ok) throw new Error(d.error || 'Nu am putut trimite cererea.'); }))
        .then(() => { b.innerHTML = 'Mulțumim, <b>' + name.replace(/[<>&]/g, '') + '</b>! ✨ Am notat numărul și te sunăm în programul salonului (luni – sâmbătă, 11:00 – 21:00).'; })
        .catch((x) => { err.textContent = x.message || 'Nu am putut trimite cererea. Te rugăm să suni la ' + TEL + '.'; btn.disabled = false; });
    });
    setTimeout(() => f.name.focus(), 60);
  }
  log.addEventListener('click', (e) => { if (e.target.closest('[data-call]')) callForm(); });
  // only on the site's own server: is the call-back option on? (on static hosting there is nothing to save)
  if (window.fetch) fetch('api/shop', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((s) => {
    if (!s) return;
    const n = document.createElement('p');
    n.className = 'aur-note'; n.textContent = 'Întrebările se salvează ca să te putem ajuta mai bine. Nu scrie date sensibile.';
    form.parentNode.insertBefore(n, form);
    if (!s.chatCallback) return;
    callbackOn = true;
    const c = document.createElement('button');
    c.type = 'button'; c.className = 'aur-chip'; c.textContent = '📲 Sună-mă înapoi';
    c.addEventListener('click', () => { bubble('Vreau să fiu sunat(ă)', 'me'); callForm(); });
    quick.insertBefore(c, quick.firstChild);
  }).catch(() => {});

  function open(v) {
    win.hidden = !v;
    fab.setAttribute('aria-expanded', String(v));
    root.classList.toggle('is-open', v);
    if (v && !greeted) {
      greeted = true;
      botSay(`Bună, sunt <b>Florin</b> ✨, asistentul virtual al salonului <b>Florin Roșca Luxury Hair</b>. Te pot ajuta cu ceva? Îți răspund despre programări, servicii, program și produse.`);
    }
    if (v) setTimeout(() => input.focus(), 50);
  }
  fab.addEventListener('click', () => open(win.hidden));
  root.querySelector('.aur-x').addEventListener('click', () => open(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !win.hidden) open(false); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    input.value = '';
    ask(v);
  });

  // permanent label "Asistent virtual" next to the button
  const lab = document.createElement('span');
  lab.className = 'aur-label'; lab.textContent = 'Asistent virtual';
  lab.addEventListener('click', () => open(true));
  root.appendChild(lab);

  // on every visit: the assistant asks if it can help (closable)
  setTimeout(() => {
    if (!win.hidden) return;
    const tip = document.createElement('div');
    tip.className = 'aur-tip';
    tip.setAttribute('role', 'status');
    tip.innerHTML = 'Bună! Sunt <b>Florin</b>, asistentul virtual ✨<br>Te pot ajuta cu ceva?<button type="button" class="aur-tip__x" aria-label="Închide">×</button>';
    tip.addEventListener('click', (e) => { tip.remove(); if (!e.target.closest('.aur-tip__x')) open(true); });
    root.appendChild(tip);
    root.classList.add('has-tip');
    const gone = () => root.classList.remove('has-tip');
    setTimeout(() => { tip.remove(); gone(); }, 15000);
    tip.addEventListener('click', gone);
  }, 4000);
})();
