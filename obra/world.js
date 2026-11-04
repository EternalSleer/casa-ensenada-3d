// Basado en flat-to-3d/04-build-time-lapse de Sam Aing (MIT), ver LICENSE-flat-to-3d.txt.
// El mundo: una casa como lista de partes, cada una con la semana en que se construye, sobre un terreno plano que se excava,
// se rellena y se planta con el mismo calendario. Todo lo que se dibuja (la hoja) y todo lo que se renderiza (la obra)
// lee las semanas de aquí. Una parte aparece cuando llega su semana: un solo uniforme, uNow, construye la casa.
// Las partes de la casa salen de casa.js (el bloque de arquitectura copiado de index.html); aquí solo se les pone semana.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { casaParts, CX, CZ, cimRuns, Fhat, runW, rectOf, ovl, subtractIv } from './casa.js';

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- el programa
export const { WEEKS, PROG, TILES } = window.SEQ;
// fases de las 6 láminas (coherentes con TILES de programme.js)
export const PHASE = { 1: [0, 5], 2: [5, 10], 3: [10, 13], 4: [13, 16], 5: [16, 23], 6: [23, 40] };

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

  // laja de piedra seca (revestimiento de la barda y del andador): piedras poligonales finas de 12–30 cm (Voronoi con junta oscura), repite cada 1.2 m
  T.laja = canvasTex(512, 1.2, (g, s) => {
    const cols = [[143, 135, 123], [160, 151, 137], [179, 169, 153], [152, 144, 131], [168, 158, 143]];
    const NX = 9, NY = 12, sites = [];
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) sites.push({ x: (i + 0.15 + rnd() * 0.7) / NX * s, y: (j + 0.15 + rnd() * 0.7) / NY * s, c: cols[Math.floor(rnd() * cols.length)], v: 0.9 + rnd() * 0.2 });
    const im = g.createImageData(s, s), d = im.data, px = s / 120;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      let d1 = 1e9, d2 = 1e9, b = null;
      for (const st of sites) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const dx = x - (st.x + ox * s), dy = y - (st.y + oy * s), q = dx * dx + dy * dy;
        if (q < d1) { d2 = d1; d1 = q; b = st; } else if (q < d2) d2 = q;
      }
      const e = Math.sqrt(d2) - Math.sqrt(d1), i = (y * s + x) * 4;
      const joint = Math.min(1, e / (1.1 * px)), shade = 0.86 + 0.14 * joint;
      const f = b.v * (0.55 + 0.45 * joint) * (1 - 0.18 * Math.min(1, Math.sqrt(d1) / (22 * px)));
      d[i] = Math.min(255, b.c[0] * f * shade + 8); d[i + 1] = Math.min(255, b.c[1] * f * shade + 6); d[i + 2] = Math.min(255, b.c[2] * f * shade + 4); d[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  });
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
  // Industrial heavy machinery finish: weathered ochre-yellow with panel seams & grime
  T.machine = canvasTex(512, 1.6, (g, s) => {
    const a = fbm(s, 6, 3);
    ramp(g, s, (i) => clamp(0.5 + (a[i] - 0.5) * 0.35, 0, 1), [204, 142, 22], [222, 160, 30], [235, 176, 44], 8);
    g.strokeStyle = 'rgba(40,32,18,0.28)'; g.lineWidth = 2;
    g.strokeRect(12, 12, s - 24, s - 24);
    g.beginPath(); g.moveTo(0, s * 0.5); g.lineTo(s, s * 0.5); g. moveTo(s * 0.5, 0); g.lineTo(s * 0.5, s); g.stroke();
  });
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
  // Welded wire Heras fencing mesh
  T.wire = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
    g.clearRect(0, 0, 64, 128); g.fillStyle = '#c4c7c4';
    for (let x = 0; x < 64; x += 32) g.fillRect(x, 0, 2.5, 128);
    for (let y = 0; y < 128; y += 16) g.fillRect(0, y, 64, 2.5);
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
export function weekly(m, o = {}) { m.onBeforeCompile = o.wet ? WEEKLY_WET : WEEKLY; m.customProgramCacheKey = () => (o.wet ? 'weekly-wet' : 'weekly'); return m; }
export const DEPTH_WEEKLY = weekly(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));

export function makeMaterials(T, env) {
  ENV = env;
  const R = {
    concFresh: std({ map: T.concFresh, bumpMap: T.concBump, bumpScale: 0.012, roughness: 0.82 }),
    conc: std({ map: T.conc, bumpMap: T.concBump, bumpScale: 0.015, roughness: 0.78 }),
    oak: std({ map: T.oak, bumpMap: T.oakBump, bumpScale: 0.008, roughness: 0.42, envMapIntensity: 0.52 }),
    floorL: std({ map: T.travertine, roughness: 0.5 }),
    plaster: std({ color: 0xede8df, roughness: 0.92 }),
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
    // fachada principal: concreto aparente claro, laja de piedra seca, listones de madera y tira LED
    concAp: std({ map: T.conc, color: 0xd0d0cf, roughness: 0.7 }),
    laja: std({ map: T.laja, bumpMap: T.concBump, bumpScale: 0.03, roughness: 0.85 }),
    fins: std({ map: T.oak, color: 0xb8875a, roughness: 0.55 }),
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
    yellow: std({ map: T.machine, bumpMap: T.concBump, bumpScale: 0.004, roughness: 0.38, metalness: 0.22, envMapIntensity: 0.65 }),
    dark: std({ color: 0x383b3f, roughness: 0.46, metalness: 0.42, envMapIntensity: 0.65 }),
    rubber: std({ color: 0x2a2b2d, roughness: 0.65, metalness: 0.35, envMapIntensity: 0.45 }),
    chrome: std({ color: 0xe6e8ea, metalness: 0.98, roughness: 0.12, envMapIntensity: 1.2 }),
    cabGlass: new THREE.MeshBasicMaterial({ color: 0x8cb0bd, envMap: env, combine: THREE.MixOperation, reflectivity: 0.45, transparent: true, opacity: 0.34, depthWrite: false }),
    beacon: std({ color: 0xff6d00, emissive: 0xf0500f, emissiveIntensity: 0.6, roughness: 0.2 }),
    rebar: std({ color: 0x563826, roughness: 0.7, metalness: 0.38 }),
    cap: std({ color: 0xf0500f, roughness: 0.45 }),
    timber: std({ map: T.oak, color: 0xc8a276, roughness: 0.85 }),
    galv: std({ color: 0xc4c6c4, metalness: 0.62, roughness: 0.42, envMapIntensity: 0.45 }),
    wire: std({ map: T.wire, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.48 }),
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
  for (const k in R) weekly(R[k], { wet: k === 'conc' });
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

function partWeeks(p) {
  if (p.wk) return p.wk;   // zapatas y contratrabes traen su semana (tramos a lo largo del eje, casa.js)
  switch (p.k) {
    case 'firme': return (x, y, z) => 4.6 + 1.6 * Fhat(x, z);
    case 'slab': return p.lvl === 1 ? aff(11.2, 1.4) : p.lvl === 2 ? aff(17.0, 1.2) : aff(21.6, 0.9);
    case 'stair': return p.st === 2 ? aff(16.6, 0, 0.5, 2.8, 2.8) : aff(13.4, 0, 0.5, 0, 2.8);
    case 'barda': return aff(8.4, 1.4, 0.2, 0, 2.4);
    case 'struct':
      if (p.lvl === 0) return aff(6.2, 3.2, 0.5, 0, 2.55);
      if (p.lvl === 1) return aff(13.2, 2.6, 0.4, 2.55, 2.8);
      return p.b[4] <= 6.85 ? aff(20.6, 0.8, 0.1, 5.6, 1.2) : aff(19.0, 2.0, 0.3, 5.6, 2.35);   // pretiles / muros de la terraza
    case 'columna': return aff(20.6, 0.8);
    case 'frame': case 'glass':
      if (p.lvl === 0) return aff(23.0, 1.6);
      if (p.lvl === 1) return aff(24.2, 1.4);
      return p.b[4] <= 6.75 ? aff(25.8, 0.6) : aff(25.2, 1.2);   // barandal de vidrio / cancelería de la terraza
    case 'pergola': return aff(25.5, 1.0);
    case 'dframe': return aff(27.0, 1.0);
    case 'fachada': {
      const t = p.b[1] >= 5;
      switch (p.m) {
        case 'plaster': return t ? aff(17.4, 0.8) : aff(16.2, 0.6);
        case 'concAp': return p.b[1] >= 5 ? aff(21.6, 0.6) : (p.b[1] >= 2 && p.b[2] < 9) ? aff(16.0, 0.6) : p.b[1] >= 2 ? aff(12.4, 0.6) : aff(9.4, 0.6);
        case 'laja': return aff(28.0, 1.2);
        case 'fins': case 'dark': return aff(26.0, 0.8);
        case 'steel': return aff(25.0, 0.8);
        case 'led': return aff(27.4, 0.4);
      }
      return aff(28.0, 0.8);
    }
    case 'gate': { const w = p.g === 'cochera' ? 28.5 : 28.8; return () => w; }
  }
  const [a, b] = PHASE[Math.min(6, p.lvl + 2)] || [0, 40];
  return () => a + (b - a) * 0.5;
}
// acabados: capa de 2.5 mm sobre la estructura; el bruto desaparece cuando llega el acabado
const FIN = {
  plaster: aff(26.5, 3.0),
  oak: (x, y, z) => (y < 2.5 ? 29.5 + 1.5 * sOf(z) : 30.5 + 1.3 * sOf(z)),
  travertine: aff(31.0, 1.5),
  conc: aff(28.6, 0.4),
  grass: aff(33.0, 2.0),
  water: () => 33,
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
    else if (p.m === 'plaster') {
      emit('block', p, f, p.weeks, (x, y, z) => FIN.plaster(x, y, z) + 0.02);
      emit('plaster', p, f, FIN.plaster, () => 0, 0.0025);
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
const NOSHADOW = new Set(['glass', 'steel', 'plaster', 'oak', 'travertine', 'grass', 'concPol', 'water', 'white', 'led']);
const DRAWN_NF = new Set(['struct', 'barda', 'stair', 'columna', 'zapata', 'contra']);   // línea de peso completo
const DRAWN_FR = new Set(['frame', 'dframe', 'pergola', 'fachada']);                                  // cancelería: línea fina

// pone la casa en `group`; devuelve lo que necesitan los puntales y el terreno
function buildHouse(group, R) {
  const all = casaParts();
  const boxes = all.filter((p) => p.t === 'box'), slabs = all.filter((p) => p.t === 'slab'), floors = all.filter((p) => p.t === 'floor');
  for (const p of [...boxes, ...slabs]) p.weeks = partWeeks(p);
  const real = {}, add = (k, g) => (real[k] || (real[k] = [])).push(g);
  const rb = boxGeos(boxes, 'real');
  for (const k in rb) add(k, rb[k]);
  const paperSlabs = [];
  for (const s of slabs) {
    const g = slabGeo(s);
    paperSlabs.push(stamp(slabGeo(s), s.weeks, 0));
    if (s.m === 'plaster') {
      const lay = offsetGeo(g, 0.0025);
      stamp(g, s.weeks, (x, y, z) => FIN.plaster(x, y, z) + 0.02); stamp(lay, FIN.plaster, 0);
      add('conc', g); add('plaster', lay);
    } else { stamp(g, s.weeks, 0); add('conc', g); }
  }
  // pisos: solo la capa de acabado (la estructura es la losa o el firme)
  for (const f of floors) {
    const y = f.y + (f.m === 'grass' ? 0.004 : 0);
    add(FLOOR_MAT[f.m] || f.m, stamp(floorGeo(f, y), FIN[f.m], 0));
  }
  for (const k in real) {
    if (!R[k]) throw new Error('world.js: falta el material R.' + k);
    addMesh(group, merge(real[k]), { main: R[k], paper: null, nd: null }, { glass: k === 'glass', shadow: !NOSHADOW.has(k) });
  }
  // el dibujo, separado por jerarquía de línea
  const dn = boxGeos(boxes.filter((p) => DRAWN_NF.has(p.k)), 'paper');
  addMesh(group, merge([dn.paper, ...paperSlabs]), { main: null, paper: DM.paper, nd: DM.nd });
  const df = boxGeos(boxes.filter((p) => DRAWN_FR.has(p.k)), 'paper');
  if (df.paper) addMesh(group, df.paper, { main: null, paper: DM.paper, nd: DM.ndFrame });
  return { boxes, slabs };
}

// ---------------------------------------------------------------- obra falsa: puntales telescópicos y cimbra de triplay
// Cada entrada [x0, x1, y0, y1, yb, yt, [semana de llegada], semana de salida]: x e y son del plano (como en index.html),
// yb..yt la altura que apuntalan. La losa de arriba y el apoyo de abajo dan la forma del triplay y dónde puede haber poste.
export const PROPS = [
  [7.2, 12.3, 14.1, 19.7, 0, 2.55, [10.0, 10.8], 18.6],       // cochera, bajo la losa 2.80
  [1.6, 9.0, 8.4, 18.0, 0, 2.55, [10.1, 10.9], 18.8],         // planta baja norte
  [7.7, 12.3, 2.7, 7.0, 0, 2.55, [10.0, 10.6], 18.4],         // cocina
  [1.6, 7.25, 3.85, 8.1, 0, 5.35, [16.0, 16.6], 22.8],        // sala de doble altura: el bosque de 5.35 m
  [1.6, 12.3, 0.2, 19.7, 2.80, 5.35, [16.0, 16.6], 23.0],     // planta alta, bajo la losa 5.60
  [5.8, 12.3, 8.3, 16.3, 5.60, 7.95, [21.0, 21.4], 25.6],     // volumen de la terraza, bajo la azotea
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

function propsGeo(E, ctx) {
  const [px0, px1, py0, py1, yb, yt, wIn, out] = E;
  const x0 = px0 - CX, x1 = px1 - CX, z0 = py0 - CZ, z1 = py1 - CZ;
  const top = ctx.slabs.find((s) => Math.abs(s.y - yt) < 0.03);                       // la losa que se cuela encima
  const sup = yb > 0.01 ? ctx.slabs.find((s) => Math.abs(s.y + s.d - yb) < 0.03) : null;   // la losa donde se apoyan
  const obst = ctx.boxes.filter((b) => !['glass', 'gate', 'zapata', 'contra'].includes(b.k) && b.b[1] < yt - 0.02 && b.b[4] > yb + 0.02);
  const cams = ctx.samples.filter((c) => c.y > yb && c.y < yt);
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
    const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b);
    for (let j = 0; j < Z.length - 1; j++) {
      let a = null;
      for (let i = 0; i < X.length - 1; i++) {
        const ok = onSlab(top, (X[i] + X[i + 1]) / 2, (Z[j] + Z[j + 1]) / 2);
        if (ok) { if (!a) a = X[i]; } else if (a !== null) { ply.push([a, X[i], Z[j], Z[j + 1]]); a = null; }
      }
      if (a !== null) ply.push([a, X[X.length - 1], Z[j], Z[j + 1]]);
    }
  }
  const dk = ply.map(([a, b, c, d]) => { const g = new THREE.BoxGeometry(b - a, 0.02, d - c); g.translate((a + b) / 2, yt - 0.01, (c + d) / 2); return worldUV(g); });
  const posts = list.length ? stamp(worldUV(merge(list)), wk, outw) : null;
  const deck = dk.length ? stamp(merge(dk), wk, outw) : null;
  return { posts, deck };
}

// High-detail 22-tonne Tracked Hydraulic Excavator (Volvo EC220 / CAT 320 architectural grade)
function excavatorGeo(pose) {
  const K = { yellow: [], dark: [], rubber: [], chrome: [], cabGlass: [], beacon: [] };
  const box = (k, w, h, d, x, y, z, rz = 0, ry = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rz) g.rotateZ(rz);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    worldUV(g);
    K[k].push(g);
    return g;
  };
  const cylZ = (k, r, len, x, y, z, seg = 20) => {
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    g.rotateX(Math.PI / 2); g.translate(x, y, z); K[k].push(g);
  };
  const cylY = (k, r0, r1, len, x, y, z, seg = 20) => {
    const g = new THREE.CylinderGeometry(r0, r1, len, seg);
    g.translate(x, y + len / 2, z); K[k].push(g);
  };
  const seg = (k, a, b, w, h0, h1 = h0, x0 = 0, x1 = 0) => {
    const d = b.clone().sub(a), len = d.length(), ang = Math.atan2(d.y, d.x);
    const L = len + x0 + x1;
    const g = new THREE.BoxGeometry(L, 1, w);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = (p.getX(i) + L / 2) / L;
      const h = h0 + (h1 - h0) * u;
      p.setY(i, p.getY(i) * h);
    }
    g.computeVertexNormals();
    g.translate((len + x1 - x0) / 2, 0, 0);
    g.rotateZ(ang);
    g.translate(a.x, a.y, a.z);
    worldUV(g);
    K[k].push(g);
  };
  const rod = (k, a, b, r, segs = 12) => {
    const d = b.clone().sub(a), len = d.length();
    const g = new THREE.CylinderGeometry(r, r, len, segs);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()));
    g.translate(a.x, a.y, a.z);
    K[k].push(g);
  };

  // 1. Heavy-duty X-frame Undercarriage & Track Assemblies
  for (const s of [-1, 1]) {
    const z = s * 1.28;
    // Track belt core & rounded idler/sprocket ends
    box('rubber', 4.05, 0.84, 0.64, 0, 0.42, z);
    cylZ('rubber', 0.42, 0.64, -2.02, 0.42, z, 24);
    cylZ('rubber', 0.42, 0.64, 2.02, 0.42, z, 24);
    // Final drive planetary hub (rear) & idler hub (front)
    cylZ('dark', 0.30, 0.68, -2.02, 0.42, z, 18);
    cylZ('dark', 0.24, 0.66, 2.02, 0.42, z, 18);
    // Sculpted steel track roller frame & rock guard
    box('dark', 3.65, 0.38, 0.46, 0, 0.45, z);
    box('yellow', 3.3, 0.16, 0.50, 0, 0.62, z);
    box('dark', 3.1, 0.08, 0.54, 0, 0.32, z); // bottom rock guard
    // 7 Bottom track rollers + 2 top carrier rollers
    for (let i = -3; i <= 3; i++) cylZ('dark', 0.12, 0.68, i * 0.52, 0.15, z, 12);
    for (const x of [-0.85, 0.85]) cylZ('dark', 0.10, 0.58, x, 0.74, z, 12);
    // Triple-grouser steel track shoes around top, bottom, and ends
    for (let i = 0; i < 30; i++) {
      const tx = -2.0 + i * 0.138;
      box('dark', 0.09, 0.045, 0.66, tx, 0.85, z);
      box('dark', 0.03, 0.065, 0.66, tx - 0.02, 0.86, z);
      box('dark', 0.03, 0.065, 0.66, tx + 0.02, 0.86, z);
      box('dark', 0.09, 0.035, 0.66, tx, 0.02, z);
    }
    for (let a = 0; a < 8; a++) {
      const ang = -Math.PI / 2 + (a + 0.5) / 8 * Math.PI;
      for (const end of [-1, 1]) {
        const ex = end * 2.02 + end * Math.cos(ang) * 0.43;
        const ey = 0.42 + Math.sin(ang) * 0.43;
        box('dark', 0.04, 0.09, 0.66, ex, ey, z, end * ang);
      }
    }
    // Track tie-down lugs
    box('yellow', 0.14, 0.14, 0.08, 1.55, 0.58, z + s * 0.28);
    box('yellow', 0.14, 0.14, 0.08, -1.55, 0.58, z + s * 0.28);
  }
  // X-frame center carbody & heavy slewing ring
  box('dark', 2.1, 0.34, 2.05, 0, 0.72, 0);
  box('dark', 2.4, 0.24, 0.55, 0, 0.68, 0, 0, 0.62);
  box('dark', 2.4, 0.24, 0.55, 0, 0.68, 0, 0, -0.62);
  cylY('dark', 0.98, 1.02, 0.24, -0.1, 0.88, 0, 32);
  cylY('chrome', 0.94, 0.94, 0.05, -0.1, 1.08, 0, 32);

  // 2. Upper Structure (House), Counterweight, Engine Bay & Catwalks
  // Main chassis deck & anti-slip side catwalks
  box('dark', 3.15, 0.12, 2.58, -0.38, 1.18, 0);
  box('dark', 2.85, 0.05, 0.22, -0.25, 1.24, -1.32); // left catwalk step
  box('dark', 2.85, 0.05, 0.22, -0.25, 1.24, 1.32);  // right catwalk step
  // Sculpted rear counterweight in matte dark grey with lower amber trim
  box('dark', 0.88, 1.18, 2.54, -2.08, 1.82, 0);
  cylZ('dark', 0.59, 2.54, -2.32, 1.82, 0, 24);
  box('yellow', 0.92, 0.24, 2.56, -2.08, 1.36, 0);
  cylZ('yellow', 0.24, 2.56, -2.42, 1.36, 0, 16);
  // Counterweight recessed vents & tow cavity
  box('rubber', 0.15, 0.36, 0.42, -2.86, 1.68, 0);
  box('rubber', 0.12, 0.18, 1.6, -2.84, 2.18, 0);

  // Right-side hydraulic & fuel tanks + engine cowling
  box('yellow', 2.45, 0.98, 1.05, -0.35, 1.73, 0.74);
  box('yellow', 1.55, 0.36, 0.95, -0.05, 2.02, 0.74, -0.18); // sloped front right hood
  box('dark', 0.03, 0.72, 0.08, 0.35, 1.72, 1.27); // hydraulic oil sight glass
  cylY('dark', 0.06, 0.06, 0.08, 0.45, 2.22, 0.85, 12); // fuel cap
  // Center raised engine housing, cooling pack, louvers & exhaust stack
  box('yellow', 1.82, 0.48, 1.52, -0.95, 2.38, 0.22);
  box('dark', 0.75, 0.06, 1.05, -1.05, 2.63, 0.25); // top cooling grille
  for (let i = 0; i < 6; i++) {
    box('dark', 0.55, 0.04, 0.03, -0.95, 1.65 + i * 0.09, 1.27); // side intake louvers
    box('dark', 0.55, 0.04, 0.03, -1.25, 1.65 + i * 0.09, -1.25);
  }
  cylY('dark', 0.11, 0.11, 0.48, -1.15, 2.62, 0.68, 14); // muffler guard
  cylY('chrome', 0.055, 0.055, 0.68, -1.15, 2.62, 0.68, 12); // exhaust pipe
  box('chrome', 0.14, 0.02, 0.14, -1.15, 3.31, 0.68, 0.25); // exhaust rain cap
  // Left rear compartment behind cab
  box('yellow', 1.15, 1.02, 0.96, -1.12, 1.75, -0.76);

  // Safety handrails & mirrors on upper deck
  for (const x of [-1.55, -0.65, 0.25]) rod('dark', V(x, 2.22, 1.22), V(x, 2.72, 1.22), 0.018, 8);
  rod('dark', V(-1.55, 2.72, 1.22), V(0.55, 2.72, 1.22), 0.018, 8);
  rod('dark', V(0.55, 2.72, 1.22), V(0.75, 2.15, 1.22), 0.018, 8);
  rod('dark', V(0.82, 2.1, 1.22), V(0.82, 2.95, 1.22), 0.016, 8);
  box('dark', 0.06, 0.26, 0.16, 0.86, 2.82, 1.26); // right mirror

  // 3. Operator ROPS Cab (Left Side) with full interior detail
  const cx = 0.35, cz = -0.76;
  box('dark', 1.38, 0.14, 0.98, cx, 1.31, cz); // cab floor platform
  // Interior operator seat, armrests, joysticks & monitor
  box('dark', 0.42, 0.22, 0.44, cx - 0.08, 1.48, cz); // seat base
  box('rubber', 0.44, 0.10, 0.46, cx - 0.05, 1.64, cz); // seat cushion
  box('rubber', 0.10, 0.56, 0.44, cx - 0.24, 1.94, cz, 0.15); // seat backrest
  box('rubber', 0.08, 0.18, 0.28, cx - 0.29, 2.30, cz, 0.1); // headrest
  for (const sz of [-0.26, 0.26]) {
    box('dark', 0.34, 0.24, 0.10, cx + 0.06, 1.56, cz + sz); // joystick console
    rod('rubber', V(cx + 0.14, 1.68, cz + sz), V(cx + 0.20, 1.86, cz + sz), 0.018, 8);
  }
  rod('dark', V(cx + 0.44, 1.38, cz - 0.1), V(cx + 0.40, 1.88, cz - 0.1), 0.014, 8); // travel levers
  rod('dark', V(cx + 0.44, 1.38, cz + 0.1), V(cx + 0.40, 1.88, cz + 0.1), 0.014, 8);
  box('dark', 0.08, 0.22, 0.26, cx + 0.46, 1.96, cz - 0.28, -0.3, 0.35); // LCD monitor
  // Cab ROPS structural frame pillars (slender & angled front windshield)
  const pFL0 = V(cx + 0.66, 1.38, cz - 0.46), pFL1 = V(cx + 0.48, 3.08, cz - 0.45);
  const pFR0 = V(cx + 0.66, 1.38, cz + 0.46), pFR1 = V(cx + 0.48, 3.08, cz + 0.45);
  const pBL0 = V(cx - 0.64, 1.38, cz - 0.46), pBL1 = V(cx - 0.60, 3.08, cz - 0.45);
  const pBR0 = V(cx - 0.64, 1.38, cz + 0.46), pBR1 = V(cx - 0.60, 3.08, cz + 0.45);
  const pML0 = V(cx + 0.04, 1.38, cz - 0.46), pML1 = V(cx + 0.02, 3.08, cz - 0.45);
  for (const [a, b] of [[pFL0, pFL1], [pFR0, pFR1], [pBL0, pBL1], [pBR0, pBR1], [pML0, pML1]]) rod('dark', a, b, 0.036, 8);
  for (const [a, b] of [[pFL1, pBL1], [pFR1, pBR1], [pFL1, pFR1], [pBL1, pBR1]]) rod('dark', a, b, 0.038, 8);
  // Lower cab door kick-panel & roof cap
  box('yellow', 1.28, 0.42, 0.04, cx, 1.59, cz - 0.46);
  box('yellow', 1.14, 0.09, 0.94, cx - 0.06, 3.12, cz);
  cylY('beacon', 0.055, 0.065, 0.11, cx - 0.42, 3.16, cz - 0.28, 14); // amber strobe beacon
  // Tinted reflective safety glazing
  box('cabGlass', 0.02, 1.66, 0.88, cx + 0.57, 2.24, cz, -0.105); // angled front windshield
  box('cabGlass', 1.18, 1.24, 0.02, cx - 0.04, 2.42, cz - 0.46); // left door & rear window
  box('cabGlass', 1.18, 1.62, 0.02, cx - 0.04, 2.23, cz + 0.46); // right window
  box('cabGlass', 0.02, 1.62, 0.88, cx - 0.62, 2.23, cz); // back window
  // Cab grab handles & front work lights
  rod('chrome', V(cx + 0.62, 1.55, cz - 0.50), V(cx + 0.53, 2.35, cz - 0.50), 0.014, 8);
  box('chrome', 0.08, 0.08, 0.10, cx + 0.50, 3.06, cz - 0.34);
  box('chrome', 0.08, 0.08, 0.10, cx + 0.50, 3.06, cz + 0.34);

  // 4. Articulated Gooseneck Boom, Stick (Dipper Arm), Hydraulic Cylinders & 4-Bar Bucket Linkage
  const pv = V(0.95, 1.68, 0.12), knee = V(3.25, 4.45, 0.12), tip = pose.tip, wrist = pose.wrist;
  // Main boom lower & upper tapered box sections + side reinforcement baffle plates
  seg('yellow', pv, knee, 0.46, 0.52, 0.72, 0.28, 0.26);
  seg('yellow', knee, tip, 0.42, 0.68, 0.38, 0.22, 0.22);
  seg('dark', pv.clone().lerp(knee, 0.15), knee.clone().lerp(tip, 0.15), 0.50, 0.18, 0.18, 0, 0);
  // Hydraulic steel lines routed along top of boom
  for (const dz of [-0.24, 0.24]) {
    rod('dark', pv.clone().add(V(0, 0.28, dz)), knee.clone().add(V(0, 0.36, dz)), 0.016, 8);
    rod('dark', knee.clone().add(V(0, 0.36, dz)), tip.clone().add(V(0, 0.20, dz)), 0.016, 8);
  }
  // Stick (dipper arm) tapered section with ear brackets
  seg('yellow', tip, wrist, 0.34, 0.48, 0.30, 0.42, 0.18);
  // Heavy pivot pins with chrome end caps
  for (const [p, w] of [[pv, 0.72], [knee, 0.62], [tip, 0.58], [wrist, 0.52]]) {
    cylZ('dark', 0.13, w, p.x, p.y, p.z, 16);
    cylZ('chrome', 0.08, w + 0.04, p.x, p.y, p.z, 14);
  }
  // Twin boom lift hydraulic cylinders
  const bmAttach = pv.clone().lerp(knee, 0.56).add(V(0.08, -0.18, 0));
  for (const dz of [-0.28, 0.28]) {
    const c0 = V(1.32, 1.28, 0.12 + dz), c1 = bmAttach.clone().add(V(0, 0, dz));
    const mid = c0.clone().lerp(c1, 0.56);
    rod('dark', c0, mid, 0.095, 14);
    rod('chrome', mid, c1, 0.058, 14);
    cylZ('dark', 0.11, 0.18, c0.x, c0.y, c0.z, 12);
    cylZ('dark', 0.11, 0.18, c1.x, c1.y, c1.z, 12);
  }
  // Stick crowd cylinder above the boom
  const ac0 = knee.clone().add(V(-0.15, 0.48, 0)), ac1 = tip.clone().add(V(0.18, 0.48, 0));
  const acMid = ac0.clone().lerp(ac1, 0.58);
  rod('dark', ac0, acMid, 0.095, 14);
  rod('chrome', acMid, ac1, 0.058, 14);
  // Bucket curl cylinder & 4-bar linkage (power H-link + guide link)
  const along = wrist.clone().sub(tip).normalize(), side = V(-along.y, along.x, 0);
  const bc0 = tip.clone().addScaledVector(along, 0.32).addScaledVector(side, 0.34);
  const linkPin = wrist.clone().addScaledVector(along, -0.42).addScaledVector(side, 0.36);
  const stickPin = wrist.clone().addScaledVector(along, -0.38);
  const bcMid = bc0.clone().lerp(linkPin, 0.58);
  rod('dark', bc0, bcMid, 0.082, 14);
  rod('chrome', bcMid, linkPin, 0.048, 14);
  for (const dz of [-0.16, 0.16]) {
    rod('dark', stickPin.clone().add(V(0, 0, dz)), linkPin.clone().add(V(0, 0, dz)), 0.038, 10);
    rod('yellow', linkPin.clone().add(V(0, 0, dz)), wrist.clone().add(V(0.18, -0.15, dz)), 0.042, 10);
  }
  cylZ('chrome', 0.055, 0.44, linkPin.x, linkPin.y, linkPin.z, 12);

  // 5. Heavy-duty Rock & Earth Digging Bucket with Wear Plates & 5 Cast Teeth
  const bw = 1.12, ang = pose.bucket;
  for (let i = 0; i < 8; i++) {
    const a0 = ang + i * 0.34, a1 = a0 + 0.36, r = 0.64;
    const p0 = wrist.clone().add(V(Math.cos(a0) * r, Math.sin(a0) * r, 0.12));
    const p1 = wrist.clone().add(V(Math.cos(a1) * r, Math.sin(a1) * r, 0.12));
    seg('dark', p0, p1, bw, 0.055, 0.055);
    if (i >= 2 && i <= 5) seg('rubber', p0, p1, bw + 0.03, 0.025, 0.025); // outer wear strips
  }
  for (const z of [0.12 - bw / 2, 0.12 + bw / 2]) {
    const g = new THREE.CylinderGeometry(0.64, 0.64, 0.045, 20, 1, false, 0, 8 * 0.34 + 0.36);
    g.rotateX(Math.PI / 2); g.rotateZ(ang + Math.PI / 2); g.translate(wrist.x, wrist.y, z); K.dark.push(g);
  }
  const lip = ang + 8 * 0.34 + 0.02, tp = wrist.clone().add(V(Math.cos(lip) * 0.64, Math.sin(lip) * 0.64, 0));
  box('dark', 0.10, 0.06, bw + 0.04, tp.x, tp.y, 0.12, lip + Math.PI / 2); // cutting edge lip
  for (let i = 0; i < 5; i++) {
    const tz = 0.12 - 0.44 + i * 0.22;
    box('yellow', 0.12, 0.07, 0.07, tp.x + Math.cos(lip + 1.4) * 0.04, tp.y + Math.sin(lip + 1.4) * 0.04, tz, lip + Math.PI / 2);
    box('chrome', 0.18, 0.045, 0.06, tp.x + Math.cos(lip + 1.4) * 0.14, tp.y + Math.sin(lip + 1.4) * 0.14, tz, lip + Math.PI / 2);
  }
  const out = {}; for (const k in K) if (K[k].length) out[k] = merge(K[k]);
  return out;
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


// ---------------------------------------------------------------- la cimentación por dentro: trazo, niveletas, plantilla, acero, cimbra
// Todo es solo de la obra real (el dibujo muestra la cepa, la zapata y la contratrabe). Una geometría por material.
// Regla: ninguna cara queda en el mismo plano que la de otra pieza (se meten 5–10 mm o se separan ≥ 2 cm).
function foundationKit(group, R, samples) {
  const runs = cimRuns().filter((r) => !r.dropped);
  const huellas = casaParts().filter((p) => p.k === 'firme').map((p) => p.outer);
  const newAcc = () => ({ pos: [], nor: [], wk: [], out: [] });
  const K = { pl: newAcc(), rebar: newAcc(), cap: newAcc(), ply: newAcc(), timber: newAcc(), cal: newAcc() };
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
  // ---- parrilla de zapata: transversales #4 @ 0.20 a -0.94 y longitudinales #3 @ 0.25 a -0.925
  for (const run of runs) {
    const [s0, s1] = run.sp.za;
    for (const [a, b] of run.iv.za) {
      if (b - a < 0.3) continue;
      const n = Math.max(2, Math.floor((b - a - 0.2) / 0.2) + 1);
      for (let i = 0; i < n; i++) {
        const u = a + 0.1 + ((b - a - 0.2) * i) / (n - 1), W = Wat(run, u, (s0 + s1) / 2);
        cyl(K.rebar, pos3(run, u, s0 + 0.05, -0.94), pos3(run, u, s1 - 0.05, -0.94), 0.0105, 1.45 + W, 2.51 + W);
      }
      const nl = Math.max(2, Math.ceil((s1 - s0 - 0.12) / 0.25) + 1);
      for (let i = 0; i < nl; i++) {
        const q = s0 + 0.06 + ((s1 - s0 - 0.12) * i) / (nl - 1);
        cyl(K.rebar, pos3(run, a + 0.05, q, -0.925), pos3(run, b - 0.05, q, -0.925), 0.008, wf(run, 1.45), wf(run, 2.51));
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
  for (const [ax, az] of cimRuns().anchors) {
    let W = 9;
    for (const r of runs) { const c = r.cepa; if (ax >= c[0] && ax <= c[2] && az >= c[1] && az <= c[3]) W = Math.min(W, runW(r, ax, az)); }
    if (W > 8) continue;
    const out = 6.5 + 3.2 * clamp((az + CZ) / 20.69, 0, 1);
    for (const dx of [-0.05, 0.05]) for (const dz of [-0.05, 0.05]) {
      cyl(K.rebar, [ax + dx, -0.95, az + dz], [ax + dx, 0.60, az + dz], 0.008, 1.65 + W, out);
      frustum(K.cap, [ax + dx, 0.60, az + dz], [ax + dx, 0.645, az + dz], 0.024, 0.018, 1.65 + W, out, 8, true);
    }
  }
  // ---- fronteras de zapata: tablas de pino 0.025 x 0.25 a 5 mm del concreto, con estacas por fuera
  for (const run of runs) {
    const [s0, s1] = run.sp.za;
    const sides = [];
    if (run.lind >= 0) sides.push([s0 - 0.030, s0 - 0.005, s0 - 0.082, s0 - 0.028]);   // el lado del lindero no lleva cimbra
    if (run.lind <= 0) sides.push([s1 + 0.005, s1 + 0.030, s1 + 0.028, s1 + 0.082]);
    for (const [q0, q1, k0, k1] of sides) {
      let list = cutAround(run, run.iv.za.map((v) => [...v]), q0, q1, 'za');
      for (const [a, b] of list) {
        boxA(K.timber, run, a, b, q0, q1, -1.0, -0.75 - run.dy, wf(run, 1.75), wf(run, 2.75));
        const n = Math.max(1, Math.round((b - a) / 0.8));
        for (let i = 0; i < n; i++) { const u = a + ((i + 0.5) * (b - a)) / n, W = Wat(run, u, q0); boxA(K.timber, run, u - 0.025, u + 0.025, k0, k1, -1.05, -0.70, 1.75 + W, 2.75 + W); }
      }
    }
    // extremos libres
    const others = runs.filter((J) => J !== run).flatMap((J) => J.iv.za.map((iv) => rectOf(J, 'za', iv)));
    for (const iv of run.iv.za) for (const [u0, u1] of [[iv[0] - 0.030, iv[0] - 0.005], [iv[1] + 0.005, iv[1] + 0.030]]) {
      const r = run.ax === 0 ? [u0, s0 - 0.03, u1, s1 + 0.03] : [s0 - 0.03, u0, s1 + 0.03, u1];
      if (others.some((q) => ovl(r, q))) continue;
      boxA(K.timber, run, u0, u1, run.lind < 0 ? s0 : s0 - 0.03, run.lind > 0 ? s1 : s1 + 0.03, -1.0, -0.75, wf(run, 1.75), wf(run, 2.75));
    }
  }
  // ---- cimbra de contratrabe: triplay de 16 mm, barrotes cada 0.60 y yugos cada 1.20
  for (const run of runs) {
    const [s0, s1] = run.sp.co, ply = 0.016, gap = 0.005;
    const sideDefs = [];
    if (run.lind >= 0) sideDefs.push([s0 - gap - ply, s0 - gap, -1]);
    if (run.lind <= 0) sideDefs.push([s1 + gap, s1 + gap + ply, 1]);
    for (const [q0, q1, sg] of sideDefs) {
      const list = cutAround(run, run.iv.co.map((v) => [...v]), q0, q1, 'co');
      for (const [a, b] of list) {
        boxA(K.ply, run, a, b, q0, q1, -0.80, -0.02 - run.dy, wf(run, 2.55), wf(run, 3.60));
        const n = Math.max(1, Math.round((b - a) / 0.6));
        for (let i = 0; i < n; i++) {
          const u = a + ((i + 0.5) * (b - a)) / n, W = Wat(run, u, q0);
          if (sg < 0) boxA(K.timber, run, u - 0.025, u + 0.025, q0 - 0.098, q0 + 0.002, -0.79, -0.03, 2.55 + W, 3.60 + W);
          else boxA(K.timber, run, u - 0.025, u + 0.025, q1 - 0.002, q1 + 0.098, -0.79, -0.03, 2.55 + W, 3.60 + W);
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
  const placed = [];
  const inCepa = (x, z, m) => runs.some((r) => x > r.cepa[0] - m && x < r.cepa[2] + m && z > r.cepa[1] - m && z < r.cepa[3] + m);
  for (const run of runs) {
    if (run.tipo === 'pil') continue;
    for (const [u, sg] of [[run.lo, -1], [run.hi, 1]]) {
      const uu = u + sg * 1.0, x = run.ax === 0 ? uu : run.c, z = run.ax === 0 ? run.c : uu;
      if (huellas.some((h) => inPoly(x, z, h)) || inCepa(x, z, 0.5) || placed.some((q) => Math.hypot(q[0] - x, q[1] - z) < 1.0)) continue;
      if (samples.some((s) => Math.hypot(s.x - x, s.z - z) < 0.6)) continue;
      placed.push([x, z]);
      const wk = 0.05 + 0.30 * Fhat(x, z), out = 3.65 + runW(run, x, z);
      for (const dq of [-0.5, 0.5]) boxA(K.timber, run, uu - 0.025, uu + 0.025, run.c + dq - 0.025, run.c + dq + 0.025, -0.30, 0.60, wk, out);
      boxA(K.timber, run, uu - 0.0125, uu + 0.0125, run.c - 0.55, run.c + 0.55, 0.55, 0.65, wk, out);
    }
  }
  // ---- trazo con cal: líneas de 5 cm sobre los bordes de cada cepa (se van cuando pasa la excavadora)
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
  const mk = (A, mat, shadow) => {
    if (!A.pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(A.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(A.nor, 3));
    g.setAttribute('aWeek', new THREE.Float32BufferAttribute(A.wk, 1)); g.setAttribute('aOut', new THREE.Float32BufferAttribute(A.out, 1));
    worldUV(g);
    addMesh(group, g, { main: mat, paper: null, nd: null }, { shadow });
  };
  mk(K.pl, R.blinding, false); mk(K.rebar, R.rebar, true); mk(K.cap, R.cap, false);
  mk(K.ply, R.ply, true); mk(K.timber, R.timber, true); mk(K.cal, R.white, false);
}

// ---------------------------------------------------------------- build it
export async function buildWorld(o, step) {
  const tick = async (p) => { if (step) await step(p); };
  const { R, phone } = o;
  const group = new THREE.Group();
  const realOnly = (main) => ({ main, paper: null, nd: null });

  // la casa: una geometría por material para la obra, líneas jerárquicas para el dibujo
  const ctx = buildHouse(group, R);
  ctx.samples = o.samples || [];
  foundationKit(group, R, ctx.samples);
  await tick(0.2);

  // obra falsa: puntales y cimbra
  for (const E of PROPS) {
    const g = propsGeo(E, ctx);
    if (g.posts) addMesh(group, g.posts, { main: R.prop, paper: DM.paper, nd: DM.ndProp });
    if (g.deck) addMesh(group, g.deck, { main: R.ply, paper: DM.paper, nd: DM.ndProp });
  }

  await tick(0.4);
  // el terreno plano, con cepas
  for (const m of buildLand(o, R)) group.add(m);

  await tick(0.55);
  // la retroexcavadora en la calle, con la pluma hacia el lote
  {
    const ex = excavatorGeo({ tip: V(5.35, 3.55, 0.12), wrist: V(5.85, 1.05, 0.12), bucket: -2.25 });
    const exg = new THREE.Group();
    for (const k in ex) { stamp(ex[k], 0.3, 2.3); addMesh(exg, ex[k], realOnly(R[k]), { glass: k === 'cabGlass', shadow: k !== 'cabGlass' }); }
    exg.position.set(9.5 - CX, 0, 23 - CZ); exg.rotation.y = Math.PI / 2; group.add(exg);
  }

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

  group.add(...fence(R));
  await tick(0.82);

  // luz de relleno bajo la losa de la cochera (sin sombras), para que no quede negra
  { const L = new THREE.PointLight(0xffe6c8, 11, 8.5, 1.6); L.position.set(9.75 - CX, 2.2, 16.9 - CZ); group.add(L); }

  // árboles alrededor del lote
  const trees = [];
  for (let z = -22; z <= 15; z += 3.5) trees.push(['cypress', -15 + Math.sin(z) * 0.6, z + (rnd() - 0.5), 0]);
  for (const t of [
    ['olive', -6, -23, 0], ['olive', -24, 4, 0], ['olive', 30, -17, 0], ['olive', 33, -10.5, 0],
    ['olive', 34, 13, 0], ['olive', -2.5, 19, 0], ['olive', 40, 2, 0], ['round', -22, -12, 0],
    ['olive', 46, -24, 0], ['olive', 52, 10, 0],
    // dos olivos en el jardín (plano (1.3, 1.2) y (0.75, 13.5)), fuera del recorrido de la cámara; aparecen con el pasto
    ['olive', 1.3 - CX, 0.9 - CZ, 33.4], ['olive', 0.4 - CX, 13.5 - CZ, 33.8, 0.4],
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
  const xs = gridLines(X0, X1, step, [...runs.flatMap((r) => [r.cepa[0], r.cepa[2]]), ...huellas.flatMap((h) => h.map((q) => q[0]))]);
  const zs = gridLines(Z0, Z1, step, [...runs.flatMap((r) => [r.cepa[1], r.cepa[3]]), ...huellas.flatMap((h) => h.map((q) => q[1]))]);
  const nx = xs.length - 1, nz = zs.length - 1;
  // datos fijos de cada celda (por su centro, que es exacto: ninguna celda cruza un borde)
  const cells = [];
  for (let j = 0; j < nz; j++) {
    const row = [], cz = (zs[j] + zs[j + 1]) / 2;
    for (let i = 0; i < nx; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const hu = huellas.some((h) => inPoly(cx, cz, h)), ce = runs.filter((r) => cx >= r.cepa[0] && cx <= r.cepa[2] && cz >= r.cepa[1] && cz <= r.cepa[3]);
      row.push({ hu, ce, F: Fhat(cx, cz), W: ce.length ? Math.min(...ce.map((r) => runW(r, cx, cz))) : 0 });
    }
    cells.push(row);
  }
  // historia de una celda: tramos {y, a, b, m}. Cualquier tramo de tierra termina después de 0.55 (los shaders ignoran aOut <= 0.5).
  const history = (c, shift) => {
    const { hu, ce, F, W } = c;
    if (!hu && !ce.length) return [{ y: 0, a: -2, b: INF, m: 'dry' }];
    const D = 0.55 + 0.5 * F;
    let st;
    if (!ce.length) st = [[0, 'dry', -2], [-0.20, 'soil', D], [-0.10, 'fill', 4.0 + 1.2 * F + shift]];
    else {
      const E1 = 0.75 + W, E2 = E1 + 0.15, R1 = 3.75 + W + shift, R2 = 4.0 + W + shift;
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

// el tapial de la calle: paneles de malla sobre pies de concreto, con un claro frente a la cochera
function fence(R) {
  const frame = [], wire = [], feet = [];
  const panel = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax);
    const q = new THREE.PlaneGeometry(len - 0.08, 1.9); q.translate(len / 2, 1.05, 0); q.rotateY(-ang); q.translate(ax, 0, az);
    const uv = q.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 0.5, uv.getY(i) * 1.9 / 1.0);
    wire.push(q);
    for (const t of [0.01, 0.99]) {
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const c = new THREE.CylinderGeometry(0.022, 0.022, 2.0, 6); c.translate(x, 1.05, z); frame.push(c);
      const f = new THREE.BoxGeometry(0.62, 0.14, 0.2); f.rotateY(-ang + Math.PI / 2); f.translate(x, 0.07, z); feet.push(f);
    }
    for (const h of [0.08, 2.0]) { const r = new THREE.CylinderGeometry(0.02, 0.02, len, 6); r.rotateZ(Math.PI / 2); r.translate(len / 2, h, 0); r.rotateY(-ang); r.translate(ax, 0, az); frame.push(r); }
  };
  const edge = (ax, az, bx, bz, gap) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 3.45);
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, mx = ax + (bx - ax) * (t0 + t1) / 2, mz = az + (bz - az) * (t0 + t1) / 2;
      if (gap && gap(mx, mz)) continue;
      panel(ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1);
    }
  };
  const zf = 20.9 - CZ, gx = 9.755 - CX;   // sobre y = 20.9 del plano; el claro es el de la cochera
  edge(-9.5, zf, 9.5, zf, (x) => Math.abs(x - gx) < 2.9);
  const out = [];
  for (const [list, m] of [[frame, R.galv], [wire, R.wire], [feet, R.block]]) {
    const g = merge(list); stamp(g, 0.2, 28.6);
    const mesh = new THREE.Mesh(g, m); mesh.userData.sets = { main: m, paper: null, nd: null }; mesh.castShadow = true; mesh.receiveShadow = true; mesh.customDepthMaterial = DEPTH_WEEKLY; out.push(mesh);
  }
  return out;
}
