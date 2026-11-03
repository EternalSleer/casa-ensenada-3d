# Casa Ensenada · recorrido 3D

Landing de scroll que convierte el plano arquitectónico de la casa (ARQ-01 a ARQ-04, esc. 1:100) en un recorrido 3D por zonas: el plano levanta muros y niveles, la cámara entra desde la calle y cada espacio pasa de dibujo en tinta a render.

- `index.html` — la página completa (three.js 0.170 + GSAP ScrollTrigger + Lenis desde CDN, sin build).
- `geometria.json` — lectura del plano: ejes, niveles, espacios, puertas y decisiones confirmadas.
- `lintel/code-materials.js` — los materiales escritos en código de [Lintel / Casa Serra](https://github.com/Sam1983Aing/lintel-flat-2d) de Sam Aing, compartidos por su autor con la comunidad: duela, muros, mármol, travertino, concreto, teca, nogal, telas, cuero, metales y agua.
- `tex/` — lo que queda escaneado, de [Poly Haven](https://polyhaven.com) (CC0): `rough_linen`, `leafy_grass`, `gravelly_sand` y el cielo `kloofendal_48d_partly_cloudy_puresky`.

## Ver en local

```bash
python3 -m http.server 8765
# abre http://localhost:8765
```

## Estado

- Planta baja completa: 17 espacios con mobiliario detallado, estilo loft moderno, estudio gamer/programador y cuarto de servidores de domótica.
- Planta alta completa (lámina ARQ-02): 13 espacios — pasillo, sala TV asomada al vacío, recámara principal con vestidor, baño y balcón a la calle, recámaras 2 y 3 con vestidor y baño, y baño completo. Se llega subiendo la escalera en U y se presenta como una segunda lámina cortada a 1.20 m.
- Terraza completa (lámina ARQ-03): 10 espacios — vestíbulo, lavandería, baño, oficina y archivo bajo la azotea; comedor exterior, asador y bar bajo la pérgola, jacuzzi hundido con camastros y sala exterior. Se sube por la misma escalera en U y se presenta como la lámina 03.
- Siguiente: azotea.
