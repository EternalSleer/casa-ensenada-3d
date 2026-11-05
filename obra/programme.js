// Basado en flat-to-3d/04-build-time-lapse de Sam Aing (MIT), ver LICENSE-flat-to-3d.txt.
// El programa: una sola lista de semanas que leen el cargador, la hoja, el calendario y la obra en 3D.
// Es un script clásico para que el cargador se vea antes de que llegue three.js.
(function () {
  const WEEKS = 40;
  // [nombre, inicio, fin] en semanas, continuo: 0 es la primera mañana en obra, 40 es la entrega
  const PROG = [
    ['Excavación', 0, 2], ['Cimentación', 2, 6.2], ['Muros de block PB', 6.2, 10.6], ['Losa N.P.T. 2.80', 10.4, 13.6],
    ['Muros de block PA', 13.2, 17.6], ['Losa N.P.T. 5.60', 17.2, 19.8], ['Terraza y azotea', 19.6, 24.4], ['Aplanados y acabados', 24.6, 40],
  ];
  // los seis dibujos de la lámina OB-01, cada uno la casa al final de sus semanas (w0/w1 enteros: la leyenda dice "Sem w0+1–w1")
  const TILES = [
    { n: '01', name: 'Excavación y cimentación', w0: 0, w1: 5 },
    { n: '02', name: 'Firme y muros de block PB', w0: 5, w1: 11 },
    { n: '03', name: 'Losa N.P.T. 2.80', w0: 11, w1: 14 },
    { n: '04', name: 'Muros de block PA', w0: 14, w1: 18 },
    { n: '05', name: 'Losa 5.60, terraza y azotea', w0: 18, w1: 25 },
    { n: '06', name: 'Aplanados, acabados y entrega', w0: 25, w1: 40 },
  ];
  const pad = (n) => String(n).padStart(2, '0');
  const SEQ = window.SEQ = { WEEKS, PROG, TILES, pad, progress: 0, real: false };

  // el bloque del programa: filas, la línea de hoy y un pie para el cargador
  const prog = document.getElementById('prog');
  prog.innerHTML = '<div class="rows"><div class="rowsbg"></div>' + PROG.map(([n, a, b], i) =>
    `<div class="row"><span>${pad(i + 1)} ${n}</span><div class="trk"><i class="plan" style="left:${a / WEEKS * 100}%;width:${(b - a) / WEEKS * 100}%"><i class="done"></i></i></div></div>`).join('') +
    '<div class="now"><b>Sem 00</b></div></div><div class="foot"><span>OB-01 &nbsp;//&nbsp; Programa &nbsp;//&nbsp; 40 semanas</span><span class="pct">000</span></div>';
  // los seis dibujos de la hoja
  document.getElementById('grid').innerHTML = TILES.map((t) =>
    `<figure class="tile"><div class="frame" data-num="${t.n}"></div><figcaption><span class="nm"><b>${t.n}</b>${t.name}</span><span class="wk">Sem ${pad(t.w0 + 1)}–${pad(t.w1)}</span></figcaption></figure>`).join('');

  // pone el programa al centro de la pantalla, más grande, hasta que la página esté lista
  const phone = innerWidth <= 700;
  prog.style.setProperty('--lab', phone ? '104px' : '148px');
  SEQ.place = function (mode) {
    const slot = document.getElementById('progSlot').getBoundingClientRect();
    prog.style.left = slot.left + 'px'; prog.style.top = slot.top + 6 + 'px'; prog.style.width = slot.width + 'px';
    if (mode === 'loader') {
      const k = phone ? 1.0 : 1.32, w = slot.width * k, h = prog.offsetHeight * k;
      prog.style.transform = `translate(${(innerWidth - w) / 2 - slot.left}px, ${(innerHeight - h) / 2 - slot.top - 6}px) scale(${k})`;
    } else prog.style.transform = 'none';
  };
  SEQ.place('loader');

  // el cargador: la barra planeada de cada fila se dibuja conforme la página se prepara
  const plans = prog.querySelectorAll('.plan'), pct = prog.querySelector('.pct');
  const t0 = performance.now();
  let tPrev = t0;
  (function tick() {
    if (SEQ.docked) return;
    const now = performance.now(), dt = Math.min(0.25, (now - tPrev) / 1000); tPrev = now;
    // mientras la página no reporta avance real, avanza solo para que las primeras barras se dibujen mientras baja three.js
    const target = SEQ.real ? SEQ.progress : Math.min(0.3, (now - t0) / 4000);
    // lo mostrado sube suave hacia el avance real, a lo más 90 % por segundo, y nunca baja
    SEQ.shown = (SEQ.shown || 0) + Math.max(0, Math.min(target - (SEQ.shown || 0), dt * 0.9));
    plans.forEach((p, i) => p.classList.toggle('in', SEQ.shown >= (i + 0.5) / PROG.length));
    pct.textContent = String(Math.round(SEQ.shown * 100)).padStart(3, '0');
    requestAnimationFrame(tick);
  })();
})();
