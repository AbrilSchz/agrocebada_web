const C = window.CONFIG, $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = (value, digits = 2) => value == null || !Number.isFinite(Number(value)) ? 'No disponible' : Number(value).toFixed(digits);
const limites = C.limites ? L.latLngBounds(C.limites) : null;
const map = L.map('map', { maxBounds: limites || undefined, maxBoundsViscosity: 1.0 }).setView(C.centro, C.zoom);
function ajustarLimites() {
  if (!limites || !map.getSize().x || !map.getSize().y) return;
  map.setMinZoom(0);
  map.setMinZoom(map.getBoundsZoom(limites, true));
  map.panInsideBounds(limites, { animate: false });
}
map.on('resize', ajustarLimites);
ajustarLimites();
const resizeObserver = new ResizeObserver(() => { if (!$('#container').hidden) map.invalidateSize(); });
resizeObserver.observe($('#map'));
let base = L.tileLayer(C.bases.calles.url, { attribution: C.bases.calles.attribution, maxZoom: 19 }).addTo(map);
document.querySelectorAll('[name=base]').forEach(r => r.onchange = () => {
  map.removeLayer(base);
  const b = C.bases[r.value];
  base = L.tileLayer(b.url, { attribution: b.attribution, maxZoom: 19 }).addTo(map).bringToBack();
});
let activeChart = 'rendimiento';
const temporal = {enabled:false,model:null,campaign:null,metric:'prediccion',models:[],sequence:0,activation:0,controller:null,timer:null};
let temporalCataloguePromise=null;
const ramp = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'];
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function color(t) {
  t = Math.min(1, Math.max(0, t)) * (ramp.length - 1);
  const i = Math.min(Math.floor(t), ramp.length - 2), f = t - i, a = hex(ramp[i]), b = hex(ramp[i + 1]);
  return `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * f))})`;
}
let geo, capas = [], valores = {}, rango = [0, 1], selectedParcelId = null;
let dashboardSequence = 0, dashboardController = null, infoSequence = 0, infoController = null, currentDashboard = null, layerSequence = 0;
const estilo = feature => {
  const v = valores[feature.id], selected = String(feature.id) === selectedParcelId;
  return { color: selected ? '#ffb000' : '#fff', weight: selected ? 3 : ($('#contornos').checked ? 1.5 : 0),
    fillColor: v == null ? '#888' : color((v - rango[0]) / (rango[1] - rango[0] || 1)),
    fillOpacity: Number($('#opacidad').value) * (v == null ? 0.4 : 1) };
};
function refreshStyle() { if (geo) geo.setStyle(estilo); }
async function json(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Error del servidor: ${response.status}`);
  if (data == null) throw new Error('El servidor no devolvió JSON válido');
  return data;
}
function toggleLayers(open) {
  $('#layers-panel').hidden = !open;
  $('#layers-button').setAttribute('aria-expanded', String(open));
}
$('#layers-button').onclick = () => toggleLayers($('#layers-panel').hidden);
L.DomEvent.disableClickPropagation($('#layers-panel'));
L.DomEvent.disableScrollPropagation($('#layers-panel'));
L.DomEvent.disableClickPropagation($('#layers-button'));
document.addEventListener('click', e => {
  if (!$('#layers-panel').contains(e.target) && !$('#layers-button').contains(e.target)) toggleLayers(false);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('#layers-panel').hidden) { toggleLayers(false); $('#layers-button').focus(); }
  else clearSelection();
});
$('#opacidad').oninput = $('#contornos').onchange = refreshStyle;
async function pintar() {
  if (temporal.enabled) return;
  const sequence = ++layerSequence, capa = $('#capa').value, fSel = $('#fecha');
  $('#layers-error').hidden = true;
  if (!capa) { valores = {}; fSel.hidden = true; $('#leyenda').replaceChildren(); refreshStyle(); return; }
  try {
    if (fSel.dataset.capa !== capa) {
      const fechas = await json(`/api/capas/${encodeURIComponent(capa)}/fechas`);
      if (sequence !== layerSequence || temporal.enabled) return;
      fSel.innerHTML = fechas.map(f => `<option value="${esc(f)}">${esc(f || 'Sin fecha')}</option>`).join('');
      fSel.value = fechas.at(-1) ?? ''; fSel.dataset.capa = capa;
    }
    fSel.hidden = false;
    const data = await json(`/api/capas/${encodeURIComponent(capa)}/valores?fecha=${encodeURIComponent(fSel.value)}`);
    if (sequence !== layerSequence || temporal.enabled) return;
    valores = data.valores;
    const c = capas.find(x => x.id === capa), vs = Object.values(valores).filter(v => v != null && Number.isFinite(v));
    rango = [c?.min ?? (vs.length ? Math.min(...vs) : 0), c?.max ?? (vs.length ? Math.max(...vs) : 1)];
    $('#leyenda').innerHTML = `<div class="grad" style="background:linear-gradient(90deg,${ramp})"></div><div class="rango"><span>${esc(number(rango[0]))}</span><span>${esc(number(rango[1]))}</span></div><small>${esc(c?.unidad || '')}</small>`;
    refreshStyle();
  } catch (error) { if (sequence === layerSequence) { $('#layers-error').textContent = error.message; $('#layers-error').hidden = false; } }
}
$('#capa').onchange = $('#fecha').onchange = () => { disableTemporal(false); pintar(); };
$('#info-button').onclick = () => { if (currentDashboard) requestExplanation(currentDashboard); };
function vista(view) {
  $('#container').hidden = view !== 'mapa'; $('#tabla').hidden = view !== 'tabla'; $('#documentacion').hidden = view !== 'documentacion';
  if (view !== 'mapa') stopPlayback();
  document.querySelectorAll('.nav a[data-v]').forEach(a => a.classList.toggle('active', a.dataset.v === view));
  if (view === 'mapa') requestAnimationFrame(() => { map.invalidateSize(); ajustarLimites(); });
}
document.querySelectorAll('.nav a[data-v]').forEach(a => a.onclick = e => { e.preventDefault(); vista(a.dataset.v); });
function irA(id) {
  if (!geo) return;
  let found = false;
  geo.eachLayer(layer => {
    if (String(layer.feature.id) !== id) return;
    found = true; vista('mapa'); map.fitBounds(layer.getBounds(), { maxZoom: 16 }); ajustarLimites(); selectParcel(id);
  });
  if (!found && id) { $('#map-status').textContent = `Parcela ${id} no encontrada`; $('#map-status').hidden = false; }
}
$('#buscar').onchange = e => irA(e.target.value.trim());
async function init() {
  // El fallo de una capa no debe impedir dibujar las parcelas.
  const [parcelResult, layerResult] = await Promise.allSettled([json('/api/parcelas'), json('/api/capas')]);
  if (parcelResult.status === 'fulfilled') {
    const fc = parcelResult.value;
    geo = L.geoJSON(fc, { style: estilo, onEachFeature: (feature, layer) => layer.on('click', e => {
      if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
      selectParcel(String(feature.id));
    }) }).addTo(map);
    if (geo.getBounds().isValid()) { map.fitBounds(geo.getBounds()); ajustarLimites(); }
    $('#ids').innerHTML = fc.features.map(f => `<option value="${esc(f.id)}"></option>`).join('');
    $('#t').innerHTML = `<caption>${fc.features.length} parcelas disponibles</caption><thead><tr><th>ID_POLIGONO</th><th>Lon ref.</th><th>Lat ref.</th></tr></thead><tbody>` +
      fc.features.map(f => `<tr data-id="${esc(f.id)}"><td><button type="button">${esc(f.id)}</button></td><td>${number(f.properties.longitud_ref, 5)}</td><td>${number(f.properties.latitud_ref, 5)}</td></tr>`).join('') + '</tbody>';
    $('#t').onclick = e => { const id = e.target.closest('tr')?.dataset.id; if (id) irA(id); };
    $('#map-status').hidden = true;
  } else { $('#map-status').textContent = `No se pudieron cargar las parcelas: ${parcelResult.reason.message}`; }
  if (layerResult.status === 'fulfilled') {
    capas = layerResult.value;
    const grupos = {}; capas.forEach(c => (grupos[c.grupo] ??= []).push(c));
    $('#capa').insertAdjacentHTML('beforeend', Object.entries(grupos).map(([grupo, lista]) =>
      `<optgroup label="${esc(grupo)}">${lista.map(c => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('')}</optgroup>`).join(''));
  } else { $('#layers-error').textContent = `No se pudieron cargar las capas: ${layerResult.reason.message}`; $('#layers-error').hidden = false; }
}
function dashboardState(state, message = '') {
  $('#dashboard-loading').hidden = state !== 'loading';
  $('#dashboard-error').hidden = state !== 'error';
  $('#dashboard-instructions').hidden = state !== 'instructions';
  $('#dashboard-data').hidden = state !== 'data';
  $('#info-button').disabled = state !== 'data';
  $('#ai-caption').textContent = state === 'data' ? `Analiza la campaña ${currentDashboard.campaña} de la parcela ${currentDashboard.ID_POLIGONO}.` : state === 'loading' ? message : 'Selecciona una parcela con resultados para activar el análisis.';
  if (state === 'loading') $('#dashboard-loading').textContent = message;
  if (state === 'error') $('#dashboard-error').textContent = message;
}
async function selectParcel(id) {
  selectedParcelId = String(id); currentDashboard = null;
  const sequence = ++dashboardSequence;
  ++infoSequence; dashboardController?.abort(); infoController?.abort();
  dashboardController = new AbortController();
  $('#dashboard-data').replaceChildren(); clearExplanation();
  dashboardState('loading', `Cargando parcela ${id}…`); refreshStyle();
  try {
    const selectors = temporal.enabled ? `?${new URLSearchParams({'campaña':temporal.campaign,version_modelo:temporal.model})}` : '';
    const data = await json(`/api/parcelas/${encodeURIComponent(id)}/dashboard${selectors}`, { signal: dashboardController.signal });
    if (sequence !== dashboardSequence || selectedParcelId !== String(id)) return;
    currentDashboard = data; updateDashboard(data);
  } catch (error) {
    if (sequence !== dashboardSequence || error.name === 'AbortError') return;
    dashboardState('error', `Parcela ${id}: ${error.message}`);
  }
}
function clearSelection() {
  ++dashboardSequence; ++infoSequence; dashboardController?.abort(); infoController?.abort();
  selectedParcelId = null; currentDashboard = null; $('#dashboard-data').replaceChildren(); clearExplanation();
  dashboardState('instructions'); refreshStyle();
}
function clearExplanation() {
  $('#info-loading').hidden = true; $('#info-error').hidden = true; $('#info-response').hidden = true;
  $('#info-response').textContent = ''; $('#info-button').setAttribute('aria-busy','false');
}
function showChart(name, focus = false) {
  activeChart=name;
  document.querySelectorAll('[data-chart-tab]').forEach(button => {
    const selected=button.dataset.chartTab === name;
    button.setAttribute('aria-selected',String(selected));button.tabIndex=selected ? 0 : -1;
    if (focus && selected) button.focus();
  });
  document.querySelectorAll('[data-chart-panel]').forEach(panel => panel.hidden=panel.dataset.chartPanel !== name);
}
function updateDashboard(data) {
  const r = data.resultado, m = data.metricas, unidad = data.unidad_rendimiento;
  const label = data.dataset.label;
  const metric = (name, value, unit = unidad) => `<div class="metric"><span class="metric-label">${esc(name)}</span><strong class="metric-value">${number(value)}${value == null ? '' : ' ' + esc(unit)}</strong></div>`;
  $('#dashboard-data').innerHTML = `<div class="dashboard-heading"><h1>Parcela ${esc(data.ID_POLIGONO)}</h1><span class="dataset-label">${esc(label)}</span></div>
    <p class="parcel-meta">Campaña ${esc(data.campaña)} · Modelo ${esc(data.version_modelo)}<br>Coordenadas: ${number(data.referencia.latitud_ref, 5)}, ${number(data.referencia.longitud_ref, 5)}</p>
    <div class="metrics">${metric('Predicción', r.prediccion)}${metric('Observado', r.observado)}${metric('Error firmado', m.error_firmado_t_ha)}${metric('Error absoluto', m.error_absoluto_t_ha)}${metric('Error relativo', m.error_relativo_pct, '%')}${metric('MAE historial', m.mae_historial_t_ha)}</div>
    <div class="chart-context"><span>Explora tus resultados</span><span>Campaña activa: ${esc(data.campaña)}</span></div>
    <div class="charts-shell">
      <div class="chart-tabs" role="tablist" aria-label="Gráficas de la parcela">
        <button id="tab-rendimiento" type="button" role="tab" data-chart-tab="rendimiento" aria-controls="panel-rendimiento">Rendimiento</button>
        <button id="tab-errores" type="button" role="tab" data-chart-tab="errores" aria-controls="panel-errores">Errores</button>
        <button id="tab-aportes" type="button" role="tab" data-chart-tab="aportes" aria-controls="panel-aportes">Aportes</button>
      </div>
      <div id="panel-rendimiento" class="chart" role="tabpanel" data-chart-panel="rendimiento" aria-labelledby="tab-rendimiento"><h3>Observado y predicción por campaña</h3><div id="chart1"></div><p class="chart-legend"><span style="--color:#3b528b">Observado</span><span style="--color:#21918c">Predicción</span></p><small>${esc(label)} · ${esc(unidad)}. Selecciona una campaña de la gráfica para verla en el mapa.</small></div>
      <div id="panel-errores" class="chart" role="tabpanel" data-chart-panel="errores" aria-labelledby="tab-errores" hidden><h3>Error firmado por campaña</h3><div id="chart2"></div><small>${esc(label)} · Predicción menos observado (${esc(unidad)}). Selecciona una campaña para ver su error en el mapa.</small></div>
      <div id="panel-aportes" class="chart" role="tabpanel" data-chart-panel="aportes" aria-labelledby="tab-aportes" hidden><h3>Contribuciones locales · ${esc(data.campaña)}</h3><div id="chart3"></div><small>${esc(label)} · Los aportes no prueban causalidad.</small></div>
    </div>
    <details class="data-details"><summary>Variables de la explicación</summary><div class="table-wrap"><table><thead><tr><th>Variable</th><th>Valor</th><th>Unidad</th><th>Aporte (${esc(unidad)})</th></tr></thead><tbody>${data.contribuciones.map(c => `<tr><td>${esc(c.variable)}</td><td>${number(c.valor)}</td><td>${esc(c.unidad)}</td><td>${number(c.aporte_t_ha)}</td></tr>`).join('') || '<tr><td colspan="4">No hay contribuciones disponibles para esta campaña.</td></tr>'}</tbody></table></div></details>
    <details class="data-details"><summary>Valores existentes en la base</summary><div class="table-wrap"><table><thead><tr><th>Capa</th><th>Fecha</th><th>Valor</th><th>Unidad</th></tr></thead><tbody>${data.mediciones_existentes.map(x => `<tr><td>${esc(x.capa || x.capa_id)}</td><td>${esc(x.fecha)}</td><td>${number(x.valor, 3)}</td><td>${esc(x.unidad)}</td></tr>`).join('') || '<tr><td colspan="4">Sin valores disponibles.</td></tr>'}</tbody></table></div></details>`;
  renderChart1(data); renderChart2(data); renderChart3(data);
  showChart(activeChart); dashboardState('data');
  document.querySelectorAll('[data-chart-tab]').forEach(button => {
    button.onclick=() => showChart(button.dataset.chartTab);
    button.onkeydown=e => {
      const tabs=['rendimiento','errores','aportes'],index=tabs.indexOf(activeChart);
      const next=e.key==='ArrowRight' ? (index+1)%3 : e.key==='ArrowLeft' ? (index+2)%3 : e.key==='Home' ? 0 : e.key==='End' ? 2 : null;
      if (next!=null) { e.preventDefault();showChart(tabs[next],true); }
    };
  });
  $('#dashboard-data').onclick=e => {
    const hit=e.target.closest('[data-campaign]');
    if (hit) activateTemporal({campaign:hit.dataset.campaign,model:data.version_modelo,metric:hit.closest('#chart2') ? 'error_firmado_t_ha' : 'prediccion'});
  };
  $('#dashboard-data').onkeydown=e => {
    const hit=e.target.closest('[data-campaign]');
    if (hit && ['Enter',' '].includes(e.key)) { e.preventDefault();hit.dispatchEvent(new MouseEvent('click',{bubbles:true})); }
  };
}
function svgChart(content, height = 190) { return `<svg viewBox="0 0 460 ${height}" role="img" aria-label="Gráfica de resultados">${content}</svg>`; }
function renderChart1(data) {
  const rows = data.historial, max = Math.max(1, ...rows.flatMap(h => [h.prediccion, h.observado]).filter(v => v != null)) * 1.15;
  const y = v => 145 - 125 * v / max, x = i => 70 + i * 335 / Math.max(1, rows.length - 1);
  let svg = `<line x1="48" y1="145" x2="435" y2="145" stroke="#bbb"/><line x1="48" y1="20" x2="48" y2="145" stroke="#bbb"/>`;
  for (let i = 0; i <= 4; i++) { const value = max * i / 4; svg += `<text x="40" y="${y(value) + 4}" text-anchor="end" font-size="11">${number(value, 1)}</text>`; }
  rows.forEach((h, i) => {
    svg += `<g class="campaign-hit" data-campaign="${esc(h.campaña)}" role="button" tabindex="0" aria-label="Ver campaña ${esc(h.campaña)} en el mapa"><rect x="${x(i)-24}" y="15" width="48" height="165" fill="transparent"/>`;
    svg += `<circle cx="${x(i) + 5}" cy="${y(h.prediccion)}" r="5" fill="#21918c"><title>Predicción: ${number(h.prediccion)}</title></circle>`;
    if (h.observado != null) svg += `<circle cx="${x(i) - 5}" cy="${y(h.observado)}" r="5" fill="#3b528b"><title>Observado: ${number(h.observado)}</title></circle>`;
    else svg += `<text x="${x(i)}" y="180" text-anchor="middle" font-size="10">Sin observado</text>`;
    svg += `<text x="${x(i)}" y="163" text-anchor="middle" font-size="11">${esc(h.campaña)}</text></g>`;
  });
  $('#chart1').innerHTML = rows.length ? svgChart(svg) : '<p>Sin historial.</p>';
}
function renderChart2(data) {
  const rows = data.historial, max = Math.max(.1, ...rows.map(h => Math.abs(h.error_firmado_t_ha ?? 0))) * 1.15;
  const x = i => 75 + i * 320 / Math.max(1, rows.length - 1);
  let svg = '<line x1="48" y1="85" x2="435" y2="85" stroke="#777"/><text x="40" y="89" text-anchor="end" font-size="11">0</text>';
  svg += `<text x="40" y="24" text-anchor="end" font-size="11">${number(max)}</text><text x="40" y="152" text-anchor="end" font-size="11">−${number(max)}</text>`;
  rows.forEach((h, i) => {
    svg += `<g class="campaign-hit" data-campaign="${esc(h.campaña)}" role="button" tabindex="0" aria-label="Ver error de campaña ${esc(h.campaña)} en el mapa"><rect x="${x(i)-24}" y="15" width="48" height="165" fill="transparent"/>`;
    const value = h.error_firmado_t_ha;
    if (value == null) svg += `<text x="${x(i)}" y="80" text-anchor="middle" font-size="11">N/D</text>`;
    else { const height = Math.abs(value) * 62 / max; svg += `<rect x="${x(i)-14}" y="${value >= 0 ? 85-height : 85}" width="28" height="${height}" fill="${value >= 0 ? '#3b528b' : '#21918c'}"><title>${number(value)} ${esc(data.unidad_rendimiento)}</title></rect>`; }
    svg += `<text x="${x(i)}" y="171" text-anchor="middle" font-size="11">${esc(h.campaña)}</text></g>`;
  });
  $('#chart2').innerHTML = rows.length ? svgChart(svg) : '<p>Sin historial.</p>';
}
function renderChart3(data) {
  const rows = data.contribuciones;
  if (!rows.length) { $('#chart3').innerHTML = '<p>No hay contribuciones locales disponibles.</p>'; return; }
  const max = Math.max(.01, ...rows.map(c => Math.abs(c.aporte_t_ha))), height = rows.length * 36 + 40, zero = 310;
  let svg = `<line x1="${zero}" y1="5" x2="${zero}" y2="${height-28}" stroke="#777"/>`;
  rows.forEach((c, i) => {
    const width = Math.abs(c.aporte_t_ha) * 96 / max, y = i * 36 + 10;
    svg += `<text x="195" y="${y+16}" text-anchor="end" font-size="11">${esc(c.variable)}</text><rect x="${c.aporte_t_ha >= 0 ? zero : zero-width}" y="${y}" width="${width}" height="22" fill="${c.aporte_t_ha >= 0 ? '#21918c' : '#3b528b'}"><title>${number(c.aporte_t_ha)} ${esc(data.unidad_rendimiento)}</title></rect><text x="448" y="${y+16}" text-anchor="end" font-size="10">${number(c.aporte_t_ha)}</text>`;
  });
  $('#chart3').innerHTML = svgChart(svg, height) + `<p>Valor base: ${number(data.resultado.valor_base_t_ha)} · Predicción: ${number(data.resultado.prediccion)} ${esc(data.unidad_rendimiento)}</p>`;
}
async function requestExplanation(context) {
  const parcelId = context.ID_POLIGONO, selectedSequence = dashboardSequence, sequence = ++infoSequence;
  infoController?.abort(); infoController = new AbortController();
  $('#info-loading').hidden = false; $('#info-error').hidden = true; $('#info-response').hidden = true; $('#info-button').disabled = true; $('#info-button').setAttribute('aria-busy','true');
  const isCurrent = () => sequence === infoSequence && selectedSequence === dashboardSequence && selectedParcelId === parcelId;
  try {
    const data = await json(`/api/parcelas/${encodeURIComponent(parcelId)}/informacion-inteligente`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaña: context.campaña, version_modelo: context.version_modelo }), signal: infoController.signal
    });
    if (!isCurrent()) return;
    $('#info-response').textContent = data.explanation; $('#info-response').hidden = false;
    $('#ai-caption').textContent = data.mode === 'mock' ? 'Análisis local de demostración: sin llamada a IA.' : `Análisis de la campaña ${context.campaña} · ${context.ID_POLIGONO}`;
  } catch (error) {
    if (!isCurrent() || error.name === 'AbortError') return;
    $('#info-error').textContent = error.message; $('#info-error').hidden = false;
  } finally { if (isCurrent()) { $('#info-loading').hidden = true; $('#info-button').disabled = false; $('#info-button').setAttribute('aria-busy','false'); } }
}
function stopPlayback() {
  temporal.playing=false;clearTimeout(temporal.timer);temporal.timer=null;
  $('#timeline-play').textContent='▶ Reproducir';$('#timeline-play').setAttribute('aria-pressed','false');
}
function timelineCampaigns() { return temporal.models.find(model => model.version_modelo===temporal.model)?.campanas.map(row => row.campaña) || []; }
function renderTimeline() {
  const campaigns=timelineCampaigns(),index=campaigns.indexOf(temporal.campaign);
  $('#timeline-model').innerHTML=temporal.models.map(model => `<option value="${esc(model.version_modelo)}">${esc(model.version_modelo)}</option>`).join('');
  $('#timeline-model').value=temporal.model;$('#timeline-metric').value=temporal.metric;
  $('#timeline-years').innerHTML=campaigns.map(campaign => `<button type="button" data-year="${esc(campaign)}" aria-pressed="${campaign===temporal.campaign}">${esc(campaign)}</button>`).join('');
  $('#timeline-range').max=String(Math.max(0,campaigns.length-1));$('#timeline-range').value=String(Math.max(0,index));
  $('#timeline-range').setAttribute('aria-valuetext',temporal.campaign || 'Sin campaña');
  $('#timeline-play').disabled=campaigns.length<2;
}
async function activateTemporal({campaign,model,metric} = {}) {
  stopPlayback();
  const activation=++temporal.activation;
  temporal.enabled=true;++layerSequence;
  $('#timeline-panel').hidden=false;$('#timeline-button').setAttribute('aria-expanded','true');
  $('#timeline-caption').textContent='Cargando campañas…';$('#timeline-error').hidden=true;toggleLayers(false);
  try {
    temporalCataloguePromise ??= json('/api/resultados/campanas').catch(error => {temporalCataloguePromise=null;throw error;});
    const catalogue=await temporalCataloguePromise;
    if (!temporal.enabled || activation!==temporal.activation) return;
    temporal.models=catalogue.modelos;
    if (!temporal.models.length) throw new Error('No hay campañas disponibles');
    const preferred=model || temporal.model || currentDashboard?.version_modelo;
    temporal.model=temporal.models.some(item => item.version_modelo===preferred) ? preferred : temporal.models.at(-1).version_modelo;
    const campaigns=timelineCampaigns(),preferredCampaign=campaign || temporal.campaign || currentDashboard?.campaña;
    temporal.campaign=campaigns.includes(preferredCampaign) ? preferredCampaign : campaigns.at(-1);
    temporal.metric=metric || temporal.metric;
    renderTimeline();await paintTemporal(true);
  } catch(error) {
    if (!temporal.enabled || activation!==temporal.activation) return;
    $('#timeline-error').textContent=error.message;$('#timeline-error').hidden=false;$('#timeline-caption').textContent='Modo temporal no disponible';
  }
}
function disableTemporal(restore = true) {
  const wasEnabled=temporal.enabled;
  stopPlayback();temporal.enabled=false;++temporal.activation;++temporal.sequence;temporal.controller?.abort();
  $('#timeline-panel').hidden=true;$('#timeline-button').setAttribute('aria-expanded','false');
  if (restore) pintar();
  if (wasEnabled && selectedParcelId) selectParcel(selectedParcelId);
}
async function selectCampaign(campaign) {
  if (!temporal.enabled || !timelineCampaigns().includes(campaign)) return;
  temporal.campaign=campaign;renderTimeline();await paintTemporal(true);
}
async function paintTemporal(syncDashboard) {
  if (!temporal.enabled || !temporal.campaign || !temporal.model) return;
  const sequence=++temporal.sequence;
  temporal.controller?.abort();temporal.controller=new AbortController();
  valores={};refreshStyle();$('#timeline-error').hidden=true;$('#timeline-legend').replaceChildren();
  $('#timeline-title').textContent=`${$('#timeline-metric').selectedOptions[0].textContent} · ${temporal.campaign}`;
  $('#timeline-caption').textContent=`Cargando campaña ${temporal.campaign}…`;
  // La selección y la explicación usan exactamente la campaña/modelo que se pinta.
  if (syncDashboard && selectedParcelId) selectParcel(selectedParcelId);
  const params=new URLSearchParams({'campaña':temporal.campaign,version_modelo:temporal.model,metrica:temporal.metric});
  try {
    const data=await json(`/api/resultados/valores?${params}`,{signal:temporal.controller.signal});
    if (!temporal.enabled || sequence!==temporal.sequence) return;
    valores=data.valores;rango=data.rango;refreshStyle();
    const count=Object.values(valores).filter(value => value!=null).length;
    $('#timeline-caption').textContent=`${count} parcelas con dato · ${data.unidad}`;
    $('#timeline-legend').innerHTML=`<div class="grad" style="background:linear-gradient(90deg,${ramp})"></div><div class="rango"><span>${number(rango[0])}</span><span>${number(rango[1])}</span></div><small>${esc(data.dataset_label)} · Escala común entre campañas. Gris: sin dato.</small>`;
  } catch(error) {
    if (!temporal.enabled || sequence!==temporal.sequence || error.name==='AbortError') return;
    $('#timeline-error').textContent=error.message;$('#timeline-error').hidden=false;$('#timeline-caption').textContent='No se pudo cargar la campaña';stopPlayback();
  }
}
$('#timeline-button').onclick=() => temporal.enabled ? disableTemporal() : activateTemporal();
$('#timeline-close').onclick=() => disableTemporal();
$('#timeline-years').onclick=e => {const button=e.target.closest('[data-year]');if (button) {stopPlayback();selectCampaign(button.dataset.year);} };
$('#timeline-range').oninput=e => {stopPlayback();selectCampaign(timelineCampaigns()[Number(e.target.value)]);};
$('#timeline-model').onchange=e => {
  stopPlayback();temporal.model=e.target.value;
  const campaigns=timelineCampaigns();if (!campaigns.includes(temporal.campaign)) temporal.campaign=campaigns.at(-1);
  renderTimeline();paintTemporal(true);
};
$('#timeline-metric').onchange=e => {stopPlayback();temporal.metric=e.target.value;paintTemporal(false);};
$('#timeline-play').onclick=async () => {
  if (temporal.playing) {stopPlayback();return;}
  temporal.playing=true;$('#timeline-play').textContent='Ⅱ Pausar';$('#timeline-play').setAttribute('aria-pressed','true');
  async function advance() {
    if (!temporal.playing || !temporal.enabled) return;
    const campaigns=timelineCampaigns(),index=campaigns.indexOf(temporal.campaign);
    await selectCampaign(campaigns[(index+1)%campaigns.length]);
    if (temporal.playing && temporal.enabled) temporal.timer=setTimeout(advance,2200);
  }
  await advance();
};
for (const id of ['timeline-panel','timeline-button']) {
  L.DomEvent.disableClickPropagation($('#'+id));L.DomEvent.disableScrollPropagation($('#'+id));
}
document.addEventListener('visibilitychange',()=>{if (document.hidden) stopPlayback();});
init().catch(error => { $('#map-status').textContent = error.message; $('#map-status').hidden = false; });
