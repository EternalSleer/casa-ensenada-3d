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
0. Corte de sección: `renderer.clippingPlanes = [cutPlane]` corta todo a `CUT0` = 1.20 m (la lámina inicial es el modelo cortado visto desde arriba) y en `apply()` el corte sube hasta desactivarse; los muros ya no se escalan. Muros, puertas y marcos (`mat.wall`, `fence`, `woodClad`, `frame`, `casing`, `doorW`) son de dos caras con `#define POCHE`: la cara interior que deja ver el corte se pinta negra (poché) mientras `U.uPoche` = 1. En la lámina la luz es pareja y sin sombras (`lit`, `sun.shadow.intensity`).
1. Materiales `mat.*` con `sw()`: shader por zonas (papel → material real) con barrido radial desde la cámara y borde naranja en el frente (`zoneSB`, `inkGrid`). Lo que sigue en tinta se aclara con `uPaperLift` para conservar el blanco del papel.
1b. Luz y acabados: sol `SUN_AZ`/`SUN_EL` (el HDRI `tex/sky.hdr` y el domo `tex/sky.jpg` se giran para coincidir), GTAO en el compositor de escritorio (su pase de normales oculta transparentes), texturas Poly Haven con `scan(mat, diff, nor, repetición, {soft, gray, ns})`: `soft` mezcla la foto hacia su color promedio (el cliente pidió texturas suaves, nada brusco) y `gray` la desatura; los muros llevan UV en metros (`uvM`). La cochera usa concreto pulido procedural (`texPolish`).
1c. Sin vecindario ni calle (se quitaron a pedido: no interesan y cuestan rendimiento); alrededor solo terreno, cielo y cerros. Follaje con tarjetas de hojas (`leafTex`, `foliage`, `crown`). `bx` bisela los cantos (RoundedBox, 1.2 cm máx.) salvo piezas delgadas.
1d. Claro de 90 cm frente a cada puerta: al mover mobiliario, comprobar que nada invada ese paso.
2. `wall(a, b, {h, t, base, open: [[o0, o1, tipo, antepecho, dintel]]})` — tipos `window`, `glass`, `door`, `doorR`, `main`, `ext`, `open`. Todas las puertas cerradas.
3. Mobiliario en `furn` con helpers `G, bx, rb, cy, lt, tb, sp, tr`; al final `bake(furn)` une todo por material y genera contornos de tinta (`inkify`).
4. `ZONES` (17): `rects`, `c`, `stops [[pos],[tgt],fov]`, `line` (leyenda narrativa), `piso`, `desc` (ficha).
5. Guion `KEYS`: auto → aerial → street → streetHold → lift → por zona (over, overHold, drop, eye, reveal, hold, move/eye/hold…, lift) → final → curl (hoja que se dobla).
6. HUD: regla, contador, ficha del espacio, retícula, marcadores clicables (`openFicha`), portada y hoja final con el plano 2D (`PLAN2D`). Botón "Agendar visita" (`#cta`, `#endCta`) que apunta a la constante `CONTACTO` al inicio del módulo.

## Pruebas
`npm i three@0.170.0 gsap@3.12.5 lenis@1.1.13`, generar `test.html` cambiando CDN por `node_modules`, servir y forzar `window.__forceP` (0–1) o `window.__cam = {pos, tgt, fov}` desde Playwright.

## Pendiente
Planta alta (sala TV, recámaras 1–3 con vestidor y baño, balcón) con el mismo sistema de zonas; después terraza (asador, bar, jacuzzi, comedor y sala exterior) y azotea.
