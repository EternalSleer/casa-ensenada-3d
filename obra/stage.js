// Basado en flat-to-3d/04-build-time-lapse de Sam Aing (MIT), ver LICENSE-flat-to-3d.txt.
// Lo que llega a la obra además de la casa: en las últimas semanas, el mobiliario y las lámparas que amueblan la casa para la entrega.
// Todo lleva estampadas las semanas en que está ahí, como la casa. Coordenadas de Casa Ensenada (plano -> mundo con CX, CZ).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { V, stamp, merge, addMesh, worldUV, canopy, DM } from './world.js';

const rb = (w, h, d, r, x = 0, y = 0, z = 0, seg = 3) => {
  const g = new RoundedBoxGeometry(w, h, d, seg, Math.max(0.002, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)));
  g.translate(x, y, z);
  return g;
};
const bx = (w, h, d, x = 0, y = 0, z = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
const cyl = (r0, r1, h, x = 0, y = 0, z = 0, seg = 16) => { const g = new THREE.CylinderGeometry(r0, r1, h, seg); g.translate(x, y + h / 2, z); return g; };
const lathe = (pts, x, y, z, seg = 22) => { const g = new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), seg); g.translate(x, y, z); return g; };
const sph = (r, x, y, z, seg = 18) => { const g = new THREE.SphereGeometry(r, seg, 12); g.translate(x, y, z); return g; };
const tube = (a, b, r, seg = 8) => {
  const d = b.clone().sub(a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
};

export function buildStage(R) {
  const group = new THREE.Group();
  const drawn = {}, real = {};
  // `piece` coloca geometrías en el mundo, les da UV en metros y manda las formas limpias a `drawn` (lámina 06)
  // y los accesorios finos a `real` (para que la lámina 06 no se sature).
  const piece = (bucket, list, x, y, z, ry, week, out = 0) => {
    const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
    for (const [mat, g, realOnlyItem] of list) {
      g.applyMatrix4(m);
      if (mat !== 'art') worldUV(g);
      stamp(g, week, out);
      const target = realOnlyItem ? real : bucket;
      (target[mat] || (target[mat] = [])).push(g);
    }
  };
  const lights = [];
  const CX = 6.245, CZ = 9.965, F2 = 5.60;
  const at = (x, y) => [x - CX, y - CZ];                          // plano (x, y) -> mundo (x, z)
  const face = (x, y, tx, ty) => Math.atan2(tx - x, ty - y);      // giro para que el frente (+z local) mire al plano (tx, ty)

  const loungeChair = () => {
    const L = [];
    for (const sx of [-0.41, 0.41]) {
      L.push(['walnut', tube(V(sx, 0, 0.34), V(sx, 0.55, 0.24), 0.024)]);
      L.push(['walnut', tube(V(sx, 0, -0.36), V(sx, 0.55, -0.22), 0.024)]);
      const arm = rb(0.065, 0.038, 0.78, 0.016); arm.rotateX(0.04); arm.translate(sx, 0.56, 0); L.push(['walnut', arm]);
    }
    const seat = rb(0.76, 0.13, 0.74, 0.055); seat.rotateX(0.08); seat.translate(0, 0.36, 0.02); L.push(['leather', seat]);
    const back = rb(0.74, 0.56, 0.13, 0.055); back.rotateX(-0.26); back.translate(0, 0.66, -0.31); L.push(['leather', back]);
    return L;
  };
  const sideChair = (m = 'oak') => {
    const L = [];
    for (const sx of [-0.2, 0.2]) {
      L.push([m, tube(V(sx, 0, 0.2), V(sx, 0.44, 0.18), 0.017, 6), true]);
      L.push([m, tube(V(sx, 0, -0.22), V(sx, 0.78, -0.21), 0.017, 6), true]);
    }
    L.push([m, rb(0.46, 0.035, 0.46, 0.015, 0, 0.44, 0)], [m, rb(0.46, 0.16, 0.032, 0.014, 0, 0.74, -0.21)],
      ['leather', rb(0.42, 0.038, 0.42, 0.015, 0, 0.475, 0.01), true]);
    return L;
  };
  const plant = (h, r, big) => [
    ['terracotta', lathe([[0, 0], [r, 0], [r * 1.25, h], [0, h]], 0, 0, 0)],
    ['bark', merge([tube(V(0, h, 0), V(0.05, h + 0.8, 0.03), 0.03, 6), tube(V(0.05, h + 0.8, 0.03), V(0.3, h + 1.2, 0.1), 0.02, 5)]), true],
    ['olive', canopy([[0.08, h + 1.35, 0.02, big, big * 0.7, big * 0.9, 70]], 0.04, 0.08), true],
  ];

  // ================================================================ TERRAZA (base F2 = 5.60), semanas 30.5 a 32
  {
    const y0 = F2 + 0.006;
    [4.28, 5.81].forEach((yy, i) => {
      const [x, z] = at(11.08, yy);
      const L = [['teak', rb(0.74, 0.065, 1.96, 0.02, 0, 0.29, 0)], ['sofa', rb(0.68, 0.095, 1.32, 0.04, 0, 0.37, 0.2)]];
      const back = rb(0.68, 0.095, 0.62, 0.04); back.rotateX(0.72); back.translate(0, 0.58, -0.72); L.push(['sofa', back]);
      for (const sx of [-0.31, 0.31]) for (const sz of [-0.84, 0.84]) L.push(['teak', cyl(0.024, 0.03, 0.27, sx, 0, sz, 8), true]);
      piece(drawn, L, x, y0, z, 0, 30.5 + i * 0.3);
    });
    {
      const [x, z] = at(3.01, 10.17);
      const T = [['teak', rb(1.3, 0.05, 0.85, 0.02, 0, 0.74, 0)]];
      for (const sx of [-0.5, 0.5]) for (const sz of [-0.3, 0.3]) T.push(['teak', cyl(0.05, 0.05, 0.72, sx, 0, sz, 8), true]);
      piece(drawn, T, x, y0, z, 0, 31.1);
      [[0, -0.8, 0], [0, 0.8, Math.PI], [-0.95, 0, Math.PI / 2], [0.95, 0, -Math.PI / 2]].forEach(([dx, dz, ry], i) => {
        piece(drawn, sideChair('teak'), x + dx, y0, z + dz, ry, 31.3 + i * 0.1);
      });
    }
    { const [x, z] = at(10.9, 9.0); piece(real, plant(0.45, 0.22, 0.6), x, y0, z, 0.3, 31.8); }
    { const [x, z] = at(2.0, 12.6); piece(real, plant(0.5, 0.25, 0.7), x, y0, z, 0, 31.9); }
  }

  // ================================================================ COCINA (semanas 35 a 36.5)
  {
    const [ix, iz] = at(9.89, 5.36);
    piece(drawn, [['oak', rb(1.15, 0.88, 1.6, 0.02, 0, 0.44, 0)], ['travertine', rb(1.25, 0.045, 1.7, 0.015, 0, 0.9, 0)]], ix, 0, iz, 0, 35.0);
    piece(real, [['brass', cyl(0.014, 0.016, 0.28, 0, 0.92, 0, 10), true], ['ceramic', lathe([[0, 0], [0.11, 0], [0.14, 0.08], [0, 0.08]], -0.3, 0.925, 0.55), true]], ix, 0, iz, 0, 35.3);
    [4.86, 5.42, 5.98].forEach((yy, i) => {
      const [x, z] = at(8.75, yy);
      piece(real, [
        ['walnut', tube(V(-0.12, 0, -0.12), V(-0.09, 0.62, -0.09), 0.014, 6), true], ['walnut', tube(V(0.12, 0, -0.12), V(0.09, 0.62, -0.09), 0.014, 6), true],
        ['walnut', tube(V(-0.12, 0, 0.12), V(-0.09, 0.62, 0.09), 0.014, 6), true], ['walnut', tube(V(0.12, 0, 0.12), V(0.09, 0.62, 0.09), 0.014, 6), true],
        ['walnut', cyl(0.18, 0.18, 0.025, 0, 0.6, 0, 18), true], ['leather', cyl(0.17, 0.18, 0.05, 0, 0.625, 0, 18), true],
      ], x, 0, z, 0, 35.5 + i * 0.1);
    });
    [4.95, 5.36, 5.77].forEach((yy) => {
      const [x, z] = at(9.55, yy);
      piece(real, [['ink', cyl(0.003, 0.003, 0.6, 0, 1.95, 0, 5), true], ['brass', cyl(0.04, 0.06, 0.22, 0, 1.73, 0, 14), true], ['shade', cyl(0.05, 0.05, 0.02, 0, 1.72, 0, 14), true]], x, 0, z, 0, 35.9);
    });
    { const [x, z] = at(9.55, 5.36); lights.push({ p: V(x, 1.7, z), k: 0.85 }); }
    const [ax, az] = at(12.08, 4.85);
    piece(drawn, [['oak', rb(0.55, 2.2, 3.2, 0.02, 0, 1.1, 0)]], ax, 0, az, 0, 36.3);
  }

  // ================================================================ COMEDOR (semanas 36.2 a 37.4)
  {
    const [x, z] = at(3.82, 9.95);
    piece(drawn, [['rugM', rb(2.4, 0.018, 3.2, 0.006, 0, 0.012, 0, 2)]], x, 0.002, z, 0, 36.2);
    const L = [];
    for (const sx of [-0.46, 0.46]) for (const sz of [-1.05, 1.05]) L.push(['oak', cyl(0.03, 0.025, 0.73, sx, 0, sz, 10)]);
    L.push(['oak', rb(1.0, 0.048, 2.3, 0.018, 0, 0.74, 0)], ['ceramic', lathe([[0, 0], [0.09, 0], [0.12, 0.14], [0.07, 0.30], [0, 0.32]], 0.1, 0.764, 0.1), true],
      ['terracotta', lathe([[0, 0], [0.12, 0], [0.16, 0.06], [0, 0.06]], -0.1, 0.764, -0.45), true]);
    piece(drawn, L, x, 0, z, 0, 36.5);
    [-0.75, 0, 0.75].forEach((dz, n) => {
      piece(drawn, sideChair(), x - 0.78, 0, z + dz, Math.PI / 2, 36.7 + 0.05 * n);
      piece(drawn, sideChair(), x + 0.78, 0, z + dz, -Math.PI / 2, 36.8 + 0.05 * n);
    });
    piece(drawn, sideChair(), x, 0, z - 1.5, 0, 37.1);
    piece(drawn, sideChair(), x, 0, z + 1.5, Math.PI, 37.15);
    for (const dz of [-0.7, 0, 0.7]) piece(real, [['ink', cyl(0.003, 0.003, 0.62, 0, 1.92, 0, 5), true], ['brass', cyl(0.02, 0.02, 0.05, 0, 1.87, 0, 8), true], ['shade', sph(0.14, 0, 1.73, 0), true]], x, 0, z + dz, 0, 37.2);
    lights.push({ p: V(x, 1.7, z), k: 1.0 });
  }

  // ================================================================ SALA (semanas 37.2 a 39.5)
  {
    const [rx, rz] = at(4.3, 5.9);
    piece(drawn, [['rugM', rb(3.0, 0.02, 2.4, 0.008, 0, 0.012, 0, 2)]], rx, 0.002, rz, 0, 37.2);
    // sofá de tres plazas pegado al muro oriente, mirando al televisor
    const [sx, sz] = at(6.4, 5.1);
    const L = [['steel', bx(2.3, 0.05, 0.84, 0, 0.025, 0), true], ['sofa', rb(2.5, 0.18, 1.0, 0.06, 0, 0.14, 0)],
      ['sofa', rb(0.24, 0.52, 1.0, 0.09, -1.18, 0.3, 0)], ['sofa', rb(0.24, 0.52, 1.0, 0.09, 1.18, 0.3, 0)], ['sofa', rb(2.3, 0.52, 0.22, 0.09, 0, 0.47, -0.4)]];
    for (const x of [-0.76, 0, 0.76]) L.push(['sofa', rb(0.74, 0.2, 0.86, 0.08, x, 0.31, 0.06)]);
    L.push(['sofa', rb(1.0, 0.18, 0.9, 0.06, 0.76, 0.14, 0.95)], ['sofa', rb(0.74, 0.2, 0.9, 0.08, 0.76, 0.31, 0.95)]);   // chaise: el seccional en L del plano
    for (const x of [-0.76, 0, 0.76]) { const b = rb(0.72, 0.44, 0.2, 0.09); b.rotateX(-0.16); b.translate(x, 0.6, -0.24); L.push(['sofa', b, true]); }
    for (const [m, x, rz2] of [['cushionA', -0.85, 0.14], ['cushionC', 0.2, -0.06], ['cushionB', 0.92, -0.12]]) { const c = rb(0.42, 0.38, 0.14, 0.06); c.rotateX(-0.24); c.rotateZ(rz2); c.translate(x, 0.54, -0.08); L.push([m, c, true]); }
    piece(drawn, L, sx, 0, sz, -Math.PI / 2, 37.4);
    const [tx, tz] = at(4.3, 6.0);
    piece(drawn, [['travertine', cyl(0.2, 0.2, 0.3, -0.35, 0, 0, 22)], ['travertine', cyl(0.17, 0.17, 0.3, 0.38, 0, 0.05, 22)], ['travertine', rb(1.4, 0.05, 0.8, 0.022, 0, 0.32, 0)],
      ['book1', rb(0.32, 0.04, 0.24, 0.005, -0.3, 0.365, 0.05), true], ['book2', rb(0.28, 0.035, 0.22, 0.005, -0.3, 0.405, 0.05), true],
      ['ceramic', lathe([[0, 0], [0.07, 0], [0.1, 0.08], [0.05, 0.24], [0, 0.26]], 0.4, 0.345, -0.05), true]], tx, 0, tz, Math.PI / 2, 37.7);
    // mueble de televisión contra el muro poniente (frente al +x)
    const [vx, vz] = at(1.75, 6.0);
    piece(drawn, [['walnut', rb(0.42, 0.5, 2.4, 0.02, 0, 0.3, 0)], ['travertine', rb(0.44, 0.03, 2.44, 0.01, 0, 0.565, 0)], ['ink', bx(0.04, 0.85, 1.45, -0.1, 1.15, 0), true]], vx, 0, vz, 0, 38.0);
    const [cx2, cz2] = at(2.4, 7.6);
    piece(drawn, loungeChair(), cx2, 0, cz2, face(2.4, 7.6, 4.3, 6.0), 38.4);
    const [px, pz] = at(2.0, 4.4);
    piece(real, plant(0.5, 0.25, 0.75), px, 0, pz, 0, 38.8);
    const [fx, fz] = at(1.95, 8.5);
    piece(real, [['travertine', cyl(0.18, 0.19, 0.06, 0, 0, 0, 20), true], ['brass', cyl(0.012, 0.012, 1.46, 0, 0.06, 0, 8), true], ['shade', lathe([[0.2, 0], [0.14, 0.24], [0.135, 0.24], [0.195, 0]], 0, 1.4, 0), true]], fx, 0, fz, 0, 38.9);
    lights.push({ p: V(fx, 1.6, fz), k: 0.8 });
    // candil de globos a 3.6 m
    const [kx, kz] = at(4.4, 5.95);
    for (const [dx, dy, dz] of [[0, 0, 0], [0.32, 0.25, 0.1], [-0.3, 0.3, -0.12], [0.05, 0.55, -0.3]]) {
      piece(real, [['shade', sph(0.15, dx, 3.6 + dy, dz), true], ['ink', cyl(0.003, 0.003, 5.25 - (3.6 + dy + 0.15), dx, 3.6 + dy + 0.15, dz, 5), true]], kx, 0, kz, 0, 39.2);
    }
    lights.push({ p: V(kx, 3.3, kz), k: 1.1 });
  }

  // los muebles de `drawn` van también a la lámina 06 con trazo delgado; los de `real` solo en 3D
  for (const k in drawn) addMesh(group, merge(drawn[k]), { main: R[k], paper: DM.paper, nd: DM.ndFurn }, { shadow: k !== 'sheer' && k !== 'rugM' });
  for (const k in real) addMesh(group, merge(real[k]), { main: R[k], paper: null, nd: null }, { shadow: k !== 'sheer' && k !== 'rugM' });
  group.userData.lights = lights;
  return group;
}
