# Casa Ensenada · recorrido 3D

Landing de scroll que convierte el plano arquitectónico de la casa (ARQ-01 a ARQ-04, esc. 1:100) en un recorrido 3D por zonas: el plano levanta muros y niveles, la cámara entra desde la calle y cada espacio pasa de dibujo en tinta a render.

- `index.html` — la página completa (three.js 0.170 + GSAP ScrollTrigger + Lenis desde CDN, sin build).
- `geometria.json` — lectura del plano: ejes, niveles, espacios, puertas y decisiones confirmadas.

## Ver en local

```bash
python3 -m http.server 8765
# abre http://localhost:8765
```

## Estado

- Planta baja completa: 17 espacios con mobiliario detallado, estilo loft moderno, estudio gamer/programador y cuarto de servidores de domótica.
- Siguiente: planta alta (sala TV, 3 recámaras con vestidor y baño, balcón), terraza y azotea.
