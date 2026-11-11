// Basado en flat-to-3d/04-build-time-lapse de Sam Aing (MIT), ver LICENSE-flat-to-3d.txt.
// Secuencia de obra: un scroll por cuarenta semanas.
// El cargador es el programa escribiéndose. La hoja se dibuja semana a semana (los seis dibujos a la vez, cada uno hasta su semana).
// El scroll se zambulle en el dibujo 01 hasta la calle frente al terreno todavía vacío (la obra no arranca hasta que el terreno terminó de
// dibujarse) y luego recorre la obra mientras la casa sube, piso por piso: la cimentación paso a paso rodeando el lote (trazo, cepas, plantilla,
// acero, zapatas, contratrabes, impermeabilizante, relleno, drenaje, plástico, malla y firme), los muros de block de planta baja pegados hilada por hilada, la cimbra y el armado de la losa 2.80,
// los muros de planta alta, el bosque de puntales de la sala de doble altura, la terraza y la azotea desde arriba, los aplanados, el jardín y la cocina,
// y llega a la entrega en la semana 40; después se aleja hasta que la casa vuelve a ser el dibujo 06.
//   ?v=12.5  salta a una posición del scroll, en alturas de pantalla      ?still   se salta el cargador y el dibujo, para fotos
//   ?w=18    fuerza la semana de la obra                                  ?rays    revisa que la cámara no atraviese nada
//   ?offline el reloj es virtual y tools/offline.mjs lo avanza un cuadro a la vez
import * as THREE from 'three';
import { makeTextures, makeMaterials, buildWorld, U, PROG, TILES, WEEKS, V, propsAt } from './world.js';
import * as WORLD from './world.js';   // blocksAt es opcional: si world.js aún no lo exporta, el chip no cuenta piezas
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
const setP = (p) => { SEQ.real = true; SEQ.progress = Math.max(SEQ.progress, p || 0); };
const stepRange = (a, b) => async (f) => { setP(a + (b - a) * f); await raf(); };
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
const T = await makeTextures(renderer, PHONE, stepRange(0.34, 0.48));
setP(0.48); await raf();

// ---------------------------------------------------------------- cámaras: llaves [pantallas, ojo (x, altura, y), mira (x, altura, y)] en coordenadas del plano
const cam = new THREE.PerspectiveCamera(2, 1, 1, 2000);
const EYE_FOV = PHONE ? 74 : 66;   // lente abierta: en cada cuarto se ve el cuarto, no un pedazo de muro
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
  // A (v 6.0–17.0, sem 0→6.4) cimentación completa, por fuera y por encima del lote, a 4–6.5 m de altura para ver el lote entero: de la calle (trazo con cal, niveletas e hilos) al poniente
  // (despalme, cepas, plantilla), al jardín (acero, fronteras y colado de zapatas; cimbra y colado de contratrabes), y de regreso por el centro hacia
  // la calle siguiendo el frente del firme (impermeabilizante, relleno, drenaje, plástico, malla, cisterna) hasta el vano de la puerta principal
  [[6.0, 6.40, 1.62, 25.0, 6.30, -0.4, 15.5], [6.8, 5.00, 3.60, 25.5, 6.0, -0.3, 12.0], [7.6, 0.50, 5.50, 24.0, 6.2, -0.5, 11.0],
    [8.5, -4.50, 6.50, 17.0, 6.3, -0.8, 10.0], [9.4, -4.50, 6.00, 7.0, 6.3, -0.9, 8.5], [10.3, -2.00, 5.50, -2.5, 6.5, -0.9, 8.0],
    [11.2, 5.00, 5.00, -3.5, 7.5, -0.7, 8.5], [12.0, 6.40, 4.60, 1.0, 6.6, -0.4, 11.0], [12.8, 6.30, 4.40, 1.5, 6.3, -0.3, 9.0],
    [13.6, 5.00, 4.00, 6.0, 10.5, -0.5, 8.0], [14.4, 3.00, 4.00, 12.5, 7.0, -0.2, 6.5], [15.2, 4.00, 3.60, 16.5, 8.0, -0.2, 12.5],
    [15.9, 6.45, 2.40, 19.5, 7.5, -0.2, 14.5], [16.2, 6.40, 1.64, 17.6, 4.2, 0.0, 14.6], [17.0, 6.40, 1.65, 14.8, 6.0, 0.6, 10.0]],
  // De aquí en adelante las v escritas son las de antes de alargar la cimentación: abajo se les suma SH (7.4) a todas.
  // B (→19.0, sem 6.4→10.6) muros PB: entra por el vano principal cuando el muro aún no arranca; acercamiento al muro y = 11.82 mientras se pega el block;
  // del vestíbulo entra al estudio por su puerta (x 5.79) a ver subir el muro de la ventana; luego sala y cocina
  [[10.5, 6.38, 1.65, 12.6, 3.5, 1.0, 7.0], [11.4, 5.70, 1.55, 10.4, 4.6, 0.8, 11.82], [12.6, 4.60, 1.45, 10.5, 3.6, 0.9, 11.82],
    [13.4, 6.30, 1.60, 11.3, 5.0, 1.2, 12.4], [14.0, 6.10, 1.60, 12.32, 3.0, 1.3, 14.0], [14.4, 5.30, 1.60, 12.38, 2.6, 1.3, 14.2], [14.8, 3.70, 1.60, 13.6, 1.43, 1.4, 13.4],
    [15.6, 5.25, 1.60, 12.36, 6.6, 1.3, 12.2], [16.4, 6.45, 1.62, 12.2, 4.6, 1.3, 9.6], [16.8, 6.45, 1.62, 11.0, 3.6, 1.3, 9.0],
    [17.2, 3.60, 1.55, 9.6, 1.43, 1.3, 7.0], [18.0, 4.40, 1.62, 6.0, 4.6, 1.9, 3.65], [19.0, 6.70, 1.62, 7.0, 9.4, 1.4, 5.2]],
  // C (→21.0, sem 10.6→11.7) bajo la cimbra de la losa 2.80: puntales, artesa de TP-a y TP-b, cimbra de T1; sale al jardín por el vano del ventanal
  [[19.8, 7.30, 1.62, 9.6, 7.56, 1.9, 6.0], [20.4, 5.40, 1.62, 6.6, 4.4, 2.4, 3.65], [21.0, 4.40, 1.62, 4.6, 6.5, 2.2, 3.0]],
  // D (→24.2, sem 11.7→13.6) sube por fuera (andamio) y camina sobre la cimbra: casetón, malla, arranques de castillos PA; el colado barre del jardín a la calle
  [[21.8, 6.20, 2.50, 1.6, 8.4, 2.6, 2.0], [22.6, 7.20, 4.25, 0.55, 9.0, 2.6, 4.6], [23.4, 8.30, 4.30, 4.4, 5.0, 2.6, 3.0], [24.2, 7.60, 4.35, 9.6, 5.0, 2.7, 14.0]],
  // E (→38.8, sem 13.6→17.85) muros PA cuarto por cuarto, siempre por las puertas: sala TV (banda alta de la sala sobre T1), recámara 3 (muros de concreto MC1 y MC2,
  // baño y vestidor), recámara 2 y su vestidor, pasillo, recámara principal hacia el balcón y el vestidor principal; vuelve al pasillo cuando sube la cimbra de la 5.60
  [[25.2, 6.00, 4.40, 9.4, 4.0, 3.9, 3.65], [26.0, 7.00, 4.40, 8.9, 9.6, 3.6, 4.8], [26.7, 8.10, 4.40, 8.55, 8.6, 3.8, 5.0],
    [27.1, 8.10, 4.40, 7.3, 9.6, 3.6, 4.0], [27.5, 9.30, 4.40, 6.0, 10.8, 3.6, 2.4], [28.3, 8.40, 4.40, 3.3, 7.9, 3.5, 0.6], [29.1, 8.10, 4.40, 8.55, 6.0, 3.8, 11.0],
    [29.9, 5.33, 4.40, 10.9, 5.33, 3.6, 14.0], [30.6, 5.33, 4.40, 12.4, 3.2, 3.7, 15.5], [31.4, 4.70, 4.40, 13.4, 2.6, 3.6, 17.4],
    [32.2, 3.40, 4.40, 15.0, 1.43, 4.1, 12.8], [33.0, 5.33, 4.40, 12.6, 6.2, 3.8, 12.6], [33.6, 5.33, 4.40, 10.95, 7.0, 3.8, 12.0],
    [34.2, 6.45, 4.40, 11.25, 6.4, 3.8, 13.5], [34.8, 6.33, 4.40, 12.7, 6.33, 3.6, 16.0], [35.4, 6.33, 4.40, 14.6, 8.0, 3.6, 18.4], [36.1, 6.70, 4.40, 15.3, 9.6, 3.4, 18.5],
    [36.8, 8.40, 4.40, 15.2, 10.8, 3.6, 14.3], [37.4, 6.40, 4.40, 14.6, 6.33, 3.8, 11.0], [38.0, 6.33, 4.40, 13.0, 6.9, 3.8, 10.0],
    [38.8, 7.20, 4.40, 9.2, 4.2, 3.0, 6.0]],
  // F (→41.2, sem 17.85→18.6) cimbra de la 5.60: el bosque de 5.35 m de la sala desde PA, el pie de la escalera y la subida
  [[39.6, 7.80, 4.40, 10.4, 9.0, 4.40, 10.95], [40.0, 7.90, 4.40, 10.95, 11.2, 4.6, 10.95],
    [40.4, 10.40, 5.10, 10.95, 12.0, 5.3, 10.1], [40.8, 11.85, 5.75, 10.2, 9.6, 5.9, 9.1], [41.2, 9.60, 7.15, 9.1, 6.5, 6.9, 9.7]],
  // G (→42.8, sem 18.6→19.8) sobre el armado de la 5.60 y su colado (cruza y = 8.14 antes de que suba el muro del volumen)
  [[42.0, 7.60, 7.20, 8.6, 5.5, 5.4, 13.0], [42.8, 5.00, 7.20, 6.6, 6.0, 5.4, 15.0]],
  // H (→47.4, sem 19.8→24.2) terraza: muros del volumen, pretiles y subida a 10 m para ver el armado y el colado de la azotea
  [[43.6, 4.20, 7.20, 9.0, 6.0, 6.4, 12.0], [44.6, 4.30, 7.20, 10.2, 5.67, 6.5, 11.0], [45.4, 3.00, 7.20, 6.0, 6.5, 6.6, 12.0],
    [46.4, 3.40, 10.0, 7.8, 8.4, 7.9, 12.0], [47.4, 4.40, 10.0, 11.0, 8.6, 8.1, 12.0]],
  // I (→53.6, sem 24.2→40) aplanado sobre el mismo muro, pérgola, jacuzzi, bajada por fuera, jardín, cocina y entrega
  [[48.4, 3.20, 7.20, 9.0, 5.67, 6.2, 11.8], [49.2, 5.00, 7.20, 9.6, 9.0, 6.2, 5.0], [49.9, 3.90, 7.20, 8.2, 4.0, 6.2, 3.0], [50.5, 4.50, 7.25, 4.6, 4.5, 2.0, 0.5],
    [51.1, 4.50, 5.40, 1.8, 4.6, 2.6, 6.0], [51.7, 6.00, 1.70, 1.6, 4.4, 1.5, 6.0], [52.3, 8.50, 1.70, 2.6, 9.6, 1.1, 5.4], [52.7, 8.30, 1.75, 4.15, 9.9, 0.9, 5.4],
    [53.3, 7.25, 1.70, 4.25, 2.0, 1.5, 7.8], [53.6, 7.20, 1.70, 8.1, 2.2, 1.5, 4.2]],
];
const SH = 7.4;   // lo que se alargó el tramo A
for (const t of TRAMOS.slice(1)) for (const k of t) k[0] += SH;
const LEGS = TRAMOS.map((t, i) => ({ keys: i ? [TRAMOS[i - 1][TRAMOS[i - 1].length - 1], ...t] : t }));
for (const leg of LEGS) {
  const P = leg.keys.map((k) => PL(k[1], k[2], k[3])), L = leg.keys.map((k) => PL(k[4], k[5], k[6]));
  leg.pos = new THREE.CatmullRomCurve3(P, false, 'centripetal'); leg.look = new THREE.CatmullRomCurve3(L, false, 'centripetal');
  leg.v0 = leg.keys[0][0]; leg.v1 = leg.keys[leg.keys.length - 1][0];
}
LEGS[0].even = LEGS[1].even = LEGS[4].even = true;   // A (cimentación paso a paso), B (planta baja con el estudio) y E (planta alta cuarto por cuarto)
function walkAt(v) {
  const leg = LEGS.find((l) => v <= l.v1) || LEGS[LEGS.length - 1];
  // el suavizado de entrada y salida es de todo el tramo: en B y E (cuarto por cuarto) casi no se aplica, para que el paso sea parejo
  const t = clamp((v - leg.v0) / (leg.v1 - leg.v0), 0, 1), te = lerp(t, ease(t), leg.even ? 0.06 : 0.35), vv = lerp(leg.v0, leg.v1, te);
  const k = leg.keys; let i = 0; while (i < k.length - 2 && vv > k[i + 1][0]) i++;
  const u = (i + clamp((vv - k[i][0]) / (k[i + 1][0] - k[i][0]), 0, 1)) / (k.length - 1);
  return { P: leg.pos.getPoint(u), L: leg.look.getPoint(u) };
}
const V_END = LEGS[LEGS.length - 1].v1;   // 61.0, la entrega
// la semana en cada punto del scroll. La zambullida termina en la semana 0: el terreno vacío. La obra empieza a moverse cuando la cámara ya está en la calle.
const W_DIVE = 0;
const WEEK_KEYS = [
  [6.0, W_DIVE], [6.8, 0.5], [7.6, 1.05], [8.5, 1.6], [9.4, 2.15], [10.3, 2.65], [11.2, 3.15], [12.0, 3.7], [12.8, 4.2], [13.6, 4.6], [14.4, 5.0], [15.2, 5.45],
  [15.9, 5.85], [16.2, 6.0], [17.0, 6.4],
  ...[[10.5, 6.9], [11.4, 7.95], [12.6, 8.4], [13.4, 8.65], [14.0, 8.85], [14.4, 9.0], [14.8, 9.15],
  [15.6, 9.45], [16.4, 9.75], [16.8, 9.88], [17.2, 10.0], [18.0, 10.3], [19.0, 10.6], [19.8, 11.0], [21.0, 11.7], [22.6, 12.4], [24.2, 13.6],
  [25.2, 13.9], [26.0, 14.15], [26.7, 14.35], [27.1, 14.45], [27.5, 14.6], [28.3, 14.9], [29.1, 15.2], [29.9, 15.5], [30.6, 15.75], [31.4, 16.05],
  [32.2, 16.3], [33.0, 16.5], [33.6, 16.65], [34.2, 16.8], [34.8, 16.95], [35.4, 17.1], [36.1, 17.3], [36.8, 17.5], [37.4, 17.6], [38.0, 17.7], [38.8, 17.85],
  [39.6, 18.0], [41.2, 18.6], [42.8, 19.8], [43.6, 20.4], [44.6, 21.0], [45.4, 21.9], [46.4, 23.2], [47.4, 24.2], [48.4, 25.2],
  [49.2, 26.0], [49.9, 27.0], [50.5, 28.6], [51.1, 30.0], [51.7, 32.5], [52.3, 35.0], [52.7, 36.5], [53.3, 38.8], [53.6, 40.0]].map(([v, w]) => [v + SH, w]),
];
function weekAt(v) {
  if (v <= WEEK_KEYS[0][0]) return WEEK_KEYS[0][1];
  for (let i = 1; i < WEEK_KEYS.length; i++) if (v <= WEEK_KEYS[i][0]) {
    const [a, wa] = WEEK_KEYS[i - 1], [b, wb] = WEEK_KEYS[i];
    return lerp(wa, wb, sm(0, 1, (v - a) / (b - a)) * 0.35 + (v - a) / (b - a) * 0.65);
  }
  return WEEKS;
}
// face: la cámara sale de la casa, sube sobre ella y baja a la calle frente a la fachada; faceHold: se queda ahí; out: sale a la hoja
const E0 = V_END;
const END = { face: [E0, E0 + 1.5], faceHold: [E0 + 1.5, E0 + 2.1], out: [E0 + 2.1, E0 + 3.8], unpour: [E0 + 3.8, E0 + 4.8], zoom: [E0 + 4.8, E0 + 5.9], total: E0 + 6.5 };
const KW = toK(...(() => { const w = walkAt(V_END); return [w.P, w.L, EYE_FOV]; })());
const KF = toK(PL(4.0, 1.65, 29.6), PL(6.7, 3.5, 19.3), EYE_FOV);   // la fachada principal desde la calle (eje 9)
// del final del recorrido (dentro de la cocina) la cámara sale por la puerta del jardín por donde entró, sube por detrás de la casa, la
// sobrevuela y baja a la calle frente a la fachada. Llaves [t 0–1, ojo x, altura, y, mira x, altura, y] del plano, curva suave como LEGS.
const FACE_KEYS = [
  [0, 7.20, 1.70, 8.10, 2.2, 1.5, 4.2], [0.12, 8.30, 1.75, 5.2, 8.4, 1.7, 2.0], [0.24, 8.35, 1.75, 3.6, 8.0, 1.8, 0.0], [0.34, 7.00, 2.3, 1.8, 6.5, 2.5, 8.0],
  [0.46, 6.20, 4.2, -1.2, 6.5, 3.0, 10.0], [0.58, 6.50, 8.0, 0.8, 7.0, 3.0, 12.0], [0.72, 7.30, 13.5, 8.0, 7.2, 3.0, 17.0], [0.88, 5.2, 12.5, 27.5, 6.9, 3.4, 19.4], [1.0, 4.0, 1.65, 29.6, 6.7, 3.5, 19.3],
];
const FACE_P = new THREE.CatmullRomCurve3(FACE_KEYS.map((k) => PL(k[1], k[2], k[3])), false, 'centripetal');
const FACE_L = new THREE.CatmullRomCurve3(FACE_KEYS.map((k) => PL(k[4], k[5], k[6])), false, 'centripetal');
function faceAt(f) {
  const t = lerp(f, ease(f), 0.35), n = FACE_KEYS.length;
  let i = 0; while (i < n - 2 && t > FACE_KEYS[i + 1][0]) i++;
  const u = (i + clamp((t - FACE_KEYS[i][0]) / (FACE_KEYS[i + 1][0] - FACE_KEYS[i][0]), 0, 1)) / (n - 1);
  return toK(FACE_P.getPoint(u), FACE_L.getPoint(u), EYE_FOV);
}

// los puntales se dejan pasillo donde pasa la cámara: muestras de su camino cada 0.1 de scroll
const SAMPLES = [];
for (let v = DIVE; v <= V_END + 1e-6; v += 0.1) { const w = walkAt(v); SAMPLES.push({ x: w.P.x, y: w.P.y, z: w.P.z, w: weekAt(v) }); }

const R = makeMaterials(T, ENV);
const scene = new THREE.Scene();
scene.add(await buildWorld({ R, T, phone: PHONE, samples: SAMPLES }, stepRange(0.5, 0.62)));
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
let shadowKey = '', faceK = 0;   // faceK: 1 cuando la cámara mira la fachada a la calle (el sol se refleja hacia ella)
const SUN_FACE = sunDir(148, 21);
function lightFor(week) {
  const pm = sm(27, 36, week);
  const dir = SUN_AM.clone().lerp(SUN_MID, sm(16.5, 18.5, week)).normalize().lerp(SUN_PM, pm).normalize().lerp(SUN_FACE, faceK).normalize();
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
  R.led.emissiveIntensity = 2.4 * sm(37, 39.5, week);
  const key = (Math.round(week * 25) / 25).toFixed(2) + ',' + faceK.toFixed(2);
  if (key !== shadowKey) { shadowKey = key; renderer.shadowMap.needsUpdate = true; }
}

// ---------------------------------------------------------------- calentamiento detrás del cargador
const screenRect = () => ({ x: 0, y: 0, w: W, h: H });
// compila los sombreadores de cada conjunto (papel, normales y sitio) sin bloquear el hilo, con el destino que usará cada uno
const setOf = (set) => scene.traverse((o) => {
  if (!o.isMesh) return;
  const s = o.userData.sets;
  if (!s) { o.visible = set === 'main'; return; }
  if (!s[set]) o.visible = false; else { o.visible = true; o.material = s[set]; }
});
{
  const sets = [['paper', pipe.paperRT, 0.66], ['nd', pipe.ndRT, 0.71], ['main', pipe.comp.readBuffer, 0.76]];
  for (const [set, rt, p] of sets) {
    setOf(set); renderer.setRenderTarget(rt);
    await renderer.compileAsync(scene, cam);
    renderer.setRenderTarget(null);
    setP(p); await raf();
  }
}
pipe.draw(TILES.map((t, i) => ({ rect: REST[i], cam: K0, now: t.w1, newFrom: t.w0 })));
setP(0.78); await raf();
{
  const warm = [[WEEKS, KW], [WEEKS, KF], [18, K3], [5.2, K3], [2.5, K3], [W_DIVE, K1]];
  for (let i = 0; i < warm.length; i++) {
    const [w, k] = warm[i];
    faceK = k === KF ? 1 : 0; U.real.value = w; lightFor(w); renderer.shadowMap.needsUpdate = true;
    pipe.real({ cam: k, rect: screenRect() });
    setP(0.78 + 0.16 * (i + 1) / warm.length); await raf();
  }
}
faceK = 0;
await document.fonts.ready;
setP(1);
// el cargador termina de llenarse solo (sube a lo más 90 % por segundo); el tope evita esperar si la pestaña está oculta
if (!OFFLINE) { const tw = performance.now(); while (SEQ.shown < 0.995 && performance.now() - tw < 5000) await raf(); SEQ.shown = Math.max(SEQ.shown, 1); }

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
  { p: PL(3.0, -1.05, 11.82), t: '-1.05 FONDO DE CEPA', dx: -26, dy: 30 },
  { p: PL(1.43, -0.80, 6.0), t: 'ZAPATA CORRIDA 0.90 × 0.20 M', dx: -28, dy: 40, acc: true },
  { p: PL(12.49, -0.4, 9.0), t: 'CONTRATRABE 0.20 × 0.77 M', dx: 24, dy: 34 },
  { p: PL(9.73, -2.05, 16.9), t: 'CISTERNA 5,000 L · FONDO -2.20', dx: 30, dy: 34 },
  { p: PL(7.66, -1.0, 3.65), t: 'ZAPATA AISLADA 1.50 × 1.50 M · C2', dx: 26, dy: -34 },
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
// cuartos de planta baja y alta (rectángulos de plano de los ZONES de index.html): el letrero dice en cuál va la cámara
const ROOMS = [
  [0, 'Vestíbulo', 5.82, 11.82, 9.03, 13.86], [0, 'Estudio', 1.43, 11.82, 5.82, 16.61], [0, 'Comedor', 1.43, 8.26, 5.82, 11.82],
  [0, 'Sala', 1.43, 3.65, 7.4, 8.26], [0, 'Cocina', 7.4, 3.65, 12.6, 7.08], [0, 'Pasillo y escalera', 5.82, 8.26, 12.6, 11.82],
  [0, 'Andador de acceso', 5.82, 13.86, 6.93, 19.93], [0, 'Cochera', 6.93, 13.86, 12.6, 19.93], [0, 'Jardín', -0.3, -0.3, 9.03, 3.65],
  [1, 'Baño de la recámara 3', 7.56, 0, 12.49, 1.8], [1, 'Vestidor de la recámara 3', 10.25, 1.8, 12.49, 3.63], [1, 'Salita de la recámara 3', 7.56, 1.8, 10.25, 3.63],
  [1, 'Recámara 3', 7.56, 3.63, 12.49, 8.23], [1, 'Sala TV', 1.43, 8.26, 6.6, 11.8], [1, 'Pasillo', 6.6, 8.23, 9.21, 13.84], [1, 'Pasillo', 5.79, 11.8, 6.6, 13.84],
  [1, 'Vestidor de la recámara 2', 1.43, 16.14, 3.91, 18.21], [1, 'Recámara 2', 1.43, 11.8, 5.79, 18.21], [1, 'Baño completo', 9.21, 11.8, 12.49, 13.84],
  [1, 'Recámara principal', 5.79, 13.84, 9.83, 18.69], [1, 'Vestidor principal', 9.83, 13.84, 12.49, 16.14], [1, 'Baño principal', 9.83, 16.14, 12.49, 19.93],
  [1, 'Balcón', 5.79, 18.69, 9.86, 20.03],
];
const roomAt = (x, y, eye) => {
  const lv = eye < 2.6 ? 0 : eye < 5.4 ? 1 : 2, r = ROOMS.find((q) => q[0] === lv && x >= q[2] && x <= q[4] && y >= q[3] && y <= q[5]);
  return r ? ' · ' + r[1] : '';
};
const rowOf = (w) => { let n = PROG[0][0]; for (const [name, a] of PROG) if (w >= a) n = name; return n; };
const fmt = (n) => n.toLocaleString('es-MX');
function chipFor(v, week, pour, diving) {
  const wk = `Semana ${pad(clamp(Math.ceil(week - 1e-3), 1, WEEKS))} &nbsp;//&nbsp; `;
  if (v >= END.zoom[0] + 0.3) return '';
  if (v >= V_END + 0.15 && v < END.out[0]) return 'Semana 40 &nbsp;//&nbsp; <i>Entrega · fachada a la calle</i>';
  if (v >= END.out[0] + 0.15) return `Dibujo 06 &nbsp;//&nbsp; ${TILES[5].name} &nbsp;//&nbsp; <i>Sem ${pad(TILES[5].w0 + 1)}–40</i>`;
  if (v > DIVE + 0.5) {
    if (week >= 39.8) return 'Semana 40 &nbsp;//&nbsp; <i>Entrega</i>';
    const n = propsAt(week);
    // la planta según la altura del ojo
    const P = walkAt(v).P, eye = P.y, floor = week < 6.3 ? 'Cimentación' : (eye < 2.6 ? 'Planta baja' : eye < 5.4 ? 'Planta alta' : 'Terraza') + roomAt(P.x + CX, P.z + CZ, eye);
    const pre = wk + (PHONE ? '' : floor + ' &nbsp;//&nbsp; ');
    const B = WORLD.blocksAt ? WORLD.blocksAt(week) : null;   // { pb: [n, N], pa: [n, N], t: [n, N] }
    const pz = (k, txt) => (B && B[k] && B[k][0] > 0 ? `${txt} · ${fmt(B[k][0])} de ${fmt(B[k][1])} piezas` : txt);
    let t;
    if (week < 0.55) t = 'Trazo y nivelación · cal, niveletas e hilos';
    else if (week < 1.2) t = 'Despalme y excavación de cepas · fosa de la cisterna';
    else if (week < 1.75) t = 'Afine de cepas y plantilla de concreto pobre · 5 cm';
    else if (week < 2.3) t = 'Acero de zapatas · parrilla y fronteras de madera';
    else if (week < 2.8) t = 'Colado de zapatas · armado de contratrabes';
    else if (week < 3.6) t = 'Cimbra y colado de contratrabes · anclas de castillo';
    else if (week < 4.05) t = 'Descimbrado e impermeabilizante asfáltico';
    else if (week < 4.45) t = 'Relleno compactado en capas';
    else if (week < 4.8) t = 'Drenaje sanitario · tubo de PVC en zanja y registros';
    else if (week < 5.2) t = 'Barrera de vapor · polietileno negro con traslapes';
    else if (week < 5.6) t = 'Malla electrosoldada 6×6-10/10 · calzas y poliducto';
    else if (week < 5.9) t = 'Cisterna de 5,000 L · colado de la tapa';
    else if (week < 6.3) t = 'Firme de planta baja · 10 cm';
    else if (week < 10.6) t = pz('pb', 'Muros de block 15 × 20 × 40 · hilada por hilada');
    else if (week < 11.2) t = `Cimbra de losa N.P.T. 2.80${n ? ` · ${n} puntales` : ''}`;
    else if (week < 12.5) t = 'Armado de losa · casetón, nervaduras y malla';
    else if (week < 13.6) t = 'Colado de losa N.P.T. 2.80';
    else if (week < 17.2) t = pz('pa', 'Muros de block de planta alta · castillos y dalas');
    else if (week < 17.9) t = `Cimbra de losa N.P.T. 5.60${n ? ` · ${n} puntales` : ''}`;
    else if (week < 18.8) t = 'Armado de losa N.P.T. 5.60';
    else if (week < 19.8) t = 'Colado de losa N.P.T. 5.60';
    else if (week < 22.6) t = pz('t', 'Muros y pretiles de la terraza');
    else if (week < 23.8) t = 'Cimbra y armado de azotea N.P.T. 8.20';
    else if (week < 24.5) t = 'Colado de azotea';
    else if (week < 28.0) t = 'Aplanados de mortero · cubren el block';
    else if (week < 31.2) t = 'Cancelería y barandales de vidrio';
    else if (week < 33.0) t = 'Pisos · duela de roble y travertino';
    else if (week < 34.6) t = 'Terraza · deck, jacuzzi y pérgola';
    else if (week < 36.0) t = 'Jardín';
    else if (week < 37.6) t = 'Cocina · isla y bancos';
    else t = 'Sala · doble altura';
    return pre + '<i>' + t + '</i>';
  }
  if (v > DIVE * 0.93 || pour > 0) return 'Semana 01 &nbsp;//&nbsp; <i>El terreno, antes del trazo</i>';
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
  const facing = !ending && sv > V_END;
  const live = ending ? 5 : 0;
  let z, c, pour, l = 0, k, week, realOnly, rectL;
  const Rl = REST[live], sC = Math.max(W / Rl.w, H / Rl.h);
  const cL = { x: Rl.x + Rl.w / 2, y: Rl.y + Rl.h / 2 }, c1 = { x: W / 2, y: H / 2 };
  const F = { x: (c1.x - cL.x * sC) / (1 - sC), y: (c1.y - cL.y * sC) / (1 - sC) };
  const coverH = Rl.h * sC;
  if (!ending) {
    z = ease(sm(0.035, 0.24, ps)); c = sm(0.23, 0.40, ps);
    pour = lerp(-0.8, 5.6, clamp((ps - 0.36) / 0.30, 0, 1));
    l = clamp((ps - 0.62) / (0.975 - 0.62), 0, 1);
    week = sv > DIVE ? weekAt(sv) : W_DIVE;   // mientras el terreno se dibuja, la obra no se mueve
    realOnly = pour >= 5.55;
    k = c > 0 ? lerpK(K0, K1, c) : K0;
    if (l > 0) k = lerpK(K1, K3, l, { f: sm(0, 0.62, l), e: sm(0.22, 1, l), T: sm(0.18, 1, l), h: sm(0.18, 1, l) });
    if (sv > DIVE) { const w = walkAt(sv); k = toK(w.P, w.L, EYE_FOV); }
    if (facing) {   // KW -> jardín -> sobre la casa -> KF
      const f = clamp((sv - END.face[0]) / (END.face[1] - END.face[0]), 0, 1);
      k = faceAt(f);
      week = WEEKS;
    }
  } else {
    week = WEEKS;
    const lo = clamp((sv - END.out[0]) / (END.out[1] - END.out[0]), 0, 1);
    const lu = clamp((sv - END.unpour[0]) / (END.unpour[1] - END.unpour[0]), 0, 1);
    const lz = clamp((sv - END.zoom[0]) / (END.zoom[1] - END.zoom[0]), 0, 1);
    const K06s = { T: K0.T, az: K0.az, el: K0.el, h: K0.h * H / coverH, fov: 2 };
    k = lerpK(KF, K06s, lo, { f: sm(0, 0.78, lo), e: sm(0.3, 1, lo), T: sm(0.22, 1, lo), h: sm(0.22, 1, lo) });
    pour = lerp(WEEKS + 0.8, -1.8, ease(lu));
    realOnly = lu <= 0;
    z = 1 - ease(lz); c = lz > 0 ? 1 : 0;
    if (lz > 0) k = K0;
  }
  if (WQ !== null) week = WQ;
  faceK = facing ? sm(0.45, 1, clamp((sv - END.face[0]) / (END.face[1] - END.face[0]), 0, 1)) : ending ? 1 - sm(END.out[0], END.out[0] + 0.7, sv) : 0;
  U.real.value = week; lightFor(week); scene.userData.week = week;

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
    const inHouse = sv > DIVE + 4 && !ending ? 1 - sm(V_END, V_END + 0.4, sv) : 0;
    const dens = inHouse * (0.018 * sm(17.6, 18.4, week) * (1 - sm(23.0, 24.0, week)) + 0.006 * sm(37, 39, week));
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
  // tramo face: la cámara sale por la puerta del jardín, sobrevuela la casa y baja a la calle (casa terminada, semana final)
  for (let u = 0; u < 1 - 1e-6; u += 0.004) {
    const P = FACE_P.getPoint(u), d = FACE_P.getPoint(u + 0.004).sub(P), len = d.length(); nSamples++;
    const name = (h) => names.get(h.object.material) || '?', v = +(END.face[0] + u * (END.face[1] - END.face[0])).toFixed(2);
    const h = probe(P, d.clone().normalize(), len + 0.05, WEEKS);
    if (h) out.crash.push({ v, face: true, obj: name(h), dist: +h.distance.toFixed(2), at: [+h.point.x.toFixed(2), +h.point.y.toFixed(2), +h.point.z.toFixed(2)] });
    for (const dr of dirs) { const g = probe(P, dr, 0.25, WEEKS); if (g) { out.graze.push({ v, face: true, obj: name(g), dist: +g.distance.toFixed(2), at: [+g.point.x.toFixed(2), +g.point.y.toFixed(2), +g.point.z.toFixed(2)] }); break; } }
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
