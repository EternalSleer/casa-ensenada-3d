// Obra gruesa pieza por pieza, SIN three.js (se puede probar con node): block gris hilada por hilada, castillos (armex -> block -> cimbra -> colado),
// dalas, dinteles, trabes, columnas y el armado de las losas reticulares. Devuelve acumuladores crudos { pos, nor, uv, wk, out, col? } por material:
// cmu (block, lleva color por pieza), conc, rebar, timber, ply, eps, cap. world.js los convierte en BufferGeometry y los une a los cubos de buildHouse.
// Coordenadas de mundo (x, y, z). Una banda es un muro de block de un nivel: { ax (0 corre en x, 1 en z), c (coordenada transversal), lo, hi, yb, yt }.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const E = 1e-6;

export const DALA = 0.20, DALA_P = 0.10;           // peralte de la dala de cerramiento (pretiles: cadena de remate)
export const LVP = {                               // calendario del block: inicio W0 + SP·Fhat, duración D (semanas)
  0: { W0: 6.2, SP: 3.0, D: 1.4 }, 1: { W0: 13.2, SP: 3.0, D: 1.4 }, 2: { W0: 19.6, SP: 1.6, D: 1.2 },
  pret: { W0: 21.6, SP: 0.8, D: 0.6 }, barda: { W0: 6.8, SP: 2.6, D: 1.2 },
};
// semanas de las losas (casetón, varilla, malla, cimbra de trabes). Índice = nivel de la losa (1: 2.80, 2: 5.60, 3: azotea)
const SLABW = {
  1: { cas: [11.2, 0.6], var: [11.5, 0.6], mal: [11.7, 0.6], cim: [11.0, 0.6], cimOut: 19.2 },
  2: { cas: [17.9, 0.5], var: [18.1, 0.5], mal: [18.3, 0.5], cim: [17.2, 0.6], cimOut: 23.4 },
  3: { cas: [23.0, 0.3], var: [23.2, 0.3], mal: [23.35, 0.3], cim: [22.6, 0.4], cimOut: 27.0 },
};

const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
const val = (f, x, y, z) => (typeof f === 'function' ? f(x, y, z) : f);
const newAcc = (col) => { const a = { pos: [], nor: [], uv: [], wk: [], out: [] }; if (col) a.col = []; return a; };
const defUV = (n, x, y, z) => (n[0] ? [z, y] : n[1] ? [x, z] : [x, y]);

function vtx(A, p, n, uv, wk, out, col) {
  A.pos.push(p[0], p[1], p[2]); A.nor.push(n[0], n[1], n[2]); A.uv.push(uv[0], uv[1]);
  A.wk.push(val(wk, p[0], p[1], p[2])); A.out.push(val(out, p[0], p[1], p[2]));
  if (A.col) A.col.push(col[0], col[1], col[2]);
}
// cuadrilátero: el orden se corrige solo para que la normal quede hacia n (los materiales son de una cara)
function quad(A, p0, p1, p2, p3, n, wk, out, uvf, col) {
  const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
  const dot = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
  const q = dot >= 0 ? [p0, p1, p2, p3] : [p0, p3, p2, p1];
  for (const i of [0, 1, 2, 0, 2, 3]) vtx(A, q[i], n, uvf ? uvf(q[i], n) : defUV(n, q[i][0], q[i][1], q[i][2]), wk, out, col);
}
// caja alineada; skip = máscara de caras que no se dibujan (bit i = cara i de FACES); o.uv(faceIdx, x, y, z) -> [u, v]; o.col = color por pieza
function box(A, x0, y0, z0, x1, y1, z1, wk, out = 0, o) {
  if (x1 - x0 < 1e-5 || y1 - y0 < 1e-5 || z1 - z0 < 1e-5) return;
  const skip = (o && o.skip) || 0;
  for (let fi = 0; fi < 6; fi++) {
    if (skip & (1 << fi)) continue;
    const f = FACES[fi], q = f.c.map((c) => [c[0] ? x1 : x0, c[1] ? y1 : y0, c[2] ? z1 : z0]);
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const p = q[i];
      vtx(A, p, f.n, o && o.uv ? o.uv(fi, p[0], p[1], p[2]) : defUV(f.n, p[0], p[1], p[2]), wk, out, o && o.col);
    }
  }
}
// caja de concreto que se cuela (material concPour de world.js): todos sus vértices llevan aPour = altura sobre `base`, y el shader los sube
// del fondo a su lugar en `span` semanas a partir de wk (evaluada en la base, así toda la sección sube pareja). Se parte cada `step` metros
// en planta para que el frente del colado y los lomos tengan vértices. o.skip como en box(); o.base = nivel desde el que sube (por omisión y0)
export function pbox(A, x0, y0, z0, x1, y1, z1, wk, span, out = 0, o) {
  if (x1 - x0 < 1e-5 || y1 - y0 < 1e-5 || z1 - z0 < 1e-5) return;
  const skip = (o && o.skip) || 0, base = o && o.base !== undefined ? o.base : y0, step = (o && o.step) || 0.25;
  const cut = (a, b) => { const n = Math.max(1, Math.round((b - a) / step)); return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n); };
  const xs = cut(x0, x1), zs = cut(z0, z1);
  const v = (p, n) => {
    const uv = defUV(n, p[0], p[1], p[2]);
    A.pos.push(p[0], p[1], p[2]); A.nor.push(n[0], n[1], n[2]); A.uv.push(uv[0], uv[1]);
    A.wk.push(val(wk, p[0], base, p[2])); A.out.push(val(out, p[0], p[1], p[2])); A.pour.push(p[1] - base); A.span.push(span);
  };
  const q4 = (a, b, c, d, n) => { for (const p of [a, b, c, a, c, d]) v(p, n); };
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], b = xs[i + 1];
    for (let j = 0; j < zs.length - 1; j++) {
      const c = zs[j], d = zs[j + 1];
      if (!(skip & 4)) q4([a, y1, d], [b, y1, d], [b, y1, c], [a, y1, c], [0, 1, 0]);
      if (!(skip & 8)) q4([a, y0, c], [b, y0, c], [b, y0, d], [a, y0, d], [0, -1, 0]);
    }
    if (!(skip & 16)) q4([a, y0, z1], [b, y0, z1], [b, y1, z1], [a, y1, z1], [0, 0, 1]);
    if (!(skip & 32)) q4([b, y0, z0], [a, y0, z0], [a, y1, z0], [b, y1, z0], [0, 0, -1]);
  }
  for (let j = 0; j < zs.length - 1; j++) {
    const c = zs[j], d = zs[j + 1];
    if (!(skip & 1)) q4([x1, y0, d], [x1, y0, c], [x1, y1, c], [x1, y1, d], [1, 0, 0]);
    if (!(skip & 2)) q4([x0, y0, c], [x0, y0, d], [x0, y1, d], [x0, y1, c], [-1, 0, 0]);
  }
}
// varilla: prisma de 6 lados sin tapas, eje ax (0 x, 1 y, 2 z) de a0 a a1; (s, t) = las otras dos coordenadas en orden x, y, z
function rod(A, ax, a0, a1, s, t, r, wk, out, ns = 4) {
  if (Math.abs(a1 - a0) < 1e-4) return;
  const P = (a, i) => {
    const th = ((i + 0.5) / ns) * Math.PI * 2, u = s + Math.cos(th) * r * 1.25, v = t + Math.sin(th) * r * 1.25;
    return ax === 0 ? [a, u, v] : ax === 1 ? [u, a, v] : [u, v, a];
  };
  for (let i = 0; i < ns; i++) {
    const tm = ((i + 1) / ns) * Math.PI * 2, cu = Math.cos(tm), cv = Math.sin(tm);
    const n = ax === 0 ? [0, cu, cv] : ax === 1 ? [cu, 0, cv] : [cu, cv, 0];
    quad(A, P(a0, i), P(a0, i + 1), P(a1, i + 1), P(a1, i), n, wk, out);
  }
}
// anillo hueco (estribo, yugo): rectángulo exterior (hx, hz) de espesor th entre y0 e y1; sin cara de abajo
function ring(A, cx, cz, hx, hz, y0, y1, th, wk, out) {
  const ix = hx - th, iz = hz - th;
  const thin = th < 0.012;
  const P = (x, y, z) => [cx + x, y, cz + z];
  quad(A, P(hx, y0, -hz), P(hx, y0, hz), P(hx, y1, hz), P(hx, y1, -hz), [1, 0, 0], wk, out);
  quad(A, P(-hx, y0, -hz), P(-hx, y0, hz), P(-hx, y1, hz), P(-hx, y1, -hz), [-1, 0, 0], wk, out);
  quad(A, P(-hx, y0, hz), P(hx, y0, hz), P(hx, y1, hz), P(-hx, y1, hz), [0, 0, 1], wk, out);
  quad(A, P(-hx, y0, -hz), P(hx, y0, -hz), P(hx, y1, -hz), P(-hx, y1, -hz), [0, 0, -1], wk, out);
  if (thin) return;
  quad(A, P(ix, y0, -iz), P(ix, y0, iz), P(ix, y1, iz), P(ix, y1, -iz), [-1, 0, 0], wk, out);
  quad(A, P(-ix, y0, -iz), P(-ix, y0, iz), P(-ix, y1, iz), P(-ix, y1, -iz), [1, 0, 0], wk, out);
  quad(A, P(-ix, y0, iz), P(ix, y0, iz), P(ix, y1, iz), P(-ix, y1, iz), [0, 0, -1], wk, out);
  quad(A, P(-ix, y0, -iz), P(ix, y0, -iz), P(ix, y1, -iz), P(-ix, y1, -iz), [0, 0, 1], wk, out);
  const top = [[hx, -hz, ix, hz], [-ix, -hz, -hx, hz], [-ix, iz, ix, hz], [-ix, -hz, ix, -iz]];
  for (const [a, b, c, d] of top) quad(A, P(a, y1, b), P(c, y1, b), P(c, y1, d), P(a, y1, d), [0, 1, 0], wk, out);
}

// estribo vertical (dala, trabe): cuatro barras de th en el plano perpendicular al eje ax (0 x, 2 z), en la posición u; media sección hq por y0..y1
function ringV(A, ax, u, c, hq, y0, y1, th, wk, out) {
  const bx = (ya, yb, q0, q1, skip) => (ax === 0 ? box(A, u - th / 2, ya, q0, u + th / 2, yb, q1, wk, out, { skip }) : box(A, q0, ya, u - th / 2, q1, yb, u + th / 2, wk, out, { skip }));
  const cut = ax === 0 ? (1 << 4) | (1 << 5) : (1 << 0) | (1 << 1);
  bx(y1 - th, y1, c - hq, c + hq, cut | (1 << 3));
  bx(y0, y0 + th, c - hq, c + hq, cut | (1 << 2));
  bx(y0 + th, y1 - th, c - hq, c - hq + th, (1 << 2) | (1 << 3));
  bx(y0 + th, y1 - th, c + hq - th, c + hq, (1 << 2) | (1 << 3));
}

const inPoly = (x, z, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
};
const onSlab = (s, x, z) => inPoly(x, z, s.outer) && !s.holes.some((h) => inPoly(x, z, h));
// tramos de la losa sobre la recta (ax 0: z = c, varía x; ax 1: x = c, varía z)
function slabSpans(s, ax, c) {
  const xs = [];
  const cc = c + 1e-4;
  for (const poly of [s.outer, ...s.holes]) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const p = poly[j], q = poly[i], a = ax === 0 ? p[1] : p[0], b = ax === 0 ? q[1] : q[0];
      if ((a - cc) * (b - cc) < 0) {
        const t = (cc - a) / (b - a);
        xs.push(ax === 0 ? p[0] + (q[0] - p[0]) * t : p[1] + (q[1] - p[1]) * t);
      }
    }
  }
  xs.sort((p, q) => p - q);
  const out = [];
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 0.02) out.push([xs[i], xs[i + 1]]);
  return out;
}
const subIv = (list, a, b) => {
  const out = [];
  for (const [x, y] of list) {
    if (b <= x + E || a >= y - E) { out.push([x, y]); continue; }
    if (a > x + E) out.push([x, a]);
    if (b < y - E) out.push([b, y]);
  }
  return out;
};
// generador pseudoaleatorio propio (sembrado) para el tono de cada block
function mkRnd(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function planObra(o) {
  const { walls, trabes, cols, slabs, Fhat, finPl, sOf, LV, phone = false } = o;
  const concWalls = o.conc || [];
  const samples = o.samples || [];
  const rnd = mkRnd(7);
  const acc = { cmu: newAcc(true), cmuA: newAcc(true), conc: newAcc(), concPour: { ...newAcc(), pour: [], span: [] }, mort: newAcc(), rebar: newAcc(), timber: newAcc(), ply: newAcc(), eps: newAcc(), cap: newAcc() };
  const stirSp = phone ? 0.50 : 0.25;
  const armexSp = phone ? 0.48 : 0.16;   // el armex 15x15-4 trae sus estribos electrosoldados a cada 15.8 cm
  const DIENTE = 0.025;                  // dentado: en hiladas alternas el block entra 2.5 cm al castillo, para que el colado amarre
  const TONO_A = 0.74;   // las bardas de block aparente van en gris medio, como el concreto liso de antes
  const flatO = (b) => (b.out === 'aparente' ? { col: [TONO_A, TONO_A, TONO_A * 0.985], uv: () => [0.25, 0.5] } : undefined);   // concreto de la barda: la cara lisa del block, al ras
  const lvlOfY = (y) => (y < 2.5 ? 0 : y < 5.3 ? 1 : 2);
  const slabOf = (lvl) => slabs.find((s) => s.lvl === lvl);   // lvl de la losa: 1 (2.80), 2 (5.60), 3 (azotea)
  const pour = (lvl) => { const s = slabOf(lvl); return s ? s.weeks : () => 99; };
  const rebW = (lvl, z) => { const w = SLABW[lvl]; return w.var[0] + w.var[1] * sOf(z); };
  const sorted = [[], [], []], castWk = [];
  const counts = [0, 0, 0];

  // ------------------------------------------------------------ bandas
  const bands = [];
  const T_PER = trabes.filter((t) => t.kind === 'T');
  for (const w of walls) {
    if (!w.bl) continue;
    const y0 = w.base, y1 = w.base + w.h;
    const cuts = [y0, ...LV.filter((y) => y > y0 + 0.3 && y < y1 - 0.3), y1];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const b = { wid: w.wid, ax: w.ax, c: w.c, lo: w.lo, hi: w.hi, yb0: cuts[i], yb: cuts[i], yt: cuts[i + 1], t: w.t, m: w.m, barda: w.barda };
      b.lvl = lvlOfY(b.yb0);
      b.holes = w.holes.filter((h) => h[3] > b.yb + 0.01 && h[2] < b.yt - 0.01).map((h) => ({ u0: h[0], u1: h[1], y0: h[2], y1: h[3] }));
      for (const tr of T_PER) {   // una trabe del mismo eje que cubre la banda sube su arranque
        if (tr.ax !== b.ax || Math.abs(tr.c - b.c) > 0.05) continue;
        const cov = Math.min(b.hi, tr.u1) - Math.max(b.lo, tr.u0);
        if (cov >= 0.9 * (b.hi - b.lo) && tr.y0 <= b.yb + 0.01 && tr.y1 > b.yb) b.yb = tr.y1;
      }
      b.bw = w.t >= 0.195 ? 0.15 : 0.12;
      b.dalaH = b.lvl === 2 && b.yt - b.yb0 <= 1.3 ? DALA_P : DALA;
      b.grp = b.m === 'block' || b.barda ? 'barda' : b.lvl === 2 && b.yt - b.yb0 <= 1.3 ? 'pret' : b.lvl;
      const P = LVP[b.grp];
      const mid = (b.lo + b.hi) / 2, cx = b.ax === 0 ? mid : b.c, cz = b.ax === 0 ? b.c : mid;
      b.Ws = P.W0 + P.SP * Fhat(cx, cz); b.D = P.D; b.We = b.Ws + b.D;
      b.n = Math.max(1, Math.round((b.yt - b.yb - b.dalaH) / 0.20)); b.hc = (b.yt - b.yb - b.dalaH) / b.n;
      b.out = b.m === 'block' ? 'aparente' : b.m === 'walnut' ? 'nogal' : 'plaster';
      // extremo con menor Fhat: de ahí avanza la banda
      const f0 = b.ax === 0 ? Fhat(b.lo, b.c) : Fhat(b.c, b.lo), f1 = b.ax === 0 ? Fhat(b.hi, b.c) : Fhat(b.c, b.hi);
      b.uS = f0 <= f1 ? b.lo : b.hi; b.L = b.hi - b.lo;
      for (const h of b.holes) {
        h.ySill = h.y0 <= b.yb + 0.001 ? -Infinity : b.yb + Math.floor((h.y0 - b.yb) / b.hc + 1e-6) * b.hc;
        h.yHead = h.y1 >= b.yt - b.dalaH - 0.001 ? b.yt - b.dalaH : Math.min(b.yb + Math.ceil((h.y1 + 0.12 - b.yb) / b.hc - 1e-6) * b.hc, b.yt - b.dalaH);
        h.dalaCut = h.y1 > b.yt - b.dalaH + 0.01;
      }
      b.castles = [];
      bands.push(b);
    }
  }
  // muros de concreto armado (vigas de gran peralte): la banda coincidente deja de ser de block
  for (const b of bands) for (const m of concWalls) {
    if (b.lvl === m.lvl && b.ax === m.ax && Math.abs(b.c - m.c) < 0.02 && b.lo >= m.u0 - 0.02 && b.hi <= m.u1 + 0.02) b.conc = m.id;
  }
  for (const b of bands) {
    if (!b.conc) continue;
    b.Wp = b.Ws + 0.8; b.elo = b.lo; b.ehi = b.hi;
    for (const q of bands) {   // esquina entre dos muros de concreto: el del eje x llega al canto exterior, el del eje z se corta contra su cara
      if (!q.conc || q.ax === b.ax || b.c < q.lo - 0.02 || b.c > q.hi + 0.02) continue;
      for (const k of ['lo', 'hi']) {
        if (Math.abs(b[k] - q.c) > q.bw / 2 + 0.02) continue;
        const sg = k === 'lo' ? -1 : 1;
        b[k === 'lo' ? 'elo' : 'ehi'] = b.ax === 0 ? q.c + sg * q.bw / 2 : q.c - sg * q.bw / 2;
      }
    }
  }
  const concEnts = (b) => {   // huellas de muros de concreto que cruzan a una banda de block: { u0, u1, y0, y1 } a lo largo de b
    const out = [], q0 = b.c - b.bw / 2, q1 = b.c + b.bw / 2;
    for (const m of bands) {
      if (!m.conc || m === b || m.lvl !== b.lvl) continue;
      const mu = [m.elo, m.ehi], mq = [m.c - m.bw / 2, m.c + m.bw / 2];
      const [ua, ub, qa, qb] = b.ax === m.ax ? [...mu, ...mq] : [...mq, ...mu];
      if (qb <= q0 + 1e-3 || qa >= q1 - 1e-3 || ub <= b.lo + E || ua >= b.hi - E) continue;
      out.push({ u0: ua, u1: ub, y0: m.yb, y1: m.yt });
    }
    return out;
  };
  const outFn = (b) => (b.out === 'aparente' ? () => 0 : b.out === 'nogal' ? (x, y, z) => 32.02 + 0.6 * sOf(z) : (x, y, z) => finPl(b.lvl)(x, y, z) + 0.02);
  const XZ = (b, u, q) => (b.ax === 0 ? [u, q] : [q, u]);   // (a lo largo, transversal) -> (x, z)
  const through = (b, x, z, tol = 0.06) => {
    const u = b.ax === 0 ? x : z, q = b.ax === 0 ? z : x;
    return Math.abs(q - b.c) <= tol && u >= b.lo - tol && u <= b.hi + tol;
  };
  const footprint = (b, x, z) => {
    const u = b.ax === 0 ? x : z, q = b.ax === 0 ? z : x;
    return u >= b.lo && u <= b.hi && Math.abs(q - b.c) <= b.bw / 2;
  };
  const solidAt = (lvl, x, z, y) => {
    for (const b of bands) {
      if (b.lvl !== lvl || y < b.yb || y > b.yt || !footprint(b, x, z)) continue;
      const u = b.ax === 0 ? x : z;
      if (b.holes.some((h) => u >= h.u0 && u <= h.u1 && y >= h.y0 && y <= h.y1)) continue;
      return true;
    }
    return false;
  };

  // ------------------------------------------------------------ nodos y castillos
  const castles = [];
  for (let lvl = 0; lvl < 3; lvl++) {
    const bs = bands.filter((b) => b.lvl === lvl);
    const nodes = [];
    const add = (x, z, pri) => {
      for (const n of nodes) if (Math.hypot(n.x - x, n.z - z) < 0.30 && n.pri <= pri) return;
      for (let i = nodes.length - 1; i >= 0; i--) if (Math.hypot(nodes[i].x - x, nodes[i].z - z) < 0.30) nodes.splice(i, 1);
      nodes.push({ x, z, pri });
    };
    for (const A of bs) if (A.ax === 0) for (const B of bs) {
      if (B.ax !== 1) continue;
      if (B.c >= A.lo - 0.05 && B.c <= A.hi + 0.05 && A.c >= B.lo - 0.05 && A.c <= B.hi + 0.05) add(B.c, A.c, 0);
    }
    for (const b of bs) for (const u of [b.lo, b.hi]) { const [x, z] = XZ(b, u, b.c); add(x, z, 0); }
    for (const b of bs) {
      const cands = [];
      if (!b.conc) for (const h of b.holes) cands.push(h.u0 - 0.08, h.u1 + 0.08);
      for (const u of cands) if (u - b.lo > 0.2 && b.hi - u > 0.2) { const [x, z] = XZ(b, u, b.c); add(x, z, 1); }
    }
    for (const b of bs) {
      if (b.conc) continue;
      const on = nodes.filter((n) => through(b, n.x, n.z, 0.06)).map((n) => (b.ax === 0 ? n.x : n.z)).sort((p, q) => p - q);
      for (let i = 0; i + 1 < on.length; i++) {
        const d = on[i + 1] - on[i];
        if (d <= 3.0) continue;
        const k = Math.ceil(d / 3) - 1;
        for (let j = 1; j <= k; j++) {
          let u = on[i] + (d * j) / (k + 1);
          for (const h of b.holes) if (u > h.u0 - 0.1 && u < h.u1 + 0.1) u = u - h.u0 < h.u1 - u ? h.u0 - 0.1 : h.u1 + 0.1;
          const [x, z] = XZ(b, u, b.c); add(x, z, 2);
        }
      }
    }
    // columnas: sustituyen al nodo más cercano a menos de 0.25 (o se agregan solas)
    const colSegs = [];
    for (const cl of cols) for (const sg of cl.segs) if (sg.lvl === lvl) colSegs.push({ cl, sg });
    for (const { cl, sg } of colSegs) {
      let k = -1, best = 0.25;
      nodes.forEach((n, i) => { const d = Math.hypot(n.x - cl.cx, n.z - cl.cz); if (d < best) { best = d; k = i; } });
      const nn = { x: cl.cx, z: cl.cz, pri: -1, col: { cl, sg } };
      if (k >= 0) nodes[k] = nn; else nodes.push(nn);
    }
    for (const n of nodes) {
      if (!n.col && bs.some((b) => b.conc && through(b, n.x, n.z))) continue;   // sobre un muro de concreto no va castillo
      const thr = bs.filter((b) => !b.conc && through(b, n.x, n.z));
      if (!thr.length && !n.col) continue;
      let wx = 0.15, wz = 0.15, minx = Infinity, minz = Infinity;
      for (const b of thr) { if (b.ax === 1) minx = Math.min(minx, b.bw); else minz = Math.min(minz, b.bw); }
      if (minx < Infinity) wx = minx; if (minz < Infinity) wz = minz;
      if (n.col) { wx = n.col.cl.wx; wz = n.col.cl.wz; }
      let yb = thr.length ? Math.max(...thr.map((b) => b.yb)) : n.col.sg.y0, top = thr.length ? Math.max(...thr.map((b) => b.yt - b.dalaH)) : n.col.sg.y1;
      if (n.col) { yb = n.col.sg.y0; top = n.col.sg.y1; }
      if (top - yb < 0.3) continue;
      let x0 = n.x - wx / 2, x1 = n.x + wx / 2, z0 = n.z - wz / 2, z1 = n.z + wz / 2, drop = false;
      for (const b of thr) for (const h of b.holes) {
        if (h.y1 <= yb + 0.01 || h.y0 >= top - 0.01) continue;
        const uc = b.ax === 0 ? n.x : n.z, c0 = b.ax === 0 ? x0 : z0, c1 = b.ax === 0 ? x1 : z1;
        if (h.u1 <= c0 + 1e-4 || h.u0 >= c1 - 1e-4) continue;
        let a0 = c0, a1 = c1;
        if (h.u0 >= uc - 1e-4) a1 = Math.min(a1, h.u0 - 0.005);
        else if (h.u1 <= uc + 1e-4) a0 = Math.max(a0, h.u1 + 0.005);
        else { drop = true; break; }
        if (b.ax === 0) { x0 = a0; x1 = a1; } else { z0 = a0; z1 = a1; }
      }
      if (drop || x1 - x0 < 0.05 || z1 - z0 < 0.05) continue;
      const reg = bs.filter((b) => { const r = b.ax === 0 ? [b.lo, b.c - b.bw / 2, b.hi, b.c + b.bw / 2] : [b.c - b.bw / 2, b.lo, b.c + b.bw / 2, b.hi]; return x0 < r[2] - 1e-3 && x1 > r[0] + 1e-3 && z0 < r[3] - 1e-3 && z1 > r[1] + 1e-3; });
      const wb = thr.length ? thr : reg;
      const c = { lvl, x: n.x, z: n.z, x0, x1, z0, z1, yb, top, bands: wb, col: n.col ? n.col.cl.id : null };
      if (n.col) { const w = n.col.sg.w; c.Wr = w[0]; c.Wc = w[1]; c.Wk = w[2]; c.Wd = w[3]; }
      else {
        const Ws = Math.min(...wb.map((b) => b.Ws)), We = Math.max(...wb.map((b) => b.We));
        c.Wr = Ws - 0.35; c.Wc = We + 0.10; c.Wk = c.Wc + 0.12; c.Wd = c.Wk + 0.45;
      }
      c.aparente = wb.length > 0 && wb.every((b) => b.out === 'aparente');
      c.out = c.aparente ? () => 0 : (x, y, z) => finPl(lvl)(x, y, z) + 0.02;
      castles.push(c);
      for (const b of new Set([...thr, ...reg])) b.castles.push(c);
      castWk.push(c.Wk);
    }
  }
  castWk.sort((p, q) => p - q);

  // semana de la hilada de una altura dentro de una banda (para dinteles y repisones)
  const rowWeek = (b, y, u) => {
    const i = clamp(Math.floor((y - b.yb) / b.hc + 1e-6), 0, b.n - 1);
    const f = b.L >= 1 ? Math.abs(u - b.uS) / b.L : 0;
    return b.Ws + (b.D * (i + 0.85 * f)) / b.n;
  };

  // ------------------------------------------------------------ cuerpo de un castillo (varillas, estribos, cimbra, concreto)
  function emitCastle(c) {
    const R = acc.rebar, T = acc.timber, C = acc.conc;
    const hx = (c.x1 - c.x0) / 2, hz = (c.z1 - c.z0) / 2, cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
    const rx = Math.max(0.02, hx - 0.035), rz = Math.max(0.02, hz - 0.035);
    const out = c.out;
    const ya = c.yb + 0.05;
    // las cuatro varillas se paran primero (suben en 0.05 semanas) y los estribos se amarran después, de abajo hacia arriba (0.12 semanas más)
    const hA = c.top + 0.05 - ya, wRod = (x, y, z) => c.Wr + 0.05 * clamp((y - ya) / hA, 0, 1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) rod(R, 1, ya, c.top + 0.05, cx + sx * rx, cz + sz * rz, 0.0048, wRod, c.aparente ? c.Wk + 0.5 : out);
    const sSp = c.col ? (phone ? 0.30 : 0.15) : armexSp;   // columnas: estribos a cada 15
    const nst = Math.max(1, Math.floor((c.top - c.yb - 0.15) / sSp) + 1);
    for (let i = 0; i < nst; i++) {
      const y = c.yb + 0.10 + i * sSp;
      if (y > c.top - 0.03) break;
      ring(R, cx, cz, hx - 0.022, hz - 0.022, y, y + 0.006, 0.006, c.Wr + 0.05 + (0.12 * i) / nst, c.aparente ? c.Wk + 0.5 : out);
    }
    if (c.lvl >= 1) {   // arranques: varillas que quedan de la losa de abajo, antes del armex completo
      const s = slabOf(c.lvl);
      if (s && onSlab(s, c.x, c.z)) {
        const y0 = s.y + 0.03, wk = rebW(c.lvl, c.z) + 0.1;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) rod(R, 1, y0, c.yb + 0.85, cx + sx * rx, cz + sz * rz, 0.0048, wk, c.aparente ? c.Wk + 0.5 : out);
      }
    }
    // concreto: colado de abajo hacia arriba (oscuro y húmedo, lo aclara el shader)
    const ins = 0.002, h = c.top - c.yb;
    const wkc = (x, y, z) => c.Wk + 0.05 * clamp((y - c.yb) / h, 0, 1);
    if (c.aparente) box(acc.cmuA, c.x0 + ins, c.yb, c.z0 + ins, c.x1 - ins, c.top, c.z1 - ins, wkc, 0, { skip: 8, col: [TONO_A, TONO_A, TONO_A * 0.985], uv: () => [0.25, 0.5] });   // aplanado al ras del mismo gris
    else pbox(acc.concPour, c.x0 + ins, c.yb, c.z0 + ins, c.x1 - ins, c.top, c.z1 - ins, c.Wk, 0.06, out, { skip: 8 });   // el nivel sube dentro de la cimbra
    // cimbra de tabla (19 mm) en las caras expuestas
    const ym = (c.yb + c.top) / 2, tb = 0.019, off = 0.10;
    const topB = c.top - 0.06;
    const faces = [
      { n: [1, 0], p: [c.x1 + off, c.z], ok: !solidAt(c.lvl, c.x1 + off, c.z, ym) },
      { n: [-1, 0], p: [c.x0 - off, c.z], ok: !solidAt(c.lvl, c.x0 - off, c.z, ym) },
      { n: [0, 1], p: [c.x, c.z1 + off], ok: !solidAt(c.lvl, c.x, c.z1 + off, ym) },
      { n: [0, -1], p: [c.x, c.z0 - off], ok: !solidAt(c.lvl, c.x, c.z0 - off, ym) },
    ];
    let any = false;
    for (const f of faces) {
      if (!f.ok) continue;
      any = true;
      if (f.n[0]) { const xa = f.n[0] > 0 ? c.x1 + 0.001 : c.x0 - 0.001 - tb; box(T, xa, c.yb, c.z0 - tb, xa + tb, topB, c.z1 + tb, c.Wc, c.Wd); }
      else { const za = f.n[1] > 0 ? c.z1 + 0.001 : c.z0 - 0.001 - tb; box(T, c.x0, c.yb, za, c.x1, topB, za + tb, c.Wc, c.Wd); }
    }
    if (any) for (const k of [1 / 3, 2 / 3]) {
      const y = c.yb + (topB - c.yb) * k;
      ring(T, cx, cz, hx + tb + 0.05, hz + tb + 0.05, y - 0.025, y + 0.025, 0.05, c.Wc, c.Wd);
    }
  }

  // ------------------------------------------------------------ una banda: block, dala, dinteles, hilos
  function emitBand(b) {
    const A = b.out === 'aparente' ? acc.cmuA : acc.cmu, outB = outFn(b), tono = b.out === 'aparente' ? TONO_A : 1;
    const q0 = b.c - b.bw / 2, q1 = b.c + b.bw / 2;
    const ents = b.castles.map((c) => (b.ax === 0 ? [c.x0, c.x1, c.z0, c.z1] : [c.z0, c.z1, c.x0, c.x1]));   // [u0, u1, q0, q1] de cada castillo
    const dir = b.uS === b.lo ? 1 : -1;
    const cEnts = concEnts(b);
    const mkb = (a0, a1, y0, y1, c0, c1, wk, out, o) => (b.ax === 0 ? box(A, a0, y0, c0, a1, y1, c1, wk, out, o) : box(A, c0, y0, a0, c1, y1, a1, wk, out, o));
    for (let i = 0; i < b.n; i++) {
      const y0 = b.yb + i * b.hc, y1 = y0 + b.hc;
      let spans = [[b.lo, b.hi]];
      for (const h of b.holes) if (y1 > h.ySill + E && y0 < h.yHead - E) spans = subIv(spans, h.u0, h.u1);
      for (let k = 0; k < b.castles.length; k++) {
        const c = b.castles[k];
        if (!(y1 > c.yb + E && y0 < c.top - E)) continue;
        // dentado: una hilada sí y una no entra al castillo (las bandas en z van desfasadas de las de x, como el cuatrapeo de una esquina)
        const d = !c.col && !c.aparente && ents[k][1] - ents[k][0] > 0.11 && (i + b.ax) % 2 === 1 ? DIENTE : 0;
        spans = subIv(spans, ents[k][0] + d, ents[k][1] - d);
      }
      for (const e of cEnts) if (y1 > e.y0 + E && y0 < e.y1 - E) spans = subIv(spans, e.u0, e.u1);   // el block termina contra el concreto
      const org = b.lo - (i % 2 ? 0.20 : 0);
      let first = Infinity, last = -Infinity;
      for (const [s0, s1] of spans) {
        const nk0 = Math.floor((s0 - org) / 0.40 + 1e-6), nk1 = Math.ceil((s1 - org) / 0.40 - 1e-6);
        for (let k = nk0; k < nk1; k++) {
          const aNom = org + k * 0.40, a0 = Math.max(aNom, s0), a1 = Math.min(aNom + 0.40, s1);
          if (a1 - a0 < 0.04) continue;
          const uc = (a0 + a1) / 2, f = b.L >= 1 ? Math.abs(uc - b.uS) / b.L : 0;
          const dEnd = Math.min(uc - b.lo, b.hi - uc);
          const lead = b.L >= 1 ? 1.2 * (b.D / b.n) * Math.max(0, 1 - dEnd / 1.2) : 0;
          const wk = b.Ws + (b.D * (i + 0.85 * f)) / b.n - lead;
          // caras de los extremos: solo la que mira hacia donde avanza el muro (y el arranque del tramo); nunca contra un castillo
          let skip = 1 << 3;   // sin cara de abajo
          const leadFace = dir > 0 ? (b.ax === 0 ? 0 : 4) : (b.ax === 0 ? 1 : 5), trailFace = dir > 0 ? (b.ax === 0 ? 1 : 5) : (b.ax === 0 ? 0 : 4);
          const leadU = dir > 0 ? a1 : a0, trailU = dir > 0 ? a0 : a1;
          const firstOfSpan = Math.abs(trailU - (dir > 0 ? s0 : s1)) < 1e-4;
          if (!firstOfSpan) skip |= 1 << trailFace;   // contra un castillo la punta se dibuja: el concreto va metido 2 mm, sin z-fighting
          const sh = (0.92 + rnd() * 0.13) * tono;
          const col = [sh, sh, sh * 0.985];
          const axf = b.ax === 0 ? 0 : 2;   // eje a lo largo
          const uvf = (fi, x, y, z) => {
            const a = axf === 0 ? x : z, q = axf === 0 ? z : x, n = FACES[fi].n;
            if (n[1]) return [0.5 + (0.5 * (a - aNom)) / 0.40, (q - q0) / b.bw];
            if (n[axf]) return [0.5 * (q - q0) / b.bw, (y - y0) / b.hc];
            return [(0.5 * (a - aNom)) / 0.40, (y - y0) / b.hc];
          };
          mkb(a0, a1, y0, y1, q0, q1, wk, outB(b.ax === 0 ? uc : b.c, (y0 + y1) / 2, b.ax === 0 ? b.c : uc), { skip, uv: uvf, col });
          if (o.record) o.record.push({ b, i, u0: a0, u1: a1, y0, y1, wk });
          sorted[b.lvl].push(wk); counts[b.lvl]++;
          if (wk < first) first = wk; if (wk > last) last = wk;
        }
      }
      // mortero: dos cordones de 3 cm sobre las paredes del block de abajo (así se asienta el block hueco), que corren un poco adelante de la hilada;
      // y escalerilla: refuerzo horizontal de alambre cada dos hiladas, con travesaño a cada 40 cm. Los dos quedan dentro de la hilada siguiente.
      if (!phone) {
        const rw = (ii) => (x, y, z) => b.Ws + (b.D * (ii + 0.85 * (b.L >= 1 ? Math.abs((b.ax === 0 ? x : z) - b.uS) / b.L : 0))) / b.n;
        const bxa = (AA, ua, ub, ya, yb2, qa, qb, wk, out, skip) => (b.ax === 0 ? box(AA, ua, ya, qa, ub, yb2, qb, wk, out, { skip }) : box(AA, qa, ya, ua, qb, yb2, ub, wk, out, { skip }));
        const ends = b.ax === 0 ? 3 : 48, sides = b.ax === 0 ? 48 : 3;
        const inner1 = b.ax === 0 ? 16 : 1, inner0 = b.ax === 0 ? 32 : 2;   // cara que mira al centro del muro: +q en el cordón de q0, -q en el de q1
        const r0 = rw(i), r1 = rw(i + 1), wM = (x, y, z) => r0(x, y, z) - 0.012, oM = (x, y, z) => r0(x, y, z) + 0.25;
        const wE = (x, y, z) => r0(x, y, z) + 0.03, oE = (x, y, z) => r1(x, y, z) + 0.06;
        const esc = i % 2 === 1 && i < b.n - 1;
        for (const [s0, s1] of spans) {
          if (s1 - s0 < 0.12) continue;
          for (const [qa, qb] of [[q0 + 0.004, q0 + 0.034], [q1 - 0.034, q1 - 0.004]]) bxa(acc.mort, s0, s1, y0 - 0.001, y0 + 0.012, qa, qb, wM, oM, 8 | ends | (qa < b.c ? inner1 : inner0));   // solo la cara de arriba y la de afuera
          if (!esc) continue;
          for (const qc of [q0 + 0.028, q1 - 0.028]) bxa(acc.rebar, s0 + 0.02, s1 - 0.02, y1 + 0.001, y1 + 0.005, qc - 0.002, qc + 0.002, wE, oE, 8 | ends);
          for (let u = s0 + 0.2; u < s1 - 0.05; u += 0.4) bxa(acc.rebar, u - 0.002, u + 0.002, y1 + 0.001, y1 + 0.0045, q0 + 0.03, q1 - 0.03, wE, oE, 8 | sides | ends);   // solo la cara de arriba
        }
      }
      // hilo de reventón: una caja de 2 mm a lo largo de la hilada en curso, naranja de la marca (existe mientras la hilada se levanta)
      if (!phone && first < Infinity && b.L > 0.8 && !b.nothread) {
        const qq = b.c - b.bw / 2 - 0.012, yy = y1 + 0.005, o = outFn(b);
        const wkT = first - 0.02, outT = last + 0.03;
        // hilo blanco de nylon de 1.5 mm
        if (b.ax === 0) box(acc.eps, b.lo, yy - 0.00075, qq - 0.00075, b.hi, yy + 0.00075, qq + 0.00075, wkT, outT, { skip: 3 | (1 << 0) | (1 << 1) });
        else box(acc.eps, qq - 0.00075, yy - 0.00075, b.lo, qq + 0.00075, yy + 0.00075, b.hi, wkT, outT, { skip: 3 | (1 << 4) | (1 << 5) });
        void o;
      }
    }
    // reglas de escantillón: dos tablas de 5 × 5 en los extremos, de pie junto a la cara, mientras se levanta el muro
    if (!phone && b.L > 1.5 && !b.nothread) for (const uu of [b.lo + 0.03, b.hi - 0.03]) {
      const qa = b.c - b.bw / 2 - 0.065, ya = b.yb, yb2 = b.yt - b.dalaH;
      if (b.ax === 0) box(acc.timber, uu - 0.025, ya, qa, uu + 0.025, yb2, qa + 0.05, b.Ws - 0.1, b.We + 0.15);
      else box(acc.timber, qa, ya, uu - 0.025, qa + 0.05, yb2, uu + 0.025, b.Ws - 0.1, b.We + 0.15);
    }
    // ---- dala de cerramiento (concreto armado por tramos de 1.2 m)
    {
      const yd0 = b.yt - b.dalaH, hw = b.bw / 2 - 0.002, outD = outFn(b);
      let dsp = [[b.lo, b.hi]];
      for (const h of b.holes) if (h.dalaCut) dsp = subIv(dsp, h.u0, h.u1);
      for (const e of cEnts) if (b.yt > e.y0 + E && yd0 < e.y1 - E) dsp = subIv(dsp, e.u0, e.u1);
      const Wa = b.We + 0.06, Wcd = Wa + 0.10;
      for (const [s0, s1] of dsp) {
        const nseg = Math.max(1, Math.round((s1 - s0) / 1.2));
        for (let k = 0; k < nseg; k++) {
          const a0 = s0 + ((s1 - s0) * k) / nseg, a1 = s0 + ((s1 - s0) * (k + 1)) / nseg;
          const um = (a0 + a1) / 2, f = b.L >= 1 ? Math.abs(um - b.uS) / b.L : 0;
          const Wkd = Wcd + 0.10 + 0.2 * f;
          const mk = (BA, x, y, z, ...r) => void 0;
          void mk;
          const bxu = (AA, ua, ub, ya, yb2, qa, qb, wk, out, o2) => (b.ax === 0 ? box(AA, ua, ya, qa, ub, yb2, qb, wk, out, o2) : box(AA, qa, ya, ua, qb, yb2, ub, wk, out, o2));
          if (b.out === 'aparente') bxu(acc.cmuA, a0, a1, yd0, b.yt, b.c - hw, b.c + hw, Wkd, 0, flatO(b));
          else {
            const oD = outD(b.ax === 0 ? um : b.c, b.yt, b.ax === 0 ? b.c : um);
            if (b.ax === 0) pbox(acc.concPour, a0, yd0, b.c - hw, a1, b.yt, b.c + hw, Wkd, 0.06, oD); else pbox(acc.concPour, b.c - hw, yd0, a0, b.c + hw, b.yt, a1, Wkd, 0.06, oD);
          }
          // cimbra: tabla de 19 mm en ambas caras, de 5 cm bajo la dala hasta la corona
          for (const sg of [-1, 1]) {
            const qa = sg < 0 ? b.c - b.bw / 2 - 0.001 - 0.019 : b.c + b.bw / 2 + 0.001, qb = qa + 0.019;
            const cm = b.ax === 0 ? [um, b.c + sg * (b.bw / 2 + 0.1)] : [b.c + sg * (b.bw / 2 + 0.1), um];
            if (solidAt(b.lvl, cm[0], cm[1], b.yt - b.dalaH / 2)) continue;
            bxu(acc.timber, a0, a1, yd0 - 0.05, b.yt, qa, qb, Wcd, Wkd + 0.4);
          }
        }
        // armado: 4 varillas #3 y estribos a 0.25
        const rr = b.bw / 2 - 0.035, ys = [yd0 + 0.04, b.yt - 0.04];
        const oR = b.out === 'aparente' ? b.We + 1.0 : outD(b.ax === 0 ? (s0 + s1) / 2 : b.c, b.yt, b.ax === 0 ? b.c : (s0 + s1) / 2);
        for (const dq of [-rr, rr]) for (const y of ys) {
          if (b.ax === 0) rod(acc.rebar, 0, s0, s1, y, b.c + dq, 0.0048, Wa, oR); else rod(acc.rebar, 2, s0, s1, b.c + dq, y, 0.0048, Wa, oR);
        }
        const ns = Math.max(1, Math.floor((s1 - s0 - 0.1) / stirSp) + 1);
        for (let k = 0; k < ns; k++) {
          const u = ns === 1 ? (s0 + s1) / 2 : s0 + 0.05 + ((s1 - s0 - 0.1) * k) / (ns - 1);
          ringV(acc.rebar, b.ax === 0 ? 0 : 2, u, b.c, b.bw / 2 - 0.022, yd0 + 0.022, b.yt - 0.022, 0.006, Wa, oR);
        }
      }
    }
    // ---- dinteles y repisones
    for (const h of b.holes) {
      const hw = b.bw / 2 - 0.002, yTop = Math.min(h.yHead, b.yt - b.dalaH);
      const uM = (h.u0 + h.u1) / 2;
      const bxu = (AA, ua, ub, ya, yb2, qa, qb, wk, out, o2) => (b.ax === 0 ? box(AA, ua, ya, qa, ub, yb2, qb, wk, out, o2) : box(AA, qa, ya, ua, qb, yb2, ub, wk, out, o2));
      const oFr0 = b.out === 'aparente' ? rowWeek(b, h.y1, uM) + 0.6 : null;
      const oF = b.out === 'aparente' ? 0 : outFn(b)(b.ax === 0 ? uM : b.c, h.y1, b.ax === 0 ? b.c : uM);
      if (h.y1 < b.yt - b.dalaH - 0.01 && yTop - h.y1 > 0.02) {
        const wH = rowWeek(b, h.y1, uM), a0 = h.u0 - 0.155, a1 = h.u1 + 0.155;
        bxu(b.out === 'aparente' ? acc.cmuA : acc.conc, a0, a1, h.y1, yTop, b.c - hw, b.c + hw, wH + 0.05, oF, flatO(b));
        // armex del dintel
        const rr = hw - 0.03;
        for (const dq of [-rr, rr]) for (const y of [h.y1 + 0.04, yTop - 0.04]) {
          if (b.ax === 0) rod(acc.rebar, 0, a0 + 0.02, a1 - 0.02, y, b.c + dq, 0.0048, wH - 0.05, oFr0 ?? oF); else rod(acc.rebar, 2, a0 + 0.02, a1 - 0.02, b.c + dq, y, 0.0048, wH - 0.05, oFr0 ?? oF);
        }
        // cimbra: fondo de triplay de 16 mm y dos pies derechos de 5 × 10
        bxu(acc.ply, a0, a1, h.y1 - 0.017, h.y1 - 0.001, b.c - b.bw / 2 - 0.02, b.c + b.bw / 2 + 0.02, wH - 0.1, wH + 0.55);
        const yf = Math.max(0, h.y0 > b.yb + 0.001 ? h.y0 : b.yb);
        for (const u of [h.u0 + 0.1, h.u1 - 0.1]) {
          if (b.ax === 0) box(acc.timber, u - 0.025, yf, b.c - 0.05, u + 0.025, h.y1 - 0.017, b.c + 0.05, wH - 0.1, wH + 0.55);
          else box(acc.timber, b.c - 0.05, yf, u - 0.025, b.c + 0.05, h.y1 - 0.017, u + 0.025, wH - 0.1, wH + 0.55);
        }
      }
      if (h.ySill > -Infinity && h.y0 - h.ySill > 0.01) {
        bxu(b.out === 'aparente' ? acc.cmuA : acc.conc, h.u0, h.u1, h.ySill, h.y0, b.c - hw, b.c + hw, rowWeek(b, h.ySill + 0.01, uM) + 0.03, oF, flatO(b));
      }
    }
    for (const c of b.castles) c.done = true;
  }

  // ------------------------------------------------------------ armado y cimbra de losas, trabes y columnas
  const camBlocked = (x, z, ylo, yhi, w0, w1) => samples.some((s) => s.y > ylo && s.y < yhi && (s.x - x) ** 2 + (s.z - z) ** 2 < 0.6 * 0.6 && (s.w === undefined || (s.w > w0 - 0.5 && s.w < w1 + 1)));

  // ------------------------------------------------------------ muro de concreto armado: malla, cuerdas, cimbra de triplay y colado
  function emitConcWall(b) {
    const R = acc.rebar, T = acc.timber, P = acc.ply, C = acc.conc;
    const lo = b.elo, hi = b.ehi, H = b.yt - b.yb, q0 = b.c - b.bw / 2, q1 = b.c + b.bw / 2, ax0 = b.ax === 0;
    const hl = b.holes.map((h) => ({ u0: h.u0, u1: h.u1, y0: Math.max(h.y0, b.yb), y1: Math.min(h.y1, b.yt) })).filter((h) => h.u1 > lo && h.u0 < hi && h.y1 - h.y0 > 0.02);
    const outB = outFn(b);
    const wkP = (x, y, z) => b.Wp + 0.15 * clamp((y - b.yb) / H, 0, 1);
    const outR = (x, y, z) => wkP(x, y, z) + 0.05;
    const stag = (u) => (b.L >= 1 ? 0.2 * clamp(Math.abs(u - b.uS) / b.L, 0, 1) : 0);
    const bxu = (AA, ua, ub, ya, yb2, qa, qb, wk, out, o2) => (ax0 ? box(AA, ua, ya, qa, ub, yb2, qb, wk, out, o2) : box(AA, qa, ya, ua, qb, yb2, ub, wk, out, o2));
    const hrod = (u0, u1, y, q, r, wk) => (ax0 ? rod(R, 0, u0, u1, y, q, r, wk, outR) : rod(R, 2, u0, u1, q, y, r, wk, outR));
    const vrod = (u, y0, y1, q, r, wk) => (ax0 ? rod(R, 1, y0, y1, u, q, r, wk, outR) : rod(R, 1, y0, y1, q, u, r, wk, outR));
    // rectángulos del muro sin huecos: [u0, u1, y0, y1]
    const rects = (ytop) => {
      const ys = new Set([b.yb, ytop]);
      for (const h of hl) for (const y of [h.y0, h.y1]) if (y > b.yb + E && y < ytop - E) ys.add(y);
      const yy = [...ys].sort((p, q) => p - q), out = [];
      for (let i = 0; i + 1 < yy.length; i++) {
        let spans = [[lo, hi]];
        for (const h of hl) if (h.y0 <= yy[i] + E && h.y1 >= yy[i + 1] - E) spans = subIv(spans, h.u0, h.u1);
        for (const [s0, s1] of spans) if (s1 - s0 > 0.01) out.push([s0, s1, yy[i], yy[i + 1]]);
      }
      return out;
    };
    // colado de abajo hacia arriba
    for (const [ra, rb, ya, yb2] of rects(b.yt)) {   // todo el muro sube desde su base (b.yb) en 0.15 semanas
      const o2 = { skip: ya <= b.yb + E ? 8 : 0, base: b.yb };
      if (ax0) pbox(acc.concPour, ra, ya, q0 + 0.002, rb, yb2, q1 - 0.002, b.Wp, 0.15, outB, o2); else pbox(acc.concPour, q0 + 0.002, ya, ra, q1 - 0.002, yb2, rb, b.Wp, 0.15, outB, o2);
    }
    // armado: malla al centro, cuerdas y bordes de huecos
    const sp = phone ? 0.40 : 0.20, rr = b.bw / 2 - 0.035;
    for (let u = lo + 0.10; u < hi - 0.05; u += sp) {
      let iv = [[b.yb + 0.04, b.yt + 0.05]];
      for (const h of hl) if (u > h.u0 - 0.03 && u < h.u1 + 0.03) iv = subIv(iv, h.y0 - 0.03, h.y1 + 0.03);
      for (const [a, c] of iv) if (c - a > 0.05) vrod(u, a, c, b.c - 0.007, 0.0048, b.Ws - 0.2 + stag(u));
    }
    for (let y = b.yb + 0.04; y <= b.yt - 0.04 + 1e-6; y += sp) {
      let sps = [[lo + 0.03, hi - 0.03]];
      for (const h of hl) if (y > h.y0 - 0.03 && y < h.y1 + 0.03) sps = subIv(sps, h.u0 - 0.03, h.u1 + 0.03);
      for (const [a, c] of sps) if (c - a > 0.05) hrod(a, c, y, b.c + 0.007, 0.0048, b.Ws - 0.2 + stag((a + c) / 2));
    }
    for (const y of [b.yb + 0.06, b.yt - 0.06]) for (const dq of [-rr, rr]) {
      let sps = [[lo + 0.03, hi - 0.03]];
      for (const h of hl) if (y > h.y0 - 0.03 && y < h.y1 + 0.03) sps = subIv(sps, h.u0 - 0.03, h.u1 + 0.03);
      for (const [a, c] of sps) if (c - a > 0.05) hrod(a, c, y, b.c + dq, 0.008, b.Ws - 0.2 + stag((a + c) / 2));
    }
    for (const h of hl) {
      const wkh = b.Ws - 0.2 + stag((h.u0 + h.u1) / 2);
      for (const y of [h.y0 - 0.05, h.y1 + 0.05]) {
        if (y < b.yb + 0.04 || y > b.yt - 0.04) continue;
        hrod(Math.max(lo + 0.03, h.u0 - 0.45), Math.min(hi - 0.03, h.u1 + 0.45), y, b.c - 0.018, 0.0063, wkh);
      }
      for (const u of [h.u0 - 0.05, h.u1 + 0.05]) {
        if (u < lo + 0.03 || u > hi - 0.03) continue;
        vrod(u, Math.max(b.yb + 0.04, h.y0 - 0.45), Math.min(b.yt + 0.05, h.y1 + 0.45), b.c + 0.018, 0.0063, wkh);
      }
    }
    // cimbra: triplay de 16 mm a 2 mm del concreto en ambas caras, barrotes por fuera, cajón en cada hueco
    const Wf = b.Ws + 0.3, Wd = b.Ws + 1.3, pt = 0.016;
    const perp = bands.filter((q) => q !== b && q.lvl === b.lvl && q.ax !== b.ax);
    const freeIv = (u0, u1, qp) => {   // tramo libre de muros que llegan por esa cara
      let s = [[u0, u1]];
      for (const q of perp) if (qp >= q.lo - 0.001 && qp <= q.hi + 0.001) s = subIv(s, q.c - q.bw / 2, q.c + q.bw / 2);
      return s;
    };
    const rP = rects(b.yt + 0.02), rB = rects(b.yt);
    for (const sg of [-1, 1]) {
      const qa = sg < 0 ? q0 - 0.002 - pt : q1 + 0.002, qp = b.c + sg * (b.bw / 2 + 0.01);
      for (const [ra, rb, ya, yb2] of rP) for (const [s0, s1] of freeIv(ra, rb, qp)) {
        const n = Math.max(1, Math.round((s1 - s0) / 1.22));
        for (let k = 0; k < n; k++) {
          const a0 = s0 + ((s1 - s0) * k) / n + 0.002, a1 = s0 + ((s1 - s0) * (k + 1)) / n - 0.002, um = (a0 + a1) / 2;
          bxu(P, a0, a1, ya, yb2, qa, qa + pt, Wf + stag(um), Wd + stag(um));
        }
      }
      const qb = sg < 0 ? q0 - 0.020 - 0.10 : q1 + 0.020, qpb = b.c + sg * (b.bw / 2 + 0.06);
      for (let u = lo + 0.15; u < hi - 0.1; u += 0.60) {
        const x = ax0 ? u : b.c + sg * 0.3, z = ax0 ? b.c + sg * 0.3 : u;
        if (camBlocked(x, z, b.yb, b.yt, Wf, Wd)) continue;
        if (!freeIv(u - 0.025, u + 0.025, qpb).some(([a, c]) => a <= u - 0.025 + 1e-4 && c >= u + 0.025 - 1e-4)) continue;
        for (const [ra, rb, ya, yb2] of rB) if (u - 0.025 >= ra + 0.03 && u + 0.025 <= rb - 0.03) bxu(T, u - 0.025, u + 0.025, ya, yb2, qb, qb + 0.10, Wf + 0.05 + stag(u), Wd + stag(u));
      }
    }
    for (const h of hl) {   // cajón del hueco: cuatro tablas de 16 mm contra el concreto
      const wk = Wf + 0.1 + stag((h.u0 + h.u1) / 2), wo = Wd + stag((h.u0 + h.u1) / 2), qa = q0 + 0.001, qb = q1 - 0.001;
      bxu(P, h.u0 + 0.002, h.u0 + 0.002 + pt, h.y0 + 0.002, h.y1 - 0.002, qa, qb, wk, wo);
      bxu(P, h.u1 - 0.002 - pt, h.u1 - 0.002, h.y0 + 0.002, h.y1 - 0.002, qa, qb, wk, wo);
      if (h.y0 > b.yb + 0.01) bxu(P, h.u0 + 0.002 + pt, h.u1 - 0.002 - pt, h.y0 + 0.002, h.y0 + 0.002 + pt, qa, qb, wk, wo);
      if (h.y1 < b.yt - 0.01) bxu(P, h.u0 + 0.002 + pt, h.u1 - 0.002 - pt, h.y1 - 0.002 - pt, h.y1 - 0.002, qa, qb, wk, wo);
    }
  }
  function emitBeam(tr) {
    const hw = tr.w / 2, ax = tr.ax;
    const slab = slabOf(tr.lvl);
    const pw = pour(tr.lvl), wv = SLABW[tr.lvl];
    const mid = (tr.u0 + tr.u1) / 2, xm = ax === 0 ? mid : tr.c, zm = ax === 0 ? tr.c : mid;
    const wRod = (u) => (ax === 0 ? rebW(tr.lvl, tr.c) : rebW(tr.lvl, u)) + 0.1;
    const outR = (x, y, z) => pw(x, y, z) + 0.03;
    const bxu = (AA, ua, ub, ya, yb2, qa, qb, wk, out, o2) => (ax === 0 ? box(AA, ua, ya, qa, ub, yb2, qb, wk, out, o2) : box(AA, qa, ya, ua, qb, yb2, ub, wk, out, o2));
    const peralt = tr.kind === 'T';
    const nSeg = Math.max(1, Math.round((tr.u1 - tr.u0) / 1.5));
    // jaula: 4 varillas #5 y estribos (plana: a 0.20, peraltada: a 0.15)
    const yl = tr.y0 + 0.04, yh = tr.y1 - 0.04, rr = hw - 0.04, rad = 0.008, sp = (peralt ? 0.15 : 0.20) * (phone ? 2 : 1);
    for (let k = 0; k < nSeg; k++) {
      const a0 = tr.u0 + ((tr.u1 - tr.u0) * k) / nSeg, a1 = tr.u0 + ((tr.u1 - tr.u0) * (k + 1)) / nSeg;
      const um = (a0 + a1) / 2, wj = wRod(um) + (peralt ? 0.1 : 0);
      for (const dq of [-rr, rr]) for (const y of [yl, yh]) {
        if (ax === 0) rod(acc.rebar, 0, a0 + 0.02, a1 - 0.02, y, tr.c + dq, rad, wj, outR(xm, tr.y1, zm)); else rod(acc.rebar, 2, a0 + 0.02, a1 - 0.02, tr.c + dq, y, rad, wj, outR(xm, tr.y1, zm));
      }
      const ns = Math.max(1, Math.round((a1 - a0) / sp));
      for (let i = 0; i < ns; i++) {
        const u = a0 + ((i + 0.5) * (a1 - a0)) / ns;
        ringV(acc.rebar, ax, u, tr.c, hw - 0.025, tr.y0 + 0.025, tr.y1 - 0.025, 0.006, wj, ax === 0 ? outR(u, tr.y1, tr.c) : outR(tr.c, tr.y1, u));
      }
    }
    if (!peralt) return;
    // trabe peraltada: concreto (T1; T2 sale de la caja 'trabe' de casa.js), cimbra de fondo y costados y pies derechos cada metro
    const band = tr.id === 'T1';
    const lvl0 = tr.y0 < 2.5 ? 0 : 1;
    if (band) {
      const oT = (x, y, z) => finPl(lvl0 === 0 ? 0 : 1)(x, y, z) + 0.02, wT = (x, y, z) => pw(x, y, z);
      if (ax === 0) pbox(acc.concPour, tr.u0, tr.y0, tr.c - hw + 0.002, tr.u1, tr.y1, tr.c + hw - 0.002, wT, 0.1, oT); else pbox(acc.concPour, tr.c - hw + 0.002, tr.y0, tr.u0, tr.c + hw - 0.002, tr.y1, tr.u1, wT, 0.1, oT);
    }
    const wc = (u) => wv.cim[0] + 0.5 * clamp((u - tr.u0) / (tr.u1 - tr.u0), 0, 1), wo = wv.cimOut;
    const ply = 0.016;
    for (let k = 0; k < nSeg; k++) {
      const a0 = tr.u0 + ((tr.u1 - tr.u0) * k) / nSeg, a1 = tr.u0 + ((tr.u1 - tr.u0) * (k + 1)) / nSeg, w = wc((a0 + a1) / 2) + 0.2;
      bxu(acc.ply, a0, a1, tr.y0 - ply - 0.001, tr.y0 - 0.001, tr.c - hw - ply - 0.002, tr.c + hw + ply + 0.002, w, wo);
      for (const sg of [-1, 1]) {
        const qa = sg < 0 ? tr.c - hw - ply - 0.002 : tr.c + hw + 0.002;
        bxu(acc.ply, a0, a1, tr.y0 - ply - 0.001, tr.y1, qa, qa + ply, w, wo);
      }
    }
    const np = Math.max(2, Math.round((tr.u1 - tr.u0) / 1.0) + 1);
    for (let i = 0; i < np; i++) {
      const u = tr.u0 + 0.15 + ((tr.u1 - tr.u0 - 0.3) * i) / (np - 1), w = wc(u) + 0.05;
      const x = ax === 0 ? u : tr.c, z = ax === 0 ? tr.c : u;
      if (camBlocked(x, z, 0, tr.y0, w, wo)) continue;
      if (ax === 0) box(acc.timber, u - 0.025, 0, tr.c - 0.05, u + 0.025, tr.y0 - ply - 0.001, tr.c + 0.05, w, wo);
      else box(acc.timber, tr.c - 0.05, 0, u - 0.025, tr.c + 0.05, tr.y0 - ply - 0.001, u + 0.025, w, wo);
    }
    void slab; void xm; void zm;
  }
  // ------------------------------------------------------------ losa reticular aligerada: 25 cm = casetón de 60 x 60 x 20 + capa de compresión de 5
  // Orden de obra sobre la cimbra: fronteras del canto, cajas eléctricas clavadas al triplay y pasos sanitarios, casetones (enteros, medios y cuartos:
  // se recortan contra el canto, los muros de abajo y las trabes, donde la losa queda maciza), nervaduras a cada 75 cm en los dos sentidos
  // (2 varillas abajo, estribos a cada 30–45, 2 arriba), poliducto naranja por dentro de las nervaduras de caja a caja y al tablero, y malla 6x6-10/10.
  // El acero y los casetones de cada losa van en acumuladores propios (rebS1.., casS1..): world.js solo los dibuja mientras esa losa se arma.
  const PLX = 6.245, PLZ = 9.965;   // plano -> mundo (CX, CZ de casa.js)
  const TABLERO = [7.25, 14.05];    // centro de carga: muro de la cochera junto al vestíbulo (mismas puntas de poliducto que salen del firme)
  // salidas de luz en el plafón de cada cuarto que cubre la losa (plano)
  const LUCES = {
    1: [[7.4, 12.8], [3.6, 14.2], [3.6, 10.0], [10.0, 5.0], [7.4, 10.0], [9.7, 16.9], [6.38, 16.5], [2.2, 17.4], [9.9, 12.8], [10.7, 7.67], [10.7, 1.3], [11.6, 12.8]],
    2: [[10.0, 0.9], [11.4, 2.7], [8.9, 2.7], [10.0, 5.9], [4.0, 10.0], [7.9, 11.0], [2.7, 17.2], [3.6, 14.0], [10.8, 12.8], [7.8, 16.2], [11.2, 15.0], [11.2, 18.0], [4.4, 5.9], [7.8, 19.4]],
    3: [[8.0, 10.0], [10.7, 10.0], [6.4, 12.0], [9.0, 14.0], [11.3, 14.5]],
  };
  // baños de planta alta sobre la losa 2.80 (plano): [y del ramal, x donde arranca (regadera), x del WC, y de la bajada]; la bajada cae en x 12.1, sobre el tubo que dejó la cimentación
  const BANOS = { 1: [[0.9, 8.6, 11.4, 1.0], [12.8, 9.8, 11.4, 12.8], [17.0, 10.4, 11.4, 17.0]] };
  function emitSlab(s) {
    const L = s.lvl, W = SLABW[L], pw = s.weeks, S = (z) => sOf(z);
    const RB = (acc['rebS' + L] = newAcc()), CA = (acc['casS' + L] = newAcc());
    const y = s.y, XS = s.outer.map((q) => q[0]), ZS = s.outer.map((q) => q[1]);
    const xmin = Math.min(...XS), xmax = Math.max(...XS), zmin = Math.min(...ZS), zmax = Math.max(...ZS);
    const outP = (x, yy, z) => pw(x, yy, z) + 0.11;   // el colado sube en ~0.1 semanas (concPour en world.js) y se lo traga
    const mod = 0.75, cs = 0.60, q = cs / 2;
    const gx0 = xmin + 0.375, gz0 = zmin + 0.375;     // centro del primer casetón; las nervaduras pasan por xmin + 0.75 k
    const hitR = (r, list, pad) => list.some((o) => r[0] < o[2] + pad && r[2] > o[0] - pad && r[1] < o[3] + pad && r[3] > o[1] - pad);
    // donde la losa es maciza: sobre los muros que la cargan, en las trabes y a lo largo de los tubos
    const OB = [];
    for (const b of bands) if (b.lvl === L - 1 && Math.abs(b.yt - y) < 0.12) OB.push(b.ax === 0 ? [b.lo, b.c - b.bw / 2, b.hi, b.c + b.bw / 2] : [b.c - b.bw / 2, b.lo, b.c + b.bw / 2, b.hi]);
    for (const t of trabes) if (t.lvl === L || (t.kind === 'T' && L === 1)) OB.push(t.ax === 0 ? [t.u0, t.c - t.w / 2, t.u1, t.c + t.w / 2] : [t.c - t.w / 2, t.u0, t.c + t.w / 2, t.u1]);
    const wCas = (x, z) => W.cas[0] + W.cas[1] * (S(z) + 0.036 * (x - xmin) / (xmax - xmin));   // fila por fila hacia la calle, y dentro de la fila de poniente a oriente

    // ---- pasos sanitarios de los baños de arriba: ramal de 4" a media losa, WC y regadera que asoman con tapón, y bajada junto al muro oriente
    const pvc = acc.pvc || (acc.pvc = newAcc());
    for (const [yb0, xa, xw, ybj] of BANOS[L] || []) {
      // el ramal corre por el centro de una media hilera de casetones (así solo se recorta medio casetón)
      const zr = gz0 - q / 2 + Math.round((yb0 - PLZ - (gz0 - q / 2)) / mod) * mod, x0 = xa - PLX, x1 = 12.1 - PLX, zj = ybj - PLZ, yp = y + 0.11;
      const wk = wCas(x0, zr) - 0.04, oS = 24.6;
      rod(pvc, 0, x0, x1, yp, zr, 0.044, wk, outP(x1, y, zr), 8);
      if (Math.abs(zj - zr) > 0.02) rod(pvc, 2, Math.min(zr, zj), Math.max(zr, zj), x1, yp, 0.044, wk, outP(x1, y, zj), 8);
      rod(pvc, 1, 0.30, yp + 0.04, x1, zj, 0.044, wk, oS, 8);                                     // bajada hasta el tubo de la cimentación
      for (const [x, r] of [[xw - PLX, 0.044], [x0, 0.024]]) {
        rod(pvc, 1, yp, y + 0.50, x, zr, r, wk, oS, 8);
        box(pvc, x - r - 0.006, y + 0.47, zr - r - 0.006, x + r + 0.006, y + 0.505, zr + r + 0.006, wk, oS);   // tapón
      }
      OB.push([x0 - 0.1, zr - 0.07, x1 + 0.07, zr + 0.07], [x1 - 0.07, Math.min(zr, zj) - 0.07, x1 + 0.07, Math.max(zr, zj) + 0.07]);
    }

    // ---- casetones: cada uno son cuatro cuartos de 30 x 30; se pone entero, en medios o en cuartos según lo que quepa
    const libre = (x0, z0, x1, z1) => {
      for (const [px, pz] of [[x0 - 0.12, z0 - 0.12], [x1 + 0.12, z0 - 0.12], [x1 + 0.12, z1 + 0.12], [x0 - 0.12, z1 + 0.12], [(x0 + x1) / 2, (z0 + z1) / 2]]) if (!onSlab(s, px, pz)) return false;
      return !hitR([x0, z0, x1, z1], OB, 0.03);
    };
    const cas = (x0, z0, x1, z1) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      box(CA, x0, y + 0.005, z0, x1, y + 0.20, z1, wCas(cx, cz), outP(cx, y, cz), { skip: 8 });
    };
    for (let x = gx0; x < xmax; x += mod) for (let z = gz0; z < zmax; z += mod) {
      const f = [[libre(x - q, z - q, x, z), libre(x, z - q, x + q, z)], [libre(x - q, z, x, z + q), libre(x, z, x + q, z + q)]];   // f[fila en z][columna en x]
      if (f[0][0] && f[0][1] && f[1][0] && f[1][1]) { cas(x - q, z - q, x + q, z + q); continue; }
      for (let r = 0; r < 2; r++) {
        const z0 = z - q + r * q;
        if (f[r][0] && f[r][1]) cas(x - q, z0, x + q, z0 + q);
        else for (let c = 0; c < 2; c++) if (f[r][c]) cas(x - q + c * q, z0, x - q + c * q + q, z0 + q);
      }
    }

    // ---- nervaduras: en el eje entre casetones. 2 varillas abajo, estribos y 2 arriba (en ese orden), recortadas a la losa
    const rr = 0.04, rad = 0.0048, hq = 0.047, ya = y + 0.028, yb = y + 0.222;
    const ribs = (ax) => {
      const g0 = (ax === 0 ? gz0 : gx0) + mod / 2, g1 = ax === 0 ? zmax : xmax, u00 = (ax === 0 ? xmin : zmin) + 0.075;
      for (let c = g0; c < g1; c += mod) {
        for (const [a, b] of slabSpans(s, ax, c)) {
          if (b - a < 0.2) continue;
          const mid = (a + b) / 2, wk = W.var[0] + W.var[1] * S(ax === 0 ? c : mid), out = outP(ax === 0 ? mid : c, y, ax === 0 ? c : mid);
          for (const dq of [-rr, rr]) for (const [yy, dw] of [[y + 0.035, 0], [y + 0.215, 0.12]]) {
            if (ax === 0) rod(RB, 0, a + 0.05, b - 0.05, yy, c + dq, rad, wk + dw, out); else rod(RB, 2, a + 0.05, b - 0.05, c + dq, yy, rad, wk + dw, out);
          }
          if (phone) continue;
          // estribos: dos por módulo, lejos del cruce con la otra nervadura. Dos patas (prisma de 3 caras) y los ganchos de arriba y abajo como tiras planas
          for (let k = Math.floor((a - u00) / mod); u00 + k * mod < b; k++) for (const du of [0.15, 0.45]) {
            const u = u00 + k * mod + du;
            if (u < a + 0.08 || u > b - 0.08) continue;
            const ws = W.var[0] + W.var[1] * S(ax === 0 ? c : u) + 0.06, t = 0.003;
            if (ax === 0) {
              for (const sg of [-1, 1]) rod(RB, 1, ya, yb, u, c + sg * hq, 0.003, ws, out, 3);
              box(RB, u - t, yb - 0.002, c - hq, u + t, yb + 0.004, c + hq, ws, out, { skip: 1 | 2 | 8 | 16 | 32 });
              box(RB, u - t, ya - 0.004, c - hq, u + t, ya + 0.002, c + hq, ws, out, { skip: 1 | 2 | 4 | 16 | 32 });
            } else {
              for (const sg of [-1, 1]) rod(RB, 1, ya, yb, c + sg * hq, u, 0.003, ws, out, 3);
              box(RB, c - hq, yb - 0.002, u - t, c + hq, yb + 0.004, u + t, ws, out, { skip: 1 | 2 | 8 | 16 | 32 });
              box(RB, c - hq, ya - 0.004, u - t, c + hq, ya + 0.002, u + t, ws, out, { skip: 1 | 2 | 4 | 16 | 32 });
            }
          }
        }
      }
    };
    ribs(0); ribs(1);

    // ---- malla electrosoldada 6x6-10/10: alambre de 4 mm cada 0.15 (0.30 en celular), a 23 cm de la cara de abajo
    const ms = phone ? 0.30 : 0.15;
    for (const ax of [0, 1]) {
      for (let c = (ax === 0 ? zmin : xmin) + ms / 2; c < (ax === 0 ? zmax : xmax); c += ms) {
        for (const [a, b] of slabSpans(s, ax, c)) {
          const wk = W.mal[0] + W.mal[1] * S(ax === 0 ? c : (a + b) / 2), mid = (a + b) / 2;
          const out = outP(ax === 0 ? mid : c, y, ax === 0 ? c : mid);
          if (ax === 0) box(RB, a, y + 0.228, c - 0.002, b, y + 0.232, c + 0.002, wk, out, { skip: 8 | 3 }); else box(RB, c - 0.002, y + 0.228, a, c + 0.002, y + 0.232, b, wk, out, { skip: 8 | 3 });
        }
      }
    }

    // ---- fronteras: tabla de 2.5 cm por fuera del canto de la losa y por dentro de sus huecos, de la cimbra al descimbrado del canto
    for (const poly of [s.outer, ...s.holes]) for (let i = 0; i < poly.length; i++) {
      const [ax0, az0] = poly[i], [bx0, bz0] = poly[(i + 1) % poly.length], len = Math.hypot(bx0 - ax0, bz0 - az0);
      if (len < 0.2) continue;
      const ux = (bx0 - ax0) / len, uz = (bz0 - az0) / len, mx = (ax0 + bx0) / 2, mz = (az0 + bz0) / 2;
      const sg = onSlab(s, mx - uz * 0.05, mz + ux * 0.05) ? -1 : 1, nx = -uz * sg, nz = ux * sg;   // hacia afuera de la losa
      const X = [ax0 + nx * 0.004, ax0 + nx * 0.029, bx0 + nx * 0.004, bx0 + nx * 0.029], Z = [az0 + nz * 0.004, az0 + nz * 0.029, bz0 + nz * 0.004, bz0 + nz * 0.029];
      const wkF = W.cim[0] + W.cim[1] * S(mz) + 0.25;
      box(acc.timber, Math.min(...X), y - 0.02, Math.min(...Z), Math.max(...X), y + 0.27, Math.max(...Z), wkF, pw(mx, y, mz) + 0.6);
    }

    // ---- instalación eléctrica: una caja octagonal por salida de luz, clavada al triplay en el cruce de nervaduras más cercano, y poliducto
    // naranja de 3/4" por dentro de las nervaduras (a media altura, entre los estribos): de caja a caja hasta el tablero, y de cada caja al muro
    // más cercano, donde baja a su apagador
    if (!phone) {
      const galv = acc.galv || (acc.galv = newAcc());
      const snap = (v, v0) => v0 + Math.round((v - v0) / mod) * mod, yc = y + 0.125, rc = 0.011;
      const node = ([px, pz]) => [snap(px - PLX, xmin), snap(pz - PLZ, zmin)];
      const okPt = (x, z) => onSlab(s, x, z) && onSlab(s, x + 0.1, z + 0.1) && onSlab(s, x - 0.1, z - 0.1);
      const okSeg = (a, b) => { const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25)); for (let i = 0; i <= n; i++) if (!onSlab(s, a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n)) return false; return true; };
      const wD = (x, yy, z) => W.var[0] + W.var[1] * S(z) + 0.2;   // después de los estribos, antes de la malla
      const oD = (x, yy, z) => outP(x, y, z);
      const seg = (a, b) => {
        if (Math.abs(a[0] - b[0]) > 1e-4) rod(acc.cap, 0, Math.min(a[0], b[0]), Math.max(a[0], b[0]), yc, a[1], rc, wD, oD, 5);
        if (Math.abs(a[1] - b[1]) > 1e-4) rod(acc.cap, 2, Math.min(a[1], b[1]), Math.max(a[1], b[1]), a[0], yc, rc, wD, oD, 5);
      };
      const root = node(TABLERO), boxes = [];
      for (const p of LUCES[L] || []) { const n = node(p); if (okPt(n[0], n[1]) && !boxes.some((o) => o[0] === n[0] && o[1] === n[1])) boxes.push(n); }
      for (const [bx, bz] of boxes) {
        const wk = wCas(bx, bz) - 0.05, o = outP(bx, y, bz);
        box(galv, bx - 0.05, y + 0.004, bz - 0.05, bx + 0.05, y + 0.042, bz + 0.05, wk, o, { skip: 8 });
        rod(acc.cap, 1, y + 0.042, yc, bx, bz, rc, wD, oD, 5);
        // al apagador: por la nervadura hasta el muro de abajo más cercano (a lo más 4 m), y ahí baja
        let best = null;
        for (const b of bands) {
          if (b.lvl !== L - 1 || Math.abs(b.yt - y) > 0.12) continue;
          const along = b.ax === 0 ? bx : bz, across = b.ax === 0 ? bz : bx, d = Math.abs(b.c - across);
          if (along < b.lo || along > b.hi || d < 0.3 || d > 4) continue;
          const end = b.ax === 0 ? [bx, b.c] : [b.c, bz];
          if ((!best || d < best.d) && okSeg([bx, bz], end)) best = { d, end };
        }
        if (best) { seg([bx, bz], best.end); rod(acc.cap, 1, y + 0.02, yc, best.end[0], best.end[1], rc, wD, oD, 5); }
      }
      // de caja a caja: se conecta siempre la caja suelta más cercana a lo ya conectado, por una escuadra que no salga de la losa
      const done = [root], left = [...boxes];
      rod(acc.cap, 1, y + 0.02, yc, root[0], root[1], rc, wD, oD, 5);
      while (left.length) {
        let pick = null;
        for (let i = 0; i < left.length; i++) for (const d of done) {
          const dist = Math.abs(left[i][0] - d[0]) + Math.abs(left[i][1] - d[1]);
          if (pick && dist >= pick.dist) continue;
          const c1 = [left[i][0], d[1]], c2 = [d[0], left[i][1]];
          const via = okSeg(d, c1) && okSeg(c1, left[i]) ? c1 : okSeg(d, c2) && okSeg(c2, left[i]) ? c2 : null;
          if (via) pick = { i, d, via, dist };
        }
        if (!pick) break;
        const b = left.splice(pick.i, 1)[0];
        seg(pick.d, pick.via); seg(pick.via, b); done.push(b);
      }
    }
  }
  // columna: el armex y el colado de una columna se dibujan como un castillo (emitCastle)

  const plan = {
    acc, bands, castles, counts, sorted, castWk,
    bandWeek(wid, b) {
      const cy = (b[1] + b[4]) / 2;
      const bd = bands.find((q) => q.wid === wid && cy >= q.yb0 - 1e-6 && cy <= q.yt + 1e-6) || bands.find((q) => q.wid === wid);
      if (!bd) return () => 0;
      if (bd.conc) return (x, y, z) => bd.Wp + 0.15 * clamp((y - bd.yb) / Math.max(0.01, bd.yt - bd.yb), 0, 1);
      const top = bd.yt - bd.dalaH;
      return (x, y, z) => (y > top - 1e-6 ? bd.We + 0.08 : bd.Ws + bd.D * clamp((y - bd.yb) / Math.max(0.01, top - bd.yb), 0, 1));
    },
    emitLevel(lvl) {
      for (const b of bands) if (b.lvl === lvl) { if (b.conc) emitConcWall(b); else emitBand(b); }
      for (const c of castles) if (c.lvl === lvl) emitCastle(c);
    },
    emitSlabs() {
      for (const t of trabes) emitBeam(t);
      for (const s of slabs) if (s.lvl >= 1 && s.lvl <= 3 && s.k === 'slab') emitSlab(s);
      for (const k of sorted) k.sort((p, q) => p - q);
    },
    blocksAt(week) {
      const n = (arr) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= week) lo = m + 1; else hi = m; } return lo; };
      return { pb: [n(sorted[0]), sorted[0].length], pa: [n(sorted[1]), sorted[1].length], t: [n(sorted[2]), sorted[2].length] };
    },
    castAt(week) { let lo = 0, hi = castWk.length; while (lo < hi) { const m = (lo + hi) >> 1; if (castWk[m] <= week) lo = m + 1; else hi = m; } return [lo, castWk.length]; },
    // castillos de un nivel (para las anclas de la cimentación): { x, z, Wr }
    castPoints(lvl) { return castles.filter((c) => c.lvl === lvl).map((c) => ({ x: c.x, z: c.z, Wr: c.Wr })); },
    // cajas que los puntales deben esquivar
    solids() {
      const out = [];
      for (const c of castles) out.push({ b: [c.x0, c.yb, c.z0, c.x1, c.top, c.z1], k: 'castillo' });
      for (const b of bands) if (b.conc) out.push({ b: b.ax === 0 ? [b.elo, b.yb, b.c - b.bw / 2, b.ehi, b.yt, b.c + b.bw / 2] : [b.c - b.bw / 2, b.yb, b.elo, b.c + b.bw / 2, b.yt, b.ehi], k: 'muroConc' });
      for (const t of trabes) if (t.kind === 'T') out.push({ b: t.ax === 0 ? [t.u0, t.y0, t.c - t.w / 2, t.u1, t.y1, t.c + t.w / 2] : [t.c - t.w / 2, t.y0, t.u0, t.c + t.w / 2, t.y1, t.u1], k: 'trabe' });
      return out;
    },
    stats() {
      const tri = {};
      for (const k in acc) tri[k] = acc[k].pos.length / 9;
      return { counts: [...counts], castles: castles.length, tri };
    },
  };
  return plan;
}
