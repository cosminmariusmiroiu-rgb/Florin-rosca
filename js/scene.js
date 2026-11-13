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

  /* ---------- Coin with logo ---------- */
  const coin = new THREE.Group();
  const coinSpin = new THREE.Group();
  coin.add(coinSpin);
  scene.add(coin);
  const faceMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.25, roughness: 0.42, emissive: 0xffffff, emissiveIntensity: 0.62 });
  const backMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.35, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.4 });
  const coinBody = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.09, 128, 1, false), [goldSatin, faceMat, backMat]);
  coinBody.rotation.x = Math.PI / 2;
  coinSpin.add(coinBody);
  const bevelF = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 16, 160), gold); bevelF.position.z = 0.045; coinSpin.add(bevelF);
  const bevelB = bevelF.clone(); bevelB.position.z = -0.045; coinSpin.add(bevelB);
  const rimLip = new THREE.Mesh(new THREE.TorusGeometry(1.035, 0.018, 12, 160), goldBright); coinSpin.add(rimLip);

  new THREE.TextureLoader().load(document.querySelector('.medal__img')?.getAttribute('src') || 'assets/img/logo.webp', (tex) => {
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.center.set(0.5, 0.5);
    tex.rotation = Math.PI / 2; // align cylinder-cap UVs with the image
    faceMat.map = tex; faceMat.emissiveMap = tex; faceMat.needsUpdate = true;
    const back = tex.clone(); back.needsUpdate = true; back.rotation = Math.PI / 2; back.repeat.set(-1, 1);
    backMat.map = back; backMat.emissiveMap = back; backMat.needsUpdate = true;
  });

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
      speed: 0.25 + Math.random() * 0.35, off: (i / STRANDS - 0.5) * 1.6, z: -3 + Math.random() * 4,
      bright: 0.15 + Math.random() * 0.5, tint: Math.random()
    });
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
    coinR: 1, coinX: 0, coinY: 0, coinVisible: true
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
    const baseY = -state.viewH * 0.3 + state.hero * state.viewH * 0.2;
    const fade = state.strandsIn * (1 - state.hero * 0.72);
    for (let i = 0; i < strands.length; i++) {
      const s = strands[i];
      const pos = s.line.geometry.attributes.position.array;
      const col = s.line.geometry.attributes.color.array;
      const tt = t * s.speed + s.phase + state.scroll * 0.0012;
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
        col[j * 3 + 1] = (0.72 + s.tint * 0.14) * env * glint;
        col[j * 3 + 2] = (0.32 + s.tint * 0.18) * env * glint;
      }
      s.line.geometry.attributes.position.needsUpdate = true;
      s.line.geometry.attributes.color.needsUpdate = true;
    }
  }

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    state.mx += (state.tmx - state.mx) * Math.min(1, dt * 4);
    state.my += (state.tmy - state.my) * Math.min(1, dt * 4);
    state.scroll = window.scrollY || 0;
    state.hero = Math.min(1, state.scroll / Math.max(1, state.h));

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
      coinSpin.rotation.y = (1 - ease(state.intro)) * Math.PI * 2.2 + state.mx * 0.45 + Math.sin(t * 0.6) * 0.08 + state.hero * Math.PI * 0.9;
      coinSpin.rotation.x = state.my * 0.32 + Math.cos(t * 0.5) * 0.05;
      coinSpin.position.y = Math.sin(t * 0.9) * 0.025;

      // scissors orbit
      const k = Math.min(1, Math.max(0, (state.intro - 0.35) / 0.65));
      const th = t * (reduced ? 0 : 0.42) + 0.9;
      const orx = R * (isSmall ? 1.12 : 1.3), orz = R * 1.1;
      scissorsWrap.position.set(
        state.coinX + Math.cos(th) * orx,
        state.coinY + Math.sin(th) * R * 0.32 + R * 0.08,
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

    updateStrands(t);
    dMat.uniforms.uTime.value = t;
    dMat.uniforms.uScroll.value = state.scroll / Math.max(1, state.h);
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
