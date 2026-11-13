/* =========================================================
   Florin Roșca — WebGL stage (Three.js)
   - 3D gold coin carrying the logo (follows the hero medal slot)
   - 3D gold scissors orbiting the coin and snipping
   - flowing gold "hair strands" + drifting gold dust
   ========================================================= */
(function () {
  'use strict';

  const canvas = document.getElementById('stage');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isSmall = window.matchMedia('(max-width: 860px)').matches;

  const Stage = { ready: false, intro() {}, setProgress() {} };
  window.Stage = Stage;

  if (!window.THREE || !canvas) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    return; // no WebGL: the DOM logo stays visible
  }
  document.documentElement.classList.add('webgl');

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmall ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 20);

  /* ---------- Environment for metallic reflections ---------- */
  (function buildEnv() {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = new THREE.Scene();
    const skyGeo = new THREE.SphereGeometry(20, 32, 16);
    const cols = [];
    const p = skyGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 20; // -1..1
      const c = new THREE.Color().setRGB(0.05, 0.035, 0.02).lerp(new THREE.Color(0.55, 0.42, 0.22), Math.max(0, y) * 0.9);
      cols.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    env.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const panel = (w, h, x, y, z, k, tint) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    };
    panel(10, 4, -8, 9, 8, 6, 0xfff1d6);
    panel(4, 12, 12, 0, 4, 4, 0xffe2a8);
    panel(14, 2, 0, -8, -10, 2.5, 0xffd38a);
    panel(6, 6, -6, -2, -14, 1.5, 0xffffff);
    scene.environment = pmrem.fromScene(env, 0.035).texture;
    pmrem.dispose();
  })();

  scene.add(new THREE.AmbientLight(0xffffff, 0.15));
  const key = new THREE.DirectionalLight(0xffe7c2, 1.6); key.position.set(-6, 8, 10); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffc56b, 1.2); rim.position.set(8, -3, -6); scene.add(rim);
  const mouseLight = new THREE.PointLight(0xfff0cf, 2.2, 30, 1.6); mouseLight.position.set(0, 0, 8); scene.add(mouseLight);

  /* ---------- Materials ---------- */
  const gold = new THREE.MeshStandardMaterial({ color: 0xe2b457, metalness: 1, roughness: 0.2, envMapIntensity: 1.35 });
  const goldSatin = new THREE.MeshStandardMaterial({ color: 0xc9973c, metalness: 1, roughness: 0.38, envMapIntensity: 1.1 });
  const goldBright = new THREE.MeshStandardMaterial({ color: 0xffe6a6, metalness: 1, roughness: 0.12, envMapIntensity: 1.6 });

  /* ---------- 3D animated logo (hands + hair + script) ---------- */
  // plane height = 2 world units (scaled by the hero slot); image aspect 1192 x 1320
  const LOGO_AR = 1192 / 1320;
  const coin = new THREE.Group();
  const coinSpin = new THREE.Group();
  coin.add(coinSpin);
  scene.add(coin);
  const logoUni = {
    map: { value: null }, uTime: { value: 0 }, uIntro: { value: 0 }, uWrite: { value: 0 }, uReady: { value: 0 }
  };
  const logoMat = new THREE.ShaderMaterial({
    uniforms: logoUni, transparent: true, depthWrite: true,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D map; uniform float uTime, uIntro, uWrite, uReady;
      varying vec2 vUv;
      void main(){
        vec4 c = texture2D(map, vUv);
        // script lettering (bottom third) is written left -> right; the rest reveals from the hair tip down
        float isText = 1.0 - smoothstep(0.31, 0.335, vUv.y);
        float write = 1.0 - smoothstep(uWrite - 0.05, uWrite, vUv.x);
        float drop = clamp(uIntro * 1.7 - (1.0 - vUv.y) * 0.7, 0.0, 1.0);
        float a = c.a * mix(drop, write, isText) * uReady;
        if (a < 0.03) discard;
        vec3 col = c.rgb;
        // travelling light sweep across the gold
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        float band = mod(uTime * 0.22, 2.6) - 0.4;
        float sweep = smoothstep(0.09, 0.0, abs(vUv.x * 0.8 + (1.0 - vUv.y) * 0.6 - band));
        // the writing pen tip glows
        float pen = smoothstep(0.03, 0.0, abs(vUv.x - uWrite)) * isText * step(uWrite, 0.999);
        col += pen * vec3(1.0, 0.8, 0.4) * 0.9;
        gl_FragColor = vec4(col, a);
      }`
  });
  const logoPlane = new THREE.Mesh(new THREE.PlaneGeometry(2 * LOGO_AR, 2), logoMat);
  coinSpin.add(logoPlane);
  new THREE.TextureLoader().load('assets/img/logo-3d.webp', (tex) => {
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    logoUni.map.value = tex; logoUni.uReady.value = 1;
  });

  // ring of the logo, in plane units
  const ringC = new THREE.Vector3(0, (0.5 - 0.362) * 2, 0);
  const ringR = 0.411 * 2 * LOGO_AR;

  // soft gold glow behind
  function radialTex(stops) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({
    map: radialTex([[0, 'rgba(212,169,69,0.55)'], [0.45, 'rgba(212,169,69,0.12)'], [1, 'rgba(0,0,0,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  glow.position.set(ringC.x, ringC.y, -0.6);

  // two 3D gold rings spinning like a gyroscope around the logo circle
  const gyro = new THREE.Group(); gyro.position.copy(ringC); coinSpin.add(gyro);
  const gyroA = new THREE.Mesh(new THREE.TorusGeometry(ringR * 1.16, 0.014, 12, 180), goldBright);
  const gyroB = new THREE.Mesh(new THREE.TorusGeometry(ringR * 1.28, 0.009, 10, 180), gold);
  gyro.add(gyroA, gyroB);
  const beads = [];
  for (let i = 0; i < 3; i++) {
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), goldBright);
    gyroA.add(bead); beads.push(bead);
  }

  // star flare that travels along the logo ring (like the sparkle in the logo)
  function flareTex() {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 60);
    gr.addColorStop(0, 'rgba(255,250,230,1)'); gr.addColorStop(0.2, 'rgba(255,220,150,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.globalCompositeOperation = 'lighter';
    [[256, 6], [6, 256], [120, 3]].forEach(([w, h], i) => {
      const lg = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      lg.addColorStop(0, 'rgba(255,240,200,0.95)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
      g.save(); g.translate(128, 128); g.rotate(i === 2 ? Math.PI / 4 : 0); g.fillStyle = lg; g.fillRect(-w / 2, -h / 2, w, h); g.restore();
    });
    return new THREE.CanvasTexture(c);
  }
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  flare.scale.setScalar(0.55);
  coinSpin.add(flare);

  /* ---------- Scissors ---------- */
  function makeHalf(s) {
    const g = new THREE.Group();
    const blade = new THREE.Shape();
    blade.moveTo(-0.28, 0);
    blade.lineTo(2.75, 0);
    blade.quadraticCurveTo(1.6, 0.13 * s, 0.25, 0.19 * s);
    blade.lineTo(-0.28, 0.15 * s);
    blade.lineTo(-0.28, 0);
    const bladeGeo = new THREE.ExtrudeGeometry(blade, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 3, curveSegments: 24 });
    bladeGeo.translate(0, 0, -0.03);
    g.add(new THREE.Mesh(bladeGeo, gold));

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.15, 0.06 * s, 0),
      new THREE.Vector3(-0.6, -0.2 * s, 0),
      new THREE.Vector3(-1.05, -0.45 * s, 0),
      new THREE.Vector3(-1.2, -0.56 * s, 0)
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.075, 14, false), gold));

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.078, 20, 64), gold);
    ring.scale.set(1.25, 1, 1);
    ring.position.set(-1.62, -0.66 * s, 0);
    g.add(ring);
    if (s > 0) { // finger tang
      const tang = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.75, -1.0, 0), new THREE.Vector3(-1.95, -1.3, 0), new THREE.Vector3(-1.7, -1.5, 0)]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(tang, 16, 0.05, 10, false), gold));
    }
    g.position.z = 0.07 * s;
    return g;
  }
  const scissors = new THREE.Group();
  const halfA = makeHalf(1), halfB = makeHalf(-1);
  scissors.add(halfA, halfB);
  const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.34, 32), goldBright);
  screw.rotation.x = Math.PI / 2; scissors.add(screw);
  const scissorsWrap = new THREE.Group();
  scissorsWrap.add(scissors);
  scene.add(scissorsWrap);

  /* ---------- Ritual: exploded 3D stack of salon objects ---------- */
  const lacquer = new THREE.MeshStandardMaterial({ color: 0x0d0c0b, metalness: 0.55, roughness: 0.18, envMapIntensity: 1.2 });
  const dyeMat = new THREE.MeshStandardMaterial({ color: 0x7a4a16, metalness: 0.6, roughness: 0.22, emissive: 0x2a1404, emissiveIntensity: 0.5 });
  const bristleMat = new THREE.MeshStandardMaterial({ color: 0x1a1714, metalness: 0.1, roughness: 0.7 });

  function makeComb() {
    const g = new THREE.Group();
    const spine = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.12, 0.34), gold);
    g.add(spine);
    for (let i = 0; i < 24; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.07, i < 8 ? 0.7 : 0.55), goldSatin);
      tooth.position.set(-1.08 + i * 0.094, 0, 0.17 + (i < 8 ? 0.35 : 0.27));
      g.add(tooth);
    }
    g.position.z = -0.3;
    const w = new THREE.Group(); w.add(g); return w;
  }
  function makeBowl() {
    const g = new THREE.Group();
    const prof = [];
    for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI / 2; prof.push(new THREE.Vector2(0.15 + Math.sin(a) * 0.95, -Math.cos(a) * 0.55)); }
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(prof, 64), lacquer);
    bowl.material.side = THREE.DoubleSide;
    g.add(bowl);
    const rimT = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.045, 12, 96), gold); rimT.rotation.x = Math.PI / 2; g.add(rimT);
    const dye = new THREE.Mesh(new THREE.CircleGeometry(1.0, 64), dyeMat); dye.rotation.x = -Math.PI / 2; dye.position.y = -0.12; g.add(dye);
    const brush = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 1.9, 16), gold); handle.position.y = 0.95; brush.add(handle);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.09), goldBright); brush.add(head);
    const bristles = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.07), bristleMat); bristles.position.y = -0.2; brush.add(bristles);
    brush.position.set(0.35, 0.05, 0.1); brush.rotation.z = -0.95; g.add(brush);
    return g;
  }
  function makeBottle() {
    const g = new THREE.Group();
    const prof = [new THREE.Vector2(0, -0.8), new THREE.Vector2(0.36, -0.8), new THREE.Vector2(0.4, -0.74), new THREE.Vector2(0.4, 0.4), new THREE.Vector2(0.34, 0.56), new THREE.Vector2(0.16, 0.66), new THREE.Vector2(0.14, 0.78), new THREE.Vector2(0, 0.78)];
    g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 48), lacquer));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.36, 32), gold); cap.position.y = 0.94; g.add(cap);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.405, 0.405, 0.5, 48, 1, true), goldSatin); band.position.y = -0.15; g.add(band);
    const line1 = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.012, 8, 64), goldBright); line1.rotation.x = Math.PI / 2; line1.position.y = 0.1; g.add(line1);
    const line2 = line1.clone(); line2.position.y = -0.4; g.add(line2);
    g.rotation.z = Math.PI / 2;
    const w = new THREE.Group(); w.add(g); return w;
  }
  function makeCrown() {
    const g = new THREE.Group();
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.85, 0.42, 64, 1, true), gold);
    band.material = gold.clone(); band.material.side = THREE.DoubleSide; g.add(band);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.05, 12, 96), goldBright); lip.rotation.x = Math.PI / 2; lip.position.y = -0.21; g.add(lip);
    const lipT = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.04, 12, 96), goldBright); lipT.rotation.x = Math.PI / 2; lipT.position.y = 0.21; g.add(lipT);
    const N = 8;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const tall = i % 2 === 0;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, tall ? 0.75 : 0.45, 4), gold);
      spike.position.set(Math.cos(a) * 0.93, 0.21 + (tall ? 0.375 : 0.225), Math.sin(a) * 0.93);
      spike.rotation.y = -a;
      g.add(spike);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(tall ? 0.085 : 0.06, 16, 12), goldBright);
      ball.position.set(Math.cos(a) * 0.93, 0.21 + (tall ? 0.8 : 0.48), Math.sin(a) * 0.93);
      g.add(ball);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), lacquer);
      gem.position.set(Math.cos(a + Math.PI / N) * 0.92, 0, Math.sin(a + Math.PI / N) * 0.92);
      g.add(gem);
    }
    return g;
  }
  function makeFlatScissors() {
    const w = new THREE.Group();
    const s = new THREE.Group();
    const a = makeHalf(1), b = makeHalf(-1);
    s.add(a, b);
    const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.34, 32), goldBright); sc.rotation.x = Math.PI / 2; s.add(sc);
    s.scale.setScalar(0.5); s.position.x = -0.18;
    s.rotation.x = -Math.PI / 2; // lie flat
    w.add(s);
    w.userData.halves = [a, b];
    return w;
  }

  const ritualEl = document.querySelector('.ritual');
  const ritualStage = document.querySelector('.ritual__stage');
  const ritualLabels = Array.from(document.querySelectorAll('.ritual__label'));
  const ritualNum = document.querySelector('.ritual__num');
  const ritualBar = document.querySelector('.ritual__bar i');
  const ritual = new THREE.Group();
  const layers = [makeComb(), makeBowl(), makeFlatScissors(), makeBottle(), makeCrown()]; // bottom → top
  layers.forEach((l) => ritual.add(l));
  ritual.visible = false;
  scene.add(ritual);
  const tmpV = new THREE.Vector3();
  let ritualStart = -1;

  /* ---------- Gold hair strands ---------- */
  const STRANDS = isSmall ? 16 : 30;
  const PTS = isSmall ? 90 : 140;
  const strands = [];
  const strandGroup = new THREE.Group();
  scene.add(strandGroup);
  for (let i = 0; i < STRANDS; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PTS * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(PTS * 3), 3));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    strandGroup.add(line);
    strands.push({
      line, phase: Math.random() * Math.PI * 2, amp: 0.35 + Math.random() * 0.9, freq: 1.6 + Math.random() * 1.6,
      speed: 0.25 + Math.random() * 0.35, off: (i / STRANDS - 0.5) * 1.6, z: -5 + Math.random() * 3,
      bright: 0.15 + Math.random() * 0.5, tint: Math.random()
    });
  }


  /* ---------- Blond hair locks (balayage: caramel roots -> platinum ends) ---------- */
  // Each lock = hundreds of strands drawn as one LineSegments; they sway on their own (time-driven).
  const PALETTE = [[0.98, 0.93, 0.80], [0.95, 0.84, 0.60], [0.90, 0.74, 0.46], [1.0, 0.97, 0.90], [0.86, 0.66, 0.38]];
  function makeLock(o) {
    const N = o.count, P = o.points;
    const pos = new Float32Array(N * (P - 1) * 2 * 3);
    const col = new Float32Array(N * (P - 1) * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
    const mesh = new THREE.LineSegments(geo, mat);
    mesh.frustumCulled = false;
    const strands = [];
    for (let k = 0; k < N; k++) {
      const a = (Math.random() * 2 - 1), d = (Math.random() * 2 - 1);
      strands.push({
        a: Math.sign(a) * Math.pow(Math.abs(a), 0.8), d, len: 0.78 + Math.random() * 0.22,
        c: PALETTE[(Math.random() * PALETTE.length) | 0], shade: 0.6 + Math.random() * 0.45, ph: Math.random() * 6.28
      });
    }
    scene.add(mesh);
    return Object.assign({ mesh, geo, strands, N, P, cur: 0 }, o);
  }
  const locks = isSmall
    ? [makeLock({ count: 170, points: 56, side: 1, top: 1.08, length: 1.25, width: 0.42, phase: 0.0 })]
    : [
        makeLock({ count: 300, points: 72, side: 1, top: 1.08, length: 1.3, width: 0.55, phase: 0.0 }),
        makeLock({ count: 240, points: 64, side: -1, top: 1.1, length: 1.05, width: 0.45, phase: 2.1 })
      ];

  function updateLock(L, t, targetOpacity, dt) {
    const H = state.viewH, W = state.viewW, sc = H / 10.7;
    const len = H * L.length, wid = L.width * sc * 2.2;
    const bx = L.side * (W * 0.5 - (isSmall ? 0.1 : 0.35) * sc);
    const by = H * (L.top - 0.5) + H * 0.5 * 0.0;
    const pos = L.geo.attributes.position.array, col = L.geo.attributes.color.array;
    let vi = 0;
    const tt = t * 0.55 + L.phase;
    // centre line + twist computed once per sample
    const P = L.P, cxA = new Float32Array(P), cyA = new Float32Array(P), czA = new Float32Array(P), thA = new Float32Array(P), wA = new Float32Array(P);
    for (let j = 0; j < P; j++) {
      const u = j / (P - 1);
      cxA[j] = bx - L.side * ((0.5 + 0.5 * Math.sin(u * Math.PI * 2.2 + tt)) * (isSmall ? 0.45 : 0.9) * sc * (0.25 + u) + Math.sin(u * 7 + tt * 1.3) * 0.08 * sc);
      cyA[j] = by - u * len;
      czA[j] = -2.5 + Math.cos(u * 2.4 + tt * 0.8) * 0.6;
      thA[j] = u * 5.2 + Math.sin(tt * 0.7) * 0.6 + L.phase;
      wA[j] = wid * (1 - 0.8 * Math.pow(u, 1.4)) * (0.75 + 0.25 * Math.sin(u * 3.1 + 0.6));
    }
    for (let k = 0; k < L.N; k++) {
      const st = L.strands[k];
      const jMax = Math.max(2, Math.floor(st.len * (P - 1)));
      let px = 0, py = 0, pz = 0, pr = 0, pg = 0, pb = 0;
      for (let j = 0; j < P; j++) {
        const u = j / (P - 1);
        const th = thA[j], w = wA[j];
        const lat = st.a * w, dep = st.d * w * 0.35;
        const wav = Math.sin(u * 14 + st.ph + tt * 1.6) * 0.025 * sc * u;
        const x = cxA[j] + Math.cos(th) * lat + wav;
        const y = cyA[j] + Math.sin(th * 0.5) * dep * 0.4;
        const z = czA[j] + Math.sin(th) * lat + dep;
        // balayage colour: caramel root -> blond -> platinum ends, glossy band
        const m = Math.min(1, u * 1.6);
        const root = [0.42, 0.27, 0.13];
        const gloss = Math.pow(Math.max(0, Math.sin(u * 9 - tt * 1.2 + st.a * 1.5)), 12) * 0.5;
        const tipFade = j > jMax ? 0 : (1 - Math.pow(j / jMax, 6));
        const r = (root[0] + (st.c[0] - root[0]) * m) * st.shade + gloss;
        const g = (root[1] + (st.c[1] - root[1]) * m) * st.shade + gloss;
        const b = (root[2] + (st.c[2] - root[2]) * m) * st.shade + gloss * 0.8;
        const f = tipFade * Math.min(1, u * 8 + 0.15);
        if (j > 0) {
          pos[vi] = px; pos[vi + 1] = py; pos[vi + 2] = pz;
          col[vi] = pr; col[vi + 1] = pg; col[vi + 2] = pb;
          pos[vi + 3] = x; pos[vi + 4] = y; pos[vi + 5] = z;
          col[vi + 3] = r * f; col[vi + 4] = g * f; col[vi + 5] = b * f;
          vi += 6;
        }
        px = x; py = y; pz = z; pr = r * f; pg = g * f; pb = b * f;
      }
    }
    L.geo.attributes.position.needsUpdate = true;
    L.geo.attributes.color.needsUpdate = true;
    L.cur += (targetOpacity - L.cur) * Math.min(1, dt * 1.2);
    L.mesh.material.opacity = L.cur;
  }

  /* ---------- Gold dust ---------- */
  const DUST = isSmall ? 380 : 900;
  const dGeo = new THREE.BufferGeometry();
  const dPos = new Float32Array(DUST * 3), dSize = new Float32Array(DUST), dPhase = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    dPos[i * 3] = (Math.random() - 0.5) * 30;
    dPos[i * 3 + 1] = (Math.random() - 0.5) * 18;
    dPos[i * 3 + 2] = -10 + Math.random() * 14;
    dSize[i] = 0.4 + Math.random() * 1.6;
    dPhase[i] = Math.random();
  }
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  dGeo.setAttribute('aSize', new THREE.BufferAttribute(dSize, 1));
  dGeo.setAttribute('aPhase', new THREE.BufferAttribute(dPhase, 1));
  const dMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPix: { value: renderer.getPixelRatio() }, uScroll: { value: 0 }, uAlpha: { value: 0 } },
    vertexShader: `
      attribute float aSize; attribute float aPhase;
      uniform float uTime; uniform float uPix; uniform float uScroll;
      varying float vTw;
      void main(){
        vec3 p = position;
        float depth = (p.z + 10.0) / 14.0;
        p.y = mod(p.y + 9.0 + uTime * (0.08 + aPhase * 0.12) + uScroll * (0.4 + depth * 1.2), 18.0) - 9.0;
        p.x += sin(uTime * 0.35 + aPhase * 6.2831) * 0.35;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSize * uPix * (26.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
        vTw = 0.45 + 0.55 * sin(uTime * (1.2 + aPhase * 2.0) + aPhase * 40.0);
      }`,
    fragmentShader: `
      uniform float uAlpha; varying float vTw;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        a = a * a * vTw * uAlpha;
        gl_FragColor = vec4(vec3(1.0, 0.78, 0.38) * a, a);
      }`
  });
  const dust = new THREE.Points(dGeo, dMat);
  dust.frustumCulled = false;
  scene.add(dust);

  /* ---------- State ---------- */
  const state = {
    w: 1, h: 1, viewH: 1, viewW: 1,
    mx: 0, my: 0, tmx: 0, tmy: 0,
    intro: 0,          // 0..1 intro progress (gsap-driven)
    strandsIn: 0,
    hero: 0,           // scroll progress through hero 0..1
    scroll: 0,
    dim: 1, coinR: 1, coinX: 0, coinY: 0, coinVisible: true
  };
  const medalEl = document.querySelector('.medal');

  function resize() {
    state.w = window.innerWidth; state.h = window.innerHeight;
    renderer.setSize(state.w, state.h, false);
    camera.aspect = state.w / state.h;
    camera.updateProjectionMatrix();
    state.viewH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    state.viewW = state.viewH * camera.aspect;
    dMat.uniforms.uPix.value = renderer.getPixelRatio();
  }
  window.addEventListener('resize', resize);
  resize();

  window.addEventListener('pointermove', (e) => {
    state.tmx = (e.clientX / state.w) * 2 - 1;
    state.tmy = (e.clientY / state.h) * 2 - 1;
  }, { passive: true });

  function trackMedal() {
    if (!medalEl) return;
    const r = medalEl.getBoundingClientRect();
    const k = state.viewH / state.h;
    state.coinR = (r.width / 2) * k;
    state.coinX = ((r.left + r.width / 2) / state.w - 0.5) * state.viewW;
    state.coinY = -((r.top + r.height / 2) / state.h - 0.5) * state.viewH;
    state.coinVisible = r.bottom > -r.height * 0.6 && r.top < state.h + r.height * 0.6;
  }

  /* ---------- Loop ---------- */
  const clock = new THREE.Clock();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const snip = (t) => { const x = (t % 1); return x < 0.18 ? ease(x / 0.18) : x < 0.42 ? 1 - ease((x - 0.18) / 0.24) : 0; };

  function updateStrands(t) {
    const W = state.viewW * 0.62;
    const baseY = -state.viewH * 0.3;
    const fade = state.strandsIn * state.dim;
    for (let i = 0; i < strands.length; i++) {
      const s = strands[i];
      const pos = s.line.geometry.attributes.position.array;
      const col = s.line.geometry.attributes.color.array;
      const tt = t * s.speed + s.phase;
      for (let j = 0; j < PTS; j++) {
        const u = j / (PTS - 1);
        const x = -W + u * W * 2;
        const sweep = Math.sin(u * Math.PI) * state.viewH * 0.18;
        const y = baseY + s.off + sweep * 0.6 + Math.sin(u * s.freq * Math.PI + tt) * s.amp * (0.4 + u * 0.8) + Math.sin(u * 7.0 + tt * 1.7) * 0.06;
        const z = s.z + Math.cos(u * 3 + tt) * 0.6;
        pos[j * 3] = x; pos[j * 3 + 1] = y; pos[j * 3 + 2] = z;
        const env = Math.pow(Math.sin(u * Math.PI), 1.6) * s.bright * fade;
        const glint = 0.7 + 0.3 * Math.sin(u * 20 - t * 2 + s.phase);
        col[j * 3] = (1.0) * env * glint;
        col[j * 3 + 1] = (0.8 + s.tint * 0.15) * env * glint;
        col[j * 3 + 2] = (0.5 + s.tint * 0.35) * env * glint;
      }
      s.line.geometry.attributes.position.needsUpdate = true;
      s.line.geometry.attributes.color.needsUpdate = true;
    }
  }


  function updateRitual(t) {
    if (!ritualEl || !ritualStage) return;
    const r = ritualEl.getBoundingClientRect();
    const inView = r.top < state.h && r.bottom > 0;
    ritual.visible = inView;
    if (!inView) { ritualStart = -1; return; }
    // time-driven loop (independent of scrolling): stack -> explode -> hold -> re-stack
    if (ritualStart < 0) ritualStart = t;
    const CYCLE = 11;
    const c = ((t - ritualStart) % CYCLE) / CYCLE;
    const p = c;
    const sr = ritualStage.getBoundingClientRect();
    const k = state.viewH / state.h;
    const cx = ((sr.left + sr.width / 2) / state.w - 0.5) * state.viewW;
    const cy = -((sr.top + sr.height / 2) / state.h - 0.5) * state.viewH;
    const ex = c < 0.1 ? 0 : c < 0.3 ? ease((c - 0.1) / 0.2) : c < 0.84 ? 1 : 1 - ease((c - 0.84) / 0.16);
    const e1 = Math.min(1, Math.max(0, (c - 0.1) / 0.32));
    const e2 = Math.min(1, Math.max(0, (c - 0.8) / 0.05));
    const gapMax = 1.3, gapMin = 0.36;
    const gap = gapMin + (gapMax - gapMin) * ex;
    const fitH = (sr.height * k) / (4 * gapMax + 2.8);
    const fitW = (sr.width * k) / 2.6;
    const S = Math.min(fitH, fitW);
    ritual.position.set(cx, cy - S * 0.25, 0);
    ritual.scale.setScalar(S);
    ritual.rotation.x = 0.42 - ex * 0.12;
    ritual.rotation.y = Math.sin(t * 0.35) * 0.6 + state.mx * 0.15;
    layers.forEach((l, i) => {
      const dir = i % 2 ? 1 : -1;
      l.position.y = (i - 2) * gap;
      l.rotation.y = dir * ex * 0.9 + Math.sin(t * 0.6 + i) * 0.04 * ex;
      l.rotation.z = dir * ex * 0.08;
      l.position.x = dir * ex * 0.12;
    });
    const sh = layers[2].userData.halves;
    if (sh) { const o = 0.05 + ex * 0.35 + (reduced ? 0 : snip(t * 0.5) * 0.15 * ex); sh[0].rotation.z = o; sh[1].rotation.z = -o; }

    // labels track their layer on screen
    ritual.updateMatrixWorld(true);
    let active = 0;
    const stickyTop = ritualStage.parentElement.getBoundingClientRect().top;
    ritualLabels.forEach((lab) => {
      const i = +lab.dataset.i;
      tmpV.set(0, 0, 0);
      layers[i].localToWorld(tmpV);
      tmpV.project(camera);
      const y = (-tmpV.y * 0.5 + 0.5) * state.h;
      const order = 4 - i; // top label first
      const o = Math.min(1, Math.max(0, (e1 - 0.25 - order * 0.13) / 0.12)) * (1 - ease(e2));
      if (o > 0.5) active = Math.max(active, order + 1);
      lab.style.top = (y - stickyTop) + 'px';
      lab.style.opacity = o.toFixed(3);
      lab.style.setProperty('--line', o.toFixed(3));
    });
    if (ritualNum) ritualNum.textContent = String(Math.max(1, active)).padStart(2, '0');
    if (ritualBar) ritualBar.style.transform = `scaleX(${p.toFixed(3)})`;
  }

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    state.mx += (state.tmx - state.mx) * Math.min(1, dt * 4);
    state.my += (state.tmy - state.my) * Math.min(1, dt * 4);
    state.scroll = window.scrollY || 0;
    state.hero = Math.min(1, state.scroll / Math.max(1, state.h));
    const dimTarget = ritual.visible ? 0.4 : (state.hero > 0.5 ? 0.3 : 1);
    state.dim += (dimTarget - state.dim) * Math.min(1, dt * 1.5);

    trackMedal();

    // camera drift
    camera.position.x = state.mx * 0.5;
    camera.position.y = -state.my * 0.35;
    camera.lookAt(0, 0, 0);
    mouseLight.position.set(state.mx * state.viewW * 0.5, -state.my * state.viewH * 0.5, 6);

    // coin
    const show = state.coinVisible && state.intro > 0.001;
    coin.visible = show; scissorsWrap.visible = show;
    if (show) {
      const R = state.coinR * (0.92 + 0.08 * ease(state.intro));
      coin.position.set(state.coinX, state.coinY, 0);
      coin.scale.setScalar(R * ease(Math.min(1, state.intro * 1.2)));
      coinSpin.rotation.y = (1 - ease(state.intro)) * 0.9 + state.mx * 0.38 + Math.sin(t * 0.6) * 0.12;
      logoUni.uTime.value = t;
      logoUni.uIntro.value = Math.min(1, state.intro * 1.25);
      logoUni.uWrite.value = Math.min(1.05, Math.max(0, (state.intro - 0.3) / 0.55) * 1.05);
      gyroA.rotation.set(1.15 + Math.sin(t * 0.4) * 0.2, t * 0.5, 0);
      gyroB.rotation.set(-0.9, -t * 0.35, 0.4);
      gyro.scale.setScalar(ease(Math.min(1, Math.max(0, (state.intro - 0.2) / 0.6))) + 0.0001);
      beads.forEach((bd, i) => { const ang = t * 0.8 + i * 2.094; bd.position.set(Math.cos(ang) * ringR * 1.16, Math.sin(ang) * ringR * 1.16, 0); });
      const fa = t * 0.45 + 2.4;
      flare.position.set(ringC.x + Math.cos(fa) * ringR, ringC.y + Math.sin(fa) * ringR, 0.05);
      const tw = 0.75 + 0.25 * Math.sin(t * 5.0);
      flare.material.opacity = Math.min(1, state.intro * 1.5) * tw;
      flare.scale.setScalar(0.32 + 0.06 * Math.sin(t * 3.1));

      coinSpin.rotation.x = state.my * 0.22 + Math.cos(t * 0.5) * 0.04;
      coinSpin.position.y = Math.sin(t * 0.9) * 0.025;

      // scissors orbit
      const k = Math.min(1, Math.max(0, (state.intro - 0.35) / 0.65));
      const th = t * (reduced ? 0 : 0.42) + 0.9;
      const orx = R * (isSmall ? 1.0 : 1.12), orz = R * 1.0;
      scissorsWrap.position.set(
        state.coinX + Math.cos(th) * orx,
        state.coinY + Math.sin(th) * R * 0.32 + R * 0.3,
        Math.sin(th) * orz + R * 0.55
      );
      // keep the blades facing the viewer; point the tip along the on-screen orbit direction
      scissorsWrap.rotation.order = 'ZYX';
      scissorsWrap.rotation.z = Math.atan2(Math.cos(th) * R * 0.32, -Math.sin(th) * orx);
      scissorsWrap.rotation.y = Math.sin(th) * 0.45;
      scissorsWrap.rotation.x = 0.25 + Math.sin(t * 0.7) * 0.2;
      const sc = (R * 1.35 / 4.7) * ease(k);
      scissorsWrap.scale.setScalar(Math.max(0.0001, sc));
      const open = 0.06 + 0.32 * (reduced ? 0.5 : snip(t * 0.55));
      halfA.rotation.z = open; halfB.rotation.z = -open;
      scissors.rotation.x = Math.sin(t * 0.8) * 0.4;
    }

    updateRitual(t);
    updateStrands(t);
    const lockOp = state.intro < 0.5 ? 0 : (state.hero < 0.5 ? 0.5 : (ritual.visible ? 0.4 : 0.7));
    for (const L of locks) updateLock(L, t, lockOp, dt);
    dMat.uniforms.uTime.value = t;
    dMat.uniforms.uScroll.value = 0;
    dMat.uniforms.uAlpha.value = Math.min(1, state.strandsIn * 1.2);

    renderer.render(scene, camera);
    if (!reduced) requestAnimationFrame(frame);
  }

  Stage.intro = function () {
    if (window.gsap && !reduced) {
      gsap.to(state, { intro: 1, duration: 2.6, ease: 'power3.out' });
      gsap.to(state, { strandsIn: 1, duration: 3, ease: 'power2.out', delay: 0.2 });
    } else {
      state.intro = 1; state.strandsIn = 1;
    }
    if (reduced) {
      requestAnimationFrame(frame);
      window.addEventListener('scroll', () => requestAnimationFrame(frame), { passive: true });
      window.addEventListener('resize', () => requestAnimationFrame(frame));
    }
  };

  Stage.ready = true;
  if (!reduced) requestAnimationFrame(frame);
})();
