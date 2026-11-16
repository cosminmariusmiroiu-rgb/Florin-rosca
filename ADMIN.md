# Panoul de administrare – Florin Roșca

Panoul se deschide la adresa **/admin/** a site-ului (de ex. `https://florinrosca.ro/admin/`).

## Ce poți face
- **Acasă**: comenzi noi, vânzări pe 30 de zile, produse cu stoc mic, starea legăturii cu SmartBill.
- **Comenzi**: vezi fiecare comandă, schimbi statusul (Nouă → Confirmată → Expediată → Livrată), treci AWB-ul, emiți factura în SmartBill cu un clic și o deschizi în PDF.
- **Produse & stoc**: modifici nume, preț, preț tăiat, poză, descriere, ascunzi sau adaugi produse și schimbi ordinea lor.
- **Texte site**: modifici textele principale de pe site (descrierea de sus, program, adresă, titluri).
- **SmartBill**: conectezi contul. Stocul se sincronizează automat, iar factura se emite manual sau automat la fiecare comandă.
- **Magazin & cont**: oprești sau pornești comenzile online, setezi costul livrării și pragul de livrare gratuită, schimbi parola.

## Conectarea SmartBill
1. În SmartBill intri la **Contul meu → Integrări → API** și copiezi **token-ul**.
2. În panou, la **SmartBill**, completezi e-mailul contului SmartBill, CIF-ul firmei, token-ul și seria facturilor.
3. Apeși **Testează conexiunea**.
4. La fiecare produs completezi **Codul produsului din SmartBill** (exact ca în nomenclatorul SmartBill), ca stocul să se potrivească.

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
