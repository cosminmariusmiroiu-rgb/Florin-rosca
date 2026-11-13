# Florin Roșca · Luxury Hair

Site de prezentare premium (negru mat + auriu) cu animații 3D:

- **Hero**: monedă de aur 3D cu logo-ul (WebGL / Three.js), foarfecă de aur 3D care se rotește și taie, fire de păr aurii și praf auriu
- **Servicii**: carduri 3D care se înclină după mouse, iconițe plutitoare, inel 3D cu serviciile
- **Contact**: buton auriu care pulsează și formular de programare care trimite mesajul direct pe WhatsApp
- Scroll nativ (fără inerție și fără secțiuni blocate); animațiile apar când ajungi la ele

Site static, fără build: deschide `index.html` sau pornește un server local:

```bash
python3 -m http.server 8000
```

Structură: `index.html`, `css/style.css`, `js/scene.js` (3D), `js/main.js` (animații), `assets/` (imagini + librării GSAP și Three.js incluse local).
