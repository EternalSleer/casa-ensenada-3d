# Casa Ensenada — contexto para Claude Code

Responder siempre en español.

## Qué es
Landing de scroll en un solo `index.html` (sin build): three.js 0.170 (importmap jsdelivr), GSAP 3.12.5 + ScrollTrigger (cdnjs), Lenis 1.1.13 (unpkg). Referencia de técnica: Casa Serra / flat-to-3d de Sam Aing.

## Coordenadas
- Plano en metros: x = eje A (0) → G (12.49); y = eje 1 (fondo, jardín, 0) → eje 9 (calle, 19.93).
- `P(x, y)` → mundo `(x - CX, 0, y - CZ)`, CX = 6.245, CZ = 9.965. Las llaves de cámara usan `[x, altura, y]` de plano (altura absoluta: en planta alta el ojo va a 4.40).
- Alturas: H1 2.55 libre PB, N.P.T. 2.80 / 5.60 / 8.20, losa .25. Sala doble altura 5.35.
- Confirmado: N.P.T. 5.40 de planta alta es errata (2.80); calle en eje 9; barda frontal con portón eléctrico y acceso peatonal. La recámara 3 tiene plafón de 2.55 como las demás: el jacuzzi de la terraza se hunde en una losa más gruesa sobre ella (el N.P.T. 4.27 no se usa).
- Planos fuente: PDF del cliente con ARQ-01 (PB), ARQ-02 (PA), ARQ-03 (terraza) y ARQ-04 (azotea). Escala en ARQ-02: 25.53 pt/m, eje B en x = 382 pt, eje 1 en y = 177.7 pt. El cuadro de datos trae nombre y dirección del propietario: no copiarlos al repo ni al sitio.

## Arquitectura de index.html
0. Corte de sección: `renderer.clippingPlanes = [cutPlane]` corta todo a `CUT0` = 1.20 m (la lámina inicial es el modelo cortado visto desde arriba) y en `apply()` el corte sube hasta desactivarse; los muros ya no se escalan. Muros, puertas y marcos (`mat.wall`, `fence`, `woodClad`, `frame`, `casing`, `doorW`) son de dos caras con `#define POCHE`: la cara interior que deja ver el corte se pinta negra (poché) mientras `U.uPoche` = 1. En la lámina la luz es pareja y sin sombras (`lit`, `sun.shadow.intensity`). La lámina 02 repite el corte a `F1 + 1.20` entre `P_SH0` y `P_SH3`.
1. Materiales `mat.*` con `sw()`: shader por zonas (papel → material real) con barrido radial desde la cámara y borde naranja en el frente (`zoneSB`, `inkGrid`). Cada rectángulo de zona tiene altura máxima (`uYmax`, quinto valor del rect) y mínima (`uRad.w` = `y0` de la zona), hasta `NZ` = 40 rectángulos. Lo que sigue en tinta se aclara con `uPaperLift` para conservar el blanco del papel.
1b. Luz y acabados: sol `SUN_AZ`/`SUN_EL` (el HDRI `tex/sky.hdr` y el domo `tex/sky.jpg` se giran para coincidir), GTAO en el compositor de escritorio (su pase de normales oculta transparentes), texturas Poly Haven con `scan(mat, diff, nor, repetición, {soft, gray, ns})`: `soft` mezcla la foto hacia su color promedio (el cliente pidió texturas suaves, nada brusco) y `gray` la desatura; los muros llevan UV en metros (`uvM`). La cochera usa concreto pulido procedural (`texPolish`).
1c. Sin vecindario ni calle (se quitaron a pedido: no interesan y cuestan rendimiento); alrededor solo terreno, cielo y cerros. Follaje con tarjetas de hojas (`leafTex`, `foliage`, `crown`). `bx` bisela los cantos (RoundedBox, 1.2 cm máx.) salvo piezas delgadas.
1d. Claro de 90 cm frente a cada puerta: al mover mobiliario, comprobar que nada invada ese paso.
2. `wall(a, b, {h, t, base, open: [[o0, o1, tipo, antepecho, dintel]]})` — tipos `window`, `glass`, `door`, `doorR`, `main`, `ext`, `open`. Todas las puertas cerradas. Los muros de planta baja se registran en `PLAN2D` y los de planta alta en `PA2D` (para la hoja final).
3. Mobiliario en `furn` con helpers `G, bx, rb, cy, lt, tb, sp, tr`; al final `bake(furn)` une todo por material y genera contornos de tinta (`inkify`). Para amueblar otra planta se fija `GY` (altura base) y `GP` (grupo destino) antes de llamar a `G()`; planta alta: `paFurn` dentro de `paIn` dentro de `up1`, con piezas `bed`, `nightstand`, `wardrobe`, `dresser`, `tvUnit`, `desk`, `lounge`, `floorLamp`, `shower`, `tub`.
4. `ZONES` (29): 17 de planta baja y 12 de planta alta desde `PA0`. Cada zona: `y0`, `rects`, `c`, `stops [[pos],[tgt],fov]`, `line` (leyenda narrativa), `piso`, `desc` (ficha).
5. Guion `KEYS`: auto → aerial → street → streetHold → lift → zonas PB (over, overHold, drop, eye, reveal, hold, move/eye/hold…, lift) → climb (bajar al pasillo y subir la escalera en U) → arrive → sheet/sheetHold (lámina 02) → zonas PA → final → curl (hoja que se dobla). `P_PA` marca desde dónde se muestra la planta alta (`paIn`) y `up2` solo como plafón bajo 5.30 m.
6. HUD: regla, contador, ficha del espacio, retícula, marcadores clicables (`openFicha`), menú de plantas (`#navb`), portada y hoja final con las dos plantas en 2D. Sin botón de contacto: el proyecto no lleva "Agendar visita".

## Pruebas
Servir la carpeta (`python -m http.server 8765`) y forzar `window.__forceP` (0–1) o `window.__cam = {pos, tgt, fov}`. `window.__frameMs(p)` dibuja un cuadro en `p` y devuelve los ms con la GPU sincronizada: sirve para medir y para capturar aunque la pestaña esté en segundo plano (ahí el navegador baja a ~1 fps y las capturas llegan con un cuadro de retraso). `window.__KEYS` lista `{p, type, z}` de cada llave.

## Pendiente
Terraza (asador, bar, jacuzzi en losa peraltada, comedor y sala exterior, pérgola) y azotea, con el mismo sistema de zonas.
