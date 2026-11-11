// Basado en flat-to-3d/04-build-time-lapse de Sam Aing (MIT), ver LICENSE-flat-to-3d.txt.
// El mundo: una casa como lista de partes, cada una con la semana en que se construye, sobre un terreno plano que se excava,
// se rellena y se planta con el mismo calendario. Todo lo que se dibuja (la hoja) y todo lo que se renderiza (la obra)
// lee las semanas de aquí. Una parte aparece cuando llega su semana: un solo uniforme, uNow, construye la casa.
// Las partes de la casa salen de casa.js (el bloque de arquitectura copiado de index.html); aquí solo se les pone semana.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { casaParts, CIS, CX, CZ, cimRuns, Fhat, runW, rectOf, ovl, subtractIv, WALLS, TRABES, COLS, LV, MUROS_CONC } from './casa.js';
import { planObra, pbox } from './block.js';

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- el programa
export const { WEEKS, PROG, TILES } = window.SEQ;
// fases de las 6 láminas (coherentes con TILES de programme.js)
export const PHASE = Object.fromEntries(TILES.map((t, i) => [i + 1, [t.w0, t.w1]]));

// ---------------------------------------------------------------- random, noise
let seed = 11;
export const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function vnoise(size, cells) {
  const L = new Float32Array(cells * cells); for (let i = 0; i < L.length; i++) L[i] = rnd();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = y / size * cells, iy = Math.floor(fy); let ty = fy - iy; ty = ty * ty * (3 - 2 * ty);
    const y0 = (iy % cells) * cells, y1 = ((iy + 1) % cells) * cells;
    for (let x = 0; x < size; x++) {
      const fx = x / size * cells, ix = Math.floor(fx); let tx = fx - ix; tx = tx * tx * (3 - 2 * tx);
      const x0 = ix % cells, x1 = (ix + 1) % cells;
      const a = L[y0 + x0] + (L[y0 + x1] - L[y0 + x0]) * tx, b = L[y1 + x0] + (L[y1 + x1] - L[y1 + x0]) * tx;
      out[y * size + x] = a + (b - a) * ty;
    }
  }
  return out;
}
function fbm(size, cells, oct, gain = 0.5) {
  const out = new Float32Array(size * size); let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) { const n = vnoise(size, cells << o); for (let i = 0; i < out.length; i++) out[i] += n[i] * amp; tot += amp; amp *= gain; }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z); let fx = x - ix, fz = z - iz; fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

// ---------------------------------------------------------------- textures & bump maps
let MAX_ANISO = 8;
function canvasTex(size, tile, draw, linear = false) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true }); draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / tile, 1 / tile);
  t.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  return t;
}
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function ramp(g, s, field, c0, c1, c2, grain = 10) {
  const img = g.createImageData(s, s), d = img.data;
  for (let i = 0; i < s * s; i++) {
    const v = field(i);
    const c = v < 0.5 ? mixc(c0, c1, v * 2) : mixc(c1, c2, (v - 0.5) * 2);
    const k = (rnd() - 0.5) * grain;
    d[i * 4] = c[0] + k; d[i * 4 + 1] = c[1] + k; d[i * 4 + 2] = c[2] + k; d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}
function stones(g, s, n, r0, r1, cols, shadow = 0.35) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * s, y = rnd() * s, r = r0 + Math.pow(rnd(), 2.5) * (r1 - r0), a = rnd() * Math.PI, e = 0.55 + rnd() * 0.4;
    const col = cols[Math.floor(rnd() * cols.length)];
    for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) {
      const X = x + dx, Y = y + dy; if (X < -r1 * 2 || X > s + r1 * 2 || Y < -r1 * 2 || Y > s + r1 * 2) continue;
      g.fillStyle = `rgba(30,22,15,${shadow})`; g.beginPath(); g.ellipse(X + r * 0.25, Y + r * 0.35, r, r * e, a, 0, 7); g.fill();
      g.fillStyle = col; g.beginPath(); g.ellipse(X, Y, r, r * e, a, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,250,240,0.18)'; g.beginPath(); g.ellipse(X - r * 0.25, Y - r * 0.3, r * 0.5, r * 0.5 * e, a, 0, 7); g.fill();
    }
  }
}

export async function makeTextures(renderer, phone, step) {
  MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
  const S = phone ? 512 : 1024;
  const T = {};
  // site earth, compacted with aggregate and subtle track grooves
  T.soil = canvasTex(S, 3.0, (g, s) => {
    const a = fbm(s, 4, 5), b = fbm(s, 24, 3), c = fbm(s, 96, 2);
    ramp(g, s, (i) => clamp(0.5 + (a[i] - 0.5) * 1.5 + (b[i] - 0.5) * 0.75 + (c[i] - 0.5) * 0.55, 0, 1), [92, 78, 62], [134, 117, 96], [166, 149, 126], 15);
    stones(g, s, s * 2.6, s / 900, s / 170, ['#9d9384', '#b5ab9b', '#7f766a', '#c7bca8', '#685e52']);
  });
  T.soilBump = canvasTex(512, 3.0, (g, s) => {
    const a = fbm(s, 8, 4), b = fbm(s, 48, 3);
    ramp(g, s, (i) => clamp(0.5 + (a[i] - 0.5) * 1.4 + (b[i] - 0.5) * 0.9, 0, 1), [40, 40, 40], [128, 128, 128], [220, 220, 220], 24);
  }, true);
  if (step) await step(0.14);
  // cut subsoil clay: stratified warm earth
  T.clay = canvasTex(S, 2.8, (g, s) => {
    const a = fbm(s, 3, 5), b = fbm(s, 20, 3), c = fbm(s, 80, 2);
    ramp(g, s, (i) => {
      const y = Math.floor(i / s) / s;
      const strata = Math.sin(y * Math.PI * 16 + a[i] * 4) * 0.08;
      return clamp(0.5 + (a[i] - 0.5) * 1.3 + (b[i] - 0.5) * 0.85 + (c[i] - 0.5) * 0.5 + strata, 0, 1);
    }, [116, 88, 60], [156, 121, 84], [188, 154, 114], 12);
    stones(g, s, s * 1.1, s / 700, s / 130, ['#a8957c', '#8d7a63', '#c2ad8e'], 0.4);
  });
  // Mediterranean slope grass
  T.grass = canvasTex(S, 3.8, (g, s) => {
    const a = fbm(s, 4, 4), b = fbm(s, 28, 3);
    ramp(g, s, (i) => clamp(0.5 + (a[i] - 0.5) * 1.35 + (b[i] - 0.5) * 0.75, 0, 1), [128, 128, 84], [166, 156, 106], [204, 190, 138], 8);
    const n = s * s / 60;
    for (let i = 0; i < n; i++) {
      const x = rnd() * s, y = rnd() * s, l = s / 320 + rnd() * s / 130, ang = -Math.PI / 2 + (rnd() - 0.5) * 1.1;
      g.strokeStyle = rnd() < 0.55 ? `rgba(55,68,34,${0.25 + rnd() * 0.3})` : `rgba(198,188,136,${0.2 + rnd() * 0.28})`;
      g.lineWidth = 0.6 + rnd() * 0.9; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l); g.stroke();
    }
  });
  if (step) await step(0.29);
  // fair-faced architectural concrete, cast against 150 mm boards, tie holes on 600 mm grid + bump map
  T.conc = canvasTex(S, 2.4, (g, s) => {
    const a = fbm(s, 4, 4), b = fbm(s, 48, 2);
    ramp(g, s, (i) => clamp(0.5 + (a[i] - 0.5) * 0.65 + (b[i] - 0.5) * 0.4, 0, 1), [172, 169, 162], [189, 186, 179], [204, 201, 194], 8);
    const rows = 16, h = s / rows;
    for (let r = 0; r < rows; r++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '70,66,60' : '240,236,228'},${0.025 + rnd() * 0.045})`; g.fillRect(0, r * h, s, h);
      g.fillStyle = 'rgba(55,52,46,0.20)'; g.fillRect(0, r * h, s, 1.3);
      g.fillStyle = 'rgba(245,242,235,0.14)'; g.fillRect(0, r * h + 1.3, s, 1.0);
      for (let k = 0; k < 7; k++) { g.fillStyle = `rgba(60,56,50,${0.025 + rnd() * 0.035})`; g.fillRect(0, r * h + rnd() * h, s, 1); }
    }
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const cx = (i + 0.5) * s / 4, cy = (j + 0.5) * s / 4;
      g.fillStyle = 'rgba(130,126,118,0.45)'; g.beginPath(); g.arc(cx, cy, s / 150, 0, 7); g.fill();
      g.fillStyle = 'rgba(42,39,35,0.65)'; g.beginPath(); g.arc(cx, cy, s / 240, 0, 7); g.fill();
    }
  });
  T.concBump = canvasTex(512, 2.4, (g, s) => {
    const a = fbm(s, 6, 3);
    ramp(g, s, (i) => clamp(0.5 + (a[i] - 0.5) * 0.5, 0, 1), [110, 110, 110], [135, 135, 135], [160, 160, 160], 10);
    const rows = 16, h = s / rows;
    for (let r = 0; r < rows; r++) {
      g.fillStyle = '#404040'; g.fillRect(0, r * h, s, 1.5);
      g.fillStyle = '#b0b0b0'; g.fillRect(0, r * h + 1.5, s, 1.2);
      for (let k = 0; k < 5; k++) { g.fillStyle = 'rgba(80,80,80,0.35)'; g.fillRect(0, r * h + rnd() * h, s, 1); }
    }
    g.fillStyle = '#181818';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.arc((i + 0.5) * s / 4, (j + 0.5) * s / 4, s / 200, 0, 7); g.fill(); }
  }, true);

  if (step) await step(0.43);
  // European wide-plank oak flooring: even warm honey tone, natural grain + bump map
  T.oak = canvasTex(S, 3.2, (g, s) => {
    const rows = 14, h = s / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * s * 0.4;
      while (x < s) {
        const L = s * (0.45 + rnd() * 0.45), v = (rnd() - 0.5) * 2;
        g.fillStyle = `hsl(${31 + v * 1.8}, ${34 + v * 3}%, ${59 + v * 3.2}%)`;
        g.fillRect(x, r * h, L, h);
        for (let k = 0; k < 14; k++) {
          const gy = r * h + (k + 0.5) / 14 * h;
          g.fillStyle = `rgba(95, 60, 28, ${0.03 + rnd() * 0.045})`;
          g.fillRect(x, gy, L, 1 + rnd() * 1.2);
        }
        g.fillStyle = 'rgba(65, 42, 20, 0.32)'; g.fillRect(x, r * h, 1.2, h);
        x += L;
      }
      g.fillStyle = 'rgba(65, 42, 20, 0.28)'; g.fillRect(0, r * h, s, 1.2);
      g.fillStyle = 'rgba(235, 210, 175, 0.12)'; g.fillRect(0, r * h + 1.2, s, 1.0);
    }
  });
  T.oakBump = canvasTex(512, 3.2, (g, s) => {
    g.fillStyle = '#888'; g.fillRect(0, 0, s, s);
    const rows = 14, h = s / rows;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < 12; k++) { g.fillStyle = 'rgba(60,60,60,0.35)'; g.fillRect(0, r * h + rnd() * h, s, 1); }
      g.fillStyle = '#222'; g.fillRect(0, r * h, s, 1.5);
    }
  }, true);

  if (step) await step(0.5);
  // Honed Roman travertine stone
  T.travertine = canvasTex(512, 1.8, (g, s) => {
    const a = fbm(s, 6, 4), b = fbm(s, 32, 2);
    ramp(g, s, (i) => {
      const y = Math.floor(i / s) / s;
      const vein = Math.sin(y * Math.PI * 18 + a[i] * 5.5) * 0.14;
      return clamp(0.5 + (a[i] - 0.5) * 0.65 + (b[i] - 0.5) * 0.35 + vein, 0, 1);
    }, [198, 184, 162], [218, 206, 186], [234, 225, 208], 7);
    for (let i = 0; i < 180; i++) {
      g.fillStyle = `rgba(130, 114, 92, ${0.12 + rnd() * 0.18})`;
      g.fillRect(rnd() * s, rnd() * s, 3 + rnd() * 14, 1 + rnd() * 2);
    }
  });
  if (step) await step(0.57);
  // Architectural walnut veneer
  T.walnut = canvasTex(512, 1.6, (g, s) => {
    const a = fbm(s, 4, 3);
    ramp(g, s, (i) => clamp(0.5 + (a[i] - 0.5) * 0.7, 0, 1), [72, 46, 29], [92, 61, 39], [112, 76, 50], 6);
    for (let i = 0; i < 140; i++) {
      g.fillStyle = `rgba(42, 24, 12, ${0.08 + rnd() * 0.12})`;
      g.fillRect(0, rnd() * s, s, 1 + rnd() * 2);
    }
  });
  // Woven bouclé / architectural linen textile
  T.linen = canvasTex(256, 0.45, (g, s) => {
    const a = fbm(s, 8, 2);
    ramp(g, s, (i) => clamp(0.5 + (a[i] - 0.5) * 0.35, 0, 1), [212, 203, 188], [224, 216, 202], [235, 228, 216], 12);
    for (let y = 0; y < s; y += 3) { g.fillStyle = 'rgba(120,108,92,0.08)'; g.fillRect(0, y, s, 1); }
    for (let x = 0; x < s; x += 3) { g.fillStyle = 'rgba(255,250,242,0.08)'; g.fillRect(x, 0, 1, s); }
  });
  T.linenBump = canvasTex(256, 0.45, (g, s) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 2) { g.fillStyle = y % 4 === 0 ? '#a8a8a8' : '#585858'; g.fillRect(0, y, s, 1); }
    for (let x = 0; x < s; x += 2) { g.fillStyle = x % 4 === 0 ? 'rgba(210,210,210,0.5)' : 'rgba(40,40,40,0.5)'; g.fillRect(x, 0, 1, s); }
  }, true);

  T.pave = canvasTex(512, 2.4, (g, s) => {
    const a = fbm(s, 6, 3);
    ramp(g, s, (i) => clamp(0.5 + (a[i] - 0.5) * 0.85, 0, 1), [196, 186, 168], [214, 205, 189], [228, 221, 207], 8);
    g.fillStyle = 'rgba(85,74,58,0.38)';
    for (let r = 0; r < 4; r++) g.fillRect(0, r * s / 4, s, 1.5);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) g.fillRect(c * s / 2 + (r % 2) * s / 4, r * s / 4, 1.5, s / 4);
  });
  if (step) await step(0.71);
  // Large architectural canvas painting
  T.canvas = (() => {
    const c = document.createElement('canvas'); c.width = 520; c.height = 700; const g = c.getContext('2d');
    g.fillStyle = '#ede6d8'; g.fillRect(0, 0, 520, 700);
    g.fillStyle = '#c85a28'; g.fillRect(56, 310, 408, 330);
    g.fillStyle = '#d9a152'; g.beginPath(); g.arc(300, 245, 148, 0, 7); g.fill();
    g.fillStyle = '#ede6d8'; g.beginPath(); g.arc(170, 310, 62, 0, Math.PI); g.fill();
    g.fillStyle = '#23211e'; g.fillRect(396, 68, 20, 572);
    g.strokeStyle = '#23211e'; g.lineWidth = 3; g.strokeRect(56, 68, 408, 572);
    g.globalAlpha = 0.14; for (let i = 0; i < 3000; i++) { g.fillStyle = rnd() < 0.5 ? '#000' : '#fff'; g.fillRect(rnd() * 520, rnd() * 700, 1, 1); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = MAX_ANISO; return t;
  })();
  T.rug = canvasTex(512, 1.1, (g, s) => {
    const a = fbm(s, 8, 3);
    ramp(g, s, (i) => clamp(0.5 + (a[i] - 0.5) * 0.5, 0, 1), [196, 184, 164], [210, 199, 180], [222, 213, 196], 18);
    for (let y = 0; y < s; y += 3) { g.fillStyle = 'rgba(78,64,46,0.07)'; g.fillRect(0, y, s, 1.5); }
  });
  T.concFresh = canvasTex(512, 2.4, (g, s) => {
    const a = fbm(s, 4, 4), b = fbm(s, 40, 2);
    ramp(g, s, (i) => clamp(0.5 + (a[i] - 0.5) * 0.75 + (b[i] - 0.5) * 0.45, 0, 1), [176, 172, 164], [194, 190, 182], [208, 205, 198], 10);
    for (let y = 0; y < s; y += s / 8) { g.fillStyle = 'rgba(60,55,50,0.08)'; g.fillRect(0, y, s, 1); }
  });
  if (step) await step(0.86);
  // block de concreto común gris 15 × 20 × 40: la mitad izquierda es la cara (junta de mortero a la izquierda y abajo), la derecha la cara superior con sus dos celdas huecas
  const cmu = (bump) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d', { willReadFrequently: true });
    const a = fbm(256, 4, 4), b = fbm(256, 40, 2);
    const img = g.createImageData(512, 256), d = img.data;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 512; x++) {
      const i = y * 512 + x, j = y * 256 + (x & 255), v = clamp(0.5 + (a[j] - 0.5) * 0.9 + (b[j] - 0.5) * 0.7, 0, 1), k = (rnd() - 0.5) * (bump ? 26 : 16);
      const base = bump ? 140 + (v - 0.5) * 36 : 138 + v * 26;
      d[i * 4] = base + k; d[i * 4 + 1] = base + k - (bump ? 0 : 1.5); d[i * 4 + 2] = base + k - (bump ? 0 : 5); d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // poros
    for (let i = 0; i < 260; i++) { g.fillStyle = bump ? `rgba(40,40,40,${0.3 + rnd() * 0.4})` : `rgba(70,68,64,${0.18 + rnd() * 0.3})`; g.beginPath(); g.arc(rnd() * 512, rnd() * 256, 0.6 + rnd() * 1.6, 0, 7); g.fill(); }
    const mort = bump ? '#3c3c3c' : '#767269', rim = bump ? '#222' : '#5a564f', hi = bump ? '#9a9a9a' : '#a8a499';
    // cara: junta izquierda y abajo
    g.fillStyle = mort; g.fillRect(0, 0, 6, 256); g.fillRect(0, 250, 256, 6);
    g.fillStyle = rim; g.fillRect(6, 0, 2, 250); g.fillRect(6, 248, 250, 2);
    g.fillStyle = hi; g.fillRect(0, 0, 256, 2);
    // cara superior: anillo de mortero y dos celdas huecas
    g.fillStyle = mort; g.fillRect(256, 0, 256, 6); g.fillRect(256, 250, 256, 6); g.fillRect(256, 0, 6, 256); g.fillRect(506, 0, 6, 256);
    g.fillStyle = bump ? '#101010' : '#2a2a2a';
    for (const cx of [334, 434]) { g.beginPath(); g.roundRect(cx - 32, 62, 64, 132, 10); g.fill(); }
    g.fillStyle = bump ? '#282828' : '#4a4843';
    for (const cx of [334, 434]) { g.beginPath(); g.roundRect(cx - 32, 62, 64, 14, 6); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = MAX_ANISO; t.colorSpace = bump ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    return t;
  };
  // el block usa el generador global: se guarda y se restaura la semilla para que lo que viene después (árboles, pasto) salga igual que sin él
  { const sd = seed; T.cmu = cmu(false); T.cmuBump = cmu(true); seed = sd; }
  // Fine high-density safety debris mesh (no giant LEGO holes)
  T.net = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#df5618'; g.fillRect(0, 0, 128, 128);
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
    for (let y = 10; y < 120; y += 8) {
      for (let x = (y % 16 === 10 ? 4 : 8); x < 128; x += 8) {
        g.beginPath(); g.rect(x - 2.2, y - 2.2, 4.4, 4.4); g.fill();
      }
    }
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#c8460e'; g.fillRect(0, 0, 128, 8); g.fillRect(0, 120, 128, 8);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = MAX_ANISO; return t;
  })();
  return T;
}

// ---------------------------------------------------------------- el terreno es plano
export const natural = () => 0;

// ---------------------------------------------------------------- drawing materials (the sheet)
export const PAPER = new THREE.Color('#efebe2');
export const INK = new THREE.Color('#1d1d1f');
export const ACCENT = new THREE.Color('#f0500f');
export const U = {
  uNow: { value: 99 }, uNewFrom: { value: 99 }, uTintOn: { value: 1 },
  uBlock: { value: new THREE.Vector4(-9.25, -12.97, 9.25, 12.97) },   // el lote más 3 m por lado
  uPaper: { value: new THREE.Vector3(0xef / 255, 0xeb / 255, 0xe2 / 255) },
  uInk: { value: new THREE.Vector3(0x1d / 255, 0x1d / 255, 0x1f / 255) },
  uTint: { value: new THREE.Vector3(0xf3 / 255, 0xd5 / 255, 0xc4 / 255) },
  real: { value: 6 },
};
const DRAW_VS = `
  attribute float aWeek; attribute float aOut;
  varying float vWeek; varying float vOut; varying vec3 vW; varying vec3 vV;
  void main(){
    vec4 wp = modelMatrix * vec4(position, 1.); vW = wp.xyz; vWeek = aWeek; vOut = aOut;
    vec4 mv = viewMatrix * wp; vV = mv.xyz; gl_Position = projectionMatrix * mv;
  }`;
const DRAW_HEAD = `
  uniform float uNow, uNewFrom, uTintOn, uClip, uContour, uHatch, uWeight; uniform vec4 uBlock; uniform vec3 uPaper, uInk, uTint;
  varying float vWeek; varying float vOut; varying vec3 vW; varying vec3 vV;
  bool gone(){
    if (vWeek > uNow + 1e-4) return true;
    if (vOut > .5 && uNow >= vOut) return true;
    if (uClip > .5 && (vW.x < uBlock.x || vW.x > uBlock.z || vW.z < uBlock.y || vW.z > uBlock.w)) return true;
    return false;
  }`;
function drawMat(kind, o = {}) {
  const uniforms = {
    uNow: U.uNow, uNewFrom: U.uNewFrom, uBlock: U.uBlock, uPaper: U.uPaper, uInk: U.uInk, uTint: U.uTint,
    uTintOn: o.tint === false ? { value: 0 } : U.uTintOn, uClip: { value: o.clip ? 1 : 0 },
    uContour: { value: o.contour ? 1 : 0 }, uHatch: { value: o.hatch ? 1 : 0 }, uWeight: { value: o.weight ?? 1.0 },
  };
  const fs = kind === 'nd' ? `${DRAW_HEAD}
    void main(){
      if (gone()) discard;
      vec3 n = normalize(cross(dFdx(vV), dFdy(vV)));
      gl_FragColor = vec4(n.xy * .5 + .5, uWeight, 1.);
    }` : `${DRAW_HEAD}
    float lines(float f, float wid){ float w = max(fwidth(f), 1e-5); float d = abs(fract(f + .5) - .5); return 1. - smoothstep(w * (wid - .5), w * (wid + .5), d); }
    void main(){
      if (gone()) discard;
      vec3 c = uPaper;
      if (uTintOn > .5 && vWeek > uNewFrom + 1e-3) c = uTint;
      if (uContour < .5 && uHatch < .5) {
        vec3 wn = normalize(cross(dFdx(vW), dFdy(vW)));
        float shade = clamp((wn.z * 0.5 - wn.x * 0.45) * 0.032, -0.02, 0.028);
        c -= shade;
      }
      if (uContour > .5) {
        float k = lines((vW.y - .25) / .5, .9) * .28 + lines((vW.y - .25) / 2.5, 1.45) * .34;
        c = mix(c, uInk, clamp(k, 0., .62));
      }
      if (uHatch > .5) { float hf = (vW.x + vW.z) / 1.8 + vW.y / 1.2; float aa = 1. - smoothstep(.3, .6, fwidth(hf)); c = mix(c, uInk, lines(hf, .9) * .36 * aa); }
      gl_FragColor = vec4(c, clamp((vWeek + 2.) / 42., 0., 1.));
    }`;
  return new THREE.ShaderMaterial({ uniforms, vertexShader: DRAW_VS, fragmentShader: fs, side: THREE.DoubleSide });
}
export const DM = {
  paper: drawMat('paper'),
  nd: drawMat('nd', { weight: 1.0 }),
  ndFrame: drawMat('nd', { weight: 0.52 }),
  ndProp: drawMat('nd', { weight: 0.58 }),
  ndFurn: drawMat('nd', { weight: 0.34 }),
  land: drawMat('paper', { clip: true, contour: true, tint: false }),
  landNew: drawMat('paper', { clip: true, contour: true }),
  ndLand: drawMat('nd', { clip: true, weight: 0.85 }),
  hatch: drawMat('paper', { hatch: true }),
  ndHatch: drawMat('nd', { weight: 0.85 }),   // sin recorte: los costados están justo en el borde del bloque y el recorte los picaba
};

// ---------------------------------------------------------------- real materials
let ENV = null;
const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.88, metalness: 0, envMap: ENV, envMapIntensity: 0.32 }, o));
const WEEKLY = (s) => {
  s.uniforms.uNow = U.real;
  s.vertexShader = s.vertexShader.replace('void main() {', 'uniform float uNow; attribute float aWeek; attribute float aOut; varying float vWk; varying float vOt;\nvoid main() {\n  vWk = aWeek; vOt = aOut;');
  s.fragmentShader = s.fragmentShader.replace('void main() {', 'uniform float uNow; varying float vWk; varying float vOt;\nvoid main() {\n  if (vWk > uNow + 1e-4 || (vOt > .5 && uNow >= vOt)) discard;');
};
// wet: el concreto recién colado se ve oscuro y húmedo y se aclara en ~0.6 semanas
const WEEKLY_WET = (s) => {
  WEEKLY(s);
  s.fragmentShader = s.fragmentShader
    .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= mix(.68, 1., smoothstep(0., .6, uNow - vWk));')
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor *= mix(.5, 1., smoothstep(0., .6, uNow - vWk));');
};
// pour: el colado. En firme y losas la cara de arriba es una rejilla fina (topGrid); zapatas, contratrabes, castillos, columnas, dalas, trabes y muros de concreto
// son cajas pbox() de block.js. Cada vértice lleva aPour (cuánto sube) y aSpan (en cuántas semanas): nace en el fondo y sube a su nivel
// detrás de un frente irregular; mientras sube lleva lomos (el concreto recién vaciado) que se aplanan al reglarlo, y se ve oscuro y brillante.
const WEEKLY_POUR = (s) => {
  s.uniforms.uNow = U.real;
  s.vertexShader = s.vertexShader.replace('void main() {', 'uniform float uNow; attribute float aWeek; attribute float aOut; attribute float aPour; attribute float aSpan; varying float vWk; varying float vOt; varying vec2 vPP;\nvoid main() {\n  vWk = aWeek; vOt = aOut; vPP = position.xz;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
  float pk = smoothstep(0., aSpan, uNow - aWeek);
  float lump = sin(position.x * 4.3 + position.z * 2.9) * sin(position.z * 5.1 - position.x * 3.3) + .5 * sin(position.x * 9.7 - position.z * 7.9);
  transformed.y += -.98 * aPour * (1. - pk) + (.5 * aPour + .16 * lump * min(aPour, .25)) * 4. * pk * (1. - pk) * (1. - pk);   // se amontona un poco sobre su nivel y luego se regla`);
  s.fragmentShader = s.fragmentShader.replace('void main() {', `uniform float uNow; varying float vWk; varying float vOt; varying vec2 vPP;
void main() {
  float fn = sin(vPP.x * 5.3 + sin(vPP.y * 2.1) * 1.9) * sin(vPP.y * 4.7 + sin(vPP.x * 1.7) * 1.3) * .5 + .5;
  if (vWk + fn * .034 > uNow + 1e-4 || (vOt > .5 && uNow >= vOt)) discard;`)
    .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= mix(.42, 1., smoothstep(.03, .55, uNow - vWk));')
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor *= mix(.45, 1., smoothstep(.05, .45, uNow - vWk));');
};
// drop: el block. Cada pieza se asienta (baja 4 cm sobre su cama de mortero en 0.02 semanas) y se ve húmeda y más oscura un rato, así se lee por dónde va el muro
const WEEKLY_DROP = (s) => {
  WEEKLY(s);
  s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed.y += .04 * (1. - smoothstep(0., .02, uNow - aWeek));');
  s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= mix(.8, 1., smoothstep(0., .22, uNow - vWk));');
};
export function weekly(m, o = {}) {
  if (o.drop) { m.onBeforeCompile = WEEKLY_DROP; m.customProgramCacheKey = () => 'weekly-drop'; return m; }
  if (o.pour) { m.onBeforeCompile = WEEKLY_POUR; m.customProgramCacheKey = () => 'weekly-pour'; return m; } m.onBeforeCompile = o.wet ? WEEKLY_WET : WEEKLY; m.customProgramCacheKey = () => (o.wet ? 'weekly-wet' : 'weekly'); return m; }
export const DEPTH_WEEKLY = weekly(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));

export function makeMaterials(T, env) {
  ENV = env;
  const R = {
    concFresh: std({ map: T.concFresh, bumpMap: T.concBump, bumpScale: 0.012, roughness: 0.82 }),
    conc: std({ map: T.conc, bumpMap: T.concBump, bumpScale: 0.015, roughness: 0.78 }),
    concPour: std({ map: T.conc, bumpMap: T.concBump, bumpScale: 0.015, roughness: 0.78 }),
    oak: std({ map: T.oak, bumpMap: T.oakBump, bumpScale: 0.008, roughness: 0.42, envMapIntensity: 0.52 }),
    floorL: std({ map: T.travertine, roughness: 0.5 }),
    plaster: std({ color: 0xf3f0ea, roughness: 0.92 }),
    gravel: std({ color: 0x8f8a82, roughness: 0.98 }),
    pave: std({ map: T.pave, bumpMap: T.concBump, bumpScale: 0.01, roughness: 0.8 }),
    sofa: std({ map: T.linen, bumpMap: T.linenBump, bumpScale: 0.006, roughness: 0.9, envMapIntensity: 0.18 }),
    sofaDark: std({ color: 0xb7a892, bumpMap: T.linenBump, bumpScale: 0.005, roughness: 0.9 }),
    rugM: std({ map: T.rug, bumpMap: T.linenBump, bumpScale: 0.012, roughness: 0.98, envMapIntensity: 0.1 }),
    travertine: std({ map: T.travertine, bumpMap: T.concBump, bumpScale: 0.006, roughness: 0.48, envMapIntensity: 0.4 }),
    cushionA: std({ color: 0xb85228, bumpMap: T.linenBump, bumpScale: 0.005, roughness: 0.88 }),
    cushionB: std({ color: 0xcba466, bumpMap: T.linenBump, bumpScale: 0.005, roughness: 0.88 }),
    cushionC: std({ color: 0xe6dfd2, bumpMap: T.linenBump, bumpScale: 0.005, roughness: 0.92 }),
    brass: std({ color: 0xc29b61, metalness: 0.92, roughness: 0.26, envMapIntensity: 1.0 }),
    ceramic: std({ color: 0xefe9de, roughness: 0.28, envMapIntensity: 0.45 }),
    terracotta: std({ color: 0xad623e, roughness: 0.82 }),
    art: std({ map: T.canvas, roughness: 0.85, envMapIntensity: 0.12 }),
    sheer: std({ color: 0xf1ece0, roughness: 0.96, side: THREE.DoubleSide, envMapIntensity: 0.12 }),
    shade: std({ color: 0xfff5e0, emissive: 0xffc885, emissiveIntensity: 0, roughness: 0.5 }),
    soilPot: std({ color: 0x3b2f25, roughness: 1 }),
    ink: std({ color: 0x1f1e1c, roughness: 0.42, metalness: 0.2 }),
    steel: std({ color: 0x242422, metalness: 0.68, roughness: 0.38, envMapIntensity: 0.55 }),
    glass: new THREE.MeshBasicMaterial({ color: 0xcfe2e6, envMap: env, combine: THREE.MixOperation, reflectivity: 0.26, transparent: true, opacity: 0.09, depthWrite: false }),
    fabric: std({ map: T.linen, roughness: 0.9 }),
    rug: std({ color: 0xb9a88e }),
    // fachada moderna: aplanado blanco (plaster), panel gris, lambrín grafito acanalado, plafón de madera cálida y tira LED
    grayPanel: std({ color: 0xc2c1bd, roughness: 0.85 }),
    fluted: std({ color: 0x3b3d40, roughness: 0.5, metalness: 0.3, envMapIntensity: 0.5 }),
    woodSoffit: std({ map: T.oak, color: 0xc89466, roughness: 0.55 }),
    led: std({ color: 0xfff4e0, emissive: 0xffdcae, emissiveIntensity: 0, roughness: 0.4 }),
    walnut: std({ map: T.walnut, bumpMap: T.oakBump, bumpScale: 0.006, roughness: 0.48, envMapIntensity: 0.42 }),
    leather: std({ color: 0x824829, bumpMap: T.linenBump, bumpScale: 0.003, roughness: 0.46, envMapIntensity: 0.48 }),
    linen: std({ map: T.linen, bumpMap: T.linenBump, bumpScale: 0.005, roughness: 0.9 }),
    stone: std({ map: T.travertine, roughness: 0.32, envMapIntensity: 0.45 }),
    white: std({ color: 0xf4f2ee, roughness: 0.25 }),
    mirror: std({ color: 0xffffff, metalness: 1, roughness: 0.02, envMapIntensity: 1.2 }),
    teak: std({ map: T.oak, color: 0xc29a72, roughness: 0.62 }),
    book0: std({ color: 0x8e3b2a, roughness: 0.6 }),
    book1: std({ color: 0x2f4a5a, roughness: 0.6 }),
    book2: std({ color: 0xd8cfb8, roughness: 0.6 }),
    book3: std({ color: 0x5c6b4a, roughness: 0.6 }),
    book4: std({ color: 0x1f1e1c, roughness: 0.6 }),
    ply: std({ color: 0xe6bd88, bumpMap: T.oakBump, bumpScale: 0.005, roughness: 0.82 }),
    prop: std({ color: 0xdba028, roughness: 0.46, metalness: 0.35, envMapIntensity: 0.45 }),
    rebar: std({ color: 0x563826, roughness: 0.7, metalness: 0.38 }),
    cmu: std({ map: T.cmu, bumpMap: T.cmuBump, bumpScale: 0.02, roughness: 0.95, envMapIntensity: 0.2, vertexColors: true }),
    eps: std({ color: 0xf1efe9, roughness: 0.96 }),
    cap: std({ color: 0xf0500f, roughness: 0.45 }),
    // polietileno negro (barrera de vapor bajo el firme) y PVC sanitario
    poly: std({ color: 0x0d0e10, bumpMap: T.soilBump, bumpScale: 0.06, roughness: 0.4, envMapIntensity: 0.7 }),
    pvc: std({ color: 0xe6e0d0, roughness: 0.36, envMapIntensity: 0.4 }),
    timber: std({ map: T.oak, color: 0xc8a276, roughness: 0.85 }),
    galv: std({ color: 0xc4c6c4, metalness: 0.62, roughness: 0.42, envMapIntensity: 0.45 }),
    net: std({ map: T.net, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.65, envMapIntensity: 0.15 }),
    block: std({ map: T.conc, color: 0xa8a59e, roughness: 0.9 }),
    fill: std({ map: T.soil, color: 0xd6c3a0, bumpMap: T.soilBump, bumpScale: 0.012, roughness: 0.97, envMapIntensity: 0.12 }),
    blinding: std({ map: T.concFresh, color: 0x96938c, roughness: 0.92 }),
    cabin: std({ color: 0xe8e5de, roughness: 0.55 }),
    cabinTrim: std({ color: 0x2f363b, roughness: 0.55 }),
    leaf: std({ color: 0x677542, roughness: 0.85, flatShading: true }),
    leafDark: std({ color: 0x3b4829, roughness: 0.85, flatShading: true }),
    olive: std({ color: 0x6c7a4f, roughness: 0.85, flatShading: true }),
    bark: std({ color: 0x5a4f43, roughness: 0.96 }),
    // terreno y acabados de Casa Ensenada
    soil: std({ map: T.soil, bumpMap: T.soilBump, bumpScale: 0.035, roughness: 0.95, envMapIntensity: 0.14 }),
    clay: std({ map: T.clay, roughness: 0.95, envMapIntensity: 0.12 }),
    dry: std({ map: T.grass, color: 0xffeebf, roughness: 1, envMapIntensity: 0.1 }),
    grass: std({ map: T.grass, color: 0xe2eca8, roughness: 0.95, envMapIntensity: 0.1 }),
    water: std({ color: 0x5fb3c9, roughness: 0.08, metalness: 0.1, envMapIntensity: 0.9 }),
    concPol: std({ map: T.concFresh, color: 0xdedbd2, roughness: 0.4, envMapIntensity: 0.4 }),
  };
  for (const k in R) weekly(R[k], { wet: k === 'conc', pour: k === 'concPour', drop: k === 'cmu' });
  return R;
}

// ---------------------------------------------------------------- geometry helpers
export function stamp(geo, week, out = 0) {
  const p = geo.attributes.position, n = p.count, a = new Float32Array(n), o = new Float32Array(n);
  for (let i = 0; i < n; i++) { a[i] = typeof week === 'function' ? week(p.getX(i), p.getY(i), p.getZ(i)) : week; o[i] = typeof out === 'function' ? out(p.getX(i), p.getY(i), p.getZ(i)) : out; }
  geo.setAttribute('aWeek', new THREE.BufferAttribute(a, 1)); geo.setAttribute('aOut', new THREE.BufferAttribute(o, 1));
  return geo;
}
export function worldUV(g) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ax >= ay && ax >= az) { uv[i * 2] = z; uv[i * 2 + 1] = y; } else if (ay >= az) { uv[i * 2] = x; uv[i * 2 + 1] = z; } else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
export const merge = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
export function addMesh(group, geo, sets, o = {}) {
  const m = new THREE.Mesh(geo, sets.main || sets.paper || sets.nd);
  m.userData.sets = sets; m.castShadow = o.shadow !== false && !!sets.main; m.receiveShadow = true;
  if (sets.main) m.customDepthMaterial = DEPTH_WEEKLY;
  if (o.glass) m.userData.glass = true;
  m.frustumCulled = o.cull ?? true;
  group.add(m); return m;
}

// ---------------------------------------------------------------- the house as a list of parts
// ---------------------------------------------------------------- la casa como lista de partes (casa.js) con su semana
// El terreno corre de fondo (jardín, z = -9.965) a calle (z = +9.965): s va de 0 a 1 y la obra crece en ese sentido.
// Solo funciones afines a + b·s + c·ty (ty = altura dentro de su nivel), para que los tramos cortados compartan semana en cada costura.
const sOf = (z) => clamp((z + CZ) / 20.69, 0, 1);
const aff = (a, b, c = 0, y0 = 0, hy = 1) => (x, y, z) => a + b * sOf(z) + c * clamp((y - y0) / hy, 0, 1);

// el firme se cuela del jardín a la calle; antes pasan, en ese orden y con el mismo frente: relleno, drenaje, plástico, malla y poliducto (ver firmeKit)
const FIRME = (x, z) => 4.75 + 1.45 * Fhat(x, z);
// cada muro con block trae su semana de banda (block.js); sin banda, lo de siempre con las semanas nuevas
let OBRA = null;
function partWeeks(p) {
  if (p.wk) return p.wk;   // zapatas y contratrabes traen su semana (tramos a lo largo del eje, casa.js)
  switch (p.k) {
    case 'firme': return (x, y, z) => FIRME(x, z);
    case 'slab': return p.lvl === 1 ? aff(12.6, 1.0) : p.lvl === 2 ? aff(18.8, 1.0) : aff(23.8, 0.6);
    case 'stair': return p.st === 2 ? aff(17.3, 0, 0.3, 2.8, 2.8) : aff(13.8, 0, 0.5, 0, 2.8);
    case 'trabe': return aff(12.6, 1.0);   // T2: se cuela con la losa 2.80
    case 'barda': case 'struct':
      if (p.wid !== undefined && OBRA) return OBRA.bandWeek(p.wid, p.b);
      if (p.k === 'barda') return aff(6.8, 2.6, 0.2, 0, 2.4);
      if (p.lvl === 0) return aff(6.2, 3.0, 0.5, 0, 2.55);
      if (p.lvl === 1) return aff(13.2, 3.0, 0.4, 2.55, 2.8);
      return p.b[4] <= 6.85 ? aff(21.6, 0.8, 0.1, 5.6, 1.2) : aff(19.6, 1.6, 0.3, 5.6, 2.35);   // pretiles / muros de la terraza
    case 'columna': return aff(24.0, 0.6);
    case 'frame': case 'glass':
      if (p.lvl === 0) return aff(28.6, 1.2);
      if (p.lvl === 1) return aff(29.4, 1.0);
      return p.b[4] <= 6.75 ? aff(30.6, 0.5) : aff(30.2, 0.8);   // barandal de vidrio / cancelería de la terraza
    case 'pergola': return aff(27.0, 1.0);
    case 'dframe': return aff(32.0, 0.8);
    case 'fachada': {
      const t = p.b[1] >= 5;
      switch (p.m) {
        case 'plaster': return t ? aff(24.8, 0.6) : aff(26.2, 0.6);
        case 'grayPanel': return p.b[1] >= 5.5 ? aff(25.8, 0.4) : aff(27.0, 0.6);
        case 'fluted': return aff(29.0, 0.8);
        case 'woodSoffit': return aff(29.4, 0.8);
        case 'walnut': return aff(32.0, 0.6);
        case 'travertine': return aff(31.4, 0.6);
        case 'steel': return aff(29.6, 0.8);
        case 'led': return aff(32.4, 0.4);
        case 'conc': return aff(28.6, 0.4);
        case 'grass': return aff(34.5, 1.5);
      }
      return aff(30.0, 0.8);
    }
    case 'gate': { const w = p.g === 'cochera' ? 32.5 : 32.6; return () => w; }
  }
  const [a, b] = PHASE[Math.min(6, p.lvl + 2)] || [0, 40];
  return () => a + (b - a) * 0.5;
}
// acabados: capa de 2.5 mm sobre la estructura; el bruto desaparece cuando llega el acabado.
// Los aplanados cubren el block: de la terraza hacia abajo (finPl(lvl) = nivel del muro)
const finPl = (lvl) => (lvl <= 0 ? aff(26.0, 1.6) : lvl === 1 ? aff(25.2, 1.6) : aff(24.6, 1.0));
const FIN = {
  oak: (x, y, z) => (y < 2.5 ? 30.0 + 1.2 * sOf(z) : 30.8 + 1.0 * sOf(z)),
  travertine: aff(31.0, 1.0),
  conc: aff(28.6, 0.4),
  grass: aff(34.5, 1.5),
  water: () => 33.6,
};

const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
// cajas -> una geometría por material. 'real': con acabados (el bruto sale cuando llega la capa); 'paper': una sola para el dibujo
function boxGeos(boxes, mode) {
  const B = {};
  const emit = (key, p, f, wk, out, nOff = 0) => {
    const b = B[key] || (B[key] = { pos: [], nor: [], uv: [], wk: [], out: [], idx: [] });
    const base = b.pos.length / 3;
    for (const c of f.c) {
      const x = p.b[c[0] * 3] + f.n[0] * nOff;
      const y = p.b[1 + c[1] * 3] + f.n[1] * nOff;
      const z = p.b[2 + c[2] * 3] + f.n[2] * nOff;
      b.pos.push(x, y, z); b.nor.push(...f.n);
      if (f.n[0]) b.uv.push(z, y); else if (f.n[1]) b.uv.push(x, z); else b.uv.push(x, y);
      b.wk.push(wk(x, y, z)); b.out.push(out(x, y, z));
    }
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (const p of boxes) for (const f of FACES) {
    if (mode === 'paper') emit('paper', p, f, p.weeks, () => 0);
    else if (p.wid !== undefined) {   // muro de block: el bruto lo levanta block.js hilada por hilada; aquí solo la capa de acabado
      if (p.m === 'plaster') emit('plaster', p, f, finPl(p.lvl), () => 0, 0.0025);
      else if (p.m === 'walnut') emit('walnut', p, f, (x, y, z) => 32.0 + 0.6 * sOf(z), () => 0, 0.0025);
      // m 'block' (barda aparente de lindero): nada, la dibuja block.js sin aplanado
    } else if (p.k === 'trabe') {   // T2: faldón de la cochera, concreto con aplanado encima
      emit('conc', p, f, p.weeks, (x, y, z) => finPl(p.lvl)(x, y, z) + 0.02);
      emit('plaster', p, f, finPl(p.lvl), () => 0, 0.0025);
    } else if (p.m === 'plaster') {
      emit('block', p, f, p.weeks, (x, y, z) => finPl(p.lvl)(x, y, z) + 0.02);
      emit('plaster', p, f, finPl(p.lvl), () => 0, 0.0025);
    } else emit(p.m, p, f, p.weeks, () => 0);
  }
  const out = {};
  for (const k in B) {
    const b = B[k], g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2)); g.setAttribute('aWeek', new THREE.Float32BufferAttribute(b.wk, 1));
    g.setAttribute('aOut', new THREE.Float32BufferAttribute(b.out, 1)); g.setIndex(b.idx);
    out[k] = g;
  }
  return out;
}
// polígonos (x, z de mundo) -> losa extruida o piso plano, igual que slab() y floor() de index.html (v2: z se voltea y se gira -90° en X)
const shapeOf = (pts, holes) => {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  holes.forEach((h) => s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z)))));
  return s;
};
function slabGeo(p) {
  const g = new THREE.ExtrudeGeometry(shapeOf(p.outer, p.holes), { depth: p.d, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); g.translate(0, p.y, 0); return worldUV(g);
}
// un polígono ortogonal con huecos -> tiras [x0, z0, x1, z1] (bandas en x de a lo más maxW, unidas a lo largo de z)
function orthoStrips(p, maxW) {
  const uniq = (l) => l.sort((a, b) => a - b).filter((v, i) => !i || v - l[i - 1] > 1e-4);
  const all = [p.outer, ...p.holes].flat();
  let xs = uniq(all.map((q) => q[0])); const zs = uniq(all.map((q) => q[1]));
  if (maxW) xs = xs.flatMap((x, i) => { if (!i) return [x]; const a = xs[i - 1], n = Math.ceil((x - a) / maxW - 1e-6); return Array.from({ length: n }, (_, k) => a + ((x - a) * (k + 1)) / n); });
  const inside = (x, z) => inPoly(x, z, p.outer) && !p.holes.some((h) => inPoly(x, z, h));
  const out = [];
  for (let i = 0; i < xs.length - 1; i++) {
    let cur = null;
    for (let j = 0; j < zs.length - 1; j++) {
      if (!inside((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2)) { cur = null; continue; }
      if (cur) cur[3] = zs[j + 1]; else out.push(cur = [xs[i], zs[j], xs[i + 1], zs[j + 1]]);
    }
  }
  return out;
}
// la losa sin su cara de arriba (la pone topGrid)
function dropTop(g) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, P = [], N = [], T = [];
  const ix = g.index, at = (i) => (ix ? ix.getX(i) : i), cnt = ix ? ix.count : p.count;
  for (let i = 0; i < cnt; i += 3) {
    if (n.getY(at(i)) > 0.5) continue;
    for (let k = i; k < i + 3; k++) { const v = at(k); P.push(p.getX(v), p.getY(v), p.getZ(v)); N.push(n.getX(v), n.getY(v), n.getZ(v)); T.push(uv.getX(v), uv.getY(v)); }
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); o.setAttribute('uv', new THREE.Float32BufferAttribute(T, 2));
  return o;
}
// la cara de arriba de una losa en rejilla de `step` metros sobre líneas globales (las tiras vecinas comparten vértices); aPour = peralte que sube el colado
function topGrid(s, step) {
  const P = [], y = s.y + s.d;
  const lines = (a, b) => { const l = [a]; for (let v = Math.ceil((a + 0.02) / step) * step; v < b - 0.02; v += step) l.push(v); l.push(b); return l; };
  for (const [x0, z0, x1, z1] of orthoStrips(s, 0)) {
    const xs = lines(x0, x1), zs = lines(z0, z1);
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
      const a = xs[i], b = xs[i + 1], c = zs[j], d = zs[j + 1];
      P.push(a, y, c, a, y, d, b, y, d, a, y, c, b, y, d, b, y, c);
    }
  }
  const g = new THREE.BufferGeometry(), n = P.length / 3, N = new Float32Array(n * 3), T = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { N[i * 3 + 1] = 1; T[i * 2] = P[i * 3]; T[i * 2 + 1] = P[i * 3 + 2]; }
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(T, 2));
  g.setAttribute('aPour', new THREE.BufferAttribute(new Float32Array(n).fill(s.d), 1)); g.setAttribute('aSpan', new THREE.BufferAttribute(new Float32Array(n).fill(0.1), 1));
  return g;
}
function floorGeo(p, y) {
  const g = new THREE.ShapeGeometry(shapeOf(p.pts, p.holes));
  g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return worldUV(g);
}
function offsetGeo(g, d) {
  const o = g.clone(), p = o.attributes.position, n = o.attributes.normal;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * d, p.getY(i) + n.getY(i) * d, p.getZ(i) + n.getZ(i) * d);
  return o;
}
const FLOOR_MAT = { conc: 'concPol' };
const POURED = new Set(['zapata', 'contra']);
const NOSHADOW = new Set(['glass', 'steel', 'plaster', 'oak', 'travertine', 'grass', 'concPol', 'water', 'white', 'led', 'rebar', 'eps', 'cap']);
const DRAWN_NF = new Set(['struct', 'barda', 'trabe', 'stair', 'columna', 'zapata', 'contra', 'cisterna']);   // línea de peso completo
const DRAWN_FR = new Set(['frame', 'dframe', 'pergola', 'fachada']);                                  // cancelería: línea fina

// acumulador crudo de block.js -> geometría (cmu lleva color por pieza; el resto: position, normal, uv, aWeek, aOut)
function accGeo(A) {
  if (!A.pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(A.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(A.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(A.uv, 2)); g.setAttribute('aWeek', new THREE.Float32BufferAttribute(A.wk, 1));
  g.setAttribute('aOut', new THREE.Float32BufferAttribute(A.out, 1));
  if (A.col) g.setAttribute('color', new THREE.Float32BufferAttribute(A.col, 3));
  if (A.pour) { g.setAttribute('aPour', new THREE.Float32BufferAttribute(A.pour, 1)); g.setAttribute('aSpan', new THREE.Float32BufferAttribute(A.span, 1)); }
  return g;
}
export function blocksAt(week) { return OBRA ? OBRA.blocksAt(week) : { pb: [0, 0], pa: [0, 0], t: [0, 0] }; }
export function castAt(week) { return OBRA ? OBRA.castAt(week) : [0, 0]; }
export const obraStats = () => (OBRA ? OBRA.final || OBRA.stats() : null);

// pone la casa en `group`; devuelve lo que necesitan los puntales y el terreno
async function buildHouse(group, R, samples, tick, phone) {
  const tObra = performance.now();
  const all = casaParts();
  const boxes = all.filter((p) => p.t === 'box'), slabs = all.filter((p) => p.t === 'slab'), floors = all.filter((p) => p.t === 'floor');
  for (const p of slabs) p.weeks = partWeeks(p);
  OBRA = planObra({ walls: WALLS, trabes: TRABES, cols: COLS, conc: MUROS_CONC, slabs, Fhat, finPl, sOf, LV, phone, samples });
  for (const p of boxes) p.weeks = partWeeks(p);
  const real = {}, add = (k, g) => (real[k] || (real[k] = [])).push(g);
  const own = [];
  const rb = boxGeos(boxes.filter((p) => !POURED.has(p.k)), 'real');   // zapatas y contratrabes van como cajas que se cuelan (abajo)
  for (const k in rb) add(k, rb[k]);
  const paperSlabs = [];
  for (const s of slabs) {
    const full = slabGeo(s), g = dropTop(full), top = topGrid(s, phone ? 0.4 : 0.2);   // la cara de arriba va aparte: es la que se ve colar
    paperSlabs.push(stamp(slabGeo(s), s.weeks, 0));
    if (s.m === 'plaster') {   // el plafón se aplana con el nivel de abajo
      const fp = finPl(s.lvl - 1), lay = offsetGeo(full, 0.0025), out = (x, y, z) => fp(x, y, z) + 0.02;
      stamp(g, s.weeks, out); stamp(top, s.weeks, out); stamp(lay, fp, 0);
      add('conc', g); add('concPour', top); add('plaster', lay);
    } else { stamp(g, s.weeks, 0); stamp(top, s.weeks, 0); add('conc', g); add('concPour', top); }
  }
  // pisos: solo la capa de acabado (la estructura es la losa o el firme)
  for (const f of floors) {
    const y = f.y + (f.m === 'grass' ? 0.004 : 0);
    add(FLOOR_MAT[f.m] || f.m, stamp(floorGeo(f, y), FIN[f.m], 0));
  }
  // obra gruesa pieza por pieza, por nivel
  for (let l = 0; l < 3; l++) { OBRA.emitLevel(l); if (tick) await tick(0.05 + 0.05 * l); }
  OBRA.emitSlabs();
  for (const p of boxes) if (POURED.has(p.k)) pbox(OBRA.acc.concPour, p.b[0], p.b[1], p.b[2], p.b[3], p.b[4], p.b[5], (x, y, z) => p.weeks(x, p.b[1], z), 0.1, 0, { skip: 8 });
  OBRA.final = OBRA.stats();
  // la obra gruesa va en mallas propias que se ocultan cuando todo ya salió (hideFrom)
  // rebS1.. y casS1.. son el acero y los casetones de cada losa: mallas propias que solo existen mientras esa losa se arma (showFrom..hideFrom)
  const matOf = (k) => (k === 'cmuA' ? 'cmu' : k === 'mort' ? 'conc' : k.startsWith('rebS') ? 'rebar' : k.startsWith('casS') ? 'eps' : k);
  for (const k of Object.keys(OBRA.acc)) {
    const A = OBRA.acc[k], g = accGeo(A); OBRA.acc[k] = null;
    if (!g) continue;
    let mx = 0; for (let i = 0; i < A.out.length; i++) { if (!(A.out[i] > 0)) { mx = Infinity; break; } if (A.out[i] > mx) mx = A.out[i]; }
    let mn = Infinity; for (let i = 0; i < A.wk.length; i++) if (A.wk[i] < mn) mn = A.wk[i];
    own.push({ k: matOf(k), g, hideFrom: Number.isFinite(mx) ? mx + 0.01 : undefined, showFrom: mn - 0.01 });
  }
  for (const k in real) {
    if (!R[k]) throw new Error('world.js: falta el material R.' + k);
    addMesh(group, merge(real[k]), { main: R[k], paper: null, nd: null }, { glass: k === 'glass', shadow: !NOSHADOW.has(k) });
  }
  for (const { k, g, hideFrom, showFrom } of own) {
    const m = addMesh(group, g, { main: R[k], paper: null, nd: null }, { shadow: !NOSHADOW.has(k) });
    if (hideFrom !== undefined) m.userData.hideFrom = hideFrom;
    m.userData.showFrom = showFrom;
  }
  window.__obraMs = Math.round(performance.now() - tObra);
  // el dibujo, separado por jerarquía de línea
  const dn = boxGeos(boxes.filter((p) => DRAWN_NF.has(p.k)), 'paper');
  addMesh(group, merge([dn.paper, ...paperSlabs]), { main: null, paper: DM.paper, nd: DM.nd });
  const df = boxGeos(boxes.filter((p) => DRAWN_FR.has(p.k)), 'paper');
  if (df.paper) addMesh(group, df.paper, { main: null, paper: DM.paper, nd: DM.ndFrame });
  return { boxes, slabs, obra: OBRA };
}

// ---------------------------------------------------------------- obra falsa: puntales telescópicos y cimbra de triplay
// Cada entrada [x0, x1, y0, y1, yb, yt, [semana de llegada], semana de salida]: x e y son del plano (como en index.html),
// yb..yt la altura que apuntalan. La losa de arriba y el apoyo de abajo dan la forma del triplay y dónde puede haber poste.
export const PROPS = [
  [7.2, 12.3, 14.1, 19.7, 0, 2.55, [10.4, 11.0], 19.2],       // cochera, bajo la losa 2.80
  [1.6, 9.0, 8.4, 18.0, 0, 2.55, [10.5, 11.0], 19.3],         // planta baja norte
  [7.7, 12.3, 2.7, 7.0, 0, 2.55, [10.4, 10.9], 19.1],         // cocina
  [1.6, 7.25, 3.85, 8.1, 0, 5.35, [17.2, 17.8], 23.4],        // sala de doble altura: el bosque de 5.35 m
  [1.6, 12.3, 0.2, 19.7, 2.80, 5.35, [17.2, 17.8], 23.6],     // planta alta, bajo la losa 5.60
  [5.8, 12.3, 8.3, 16.3, 5.60, 7.95, [22.6, 23.0], 27.0],     // volumen de la terraza, bajo la azotea
  [7.6, 12.3, 0.15, 2.6, 0, 2.55, [10.4, 11.0], 19.2],        // pórtico y lavado, bajo la losa 2.80
];
const POSTS = [];   // { w, o } de cada poste creado: de aquí sale el conteo del chip
export function propsAt(week) {
  let n = 0;
  for (const p of POSTS) if (week >= p.w && week < p.o) n++;
  return n;
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

// andamio tubular de dos cuerpos con plataforma a 2.62, junto al borde de la losa 2.80 (jardín): por ahí sube el ojo en el recorrido. Coordenadas del plano.
const SCAF = { x0: 6.85, x1: 7.55, y0: -1.2, y1: 0.6, top: 2.62, wIn: 10.4, out: 19.3 };
function scaffoldGeo() {
  const { x0, x1, y0, y1, top } = SCAF, tubes = [], boards = [];
  const X0 = x0 - CX, X1 = x1 - CX, Z0 = y0 - CZ, Z1 = y1 - CZ, hr = top + 1.0, r = 0.024;
  const tube = (ax, a0, a1, p, q, rad = r) => {   // cilindro de eje ax (0 x, 1 y, 2 z) de a0 a a1; (p, q) = las otras dos coordenadas
    const g = new THREE.CylinderGeometry(rad, rad, a1 - a0, 6, 1, true);
    if (ax === 0) { g.rotateZ(Math.PI / 2); g.translate((a0 + a1) / 2, p, q); } else if (ax === 1) g.translate(p, (a0 + a1) / 2, q); else { g.rotateX(Math.PI / 2); g.translate(p, q, (a0 + a1) / 2); }
    tubes.push(g);
  };
  const brace = (xa, ya, za, xb, yb, zb) => {
    const d = new THREE.Vector3(xb - xa, yb - ya, zb - za), g = new THREE.CylinderGeometry(0.017, 0.017, d.length(), 5, 1, true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())); g.translate((xa + xb) / 2, (ya + yb) / 2, (za + zb) / 2); tubes.push(g);
  };
  for (const x of [X0, X1]) for (const z of [Z0, Z1]) {
    tube(1, 0.0, hr, x, z);
    const bp = new THREE.BoxGeometry(0.14, 0.012, 0.14); bp.translate(x, 0.006, z); tubes.push(bp);
  }
  for (const y of [0.35, top / 2, top - 0.04]) {   // largueros y travesaños de cada cuerpo
    for (const z of [Z0, Z1]) tube(0, X0, X1, y, z);
    for (const x of [X0, X1]) tube(2, Z0, Z1, x, y);
  }
  brace(X0, 0.35, Z0, X0, top / 2, Z1); brace(X0, top / 2, Z1, X0, top - 0.04, Z0);   // diagonales en las caras largas
  brace(X1, 0.35, Z1, X1, top / 2, Z0); brace(X1, top / 2, Z0, X1, top - 0.04, Z1);
  brace(X0, 0.35, Z0, X1, top / 2, Z0); brace(X1, top / 2, Z0, X0, top - 0.04, Z0);
  for (const y of [top + 0.5, hr]) { tube(0, X0, X1, y, Z0); tube(2, Z0, Z1, X1, y); }   // barandal en la cara de la losa y al fondo; abierto del lado de la subida
  // tablones de 4 cm
  const n = 3, wd = (X1 - X0) / n;
  for (let i = 0; i < n; i++) { const b = new THREE.BoxGeometry(wd - 0.012, 0.04, Z1 - Z0 + 0.1); b.translate(X0 + wd * (i + 0.5), top - 0.02, (Z0 + Z1) / 2); boards.push(b); }
  const t1 = new THREE.BoxGeometry(X1 - X0, 0.15, 0.025); t1.translate((X0 + X1) / 2, top + 0.095, Z0); boards.push(t1);
  const t2 = new THREE.BoxGeometry(0.025, 0.15, Z1 - Z0); t2.translate(X1, top + 0.095, (Z0 + Z1) / 2); boards.push(t2);
  const wk = (x, y) => SCAF.wIn + 0.5 * clamp(y / top, 0, 1);
  return { tubes: stamp(worldUV(merge(tubes)), (x, y) => wk(x, y), SCAF.out), boards: stamp(worldUV(merge(boards)), (x, y) => wk(x, y) + 0.2, SCAF.out) };
}

function propsGeo(E, ctx) {
  const [px0, px1, py0, py1, yb, yt, wIn, out] = E;
  const x0 = px0 - CX, x1 = px1 - CX, z0 = py0 - CZ, z1 = py1 - CZ;
  const top = ctx.slabs.find((s) => Math.abs(s.y - yt) < 0.03);                       // la losa que se cuela encima
  const sup = yb > 0.01 ? ctx.slabs.find((s) => Math.abs(s.y + s.d - yb) < 0.03) : null;   // la losa donde se apoyan
  const obst = [...ctx.boxes, ...(ctx.obra ? ctx.obra.solids() : [])].filter((b) => !['glass', 'gate', 'zapata', 'contra', 'cisterna'].includes(b.k) && b.b[1] < yt - 0.02 && b.b[4] > yb + 0.02);
  // el recorrido largo pasa por los mismos lugares en otras semanas: solo cuentan las muestras de cuando esto está armado
  const cams = ctx.samples.filter((c) => c.y > yb && c.y < yt && (c.w === undefined || (c.w > wIn[0] - 0.5 && c.w < out + 1)));
  const free = (x, z) => {
    if (top && !onSlab(top, x, z)) return false;
    if (sup && !onSlab(sup, x, z)) return false;
    for (const b of obst) { const dx = Math.max(b.b[0] - x, 0, x - b.b[3]), dz = Math.max(b.b[2] - z, 0, z - b.b[5]); if (dx * dx + dz * dz < 0.15 * 0.15) return false; }
    for (const c of cams) if ((c.x - x) ** 2 + (c.z - z) ** 2 < 0.6 * 0.6) return false;   // pasillo de 60 cm para la cámara
    return true;
  };
  const step = 1.2, hTot = yt - yb - 0.22, collarH = Math.min(1.65, hTot * 0.52), remH = Math.max(0.1, hTot - collarH - 0.014);
  const wk = (x, y, z) => wIn[0] + (wIn[1] - wIn[0]) * (0.75 * clamp((z - z0) / (z1 - z0), 0, 1) + 0.25 * clamp((y - yb) / (yt - yb), 0, 1));
  const outw = (x, y, z) => out + 0.9 * clamp((z - z0) / (z1 - z0), 0, 1);
  const list = [];
  for (let x = x0 + 0.5; x <= x1 - 0.4; x += step) {
    let run = null;
    const flush = () => {
      if (run && run.z1 - run.z0 >= 0) {   // viga H20 continua sobre la fila de postes, hasta el triplay
        const bm = new THREE.BoxGeometry(0.09, 0.20, run.z1 - run.z0 + 0.6); bm.translate(x, yt - 0.12, (run.z0 + run.z1) / 2); list.push(bm);
      }
      run = null;
    };
    for (let z = z0 + 0.5; z <= z1 - 0.4; z += step) {
      if (!free(x, z)) { flush(); continue; }
      const bp = new THREE.BoxGeometry(0.16, 0.014, 0.16); bp.translate(x, yb + 0.007, z); list.push(bp);
      const c1 = new THREE.CylinderGeometry(0.034, 0.034, collarH, 6, 1, true); c1.translate(x, yb + 0.014 + collarH / 2, z); list.push(c1);
      const col = new THREE.CylinderGeometry(0.048, 0.048, 0.09, 6); col.translate(x, yb + 0.014 + collarH, z); list.push(col);
      const c2 = new THREE.CylinderGeometry(0.027, 0.027, remH, 6, 1, true); c2.translate(x, yb + 0.014 + collarH + remH / 2, z); list.push(c2);
      const uh = new THREE.BoxGeometry(0.16, 0.016, 0.14); uh.translate(x, yt - 0.228, z); list.push(uh);
      POSTS.push({ w: wk(x, yt, z), o: outw(x, yt, z) });
      if (!run) run = { z0: z, z1: z }; else run.z1 = z;
    }
    flush();
  }
  // triplay: la huella de la losa de arriba, dentro del rectángulo y sin huecos; se corta en las líneas del contorno para que coincida
  const ply = [];
  if (top) {
    const xs = new Set([x0, x1]), zs = new Set([z0, z1]);
    for (const poly of [top.outer, ...top.holes]) for (const [px, pz] of poly) { if (px > x0 && px < x1) xs.add(px); if (pz > z0 && pz < z1) zs.add(pz); }
    // las trabes peraltadas (T1, T2) llevan su propia cimbra de fondo y costados: el triplay se corta en su huella y se ve la artesa con la jaula
    const cut = (ctx.obra ? ctx.obra.solids() : []).filter((s) => s.k === 'trabe' && s.b[1] <= yt + 0.02 && s.b[4] >= yt - 0.02 && s.b[0] < x1 && s.b[3] > x0 && s.b[2] < z1 && s.b[5] > z0);
    for (const s of cut) { for (const px of [s.b[0], s.b[3]]) if (px > x0 && px < x1) xs.add(px); for (const pz of [s.b[2], s.b[5]]) if (pz > z0 && pz < z1) zs.add(pz); }
    const inCut = (x, z) => cut.some((s) => x > s.b[0] && x < s.b[3] && z > s.b[2] && z < s.b[5]);
    const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b);
    for (let j = 0; j < Z.length - 1; j++) {
      let a = null;
      for (let i = 0; i < X.length - 1; i++) {
        const ok = onSlab(top, (X[i] + X[i + 1]) / 2, (Z[j] + Z[j + 1]) / 2) && !inCut((X[i] + X[i + 1]) / 2, (Z[j] + Z[j + 1]) / 2);
        if (ok) { if (!a) a = X[i]; } else if (a !== null) { ply.push([a, X[i], Z[j], Z[j + 1]]); a = null; }
      }
      if (a !== null) ply.push([a, X[X.length - 1], Z[j], Z[j + 1]]);
    }
  }
  const dk = ply.map(([a, b, c, d]) => { const g = new THREE.BoxGeometry(b - a, 0.02, d - c); g.translate((a + b) / 2, yt - 0.008, (c + d) / 2); return worldUV(g); });
  const posts = list.length ? stamp(worldUV(merge(list)), wk, outw) : null;
  const deck = dk.length ? stamp(merge(dk), wk, outw) : null;
  return { posts, deck };
}

// ---------------------------------------------------------------- trees and foliage
export const FIG_GEO = (() => {
  const g = new THREE.LatheGeometry([[0, 0], [0.12, 0], [0.14, 0.1], [0.15, 0.82], [0.19, 1.0], [0.21, 1.36], [0.19, 1.44], [0.07, 1.5], [0.07, 1.54], [0.1, 1.6], [0.1, 1.7], [0.06, 1.75], [0, 1.76]].map(([x, y]) => new THREE.Vector2(x, y)), 16);
  g.scale(1, 1, 0.62); return g;
})();
export function workerGeo() {
  return { body: new THREE.BufferGeometry(), vest: new THREE.BufferGeometry(), hat: new THREE.BufferGeometry(), head: new THREE.BufferGeometry() };
}
export function canopy(clusters, s0, s1) {
  const list = [];
  for (const [cx, cy, cz, rx, ry, rz, n] of clusters) for (let i = 0; i < n; i++) {
    let x, y, z; do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1; } while (x * x + y * y + z * z > 1);
    const k = 0.6 + 0.4 * Math.sqrt(rnd());
    const g = new THREE.IcosahedronGeometry(s0 + rnd() * (s1 - s0), 0); g.scale(1, 0.55, 1); g.rotateX(rnd() * 3); g.rotateZ(rnd() * 3);
    g.translate(cx + x * rx * k, cy + y * ry * k, cz + z * rz * k); list.push(g);
  }
  return merge(list);
}


// acumuladores de geometría para lo que solo existe en la obra real: caja, tronco de cono/cilindro y malla final
function kitTools(group) {
  const newAcc = () => ({ pos: [], nor: [], wk: [], out: [] });
  const val = (f, x, y, z) => (typeof f === 'function' ? f(x, y, z) : f);
  const vert = (A, x, y, z, n, wk, out) => { A.pos.push(x, y, z); A.nor.push(n[0], n[1], n[2]); A.wk.push(val(wk, x, y, z)); A.out.push(val(out, x, y, z)); };
  const box = (A, x0, y0, z0, x1, y1, z1, wk, out = 0) => {
    for (const f of FACES) {
      const q = f.c.map((c) => [c[0] ? x1 : x0, c[1] ? y1 : y0, c[2] ? z1 : z0]);
      for (const i of [0, 1, 2, 0, 2, 3]) vert(A, q[i][0], q[i][1], q[i][2], f.n, wk, out);
    }
  };
  // tronco de cono / cilindro de n lados (abierto; tapa opcional arriba) entre dos puntos
  const frustum = (A, p0, p1, r0, r1, wk, out, n = 6, cap = false) => {
    const d = V(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), L = d.length(); d.divideScalar(L);
    const u = Math.abs(d.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0).cross(d).normalize(), v = d.clone().cross(u);
    const pt = (i, r, p) => { const a = (i / n) * Math.PI * 2; return [p[0] + (u.x * Math.cos(a) + v.x * Math.sin(a)) * r, p[1] + (u.y * Math.cos(a) + v.y * Math.sin(a)) * r, p[2] + (u.z * Math.cos(a) + v.z * Math.sin(a)) * r]; };
    for (let i = 0; i < n; i++) {
      const am = ((i + 0.5) / n) * Math.PI * 2, nn = [u.x * Math.cos(am) + v.x * Math.sin(am), u.y * Math.cos(am) + v.y * Math.sin(am), u.z * Math.cos(am) + v.z * Math.sin(am)];
      const a0 = pt(i, r0, p0), a1 = pt(i + 1, r0, p0), b0 = pt(i, r1, p1), b1 = pt(i + 1, r1, p1);
      for (const q of [a0, a1, b1, a0, b1, b0]) vert(A, q[0], q[1], q[2], nn, wk, out);
      if (cap) for (const q of [p1, b0, b1]) vert(A, q[0], q[1], q[2], [d.x, d.y, d.z], wk, out);
    }
  };
  const cyl = (A, p0, p1, r, wk, out) => frustum(A, p0, p1, r, r, wk, out, 6, false);
  const mk = (A, mat, shadow) => {
    if (!A.pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(A.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(A.nor, 3));
    g.setAttribute('aWeek', new THREE.Float32BufferAttribute(A.wk, 1)); g.setAttribute('aOut', new THREE.Float32BufferAttribute(A.out, 1));
    worldUV(g);
    addMesh(group, g, { main: mat, paper: null, nd: null }, { shadow });
  };
  return { newAcc, box, frustum, cyl, mk };
}

// ---------------------------------------------------------------- la cimentación por dentro: trazo, niveletas, plantilla, acero, cimbra
// Todo es solo de la obra real (el dibujo muestra la cepa, la zapata y la contratrabe). Una geometría por material.
// Regla: ninguna cara queda en el mismo plano que la de otra pieza (se meten 5–10 mm o se separan ≥ 2 cm).
function foundationKit(group, R, samples, obra) {
  const runs = cimRuns().filter((r) => !r.dropped);
  const huellas = casaParts().filter((p) => p.k === 'firme').map((p) => p.outer);
  const { newAcc, box, frustum, cyl, mk } = kitTools(group);
  const K = { pl: newAcc(), rebar: newAcc(), cap: newAcc(), ply: newAcc(), timber: newAcc(), cal: newAcc(), hilo: newAcc(), imp: newAcc() };
  const rc = (run, p, iv) => rectOf(run, p, iv);
  // caja en el marco de una corrida: u a lo largo del eje, q transversal
  const boxA = (A, run, u0, u1, q0, q1, y0, y1, wk, out = 0) => { if (run.ax === 0) box(A, u0, y0, q0, u1, y1, q1, wk, out); else box(A, q0, y0, u0, q1, y1, u1, wk, out); };
  const pos3 = (run, u, q, y) => (run.ax === 0 ? [u, y, q] : [q, y, u]);
  const Wat = (run, u, q) => (run.ax === 0 ? runW(run, u, q) : runW(run, q, u));
  const wf = (run, t0) => (x, y, z) => t0 + runW(run, x, z);
  // recorta una lista de intervalos del eje de `run` donde llegan corridas perpendiculares (su franja de la pieza p, más 1 cm), solo si cruzan el rango transversal [q0, q1]
  const cutAround = (run, list, q0, q1, p) => {
    for (const J of runs) {
      if (J === run || J.ax === run.ax) continue;
      for (const iv of J.iv[p]) if (Math.min(iv[1], q1) - Math.max(iv[0], q0) > 1e-4) list = subtractIv(list, J.sp[p][0] - 0.01, J.sp[p][1] + 0.01);
    }
    return list.filter(([a, b]) => b - a > 0.05);
  };
  const place = (run, p, iv) => rc(run, p, iv);

  // ---- plantilla
  for (const run of runs) {
    const y0 = run.Y.pl[0], y1 = run.Y.pl[1] - run.dy;
    for (const iv of run.iv.pl) { const r = place(run, 'pl', iv); box(K.pl, r[0], y0, r[1], r[2], y1, r[3], wf(run, 1.15), 0); }
  }
  // ---- parrilla de zapata: transversales #4 @ 0.20 y longitudinales #3 @ 0.25, sobre el fondo de cada zapata
  for (const run of runs) {
    const [s0, s1] = run.sp.za, yT = run.Y.za[0] + 0.06, yL = run.Y.za[0] + 0.075;   // la parrilla va 6 cm sobre el fondo de cada zapata (barda, corrida o aislada)
    for (const [a, b] of run.iv.za) {
      if (b - a < 0.3) continue;
      const n = Math.max(2, Math.floor((b - a - 0.2) / 0.2) + 1);
      for (let i = 0; i < n; i++) {
        const u = a + 0.1 + ((b - a - 0.2) * i) / (n - 1), W = Wat(run, u, (s0 + s1) / 2);
        cyl(K.rebar, pos3(run, u, s0 + 0.05, yT), pos3(run, u, s1 - 0.05, yT), 0.0105, 1.45 + W, 2.51 + W);
      }
      const nl = Math.max(2, Math.ceil((s1 - s0 - 0.12) / 0.25) + 1);
      for (let i = 0; i < nl; i++) {
        const q = s0 + 0.06 + ((s1 - s0 - 0.12) * i) / (nl - 1);
        cyl(K.rebar, pos3(run, a + 0.05, q, yL), pos3(run, b - 0.05, q, yL), 0.008, wf(run, 1.45), wf(run, 2.51));
      }
    }
  }
  // ---- jaula de contratrabe: 4 longitudinales #4 y estribos #2.5
  for (const run of runs) {
    const [s0, s1] = run.sp.co, cs = (s0 + s1) / 2, bd = run.tipo === 'barda';
    const wd = bd ? 0.07 : 0.12, ys = bd ? [-0.40, -0.10] : [-0.74, -0.12], sw = bd ? 0.09 : 0.13, sy0 = bd ? -0.42 : -0.745, sy1 = bd ? -0.08 : -0.115, sp = bd ? 0.25 : 0.20;
    for (const [a, b] of run.iv.co) {
      for (const dq of [-wd / 2, wd / 2]) for (const y of ys) cyl(K.rebar, pos3(run, a + 0.04, cs + dq, y), pos3(run, b - 0.04, cs + dq, y), 0.009, wf(run, 1.65), wf(run, 3.45));
      const n = Math.max(1, Math.floor((b - a - 0.1) / sp) + 1);
      for (let i = 0; i < n; i++) {
        const u = n === 1 ? (a + b) / 2 : a + 0.05 + ((b - a - 0.1) * i) / (n - 1), W = Wat(run, u, cs), wk = 1.65 + W, out = 3.45 + W, h = 0.006;
        boxA(K.rebar, run, u - h, u + h, cs - sw / 2 - h, cs - sw / 2 + h, sy0, sy1, wk, out);
        boxA(K.rebar, run, u - h, u + h, cs + sw / 2 - h, cs + sw / 2 + h, sy0, sy1, wk, out);
        boxA(K.rebar, run, u - h, u + h, cs - sw / 2 + h, cs + sw / 2 - h, sy0 - h, sy0 + h, wk, out);
        boxA(K.rebar, run, u - h, u + h, cs - sw / 2 + h, cs + sw / 2 - h, sy1 - h, sy1 + h, wk, out);
      }
    }
  }
  // ---- anclas de castillo con capuchón naranja
  for (const [ax, az, ay0 = -0.95] of cimRuns().anchors) {
    let W = 9;
    for (const r of runs) { const c = r.cepa; if (ax >= c[0] && ax <= c[2] && az >= c[1] && az <= c[3]) W = Math.min(W, runW(r, ax, az)); }
    if (W > 8) continue;
    let out = 6.5 + 3.2 * clamp((az + CZ) / 20.69, 0, 1), outRod = out;
    // con castillo o columna a menos de 0.25: la varilla sigue en el armex y el capuchón sale cuando llega el armex
    const cp = (obra ? obra.castPoints(0) : []).filter((c) => Math.hypot(c.x - ax, c.z - az) < 0.25).sort((p, q) => Math.hypot(p.x - ax, p.z - az) - Math.hypot(q.x - ax, q.z - az))[0];
    if (cp) { outRod = 0; out = cp.Wr; }
    for (const dx of [-0.05, 0.05]) for (const dz of [-0.05, 0.05]) {
      cyl(K.rebar, [ax + dx, ay0, az + dz], [ax + dx, 0.60, az + dz], 0.008, 1.65 + W, outRod);
      frustum(K.cap, [ax + dx, 0.60, az + dz], [ax + dx, 0.645, az + dz], 0.024, 0.018, 1.65 + W, out, 8, true);
    }
  }
  // ---- fronteras de zapata: tablas de pino 0.025 x 0.25 a 5 mm del concreto, con estacas por fuera
  for (const run of runs) {
    const [s0, s1] = run.sp.za;
    const sides = [], zb = run.Y.za[0], hb = Math.min(0.25, run.Y.za[1] - run.Y.za[0] + 0.05);   // fondo de la zapata y alto de la frontera
    if (run.lind >= 0) sides.push([s0 - 0.030, s0 - 0.005, s0 - 0.082, s0 - 0.028]);   // el lado del lindero no lleva cimbra
    if (run.lind <= 0) sides.push([s1 + 0.005, s1 + 0.030, s1 + 0.028, s1 + 0.082]);
    for (const [q0, q1, k0, k1] of sides) {
      let list = cutAround(run, run.iv.za.map((v) => [...v]), q0, q1, 'za');
      for (const [a, b] of list) {
        boxA(K.timber, run, a, b, q0, q1, zb, zb + hb - run.dy, wf(run, 1.75), wf(run, 2.75));
        const n = Math.max(1, Math.round((b - a) / 0.8));
        for (let i = 0; i < n; i++) { const u = a + ((i + 0.5) * (b - a)) / n, W = Wat(run, u, q0); boxA(K.timber, run, u - 0.025, u + 0.025, k0, k1, zb - 0.05, zb + hb + 0.05, 1.75 + W, 2.75 + W); }
      }
    }
    // extremos libres
    const others = runs.filter((J) => J !== run).flatMap((J) => J.iv.za.map((iv) => rectOf(J, 'za', iv)));
    for (const iv of run.iv.za) for (const [u0, u1, sg] of [[iv[0] - 0.030, iv[0] - 0.005, -1], [iv[1] + 0.005, iv[1] + 0.030, 1]]) {
      if (run.tipo === 'col' && run.lindX === sg) continue;   // el lado del lindero no lleva cimbra
      const r = run.ax === 0 ? [u0, s0 - 0.03, u1, s1 + 0.03] : [s0 - 0.03, u0, s1 + 0.03, u1];
      if (others.some((q) => ovl(r, q))) continue;
      boxA(K.timber, run, u0, u1, run.lind < 0 ? s0 : s0 - 0.03, run.lind > 0 ? s1 : s1 + 0.03, zb, zb + hb, wf(run, 1.75), wf(run, 2.75));
    }
  }
  // ---- cimbra de contratrabe: triplay de 16 mm, barrotes cada 0.60 y yugos cada 1.20
  for (const run of runs) {
    const [s0, s1] = run.sp.co, ply = 0.016, gap = 0.005, cb = run.tipo === 'col' ? run.Y.co[0] : -0.81;   // fondo del dado

    const sideDefs = [];
    if (run.lind >= 0) sideDefs.push([s0 - gap - ply, s0 - gap, -1]);
    if (run.lind <= 0) sideDefs.push([s1 + gap, s1 + gap + ply, 1]);
    for (const [q0, q1, sg] of sideDefs) {
      const list = cutAround(run, run.iv.co.map((v) => [...v]), q0, q1, 'co');
      for (const [a, b] of list) {
        boxA(K.ply, run, a, b, q0, q1, cb + 0.01, -0.02 - run.dy, wf(run, 2.55), wf(run, 3.60));
        const n = Math.max(1, Math.round((b - a) / 0.6));
        for (let i = 0; i < n; i++) {
          const u = a + ((i + 0.5) * (b - a)) / n, W = Wat(run, u, q0);
          if (sg < 0) boxA(K.timber, run, u - 0.025, u + 0.025, q0 - 0.098, q0 + 0.002, cb + 0.02, -0.03, 2.55 + W, 3.60 + W);
          else boxA(K.timber, run, u - 0.025, u + 0.025, q1 - 0.002, q1 + 0.098, cb + 0.02, -0.03, 2.55 + W, 3.60 + W);
        }
      }
    }
    // yugos sobre la corona
    const qa = run.lind < 0 ? s0 : s0 - 0.119, qb = run.lind > 0 ? s1 : s1 + 0.119;
    for (const [a, b] of cutAround(run, run.iv.co.map((v) => [...v]), s0, s1, 'co')) {
      const n = Math.max(1, Math.round((b - a) / 1.2));
      for (let i = 0; i < n; i++) {
        const u = a + ((i + 0.5) * (b - a)) / n, W = Wat(run, u, s0);
        boxA(K.timber, run, u - 0.025, u + 0.025, qa, qb, -0.033, 0.025, 2.55 + W, 3.60 + W);
      }
    }
  }
  // ---- niveletas: dos estacas y un travesaño a 1 m de cada extremo de corrida, fuera de huella, cepas y ruta de la cámara
  const placed = [], nivs = new Map();
  const inCepa = (x, z, m) => runs.some((r) => x > r.cepa[0] - m && x < r.cepa[2] + m && z > r.cepa[1] - m && z < r.cepa[3] + m);
  for (const run of runs) {
    if (run.tipo === 'pil' || run.tipo === 'col') continue;
    for (const [u, sg] of [[run.lo, -1], [run.hi, 1]]) {
      const uu = u + sg * 1.0, x = run.ax === 0 ? uu : run.c, z = run.ax === 0 ? run.c : uu;
      if (huellas.some((h) => inPoly(x, z, h)) || inCepa(x, z, 0.5) || placed.some((q) => Math.hypot(q[0] - x, q[1] - z) < 1.0)) continue;
      if (samples.some((s) => s.y < 1.3 && Math.hypot(s.x - x, s.z - z) < 0.6)) continue;   // solo estorban al ojo que camina, no al que pasa por arriba
      placed.push([x, z]); nivs.set(run, [...(nivs.get(run) || []), uu]);
      const wk = 0.05 + 0.30 * Fhat(x, z), out = 3.65 + runW(run, x, z);
      for (const dq of [-0.5, 0.5]) boxA(K.timber, run, uu - 0.025, uu + 0.025, run.c + dq - 0.025, run.c + dq + 0.025, -0.30, 0.60, wk, out);
      boxA(K.timber, run, uu - 0.0125, uu + 0.0125, run.c - 0.55, run.c + 0.55, 0.55, 0.65, wk, out);
    }
  }
  // ---- hilos de trazo (reventones): de niveleta a niveleta sobre el eje de la corrida, hasta que se excava su cepa
  for (const [run, us] of nivs) if (us.length === 2) boxA(K.hilo, run, Math.min(...us), Math.max(...us), run.c - 0.002, run.c + 0.002, 0.652, 0.656, 0.36, 0.75 + run.Wd.base);
  // ---- impermeabilizante asfáltico: la corona de cada contratrabe y 25 cm de sus caras, al descimbrar (capa de 4 mm por fuera del concreto)
  for (const run of runs) {
    const [s0, s1] = run.sp.co, top = run.Y.co[1] - run.dy;
    for (const [a, b] of run.iv.co) if (b - a > 0.02) boxA(K.imp, run, a, b, s0 - 0.004, s1 + 0.004, top - 0.25, top + 0.004, wf(run, 3.72), 7.2);
  }
  // ---- trazo con cal: líneas de 5 cm sobre los bordes de cada cepa (se van cuando se excava)
  runs.forEach((run) => {
    const c = run.cepa;
    const insideOther = (x, z) => runs.some((r) => r !== run && x > r.cepa[0] + 0.02 && x < r.cepa[2] - 0.02 && z > r.cepa[1] + 0.02 && z < r.cepa[3] - 0.02);
    const segs = [[c[0], c[1], c[2], c[1]], [c[0], c[3], c[2], c[3]], [c[0], c[1], c[0], c[3]], [c[2], c[1], c[2], c[3]]];
    for (const [x0, z0, x1, z1] of segs) {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 0.4));
      for (let i = 0; i < n; i++) {
        const xa = x0 + ((x1 - x0) * i) / n, xb = x0 + ((x1 - x0) * (i + 1)) / n, za = z0 + ((z1 - z0) * i) / n, zb = z0 + ((z1 - z0) * (i + 1)) / n;
        const mx = (xa + xb) / 2, mz = (za + zb) / 2;
        if (insideOther(mx, mz)) continue;
        const F = Fhat(mx, mz), E1 = 0.75 + runW(run, mx, mz), D = 0.55 + 0.5 * F;
        const out = huellas.some((h) => inPoly(mx, mz, h)) ? Math.min(E1, D) : E1;
        const hw = 0.025, hz = z0 === z1, wkc = 0.05 + 0.30 * F;
        box(K.cal, hz ? Math.min(xa, xb) : xa - hw, -0.002, hz ? za - hw : Math.min(za, zb), hz ? Math.max(xa, xb) : xa + hw, 0.012, hz ? za + hw : Math.max(za, zb), wkc, out);
      }
    }
  });
  mk(K.pl, R.blinding, false); mk(K.rebar, R.rebar, true); mk(K.cap, R.cap, false);
  mk(K.ply, R.ply, true); mk(K.timber, R.timber, true); mk(K.cal, R.white, false); mk(K.hilo, R.white, false); mk(K.imp, R.ink, false);
}

// ---------------------------------------------------------------- la cisterna por dentro: trazo, plantilla, acero, cimbra, impermeabilizante, aplanado y obra falsa de la tapa
// Solo de la obra real (el dibujo muestra el concreto, k 'cisterna'). Medidas de CIS (casa.js, en plano); aquí bx y rod reciben plano [x, y] y altura y los pasan a mundo.
function cisternKit(group, R) {
  const { newAcc, box, frustum, cyl, mk } = kitTools(group);
  const C = CIS, e = C.ext, n = C.int, h = C.hueco;
  const dy = h[1] - 18.30;   // las medidas a mano (y de plano) se escribieron con el hueco en y 18.30: se corren lo mismo que la cisterna
  const K = { white: newAcc(), pl: newAcc(), rebar: newAcc(), ply: newAcc(), timber: newAcc(), ink: newAcc(), pol: newAcc(), prop: newAcc(), steel: newAcc() };
  const bx = (A, x0, y0, x1, y1, ya, yb, wk, out = 0) => box(A, x0 - CX, ya, y0 - CZ, x1 - CX, yb, y1 - CZ, wk, out);
  const rod = (A, p, q, r, wk, out) => cyl(A, [p[0] - CX, p[2], p[1] - CZ], [q[0] - CX, q[2], q[1] - CZ], r, wk, out);   // p, q: [x plano, y plano, altura]
  const lin = (a, b, s) => { const m = Math.max(1, Math.ceil((b - a) / s - 1e-9)); return Array.from({ length: m + 1 }, (_, i) => a + ((b - a) * i) / m); };   // a..b a no más de s
  // ---- trazo con cal: líneas de 5 cm sobre el perímetro de la fosa, en tramos de ~0.4 (se van cuando se excava)
  {
    const f = C.fosa, hw = 0.025;
    for (const yy of [f[1], f[3]]) {
      const m = Math.round((f[2] - f[0] + 2 * hw) / 0.4), a = f[0] - hw, L = f[2] - f[0] + 2 * hw;
      for (let i = 0; i < m; i++) bx(K.white, a + (L * i) / m, yy - hw, a + (L * (i + 1)) / m, yy + hw, -0.002, 0.012, 0.05, 0.55);
    }
    for (const xx of [f[0], f[2]]) {
      const m = Math.round((f[3] - f[1] - 2 * hw) / 0.4), a = f[1] + hw, L = f[3] - f[1] - 2 * hw;
      for (let i = 0; i < m; i++) bx(K.white, xx - hw, a + (L * i) / m, xx + hw, a + (L * (i + 1)) / m, -0.002, 0.012, 0.05, 0.55);
    }
  }
  // ---- plantilla de 5 cm
  bx(K.pl, ...C.plantilla, C.plantillaY[0], C.plantillaY[1], 1.25, 0);
  // ---- parrilla del fondo: #3 @ 0.20 en ambos sentidos, recubrimiento 0.05
  {
    const l = C.losa;
    for (const y of lin(l[1] + 0.05, l[3] - 0.05, 0.2)) rod(K.rebar, [l[0] + 0.05, y, -2.15], [l[2] - 0.05, y, -2.15], 0.008, 1.5, 2.1);
    for (const x of lin(l[0] + 0.05, l[2] - 0.05, 0.2)) rod(K.rebar, [x, l[1] + 0.05, -2.135], [x, l[3] - 0.05, -2.135], 0.008, 1.5, 2.1);
  }
  // ---- varillas verticales por el eje de cada muro: arranques (cortos) y armado completo; las esquinas se cuentan una vez
  const ax0 = (e[0] + n[0]) / 2, ax2 = (n[2] + e[2]) / 2, ay0 = (e[1] + n[1]) / 2, ay3 = (n[3] + e[3]) / 2, axis = [];
  for (const x of [ax0, ax2]) for (const y of lin(ay0, ay3, 0.2)) axis.push([x, y]);
  for (const y of [ay0, ay3]) for (const x of lin(ax0, ax2, 0.2).slice(1, -1)) axis.push([x, y]);
  for (const [x, y] of axis) {
    rod(K.rebar, [x, y, -2.15], [x, y, -1.75], 0.008, 1.5, 2.2);
    rod(K.rebar, [x, y, -2.15], [x, y, -0.17], 0.008, 2.2, 5.7);   // asoman 7 cm sobre el muro hasta que se cuela la tapa
  }
  // ---- horizontales #3 @ 0.25, 2 cm hacia afuera del eje, suben con el armado
  {
    const hx0 = ax0 - 0.02, hx1 = ax2 + 0.02, hy0 = ay0 - 0.02, hy1 = ay3 + 0.02, wkh = (x, y) => 2.2 + (0.1 * (y + 1.95)) / 1.6;
    for (const y of lin(-1.95, -0.35, 0.25)) {
      for (const x of [hx0, hx1]) rod(K.rebar, [x, hy0, y], [x, hy1, y], 0.008, wkh, 3.05);
      for (const q of [hy0, hy1]) rod(K.rebar, [hx0, q, y], [hx1, q, y], 0.008, wkh, 3.05);
    }
  }
  // ---- pasatubos de PVC: llenado por el muro sur (calle) y rebosadero por el norte
  frustum(K.white, [10.30 - CX, -0.38, 19.05 + dy - CZ], [10.30 - CX, -0.38, 19.55 + dy - CZ], 0.03, 0.03, 2.25, 0, 8);
  frustum(K.white, [9.20 - CX, -0.48, 17.15 + dy - CZ], [9.20 - CX, -0.48, 16.65 + dy - CZ], 0.03, 0.03, 2.25, 0, 8);
  // ---- cimbra de muros: triplay de 16 mm a 5 mm de cada cara y barrotes 0.05 x 0.10 cada 0.60 por fuera del triplay; los barrotes se apartan de los pasatubos
  {
    const pl = 0.016, g = 0.005, ya = -2.04, yb = -0.22, pvc = [10.30, 9.20];
    // r: triplay [x0, y0, x1, y1]; ax 0 = delgado en x (poniente/oriente), 1 = delgado en y; dir: hacia dónde salen los barrotes
    const forma = (r, ax, dir, a, b, wk, out) => {
      bx(K.ply, ...r, ya, yb, wk, out);
      const m = Math.max(1, Math.round((b - a) / 0.6));
      for (let i = 0; i < m; i++) {
        let u = a + ((i + 0.5) * (b - a)) / m;
        if (ax === 1) for (const p of pvc) if (Math.abs(u - p) < 0.06) u += Math.sign(u - p || 1) * 0.08;
        if (ax === 0) { const q = dir < 0 ? [r[0] - 0.098, r[0] + 0.002] : [r[2] - 0.002, r[2] + 0.098]; bx(K.timber, q[0], u - 0.025, q[1], u + 0.025, ya + 0.01, yb - 0.01, wk, out); }
        else { const q = dir < 0 ? [r[1] - 0.098, r[1] + 0.002] : [r[3] - 0.002, r[3] + 0.098]; bx(K.timber, u - 0.025, q[0], u + 0.025, q[1], ya + 0.01, yb - 0.01, wk, out); }
      }
    };
    // exterior: poniente/oriente más largos 0.021 por extremo; norte/sur entre ellos
    const ex = (wk, out) => {
      forma([e[0] - g - pl, e[1] - 0.021, e[0] - g, e[3] + 0.021], 0, -1, e[1], e[3], wk, out);
      forma([e[2] + g, e[1] - 0.021, e[2] + g + pl, e[3] + 0.021], 0, 1, e[1], e[3], wk, out);
      forma([e[0] - g + 0.001, e[1] - g - pl, e[2] + g - 0.001, e[1] - g], 1, -1, e[0], e[2], wk, out);
      forma([e[0] - g + 0.001, e[3] + g, e[2] + g - 0.001, e[3] + g + pl], 1, 1, e[0], e[2], wk, out);
    };
    // interior: poniente/oriente a todo lo largo de la caja; norte/sur entre ellos
    const inn = (wk, out) => {
      forma([n[0] + g, n[1] + g, n[0] + g + pl, n[3] - g], 0, 1, n[1] + g, n[3] - g, wk, out);
      forma([n[2] - g - pl, n[1] + g, n[2] - g, n[3] - g], 0, -1, n[1] + g, n[3] - g, wk, out);
      forma([n[0] + g + pl + 0.001, n[1] + g, n[2] - g - pl - 0.001, n[1] + g + pl], 1, 1, n[0] + g + pl, n[2] - g - pl, wk, out);
      forma([n[0] + g + pl + 0.001, n[3] - g - pl, n[2] - g - pl - 0.001, n[3] - g], 1, -1, n[0] + g + pl, n[2] - g - pl, wk, out);
    };
    inn(2.5, 3.6); ex(2.6, 3.6);
  }
  // ---- impermeabilizante asfáltico exterior: capas de 5 mm que penetran 1 mm en el muro
  for (const [x0, y0, x1, y1] of [[e[0] - 0.004, e[1] - 0.004, e[0] + 0.001, e[3] + 0.004], [e[2] - 0.001, e[1] - 0.004, e[2] + 0.004, e[3] + 0.004],
    [e[0] + 0.001, e[1] - 0.004, e[2] - 0.001, e[1] + 0.001], [e[0] + 0.001, e[3] - 0.001, e[2] - 0.001, e[3] + 0.004]]) bx(K.ink, x0, y0, x1, y1, -2.05, -0.25, 3.75, 0);
  // ---- aplanado pulido interior: capas de 2.5 mm que penetran 1 mm, y sobre el fondo
  for (const [x0, y0, x1, y1] of [[n[0] - 0.001, n[1] - 0.001, n[0] + 0.0025, n[3] + 0.001], [n[2] - 0.0025, n[1] - 0.001, n[2] + 0.001, n[3] + 0.001],
    [n[0] + 0.0025, n[1] - 0.001, n[2] - 0.0025, n[1] + 0.0025], [n[0] + 0.0025, n[3] - 0.0025, n[2] - 0.0025, n[3] + 0.001]]) bx(K.pol, x0, y0, x1, y1, -2.05, -0.25, 3.9, 0);
  bx(K.pol, n[0] + 0.0025, n[1] + 0.0025, n[2] - 0.0025, n[3] - 0.0025, -2.051, -2.0475, 3.9, 0);
  // ---- obra falsa de la tapa: puntales, madrinas, cubierta de triplay en 4 tiras y cajón del registro
  {
    const rows = [17.50, 18.10, 18.70].map((v) => v + dy);
    for (const x of [9.30, 10.16]) for (const y of rows) rod(K.prop, [x, y, -2.045], [x, y, -0.367], 0.024, 4.7, 6.6);
    for (const y of rows) bx(K.timber, n[0] + 0.005, y - 0.025, n[2] - 0.005, y + 0.025, -0.367, -0.267, 4.75, 6.6);
    const x0 = n[0] + 0.005, w = (n[2] - n[0] - 0.01) / 4;
    for (let i = 0; i < 4; i++) bx(K.ply, x0 + w * i, n[1] + 0.005, x0 + w * (i + 1), n[3] - 0.005, -0.268, -0.252, 4.8 + 0.08 * i, 6.6);
    const a = h[0] + 0.005, b = h[1] + 0.005, c = h[2] - 0.005, d = h[3] - 0.005, p = 0.016;
    for (const r of [[a, b, a + p, d], [c - p, b, c, d], [a + p + 0.001, b, c - p - 0.001, b + p], [a + p + 0.001, d - p, c - p - 0.001, d]]) bx(K.ply, ...r, -0.252, -0.002, 4.95, 6.15);
  }
  // ---- armado de la tapa: #3 @ 0.15 en ambos sentidos (cortado a 0.03 del hueco) y un bastón de 1.20 m por lado del hueco, a 0.06
  {
    const T = [8.81, 16.98 + dy, 10.65, 19.22 + dy], cx = (h[0] + h[2]) / 2, cy = (h[1] + h[3]) / 2;
    const stp = (a, b) => { const l = []; for (let v = a; v <= b + 1e-9; v += 0.15) l.push(v); if (b - l[l.length - 1] > 0.07) l.push(b); return l; };
    for (const y of stp(T[1], T[3])) for (const [xa, xb] of y > h[1] && y < h[3] ? [[T[0], h[0] - 0.03], [h[2] + 0.03, T[2]]] : [[T[0], T[2]]]) rod(K.rebar, [xa, y, -0.20], [xb, y, -0.20], 0.008, 5.25, 5.75);
    for (const x of stp(T[0], T[2])) for (const [ya, yb] of x > h[0] && x < h[2] ? [[T[1], h[1] - 0.03], [h[3] + 0.03, T[3]]] : [[T[1], T[3]]]) rod(K.rebar, [x, ya, -0.188], [x, yb, -0.188], 0.008, 5.35, 5.75);
    for (const y of [h[1] - 0.06, h[3] + 0.06]) rod(K.rebar, [cx - 0.6, y, -0.20], [cx + 0.6, y, -0.20], 0.008, 5.25, 5.75);
    for (const x of [h[0] - 0.06, h[2] + 0.06]) rod(K.rebar, [x, cy - 0.6, -0.188], [x, cy + 0.6, -0.188], 0.008, 5.35, 5.75);
  }
  // ---- registro: tapa provisional de triplay mientras la obra, tapa definitiva de acero con dos ranuras al final
  bx(K.ply, 9.28, 18.15 + dy, 10.18, 19.05 + dy, 0.001, 0.019, 6.2, 28.6);
  bx(K.steel, 9.30, 18.17 + dy, 10.16, 19.03 + dy, 0.005, 0.017, 28.7, 0);
  for (const x of [9.50, 9.96]) bx(K.ink, x - 0.06, 18.59 + dy, x + 0.06, 18.61 + dy, 0.0165, 0.0175, 28.7, 0);
  mk(K.white, R.white, false); mk(K.pl, R.blinding, false); mk(K.rebar, R.rebar, true); mk(K.ply, R.ply, true); mk(K.timber, R.timber, true);
  mk(K.ink, R.ink, false); mk(K.pol, R.concPol, false); mk(K.prop, R.prop, true); mk(K.steel, R.steel, true);
}

// ---------------------------------------------------------------- bajo el firme: drenaje, plástico, malla, poliducto y fronteras
// Lo que una cimentación lleva entre el relleno y el colado del firme, en su orden y con el frente del firme (FIRME: del jardín a la calle):
//   1. drenaje sanitario de PVC en zanja (DREN: colector, ramales, bajadas y registros); la zanja la abre y la tapa el terreno (buildLand)
//   2. barrera de vapor: polietileno negro en tiras de 3 m que se desenrollan sobre el relleno, con traslape de 15 cm y cinta
//   3. malla electrosoldada 6x6-10/10 calzada 4.5 cm sobre el plástico, y poliducto naranja amarrado encima
//   4. fronteras de madera en el borde del firme
// Todo es solo de la obra real y sale cuando el firme lo cubre. Alturas: relleno -0.10, plástico -0.094, malla -0.05, firme 0.
function firmeKit(group, R) {
  const { newAcc, box, frustum, mk } = kitTools(group);
  const K = { poly: newAcc(), tape: newAcc(), roll: newAcc(), mesh: newAcc(), calza: newAcc(), duct: newAcc(), pvc: newAcc(), reg: newAcc(), timber: newAcc(), steel: newAcc() };
  const firmes = casaParts().filter((p) => p.k === 'firme');
  const fOut = (x, y, z) => FIRME(x, z) + 0.11;         // sale cuando el colado ya subió y lo tapó

  // ---- 2. polietileno negro: tiras de 3 m, la orilla de una monta 15 cm sobre la siguiente; el rollo va por delante y se adelgaza
  const wPoly = (xc) => (x, y, z) => 4.36 + 1.3 * Fhat(xc, z);
  let ns = 0;
  for (const p of firmes) for (const [x0, z0, x1, z1] of orthoStrips(p, 3.0)) {
    const xc = (x0 + x1) / 2, y = -0.094 + 0.004 * (ns++ % 2), w = wPoly(xc);
    box(K.poly, x0 - 0.075, y, z0, x1 + 0.075, y + 0.003, z1, w, fOut);
    box(K.tape, x1 - 0.03, y + 0.0035, z0, x1 + 0.03, y + 0.0045, z1, (x, yy, z) => w(x, yy, z) + 0.04, fOut);
    const n = Math.max(1, Math.round((z1 - z0) / 0.4));
    for (let i = 0; i < n; i++) {
      const za = z0 + ((z1 - z0) * i) / n, zb = z0 + ((z1 - z0) * (i + 1)) / n, r = 0.035 + 0.085 * (1 - i / n);
      frustum(K.roll, [x0 + 0.04, y + r, zb + r], [x1 - 0.04, y + r, zb + r], r, r, w(0, 0, za), w(0, 0, zb), 10, true);
    }
  }
  // ---- 3. malla electrosoldada 6x6-10/10: alambre de 4 mm cada 15 cm en los dos sentidos, sobre calzas de concreto cada 90 cm
  const wMesh = (x, y, z) => 4.52 + 1.38 * Fhat(x, z);
  const from = (a, s) => Math.ceil((a + 0.03) / s) * s;
  for (const p of firmes) for (const [x0, z0, x1, z1] of orthoStrips(p, 0)) {
    for (let z = from(z0, 0.15); z < z1 - 0.03; z += 0.15) box(K.mesh, x0 + 0.02, -0.052, z - 0.002, x1 - 0.02, -0.048, z + 0.002, wMesh, fOut);
    for (let x = from(x0, 0.15); x < x1 - 0.03; x += 0.15) box(K.mesh, x - 0.002, -0.048, z0 + 0.02, x + 0.002, -0.044, z1 - 0.02, wMesh, fOut);
    for (let x = from(x0, 0.9); x < x1 - 0.05; x += 0.9) for (let z = from(z0, 0.9); z < z1 - 0.05; z += 0.9) box(K.calza, x - 0.025, -0.0895, z - 0.025, x + 0.025, -0.0525, z + 0.025, (a, b, c) => wMesh(a, b, c) - 0.02, fOut);
  }
  // ---- poliducto naranja de 3/4": del tablero (muro de la cochera junto al vestíbulo) al comedor, a la isla de la cocina y al estudio; las puntas suben 30 cm
  const P3 = (x, y, h) => [x - CX, h, y - CZ];
  const wDuct = (x, y, z) => 4.6 + 1.4 * Fhat(x, z);
  for (const line of [
    [[7.15, 14.05], [7.15, 12.9], [6.3, 12.9], [6.3, 11.2], [1.62, 11.2]],
    [[7.25, 14.05], [7.25, 9.2], [9.6, 6.85], [9.6, 5.7]],
    [[7.35, 14.05], [7.35, 14.6], [5.2, 14.6], [1.62, 14.6]],
  ]) {
    for (let i = 0; i < line.length - 1; i++) frustum(K.duct, P3(...line[i], -0.03), P3(...line[i + 1], -0.03), 0.011, 0.011, wDuct, fOut, 6, false);
    for (const q of [line[0], line[line.length - 1]]) frustum(K.duct, P3(...q, -0.03), P3(...q, 0.30), 0.011, 0.011, wDuct, 24.6, 6, true);
  }
  // ---- 1. drenaje: tubos de PVC en el fondo de la zanja, con campana en cada unión, tubos que suben con tapón y registros de 60 x 60
  const wTubo = (x, y, z) => DREN.tubo(Fhat(x, z));
  for (const [x0, y0, x1, y1, r] of DREN.lines) {
    const h = DREN.yFondo + r + 0.004, len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(len / 3));
    frustum(K.pvc, P3(x0, y0, h), P3(x1, y1, h), r, r, wTubo, 6.4, 12, true);
    for (let i = 0; i <= n; i++) {   // campanas: una cada tramo de 3 m y en los extremos
      const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, dx = ((x1 - x0) / len) * 0.07, dy = ((y1 - y0) / len) * 0.07;
      frustum(K.pvc, P3(x - dx, y - dy, h), P3(x + dx, y + dy, h), r + 0.009, r + 0.009, wTubo, 6.4, 12, true);
    }
  }
  for (const [x, y, r] of DREN.stubs) {
    const h = DREN.yFondo + r + 0.004, w = DREN.tubo(Fhat(x - CX, y - CZ)) + 0.03;
    frustum(K.pvc, P3(x, y, h), P3(x, y, 0.30), r, r, w, 24.6, 12, false);
    frustum(K.pvc, P3(x, y, 0.27), P3(x, y, 0.315), r + 0.008, r + 0.008, w, 24.6, 12, true);   // tapón
  }
  for (const [x, y] of DREN.reg) {
    const [cx, , cz] = P3(x, y, 0), w = DREN.tubo(Fhat(cx, cz)) - 0.03, a = 0.30, t = 0.08, y0 = DREN.yFondo - 0.01, y1 = -0.004;
    box(K.reg, cx - a, y0, cz - a, cx - a + t, y1, cz + a, w, 0); box(K.reg, cx + a - t, y0, cz - a, cx + a, y1, cz + a, w, 0);
    box(K.reg, cx - a + t, y0, cz - a, cx + a - t, y1, cz - a + t, w, 0); box(K.reg, cx - a + t, y0, cz + a - t, cx + a - t, y1, cz + a, w, 0);
    box(K.steel, cx - 0.26, 0.005, cz - 0.26, cx + 0.26, 0.016, cz + 0.26, 28.7, 0);   // tapa definitiva, con el piso de la cochera
  }
  // ---- 4. fronteras del firme: tabla de 2.5 x 5 cm por fuera del borde (solo donde afuera no hay más firme) y estacas cada 1.2 m
  const onFirme = (x, z) => firmes.some((p) => inPoly(x, z, p.outer) && !p.holes.some((h) => inPoly(x, z, h)));
  const wFr = (x, y, z) => 4.5 + 1.38 * Fhat(x, z), oFr = (x, y, z) => FIRME(x, z) + 0.5;
  for (const p of firmes) for (const poly of [p.outer, ...p.holes]) for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 0.6));
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n, mx = ax + (bx - ax) * (t0 + t1) / 2, mz = az + (bz - az) * (t0 + t1) / 2;
      // el lado de afuera es el que no cae en ningún firme
      const sg = [1, -1].find((g) => !onFirme(mx - uz * 0.06 * g, mz + ux * 0.06 * g) && onFirme(mx + uz * 0.06 * g, mz - ux * 0.06 * g));
      if (!sg) continue;
      const nx = -uz * sg, nz = ux * sg;
      // caja entre dos distancias al borde (d0, d1), a lo largo del tramo
      const slab = (d0, d1, u0, u1) => {
        const xa = ax + (bx - ax) * u0, za = az + (bz - az) * u0, xb = ax + (bx - ax) * u1, zb = az + (bz - az) * u1;
        const X = [xa + nx * d0, xa + nx * d1, xb + nx * d0, xb + nx * d1], Z = [za + nz * d0, za + nz * d1, zb + nz * d0, zb + nz * d1];
        return [Math.min(...X), Math.min(...Z), Math.max(...X), Math.max(...Z)];
      };
      const b = slab(0.006, 0.031, t0, t1); box(K.timber, b[0], -0.036, b[1], b[2], 0.014, b[3], wFr, oFr);
      if (k % 2 === 0) { const tm = (t0 + t1) / 2, dt = 0.02 / len, e = slab(0.033, 0.073, tm - dt, tm + dt); box(K.timber, e[0], -0.03, e[1], e[2], 0.11, e[3], wFr, oFr); }
    }
  }
  mk(K.poly, R.poly, false); mk(K.tape, R.blinding, false); mk(K.roll, R.poly, true); mk(K.mesh, R.galv, false); mk(K.calza, R.blinding, false);
  mk(K.duct, R.cap, false); mk(K.pvc, R.pvc, true); mk(K.reg, R.block, true); mk(K.timber, R.timber, false); mk(K.steel, R.steel, false);
}

// ---------------------------------------------------------------- build it
export async function buildWorld(o, step) {
  const tick = async (p) => { if (step) await step(p); };
  const { R, phone } = o;
  const group = new THREE.Group();
  const realOnly = (main) => ({ main, paper: null, nd: null });

  // la casa: una geometría por material para la obra, líneas jerárquicas para el dibujo
  const ctx = await buildHouse(group, R, o.samples || [], tick, phone);
  ctx.samples = o.samples || [];
  foundationKit(group, R, ctx.samples, ctx.obra);
  cisternKit(group, R);
  firmeKit(group, R);
  await tick(0.2);

  // obra falsa: puntales y cimbra
  for (const E of PROPS) {
    const g = propsGeo(E, ctx);
    if (g.posts) addMesh(group, g.posts, { main: R.prop, paper: DM.paper, nd: DM.ndProp });
    if (g.deck) addMesh(group, g.deck, { main: R.ply, paper: DM.paper, nd: DM.ndProp });
  }

  { const sc = scaffoldGeo(); addMesh(group, sc.tubes, { main: R.galv, paper: null, nd: null }); addMesh(group, sc.boards, { main: R.timber, paper: null, nd: null }); }

  await tick(0.4);
  // el terreno plano, con cepas
  for (const m of buildLand(o, R)) group.add(m);

  await tick(0.7);
  // montón de tierra fuera del lote, al poniente de la calle
  {
    const hs = phone ? 0.25 : 0.15, n = Math.ceil(HEAP[2] * 2.2 / hs);
    const g = new THREE.PlaneGeometry(HEAP[2] * 2.2, HEAP[2] * 2.2 / 1.25, n, Math.round(n / 1.25)); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) + HEAP[0], z = p.getZ(i) + HEAP[1], h = heapH(x, z); p.setXYZ(i, x, h > 0.01 ? h + 0.015 : -0.08, z); }
    g.computeVertexNormals();
    stamp(g, (x, y, z) => 0.5 + 1.5 * clamp(1 - Math.hypot(x - HEAP[0], z - HEAP[1]) / HEAP[2], 0, 1), 4.6);
    const m = addMesh(group, g, realOnly(R.soil)); m.castShadow = true;
  }

  await tick(0.82);

  // luz de relleno bajo la losa de la cochera (sin sombras), para que no quede negra
  { const L = new THREE.PointLight(0xffe6c8, 11, 8.5, 1.6); L.position.set(9.75 - CX, 2.2, 16.9 - CZ); group.add(L); }

  // árboles alrededor del lote
  const trees = [];
  for (let z = -22; z <= 15; z += 3.5) trees.push(['cypress', -15 + Math.sin(z) * 0.6, z + (rnd() - 0.5), 0]);
  for (const t of [
    ['olive', -6, -23, 0], ['olive', -24, 4, 0], ['olive', 30, -17, 0], ['olive', 33, -10.5, 0],
    ['olive', 34, 13, 0], ['olive', -12, 19, 0], ['olive', 40, 2, 0], ['round', -22, -12, 0],
    ['olive', 46, -24, 0], ['olive', 52, 10, 0],
    // dos olivos en el jardín (plano (1.3, 1.2) y (0.75, 13.5)), fuera del recorrido de la cámara; aparecen con el pasto
    ['olive', 1.3 - CX, 0.9 - CZ, 34.6], ['olive', 0.4 - CX, 13.5 - CZ, 35.0, 0.4],
  ]) trees.push(t);
  const leafK = phone ? 0.55 : 1;
  let ti = 0;
  for (const [kind, x, z, wIn, sc] of trees) {
    if (++ti % 12 === 0) await tick(0.85 + 0.15 * ti / trees.length);
    const y = natural(x, z), t = new THREE.Group();
    if (kind === 'cypress') {
      const h = 0.85 + rnd() * 0.35;
      const c = canopy([[0, 0, 0, 0.72, 3.3 * h, 0.72, Math.round(420 * leafK)]], 0.11, 0.19); stamp(c, wIn); addMesh(t, c, realOnly(R.leafDark));
      const tr = new THREE.CylinderGeometry(0.1, 0.15, 1.5, 8); tr.translate(0, 0.75, 0); stamp(tr, wIn); addMesh(t, tr, realOnly(R.bark));
      t.children[0].position.y = 3.5 * h + 0.45;
    } else {
      const olive = kind === 'olive';
      const tr = new THREE.CylinderGeometry(0.11, 0.22, 2.4, 8); tr.rotateZ(olive ? 0.16 : 0.04); tr.translate(0, 1.2, 0);
      const br1 = new THREE.CylinderGeometry(0.05, 0.1, 1.6, 6); br1.rotateZ(-0.65); br1.translate(0.3, 2.35, 0);
      const br2 = new THREE.CylinderGeometry(0.04, 0.09, 1.4, 6); br2.rotateZ(0.55); br2.rotateY(1.2); br2.translate(-0.25, 2.25, 0.2);
      const tg = merge([tr, br1, br2]); stamp(tg, wIn); addMesh(t, tg, realOnly(R.bark));
      const cl = olive
        ? [[-0.4, 0, 0, 1.7, 0.9, 1.5, 380], [0.9, 0.4, 0.3, 1.2, 0.72, 1.1, 220], [-0.2, 0.82, -0.4, 1.1, 0.62, 1.1, 180]]
        : [[0, 0, 0, 1.8, 1.6, 1.7, 500], [0.5, 0.85, 0.3, 1.2, 0.95, 1.1, 220]];
      const c = canopy(cl.map((q) => [...q.slice(0, 6), Math.round(q[6] * leafK)]), olive ? 0.09 : 0.11, olive ? 0.17 : 0.20); stamp(c, wIn);
      addMesh(t, c, realOnly(olive ? R.olive : R.leaf)); t.children[1].position.y = olive ? 3.0 : 3.6;
    }
    t.position.set(x, y - 0.05, z); t.rotation.y = rnd() * 6.28; if (sc) t.scale.setScalar(sc); group.add(t);
  }
  return group;
}

// ---------------------------------------------------------------- el terreno, plano y con cepas
// Una rejilla fina alrededor del lote; cada celda es cepa, huella de la casa o exterior, y lleva su historia como tramos
// de altura {y, a, b, m}: de la semana a a la b está a la altura y. Entre celdas vecinas con alturas distintas se levantan caras
// verticales. Para el dibujo se hace otra copia en que el relleno llega más tarde, para que la lámina 01 (semana 5) siga mostrando las cepas.
const INF = 1e9;
// drenaje sanitario bajo el firme, en PLANO: colector de 4" pegado al muro oriente (corre por dentro de su cepa, sobre la zapata) hasta la calle,
// ramales de la cocina, el lavado, el medio baño y el baño del estudio, bajadas de los baños de planta alta y dos registros en la cochera.
// lines [x0, y0, x1, y1, radio]; stubs [x, y, radio] (tubo que sube 30 cm sobre el firme con tapón); reg [x, y] (registro de 60 x 60)
const DREN = {
  lines: [[11.75, 1.0, 11.75, 19.9, 0.055], [9.9, 5.36, 11.75, 5.36, 0.03], [10.4, 7.67, 11.75, 7.67, 0.03], [9.9, 12.8, 12.1, 12.8, 0.055],
    [2.25, 17.4, 2.25, 19.0, 0.055], [2.25, 19.0, 11.75, 19.0, 0.055], [11.75, 1.0, 12.1, 1.0, 0.055], [11.75, 17.0, 12.1, 17.0, 0.055]],
  stubs: [[9.9, 5.36, 0.03], [10.4, 7.67, 0.03], [9.9, 12.8, 0.055], [2.25, 17.4, 0.055], [12.1, 1.0, 0.055], [12.1, 12.8, 0.055], [12.1, 17.0, 0.055]],
  reg: [[11.75, 14.9], [11.75, 19.0]],
  yFondo: -0.55,                                    // fondo de zanja = primera capa de relleno de las cepas
  zanja: (F) => 3.62 + 1.2 * F, tubo: (F) => 4.02 + 1.2 * F, tapa: (F) => 4.26 + 1.2 * F,   // semanas: se abre la zanja, llega el tubo, se tapa
};
// zanjas de 40 cm en mundo [x0, z0, x1, z1]
const ZANJAS = DREN.lines.map(([x0, y0, x1, y1]) => [Math.min(x0, x1) - 0.2 - CX, Math.min(y0, y1) - 0.2 - CZ, Math.max(x0, x1) + 0.2 - CX, Math.max(y0, y1) + 0.2 - CZ]);
// polígono ortogonal ampliado d metros hacia afuera (esquinas a inglete)
function growPoly(poly, d) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length]; a += x0 * z1 - x1 * z0; }
  const sg = a > 0 ? 1 : -1, n = poly.length;
  const nrm = (p, q) => { const ex = q[0] - p[0], ez = q[1] - p[1], l = Math.hypot(ex, ez) || 1; return [sg * ez / l, -sg * ex / l]; };
  return poly.map((p, i) => {
    const n1 = nrm(poly[(i + n - 1) % n], p), n2 = nrm(p, poly[(i + 1) % n]), k = d / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k];
  });
}
// líneas de rejilla: uniformes más las especiales (nunca se quitan); se quitan las uniformes a menos de 3 cm de una especial
function gridLines(a, b, step, special) {
  const sp = [...special.filter((v) => v > a && v < b), a, b].sort((p, q) => p - q).filter((v, i, l) => !i || v - l[i - 1] > 0.004);
  const uni = [];
  for (let v = a; v <= b + 1e-9; v += step) if (!sp.some((s) => Math.abs(s - v) < 0.03)) uni.push(v);
  return [...sp, ...uni].sort((p, q) => p - q);
}
function buildLand(o, R) {
  const { phone } = o;
  const step = phone ? 0.5 : 0.25;
  const X0 = -8, X1 = 8, Z0 = -12, Z1 = 12;
  const runs = cimRuns().filter((r) => !r.dropped);
  const huellas = casaParts().filter((p) => p.k === 'firme').map((p) => growPoly(p.outer, 0.02));
  // fosa de la cisterna y su "dentro" (muros exteriores reducidos 2 cm), en mundo
  const fosa = [CIS.fosa[0] - CX, CIS.fosa[1] - CZ, CIS.fosa[2] - CX, CIS.fosa[3] - CZ], dentro = [CIS.dentro[0] - CX, CIS.dentro[1] - CZ, CIS.dentro[2] - CX, CIS.dentro[3] - CZ];
  const inR = (r, x, z) => x > r[0] && x < r[2] && z > r[1] && z < r[3];
  const xs = gridLines(X0, X1, step, [...runs.flatMap((r) => [r.cepa[0], r.cepa[2]]), ...huellas.flatMap((h) => h.map((q) => q[0])), fosa[0], fosa[2], dentro[0], dentro[2], ...ZANJAS.flatMap((r) => [r[0], r[2]])]);
  const zs = gridLines(Z0, Z1, step, [...runs.flatMap((r) => [r.cepa[1], r.cepa[3]]), ...huellas.flatMap((h) => h.map((q) => q[1])), fosa[1], fosa[3], dentro[1], dentro[3], ...ZANJAS.flatMap((r) => [r[1], r[3]])]);
  const nx = xs.length - 1, nz = zs.length - 1;
  // datos fijos de cada celda (por su centro, que es exacto: ninguna celda cruza un borde)
  const cells = [];
  for (let j = 0; j < nz; j++) {
    const row = [], cz = (zs[j] + zs[j + 1]) / 2;
    for (let i = 0; i < nx; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const hu = huellas.some((h) => inPoly(cx, cz, h)), ce = runs.filter((r) => cx >= r.cepa[0] && cx <= r.cepa[2] && cz >= r.cepa[1] && cz <= r.cepa[3]);
      row.push({ hu, ce, zj: ZANJAS.some((r) => inR(r, cx, cz)), pit: inR(dentro, cx, cz) ? 2 : inR(fosa, cx, cz) ? 1 : 0, F: Fhat(cx, cz), W: ce.length ? Math.min(...ce.map((r) => runW(r, cx, cz))) : 0 });
    }
    cells.push(row);
  }
  // historia de una celda: tramos {y, a, b, m}. Cualquier tramo de tierra termina después de 0.55 (los shaders ignoran aOut <= 0.5).
  const history = (c, shift) => {
    const { hu, ce, F, W } = c;
    if (c.pit) {   // fosa de la cisterna: ignora huella y cepas; el anillo se rellena, el dentro queda hueco para la cisterna
      const p = [[0, 'dry', -2], [-1.0, 'clay', 0.55], [CIS.fondoY, 'clay', 0.95]];
      if (c.pit === 1) p.push([-1.45, 'fill', 4.0 + shift], [-0.75, 'fill', 4.3 + shift], [-0.20, 'fill', 4.6 + shift], [-0.10, 'fill', Math.max(4.8, 4.0 + 1.2 * F) + shift]);
      return p.map(([y, m, a], i) => ({ y, m, a, b: i + 1 < p.length ? p[i + 1][2] : INF }));
    }
    const zj = c.zj && !shift;   // la zanja del drenaje solo en la obra: el dibujo no la lleva
    if (!hu && !ce.length && !zj) return [{ y: 0, a: -2, b: INF, m: 'dry' }];
    const D = 0.55 + 0.5 * F;
    let st;
    if (!ce.length && !hu) st = [[0, 'dry', -2], [DREN.yFondo, 'clay', DREN.zanja(F)], [0, 'soil', DREN.tapa(F)]];
    else if (!ce.length) st = zj ? [[0, 'dry', -2], [-0.20, 'soil', D], [DREN.yFondo, 'clay', DREN.zanja(F)], [-0.10, 'fill', DREN.tapa(F)]] : [[0, 'dry', -2], [-0.20, 'soil', D], [-0.10, 'fill', 4.0 + 1.2 * F + shift]];
    else {
      const E1 = 0.75 + W, E2 = E1 + 0.15, R1 = 3.75 + W + shift, R2 = zj ? Math.max(4.0 + W, DREN.tapa(F)) : 4.0 + W + shift;   // donde pasa el tubo, la segunda capa espera
      const bardas = ce.every((r) => r.tipo === 'barda'), yF = Math.min(...ce.map((r) => r.yFondo));
      st = [[0, 'dry', -2]];
      if (hu && D < E1) st.push([-0.20, 'soil', D]);
      st.push([bardas ? -0.35 : -0.50, 'clay', E1], [yF, 'clay', E2], [bardas ? -0.35 : -0.55, 'fill', R1], hu ? [-0.10, 'fill', R2] : [0, 'soil', R2]);
    }
    return st.map(([y, m, a], i) => ({ y, m, a, b: i + 1 < st.length ? st[i + 1][2] : INF }));
  };
  const keyOf = (h) => h.map((s) => s.y + ',' + s.a.toFixed(3) + ',' + (s.b >= INF ? 'i' : s.b.toFixed(3)) + ',' + s.m).join(';');
  const at = (h, t) => { for (const s of h) if (t >= s.a && t < s.b) return s; return h[h.length - 1]; };

  const build = (shift) => {
    const B = {};
    const bucket = (m) => B[m] || (B[m] = { pos: [], nor: [], uv: [], wk: [], out: [], idx: [] });
    // aOut = 0 significa "nunca sale"; los shaders ignoran aOut <= 0.5, así que ningún tramo termina antes de 0.51
    const quad = (m, pts, n, uvs, w0, w1) => {
      const b = bucket(m), base = b.pos.length / 3;
      for (let k = 0; k < 4; k++) { b.pos.push(...pts[k]); b.nor.push(...n); b.uv.push(...uvs[k]); b.wk.push(w0); b.out.push(w1 >= INF ? 0 : Math.max(w1, 0.51)); }
      b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const H = cells.map((row) => row.map((c) => history(c, shift))), K = H.map((row) => row.map(keyOf));
    for (let j = 0; j < nz; j++) {
      const za = zs[j], zb = zs[j + 1];
      // fusión por filas: las celdas contiguas en x con la misma historia son un solo quad
      for (let i = 0; i < nx;) {
        let e = i; while (e + 1 < nx && K[j][e + 1] === K[j][i]) e++;
        const xa = xs[i], xb = xs[e + 1];
        for (const s of H[j][i]) quad(s.m, [[xa, s.y, za], [xa, s.y, zb], [xb, s.y, zb], [xb, s.y, za]], [0, 1, 0], [[xa, za], [xa, zb], [xb, zb], [xb, za]], s.a, s.b);
        i = e + 1;
      }
      for (let i = 0; i < nx; i++) {
        const xa = xs[i], xb = xs[i + 1];
        // caras verticales hacia el vecino de la derecha (x) y de atrás (z)
        for (const [ni, nj, axis] of [[i + 1, j, 0], [i, j + 1, 1]]) {
          if (ni >= nx || nj >= nz || K[nj][ni] === K[j][i]) continue;
          const A = H[j][i], N = H[nj][ni];
          const cuts = [...new Set([...A, ...N].flatMap((s) => [s.a, s.b]).filter((v) => v > -2 && v < INF))].sort((p, q) => p - q);
          const edges = [-2, ...cuts, INF];
          for (let e = 0; e < edges.length - 1; e++) {
            const t0 = edges[e], t1 = edges[e + 1], tm = t1 >= INF ? t0 + 1 : (t0 + t1) / 2;
            const sa = at(A, tm), sn = at(N, tm);
            if (Math.abs(sa.y - sn.y) < 1e-4) continue;
            const lowIsA = sa.y < sn.y, yLo = Math.min(sa.y, sn.y), yHi = Math.max(sa.y, sn.y);
            const m = sa.m === 'clay' || sn.m === 'clay' ? 'clay' : sa.m === 'fill' || sn.m === 'fill' ? 'fill' : 'soil';
            let pts, n, uvs;
            if (axis === 0) {   // plano x = xb, de za a zb; la cara mira hacia la celda más baja
              pts = [[xb, yLo, za], [xb, yHi, za], [xb, yHi, zb], [xb, yLo, zb]]; n = [1, 0, 0];
              if (lowIsA) { pts.reverse(); n = [-1, 0, 0]; }
              uvs = pts.map((q) => [q[2], q[1]]);
            } else {            // plano z = zb, de xa a xb
              pts = [[xa, yLo, zb], [xb, yLo, zb], [xb, yHi, zb], [xa, yHi, zb]]; n = [0, 0, 1];
              if (lowIsA) { pts.reverse(); n = [0, 0, -1]; }
              uvs = pts.map((q) => [q[0], q[1]]);
            }
            quad(m, pts, n, uvs, t0, t1);
          }
        }
      }
    }
    const out = {};
    for (const k in B) {
      const b = B[k], g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2)); g.setAttribute('aWeek', new THREE.Float32BufferAttribute(b.wk, 1));
      g.setAttribute('aOut', new THREE.Float32BufferAttribute(b.out, 1)); g.setIndex(b.idx);
      out[k] = g;
    }
    return out;
  };

  const out = [];
  // la obra: terreno de verdad
  const real = build(0);
  for (const k of ['dry', 'soil', 'clay', 'fill']) if (real[k]) out.push(landMesh(real[k], R[k], false, false));
  // exterior lejano: cuatro lienzos de pasto seco hasta el horizonte
  {
    const E = 1800, list = [];
    for (const [a, b, c, d] of [[-E, -E, E, Z0], [-E, Z1, E, E], [-E, Z0, X0, Z1], [X1, Z0, E, Z1]]) {
      const g = new THREE.PlaneGeometry(c - a, d - b); g.rotateX(-Math.PI / 2);
      const p = g.attributes.position, uv = [];
      for (let i = 0; i < p.count; i++) { p.setXYZ(i, p.getX(i) + (a + c) / 2, 0, p.getZ(i) + (b + d) / 2); uv.push(p.getX(i), p.getZ(i)); }
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); list.push(g);
    }
    const g = stamp(merge(list), -2, 0);
    const m = new THREE.Mesh(g, R.dry); m.userData.sets = { main: R.dry, paper: null, nd: null }; m.receiveShadow = true; m.customDepthMaterial = DEPTH_WEEKLY; m.frustumCulled = false; out.push(m);
  }
  // el dibujo: el relleno llega tarde, para que la lámina 01 conserve las cepas
  const drawn = build(1.3);
  if (drawn.dry) out.push(landMesh(drawn.dry, null, false, true));
  const dn = [drawn.soil, drawn.clay, drawn.fill].filter(Boolean);
  if (dn.length) out.push(landMesh(merge(dn), null, true, true));

  // bloque de terreno con rayado de corte (solo en el dibujo)
  {
    const [bx0, bz0, bx1, bz1] = [U.uBlock.value.x, U.uBlock.value.y, U.uBlock.value.z, U.uBlock.value.w], yb = -1.8, s = 0.5, list = [];
    const side = (pts) => {
      const pos = [], idx = [];
      pts.forEach(([x, z], i) => { pos.push(x, 0, z, x, yb, z); if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); } });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      stamp(g, -1.3); list.push(g);
    };
    const run = (a, b, f) => { const p = []; for (let t = a; t <= b + 1e-6; t += s) p.push(f(t)); return p; };
    side(run(bx0, bx1, (x) => [x, bz0])); side(run(bx0, bx1, (x) => [x, bz1])); side(run(bz0, bz1, (z) => [bx0, z])); side(run(bz0, bz1, (z) => [bx1, z]));
    const m = new THREE.Mesh(merge(list), DM.hatch); m.userData.sets = { main: null, paper: DM.hatch, nd: DM.ndHatch }; m.frustumCulled = false; out.push(m);
  }
  return out;
}
function landMesh(g, mat, tint, draw) {
  const m = new THREE.Mesh(g, mat || DM.land);
  m.userData.sets = mat ? { main: mat, paper: null, nd: null } : { main: null, paper: tint ? DM.landNew : DM.land, nd: DM.ndLand };
  m.receiveShadow = !!mat; m.castShadow = !!mat;
  if (mat) m.customDepthMaterial = DEPTH_WEEKLY;
  m.frustumCulled = false; return m;
}

// montón de tierra (fuera del lote, al poniente de la calle)
const HEAP = [-9.3, 13.2, 3.0, 1.7];
function heapH(x, z) {
  const d = Math.hypot((x - HEAP[0]) * 1.0, (z - HEAP[1]) * 1.25) / HEAP[2];
  if (d >= 1) return 0;
  const k = Math.cos(d * Math.PI / 2); return HEAP[3] * k * k * (1 + 0.12 * (noise2(x * 1.3, z * 1.3) - 0.5)) * Math.min(1, (1 - d) * 6);
}
