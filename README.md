# Casa Ensenada · recorrido 3D

Landing de scroll que convierte el plano arquitectónico de la casa (ARQ-01 a ARQ-04, esc. 1:100) en un recorrido 3D por zonas: el plano levanta muros y niveles, la cámara entra desde la calle y cada espacio pasa de dibujo en tinta a render.

- `index.html` — la página completa (three.js 0.170 + GSAP ScrollTrigger + Lenis desde CDN, sin build).
- `geometria.json` — lectura del plano: ejes, niveles, espacios, puertas y decisiones confirmadas.
- `tex/` — texturas escaneadas (1k) y cielo HDRI de [Poly Haven](https://polyhaven.com), licencia CC0: `laminate_floor_02`, `concrete_floor_02`, `square_concrete_pavers`, `white_plaster_rough_02`, `rough_linen`, `leafy_grass`, `gravelly_sand`, `asphalt_02`, `oak_veneer_01`, `wood_table_001`, `brown_planks_05` y `kloofendal_48d_partly_cloudy_puresky`.

## Ver en local

```bash
python3 -m http.server 8765
# abre http://localhost:8765
```

## Estado

- Planta baja completa: 17 espacios con mobiliario detallado, estilo loft moderno, estudio gamer/programador y cuarto de servidores de domótica.
- Siguiente: planta alta (sala TV, 3 recámaras con vestidor y baño, balcón), terraza y azotea.
