/* =========================================================
   Aurelia — asistenta virtuală a salonului Florin Roșca
   Răspunde din informațiile reale ale salonului (fără server, fără AI extern).
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
      a: `Programările se fac <b>telefonic</b>. Sună-l pe Florin la <b>${TEL}</b> și stabiliți ziua și ora potrivite.<br>Prima consultație e <b>gratuită</b> și durează 15 minute.${callBtn}` },
    { id: 'orar', label: 'Program & adresă', keys: ['orar', 'programul', 'deschis', 'inchis', 'ora', 'ore', 'adresa', 'unde', 'locatie', 'harta', 'ghencea', 'dimri', 'sector', 'cum ajung', 'weekend', 'duminica', 'sambata'],
      a: `📍 <b>Prelungirea Ghencea 350–356</b>, Cartier Dimri, Bloc C3, AP7, București, Sector 6.<br>🕙 <b>Luni – Joi:</b> 10:00 – 21:00<br>🕙 <b>Vineri – Duminică:</b> 10:00 – 20:00<a class="aur-act" href="${MAPS}" target="_blank" rel="noopener">🗺️ Deschide în Google Maps</a>` },
    { id: 'servicii', label: 'Servicii', keys: ['servici', 'ce faceti', 'oferiti', 'tuns', 'tunsoare', 'vopsit', 'vopsea', 'culoare', 'corectie', 'transformare', 'schimbare'],
      a: `Florin se ocupă de:<br>✦ <b>Balayage Premium Dubai</b>: blonduri și șuvițe dimensionale, tehnici Mounir Academy<br>✦ <b>Transformări complete de lux</b>: schimbări de look, corecții de culoare, tunsori personalizate<br>✦ <b>Tratamente intensive</b>: Hair Botox, reparare și hidratare profundă<br>Totul pornește de la o <b>consultație gratuită</b> de 15 minute.` },
    { id: 'balayage', label: 'Balayage', keys: ['balayage', 'balaiaj', 'blond', 'suvite', 'suvita', 'perlat', 'platinat', 'ombre', 'decolor'],
      a: `<b>Balayage Premium Dubai</b>: blonduri și șuvițe dimensionale, realizate prin tehnici <b>Mounir Academy</b>. Nuanțele sunt alese în funcție de părul tău și de rezultatul dorit, iar la final primești recomandări de menținere a culorii.<br>Începe cu o consultație gratuită: sună la <b>${TEL}</b>.${callBtn}` },
    { id: 'tratamente', label: 'Tratamente', keys: ['tratament', 'botox', 'hidrat', 'reparare', 'deteriorat', 'ars', 'uscat', 'rupt', 'varfuri', 'cadere'],
      a: `<b>Tratamente intensive</b>: Hair Botox și tratamente profesionale pentru reparare și hidratare profundă, adaptate nevoilor părului, cu recomandări pentru rutina de acasă.<br>Pentru acasă poți folosi și gama <b>Luxury Repair</b> din magazin.<a class="aur-act" href="${SHOP}">🛍️ Vezi produsele</a>` },
    { id: 'magazin', label: 'Magazin', keys: ['magazin', 'produs', 'cumpar', 'sampon', 'masca', 'fiole', 'spray', 'spuma', 'kit', 'set', 'luxury repair', 'anti-yellow', 'anti yellow', 'livrare', 'comanda'],
      a: `În magazin găsești gama <b>Luxury Repair</b>: 12 produse, între care șampon, mască, fiole, spray-uri, gama Anti-Yellow pentru blond, kituri și seturi, toate cu reducere.<br>De exemplu: Fiole reparatoare <b>350 lei</b> (în loc de 499), Kit Hair Botox & Argan Oil <b>299 lei</b> (în loc de 465).<a class="aur-act" href="${SHOP}">🛍️ Intră în magazin</a>` },
    { id: 'preturi', label: 'Prețuri', keys: ['pret', 'cost', 'costa', 'cat e', 'cat este', 'tarif', 'lei', 'bani', 'scump', 'ieftin'],
      a: `Prețul la balayage, culoare sau tratament depinde de părul tău: lungime, densitate, starea firului și rezultatul dorit. Florin ți-l spune exact la <b>consultația gratuită</b> sau la telefon, <b>${TEL}</b>.<br>Prețurile produselor din magazin sunt afișate direct pe produse.${callBtn}` },
    { id: 'florin', label: 'Despre Florin', keys: ['florin', 'cine', 'despre', 'experienta', 'mounir', 'dubai', 'formare', 'academie', 'curs', 'seminar'],
      a: `<b>Florin Roșca</b> are <b>peste 10 ani</b> de experiență în hairstyling și s-a format la <b>Mounir Academy Dubai</b> în tehnici de culoare și balayage.<br>⭐ Este <b>primul hair-stylist publicat pe paginile lui Mounir</b>.<br>Salonul are <b>4,9 din 5</b> din 581 de recenzii pe Google.` },
    { id: 'consultatie', label: 'Consultație gratuită', keys: ['consult', 'gratis', 'gratuit', 'sfat', 'recomand', 'nu stiu', 'ce mi se potriveste'],
      a: `Prima consultație este <b>gratuită și durează 15 minute</b>. Florin analizează părul și stilul tău și îți recomandă tehnica de culoare, tunsoarea și îngrijirea potrivite.<br>Pentru o transformare completă există și o consultație dedicată de 30 de minute.${callBtn}` },
    { id: 'recenzii', label: 'Recenzii', keys: ['recenz', 'pareri', 'review', 'stele', 'google', 'nota'],
      a: `Salonul Florin Roșca are <b>4,9 din 5 stele</b> din <b>581 de recenzii</b> pe Google.<a class="aur-act" href="${MAPS}" target="_blank" rel="noopener">⭐ Vezi recenziile</a>` },
    { id: 'contact', label: 'Contact', keys: ['telefon', 'numar', 'suna', 'contact', 'whatsapp', 'instagram', 'facebook', 'tiktok', 'mesaj'],
      a: `📞 Programări doar telefonic: <b>${TEL}</b><br>Ne găsești și pe <a href="https://www.instagram.com/florinroscaconcept/" target="_blank" rel="noopener">Instagram</a>, <a href="https://www.tiktok.com/@florirosca.hairart" target="_blank" rel="noopener">TikTok</a> și <a href="https://www.facebook.com/FlorinRoscaHairArtConcept" target="_blank" rel="noopener">Facebook</a>.${callBtn}` },
    { id: 'salut', label: null, keys: ['buna', 'salut', 'hello', 'hei', 'hey', 'neata', 'seara', 'ziua'],
      a: `Bună! 😊 Cu ce te pot ajuta? Alege un subiect de mai jos sau scrie-mi întrebarea ta.` },
    { id: 'multumesc', label: null, keys: ['multum', 'mersi', 'merci', 'thanks', 'pa ', 'la revedere'],
      a: `Cu mare drag! ✨ Te așteptăm în salon. Pentru programare: <b>${TEL}</b>.` }
  ];
  const QUICK = ['programare', 'orar', 'servicii', 'balayage', 'tratamente', 'magazin', 'preturi', 'florin'];
  const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ș]/g, 's').replace(/[ț]/g, 't');

  function answer(text) {
    const q = ' ' + norm(text) + ' ';
    let best = null, score = 0;
    for (const item of KB) {
      let s = 0;
      for (const k of item.keys) if (q.includes(norm(k))) s += k.length;
      if (s > score) { score = s; best = item; }
    }
    if (best) return best.a;
    return `Nu sunt sigură că am înțeles. 🙏 Poți alege un subiect de mai jos, sau îl suni direct pe Florin la <b>${TEL}</b>, care îți răspunde la orice întrebare.${callBtn}`;
  }

  // ---------- UI ----------
  const root = document.createElement('div');
  root.className = 'aur';
  root.innerHTML = `
    <button class="aur-fab" type="button" aria-label="Deschide chatul cu Aurelia" aria-expanded="false">
      <span class="aur-fab__icon" aria-hidden="true">✦</span><span class="aur-fab__ping"></span>
    </button>
    <section class="aur-win" role="dialog" aria-label="Chat cu Aurelia" hidden>
      <header class="aur-head">
        <span class="aur-ava" aria-hidden="true">A</span>
        <div><b>Aurelia</b><small><i></i> Asistenta salonului Florin Roșca</small></div>
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
    botSay(answer(text));
  }
  QUICK.forEach((id) => {
    const item = KB.find((k) => k.id === id);
    const c = document.createElement('button');
    c.type = 'button'; c.className = 'aur-chip'; c.textContent = item.label;
    c.addEventListener('click', () => { bubble(item.label, 'me'); botSay(item.a); });
    quick.appendChild(c);
  });

  function open(v) {
    win.hidden = !v;
    fab.setAttribute('aria-expanded', String(v));
    root.classList.toggle('is-open', v);
    if (v && !greeted) {
      greeted = true;
      botSay(`Bună, sunt <b>Aurelia</b> ✨, asistenta salonului <b>Florin Roșca Luxury Hair</b>. Te ajut cu programări, servicii, program și produse. Ce te interesează?`);
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

  // gentle invitation after a while (once per visit)
  setTimeout(() => {
    if (!win.hidden || greeted) return;
    const tip = document.createElement('div');
    tip.className = 'aur-tip';
    tip.innerHTML = 'Ai o întrebare? Sunt <b>Aurelia</b> ✨';
    tip.addEventListener('click', () => { tip.remove(); open(true); });
    root.appendChild(tip);
    setTimeout(() => tip.remove(), 9000);
  }, 12000);
})();
