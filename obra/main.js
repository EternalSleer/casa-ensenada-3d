// Basado en flat-to-3d/04-build-time-lapse de Sam Aing (MIT), ver LICENSE-flat-to-3d.txt.
// Secuencia de obra: un scroll por cuarenta semanas.
// El cargador es el programa escribiéndose. La hoja se dibuja semana a semana (los seis dibujos a la vez, cada uno hasta su semana).
// El scroll se zambulle en el dibujo 01 hasta la calle frente a las cepas y luego recorre la obra mientras la casa sube:
// entra por la cochera, sube la escalera, cruza el bosque de puntales de la sala de doble altura, camina la terraza y el jardín,
// y llega a la entrega en la semana 40; después se aleja hasta que la casa vuelve a ser el dibujo 06.
//   ?v=12.5  salta a una posición del scroll, en alturas de pantalla      ?still   se salta el cargador y el dibujo, para fotos
//   ?w=18    fuerza la semana de la obra                                  ?rays    revisa que la cámara no atraviese nada
//   ?offline el reloj es virtual y tools/offline.mjs lo avanza un cuadro a la vez
import * as THREE from 'three';
import { makeTextures, makeMaterials, buildWorld, U, PROG, TILES, WEEKS, V, propsAt } from './world.js';
import { CX, CZ } from './casa.js';
import { buildStage } from './stage.js';
import { makePipe, aim } from './pipe.js';

const SEQ = window.SEQ, pad = SEQ.pad;
const Q = new URLSearchParams(location.search);
const STILL = Q.has('still'), OFFLINE = Q.has('offline'), RAYS = Q.has('rays');
const WQ = Q.has('w') ? +Q.get('w') : null;
const PHONE = innerWidth <= 700;
const DPR = Math.min(+(Q.get('dpr') || devicePixelRatio || 1), PHONE ? 1.25 : 2);
let DPR_REAL = PHONE ? DPR : Math.min(DPR, 1.5);
const raf = () => new Promise((r) => { let d = 0; const f = () => { if (!d) { d = 1; r(); } }; requestAnimationFrame(f); setTimeout(f, 80); });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const setP = (p) => { SEQ.real = true; SEQ.progress = Math.max(SEQ.progress, p); };
const C = (h) => new THREE.Color(h);
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- arranque
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.04;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
renderer.setClearColor(0xefebe2, 1);
renderer.info.autoReset = false;   // un cuadro son varios render(): las llamadas se cuentan por cuadro, no por render
setP(0.34); await raf();

// cielo, sol y bruma. La mañana nítida mientras sube la obra y la luz dorada de la tarde en la entrega.
const sunDir = (az, el) => V(Math.cos(el * DEG) * Math.cos(az * DEG), Math.sin(el * DEG), Math.cos(el * DEG) * Math.sin(az * DEG));
const SUN_AM = sunDir(70, 28), SUN_MID = sunDir(250, 40), SUN_PM = sunDir(212, 21);
const SKY = { am: { zen: C('#4274b0'), hor: C('#e2dbca'), glow: C('#ffcf94') }, pm: { zen: C('#4a6fa0'), hor: C('#edd4ae'), glow: C('#ffab5c') } };
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { uSun: { value: SUN_AM.clone() }, uZen: { value: SKY.am.zen.clone() }, uHor: { value: SKY.am.hor.clone() }, uGlow: { value: SKY.am.glow.clone() }, uGround: { value: C('#746654') }, uEnv: { value: 0 } },
  vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: `uniform vec3 uSun, uZen, uHor, uGlow, uGround; uniform float uEnv; varying vec3 vD;
    void main(){ vec3 d = normalize(vD); float h = d.y;
      vec3 c = mix(uHor, uZen, pow(smoothstep(-.02, .55, h), .5));
      vec2 q = d.xz / max(d.y + .06, .02) * 1.6 + vec2(3.1, 7.4);
      float n = 0., a = .55; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
      for (int i = 0; i < 5; i++) { vec2 f = fract(q), ip = floor(q); f = f * f * (3. - 2. * f);
        float h00 = fract(sin(dot(ip, vec2(127.1, 311.7))) * 43758.5), h10 = fract(sin(dot(ip + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5);
        float h01 = fract(sin(dot(ip + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5), h11 = fract(sin(dot(ip + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5);
        n += a * mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y); q = m * q; a *= .5; }
      float cl = smoothstep(.56, .82, n) * smoothstep(.0, .06, h) * (1. - smoothstep(.25, .6, h)) * (1. - uEnv);
      c = mix(c, mix(uHor * 1.06, vec3(1.), .5) * (.92 + .1 * smoothstep(.6, .9, n)), cl * .85);
      float s = max(dot(d, uSun), 0.);
      c += uGlow * (pow(s, 5.) * .32 + pow(s, 64.) * .5) * smoothstep(-.1, .2, h);
      if (uEnv > .5) c = mix(uGround, c, smoothstep(-.06, .02, h));
      gl_FragColor = vec4(c, 1.); }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMat);
sky.scale.setScalar(2400); sky.renderOrder = -1; sky.frustumCulled = false;
sky.userData.sets = { main: skyMat, paper: null, nd: null }; sky.userData.sky = true;

// los reflejos salen del mismo cielo, con la tierra bajo el horizonte
const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(40, 48, 24), skyMat));
skyMat.uniforms.uEnv.value = 1;
const ENV = new THREE.PMREMGenerator(renderer).fromScene(envScene, 0.02).texture;
skyMat.uniforms.uEnv.value = 0;
const T = makeTextures(renderer, PHONE);
setP(0.48); await raf();

// ---------------------------------------------------------------- cámaras: llaves [pantallas, ojo (x, altura, y), mira (x, altura, y)] en coordenadas del plano
const cam = new THREE.PerspectiveCamera(2, 1, 1, 2000);
const EYE_FOV = PHONE ? 64 : 50;
const PL = (x, h, y) => V(x - CX, h, y - CZ);   // plano [x, altura, y] -> mundo
// la axonometría de la hoja: centrada en la casa entera (de -0.95 a 8.20 m) para que las láminas 04–06 no se recorten
const K0 = { T: PL(6.245, 3.4, 10.3), az: 128, el: 33.5, h: 11.5, fov: 2 };
// dentro del dibujo 01, las cepas llenando la pantalla
const K1 = { T: PL(6.2, -0.5, 11.5), az: 128, el: 33.5, h: PHONE ? 15 : 8.0, fov: 2 };
const toK = (E, Tg, fov) => {
  const d = E.clone().sub(Tg), D = d.length();
  return { T: Tg.clone(), az: Math.atan2(d.z, d.x) * 180 / Math.PI, el: Math.asin(d.y / D) * 180 / Math.PI, h: D * Math.tan(fov * Math.PI / 360), fov };
};
const EDGE = [PL(6.40, 1.62, 25.0), PL(6.30, -0.4, 15.5)];   // a la altura de los ojos, en la calle frente a las cepas
const K3 = toK(EDGE[0], EDGE[1], EYE_FOV);
const lerpK = (a, b, t, o = {}) => {
  const tf = o.f ?? t, te = o.e ?? t, tt = o.T ?? t, th = o.h ?? t;
  return { T: a.T.clone().lerp(b.T, tt), az: lerp(a.az, b.az, te), el: lerp(a.el, b.el, te), h: lerp(a.h, b.h, th), fov: Math.exp(lerp(Math.log(a.fov), Math.log(b.fov), tf)) };
};

// guion de la cámara por tramos de llaves [v, ojo x, ojo altura, ojo y, mira x, mira altura, mira y]; cada tramo arranca en la última llave del anterior
const DIVE = 6; // la zambullida ocupa las primeras seis alturas de pantalla
const TRAMOS = [
  // 0 (v 6.0–10.4): de la calle frente a las cepas, al portón peatonal, a lo largo de la barda y por el portón de la cochera
  [[6.0, 6.40, 1.62, 25.0, 6.30, -0.4, 15.5], [7.2, 6.37, 1.62, 22.6, 3.0, 0.8, 19.0], [8.0, 6.40, 1.62, 19.6, 1.0, 0.8, 19.0], [8.8, 6.40, 1.62, 20.6, 9.7, 1.2, 17.0],
    [9.6, 9.70, 1.65, 20.9, 9.7, 1.4, 16.0], [10.4, 9.70, 1.65, 19.0, 9.6, 1.8, 14.4]],
  // 1 (→12.8): dentro de la cochera, bajo la cimbra de la losa 2.80
  [[11.4, 9.70, 1.62, 17.2, 9.7, 2.3, 14.6], [12.8, 8.00, 1.65, 14.6, 7.98, 1.6, 12.0]],
  // 2 (→17.2): por la planta baja hasta la escalera y arriba, a la planta alta
  [[13.4, 7.98, 1.65, 13.4, 7.3, 1.6, 11.0], [14.0, 7.30, 1.65, 12.4, 6.6, 1.6, 9.8], [14.6, 6.60, 1.65, 10.0, 4.8, 2.4, 6.0], [15.2, 6.80, 1.62, 7.4, 3.0, 2.8, 5.9],
    [16.2, 5.00, 1.60, 5.95, 3.2, 1.9, 3.8], [17.2, 3.00, 1.62, 5.95, 3.4, 4.6, 7.6]],
  // 3 (→22.6): la planta alta bajo el bosque de puntales, la escalera a la terraza y la azotea
  [[17.9, 6.20, 1.65, 6.6, 7.7, 1.6, 10.0], [18.5, 7.70, 1.65, 10.2, 9.4, 1.7, 10.95], [18.9, 7.70, 1.60, 10.95, 11.2, 1.8, 10.95], [19.3, 10.40, 2.30, 10.95, 12.0, 2.5, 10.1],
    [19.7, 11.85, 2.95, 10.2, 9.6, 3.9, 9.1], [20.1, 9.60, 4.35, 9.1, 6.5, 4.1, 9.7], [20.5, 9.00, 4.40, 9.2, 4.0, 3.0, 6.0], [21.0, 7.80, 4.40, 10.4, 9.2, 4.6, 10.95],
    [21.3, 7.90, 4.40, 10.95, 11.2, 4.6, 10.95], [21.6, 10.40, 5.10, 10.95, 12.0, 5.3, 10.1], [21.9, 11.85, 5.75, 10.2, 9.6, 6.7, 9.1], [22.2, 9.60, 7.15, 9.1, 6.5, 6.9, 9.7],
    [22.6, 9.00, 7.20, 9.2, 6.5, 6.9, 9.9]],
  // 4 (→26.0): del volumen de la azotea sale por el cancel abierto del vestíbulo a la terraza poniente, la pérgola, el jacuzzi
  [[23.2, 7.00, 7.20, 9.3, 4.8, 6.5, 10.3], [23.5, 6.10, 7.20, 10.3, 3.8, 6.4, 10.5], [23.9, 4.90, 7.20, 10.4, 3.0, 6.6, 9.0], [24.6, 5.00, 7.20, 9.6, 9.0, 6.2, 5.0], [25.4, 5.00, 7.20, 7.95, 4.5, 6.2, 4.0],
    [26.0, 4.50, 7.25, 4.6, 4.5, 2.0, 0.5]],
  // 5 (→29.5): de baja a la sala, el jardín, la cocina y la entrega
  [[26.7, 4.50, 5.40, 1.8, 4.6, 2.6, 6.0], [27.4, 6.00, 1.70, 1.6, 4.4, 1.5, 6.0], [28.0, 8.50, 1.70, 2.6, 9.6, 1.1, 5.4], [28.5, 8.30, 1.75, 3.9, 9.9, 0.9, 5.4],
    [29.0, 7.25, 1.70, 3.95, 2.0, 1.5, 7.8], [29.5, 7.20, 1.70, 8.1, 2.2, 1.5, 4.2]],
];
const LEGS = TRAMOS.map((t, i) => ({ keys: i ? [TRAMOS[i - 1][TRAMOS[i - 1].length - 1], ...t] : t }));
for (const leg of LEGS) {
  const P = leg.keys.map((k) => PL(k[1], k[2], k[3])), L = leg.keys.map((k) => PL(k[4], k[5], k[6]));
  leg.pos = new THREE.CatmullRomCurve3(P, false, 'centripetal'); leg.look = new THREE.CatmullRomCurve3(L, false, 'centripetal');
  leg.v0 = leg.keys[0][0]; leg.v1 = leg.keys[leg.keys.length - 1][0];
}
function walkAt(v) {
  const leg = LEGS.find((l) => v <= l.v1) || LEGS[LEGS.length - 1];
  const t = clamp((v - leg.v0) / (leg.v1 - leg.v0), 0, 1), te = lerp(t, ease(t), 0.35), vv = lerp(leg.v0, leg.v1, te);
  const k = leg.keys; let i = 0; while (i < k.length - 2 && vv > k[i + 1][0]) i++;
  const u = (i + clamp((vv - k[i][0]) / (k[i + 1][0] - k[i][0]), 0, 1)) / (k.length - 1);
  return { P: leg.pos.getPoint(u), L: leg.look.getPoint(u) };
}
const V_END = LEGS[LEGS.length - 1].v1;   // 29.5, la entrega
// la semana en cada punto del scroll. Al terminar la zambullida la obra va en la 4.1: las cepas siguen abiertas frente a la cámara.
const W_DIVE = 4.1;
const WEEK_KEYS = [
  [6.0, W_DIVE], [6.7, 5.2], [10.4, 10.6], [12.8, 13.4], [15.2, 16.8], [16.2, 18.0], [17.2, 18.6], [18.9, 19.6],
  [20.5, 21.5], [22.6, 23.6], [24.6, 27.0], [26.0, 31.0], [27.4, 33.5], [28.5, 36.0], [29.0, 38.0], [29.5, 40.0],
];
function weekAt(v) {
  if (v <= WEEK_KEYS[0][0]) return WEEK_KEYS[0][1];
  for (let i = 1; i < WEEK_KEYS.length; i++) if (v <= WEEK_KEYS[i][0]) {
    const [a, wa] = WEEK_KEYS[i - 1], [b, wb] = WEEK_KEYS[i];
    return lerp(wa, wb, sm(0, 1, (v - a) / (b - a)) * 0.35 + (v - a) / (b - a) * 0.65);
  }
  return WEEKS;
}
const END = { out: [29.5, 31.2], unpour: [31.2, 32.2], zoom: [32.2, 33.3], total: 33.9 };
const KW = toK(...(() => { const w = walkAt(V_END); return [w.P, w.L, EYE_FOV]; })());

// los puntales se dejan pasillo donde pasa la cámara: muestras de su camino cada 0.1 de scroll
const SAMPLES = [];
for (let v = DIVE; v <= V_END + 1e-6; v += 0.1) { const w = walkAt(v); SAMPLES.push({ x: w.P.x, y: w.P.y, z: w.P.z }); }

const R = makeMaterials(T, ENV);
const scene = new THREE.Scene();
scene.add(buildWorld({ R, T, phone: PHONE, samples: SAMPLES }));
const stage = buildStage(R);
scene.add(stage, sky);
setP(0.62); await raf();

scene.fog = new THREE.Fog(SKY.am.hor.clone(), 160, 1400);
const sun = new THREE.DirectionalLight(0xffe7cc, 3.2);
const sunAt = V(0, 2, 0);
sun.position.copy(sunAt).addScaledVector(SUN_AM, 140); sun.target.position.copy(sunAt);
sun.castShadow = true; sun.shadow.mapSize.set(PHONE ? 2048 : 4096, PHONE ? 2048 : 4096);
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 40, far: 260 });
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04;
const hemi = new THREE.HemisphereLight(0xd2e0ee, 0x8b7a63, 0.88);
scene.add(sun, sun.target, hemi);
const lamps = stage.userData.lights.map((l) => { const p = new THREE.PointLight(0xffc288, 0, 0, 2); p.position.copy(l.p); p.userData.k = l.k; scene.add(p); return p; });
U.real.value = W_DIVE;

// ---------------------------------------------------------------- pipeline
const pipe = makePipe(renderer, scene, cam, { ao: !PHONE, samples: 4 });
pipe.onAim = (c) => {
  const D = c.userData.D; scene.fog.near = D + 110; scene.fog.far = D + 1450;
  sky.position.copy(c.position);
};
let W = innerWidth, H = innerHeight;
pipe.setSize(W, H, DPR, DPR_REAL);

// ---------------------------------------------------------------- la hoja
const sheet = document.getElementById('sheet');
const frames = [...document.querySelectorAll('.frame')], caps = [...document.querySelectorAll('figcaption')];
const prog = document.getElementById('prog'), nowEl = prog.querySelector('.now'), nowTag = nowEl.querySelector('b');
const dones = [...prog.querySelectorAll('.done')];
const chip = document.getElementById('chip'), notes = document.getElementById('notes'), hint = document.getElementById('hint'), bar = document.querySelector('.bar');
let REST = [];
const measure = () => {
  sheet.style.transform = 'none';
  REST = frames.map((f) => { const r = f.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
};
measure();

function clock(week, show) {
  prog.classList.toggle('clock', show);
  const f = clamp(week / WEEKS, 0, 1);
  nowEl.style.left = `calc(var(--lab) + (100% - var(--lab)) * ${f})`;
  nowTag.textContent = 'Sem ' + pad(clamp(Math.ceil(week - 1e-3), 0, WEEKS));
  PROG.forEach(([, a, b], i) => { dones[i].style.transform = `scaleX(${clamp((week - a) / (b - a), 0, 1)})`; });
}

// ---------------------------------------------------------------- la luz según la semana
let shadowKey = '';
function lightFor(week) {
  const pm = sm(27, 36, week);
  const dir = SUN_AM.clone().lerp(SUN_MID, sm(15.4, 17.4, week)).normalize().lerp(SUN_PM, pm).normalize();
  sun.position.copy(sunAt).addScaledVector(dir, 140);
  sun.color.set(0xffe7cc).lerp(C('#ffc68c'), pm); sun.intensity = lerp(3.15, 3.55, pm);
  hemi.intensity = lerp(0.88, 0.72, pm);
  skyMat.uniforms.uSun.value.copy(dir);
  skyMat.uniforms.uZen.value.copy(SKY.am.zen).lerp(SKY.pm.zen, pm);
  skyMat.uniforms.uHor.value.copy(SKY.am.hor).lerp(SKY.pm.hor, pm);
  skyMat.uniforms.uGlow.value.copy(SKY.am.glow).lerp(SKY.pm.glow, pm);
  scene.fog.color.copy(skyMat.uniforms.uHor.value);
  for (const l of lamps) l.intensity = 7.5 * l.userData.k * sm(37, 39.5, week);
  R.shade.emissiveIntensity = 2.6 * sm(37, 39.5, week);
  const key = (Math.round(week * 25) / 25).toFixed(2);
  if (key !== shadowKey) { shadowKey = key; renderer.shadowMap.needsUpdate = true; }
}

// ---------------------------------------------------------------- calentamiento detrás del cargador
const screenRect = () => ({ x: 0, y: 0, w: W, h: H });
pipe.draw(TILES.map((t, i) => ({ rect: REST[i], cam: K0, now: t.w1, newFrom: t.w0 })));
setP(0.78); await raf();
for (const w of [WEEKS, 18, W_DIVE]) {
  U.real.value = w; lightFor(w); renderer.shadowMap.needsUpdate = true;
  pipe.real({ cam: w === WEEKS ? KW : K3, rect: screenRect() });
}
pipe.real({ cam: K1, rect: screenRect() });
setP(0.94); await raf();
await document.fonts.ready;
setP(1);

// ---------------------------------------------------------------- la portada: se acomoda, aterriza y se dibuja
const S = { now: -1.6, drawT: -1, drawn: false };
const DRAW_S = 5.8;
const nowAt = (t) => -1.6 + (WEEKS + 1.6) * (t <= 0 ? 0 : t >= 1 ? 1 : (1 - Math.cos(Math.PI * Math.pow(t, 1.12))) / 2);
const LOADER_MS = 1900;
let heroT0 = OFFLINE ? LOADER_MS : Math.max(performance.now() + 300, LOADER_MS);
const HERO = [
  [0, () => {
    SEQ.docked = true;
    prog.querySelectorAll('.plan').forEach((p) => p.classList.add('in'));
    prog.classList.add('fly'); SEQ.place('dock'); prog.classList.add('docked');
    document.body.classList.add('ready');
  }],
  [350, () => document.body.classList.add('sheeton')],
  [520, () => document.body.classList.add('landed')],
  [1050, (t) => { prog.classList.remove('fly'); S.drawT = t; caps.forEach((c) => c.classList.add('go')); }],
];
let heroStep = 0;
function heroTick(t) {
  if (OFFLINE && t < LOADER_MS) { SEQ.progress = Math.min(1, t / (LOADER_MS - 300)); SEQ.shown = SEQ.progress; }
  while (heroStep < HERO.length && t >= heroT0 + HERO[heroStep][0]) HERO[heroStep++][1](heroT0 + HERO[heroStep - 1][0]);
}
if (STILL) {
  SEQ.docked = true; SEQ.place('dock'); prog.classList.add('docked');
  document.body.classList.add('ready', 'landed', 'sheeton'); caps.forEach((c) => c.classList.add('go', 'done')); hint.classList.add('on');
  S.now = WEEKS; S.drawn = true; heroStep = HERO.length;
}
if (OFFLINE) { SEQ.real = true; SEQ.progress = 0; SEQ.shown = 0; }

// ---------------------------------------------------------------- scroll
const track = document.getElementById('track');
track.style.height = (END.total + 1) * 100 + 'vh';
if (Q.has('v')) { history.scrollRestoration = 'manual'; scrollTo(0, +Q.get('v') * innerHeight); }
let sv = scrollY / innerHeight, last = OFFLINE ? 0 : performance.now();

// notas dentro del dibujo 01, con un halo de papel para que ninguna línea atraviese el texto. Puntos [x, altura, y] del plano.
const NOTES = [
  { p: PL(6.4, 0, 16.9), t: '±0.00 N.P.T. PLANTA BAJA', dx: 26, dy: -30 },
  { p: PL(3.0, -0.95, 11.82), t: '-0.95 FONDO DE CEPA', dx: -26, dy: 30 },
  { p: PL(1.43, -0.8, 6.0), t: 'ZAPATA CORRIDA 0.90 × 0.20 M', dx: -28, dy: 40, acc: true },
  { p: PL(12.49, -0.4, 9.0), t: 'CONTRATRABE 0.20 × 0.60 M', dx: 24, dy: 34 },
  { p: PL(6.2, 0, 19.93), t: 'EJE 9 · CALLE', dx: -22, dy: 28 },
  { p: PL(4.5, 0, 0), t: 'EJE 1 · JARDÍN', dx: 24, dy: -28 },
];
notes.innerHTML = NOTES.map((n) => `<g><circle r="2.2" fill="#1d1d1f"/><line stroke="#1d1d1f" stroke-width=".9"/><rect class="nbg" rx="1" height="14"/><text ${n.acc ? 'class="acc"' : ''}>${n.t}</text></g>`).join('');
const noteEls = [...notes.children];
function drawNotes(alpha) {
  notes.style.opacity = alpha;
  if (alpha <= 0.001) return;
  const v = new THREE.Vector3();
  NOTES.forEach((n, i) => {
    v.copy(n.p).project(cam);
    const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H, g = noteEls[i];
    let dx = n.dx; if (x + dx < 140 && dx < 0) dx = -dx; if (x + dx > W - 170 && dx > 0) dx = -dx;
    const tx = x + dx, ty = y + n.dy;
    g.children[0].setAttribute('cx', x); g.children[0].setAttribute('cy', y);
    const ln = g.children[1]; ln.setAttribute('x1', x); ln.setAttribute('y1', y); ln.setAttribute('x2', tx); ln.setAttribute('y2', ty);
    const tt = g.children[3], bg = g.children[2];
    const txText = tx + (dx < 0 ? -5 : 5), tyText = ty + (n.dy < 0 ? -4 : 9);
    tt.setAttribute('x', txText); tt.setAttribute('y', tyText); tt.setAttribute('text-anchor', dx < 0 ? 'end' : 'start');
    const bw = n.t.length * 6.8 + 8;
    bg.setAttribute('x', dx < 0 ? txText - bw + 3 : txText - 3);
    bg.setAttribute('y', tyText - 10.5);
    bg.setAttribute('width', bw);
  });
}

// lo que dice la letra chica en cada punto
const rowOf = (w) => { let n = PROG[0][0]; for (const [name, a] of PROG) if (w >= a) n = name; return n; };
function chipFor(v, week, pour, diving) {
  const wk = `Semana ${pad(clamp(Math.ceil(week - 1e-3), 1, WEEKS))} &nbsp;//&nbsp; `;
  if (v >= END.zoom[0] + 0.3) return '';
  if (v >= END.out[0] + 0.15) return 'Dibujo 06 &nbsp;//&nbsp; Cancelería, acabados y entrega &nbsp;//&nbsp; <i>Sem 24–40</i>';
  if (v > DIVE + 0.5) {
    if (week >= 39.8) return 'Semana 40 &nbsp;//&nbsp; <i>Entrega</i>';
    const n = propsAt(week);
    if (week < 6.2) return wk + '<i>Firme de planta baja</i>';
    if (week < 10) return wk + `<i>${rowOf(week)}</i>`;
    if (week < 13.4) return wk + `<i>Cimbra y colado · losa N.P.T. 2.80${n ? ` · ${n} puntales` : ''}</i>`;
    if (week < 16.8) return wk + '<i>Muros de planta alta</i>';
    if (week < 19.6) return wk + `<i>Colado de losa N.P.T. 5.60${n ? ` · ${n} puntales en la sala doble altura` : ''}</i>`;
    if (week < 21.5) return wk + '<i>Descimbrado</i>';
    if (week < 23.0) return wk + '<i>Azotea N.P.T. 8.20</i>';
    if (week < 26.5) return wk + '<i>Cancelería y barandales de vidrio</i>';
    if (week < 31.0) return wk + '<i>Aplanados y duela de roble</i>';
    if (week < 33.0) return wk + '<i>Terraza · deck, jacuzzi y pérgola</i>';
    if (week < 35.0) return wk + '<i>Jardín</i>';
    if (week < 37.2) return wk + '<i>Cocina · isla y bancos</i>';
    return wk + '<i>Sala · doble altura</i>';
  }
  if (v > DIVE * 0.93) return 'Semana 05 &nbsp;//&nbsp; <i>Cepas abiertas · zapatas colocadas</i>';
  if (pour > 0) { const w = clamp(Math.ceil(pour), 1, 5); return `Semana ${pad(w)} &nbsp;//&nbsp; <i>${w <= 2 ? 'Excavación' : 'Cimentación'}</i>`; }
  if (diving) return 'Dibujo 01 &nbsp;//&nbsp; Excavación y cimentación &nbsp;//&nbsp; <i>Sem 01–05</i>';
  return '';
}

// ---------------------------------------------------------------- el cuadro
let lastKey = '';
let LAST_INFO = { calls: 0, triangles: 0 };
function frame(now) {
  if (!OFFLINE) requestAnimationFrame(frame);
  heroTick(now);
  if (now - last > 120 && S.drawT > 0) (window.__hitches || (window.__hitches = [])).push([Math.round(now - last), +sv.toFixed(2), +S.now.toFixed(1)]);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const target = clamp(scrollY / innerHeight, 0, END.total);
  sv = STILL ? target : sv + (target - sv) * (1 - Math.exp(-dt * 5.5));
  if (Math.abs(target - sv) < 1e-5) sv = target;
  const ps = clamp(sv / DIVE, 0, 1);

  if (S.drawT > 0 && !S.drawn) {
    const t = (now - S.drawT) / 1000 / DRAW_S * (ps > 0.01 ? 3 : 1);
    if (ps > 0.01) S.drawT -= dt * 1000 * 2;
    S.now = nowAt(t);
    if (t >= 1) { S.drawn = true; S.now = WEEKS; hint.classList.add('on'); window.__heroDone = true; }
    caps.forEach((c, i) => c.classList.toggle('done', S.now >= TILES[i].w1));
  }
  if (STILL) window.__heroDone = true;

  const ending = sv >= END.out[0];
  const live = ending ? 5 : 0;
  let z, c, pour, l = 0, k, week, realOnly, rectL;
  const Rl = REST[live], sC = Math.max(W / Rl.w, H / Rl.h);
  const cL = { x: Rl.x + Rl.w / 2, y: Rl.y + Rl.h / 2 }, c1 = { x: W / 2, y: H / 2 };
  const F = { x: (c1.x - cL.x * sC) / (1 - sC), y: (c1.y - cL.y * sC) / (1 - sC) };
  const coverH = Rl.h * sC;
  if (!ending) {
    z = ease(sm(0.035, 0.24, ps)); c = sm(0.23, 0.40, ps);
    pour = lerp(-0.8, 5.6, clamp((ps - 0.40) / 0.185, 0, 1));
    l = clamp((ps - 0.585) / (0.975 - 0.585), 0, 1);
    week = sv > DIVE ? weekAt(sv) : W_DIVE;
    realOnly = pour >= 5.55;
    k = c > 0 ? lerpK(K0, K1, c) : K0;
    if (l > 0) k = lerpK(K1, K3, l, { f: sm(0, 0.62, l), e: sm(0.22, 1, l), T: sm(0.18, 1, l), h: sm(0.18, 1, l) });
    if (sv > DIVE) { const w = walkAt(sv); k = toK(w.P, w.L, EYE_FOV); }
  } else {
    week = WEEKS;
    const lo = clamp((sv - END.out[0]) / (END.out[1] - END.out[0]), 0, 1);
    const lu = clamp((sv - END.unpour[0]) / (END.unpour[1] - END.unpour[0]), 0, 1);
    const lz = clamp((sv - END.zoom[0]) / (END.zoom[1] - END.zoom[0]), 0, 1);
    const K06s = { T: K0.T, az: K0.az, el: K0.el, h: K0.h * H / coverH, fov: 2 };
    k = lerpK(KW, K06s, lo, { f: sm(0, 0.78, lo), e: sm(0.3, 1, lo), T: sm(0.22, 1, lo), h: sm(0.22, 1, lo) });
    pour = lerp(WEEKS + 0.8, -1.8, ease(lu));
    realOnly = lu <= 0;
    z = 1 - ease(lz); c = lz > 0 ? 1 : 0;
    if (lz > 0) k = K0;
  }
  if (WQ !== null) week = WQ;
  U.real.value = week; lightFor(week);

  const s = Math.exp(Math.log(sC) * z);
  const zr = (r) => ({ x: F.x + (r.x - F.x) * s, y: F.y + (r.y - F.y) * s, w: r.w * s, h: r.h * s });
  sheet.style.transform = z > 0 ? `translate(${F.x * (1 - s)}px, ${F.y * (1 - s)}px) scale(${s})` : 'none';
  sheet.style.opacity = 1 - sm(0.5, 0.92, z);
  const rects = REST.map(zr);
  const cover = rects[live];
  if (!ending) rectL = c > 0 ? { x: lerp(cover.x, 0, c), y: lerp(cover.y, 0, c), w: lerp(cover.w, W, c), h: lerp(cover.h, H, c) } : cover;
  else rectL = sv < END.zoom[0] ? screenRect() : cover;
  rects[live] = rectL;

  const diving = z > 0.02 && !ending;
  document.body.classList.toggle('closing', ending && sv > END.zoom[0] + 0.45);
  const onSite = (pour > -0.5 || sv > DIVE) && !(ending && sv > END.unpour[0] + 0.3);
  if (onSite) {
    if (!prog.classList.contains('hud')) { prog.classList.add('hud'); placeHud(); }
    prog.style.opacity = ending ? 1 - sm(END.unpour[0], END.unpour[0] + 0.3, sv) : clamp((pour + 0.5) / 0.8, 0, 1);
    clock(sv > DIVE ? week : clamp(pour, 0, W_DIVE), true);
  } else {
    if (prog.classList.contains('hud')) { prog.classList.remove('hud'); SEQ.place('dock'); }
    if (ending) { SEQ.place('dock'); prog.style.opacity = sm(END.zoom[0] + 0.4, END.zoom[1], sv); clock(WEEKS, true); }
    else { prog.style.opacity = !diving ? 1 : 1 - clamp(z * 3, 0, 1); clock(S.now, S.drawT > 0 && !diving); }
  }
  const site = onSite && (!ending || sv < END.unpour[0] + 0.5);
  bar.classList.toggle('over', site); document.body.classList.toggle('site', site);
  const chipTxt = chipFor(sv, week, pour, diving);
  if (chip.dataset.t !== chipTxt) { chip.innerHTML = chipTxt; chip.dataset.t = chipTxt; }
  chip.classList.toggle('on', !!chipTxt);
  hint.classList.toggle('on', S.drawn && sv < 0.3);

  const key = [W, H, sv.toFixed(4), S.now.toFixed(3), WQ].join(',');
  aim(cam, k, rectL, W, H);
  drawNotes(ending ? 0 : c * (1 - clamp((pour + 0.8) / 1.2, 0, 1)));
  if (key === lastKey) return;
  lastKey = key;
  renderer.info.reset();
  const realOn = ending ? sv < END.zoom[0] : pour > -0.8;
  if (!realOnly) {
    const allTiles = !(ending ? sv < END.zoom[0] : c > 0.02);
    pipe.draw(TILES.map((t, i) => ({
      rect: rects[i], cam: i === live ? k : K0, hidden: i !== live && !allTiles,
      now: diving || ending ? t.w1 : Math.min(S.now, t.w1), newFrom: t.w0,
    })));
  }
  if (pipe.shafts) {
    // los rayos de sol: solo con la cámara dentro de la casa
    const inHouse = sv > DIVE + 4 && !ending ? 1 : ending ? 1 - sm(END.out[0], END.out[0] + 0.6, sv) : 0;
    const dens = inHouse * (0.018 * sm(16.2, 17.2, week) * (1 - sm(22.5, 23.5, week)) + 0.006 * sm(37, 39, week));
    pipe.shafts.enabled = realOn && dens > 1e-4;
    if (pipe.shafts.enabled) {
      const u = pipe.shafts.uniforms;
      u.uDensity.value = dens; u.tShadow.value = sun.shadow.map ? sun.shadow.map.texture : null;
      u.uShadowMat.value.copy(sun.shadow.matrix); u.uSunCol.value.copy(sun.color).multiplyScalar(sun.intensity);
      u.uSunDir.value.copy(sun.position).sub(sun.target.position).normalize();
      if (!u.tShadow.value) pipe.shafts.enabled = false;
    }
  }
  if (realOn) pipe.real({ cam: k, rect: rectL });
  pipe.show({ rect0: rectL, now: diving || ending ? 99 : S.now, glow: diving || ending ? 0 : 1, pour, realOn, realOnly });
  LAST_INFO = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
}
function placeHud() {
  const w = PHONE ? W - 28 : Math.min(580, W - 48);
  prog.style.transform = 'none'; prog.style.width = w + 'px';
  prog.style.left = (PHONE ? 14 : 24) + 'px';
  prog.style.top = H - prog.querySelector('.rows').offsetHeight - (PHONE ? 20 : 26) + 'px';
}
if (!OFFLINE) requestAnimationFrame(frame);
const animStart = new WeakMap();
window.__frame = (vt) => {
  frame(vt);
  for (const a of document.getAnimations()) { if (!animStart.has(a)) animStart.set(a, vt); a.pause(); a.currentTime = Math.max(0, vt - animStart.get(a)); }
};

addEventListener('resize', () => {
  W = innerWidth; H = innerHeight;
  renderer.setSize(W, H, false); pipe.setSize(W, H, DPR, DPR_REAL);
  measure(); if (prog.classList.contains('hud')) placeHud(); else SEQ.place(SEQ.docked ? 'dock' : 'loader'); lastKey = '';
});
window.__seq = { pipe, cam, scene, U, S, renderer, END, R, LEGS, walkAt, weekAt, get sv() { return sv; } };
// llamadas de dibujo y triángulos del último cuadro dibujado
window.__info = () => ({ ...LAST_INFO, week: +U.real.value.toFixed(2), v: +sv.toFixed(2) });

// ---------------------------------------------------------------- ?rays: la cámara no debe atravesar nada
// Cada 0.05 de scroll, con la semana de ese punto (se ignoran las caras que el shader descartaría), se lanza un rayo del ojo
// al ojo siguiente (choque) y ocho rayos horizontales de 25 cm (rozón).
function runRays() {
  const meshes = [], mats = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => { if (o.isMesh && o.userData.sets && o.userData.sets.main && !o.userData.sky) { meshes.push(o); mats.push(o.material.side); o.material.side = THREE.DoubleSide; } });
  const rc = new THREE.Raycaster(), names = new Map(Object.entries(R).map(([k, m]) => [m, k]));
  const alive = (h, week) => {
    const g = h.object.geometry, aw = g.attributes.aWeek, ao = g.attributes.aOut;
    if (!aw) return true;
    const i = h.face.a, w = aw.getX(i), o = ao ? ao.getX(i) : 0;
    return !(w > week + 1e-4 || (o > 0.5 && week >= o));
  };
  const probe = (from, dir, far, week) => {
    rc.set(from, dir); rc.far = far;
    for (const h of rc.intersectObjects(meshes, false)) if (alive(h, week)) return h;
    return null;
  };
  const out = { crash: [], graze: [] }, dirs = [];
  for (let a = 0; a < 8; a++) dirs.push(V(Math.cos(a * Math.PI / 4), 0, Math.sin(a * Math.PI / 4)));
  const step = 0.05;
  let nSamples = 0;
  for (let v = DIVE; v <= V_END + 1e-6; v += step) {
    const week = weekAt(v), P = walkAt(v).P, Pn = walkAt(Math.min(v + step, V_END)).P, d = Pn.clone().sub(P), len = d.length();
    nSamples++;
    const name = (h) => names.get(h.object.material) || '?';
    if (len > 1e-5) {
      const h = probe(P, d.clone().normalize(), len + 0.05, week);
      if (h) out.crash.push({ v: +v.toFixed(2), week: +week.toFixed(2), obj: name(h), dist: +h.distance.toFixed(2), at: [+h.point.x.toFixed(2), +h.point.y.toFixed(2), +h.point.z.toFixed(2)] });
    }
    for (const dr of dirs) {
      const h = probe(P, dr, 0.25, week);
      if (h) { out.graze.push({ v: +v.toFixed(2), week: +week.toFixed(2), obj: name(h), dist: +h.distance.toFixed(2), at: [+h.point.x.toFixed(2), +h.point.y.toFixed(2), +h.point.z.toFixed(2)] }); break; }
    }
  }
  meshes.forEach((m, i) => { m.material.side = mats[i]; });
  out.samples = nSamples;
  window.__raysResult = out;
  console.log(`[rays] ${nSamples} muestras: ${out.crash.length} choques, ${out.graze.length} rozones (<25 cm)`);
  for (const r of out.crash) console.log('[rays] CHOQUE', JSON.stringify(r));
  for (const r of out.graze) console.log('[rays] rozón', JSON.stringify(r));
  return out;
}
window.__rays = runRays;
if (RAYS) { await raf(); runRays(); }
window.__ready = true;
