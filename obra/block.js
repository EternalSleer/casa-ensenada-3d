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
  const samples = o.samples || [];
  const rnd = mkRnd(7);
  const acc = { cmu: newAcc(true), cmuA: newAcc(true), conc: newAcc(), rebar: newAcc(), timber: newAcc(), ply: newAcc(), eps: newAcc(), cap: newAcc() };
  const stirSp = phone ? 0.50 : 0.25;
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
      for (const h of b.holes) cands.push(h.u0 - 0.08, h.u1 + 0.08);
      for (const u of cands) if (u - b.lo > 0.2 && b.hi - u > 0.2) { const [x, z] = XZ(b, u, b.c); add(x, z, 1); }
    }
    for (const b of bs) {
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
      const thr = bs.filter((b) => through(b, n.x, n.z));
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
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) rod(R, 1, ya, c.top + 0.05, cx + sx * rx, cz + sz * rz, 0.0048, c.Wr, c.aparente ? c.Wk + 0.5 : out);
    const nst = Math.max(1, Math.floor((c.top - c.yb - 0.15) / stirSp) + 1);
    for (let i = 0; i < nst; i++) {
      const y = c.yb + 0.10 + i * stirSp;
      if (y > c.top - 0.03) break;
      ring(R, cx, cz, hx - 0.022, hz - 0.022, y, y + 0.006, 0.006, c.Wr, c.aparente ? c.Wk + 0.5 : out);
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
    else box(C, c.x0 + ins, c.yb, c.z0 + ins, c.x1 - ins, c.top, c.z1 - ins, wkc, out, { skip: 8 });
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
    const mkb = (a0, a1, y0, y1, c0, c1, wk, out, o) => (b.ax === 0 ? box(A, a0, y0, c0, a1, y1, c1, wk, out, o) : box(A, c0, y0, a0, c1, y1, a1, wk, out, o));
    for (let i = 0; i < b.n; i++) {
      const y0 = b.yb + i * b.hc, y1 = y0 + b.hc;
      let spans = [[b.lo, b.hi]];
      for (const h of b.holes) if (y1 > h.ySill + E && y0 < h.yHead - E) spans = subIv(spans, h.u0, h.u1);
      for (let k = 0; k < b.castles.length; k++) {
        const c = b.castles[k];
        if (y1 > c.yb + E && y0 < c.top - E) spans = subIv(spans, ents[k][0], ents[k][1]);
      }
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
          bxu(b.out === 'aparente' ? acc.cmuA : acc.conc, a0, a1, yd0, b.yt, b.c - hw, b.c + hw, Wkd, b.out === 'aparente' ? 0 : outD(b.ax === 0 ? um : b.c, b.yt, b.ax === 0 ? b.c : um), flatO(b));
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
    if (band) bxu(acc.conc, tr.u0, tr.u1, tr.y0, tr.y1, tr.c - hw + 0.002, tr.c + hw - 0.002, (x, y, z) => pw(x, y, z), (x, y, z) => finPl(lvl0 === 0 ? 0 : 1)(x, y, z) + 0.02);
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
  function emitSlab(s) {
    const L = s.lvl, W = SLABW[L], pw = s.weeks, S = (z) => sOf(z);
    const y = s.y, XS = s.outer.map((q) => q[0]), ZS = s.outer.map((q) => q[1]);
    const xmin = Math.min(...XS), xmax = Math.max(...XS), zmin = Math.min(...ZS), zmax = Math.max(...ZS);
    const outP = (x, yy, z) => pw(x, yy, z) + 0.02;
    // huellas de muros de block de abajo y arriba, y trabes del nivel
    const walls = bands.filter((b) => b.lvl === L - 1 || b.lvl === L).map((b) => (b.ax === 0 ? [b.lo, b.c - b.bw / 2, b.hi, b.c + b.bw / 2] : [b.c - b.bw / 2, b.lo, b.c + b.bw / 2, b.hi]));
    const bms = trabes.filter((t) => t.lvl === L || (t.kind === 'T' && L === 1)).map((t) => (t.ax === 0 ? [t.u0, t.c - t.w / 2, t.u1, t.c + t.w / 2] : [t.c - t.w / 2, t.u0, t.c + t.w / 2, t.u1]));
    const hitR = (r, list, pad) => list.some((q) => r[0] < q[2] + pad && r[2] > q[0] - pad && r[1] < q[3] + pad && r[3] > q[1] - pad);
    const mod = 0.75, cs = 0.60;
    const gx0 = xmin + 0.375, gz0 = zmin + 0.375;
    const ok = (x, z, h) => {
      for (const [dx, dz] of [[0, 0], [-h, -h], [h, -h], [h, h], [-h, h], [-h, 0], [h, 0], [0, -h], [0, h]]) if (!onSlab(s, x + dx, z + dz)) return false;
      return true;
    };
    for (let x = gx0; x < xmax; x += mod) for (let z = gz0; z < zmax; z += mod) {
      if (!ok(x, z, cs / 2 + 0.30)) continue;
      const r = [x - cs / 2, z - cs / 2, x + cs / 2, z + cs / 2];
      if (hitR(r, walls, 0.15) || hitR(r, bms, 0.20)) continue;
      const wk = W.cas[0] + W.cas[1] * S(z);
      box(acc.eps, r[0], y + 0.005, r[1], r[2], y + 0.20, r[3], wk, (xx, yy, zz) => outP(x, y, z), { skip: 8 });
    }
    // nervaduras: en el eje entre casetones, 2 varillas abajo y 2 arriba, recortadas a la losa
    const rr = 0.04, rad = 0.0048;
    const ribs = (ax) => {
      const g0 = (ax === 0 ? gz0 : gx0) + mod / 2, g1 = ax === 0 ? zmax : xmax;
      for (let c = g0; c < g1; c += mod) {
        for (const [a, b] of slabSpans(s, ax, c)) {
          if (b - a < 0.2) continue;
          const wk = W.var[0] + W.var[1] * S(ax === 0 ? c : (a + b) / 2), out = outP(ax === 0 ? (a + b) / 2 : c, y, ax === 0 ? c : (a + b) / 2);
          for (const dq of [-rr, rr]) for (const yy of [y + 0.035, y + 0.215]) {
            if (ax === 0) rod(acc.rebar, 0, a + 0.05, b - 0.05, yy, c + dq, rad, wk, out); else rod(acc.rebar, 2, a + 0.05, b - 0.05, c + dq, yy, rad, wk, out);
          }
        }
      }
    };
    ribs(0); ribs(1);
    // malla electrosoldada 6x6-10/10: varillas de 4 mm cada 0.15 (0.30 en celular), a 23 cm de la cara de abajo
    const ms = phone ? 0.30 : 0.15;
    for (const ax of [0, 1]) {
      for (let c = (ax === 0 ? zmin : xmin) + ms / 2; c < (ax === 0 ? zmax : xmax); c += ms) {
        for (const [a, b] of slabSpans(s, ax, c)) {
          const wk = W.mal[0] + W.mal[1] * S(ax === 0 ? c : (a + b) / 2), mid = (a + b) / 2;
          const out = outP(ax === 0 ? mid : c, y, ax === 0 ? c : mid);
          if (ax === 0) box(acc.rebar, a, y + 0.228, c - 0.002, b, y + 0.232, c + 0.002, wk, out, { skip: 8 | 3 }); else box(acc.rebar, c - 0.002, y + 0.228, a, c + 0.002, y + 0.232, b, wk, out, { skip: 8 | 3 });
        }
      }
    }
    // poliducto naranja: unas curvas entre la malla y las nervaduras
    if (!phone) {
      const r2 = mkRnd(100 + L);
      for (let i = 0; i < 7; i++) {
        const x = xmin + (0.15 + 0.7 * r2()) * (xmax - xmin), z0 = zmin + (0.1 + 0.4 * r2()) * (zmax - zmin), z1 = z0 + 1.5 + 2 * r2();
        if (!onSlab(s, x, z0 + 0.3) || !onSlab(s, x, z1 - 0.3)) continue;
        const kx = (r2() - 0.5) * 1.2, n = 8;
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n, xa = x + kx * Math.sin(t0 * Math.PI), xb = x + kx * Math.sin(t1 * Math.PI);
          const za = z0 + (z1 - z0) * t0, zb = z0 + (z1 - z0) * t1;
          if (!onSlab(s, xa, za) || !onSlab(s, xb, zb)) continue;
          const wkp = W.mal[0] + W.mal[1] * S(za) + 0.02, yp = y + 0.2125, op = outP((xa + xb) / 2, y, (za + zb) / 2);   // tubo de 24 mm entre la malla y las varillas de arriba
          rod(acc.cap, 2, za, zb, xa, yp, 0.012, wkp, op);
          if (Math.abs(xb - xa) > 1e-4) rod(acc.cap, 0, xa, xb, yp, zb, 0.012, wkp, op);
        }
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
      const top = bd.yt - bd.dalaH;
      return (x, y, z) => (y > top - 1e-6 ? bd.We + 0.08 : bd.Ws + bd.D * clamp((y - bd.yb) / Math.max(0.01, top - bd.yb), 0, 1));
    },
    emitLevel(lvl) {
      for (const b of bands) if (b.lvl === lvl) emitBand(b);
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
