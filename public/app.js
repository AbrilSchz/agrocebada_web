const C = window.CONFIG, $ = s => document.querySelector(s);
const limites = C.limites ? L.latLngBounds(C.limites) : null;
const map = L.map('map', {
  maxBounds: limites || undefined,
  maxBoundsViscosity: 1.0
}).setView(C.centro, C.zoom);
// La vista completa debe quedar dentro de la región, sin márgenes exteriores.
// Recalcula el zoom mínimo también al volver de la tabla o cambiar de tamaño.
function ajustarLimites() {
  if (!limites || !map.getSize().x || !map.getSize().y) return;
  // Libera el mínimo anterior para poder recalcular al reducir la ventana.
  map.setMinZoom(0);
  map.setMinZoom(map.getBoundsZoom(limites, true));
  map.panInsideBounds(limites, { animate: false });
}
map.on('resize', ajustarLimites);
ajustarLimites();
let base = L.tileLayer(C.bases.calles.url, { attribution: C.bases.calles.attribution, maxZoom: 19 }).addTo(map);
document.querySelectorAll('[name=base]').forEach(r => r.onchange = () => {
  map.removeLayer(base); const b = C.bases[r.value];
  base = L.tileLayer(b.url, { attribution: b.attribution, maxZoom: 19 }).addTo(map).bringToBack();
});

const ramp = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'];
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function color(t) {
  t = Math.min(1, Math.max(0, t)) * (ramp.length - 1); const i = Math.min(Math.floor(t), ramp.length - 2), f = t - i;
  const a = hex(ramp[i]), b = hex(ramp[i + 1]); return `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * f))})`;
}

let geo, capas = [], valores = {}, rango = [0, 1];
const estilo = f => {
  const v = valores[f.id];
  return v === undefined ? { color: '#fff', weight: 1.5, fillColor: '#888', fillOpacity: 0.25 }
    : { color: '#fff', weight: 1, fillColor: color((v - rango[0]) / (rango[1] - rango[0] || 1)), fillOpacity: 0.75 };
};

let selectedParcelId = null;
let dashboardRequestIdCounter = new Map(); // parcelId -> last requestId for dashboard data
let dashboardAbortControllers = new Map(); // parcelId -> AbortController
let infoRequestIdCounter = new Map();     // parcelId -> last requestId for info
let infoAbortControllers = new Map();     // parcelId -> AbortController

async function ficha(id, latlng) {
  // Esta función ya no se usa para el popup, pero la mantenemos por si se necesita en el futuro
  const d = await (await fetch('/api/parcelas/' + encodeURIComponent(id))).json();
  const filas = d.datos.map(x => `<tr><td>${x.capa || x.capa_id}</td><td>${x.fecha}</td><td>${x.valor?.toFixed(3)}</td></tr>`).join('');
  L.popup({ maxHeight: 260 }).setLatLng(latlng).setContent(`<b>${id}</b><br><table>${filas || '<tr><td>Sin datos aún</td></tr>'}</table>`).openOn(map);
}

async function pintar() {
  const capa = $('#capa').value, fSel = $('#fecha');
  if (!capa) { valores = {}; fSel.hidden = true; $('#leyenda').innerHTML = ''; return geo.setStyle(estilo); }
  if (fSel.dataset.capa !== capa) {
    const fs = await (await fetch(`/api/capas/${capa}/fechas`)).json();
    fSel.innerHTML = fs.map(f => `<option>${f}</option>`).join(''); fSel.value = fs.at(-1); fSel.dataset.capa = capa;
  }
  fSel.hidden = false;
  const r = await (await fetch(`/api/capas/${capa}/valores?fecha=${fSel.value}`)).json();
  valores = r.valores; const c = capas.find(x => x.id === capa);
  const vs = Object.values(valores); rango = [c.min ?? Math.min(...vs), c.max ?? Math.max(...vs)];
  $('#leyenda').innerHTML = `<div class="grad" style="background:linear-gradient(90deg,${ramp})"></div><div class="rango"><span>${rango[0]}</span><span>${rango[1]}</span></div>`;
  geo.setStyle(estilo);
}

async function init() {
  const [fc, cs] = await Promise.all([fetch('/api/parcelas').then(r => r.json()), fetch('/api/capas').then(r => r.json())]);
  capas = cs;
  const grupos = {}; cs.forEach(c => (grupos[c.grupo] ??= []).push(c));
  $('#capa').insertAdjacentHTML('beforeend', Object.entries(grupos).map(([g, l]) =>
    `<optgroup label="${g}">${l.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}</optgroup>`).join(''));
  C.rasters.forEach((r, i) => $('#capa').insertAdjacentHTML('afterend', '')); // reservado para rasters
  geo = L.geoJSON(fc, { 
    style: estilo, 
    onEachFeature: (f, l) => l.on('click', e => selectParcel(f.id)) // Cambiado a selectParcel
  }).addTo(map);
  map.fitBounds(geo.getBounds());
  $('#ids').innerHTML = fc.features.map(f => `<option value="${f.id}">`).join('');
  $('#t').innerHTML = '<tr><th>ID_POLIGONO</th><th>Lon ref.</th><th>Lat ref.</th></tr>' +
    fc.features.map(f => `<tr data-id="${f.id}"><td>${f.id}</td><td>${f.properties.longitud_ref.toFixed(5)}</td><td>${f.properties.latitud_ref.toFixed(5)}</td></tr>`).join('');
  $('#t').onclick = e => { const id = e.target.closest('tr')?.dataset.id; if (id) { vista('mapa'); irA(id); } };
  $('#buscar').onchange = e => irA(e.target.value.trim());
  $('#capa').onchange = $('#fecha').onchange = pintar;
  // Botón de capas flotante
  $('#layers-button').onclick = e => {
    e.stopPropagation(); // Evitar que el clique se propague al mapa y cancele la selección
    const panel = $('#layers-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    // Actualizar el estado de aria-expanded
    $('#layers-button').setAttribute('aria-expanded', panel.style.display === 'block');
  };
  // Cerrar panel de capas con click fuera o Escape
  document.addEventListener('click', e => {
    const panel = $('#layers-panel');
    const button = $('#layers-button');
    if (!panel.contains(e.target) && !button.contains(e.target) && panel.style.display !== 'none') {
      panel.style.display = 'none';
      button.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const panel = $('#layers-panel');
      if (panel.style.display !== 'none') {
        panel.style.display = 'none';
        $('#layers-button').setAttribute('aria-expanded', 'false');
      } else {
        clearSelection(); // Si el panel no está abierto, limpiar selección
      }
    }
  });
}
function irA(id) {
  geo.eachLayer(l => { if (l.feature.id === id) { map.fitBounds(l.getBounds(), { maxZoom: 16 }); ficha(id, l.getBounds().getCenter()); } });
}
function vista(v) {
  document.querySelectorAll('.vista').forEach(s => s.hidden = s.id !== v);
  document.querySelectorAll('.nav a[data-v]').forEach(a => a.classList.toggle('active', a.dataset.v === v));
  if (v === 'mapa') setTimeout(() => map.invalidateSize(), 0);
}
document.querySelectorAll('.nav a[data-v]').forEach(a => a.onclick = e => { e.preventDefault(); vista(a.dataset.v); });
init();

// Funciones para el dashboard
function showLoadingInDashboard(id) {
  $('#dashboard-loading').text(`Cargando parcela ${id}…`).style.display = 'block';
  $('#dashboard-error').style.display = 'none';
  $('#dashboard-instructions').style.display = 'none';
  $('#dashboard-data').style.display = 'none';
  $('#info-button').disabled = true;
}
function showErrorInDashboard(message) {
  $('#dashboard-loading').style.display = 'none';
  $('#dashboard-error').textContent = message;
  $('#dashboard-error').style.display = 'block';
  $('#dashboard-instructions').style.display = 'none';
  $('#dashboard-data').style.display = 'none';
  $('#info-button').disabled = true;
}
function showInstructionsInDashboard() {
  $('#dashboard-loading').style.display = 'none';
  $('#dashboard-error').style.display = 'none';
  $('#dashboard-instructions').style.display = 'block';
  $('#dashboard-data').style.display = 'none';
  $('#info-button').disabled = true;
}
function updateDashboard(data) {
  $('#dashboard-loading').style.display = 'none';
  $('#dashboard-error').style.display = 'none';
  $('#dashboard-instructions').style.display = 'none';
  $('#dashboard-data').style.display = 'block';
  
  // Actualizar el contenido del dashboard
  const dashboardData = $('#dashboard-data');
  dashboardData.innerHTML = `
    <h1>Parcela ${data.ID_POLIGONO}</h1>
    <div class="referencia">
      <p>Coordenadas de referencia: (${data.referencia.latitud_ref.toFixed(5)}, ${data.referencia.longitud_ref.toFixed(5)})</p>
    </div>
    <div class="metrics">
      <div class="metric">
        <label>Predicción</label>
        <value>${data.demo.prediccion_simulada} ${data.demo.unidad_rendimiento}</value>
      </div>
      <div class="metric">
        <label>Observado</label>
        <value>${data.demo.observado_simulado !== null ? data.demo.observado_simulado + ' ' + data.demo.unidad_rendimiento : 'No disponible'}</value>
      </div>
      <div class="metric">
        <label>Error firmado</label>
        <value>${data.metricas_demo.error_firmado_t_ha !== null ? data.metricas_demo.error_firmado_t_ha.toFixed(2) + ' ' + data.demo.unidad_rendimiento : 'No disponible'}</value>
      </div>
      <div class="metric">
        <label>Error absoluto</label>
        <value>${data.metricas_demo.error_absoluto_t_ha !== null ? data.metricas_demo.error_absoluto_t_ha.toFixed(2) + ' ' + data.demo.unidad_rendimiento : 'No disponible'}</value>
      </div>
      <div class="metric">
        <label>Error relativo</label>
        <value>${data.metricas_demo.error_relativo_pct !== null ? data.metricas_demo.error_relativo_pct.toFixed(2) + '%' : 'No disponible'}</value>
      </div>
      <div class="metric">
        <label>MAE historial</label>
        <value>${data.metricas_demo.mae_historial_t_ha !== null ? data.metricas_demo.mae_historial_t_ha.toFixed(2) + ' ' + data.demo.unidad_rendimiento : 'No disponible'}</value>
      </div>
    </div>
    <div class="chart">
      <h3>Observado vs Predicción por campaña</h3>
      <div id="chart1"></div>
    </div>
    <div class="chart">
      <h3>Error firmado por campaña</h3>
      <div id="chart2"></div>
    </div>
    <div class="chart">
      <h3>Contribuciones a la predicción</h3>
      <div id="chart3"></div>
    </div>
    <div class="table-wrap">
      <h3>Valores existentes</h3>
      <table id="dashboard-table">
        <thead><tr><th>Variable</th><th>Valor</th><th>Unidad</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <button id="info-button" disabled>Información inteligente</button>
    <div id="info-loading" style="display:none;text-align:center;padding:10px;color:#666;">Generando explicación…</div>
    <div id="info-error" style="display:none;background:#ffebee;color:#c62828;padding:10px;border-radius:4px;margin:10px 0;"></div>
    <div id="info-response" style="display:none;white-space:pre-line;font-family:monospace;background:#f8f9fa;padding:10px;border-radius:4px;margin:10px 0;"></div>
  `;
  
  // Renderizar gráficas (simplificado con SVG estático para demostración)
  renderChart1(data);
  renderChart2(data);
  renderChart3(data);
  
  // Renderizar tabla de valores existentes (vacía en esta implementación de demo)
  const tbody = $('#dashboard-table tbody');
  tbody.innerHTML = ''; // En la demo no tenemos datos en la tabla datos
  
  // Configurar botón de información inteligente
  const infoButton = $('#info-button');
  infoButton.disabled = false;
  infoButton.onclick = () => requestExplanation(data.ID_POLIGONO);
  
  // Resaltar la parcela seleccionada en el mapa
  highlightSelectedParcel(data.ID_POLIGONO);
}
function highlightSelectedParcel(id) {
  // Restablecer estilo de todas las parcelas
  geo.eachLayer(layer => {
    layer.setStyle(estilo);
  });
  // Aplicar estilo de resalto a la parcela seleccionada
  geo.eachLayer(layer => {
    if (layer.feature.id === id) {
      layer.setStyle({
        ...estilo(layer.feature),
        weight: 2,
        fillOpacity: 0.9
      });
    }
  });
}
function renderChart1(data) {
  // Gráfica 1: Observado vs Predicción por campaña
  const container = $('#chart1');
  container.innerHTML = `
    <svg width="100%" height="150" viewBox="0 0 400 150" preserveAspectRatio="xMidYMid meet">
      <!-- Ejes -->
      <line x1="50" y1="130" x2="350" y2="130" stroke="#ccc" stroke-width="1"/>
      <line x1="50" y1="130" x2="50" y2="20" stroke="#ccc" stroke-width="1"/>
      <!-- Etiquetas de ejes -->
      <text x="200" y="145" text-anchor="middle" font-size="10">Campaña</text>
      <text x="15" y="80" text-anchor="middle" font-size="10" transform="rotate(-90)">Rendimiento (t/ha)</text>
      <!-- Datos de ejemplo -->
      ${data.demo.historial_simulado.map((h, i) => {
        const x = 50 + (i * 100); // Espaciado simple
        const yObs = h.observado !== null ? 130 - (h.observado * 20) : 130; // Escala arbitraria
        const yPred = 130 - (h.prediccion * 20);
        return `
          <circle cx="${x}" cy="${yObs}" r="4" fill="#3b528b" />
          <circle cx="${x+10}" cy="${yPred}" r="4" fill="#21918c" />
          <line x1="${x}" y1="${yObs}" x2="${x+10}" y2="${yPred}" stroke="#666" stroke-dasharray="2,2" />
          <text x="${x+5}" y="140" text-anchor="middle" font-size="8">${h.campaña}</text>
        `;
      }).join('')}
      <!-- Leyenda -->
      <rect x="250" y="10" width="12" height="12" fill="#3b528b"/>
      <text x="270" y="20" font-size="10">Observado</text>
      <rect x="250" y="30" width="12" height="12" fill="#21918c"/>
      <text x="270" y="40" font-size="10">Predicción</text>
    </svg>
    <p><small>DEMO: datos simulados</small></p>
  `;
}
function renderChart2(data) {
  // Gráfica 2: Error firmado por campaña
  const container = $('#chart2');
  container.innerHTML = `
    <svg width="100%" height="150" viewBox="0 0 400 150" preserveAspectRatio="xMidYMid meet">
      <!-- Ejes -->
      <line x1="50" y1="130" x2="350" y2="130" stroke="#ccc" stroke-width="1"/>
      <line x1="50" y1="130" x2="50" y2="20" stroke="#ccc" stroke-width="1"/>
      <!-- Línea cero -->
      <line x1="50" y1="80" x2="350" y2="80" stroke="#000" stroke-width="1" stroke-dasharray="4,2"/>
      <!-- Etiquetas de ejes -->
      <text x="200" y="145" text-anchor="middle" font-size="10">Campaña</text>
      <text x="15" y="80" text-anchor="middle" font-size="10" transform="rotate(-90)">Error (t/ha)</text>
      <!-- Datos de ejemplo -->
      ${data.demo.historial_simulado.map((h, i) => {
        const x = 50 + (i * 100);
        const error = h.observado !== null ? (h.prediccion - h.observado) : 0;
        const y = 80 - (error * 40); // Escala arbitraria
        return `
          <rect x="${x-10}" y="${y > 80 ? 80 : y}" width="20" height="${Math.abs(y - 80)}" fill="${y > 80 ? '#21918c' : '#3b528b'}"/>
          <text x="${x}" y="140" text-anchor="middle" font-size="8">${h.campaña}</text>
        `;
      }).join('')}
      <!-- Leyenda -->
      <rect x="250" y="10" width="12" height="12" fill="#3b528b"/>
      <text x="270" y="20" font-size="10">Error positivo (sobreestimación)</text>
      <rect x="250" y="30" width="12" height="12" fill="#21918c"/>
      <text x="270" y="40" font-size="10">Error negativo (subestimación)</text>
    </svg>
    <p><small>DEMO: datos simulados</small></p>
  `;
}
function renderChart3(data) {
  // Gráfica 3: Contribuciones a la predicción
  const container = $('#chart3');
  container.innerHTML = `
    <svg width="100%" height="150" viewBox="0 0 400 150" preserveAspectRatio="xMidYMid meet">
      <!-- Ejes -->
      <line x1="100" y1="130" x2="350" y2="130" stroke="#ccc" stroke-width="1"/>
      <line x1="100" y1="130" x2="100" y2="20" stroke="#ccc" stroke-width="1"/>
      <!-- Línea cero -->
      <line x1="100" y1="80" x2="350" y2="80" stroke="#000" stroke-width="1" stroke-dasharray="4,2"/>
      <!-- Etiquetas de ejes -->
      <text x="225" y="145" text-anchor="middle" font-size="10">Variable</text>
      <text x="50" y="75" text-anchor="middle" font-size="10" transform="rotate(-90)">Aporte (t/ha)</text>
      <!-- Barras de contribuciones -->
      ${data.demo.contribuciones_simuladas.map((c, i) => {
        const x = 120 + (i * 60);
        const height = Math.abs(c.aporte_t_ha * 20); // Escala arbitraria
        const y = c.aporte_t_ha >= 0 ? 130 - height : 130;
        return `
          <rect x="${x}" y="${y}" width="40" height="${height}" fill="${c.aporte_t_ha >= 0 ? '#21918c' : '#3b528b'}"/>
          <text x="${x+20}" y="145" text-anchor="middle" font-size="8" transform="rotate(45)">${c.variable}</text>
        `;
      }).join('')}
      <!-- Valor base y predicción -->
      <line x1="100" y1="${130 - (data.demo.valor_base_simulado * 20)}" x2="350" y2="${130 - (data.demo.valor_base_simulado * 20)}" stroke="#666" stroke-width="2" stroke-dasharray="4,2"/>
      <text x="360" y="${128 - (data.demo.valor_base_simulado * 20)}" font-size="10">Valor base</text>
      <line x1="100" y1="${130 - (data.demo.prediccion_simulada * 20)}" x2="350" y2="${130 - (data.demo.prediccion_simulada * 20)}" stroke="#1f3d2b" stroke-width="2"/>
      <text x="360" y="${128 - (data.demo.prediccion_simulada * 20)}" font-size="10" fill="#1f3d2b">Predicción</text>
    </svg>
    <p><small>DEMO: datos simulados</small></p>
  `;
}
function requestExplanation(parcelId) {
  // Mostrar estado de carga
  $('#info-loading').style.display = 'block';
  $('#info-error').style.display = 'none';
  $('#info-response').style.display = 'none';
  $('#info-button').disabled = true;
  
  // Incrementar contador de solicitudes y crear AbortController
  const requestId = (infoRequestIdCounter.get(parcelId) || 0) + 1;
  infoRequestIdCounter.set(parcelId, requestId);
  const abortController = new AbortController();
  infoAbortControllers.set(parcelId, abortController);
  
  // Llamar al endpoint
  fetch(`/api/parcelas/${encodeURIComponent(parcelId)}/informacion-inteligente`, { 
    signal: abortController.signal 
  })
  .then(response => {
    if (!response.ok) throw new Error(`Error del servidor: ${response.status}`);
    return response.json();
  })
  .then(data => {
    // Verificar que esta sea la solicitud más reciente
    if (requestId !== infoRequestIdCounter.get(parcelId)) return;
    $('#info-loading').style.display = 'none';
    $('#info-response').textContent = data.explanation;
    $('#info-response').style.display = 'block';
    $('#info-button').disabled = false;
  })
  .catch(error => {
    if (error.name === 'AbortError') return; // Ignorar solicitudes abortadas
    $('#info-loading').style.display = 'none';
    $('#info-error').textContent = error.message;
    $('#info-error').style.display = 'block';
    $('#info-button').disabled = false;
  });
}
// Función para limpiar selección
function clearSelection() {
  selectedParcelId = null;
  // Restablecer estilo de todas las parcelas
  geo.eachLayer(layer => {
    layer.setStyle(estilo);
  });
  showInstructionsInDashboard();
  // Cancelar cualquier solicitud en curso para la parcela previamente seleccionada
  // (En una implementación más completa, guardaríamos el ID anterior y cancelaríamos sus solicitudes)
  // Por ahora, confiamos en que el mecanismo de requestId maneje las solicitudes obsoletas
}
// Manejar tecla Escape para limpiar selección (ya está en init, pero lo dejamos aquí por claridad)
// document.addEventListener('keydown', e => { if (e.key === 'Escape') clearSelection(); });
