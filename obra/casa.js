// Basado en flat-to-3d/04-build-time-lapse de Sam Aing (MIT), ver LICENSE-flat-to-3d.txt (el motor de partes).
// Copiado de index.html el 2026-11-04 (bloque declarativo de arquitectura, líneas 605–802: de floor([[0, 0] hasta antes de "puerta del acceso"; incluye losas al paño y la sección fachada), SIN editar coordenadas.
// Motor: los grupos fachPB/fachPA/fachT dan partes k 'fachada' (world.js las reparte por material); la hoja de la puerta pivotante va en extras().
// Si cambia el plano, recopiar el bloque (entre las marcas "inicio del bloque copiado" y "fin del bloque copiado").
//
// Aquí el bloque corre contra OTRA implementación de wall(), slab(), floor(), box() y rect(): no crean mallas de three.js
// sino "partes" ({ b:[x0,y0,z0,x1,y1,z1] en mundo, m, k, lvl }) que world.js reparte en semanas, como houseParts() de la referencia.
// Se omitió la línea 604 (paperFloor de ±420 m), las líneas `await LDstep(...)` del cargador (solo index) y las hojas de puertas y portones de index.html (aquí van sin hojas: la cámara pasa).

export const CX = 6.245, CZ = 9.965;                          // misma P() que index.html línea 205
const W2 = (x, y) => [x - CX, y - CZ];                        // plano (x, y) -> mundo [x, z]

// ---- fichas para que el bloque corra sin cambios
// los grupos que el bloque crea con new THREE.Group() se nombran por orden de creación: paIn, up3, perg y los tres de la fachada
const NOMBRES = ['paIn', 'up3', 'perg', 'fachPB', 'fachPA', 'fachT'];
class Grp { constructor(n) { this.n = n || NOMBRES.shift(); } add() {} }
const THREE = { Group: Grp };
const scene = new Grp('scene'), up1 = new Grp('up1'), up2 = new Grp('up2'), riseGrp = new Grp('riseGrp');
const MAT = {
  wall: 'plaster', fence: 'block', fenceL: 'block', woodClad: 'walnut', tile: 'oak', paver: 'travertine',
  conc: 'conc', grass: 'grass', frame: 'steel', wood: 'teak', casing: 'white',
  plasterW: 'plaster', grayPanel: 'grayPanel', fluted: 'fluted', woodSoffit: 'woodSoffit', stoneLight: 'travertine',
  black: 'dark', led: 'led', pebble: 'gravel',
};
const mat = new Proxy(MAT, { get: (t, k) => { if (!(k in t)) throw new Error('casa.js: mat.' + String(k) + ' sin equivalente'); return t[k]; } });
const M = () => 'stairSteel';                                 // el acero de los peldaños (k 'stair')

const parts = [];
export const WALLS = [];                                      // registro de muros para block.js (obra gruesa): ver wall()
export const footWalls = [];                                  // muros de planta baja con cimiento: { a:[x,z], b:[x,z], t }
export const LV = [2.55, 5.35];                                    // alturas absolutas donde se corta cada caja (ninguna cruza niveles)
const lvlOfY = (y) => (y < LV[0] ? 0 : y < LV[1] ? 1 : 2);

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];   // igual que index.html línea 515

function put(b, m, k, extra = {}) {
  if (b[3] - b[0] < 1e-4 || b[4] - b[1] < 1e-4 || b[5] - b[2] < 1e-4) return null;
  const p = { t: 'box', b, m, k, lvl: lvlOfY((b[1] + b[4]) / 2), ...extra };
  parts.push(p); return p;
}
// una caja cortada en las alturas de nivel
function putCut(b, m, k, extra) {
  const ys = [b[1], ...LV.filter((y) => y > b[1] + 1e-6 && y < b[4] - 1e-6), b[4]];
  for (let i = 0; i < ys.length - 1; i++) put([b[0], ys[i], b[2], b[3], ys[i + 1], b[5]], m, k, extra);
}

// recorte de huecos de la referencia (world.js 486–499): a0..a1 a lo largo, b0..b1 en altura
const carve = (a0, a1, b0, b1, holes) => {
  const cuts = [...new Set([a0, a1, ...holes.flatMap((h) => [h[0], h[1]])].filter((v) => v >= a0 && v <= a1))].sort((p, q) => p - q);
  const out = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const p0 = cuts[i], p1 = cuts[i + 1], mid = (p0 + p1) / 2;
    const hs = holes.filter((h) => h[0] < mid && h[1] > mid).map((h) => [h[2], h[3]]).sort((p, q) => p[0] - q[0]);
    let y = b0;
    for (const [q0, q1] of hs) { if (q0 > y) out.push([p0, p1, y, q0]); y = Math.max(y, q1); }
    if (y < b1) out.push([p0, p1, y, b1]);
  }
  return out;
};

function floor(pts, m, y = 0, parent = scene, holes = []) {
  const p = { t: 'floor', pts: pts.map((q) => W2(...q)), holes: holes.map((h) => h.map((q) => W2(...q))), m, y, lvl: y < 2.5 ? 0 : y < 5.3 ? 1 : 2 };
  parts.push(p); return p;
}
function slab(outer, holes, y, d, m, parent) {
  const p = { t: 'slab', outer: outer.map((q) => W2(...q)), holes: holes.map((h) => h.map((q) => W2(...q))), y, d, m, k: 'slab', lvl: y < 4 ? 1 : y < 6.5 ? 2 : 3 };
  parts.push(p); return p;
}
// devuelve el objeto de la parte: si el bloque le pone visible = false se descarta (casaParts lo filtra)
function box(w, h, d, px, py, yb, m, parent = riseGrp, ry = 0) {
  const [x, z] = W2(px, py);
  const b = [x - w / 2, yb, z - d / 2, x + w / 2, yb + h, z + d / 2];
  let k = 'struct', mm = m;
  if (parent.n && parent.n.startsWith('fach')) k = 'fachada';
  else if (m === 'stairSteel') { k = 'stair'; mm = 'steel'; }
  else if (parent.n === 'perg') k = 'pergola';
  else if (parent.n === 'up2' && m === 'steel') k = 'columna';
  else if (parent.n === 'up2' && m === 'teak') k = 'pergola';
  return put(b, mm, k, { st: parent.n === 'paIn' ? 2 : 1 }) || {};
}

// vidrio con cancelería, como glazing() de index.html líneas 576–584: parteluces ≤1.5 m de 5 cm, travesaños y vidrio de 2 cm
function glazing(ax, c, t, u0, u1, y0, y1, transom) {
  const w = u1 - u0, dp = Math.max(0.05, t * 0.55);
  const bx = (a0, a1, q0, q1, dd, m, k) => (ax === 0 ? put([a0, q0, c - dd / 2, a1, q1, c + dd / 2], m, k) : put([c - dd / 2, q0, a0, c + dd / 2, q1, a1], m, k));
  bx(u0, u1, y0, y1, 0.02, 'glass', 'glass');
  const n = Math.max(1, Math.ceil(w / 1.5));
  for (let i = 0; i <= n; i++) { const x = u0 + w * i / n; bx(x - 0.025, x + 0.025, y0, y1, dp, 'steel', 'frame'); }
  bx(u0, u1, y0, y0 + 0.05, dp, 'steel', 'frame'); bx(u0, u1, y1 - 0.05, y1, dp, 'steel', 'frame');
  if (transom && transom < y1) bx(u0, u1, transom - 0.025, transom + 0.025, dp, 'steel', 'frame');
}
// puertas: solo jambas y cabezal (como door() de index.html 571–573), sin hojas
function doorFrame(ax, c, t, u0, u1, hd, type, y0) {
  const dd = t + 0.02, m = type === 'main' || type === 'ext' ? 'steel' : 'white';
  const bx = (a0, a1, q0, q1) => (ax === 0 ? put([a0, q0, c - dd / 2, a1, q1, c + dd / 2], m, 'dframe') : put([c - dd / 2, q0, a0, c + dd / 2, q1, a1], m, 'dframe'));
  bx(u0, u0 + 0.04, y0, y0 + hd); bx(u1 - 0.04, u1, y0, y0 + hd); bx(u0, u1, y0 + hd - 0.04, y0 + hd);
}

/* muro: a,b en plano; open = [[ini, fin, tipo, antepecho, dintel, giro, abierta]] medidos desde a (el sentido puede ser negativo) */
function wall(a, b, o = {}) {
  const { h = 2.55, t = 0.15, base = 0, open = [], m = mat.wall, transom, parent } = o;
  const A = W2(...a), B = W2(...b);
  const ax = Math.abs(B[0] - A[0]) >= Math.abs(B[1] - A[1]) ? 0 : 1;   // 0: corre en x, 1: corre en z
  const c = A[1 - ax], sg = Math.sign(B[ax] - A[ax]) || 1, lo = Math.min(A[ax], B[ax]), hi = Math.max(A[ax], B[ax]);
  const abs = (o_) => A[ax] + sg * o_;
  const barda = m === 'block' || (base === 0 && a[1] === 19.93 && b[1] === 19.93);
  const holes = [], ops = [];
  for (const [o0, o1, type, sill = 0, head] of open) {
    const hd = head ?? (type === 'glass' ? h : type === 'window' ? 2.3 : 2.2);
    const u0 = Math.min(abs(o0), abs(o1)), u1 = Math.max(abs(o0), abs(o1));
    holes.push([u0, u1, base + sill, base + hd]); ops.push({ u0, u1, type, sill, hd });
  }
  // registro para block.js: los muros con block (t >= 0.115) se parten en bandas y se levantan hilada por hilada.
  // nob: el faldón de la cochera (y = 19.93, base > 1.5) es la trabe T2, no lleva block.
  const wid = WALLS.length, nob = base > 1.5 && a[1] === 19.93 && b[1] === 19.93;
  const bl = !nob && t >= 0.115 && (m === 'plaster' || m === 'block' || m === 'walnut') && hi - lo >= 0.25 && h >= 0.3;
  WALLS.push({ wid, a: A, b: B, ax, c, lo, hi, base, h, t, m, holes: holes.map((q) => [...q]), barda, bl, nob, par: (parent && parent.n) || 'scene' });
  for (const [p0, p1, q0, q1] of carve(lo, hi, base, base + h, holes)) {
    const bb = ax === 0 ? [p0, q0, c - t / 2, p1, q1, c + t / 2] : [c - t / 2, q0, p0, c + t / 2, q1, p1];
    putCut(bb, m, nob ? 'trabe' : barda ? 'barda' : 'struct', nob ? { tr: 'T2' } : bl ? { wid } : {});
  }
  for (const { u0, u1, type, sill, hd } of ops) {
    if (type === 'window' || type === 'glass') glazing(ax, c, t, u0, u1, base + sill, base + hd, transom);
    else if (type === 'door' || type === 'doorR' || type === 'main' || type === 'ext') doorFrame(ax, c, t, u0, u1, hd, type, base);
  }
  if (base === 0 && (h > 1.5 || barda)) footWalls.push({ a: A, b: B, t, barda });
  return {};
}

// ================================================================ inicio del bloque copiado
floor([[0, 0], [9.03, 0], [9.03, 3.65], [1.43, 3.65], [1.43, 18.21], [0, 18.21]], mat.grass, 0.0);
floor([[1.43, 3.65], [9.03, 3.65], [9.03, 0], [12.49, 0], [12.49, 13.86], [5.79, 13.86], [5.79, 18.21], [1.43, 18.21]], mat.tile, 0.005);
floor(rect(6.97, 13.86, 12.49, 19.93), mat.conc, 0.004);
floor(rect(5.79, 13.86, 6.97, 19.93), mat.paver, 0.004);
floor(rect(0, 18.21, 5.79, 19.93), mat.grass, 0.0);

/* ---------- alturas (N.P.T. del plano) ---------- */
const H1 = 2.55, F1 = 2.80, H2 = 2.55, F2 = 5.60, F3 = 8.20, LOSA = .25;

/* ---------- planta baja: muros (leídos del plano ARQ-01) ---------- */
const EXT = .2, PB = { h: H1 };
// envolvente
wall([1.43, 3.65], [1.43, 8.26], { h: F2 - LOSA, t: EXT });
wall([1.43, 8.26], [1.43, 18.21], { h: H1, t: EXT, open: [[1.14, 2.04, 'window', .9, 2.2], [4.22, 6.13, 'window', .9, 2.2]] });   // puerta comedor-jardín, ventana oficina
// fachada de la sala al jardín: el ventanal llega solo hasta la altura libre de planta baja (H1) y arriba, en la doble altura, es muro con cuatro ventanas chicas de .90 × .90 (de 3.60 a 4.50 m) centradas en los cuatro claros de la carpintería de abajo
wall([1.43, 3.65], [7.56, 3.65], { h: H1, t: EXT, cap: false, open: [[0.07, 6.06, 'glass', 0]] });                              // ventanal de planta baja
wall([1.43, 3.65], [7.56, 3.65], { h: F2 - LOSA - H1, base: H1, t: EXT, open: [.82, 2.31, 3.81, 5.31].map(c => [c - .45, c + .45, 'window', 1.05, 1.95]) });   // muro con ventanas chicas
wall([7.56, 3.65], [9.03, 3.65], { h: H1, t: EXT, open: [[0.47, 1.42, 'ext', 0, 2.2, -1, 1.45]] });                              // puerta cocina-jardín
wall([9.03, 0], [9.03, 2.63], { h: H1, t: EXT, open: [[0.15, 1.0, 'ext', 0, 2.2, -1, 1.45]] });                                  // puerta jardín-lavado
wall([9.03, 2.63], [9.03, 3.65], { h: H1, t: EXT, open: [[0.05, 0.97, 'glass', 0, 2.3]] });
wall([9.03, 0], [12.49, 0], { h: H1, t: EXT });
wall([12.49, 0], [12.49, 13.86], { h: H1, t: EXT });
wall([12.49, 13.86], [12.49, 19.93], { h: H1, t: EXT, m: mat.fence });
wall([6.97, 13.86], [12.49, 13.86], { h: H1, t: EXT, open: [[0.54, 1.48, 'door', 0, 2.2, -1, -1.45], [4.63, 5.28, 'doorR', 0, 2.2, -1, -1.45]] });  // cochera → vestíbulo, herramientas
wall([6.97, 13.86], [6.97, 19.93], { h: H1, t: .15 });
wall([1.43, 18.21], [5.79, 18.21], { h: H1, t: EXT, open: [[2.3, 3.3, 'window', 1.7, 2.2]] });
wall([5.79, 11.82], [5.79, 13.86], { h: H1, t: EXT, open: [[0.03, 1.04, 'door', 0, 2.2, 1, -1.45]] });                            // oficina desde vestíbulo
wall([5.79, 13.86], [5.79, 18.21], { h: H1, t: EXT, m: mat.woodClad });            // acceso independiente oficina
wall([5.79, 13.86], [6.97, 13.86], { h: H1, t: EXT, open: [[0.06, 1.12, 'main', 0, 2.35, 1, 1.4]] });                              // puerta principal (por confirmar)
// interiores
wall([1.43, 11.82], [5.79, 11.82], PB);
wall([4.42, 11.82], [4.42, 12.49], PB);
wall([1.43, 16.61], [5.79, 16.61], { ...PB, open: [[0.05, 0.8, 'door', 0, 2.2, 1, -1.45], [3.45, 4.28, 'doorR', 0, 2.2, 1, 1.45]] });
wall([2.97, 16.61], [2.97, 18.21], PB);
wall([9.03, 2.55], [12.49, 2.55], { ...PB, open: [[0.1, 1.04, 'door', 0, 2.2, -1, 1.45]] });
wall([9.03, 7.08], [9.03, 8.26], PB);
wall([9.03, 7.08], [12.49, 7.08], { ...PB, open: [[0.74, 1.37, 'open']] });
wall([9.03, 8.26], [12.49, 8.26], PB);
wall([9.03, 11.82], [12.49, 11.82], PB);
wall([9.03, 11.82], [9.03, 13.86], { ...PB, open: [[0.03, 0.86, 'door', 0, 2.2, -1, 1.45]] });
wall([10.82, 11.82], [10.82, 13.86], PB);
// bardas de colindancia
wall([0, 0], [0, 19.93], { h: 2.4, t: .15, m: mat.fenceL });
wall([0, 0], [9.03, 0], { h: 2.4, t: .15, m: mat.fence });
// barda al pie del terreno (2.10, aplanado blanco liso); la cochera queda abierta y el acceso peatonal lleva puerta pivotante
wall([0, 19.93], [4.78, 19.93], { h: 2.1, t: .2, m: mat.plasterW });
wall([6.88, 19.93], [7.02, 19.93], { h: 2.1, t: .2, m: mat.plasterW });
wall([6.88, 19.93], [12.49, 19.93], { base: 2.1, h: H1 - 2.1, t: .2, m: mat.plasterW });

/* escalera en U: 17 peraltes de 0.165 hasta N.P.T. 2.80 */
{
  const rh = F1 / 17, t1 = (11.44 - 9.2) / 8, t2 = (11.44 - 9.2) / 9, st = M({ color: 0x3a3b3e, roughness: .4, metalness: .55 });   // acero sin poché: en planta se lee como escalera, no como muro
  for (let i = 0; i < 8; i++) box(t1 + .02, .06, 1.7, 9.2 + t1 * (i + .5), 10.97, (i + 1) * rh - .06, st, scene);
  box(1.0, .16, 3.56, 11.94, 10.04, 8 * rh - .16, st, scene);
  for (let j = 0; j < 9; j++) box(t2 + .02, .06, 1.7, 11.44 - t2 * (j + .5), 9.11, (9 + j) * rh - .06, st, scene);
  box(.02, .9, 3.56, 9.2, 10.04, 0, st, scene).visible = false;
}

/* ---------- losa N.P.T. 2.80 y planta alta (envolvente) ---------- */
// el canto de la losa llega al paño exterior del muro (10 cm afuera del eje)
slab([[1.43, 8.26], [7.56, 8.26], [7.56, 3.65], [7.485, 3.65], [7.485, -0.10], [12.59, -0.10], [12.59, 20.03], [5.69, 20.03], [5.69, 18.31], [1.33, 18.31], [1.33, 8.26]],
  [rect(9.1, 8.36, 12.39, 11.72)], H1, LOSA, mat.wall, up1);
// envolvente de planta alta según ARQ-02: el bloque de la recámara 3 arranca en el eje D" (7.56)
const UP = { base: F1, h: H2, t: EXT, parent: up1, cap: false };
wall([7.56, 0], [7.56, 8.26], { ...UP, t: .15, open: [[2.0, 3.45, 'window', .9, 2.2]] });        // ventana de la salita al jardín
wall([7.56, 0], [12.49, 0], { ...UP, open: [[1.0, 3.5, 'window', 1.6, 2.2]] });
wall([12.49, 0], [12.49, 19.93], UP);
wall([12.49, 19.93], [9.86, 19.93], { ...UP, m: mat.plasterW, open: [[0.6, 2.0, 'window', 1.4, 2.2]] });
wall([9.86, 19.93], [9.86, 18.69], UP);
wall([9.86, 18.69], [5.79, 18.69], { ...UP, open: [[0.52, 1.9, 'open', 0, 2.35], [1.9, 3.62, 'glass', 0, 2.35]] });            // cancel corredizo al balcón
wall([5.79, 18.69], [5.79, 18.21], UP);
wall([5.79, 18.21], [1.43, 18.21], { ...UP, open: [[1.4, 4.14, 'window', 1.0, 2.2]] });           // ventana del vestidor 2
wall([1.43, 18.21], [1.43, 8.26], { ...UP, open: [[4.2, 6.2, 'window', .9, 2.2]] });               // ventana de la recámara 2
wall([1.43, 8.26], [7.56, 8.26], { ...UP, h: 1.0, t: .04, open: [[0, 6.13, 'glass', 0, 1.0]] });   // barandal al vacío
wall([5.79, 19.93], [9.86, 19.93], { ...UP, h: 1.0, t: .04, open: [[0, 4.07, 'glass', 0, 1.0]] }); // balcón

/* ---------- planta alta: muros interiores, puertas, pisos y escalera a la terraza (ARQ-02) ---------- */
const paIn = new THREE.Group(); up1.add(paIn);          // interiores de planta alta: solo se dibujan cuando hacen falta
const PAI = { base: F1, h: H2, t: .12, parent: paIn, cap: false };
wall([7.56, 1.80], [12.49, 1.80], { ...PAI, open: [[0.08, 0.88, 'door', 0, 2.2, 1, 1.45]] });                     // baño R3, desde la salita
wall([10.25, 1.80], [10.25, 3.63], PAI);                                                     // vestidor R3
wall([10.25, 3.63], [12.49, 3.63], { ...PAI, open: [[0.08, 0.8, 'door', 0, 2.2, 1, 1.45]] });
wall([7.56, 8.23], [12.49, 8.23], { ...PAI, open: [[0.08, 0.98, 'doorR', 0, 2.2, 1, 1.45]] });                    // recámara 3, desde el pasillo
wall([8.71, 7.56], [8.71, 8.23], PAI);                                                       // remate del clóset
wall([1.43, 11.80], [5.79, 11.80], { ...PAI, open: [[3.52, 4.28, 'doorR', 0, 2.2, 1, 1.45]] });                   // recámara 2
wall([5.79, 11.80], [5.79, 18.21], PAI);
wall([1.43, 16.14], [3.91, 16.14], PAI);                                                     // vestidor R2
wall([3.91, 16.14], [3.91, 18.21], { ...PAI, open: [[1.1, 1.9, 'door', 0, 2.2, 1, -1.45]] });
wall([5.79, 13.84], [12.49, 13.84], { ...PAI, open: [[0.07, 1.01, 'door', 0, 2.2, 1, -1.45]] });                   // recámara principal
wall([9.83, 13.84], [9.83, 18.69], { ...PAI, open: [[0.08, 0.81, 'door', 0, 2.2, 1, 1.45]] });                    // vestidor principal
wall([9.83, 16.14], [12.49, 16.14], { ...PAI, open: [[0.07, 0.82, 'door', 0, 2.2, 1, -1.45]] });                   // baño principal, desde el vestidor
wall([9.21, 11.80], [9.21, 13.84], { ...PAI, open: [[0.14, 0.95, 'door', 0, 2.2, 1, 1.45]] });                    // baño completo
wall([9.21, 11.80], [12.49, 11.80], PAI);
wall([8.71, 12.80], [9.21, 12.80], PAI); wall([8.71, 12.80], [8.71, 13.84], PAI);              // ducto
{
  const pf = (pts, m) => floor(pts, m, F1 + .006, paIn);
  pf([[1.43, 8.26], [9.1, 8.26], [9.1, 11.8], [9.21, 11.8], [9.21, 13.84], [5.79, 13.84], [5.79, 11.8], [1.43, 11.8]], mat.tile);   // sala TV y pasillo
  pf(rect(7.56, 1.8, 12.49, 8.23), mat.tile); pf(rect(1.43, 11.8, 5.79, 18.21), mat.tile); pf(rect(5.79, 13.84, 9.83, 18.69), mat.tile); pf(rect(9.83, 13.84, 12.49, 16.14), mat.tile);
  pf(rect(5.79, 18.69, 9.86, 19.93), mat.paver);                                                      // balcón
  // escalera a la terraza: mismo trazo en U, una planta más arriba
  const rh = (F2 - F1) / 17, t1 = (11.44 - 9.2) / 8, t2 = (11.44 - 9.2) / 9, st = M({ color: 0x3a3b3e, roughness: .4, metalness: .55 });
  for (let i = 0; i < 8; i++) box(t1 + .02, .06, 1.7, 9.2 + t1 * (i + .5), 10.97, F1 + (i + 1) * rh - .06, st, paIn);
  box(1.0, .16, 3.56, 11.94, 10.04, F1 + 8 * rh - .16, st, paIn);
  for (let j = 0; j < 9; j++) box(t2 + .02, .06, 1.7, 11.44 - t2 * (j + .5), 9.11, F1 + (9 + j) * rh - .06, st, paIn);
}

/* ---------- losa N.P.T. 5.60: terraza (ARQ-03) y azotea N.P.T. 8.20 ---------- */
// huecos: escalera y vaso del jacuzzi (la losa peraltada lo recibe sin bajar el plafón de la recámara 3)
const JAC = rect(8.12, 4.34, 9.62, 5.81);
slab([[1.33, 3.55], [7.485, 3.55], [7.485, -0.10], [12.59, -0.10], [12.59, 20.69], [4.79, 20.69], [4.79, 18.31], [1.33, 18.31]],
  [rect(9.1, 8.36, 12.39, 11.72), JAC], F2 - LOSA, LOSA, mat.wall, up2);
const up3 = new THREE.Group(); up2.add(up3);   // losa de azotea: se oculta cuando la cámara pasa por encima
const perg = new THREE.Group(); up2.add(perg);  // vigas y listones de la pérgola: fuera de la lámina 03 (su sombra pintaría el piso)
const HT = F3 - LOSA - F2;                     // 2.35 m libres bajo la azotea
// pretiles: barandal de vidrio al jardín, al poniente y a la calle; muros de privacidad junto al jacuzzi
const PAR = { base: F2, h: 1.0, t: .15, parent: up2, cap: false }, RAIL = { ...PAR, t: .04 };
wall([1.43, 3.65], [8.68, 3.65], { ...RAIL, open: [[0, 7.25, 'glass', 0, 1.0]] });
wall([8.68, 3.65], [12.49, 3.65], { ...PAR, h: 1.2 });
wall([12.49, 3.65], [12.49, 8.14], { ...PAR, h: 1.2 });
wall([1.43, 3.65], [1.43, 14.6], { ...RAIL, open: [[0, 10.95, 'glass', 0, 1.0]] });
wall([1.43, 14.6], [1.43, 18.21], PAR);
wall([1.43, 18.21], [4.79, 18.21], PAR);
wall([4.79, 18.21], [4.79, 20.69], { ...RAIL, open: [[0, 2.48, 'glass', 0, 1.0]] });
wall([4.79, 20.69], [12.49, 20.69], { ...RAIL, open: [[0, 7.7, 'glass', 0, 1.0]] });
wall([12.49, 16.47], [12.49, 20.69], PAR);
wall([7.56, 0], [12.49, 0], { ...PAR, h: .45 });
wall([7.56, 0], [7.56, 3.65], { ...PAR, h: .45 });
wall([12.49, 0], [12.49, 3.65], { ...PAR, h: .45 });
// volumen bajo la azotea: vestíbulo, lavandería, baño, oficina y archivo
const VOL = { base: F2, h: HT, t: EXT, parent: up2, cap: false };
wall([5.67, 8.14], [12.49, 8.14], VOL);
wall([12.49, 8.14], [12.49, 16.47], VOL);
wall([12.49, 16.47], [7.45, 16.47], { ...VOL, open: [[0.16, 2.29, 'glass', 0, 2.1]] });   // cancel corredizo de la oficina a la terraza del frente
wall([7.45, 16.47], [7.45, 14.93], VOL);
wall([7.45, 14.93], [5.67, 14.93], VOL);
wall([5.67, 14.93], [5.67, 8.14], { ...VOL, open: [[3.98, 5.3, 'open', 0, 2.1], [5.3, 6.71, 'glass', 0, 2.1]] });     // cancel corredizo del vestíbulo a la terraza poniente
const TI = { base: F2, h: HT, t: .12, parent: up2, cap: false };
wall([8.9, 9.39], [8.9, 13.7], { ...TI, open: [[3.28, 4.16, 'doorR', 0, 2.1, 1, -1.45]] });   // cubo de la escalera; lavandería
wall([8.9, 11.75], [12.49, 11.75], TI);
wall([7.5, 13.7], [12.49, 13.7], { ...TI, open: [[0.13, 0.99, 'door', 0, 2.1, 1, -1.45]] });   // oficina, desde el vestíbulo
wall([5.67, 13.32], [7.5, 13.32], { ...TI, open: [[0.08, 0.85, 'door', 0, 2.1, 1, -1.45]] });  // baño
wall([7.5, 13.32], [7.5, 14.93], TI);
wall([7.45, 14.93], [8.96, 14.93], TI);                                                       // archivo
wall([8.96, 14.93], [8.96, 16.47], { ...TI, open: [[0.58, 1.22, 'doorR', 0, 2.1, 1, 1.45]] });
slab([[5.57, 8.04], [12.59, 8.04], [12.59, 16.57], [7.35, 16.57], [7.35, 15.03], [5.57, 15.03]], [], F3 - LOSA, LOSA, mat.wall, up3);
// pérgola sobre asador y bar; celosía de madera hacia el jacuzzi
{
  const top = F2 + 2.55;
  [[1.55, 3.77], [7.19, 3.77], [1.55, 7.52], [7.19, 7.52]].forEach(([x, y]) => box(.12, 2.55, .12, x, y, F2, mat.frame, up2));
  box(5.76, .14, .1, 4.37, 3.77, top - .14, mat.frame, perg); box(5.76, .14, .1, 4.37, 7.52, top - .14, mat.frame, perg);
  for (let x = 1.6; x < 7.2; x += .24) box(.05, .12, 3.98, x, 5.64, top, mat.wood, perg);
  for (let y = 3.88; y < 5.4; y += .1) box(.06, 2.41, .04, 7.19, y, F2, mat.wood, up2);
}

/* ---------- fachada ---------- */
// fachada moderna: volúmenes blancos lisos, lambrín grafito acanalado, losa volada con plafón de madera y spots, puerta pivotante de madera, balcón con jardinera, caja blanca sobre la cochera abierta
const fachPB = new THREE.Group(); scene.add(fachPB);
const fachPA = new THREE.Group(); up1.add(fachPA);
const fachT = new THREE.Group(); up2.add(fachT);
{
  const YF = 18.33, D = .04;   // forro del paño 18.21 (cara 18.31)
  // ---- planta baja (fachPB)
  box(2.40, 2.55, D, 2.53, YF, 0, mat.plasterW, fachPB);            // volumen blanco x 1.33–3.73
  box(1.00, 1.70, D, 4.23, YF, 0, mat.plasterW, fachPB);            // bajo la ventana 3.73–4.73
  box(1.00, .35, D, 4.23, YF, 2.20, mat.plasterW, fachPB);
  box(.06, 2.55, D, 4.76, YF, 0, mat.plasterW, fachPB);
  box(.90, 2.55, D, 5.24, YF, 0, mat.grayPanel, fachPB);            // remetido gris 4.79–5.69
  box(.07, 2.25, .004, 1.49, 18.352, .30, mat.frame, fachPB);       // ranura: canal oscuro
  box(.035, 2.25, .01, 1.49, 18.355, .30, mat.led, fachPB);         //          y tira LED
  box(1.06, 2.55, .16, 5.32, 20.03, 0, mat.fluted, fachPB);         // lambrín grafito (y 19.95–20.11)
  for (let i = 0; i < 21; i++) box(.03, 2.55, .04, 4.815 + i * .05, 20.13, 0, mat.fluted, fachPB);   // estrías
  box(1.03, .12, .20, 6.365, 19.93, 2.43, mat.woodClad, fachPB);    // dintel de madera de la pivotante
  box(.02, 2.53, 5.91, 6.885, 16.865, 0, mat.woodClad, fachPB);     // madera en el muro x 6.97 del andador (no toca los bolardos)
  box(1.0, .02, 5.96, 6.39, 16.85, 2.53, mat.woodSoffit, fachPB);   // plafón de madera del andador
  [15.0, 16.6, 18.2].forEach(y => box(.07, .008, .07, 6.39, y, 2.522, mat.led, fachPB));
  box(.03, .03, 5.80, 6.83, 16.90, .005, mat.led, fachPB);          // LED rasante del andador
  // fondo de la cochera: travertino entre las puertas (vestíbulo x 7.51–8.45, herramientas 11.60–12.25)
  box(.46, 2.55, .03, 7.275, 13.975, 0, mat.stoneLight, fachPB);
  box(3.15, 2.55, .03, 10.025, 13.975, 0, mat.stoneLight, fachPB);
  box(.14, 2.55, .03, 12.32, 13.975, 0, mat.stoneLight, fachPB);
  box(.94, .33, .03, 7.98, 13.975, 2.22, mat.stoneLight, fachPB);
  box(.65, .33, .03, 11.925, 13.975, 2.22, mat.stoneLight, fachPB);
  box(5.30, .02, .03, 9.74, 14.01, 2.50, mat.led, fachPB);          // LED rasante del muro de fondo
  // exterior: cochera, pasto y losas de paso
  box(5.50, .03, 1.60, 9.75, 20.73, -.02, mat.conc, fachPB);
  box(5.70, .02, 1.50, 2.85, 20.78, -.015, mat.grass, fachPB);
  [20.35, 20.90, 21.45].forEach(y => box(1.30, .04, .42, 6.37, y, -.02, mat.stoneLight, fachPB));
  // ---- planta alta (fachPA)
  box(.32, 2.80, D, 1.49, YF, 2.55, mat.plasterW, fachPA);          // 1.33–1.65
  box(.40, 2.80, D, 4.59, YF, 2.55, mat.plasterW, fachPA);          // 4.39–4.79
  box(2.74, 1.25, D, 3.02, YF, 2.55, mat.plasterW, fachPA);         // bajo la ventana del vestidor 2
  box(2.74, .35, D, 3.02, YF, 5.00, mat.plasterW, fachPA);
  box(.90, 2.77, D, 5.24, YF, 2.55, mat.grayPanel, fachPA);
  box(.07, 2.80, .004, 1.49, 18.352, 2.55, mat.frame, fachPA); box(.035, 2.80, .01, 1.49, 18.355, 2.55, mat.led, fachPA);
  box(1.06, 2.77, .16, 5.32, 20.03, 2.55, mat.fluted, fachPA);
  for (let i = 0; i < 21; i++) box(.03, 2.77, .04, 4.815 + i * .05, 20.13, 2.55, mat.fluted, fachPA);
  box(5.74, 1.10, .45, 9.75, 20.265, 2.10, mat.plasterW, fachPA);   // caja blanca sobre la cochera (y 20.04–20.49)
  box(5.50, .012, .03, 9.75, 20.42, 2.088, mat.led, fachPA);        // plafón iluminado de la caja
  box(3.97, .04, .06, 7.875, 19.93, 3.80, mat.frame, fachPA);       // tapa del barandal del balcón (x 5.89–9.86)
  box(5.06, .03, 1.68, 7.33, 19.64, 5.32, mat.woodSoffit, fachPA);  // plafón del volado: x 4.80–9.86, y 18.80–20.48
  box(.89, .03, .48, 5.245, 18.56, 5.32, mat.woodSoffit, fachPA);   //   x 4.80–5.69, y 18.32–18.80
  box(2.73, .03, .44, 11.225, 20.26, 5.32, mat.woodSoffit, fachPA); //   x 9.86–12.59, y 20.04–20.48
  [[5.25, 20.2], [6.45, 20.2], [7.65, 20.2], [8.85, 20.2], [10.35, 20.26], [11.55, 20.26], [6.45, 19.3], [7.65, 19.3], [8.85, 19.3], [5.25, 18.9]]
    .forEach(([x, y]) => box(.07, .008, .07, x, y, 5.312, mat.led, fachPA));   // spots empotrados
  // ---- terraza (fachT)
  box(3.46, 1.25, D, 3.06, YF, 5.35, mat.plasterW, fachT);          // canto de losa y pretil
  box(3.46, .60, .215, 3.06, 18.2425, 6.60, mat.plasterW, fachT);   // pretil alto hasta 7.20
  box(.07, 1.55, .004, 1.49, 18.352, 5.35, mat.frame, fachT); box(.035, 1.55, .01, 1.49, 18.355, 5.35, mat.led, fachT);
  box(7.82, .32, .22, 8.69, 20.60, 5.28, mat.plasterW, fachT);      // faldón del volado (x 4.78–12.60), delgado para que se vea el plafón de madera
  box(7.70, .04, .06, 8.64, 20.69, 6.60, mat.frame, fachT);         // tapa del barandal de vidrio
  box(2.85, 2.60, D, 8.775, 16.59, 5.60, mat.grayPanel, fachT);     // volumen gris: x 7.35–10.20
  box(.26, 2.60, D, 12.46, 16.59, 5.60, mat.grayPanel, fachT);      //   x 12.33–12.59
  box(2.13, .50, D, 11.265, 16.59, 7.70, mat.grayPanel, fachT);     //   sobre el cancel
  box(1.78, 2.60, D, 6.46, 15.05, 5.60, mat.grayPanel, fachT);      //   frente remetido x 5.57–7.35
  box(D, 2.60, 1.54, 7.33, 15.80, 5.60, mat.grayPanel, fachT);      //   costado x 7.35
}

// ================================================================ fin del bloque copiado

export { H1, F1, F2, F3, LOSA, JAC };
export const toW = W2;
export const ESC = rect(9.1, 8.36, 12.39, 11.72);        // hueco de la escalera en las losas 2.80 y 5.60 (igual que en el bloque, líneas 667 y 717)

// ================================================================ estructura de obra (predimensionamiento: trabes peraltadas h ≈ L/10–L/12, trabes planas dentro de la losa bajo muros sin apoyo, columnas ≥ 20 cm)
// Trabes y columnas que block.js dibuja (jaula, cimbra, colado). Coordenadas ya en mundo. ax 0: corre en x (c = z); ax 1: corre en z (c = x).
// kind 'T' peraltada (T1 la dibuja block.js, T2 sale de la caja 'trabe' de arriba); 'TP' plana (solo existe su armado dentro de la losa).
export const TRABES = [];
{
  const tb = (id, kind, ax, c, u0, u1, y0, y1, w, lvl) => {
    const cw = ax === 0 ? c - CZ : c - CX, a = ax === 0 ? u0 - CX : u0 - CZ, b = ax === 0 ? u1 - CX : u1 - CZ;
    TRABES.push({ id, kind, ax, c: cw, u0: Math.min(a, b), u1: Math.max(a, b), y0, y1, w, lvl });
  };
  tb('T1', 'T', 0, 3.65, 1.33, 7.66, 2.55, 3.15, 0.20, 1);   // claro 6.13 con muro y losa 5.60 encima: 20 × 60
  tb('T2', 'T', 0, 19.93, 6.89, 12.59, 2.10, 2.80, 0.20, 1);   // monolítica con la losa 2.80: la jaula sube dentro de ella
  tb('TP-a', 'TP', 1, 7.56, -0.10, 8.26, 2.55, 2.80, 0.30, 1);
  tb('TP-b', 'TP', 0, 8.26, 1.33, 7.56, 2.55, 2.80, 0.40, 1);   // borde del vacío de doble altura, 6.2 m
  tb('TP-c', 'TP', 0, 0, 7.485, 9.03, 2.55, 2.80, 0.30, 1);
  tb('TP-d', 'TP', 0, 18.69, 5.79, 9.86, 2.55, 2.80, 0.30, 1);
  tb('TP-e', 'TP', 1, 9.86, 18.69, 20.03, 2.55, 2.80, 0.30, 1);
  tb('TP-g', 'TP', 0, 18.69, 5.79, 9.86, 5.35, 5.60, 0.30, 2);   // apoya la losa 5.60 que vuela 2 m sobre el balcón
  tb('TP-f1', 'TP', 0, 20.69, 4.79, 12.59, 5.35, 5.60, 0.30, 2);
  tb('TP-f2', 'TP', 1, 4.79, 18.31, 20.69, 5.35, 5.60, 0.30, 2);
  // bordes de hueco: escalera en las dos losas y vaso del jacuzzi en la 5.60 (rect() da x0,y0 / x1,y0 / x1,y1 / x0,y1)
  const hole = (id, r, y0, y1, lvl) => {
    const [x0, z0, x1, z1] = [r[0][0], r[0][1], r[2][0], r[2][1]];
    tb(id + 'n', 'TP', 0, z0, x0, x1, y0, y1, 0.25, lvl); tb(id + 's', 'TP', 0, z1, x0, x1, y0, y1, 0.25, lvl);
    tb(id + 'w', 'TP', 1, x0, z0, z1, y0, y1, 0.25, lvl); tb(id + 'e', 'TP', 1, x1, z0, z1, y0, y1, 0.25, lvl);
  };
  hole('ESC1', ESC, 2.55, 2.80, 1); hole('ESC2', ESC, 5.35, 5.60, 2); hole('JAC', JAC, 5.35, 5.60, 2);
}
// columnas de concreto dentro del espesor del muro: sustituyen al castillo del mismo nodo (radio 0.25).
// segs: un tramo por nivel con altura y semanas [armado, cimbra, colado, descimbra]
const CW0 = [5.9, 6.3, 6.5, 7.0];
export const COLS = [
  { id: 'C1', cx: 1.43 - CX, cz: 3.75 - CZ, wx: 0.20, wz: 0.40, segs: [{ lvl: 0, y0: 0, y1: 2.35, w: CW0 }, { lvl: 1, y0: 2.55, y1: 5.15, w: [13.6, 13.9, 14.1, 14.7] }] },
  { id: 'C2', cx: 7.66 - CX, cz: 3.65 - CZ, wx: 0.40, wz: 0.20, segs: [{ lvl: 0, y0: 0, y1: 2.35, w: CW0 }] },
  { id: 'C4', cx: 6.97 - CX, cz: 19.78 - CZ, wx: 0.20, wz: 0.30, segs: [{ lvl: 0, y0: 0, y1: 2.10, w: CW0 }] },
  { id: 'C5', cx: 12.39 - CX, cz: 19.78 - CZ, wx: 0.20, wz: 0.30, segs: [{ lvl: 0, y0: 0, y1: 2.10, w: CW0 }] },
];
// muros de concreto armado de planta alta (vigas de gran peralte): la recámara 3 vuela sobre el porche del jardín y sobre la doble altura
// sin muro ni columna abajo. MC1 (x 7.56) se apoya en C2 y vuela 4.61 m hasta y 8.26; MC2 (y 0) se apoya en el muro de PB de x 9.03 a 12.49
// y vuela 1.47 m hasta x 7.56, donde recibe a MC1. En mundo: ax 0 corre en x (c = z), ax 1 corre en z (c = x). block.js los cuela en vez de levantar block.
export const MUROS_CONC = [
  { id: 'MC1', lvl: 1, ax: 1, c: 7.56 - CX, u0: 0 - CZ, u1: 8.26 - CZ },
  { id: 'MC2', lvl: 1, ax: 0, c: 0 - CZ, u0: 7.56 - CX, u1: 12.49 - CX },
];

// trabes planas automáticas: bajo cada muro de block de planta alta (base 2.80 o 5.60) las partes sin muro debajo llevan una TP dentro de la losa
{
  const near = (a, b) => a.ax === b.ax && Math.abs(a.c - b.c) <= 0.15;
  const cubre = (ivs, lo, hi) => ivs.reduce((n, [a, b]) => n + Math.max(0, Math.min(b, hi) - Math.max(a, lo)), 0);
  let k = 0;
  for (const w of WALLS) {
    const lvl = Math.abs(w.base - 2.80) < 0.01 ? 1 : Math.abs(w.base - 5.60) < 0.01 ? 2 : 0;
    if (!lvl || !w.bl || w.h <= 1.5) continue;
    if (MUROS_CONC.some((m) => m.ax === w.ax && Math.abs(m.c - w.c) < 0.02)) continue;
    const abajo = WALLS.filter((v) => v !== w && near(v, w) && (lvl === 1 ? v.base < 0.01 && v.base + v.h >= 2.5 : (Math.abs(v.base - 2.80) < 0.01 && v.h >= 2.4) || (v.base < 0.01 && v.base + v.h >= 5.3)));
    let libres = [[w.lo, w.hi]];
    for (const v of abajo) libres = libres.flatMap(([a, b]) => (v.hi <= a || v.lo >= b ? [[a, b]] : [[a, Math.min(b, v.lo)], [Math.max(a, v.hi), b]].filter(([x, y]) => y > x)));
    for (const [a, b] of libres) {
      if (b - a < 0.5) continue;
      const ya = lvl === 1 ? 2.55 : 5.35, yb = lvl === 1 ? 2.80 : 5.60;
      const ex = TRABES.filter((t) => t.ax === w.ax && Math.abs(t.c - w.c) <= 0.25);
      if (cubre(ex.map((t) => [t.u0, t.u1]), a, b) >= 0.8 * (b - a)) continue;
      TRABES.push({ id: 'TPa-' + ++k, kind: 'TP', ax: w.ax, c: w.c, u0: Math.max(w.lo, a - 0.15), u1: Math.min(w.hi, b + 0.15), y0: ya, y1: yb, w: 0.30, lvl });
    }
  }
}


// ================================================================ cimentación (cimRuns)
// Frente de obra global: del jardín a la calle y un poco de poniente a oriente (afín: se interpola exacto en un polígono).
const sOfZ = (z) => Math.max(0, Math.min(1, (z + CZ) / 20.69));
export const Fhat = (x, z) => Math.max(0, Math.min(1, (1.2 * sOfZ(z) + 0.35 * ((x + CX) / 12.49)) / 1.55));
// semana local de una corrida: el colado avanza a lo largo del eje (de su extremo más temprano al más tardío)
export function runW(run, x, z) {
  const w = run.Wd, u = run.ax === 0 ? x : z;
  const t = Math.max(0, Math.min(1, ((u - w.u0) * w.dir) / w.len));
  return w.base + w.d * t;
}
const WID = { carga: { pl: 1.0, za: 0.9, co: 0.2 }, int: { pl: 0.8, za: 0.7, co: 0.2 }, barda: { pl: 0.6, za: 0.5, co: 0.15 }, pil: { pl: 0.9, za: 0.8, co: 0.3 }, col: { pl: 1.3, za: 1.2, co: 0.4 } };   // col: medidas base 1.20 (C2 lleva 1.50, ver cimRuns)
const YRG = {
  carga: { pl: [-1.06, -0.995], za: [-1.0, -0.8], co: [-0.81, -0.04] }, int: null,
  barda: { pl: [-0.66, -0.595], za: [-0.60, -0.45], co: [-0.46, -0.02] },
  pil: { pl: [-1.06, -0.995], za: [-1.0, -0.75], co: [-0.76, -0.04] },
  col: { pl: [-1.26, -1.195], za: [-1.20, -0.90], co: [-0.91, -0.04] },   // zapata aislada bajo columna: más honda que las corridas
};
YRG.int = YRG.carga;
const YFONDO = { carga: -1.05, int: -1.05, barda: -0.65, pil: -1.05, col: -1.25 };
const RANK = { carga: 3, int: 2, barda: 1, pil: 0, col: 4 };
const OFFL = { pl: 0.010, za: 0.005, co: 0 };       // lo que sobresale la pieza del paño exterior en un lindero (escalonado: nada en el mismo plano)
const FREE = { pl: 0.35, za: 0.30, co: 0.10 };      // extremo libre
const PIECES = ['pl', 'za', 'co'];
// franja transversal [u0, u1] de una pieza
function spanOf(run, p) {
  const w = WID[run.tipo][p];
  if (run.lind && p !== 'co') {
    const o = run.c + run.lind * (run.t / 2 + OFFL[p]);
    return run.lind > 0 ? [o - w, o] : [o, o + w];
  }
  return [run.c - w / 2, run.c + w / 2];
}
// rectángulo de mundo [x0, z0, x1, z1] de una pieza en el intervalo [a, b] de su eje
export function rectOf(run, p, [a, b]) {
  const s = run.sp[p];
  return run.ax === 0 ? [a, s[0], b, s[1]] : [s[0], a, s[1], b];
}
export const ovl = (r, q) => Math.min(r[2], q[2]) - Math.max(r[0], q[0]) > 1e-6 && Math.min(r[3], q[3]) - Math.max(r[1], q[1]) > 1e-6;
export const subtractIv = (list, a, b) => {
  const out = [];
  for (const [x, y] of list) {
    if (b <= x || a >= y) { out.push([x, y]); continue; }
    if (a > x + 1e-6) out.push([x, a]);
    if (b < y - 1e-6) out.push([b, y]);
  }
  return out;
};
let RUNS = null;
export function cimRuns() {
  if (RUNS) return RUNS;
  // 1. agrupar por (eje, línea, tipo) y fusionar intervalos que se tocan
  const groups = new Map();
  for (const w of footWalls) {
    const ax = Math.abs(w.b[0] - w.a[0]) >= Math.abs(w.b[1] - w.a[1]) ? 0 : 1, c = w.a[1 - ax];
    const tipo = w.barda ? 'barda' : w.t >= 0.195 ? 'carga' : 'int';
    const key = [ax, Math.round(c * 100), tipo].join('|');
    if (!groups.has(key)) groups.set(key, { ax, c, tipo, t: 0, ivs: [] });
    const g = groups.get(key); g.t = Math.max(g.t, w.t); g.ivs.push([Math.min(w.a[ax], w.b[ax]), Math.max(w.a[ax], w.b[ax])]);
  }
  const runs = [];
  for (const g of groups.values()) {
    g.ivs.sort((p, q) => p[0] - q[0]);
    const m = [];
    for (const iv of g.ivs) { const l = m[m.length - 1]; if (l && iv[0] <= l[1] + 0.05) l[1] = Math.max(l[1], iv[1]); else m.push([...iv]); }
    for (const [lo, hi] of m) {
      // una barda con muro de planta alta encima (mismo eje, ±0.15, traslape ≥ 50 %) carga: zapata de lindero de carga
      const carga = g.tipo === 'barda' && hi - lo >= 0.40 && WALLS.some((w) => Math.abs(w.base - 2.80) < 0.01 && w.ax === g.ax && Math.abs(w.c - g.c) <= 0.15 && Math.min(w.hi, hi) - Math.max(w.lo, lo) >= 0.5 * (hi - lo));
      runs.push({ ax: g.ax, c: g.c, t: g.t, tipo: hi - lo < 0.40 ? 'pil' : carga ? 'carga' : g.tipo, lo, hi });
    }
  }
  // fusiona corridas del mismo tipo, eje y línea que se tocan (la barda que pasó a carga se une a la carga contigua)
  for (let i = 0; i < runs.length; i++) for (let j = 0; j < runs.length; j++) {
    const a = runs[i], b = runs[j];
    if (i === j || a.tipo === 'pil' || a.tipo !== b.tipo || a.ax !== b.ax || Math.abs(a.c - b.c) > 0.011 || Math.abs(a.hi - b.lo) > 0.05) continue;
    a.hi = b.hi; a.t = Math.max(a.t, b.t); runs.splice(j, 1); i = -1; break;
  }
  for (const r of runs) {
    r.lind = 0;
    const L = r.ax === 0 ? CZ : CX;
    if (Math.abs(r.c - L) < 0.01) r.lind = 1; else if (Math.abs(r.c + L) < 0.01) r.lind = -1;
    r.Y = YRG[r.tipo]; r.sp = {}; r.iv = {}; r.ext = {};
    r.dy = 0.002 * (3 - RANK[r.tipo]) + (r.ax === 1 ? 0.001 : 0);   // las coronas de corridas que se cruzan difieren unos milímetros: ninguna cara comparte plano
    for (const p of PIECES) r.sp[p] = spanOf(r, p);
  }
  // 1b. zapatas aisladas bajo las columnas que arrancan en el nivel 0: cuadradas, nunca se descartan, ganan en los cruces.
  // pegadas al lindero se recorren hacia adentro (excéntricas): cada pieza deja su canto en el paño exterior del lindero + OFFL (los muros de lindero están centrados en la línea, así que el paño es L + t/2); el dado queda bajo la columna
  const lim = (axis, sg) => (axis === 0 ? CX : CZ) + Math.max(0, ...runs.filter((r) => r.lind === sg && r.ax === (axis === 0 ? 1 : 0)).map((r) => r.t / 2));
  for (const c of COLS) {
    if (!c.segs.some((g) => g.lvl === 0)) continue;
    const Z = c.id === 'C2' ? 1.5 : 1.2, size = { pl: Z + 0.10, za: Z, co: 0.40 };
    const R = { ax: 0, c: c.cz, t: Math.max(c.wx, c.wz), tipo: 'col', lo: c.cx - c.wx / 2, hi: c.cx + c.wx / 2, lind: 0, lindX: 0, id: c.id, Y: YRG.col, sp: {}, iv: {}, ext: {}, dy: 0 };
    for (const pc of PIECES) {
      const w = size[pc], o = OFFL[pc];
      const mx = Math.max(-lim(0, -1) - o + w / 2, Math.min(lim(0, 1) + o - w / 2, c.cx)), mz = Math.max(-lim(1, -1) - o + w / 2, Math.min(lim(1, 1) + o - w / 2, c.cz));
      R.sp[pc] = [mz - w / 2, mz + w / 2]; R.iv[pc] = [[mx - w / 2, mx + w / 2]]; R.ext[pc] = [mx - w / 2, mx + w / 2];
    }
    const [q0, q1] = R.sp.za, [u0, u1] = R.ext.za;
    R.lind = q1 > CZ ? 1 : q0 < -CZ ? -1 : 0; R.lindX = u1 > CX ? 1 : u0 < -CX ? -1 : 0;   // canto más allá de la línea del lote = pegada al lindero
    runs.push(R);
  }
  // 2. extremos: llegan a las corridas perpendiculares (esquinas llenas); libres, se alargan
  const arrives = (R, P, u) => P.ax !== R.ax && Math.abs(P.c - u) <= 0.15 && R.c >= P.lo - 0.05 && R.c <= P.hi + 0.05;
  const onLind = (R, u) => Math.abs(Math.abs(u) - (R.ax === 0 ? CX : CZ)) < 0.01;
  for (const R of runs) for (const p of PIECES) {
    if (R.tipo === 'col') continue;
    if (R.tipo === 'pil') { const m = (R.lo + R.hi) / 2, w = WID.pil[p]; R.iv[p] = [[m - w / 2, m + w / 2]]; R.ext[p] = [m - w / 2, m + w / 2]; continue; }
    let lo = R.lo, hi = R.hi;
    for (const [end, sgn] of [['lo', -1], ['hi', 1]]) {
      const u = R[end], ps = runs.filter((P) => P !== R && arrives(R, P, u));
      let v;
      if (ps.length) v = sgn < 0 ? Math.min(u, ...ps.map((P) => P.sp[p][0])) : Math.max(u, ...ps.map((P) => P.sp[p][1]));
      else v = onLind(R, u) ? u : u + sgn * FREE[p];
      if (sgn < 0) lo = v; else hi = v;
    }
    R.iv[p] = [[lo, hi]]; R.ext[p] = [lo, hi];
  }
  // 3. pilastras dentro de la zapata de otra corrida: la corrida ya las carga
  for (const P of runs) if (P.tipo === 'pil') {
    const m = (P.lo + P.hi) / 2, cx = P.ax === 0 ? m : P.c, cz = P.ax === 0 ? P.c : m;
    P.dropped = runs.some((R) => R.tipo !== 'pil' && R.iv.za.some((iv) => { const r = rectOf(R, 'za', iv); return cx > r[0] && cx < r[2] && cz > r[1] && cz < r[3]; }));
  }
  const live = runs.filter((r) => !r.dropped);
  // 4. recortar cruces: gana el rango mayor (carga > int > barda); en empate pierde la corrida en z. La perdedora penetra 1 cm en la ganadora.
  for (const p of PIECES) for (const L of live) for (const W of live) {
    if (L === W) continue;
    const win = RANK[W.tipo] > RANK[L.tipo] || (RANK[W.tipo] === RANK[L.tipo] && L.ax === 1 && W.ax === 0);
    if (!win) continue;
    for (const jv of W.iv[p]) {
      const rw = rectOf(W, p, jv);
      for (const iv of [...L.iv[p]]) {
        if (!ovl(rectOf(L, p, iv), rw)) continue;
        const [a, b] = W.ax === L.ax ? jv : W.sp[p];
        L.iv[p] = subtractIv(L.iv[p], a + 0.01, b - 0.01).filter(([x, y]) => y - x > 0.04);   // sin astillas
      }
    }
  }
  // restos fuera del lote (lo que sobra al recortar una corrida que pasaba del lindero) no se construyen
  for (const R of live) if (R.tipo !== 'col') for (const pc of PIECES) R.iv[pc] = R.iv[pc].filter(([a, b]) => b > -(R.ax === 0 ? CX : CZ) - 0.02 && a < (R.ax === 0 ? CX : CZ) + 0.02);
  // 5. semanas y cepas
  for (const R of live) {
    const pa = R.ax === 0 ? [R.lo, R.c] : [R.c, R.lo], pb = R.ax === 0 ? [R.hi, R.c] : [R.c, R.hi];
    let f0 = Fhat(...pa), f1 = Fhat(...pb), u0 = R.lo, dir = 1;
    if (f1 < f0) { [f0, f1] = [f1, f0]; u0 = R.hi; dir = -1; }
    const len = Math.max(0.01, R.hi - R.lo);
    R.Wd = { base: 1.2 * f0, d: R.tipo === 'pil' || R.tipo === 'col' ? 0 : Math.max(0, Math.min(0.9, Math.max(1.2 * (f1 - f0), 0.04 * len))), u0, dir, len };
    const s = R.sp.za, [e0, e1] = R.ext.za;
    if (R.tipo === 'col') {   // zapata ± 0.30; del lado del lindero, 0.03
      const [x0, x1] = R.ext.za, [z0, z1] = s, fx = (v, sg, l) => (l === sg ? v + sg * 0.03 : v + sg * 0.30);
      R.cepa = [fx(x0, -1, R.lindX), fx(z0, -1, R.lind), fx(x1, 1, R.lindX), fx(z1, 1, R.lind)]; R.yFondo = YFONDO.col;
      continue;
    }
    let cs;
    if (R.tipo === 'pil') { const s2 = R.sp.pl; cs = R.lind ? (R.lind > 0 ? [s2[0] - 0.30, s2[1] + 0.03] : [s2[0] - 0.03, s2[1] + 0.30]) : [R.c - 0.6, R.c + 0.6]; }
    else cs = R.lind ? (R.lind > 0 ? [s[0] - 0.30, s[1] + 0.03] : [s[0] - 0.03, s[1] + 0.30]) : [s[0] - 0.30, s[1] + 0.30];
    const ca = R.tipo === 'pil' ? [e0 - 0.15, e1 + 0.15] : [e0 - 0.30, e1 + 0.30];
    R.cepa = R.ax === 0 ? [ca[0], cs[0], ca[1], cs[1]] : [cs[0], ca[0], cs[1], ca[1]];
    R.yFondo = YFONDO[R.tipo];
  }
  // 6. puntos de anclaje de castillos: extremos y cruces de corridas
  const pts = [], add = (x, z, y0) => { if (!pts.some((q) => Math.hypot(q[0] - x, q[1] - z) < 0.35)) pts.push([x, z, y0]); };
  for (const R of live) if (R.tipo === 'col') add((R.lo + R.hi) / 2, R.c, R.Y.za[0] + 0.05);   // centro de la columna (primero: gana a los castillos cercanos)
  for (const R of live) {
    if (R.tipo === 'col') continue;
    if (R.tipo === 'pil') { const m = (R.lo + R.hi) / 2; if (R.ax === 0) add(m, R.c); else add(R.c, m); continue; }
    if (R.ax === 0) { add(R.lo, R.c); add(R.hi, R.c); } else { add(R.c, R.lo); add(R.c, R.hi); }
  }
  for (const R of live) if (R.ax === 0 && R.tipo !== 'pil' && R.tipo !== 'col') for (const P of live) if (P.ax === 1 && P.tipo !== 'pil' && P.tipo !== 'col' && P.c >= R.lo - 0.05 && P.c <= R.hi + 0.05 && R.c >= P.lo - 0.05 && R.c <= P.hi + 0.05) add(P.c, R.c);
  RUNS = runs; RUNS.anchors = pts;
  return RUNS;
}

// cisterna de 5,000 L bajo la cochera (medidas en PLANO [x0, y0, x1, y1] y alturas absolutas; world.js las convierte con toW)
// interior 1.60 x 2.00 x 1.80 (tirante máx. 1.60 = 5.12 m³); a más de 1.2 m de las zapatas (bulbo a 45°); 1.20 al norte de C5 para librar su zapata excéntrica
export const CIS = {
  fosa: [8.33, 15.30, 11.13, 18.50], fondoY: -2.27,        // excavación
  dentro: [8.80, 15.77, 10.66, 18.03],                     // muros exteriores reducidos 2 cm (celdas del terreno)
  plantilla: [8.70, 15.67, 10.76, 18.13], plantillaY: [-2.265, -2.195],
  losa: [8.75, 15.72, 10.71, 18.08], losaY: [-2.20, -2.05],  // losa de fondo 15 cm
  ext: [8.78, 15.75, 10.68, 18.05], int: [8.93, 15.90, 10.53, 17.90], muroY: [-2.06, -0.24],   // muros de 15 cm
  tapa: [8.76, 15.73, 10.70, 18.07], tapaY: [-0.25, -0.102], hueco: [9.43, 17.10, 10.03, 17.70],   // losa tapa con registro
  cuello: [9.33, 17.00, 10.13, 17.80], cuelloY: [-0.105, -0.002],   // muretes de 10 cm alrededor del hueco
  firmeHueco: [9.32, 16.99, 10.14, 17.81],                 // hueco del firme de la cochera (1 cm fuera del cuello)
};

// partes de obra que index.html no tiene (cimentación, firme, cisterna, puerta pivotante, acabado de la terraza y agua del jacuzzi)
function extras() {
  const out = [];
  // firme de planta baja, 10 cm (y -0.10..0): interior, cochera y andador (los polígonos de los pisos de las líneas 605–607); la cochera lleva el hueco de la cisterna
  for (const [pts, holes] of [
    [[[1.43, 3.65], [9.03, 3.65], [9.03, 0], [12.49, 0], [12.49, 13.86], [5.79, 13.86], [5.79, 18.21], [1.43, 18.21]], []],
    [rect(6.97, 13.86, 12.49, 19.93), [rect(...CIS.firmeHueco)]], [rect(5.79, 13.86, 6.97, 19.93), []],
  ]) out.push({ t: 'slab', outer: pts.map((q) => W2(...q)), holes: holes.map((h) => h.map((q) => W2(...q))), y: -0.10, d: 0.10, m: 'conc', k: 'firme', lvl: 0 });
  // cisterna de concreto armado: fondo, muros, tapa con registro y cuello (programa en semanas: ver cisternKit en world.js)
  {
    const C = CIS, tt = (y, [a, b]) => Math.max(0, Math.min(1, (y - a) / (b - a)));
    const bx = (r, [y0, y1], wk) => {
      const [ax, az] = W2(r[0], r[1]), [bx_, bz] = W2(r[2], r[3]);
      out.push({ t: 'box', b: [ax, y0, az, bx_, y1, bz], m: 'conc', k: 'cisterna', lvl: 0, wk });
    };
    bx(C.losa, C.losaY, (x, y) => 1.95 + 0.04 * tt(y, C.losaY));
    const wm = (x, y) => 3.0 + 0.30 * tt(y, C.muroY), [e, i] = [C.ext, C.int];
    bx([e[0], e[1], i[0], e[3]], C.muroY, wm); bx([i[2], e[1], e[2], e[3]], C.muroY, wm);   // poniente y oriente, a todo lo largo
    bx([i[0], e[1], i[2], i[1]], C.muroY, wm); bx([i[0], i[3], i[2], e[3]], C.muroY, wm);   // norte y sur, entre ellos
    const [t, h] = [C.tapa, C.hueco], wt = (x, y, z) => 5.60 + 0.12 * Math.max(0, Math.min(1, (z + CZ - t[1]) / (t[3] - t[1]))) + 0.03 * tt(y, C.tapaY);
    bx([t[0], t[1], t[2], h[1]], C.tapaY, wt); bx([t[0], h[3], t[2], t[3]], C.tapaY, wt);   // franjas norte y calle
    bx([t[0], h[1], h[0], h[3]], C.tapaY, wt); bx([h[2], h[1], t[2], h[3]], C.tapaY, wt);   // a los lados del hueco
    const c = C.cuello;   // wk siempre es función (x, y, z)
    bx([c[0], c[1], c[2], h[1]], C.cuelloY, () => 5.80); bx([c[0], h[3], c[2], c[3]], C.cuelloY, () => 5.80);
    bx([c[0], h[1], h[0], h[3]], C.cuelloY, () => 5.80); bx([h[2], h[1], c[2], h[3]], C.cuelloY, () => 5.80);
  }
  // cimentación: zapatas corridas, excéntricas de lindero, contratrabes y zapata aislada (ver cimRuns)
  for (const run of cimRuns()) {
    if (run.dropped) continue;
    for (const [piece, k, t0, tg] of [['za', 'zapata', 2.15, 0.06], ['co', 'contra', 3.05, 0.10]]) {
      const y0 = run.Y[piece][0], y1 = run.Y[piece][1] - run.dy;
      const wk = (x, y, z) => t0 + runW(run, x, z) + tg * Math.max(0, Math.min(1, (y - y0) / (y1 - y0)));
      for (const iv of run.iv[piece]) {
        const r = rectOf(run, piece, iv);
        if (r[2] - r[0] < 1e-3 || r[3] - r[1] < 1e-3) continue;
        out.push({ t: 'box', b: [r[0], y0, r[1], r[2], y1, r[3]], m: 'conc', k, lvl: 0, wk });
      }
    }
  }
  // puerta pivotante del acceso peatonal (index.html: hoja de madera 1.00 x 2.42 con eje a 10 cm del canto oriente, P(6.76, 19.93)), cerrada; la cochera ya no lleva portón
  {
    const [, pz] = W2(6.76, 19.93), [qx0] = W2(5.86, 0), [qx1] = W2(6.86, 0), [jx] = W2(5.965, 0);
    out.push({ t: 'box', b: [qx0, 0.01, pz - 0.025, qx1, 2.44, pz + 0.025], m: 'walnut', k: 'gate', lvl: 0, g: 'peatonal' });
    out.push({ t: 'box', b: [jx, 0.30, pz + 0.025, jx + 0.025, 1.90, pz + 0.055], m: 'steel', k: 'gate', lvl: 0, g: 'peatonal' });
  }
  // acabado de la terraza: el contorno de la losa 5.60 menos el vaso del jacuzzi y la escalera, a F2 + 6 mm
  out.push({
    t: 'floor', m: 'travertine', y: F2 + 0.006, lvl: 2,
    pts: [[1.43, 3.65], [7.56, 3.65], [7.56, 0], [12.49, 0], [12.49, 20.69], [4.79, 20.69], [4.79, 18.21], [1.43, 18.21]].map((q) => W2(...q)),
    holes: [ESC, JAC].map((h) => h.map((q) => W2(...q))),
  });
  // agua del jacuzzi, 9 cm bajo el deck
  out.push({ t: 'floor', m: 'water', y: F2 - 0.09, lvl: 2, pts: JAC.map((q) => W2(...q)), holes: [] });
  return out;
}

// todas las partes de la casa: cajas, losas y acabados de piso
export function casaParts() {
  return [...parts.filter((p) => p.visible !== false), ...extras()];
}
