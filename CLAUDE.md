# Casa Ensenada — contexto para Claude Code

Responder siempre en español.

## Qué es
Landing de scroll en un solo `index.html` (sin build): three.js 0.170 (importmap jsdelivr), GSAP 3.12.5 + ScrollTrigger (cdnjs), Lenis 1.1.13 (unpkg). Referencia de técnica: Casa Serra / flat-to-3d de Sam Aing.

## Coordenadas
- Plano en metros: x = eje A (0) → G (12.49); y = eje 1 (fondo, jardín, 0) → eje 9 (calle, 19.93).
- `P(x, y)` → mundo `(x - CX, 0, y - CZ)`, CX = 6.245, CZ = 9.965. Las llaves de cámara usan `[x, altura, y]` de plano.
- Alturas: H1 2.55 libre PB, N.P.T. 2.80 / 5.60 / 8.20, losa .25. Sala doble altura 5.35.
- Confirmado: jacuzzi hundido sobre recámara 3; N.P.T. 5.40 de planta alta es errata (2.80); calle en eje 9; barda frontal con portón eléctrico y acceso peatonal.

## Arquitectura de index.html
1. Materiales `mat.*` con `sw()`: shader por zonas (papel → material real) con barrido radial desde la cámara y borde naranja en el frente (`zoneSB`, `inkGrid`).
2. `wall(a, b, {h, t, base, open: [[o0, o1, tipo, antepecho, dintel]]})` — tipos `window`, `glass`, `door`, `doorR`, `main`, `ext`, `open`. Todas las puertas cerradas.
3. Mobiliario en `furn` con helpers `G, bx, rb, cy, lt, tb, sp, tr`; al final `bake(furn)` une todo por material y genera contornos de tinta (`inkify`).
4. `ZONES` (17): `rects`, `c`, `stops [[pos],[tgt],fov]`, `line` (leyenda narrativa), `piso`, `desc` (ficha).
5. Guion `KEYS`: auto → aerial → street → streetHold → lift → por zona (over, overHold, drop, eye, reveal, hold, move/eye/hold…, lift) → final → curl (hoja que se dobla).
6. HUD: regla, contador, ficha del espacio, retícula, marcadores clicables (`openFicha`), portada y hoja final con el plano 2D (`PLAN2D`).

## Pruebas
`npm i three@0.170.0 gsap@3.12.5 lenis@1.1.13`, generar `test.html` cambiando CDN por `node_modules`, servir y forzar `window.__forceP` (0–1) o `window.__cam = {pos, tgt, fov}` desde Playwright.

## Pendiente
Planta alta (sala TV, recámaras 1–3 con vestidor y baño, balcón) con el mismo sistema de zonas; después terraza (asador, bar, jacuzzi, comedor y sala exterior) y azotea.
