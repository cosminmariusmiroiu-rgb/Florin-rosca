# Predare către cel care găzduiește domeniul florinrosca.ro

Salut! Acesta este noul site al salonului **Florin Roșca Luxury Hair**: site, magazin, fișă de consultație și panou de administrare care se poate instala ca aplicație pe telefon.
Mai jos găsești tot ce trebuie ca să-l urci pe hosting.

## 1. Ce este proiectul
- **Cod sursă:** GitHub `cosminmariusmiroiu-rgb/Florin-rosca`, branch-ul `claude/cloud-env-setup-script-5c0kvu`. Codul este și în arhiva ZIP atașată.
- **Tehnologie:** **Node.js 20+**, **fără dependențe npm** (nu e nevoie de `npm install`) și fără bază de date. Datele se țin în fișiere JSON, într-un folder de date.
- **Pornire:** `node server/server.js`. Serverul servește și site-ul static, și API-ul.
- **Atenție:** site-ul actual de pe domeniu este **WordPress + WooCommerce (Hostinger)**. Noul site îl **înlocuiește**.

## 2. Cerințe de hosting
| Ce | Valoare |
|---|---|
| Runtime | Node.js **20 sau mai nou** (testat pe 22) |
| Comandă de pornire | `node server/server.js` (sau `npm start`) |
| Build | nu are |
| Port | variabila `PORT` (implicit 3000) |
| Proces | permanent, cu repornire automată (pm2 / systemd / managerul de aplicații Node al hostingului) |
| Folder de date | **persistent**, care NU se șterge la redeploy (implicit 1 GB ajunge) |
| HTTPS | **obligatoriu** (SSL, de ex. Let's Encrypt). Panoul și aplicația de telefon nu merg corect fără HTTPS |
| Ieșire internet | serverul trebuie să poată face cereri HTTPS către `ws.smartbill.ro` (facturi și stoc), `api.sameday.ro` (AWB), `secure.euplatesc.ro` (plata cu cardul) și să trimită e-mail prin SMTP (porturile 465 sau 587) |

## 3. Variabile de mediu
| Variabilă | Ce pui | Obligatoriu |
|---|---|---|
| `DATA_DIR` | calea absolută a folderului persistent de date, de ex. `/home/USER/florin-data` | **da** |
| `ADMIN_PASSWORD` | parola de start a panoului (minim 8 caractere). Se poate schimba din panou | **da** (altfel primul care intră pe `/admin/` alege parola) |
| `SESSION_SECRET` | un șir aleator lung (de ex. `openssl rand -hex 32`) | recomandat |
| `PORT` | portul pe care ascultă serverul, dacă hostingul îl cere | după caz |
| `PUBLIC_URL` | adresa publică a site-ului, de ex. `https://florinrosca.ro`. O folosesc plata cu cardul (EuPlatesc, pentru întoarcerea clientului și confirmarea plății) și linkurile din e-mailuri | **da**, după ce e legat domeniul |

**Nu se pun** în variabile token-ul SmartBill, datele Sameday, cheia EuPlatesc sau parola de e-mail. Le introduce Florin din panou și se salvează criptat în folderul de date (`secrets.json`, care nu se trimite niciodată către browser).

## 4. Variante de instalare

### A. Hostinger cu „Node.js Web App” (planurile Business / Cloud)
1. hPanel → **Websites** → **Add website** → **Node.js Apps** (sau „Deploy Node.js app”).
2. Sursa: **GitHub**, repository-ul `Florin-rosca` și branch-ul de mai sus. Varianta cealaltă: încarci arhiva ZIP.
3. Entry file: `server/server.js`. Node: 20 sau 22. Build command: gol.
4. Pui variabilele de la punctul 3. Pentru `DATA_DIR` alegi un folder din afara folderului aplicației, ca să nu se șteargă la redeploy.
5. Activezi SSL și legi domeniul (vezi punctul 5).
> Dacă planul nu are opțiunea Node.js (de ex. Premium sau Single), e nevoie de varianta B sau C.

### B. VPS (Hostinger KVM sau orice VPS Linux)
```bash
# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs nginx
git clone -b claude/cloud-env-setup-script-5c0kvu https://github.com/cosminmariusmiroiu-rgb/Florin-rosca.git /opt/florin
sudo mkdir -p /var/florin-data
```
Serviciu systemd `/etc/systemd/system/florin.service`:
```ini
[Unit]
Description=Florin Rosca site
After=network.target
[Service]
WorkingDirectory=/opt/florin
ExecStart=/usr/bin/node server/server.js
Environment=PORT=3000
Environment=DATA_DIR=/var/florin-data
Environment=ADMIN_PASSWORD=SCHIMBA-MA
Environment=SESSION_SECRET=SCHIMBA-MA-CU-UN-SIR-LUNG
Restart=always
[Install]
WantedBy=multi-user.target
```
`sudo systemctl enable --now florin`

Nginx (reverse proxy), apoi `certbot --nginx -d florinrosca.ro -d www.florinrosca.ro`:
```nginx
server {
  server_name florinrosca.ro www.florinrosca.ro;
  client_max_body_size 25m;            # pozele din fișa de consultație
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```
Actualizare: `cd /opt/florin && git pull && sudo systemctl restart florin`.

### C. Render.com (fără server propriu)
Proiectul are deja `render.yaml`: în Render faci **New → Blueprint** și alegi repo-ul, apoi completezi `ADMIN_PASSWORD`. Pentru domeniu adaugi în DNS:
- `www` → **CNAME** către adresa `….onrender.com` primită;
- domeniul principal → înregistrarea **A / ALIAS** pe care o afișează Render la **Settings → Custom Domains**.

## 5. Domeniul și nameserverele (DNS)
**Pentru domeniul `.ro`, nameserverele se schimbă la registrar (ROTLD / firma prin care a fost cumpărat domeniul) de către cel care administrează domeniul.**

**Varianta A sau B – la Hostinger (shared cu Node.js sau VPS):**
- Domeniul pare să fie deja pe Hostinger, iar site-ul vechi rulează acolo. Dacă e așa, nameserverele nu trebuie schimbate.
- Dacă trebuie puse, nameserverele standard Hostinger sunt `ns1.dns-parking.com` și `ns2.dns-parking.com`. **Se confirmă în hPanel → Domains → DNS / Nameservers**, pentru că pot diferi.
- Pe VPS: înregistrarea **A** pentru `@` și `www` → IP-ul VPS-ului.

**Varianta C – pe Render:**
- **Nameserverele rămân cum sunt.** Nu se schimbă, ca să nu se strice e-mailul sau alte servicii de pe domeniu.
- În zona DNS se adaugă:
  - `www` → **CNAME** → `florin-rosca.onrender.com` (adresa exactă apare în Render);
  - `@` (domeniul principal) → **A** → `216.24.57.1`. **Se verifică valoarea exactă în Render → Settings → Custom Domains**, unde Render o afișează.
- **Înregistrările MX pentru e-mail nu se ating.**

### Mutarea propriu-zisă
- Recomandare: **testați întâi pe un subdomeniu**, de ex. `nou.florinrosca.ro`, și abia după ce Florin confirmă că totul e bine mutați domeniul principal.
- **Înainte de mutare: backup complet al site-ului WordPress actual** (fișiere + bază de date). Comenzile și clienții vechi din WooCommerce rămân acolo.
- Linkurile de pe site către `florinrosca.ro/termeni-si-conditii/`, `/politica-de-confidentialitate/` și `/livrare-si-retur/` vin acum de pe site-ul vechi. Aceste pagini trebuie păstrate (sau mutate) ca să nu dea eroare 404.

## 5b. Plata cu cardul (EuPlatesc)
- În contul EuPlatesc, adresa de confirmare a plății (IPN / „URL de notificare”) și adresele de întoarcere trebuie să fie pe domeniul final. Le arată panoul la **Plăți card & e-mail**, după ce e setat `PUBLIC_URL`.

## 6. Verificare după instalare
- `https://DOMENIU/` → site-ul se deschide, cu videoclipul și butonul „Intră în salon ♪”
- `https://DOMENIU/api/shop` → răspunde cu JSON
- `https://DOMENIU/admin/` → logare cu parola din `ADMIN_PASSWORD`
- `https://DOMENIU/magazin.html` → produsele au butonul „Adaugă în coș”
- `https://DOMENIU/data/...` și `https://DOMENIU/server/...` → trebuie să dea **404** (sunt protejate)

## 7. Backup
Tot ce contează se află în folderul `DATA_DIR`: produse, stoc, vânzări, comenzi, fișe cliente, poze și setări. Ajunge un backup zilnic al acestui folder.

## 8. Ce urmează după ce e online
Florin intră în panou și, din panou:
- conectează **SmartBill** (Setări → SmartBill: e-mail, CIF, token API);
- conectează **Sameday** (Colete → Setări curier: utilizator și parolă API);
- instalează **aplicația** pe telefon (Safari → Partajare → „Adaugă pe ecranul principal” / Chrome → „Instalează aplicația”).

Detalii despre panou: vezi `ADMIN.md`.
