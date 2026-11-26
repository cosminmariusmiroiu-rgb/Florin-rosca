# Panoul de administrare – Florin Roșca

Panoul se deschide la adresa **/admin/** a site-ului (de ex. `https://florinrosca.ro/admin/`).

## Ce poți face
- **Acasă**: comenzi noi, vânzări pe 30 de zile, produse cu stoc mic, starea legăturii cu SmartBill.
- **Comenzi**: vezi fiecare comandă, schimbi statusul (Nouă → Confirmată → Expediată → Livrată), treci AWB-ul, emiți factura în SmartBill cu un clic și o deschizi în PDF.
- **Produse & stoc**: modifici nume, preț, preț tăiat, poză, descriere, ascunzi sau adaugi produse și schimbi ordinea lor.
- **Texte site**: modifici textele principale de pe site (descrierea de sus, program, adresă, titluri).
- **SmartBill**: conectezi contul. Stocul se sincronizează automat, iar factura se emite manual sau automat la fiecare comandă.
- **Magazin & cont**: oprești sau pornești comenzile online, setezi costul livrării și pragul de livrare gratuită, schimbi parola.

## Fișe cliente
- Fișele completate de cliente pe site apar la **Fișe cliente**. Cu **+ Fișă nouă** adaugi tu o fișă (ajunge numele; restul răspunsurilor și pozele sunt opționale).
- Cu **✏️ Modifică fișa** schimbi orice răspuns, inclusiv la fișele completate de cliente, și poți adăuga, schimba sau scoate poze.

## Colete și curier (Sameday)
1. Ceri de la Sameday (managerul de cont) **datele de acces pentru API**: utilizator și parolă API. Nu sunt aceleași cu cele de la eAWB.
2. În panou: **Colete → Setări curier**. Alegi Sameday, completezi utilizatorul și parola, apoi apeși **„Încarcă din cont”** ca să alegi punctul de ridicare și serviciul. Apoi apeși **„Salvează”** și **„Testează conexiunea”**.
3. Opțional: bifezi „Mod test” ca să încerci întâi pe contul de test Sameday.
4. La fiecare colet: **Generează AWB**, apoi **Etichetă** (PDF de printat), apoi **Predat curierului**. Poți genera AWB-uri pentru toate coletele odată.
5. Comenzile venite după **ora limită** (implicit 14:00) apar la „Pleacă MÂINE”. Duminica nu se expediază.
6. Dacă o comandă se anulează, produsele se pun automat înapoi în stoc.

## Conectarea SmartBill
1. În SmartBill intri la **Contul meu → Integrări → API** și copiezi **token-ul**.
2. În panou, la **SmartBill**, completezi e-mailul contului SmartBill, CIF-ul firmei, token-ul și seria facturilor.
3. Apeși **Testează conexiunea**.
4. La fiecare produs completezi **Codul produsului din SmartBill** (exact ca în nomenclatorul SmartBill), ca stocul să se potrivească.

### TVA
- Firma este plătitoare de TVA (în registrul ANAF, din 31.03.2026). În panou → SmartBill, „Firma este plătitoare de TVA” trebuie să rămână bifat: facturile și bonurile se emit cu TVA 21%, iar prețurile din magazin sunt cu TVA inclus.
- Și în SmartBill, la **Configurare → Date firmă**, firma trebuie să fie trecută „Plătitor TVA: Da”. Dacă în contul SmartBill nu există cota de 21%, aplicația nu emite factura și scrie motivul la comandă.
- CIF-ul din panou → SmartBill este cel din contul SmartBill: pentru o firmă plătitoare de TVA are „RO” în față (RO48413001). Dacă e scris fără „RO”, aplicația încearcă singură și forma cealaltă.
- În SmartBill, la **Nomenclatoare → Produse / Servicii**, fiecare articol are „Cota TVA 21%” și „Prețul conține TVA: Da” (prețul scris acolo este cel plătit de clientă). La un articol nou, bifează la fel.

### Gestiuni și coduri de produs
- În SmartBill, produsele de vânzare (din salon și de pe site) stau în gestiunea **PRODUSE**. Serviciile (manopera: balayage, vopsit, tuns, tratamente) nu au stoc, deci nu au nevoie de gestiune: se trec în SmartBill la Produse / Servicii cu tipul „serviciu”.
- Fiecare produs de pe site are un **cod SmartBill** (ex. `LR-SPRAY-200`, `AY-MASCA-1000`). Același cod trebuie să fie și pe produsul din SmartBill: după cod se potrivesc stocul și facturile.
- Citirea stocului din SmartBill se pornește abia după ce stocul a fost introdus în gestiunea PRODUSE. Altfel site-ul ar arăta toate produsele ca epuizate.

### Servicii (manoperă)
- Serviciile salonului (balayage, vopsit, tuns, tratamente) sunt în panou la **Produse & stoc**, în categoria „Servicii (manoperă)”, cu aceleași coduri ca în SmartBill (1–13). Nu apar pe site și nu au stoc; prețul și numele se schimbă ca la orice produs.
- La **Vânzare salon** se bifează la fel ca produsele, iar pe bon pot fi și servicii, și produse.

### Bon fiscal din aplicație (SmartBill + casa de marcat)
Cum merge: la „Vândut”, aplicația cere bonul de la SmartBill (pe casa de marcat setată în SmartBill → Configurare → Case de marcat), iar panoul deschis **pe calculatorul din salon** pune fișierul bonului în folderul din care îl citește casa de marcat.
1. Pe calculatorul din salon (cel legat la casa de marcat), deschizi panoul în **Chrome sau Edge** → **SmartBill** → bifezi **Bon fiscal din aplicație** → Salvează.
2. Apeși **Conectează folderul casei de marcat** și alegi folderul bonurilor (cel din SmartBill, de ex. `C:\FiscalNet\Bonuri`). Numele fișierului trebuie să fie același ca în SmartBill (de ex. `bon.txt`).
3. Lași panoul deschis pe acel calculator. Vânzările făcute de pe telefon se tipăresc acolo în câteva secunde.
- Dacă acel calculator nu e pornit, vânzarea de pe telefon se salvează fără bon; bonul se emite apoi de pe calculatorul din salon, cu **🧾 Emite bon fiscal** din lista de vânzări.
- Un bon ajunge la casa de marcat o singură dată. „Trimite din nou” tipărește încă un bon fiscal, deci se folosește doar dacă primul nu a ieșit.
- Pentru plata prin transfer nu se emite bon. Anularea unei vânzări din panou nu anulează bonul deja emis.
- Fiecare bon emis așa se numără la documentele din abonamentul SmartBill.

### Factura către clientă (e-mail și WhatsApp)
- **Comenzi de pe site**: cu „Emite factura automat” bifat, factura se emite singură (la ramburs imediat, la card după ce plata e confirmată). Clienta primește în e-mailul de confirmare un buton **Descarcă factura**.
- **Vânzare în salon**: aici nu se emite factură. Documentul fiscal este **bonul de la casa de marcat** (vezi „Bon fiscal din aplicație” mai jos). Cât timp opțiunea e oprită, pagina are un link direct spre bonul fiscal din SmartBill.
- **WhatsApp**: lângă factura fiecărei comenzi de pe site apare **Trimite factura pe WhatsApp**. Se deschide WhatsApp cu mesajul gata scris și linkul facturii; apeși doar „Trimite”.
- Linkul facturii (`/factura/….pdf`) este privat: îl are doar cine primește mesajul și nu apare în Google.

## Plata cu cardul (EuPlătesc), Apple Pay și Google Pay
1. Din contul de comerciant EuPlătesc (manager.euplatesc.ro) copiezi **Merchant ID-ul (MID)** și **cheia (KEY)**.
2. În panou: **Plăți card & e-mail**. Completezi MID-ul și cheia, bifezi **„Clienții pot plăti cu cardul pe site”** și apeși **„Salvează”**.
3. Apeși **„Fă o plată de test (1 leu)”**: dacă se deschide formularul de plată EuPlătesc, datele sunt corecte.
4. În coș, clientul alege **Card online** sau **Ramburs**. La card este dus pe pagina securizată EuPlătesc; acolo apar și **Apple Pay** și **Google Pay**, dacă sunt activate pe contul tău EuPlătesc (se cer de la EuPlătesc). După activare bifezi căsuța „Apple Pay și Google Pay sunt active”.
5. Comanda plătită apare la **Comenzi** ca „card · plătită ✓” și intră la **Colete**. O comandă cu cardul rămasă neplătită nu se pregătește și se anulează singură după câteva ore (stocul se pune înapoi).
6. În contul EuPlătesc poți trece și **Silent URL** (adresa este afișată în panou); site-ul o trimite oricum la fiecare plată.

## E-mailuri automate
1. În panou: **Plăți card & e-mail → E-mailuri automate**. Completezi serverul SMTP, portul, utilizatorul și parola adresei de e-mail a salonului (le afli de la firma unde ai adresa de e-mail).
2. Apeși **„Trimite un e-mail de test”**.
3. Site-ul trimite singur: confirmarea comenzii către client, „coletul a plecat” cu numărul AWB și un anunț către salon la fiecare comandă sau fișă nouă.

## Punerea online pe Render.com (recomandat)
1. Îți faci cont pe **render.com** cu **„Sign in with GitHub”**, folosind același cont GitHub unde este proiectul.
2. **New → Blueprint**, alegi repository-ul **Florin-rosca** și apeși **Apply**.
3. Render îți cere **ADMIN_PASSWORD**: scrii parola dorită pentru panou (minim 8 caractere).
4. Plata: planul Starter, cu disc de 1 GB pentru date, costă câțiva dolari pe lună.
5. Site-ul pornește la o adresă de forma `https://florin-rosca.onrender.com`, iar panoul la `/admin/`.
6. Domeniul florinrosca.ro se leagă la final, din Render → Settings → Custom Domain, de către cel care administrează domeniul.

## Pornire (pentru cel care găzduiește site-ul)
Pentru panou e nevoie de un hosting cu **Node.js 20+**. Merge Render, Railway, Fly.io, un VPS sau orice hosting cu Node.

```bash
ADMIN_PASSWORD="parola-de-start" DATA_DIR=/cale/persistenta node server/server.js
```

- `PORT`: portul (implicit 3000).
- `DATA_DIR`: dosarul unde se salvează produsele, comenzile, setările și pozele încărcate. **Trebuie să fie persistent.**
- `ADMIN_PASSWORD`: parola la prima pornire (opțională; dacă lipsește, panoul cere alegerea unei parole la prima intrare).
- Cu Docker: `docker build -t florin-rosca . && docker run -p 3000:3000 -v florin-data:/data florin-rosca`.

Site-ul trebuie servit prin **HTTPS** (certificat SSL), ca parola și token-ul să fie protejate.
Pe hosting-ul static de test (GitHub Pages) panoul nu funcționează, iar magazinul rămâne cu produsele fixe.
