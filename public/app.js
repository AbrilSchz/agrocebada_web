const C = window.CONFIG, $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = (value, digits = 2) => value == null || !Number.isFinite(Number(value)) ? 'No disponible' : Number(value).toFixed(digits);
const P=window.PRESENTATION, hasNumber=P.hasNumber;
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
const baseInicial = C.baseInicial || 'sat', fondoInicial = C.bases[baseInicial];
let base = L.tileLayer(fondoInicial.url, { attribution: fondoInicial.attribution, maxZoom: 19 }).addTo(map);
document.querySelectorAll('[name=base]').forEach(r => {
  r.checked = r.value === baseInicial;
  r.onchange = () => {
    map.removeLayer(base);
    const b = C.bases[r.value];
    base = L.tileLayer(b.url, { attribution: b.attribution, maxZoom: 19 }).addTo(map).bringToBack();
  };
});
let activeChart = 'rendimiento';
const resultMap={enabled:false,model:null,dataset:null,metric:'prediccion',sets:[],sequence:0,catalogueSequence:0,controller:null};
let resultCataloguePromise=null;
const ramp = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'];
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function color(t) {
  t = Math.min(1, Math.max(0, t)) * (ramp.length - 1);
  const i = Math.min(Math.floor(t), ramp.length - 2), f = t - i, a = hex(ramp[i]), b = hex(ramp[i + 1]);
  return `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * f))})`;
}
let geo, allParcels=null, predictionOnly=false, administrativePromise=null,regionController=null;
const parcelFilters={state:'',cohort:'',municipality:'',query:'',availability:'',minimum:'',maximum:''},tableSort={key:'id',direction:'asc'};
const valueState={loading:false,error:'',parcelError:''};
let capas = [], valores = {}, rango = [0, 1], selectedParcelId = null;
let dashboardSequence = 0, dashboardController = null, infoSequence = 0, infoController = null, currentDashboard = null, layerSequence = 0;
const estilo = feature => {
  const v = valores[feature.id], selected = String(feature.id) === selectedParcelId;
  return { color: selected ? '#ffb000' : '#fff', weight: selected ? 3 : ($('#contornos').checked ? 1.5 : 0),
    fillColor: v == null ? '#888' : color((v - rango[0]) / (rango[1] - rango[0] || 1)),
    fillOpacity: Number($('#opacidad').value) * (v == null ? 0.4 : 1),className:'parcel-shape' };
};
function refreshStyle() { if (geo) geo.setStyle(estilo); renderParcelTable(); }
function syncChatContext() {window.CHAT?.setContext({parcelId:selectedParcelId,campaign:resultMap.enabled ? resultMap.dataset : currentDashboard?.campaña,model:resultMap.enabled ? resultMap.model : currentDashboard?.version_modelo});}
function visibleFeatures() {return window.PARCELS.filter(allParcels?.features || [],{...parcelFilters,predictionOnly,values:valores});}
function updateMapSummary() {
  const visible=visibleFeatures(),name=resultMap.enabled ? $('#results-metric').selectedOptions[0]?.textContent : capas.find(c=>c.id===$('#capa').value)?.nombre;
  $('#map-summary').hidden=!visible.length;
  $('#map-summary').innerHTML=`<strong>${esc(name || 'Parcelas')}</strong><span>${visible.length} parcelas${predictionOnly ? ' de predicción final' : ' en el mapa'}</span>`;
  if(resultMap.enabled && !valueState.loading && !valueState.error) $('#results-caption').textContent=`${visible.filter(f=>hasNumber(valores[f.id])).length} parcelas con dato · ${resultMap.unit || 't/ha'}`;
  $('#region-caption').textContent=parcelFilters.municipality || 'Municipio → parcela';
  regionController?.select(parcelFilters.municipality);
}
function drawParcels() {
  const features=visibleFeatures();
  if(geo) map.removeLayer(geo);
  geo=L.geoJSON({type:'FeatureCollection',features},{style:estilo,onEachFeature:(feature,layer)=>layer.on('click',e=>{
    if(e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
    zoomToParcel(layer);selectParcel(String(feature.id));
  })}).addTo(map);
  if(!valueState.loading && selectedParcelId && !features.some(f=>String(f.id)===selectedParcelId)) clearSelection();
  $('#ids').innerHTML=features.map(f=>`<option value="${esc(f.id)}"></option>`).join('');
  renderParcelTable();
  updateMapSummary();
}
function updatePredictionFilter(enabled) {
  predictionOnly=enabled;
  parcelFilters.cohort=enabled ? 'prediccion' : '';
  $('#prediction-filter').setAttribute('aria-pressed',String(enabled));
  drawParcels();
  if(resultMap.enabled) {updateResultMetrics();paintResultMap();}
}
$('#prediction-filter').onclick=()=>updatePredictionFilter(!predictionOnly);
function syncTableControls() {
  $('#table-cohort').hidden=$('#prediction-filter').hidden;
  $('#table-cohort').setAttribute('aria-pressed',String(predictionOnly));
  for(const prefix of ['map','table']) {
    if($('#'+prefix+'-query').value!==parcelFilters.query) $('#'+prefix+'-query').value=parcelFilters.query;
    $('#'+prefix+'-municipality').value=parcelFilters.municipality;
    $('#'+prefix+'-state').value=parcelFilters.state;
    $('#'+prefix+'-availability').value=parcelFilters.availability;
    if($('#'+prefix+'-min').value!==parcelFilters.minimum) $('#'+prefix+'-min').value=parcelFilters.minimum;
    if($('#'+prefix+'-max').value!==parcelFilters.maximum) $('#'+prefix+'-max').value=parcelFilters.maximum;
  }
  $('#map-cohort').value=$('#table-population').value=parcelFilters.cohort;
  $('#map-source').value=resultMap.enabled ? 'resultados' : 'capas';
  $('#thematic-controls').hidden=resultMap.enabled;
  $('#table-source').value=resultMap.enabled ? 'resultados' : 'capas';
  for(const [target,source] of [['layer','capa'],['date','fecha'],['set','results-set'],['metric','results-metric']]) {
    const a=$('#table-'+target),b=$('#'+source);
    if(a.innerHTML!==b.innerHTML) a.innerHTML=b.innerHTML;
    a.value=b.value;
  }
  $('#table-layer-label').hidden=resultMap.enabled;
  $('#table-date-label').hidden=resultMap.enabled || $('#fecha').hidden;
  $('#table-set-label').hidden=$('#table-metric-label').hidden=!resultMap.enabled;
}
function tableValueLabel() {
  if(resultMap.enabled) return `${$('#results-metric').selectedOptions[0]?.textContent || 'Predicción'} (${resultMap.unit || 't/ha'})`;
  const layer=capas.find(c=>c.id===$('#capa').value);
  return layer ? `${layer.nombre}${$('#fecha').value ? ' · '+P.date($('#fecha').value) : ''}${layer.unidad ? ' ('+layer.unidad+')' : ''}` : '';
}
function renderParcelTable() {
  syncTableControls();
  const features=window.PARCELS.sort(visibleFeatures(),{...tableSort,values:valores}),label=tableValueLabel();
  const header=(key,name)=>`<th scope="col" aria-sort="${tableSort.key===key ? tableSort.direction==='asc' ? 'ascending' : 'descending' : 'none'}"><button type="button" data-sort="${key}">${esc(name)} ${tableSort.key===key ? tableSort.direction==='asc' ? '↑' : '↓' : '↕'}</button></th>`;
  $('#t').innerHTML=`<caption>${features.length} parcelas · ${esc(label || 'Identidad y conjunto')}</caption><thead><tr>${header('id','Parcela')}${header('estado','Estado')}${header('municipio','Municipio')}${header('cohorte','Conjunto')}${label ? header('value',label) : ''}</tr></thead><tbody>`+
    features.map(f=>`<tr data-id="${esc(f.id)}"${String(f.id)===selectedParcelId ? ' class="selected-row"' : ''}><td><button type="button" data-parcel="${esc(f.id)}" aria-label="Abrir ficha de ${esc(f.id)}">${esc(f.id)}</button></td><td>${esc(f.properties.estado || '')}</td><td>${esc(f.properties.municipio || '')}</td><td><span class="table-cohort-badge ${f.properties.cohorte==='prediccion' ? 'cohort-final' : 'cohort-reference'}">${esc(window.PARCELS.cohort(f))}</span></td>${label ? `<td class="numeric-cell">${hasNumber(valores[f.id]) ? esc(number(valores[f.id],3)) : '<span aria-label="Sin medición">—</span>'}</td>` : ''}</tr>`).join('')+
    (!features.length ? `<tr><td colspan="${label ? 5 : 4}">Ninguna parcela coincide con estos filtros.</td></tr>` : '')+'</tbody>';
  $('#table-status').textContent=valueState.parcelError ? `No se pudieron cargar las parcelas: ${valueState.parcelError}` : valueState.loading ? 'Cargando valores de la selección…' : valueState.error ? `No se pudieron cargar los datos: ${valueState.error}` : `${features.length} de ${allParcels?.features.length || 0} parcelas${label ? ' · '+features.filter(f=>hasNumber(valores[f.id])).length+' con dato' : ''}. Los filtros se comparten con el mapa.`;
  $('#table-status').classList.toggle('error',Boolean(valueState.error || valueState.parcelError));
  $('#table-export').disabled=!features.length || valueState.loading || Boolean(valueState.error);
}
$('#t').onclick=e=>{
  const sort=e.target.closest('[data-sort]')?.dataset.sort,id=e.target.closest('[data-parcel]')?.dataset.parcel;
  if(sort) {tableSort.direction=tableSort.key===sort && tableSort.direction==='asc' ? 'desc' : 'asc';tableSort.key=sort;renderParcelTable();$('#t').querySelector?.(`[data-sort="${sort}"]`)?.focus();}
  if(id) selectParcel(id);
};
$('#table-detail').onclick=e=>{
  if(e.target.closest('[data-detail-close]')) clearSelection();
  if(e.target.closest('[data-detail-map]') && selectedParcelId) irA(selectedParcelId);
};
$('#table-cohort').onclick=()=>updatePredictionFilter(!predictionOnly);
for(const prefix of ['map','table']) {
  $('#'+prefix+'-municipality').onchange=e=>{
    parcelFilters.municipality=e.target.value;
    if(parcelFilters.municipality) parcelFilters.state=allParcels?.features.find(f=>f.properties.municipio===parcelFilters.municipality)?.properties.estado || '';
    drawParcels();if(prefix==='map' && parcelFilters.municipality) regionController?.focus(parcelFilters.municipality);
  };
  $('#'+prefix+'-query').oninput=e=>{parcelFilters.query=e.target.value;drawParcels();};
  $('#'+prefix+'-state').onchange=e=>{parcelFilters.state=e.target.value;if(parcelFilters.municipality && !allParcels?.features.some(f=>f.properties.municipio===parcelFilters.municipality && (!parcelFilters.state || f.properties.estado===parcelFilters.state))) parcelFilters.municipality='';drawParcels();};
  $('#'+prefix+'-availability').onchange=e=>{parcelFilters.availability=e.target.value;drawParcels();};
  for(const [control,key] of [['min','minimum'],['max','maximum']]) $('#'+prefix+'-'+control).oninput=e=>{parcelFilters[key]=e.target.value;drawParcels();};
}
function updatePopulation(cohort) {parcelFilters.cohort=cohort;predictionOnly=cohort==='prediccion';$('#prediction-filter').setAttribute('aria-pressed',String(predictionOnly));drawParcels();if(resultMap.enabled) {updateResultMetrics();return paintResultMap();}}
$('#map-cohort').onchange=$('#table-population').onchange=e=>updatePopulation(e.target.value);
$('#table-reset').onclick=()=>{Object.keys(parcelFilters).forEach(key=>parcelFilters[key]='');updatePredictionFilter(false);};
function clearValueRange() {parcelFilters.minimum='';parcelFilters.maximum='';}
$('#table-source').onchange=e=>e.target.value==='resultados' ? activateResultMap() : disableResultMap();
$('#map-source').onchange=$('#table-source').onchange;
$('#table-layer').onchange=e=>{$('#capa').value=e.target.value;return $('#capa').onchange();};
$('#table-date').onchange=e=>{$('#fecha').value=e.target.value;return $('#fecha').onchange();};
$('#table-set').onchange=e=>{$('#results-set').value=e.target.value;return $('#results-set').onchange({target:$('#results-set')});};
$('#table-metric').onchange=e=>{$('#results-metric').value=e.target.value;return $('#results-metric').onchange({target:$('#results-metric')});};
$('#table-export').onclick=()=>{
  const rows=window.PARCELS.sort(visibleFeatures(),{...tableSort,values:valores});
  const url=URL.createObjectURL(new Blob(['\ufeff'+window.PARCELS.csv(rows,valores,tableValueLabel() || 'Valor')],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='agrocebada-parcelas.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
L.DomEvent.disableClickPropagation($('#map-tools'));
L.DomEvent.disableClickPropagation($('#map-navigation'));
L.DomEvent.disableClickPropagation($('#map-legend'));
L.DomEvent.disableClickPropagation($('#map-assistant'));
L.DomEvent.disableScrollPropagation($('#chat-panel'));
function setupRegions(data) {
  if(regionController || !allParcels) return;
  allParcels=window.REGIONS.enrichParcels(allParcels,data,C.estados);
  const states=[...new Set(allParcels.features.map(f=>f.properties.estado).filter(Boolean))].sort();
  for(const prefix of ['map','table']) $('#'+prefix+'-state').innerHTML='<option value="">Todos los estados</option>'+states.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
  regionController=new window.REGIONS.Controller(map,C,(properties,bounds)=>{
    parcelFilters.state=C.estados[properties.entidad].nombre;parcelFilters.municipality=properties.nombre;parcelFilters.query='';
    drawParcels();toggleLayers(false);window.REGIONS.zoom(map,bounds,C,'municipality');
  });
  regionController.load(data,allParcels.features);
}
function geographyStatus() {
  const status=$('#administrative-status');status.hidden=!$('#administrative-borders').checked;
  if(!status.hidden) status.innerHTML=Object.values(C.estados).map(s=>`<span class="state-dot" style="background:${esc(s.color)}"></span>${esc(s.nombre)}`).join(' ')+`<br><small>${C.municipiosSeleccionados.length} municipios · INEGI</small>`;
}
$('#administrative-borders').onchange=async e=>{
  const control=e.target,status=$('#administrative-status');
  if(!control.checked) {regionController?.setVisible(false);status.hidden=true;return;}
  status.hidden=false;status.textContent='Cargando límites…';
  try {
    administrativePromise ??= json(C.limitesAdministrativos).catch(error=>{administrativePromise=null;throw error;});
    const data=await administrativePromise;
    setupRegions(data);drawParcels();
    if(!control.checked) return;
    regionController?.setVisible(true);geographyStatus();
  } catch(error) {
    if(!control.checked) return;
    control.checked=false;status.textContent='No se pudieron cargar los límites. Activa el control para reintentar.';
  }
};
$('#region-home').onclick=()=>{parcelFilters.state='';parcelFilters.municipality='';parcelFilters.query='';clearSelection();drawParcels();regionController ? regionController.home() : geo && window.REGIONS.zoom(map,geo.getBounds(),C,'municipality');};
function zoomToParcel(layer) {window.REGIONS.zoom(map,layer.getBounds(),C,'parcel');}
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
window.CHAT?.onOpen(()=>toggleLayers(false));
$('#layers-button').onclick=()=>{const open=$('#layers-panel').hidden;if(open) window.CHAT?.close();toggleLayers(open);};
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
async function pintar(fechaDeseada) {
  if (resultMap.enabled) return;
  const sequence = ++layerSequence, capa = $('#capa').value, fSel = $('#fecha');
  $('#layers-error').hidden = true;
  valueState.error='';valores={};
  if(!capa) {valueState.loading=false;fSel.hidden=true;drawParcels();updateMapSummary();updateLegend();return;}
  valueState.loading=true;refreshStyle();
  updateLegend();
  try {
    if (fSel.dataset.capa !== capa) {
      const fechas = await json(`/api/capas/${encodeURIComponent(capa)}/fechas`);
      if (sequence !== layerSequence || resultMap.enabled) return;
      fSel.innerHTML = fechas.map(f => `<option value="${esc(f)}">${esc(P.date(f))}</option>`).join('');
      fSel.value = fechas.at(-1) ?? ''; fSel.dataset.capa = capa;
    }
    if(fechaDeseada!==undefined) {
      if(![...fSel.options].some(o=>o.value===fechaDeseada)) throw new Error('La fecha solicitada no está disponible');
      fSel.value=fechaDeseada;
    }
    fSel.hidden = !fSel.value || fSel.options.length<2;
    const data = await json(`/api/capas/${encodeURIComponent(capa)}/valores?fecha=${encodeURIComponent(fSel.value)}`);
    if (sequence !== layerSequence || resultMap.enabled) return;
    valores = data.valores;valueState.loading=false;
    const c = capas.find(x => x.id === capa), vs = Object.values(valores).filter(v => v != null && Number.isFinite(v));
    rango = [c?.min ?? (vs.length ? Math.min(...vs) : 0), c?.max ?? (vs.length ? Math.max(...vs) : 1)];
    drawParcels();updateLegend();
    updateMapSummary();
  } catch (error) { if (sequence === layerSequence && !resultMap.enabled) { valueState.loading=false;valueState.error=error.message;$('#layers-error').textContent = error.message; $('#layers-error').hidden = false;renderParcelTable();updateLegend(); } }
}
$('#capa').onchange=()=>{clearValueRange();disableResultMap(false);return pintar();};
$('#fecha').onchange=()=>{disableResultMap(false);return pintar();};
function updateLegend() {
  $('#legend-title').textContent=tableValueLabel() || 'Contornos de parcelas';
  const unit=resultMap.enabled ? resultMap.unit || 't/ha' : capas.find(c=>c.id===$('#capa').value)?.unidad || '';
  const status=valueState.loading ? 'Cargando valores…' : valueState.error ? 'Error de carga' : !resultMap.enabled && !$('#capa').value ? 'Sin coloreado temático' : `${unit} · Gris: sin dato`;
  $('#leyenda').innerHTML=`<div class="grad" style="background:linear-gradient(90deg,${ramp})"></div>${!valueState.loading && !valueState.error && (resultMap.enabled || $('#capa').value) ? `<div class="rango"><span>${number(rango[0])}</span><span>${number(rango[1])}</span></div>` : ''}<small>${esc(status)}</small>`;
}
$('#info-button').onclick = () => { if (currentDashboard) requestExplanation(currentDashboard); };
function vista(view) {
  $('#container').hidden = view !== 'mapa'; $('#tabla').hidden = view !== 'tabla'; $('#documentacion').hidden = view !== 'documentacion';
  document.querySelectorAll('.nav a[data-v]').forEach(a => a.classList.toggle('active', a.dataset.v === view));
  if (view === 'mapa') requestAnimationFrame(() => { map.invalidateSize(); ajustarLimites(); });
  if (view === 'documentacion') window.DOCUMENTATION.open();
  window.CHAT?.viewChanged(view);
}
document.querySelectorAll('.nav a[data-v]').forEach(a => a.onclick = e => { e.preventDefault(); vista(a.dataset.v); });
function irA(id) {
  if (!geo) return;
  if(allParcels.features.some(f=>String(f.id)===id) && !visibleFeatures().some(f=>String(f.id)===id)) {Object.keys(parcelFilters).forEach(key=>parcelFilters[key]='');updatePredictionFilter(false);}
  let found = false;
  geo.eachLayer(layer => {
    if (String(layer.feature.id) !== id) return;
    found = true; vista('mapa');requestAnimationFrame(()=>{map.invalidateSize();zoomToParcel(layer);});selectParcel(id);
  });
  if (!found && id) { $('#map-status').textContent = `Parcela ${id} no encontrada`; $('#map-status').hidden = false; }
}
$('#buscar').onchange = e => irA(e.target.value.trim());
async function init() {
  // El fallo de una capa no debe impedir dibujar las parcelas.
  administrativePromise ??=json(C.limitesAdministrativos).catch(error=>{administrativePromise=null;throw error;});
  const [parcelResult,layerResult,borderResult]=await Promise.allSettled([json('/api/parcelas'),json('/api/capas'),administrativePromise]);
  if (parcelResult.status === 'fulfilled') {
    const fc=borderResult.status==='fulfilled' ? window.REGIONS.enrichParcels(parcelResult.value,borderResult.value,C.estados) : parcelResult.value;allParcels=fc;drawParcels();
    const predictionCount=fc.features.filter(f=>f.properties.cohorte==='prediccion').length;
    $('#prediction-filter').hidden=predictionCount===0;
    $('#prediction-filter').textContent='Parcelas de validación';
    const municipalities=[...new Set(fc.features.map(f=>f.properties.municipio).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
    for(const prefix of ['map','table']) $('#'+prefix+'-municipality').innerHTML='<option value="">Todos los municipios</option>'+municipalities.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
    const states=[...new Set(fc.features.map(f=>f.properties.estado).filter(Boolean))].sort();
    for(const prefix of ['map','table']) $('#'+prefix+'-state').innerHTML='<option value="">Todos los estados</option>'+states.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
    if(borderResult.status==='fulfilled') {setupRegions(borderResult.value);regionController.setVisible($('#administrative-borders').checked);geographyStatus();}
    else {$('#administrative-status').hidden=false;$('#administrative-status').textContent='No se pudo cargar el contexto municipal. Activa Estados y municipios para reintentar.';$('#administrative-borders').checked=false;}
    renderParcelTable();
    if (geo.getBounds().isValid()) { map.fitBounds(geo.getBounds()); ajustarLimites(); }
    $('#map-status').hidden = true;
  } else { valueState.parcelError=parcelResult.reason.message;$('#map-status').textContent = `No se pudieron cargar las parcelas: ${parcelResult.reason.message}`;renderParcelTable(); }
  if (layerResult.status === 'fulfilled') {
    capas = layerResult.value;
    const grupos = {}; capas.forEach(c => (grupos[c.grupo] ??= []).push(c));
    $('#capa').insertAdjacentHTML('beforeend', Object.entries(grupos).map(([grupo, lista]) =>
      `<optgroup label="${esc(grupo)}">${lista.map(c => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('')}</optgroup>`).join(''));
    const initial=capas.find(c=>c.id===C.capaInicial) || capas.find(c=>c.nombre==='Elevación');
    if(initial) {$('#capa').value=initial.id;await pintar();}
    renderParcelTable();
  } else { $('#layers-error').textContent = `No se pudieron cargar las capas: ${layerResult.reason.message}`; $('#layers-error').hidden = false;valueState.error=layerResult.reason.message;renderParcelTable(); }
  updateLegend();
}
if(C.gifSeleccionParcela && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
  const gif=$('#selection-gif');gif.src=C.gifSeleccionParcela;
  gif.onload=()=>{gif.hidden=false;$('#selection-illustration').hidden=true;};
  gif.onerror=()=>{gif.hidden=true;$('#selection-illustration').hidden=false;};
}
function dashboardState(state, message = '') {
  $('#dashboard-loading').hidden = state !== 'loading';
  $('#dashboard-error').hidden = state !== 'error';
  $('#dashboard-instructions').hidden = state !== 'instructions';
  $('#dashboard-data').hidden = state !== 'data';
  $('#info-button').disabled = state !== 'data';
  $('#ai-caption').textContent = state === 'data' ? `Analiza los resultados de la parcela ${currentDashboard.ID_POLIGONO}.` : state === 'loading' ? message : 'Selecciona una parcela con resultados para activar el análisis.';
  if (state === 'loading') $('#dashboard-loading').textContent = message;
  if (state === 'error') $('#dashboard-error').textContent = message;
}
async function selectParcel(id) {
  selectedParcelId = String(id); currentDashboard = null;
  syncChatContext();
  const sequence = ++dashboardSequence;
  ++infoSequence; dashboardController?.abort(); infoController?.abort();
  dashboardController = new AbortController();
  $('#dashboard-data').replaceChildren(); clearExplanation();
  $('#table-detail').hidden=false;$('#table-detail').textContent=`Cargando ficha de ${id}…`;
  dashboardState('loading', `Cargando parcela ${id}…`); refreshStyle();
  try {
    const selectors = resultMap.enabled ? `?${new URLSearchParams({'campaña':resultMap.dataset,version_modelo:resultMap.model})}` : '';
    const data = await json(`/api/parcelas/${encodeURIComponent(id)}/dashboard${selectors}`, { signal: dashboardController.signal });
    if (sequence !== dashboardSequence || selectedParcelId !== String(id)) return;
    currentDashboard=data;syncChatContext();updateDashboard(data);$('#table-detail').innerHTML=window.PARCELS.detail(data);renderParcelTable();
  } catch (error) {
    if (sequence !== dashboardSequence || error.name === 'AbortError') return;
    dashboardState('error', `Parcela ${id}: ${error.message}`);
    $('#table-detail').textContent=`Parcela ${id}: ${error.message}`;
  }
}
function clearSelection() {
  $('#table-detail').hidden=true;$('#table-detail').replaceChildren();
  ++dashboardSequence; ++infoSequence; dashboardController?.abort(); infoController?.abort();
  selectedParcelId = null; currentDashboard = null; $('#dashboard-data').replaceChildren(); clearExplanation();
  syncChatContext();
  dashboardState('instructions'); refreshStyle();
}
function clearExplanation() {
  $('#info-loading').hidden = true; $('#info-error').hidden = true; $('#info-response').hidden = true;
  $('#info-response').textContent = ''; $('#info-button').setAttribute('aria-busy','false');
}
function showChart(name, focus = false) {
  const available=[...document.querySelectorAll('[data-chart-tab]')].map(b=>b.dataset.chartTab);
  if(!available.includes(name)) name=available[0];
  activeChart=name;
  document.querySelectorAll('[data-chart-tab]').forEach(button => {
    const selected=button.dataset.chartTab === name;
    button.setAttribute('aria-selected',String(selected));button.tabIndex=selected ? 0 : -1;
    if (focus && selected) button.focus();
  });
  document.querySelectorAll('[data-chart-panel]').forEach(panel => panel.hidden=panel.dataset.chartPanel !== name);
}
function explanationTable(data) {
  const full=(data.contribuciones || []).filter(c=>hasNumber(c.aporte_t_ha));
  const partial=(data.contexto_modelo?.shap_hgb_parcial || []).filter(c=>hasNumber(c.aporte_redondeado_t_ha));
  const rows=full.length ? full : partial.map(c=>({variable:c.variable,
    valor:data.contexto_modelo.variables_modelo?.[c.variable] ?? data.contexto_modelo.centroide?.[c.variable],
    unidad:P.unit(c.variable),aporte_t_ha:c.aporte_redondeado_t_ha}));
  if(!rows.length) return '';
  return `<details class="data-details"><summary>${full.length ? 'Variables de la explicación' : 'Variables con aportes del HGB'}</summary><div class="table-wrap"><table><thead><tr><th>Variable</th><th>Valor original</th><th>Unidad</th><th>Aporte (t/ha)</th></tr></thead><tbody>${rows.map(c=>`<tr><td title="${esc(c.variable)}">${esc(P.variable(c.variable))}</td><td>${hasNumber(c.valor) ? number(c.valor,3) : ''}</td><td>${esc(c.unidad || '')}</td><td class="${c.aporte_t_ha>=0 ? 'positive-number' : 'negative-number'}">${number(c.aporte_t_ha)}</td></tr>`).join('')}</tbody></table></div></details>`;
}
function updateDashboard(data) {
  const r=data.resultado,m=data.metricas,unit=data.unidad_rendimiento,ctx=data.contexto_modelo;
  const available=P.capabilities(data),interval=ctx?.intervalo_empirico80;
  const tabs=[['rendimiento','Rendimiento'],['errores','Errores'],['aportes',ctx?.shap_hgb_parcial?.length ? 'Aportes HGB' : 'Aportes'],['modelo','Modelo']].filter(([id])=>available[id]);
  const metric=(name,value,kind,units=unit)=>hasNumber(value) ? `<div class="metric metric-${kind}"><span class="metric-label">${esc(name)}</span><strong class="metric-value">${number(value)} <span>${esc(units)}</span></strong></div>` : '';
  const measurements=(data.mediciones_existentes || []).filter(x=>hasNumber(x.valor));
  const cohort=ctx?.cohorte==='referencia' ? 'Entrenamiento · predicción OOF' : ctx?.cohorte==='prediccion' ? 'Predicción final' : r.tipo_prediccion==='oof' ? 'Predicción OOF' : 'Resultados';
  $('#dashboard-data').innerHTML=`<div class="dashboard-heading"><div><span class="eyebrow">${esc(ctx?.municipio || 'RESULTADO POR PARCELA')}</span><h1>${esc(data.ID_POLIGONO)}</h1></div><span class="cohort-badge ${ctx?.cohorte==='prediccion' ? 'cohort-final' : 'cohort-reference'}">${esc(cohort)}</span></div>
    <p class="parcel-meta">${esc(data.dataset.label)} · Ensamble KNN + HGB${r.esquema_oof ? `<br>${esc(P.scheme(r.esquema_oof))} · promedio de tres repeticiones.` : ''}</p>
    <div class="metrics">${metric('Predicción',r.prediccion,'prediction')}${metric('Observado',r.observado,'observed')}${metric('Error firmado',m.error_firmado_t_ha,'signed')}${metric('Error absoluto',m.error_absoluto_t_ha,'absolute')}${metric('Error relativo',m.error_relativo_pct,'relative','%')}</div>
    ${ctx?.componentes && hasNumber(ctx.componentes.knn) && hasNumber(ctx.componentes.hgb) ? `<div class="model-context component-context"><span class="eyebrow">DOS COMPONENTES · PESOS 50 / 50</span><div class="component-values"><div><span>KNN espacial</span><strong>${number(ctx.componentes.knn)} <small>t/ha</small></strong></div><span class="component-plus">+</span><div><span>HGB</span><strong>${number(ctx.componentes.hgb)} <small>t/ha</small></strong></div></div><small>${esc(ctx.componentes.alcance)}</small></div>` : ''}
    ${interval && hasNumber(interval.inferior) && hasNumber(interval.superior) ? `<div class="model-context interval-context"><span class="eyebrow">INTERVALO EMPÍRICO · NOMINAL 80 %</span><p class="interval-value">${number(interval.inferior)} — ${number(interval.superior)} <small>t/ha</small></p><p>Referencia más cercana: <strong>${number(interval.distancia_referencia_m,0)} m</strong></p><small>Rango orientativo basado en errores de validación; no garantiza cobertura.</small></div>` : ''}
    ${ctx?.vecinos_referencia?.length ? `<details class="data-details"><summary>Parcelas de referencia cercanas</summary><p>Tres vecinos por distancia haversine. El componente KNN utiliza cinco vecinos sobre coordenadas escaladas.</p><div class="table-wrap"><table><thead><tr><th>Parcela</th><th>Distancia (m)</th><th>Observado (t/ha)</th></tr></thead><tbody>${ctx.vecinos_referencia.map(n=>`<tr><td><button type="button" class="parcel-link" data-neighbor-id="${esc(n.ID_POLIGONO)}">${esc(n.ID_POLIGONO)}</button></td><td>${number(n.distancia_m,0)}</td><td>${number(n.observado)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
    <div class="chart-context"><span>Explora la parcela</span><span>Rendimiento cerrado · ${esc(unit)}</span></div>
    ${tabs.length ? `<div class="charts-shell"><div class="chart-tabs" role="tablist" aria-label="Gráficas de la parcela">${tabs.map(([id,name])=>`<button id="tab-${id}" type="button" role="tab" data-chart-tab="${id}" aria-controls="panel-${id}">${esc(name)}</button>`).join('')}</div>
    ${available.rendimiento ? `<div id="panel-rendimiento" class="chart" role="tabpanel" data-chart-panel="rendimiento" aria-labelledby="tab-rendimiento"><h3>Rendimiento de esta parcela</h3><div id="chart1"></div><small>${r.tipo_prediccion==='oof' ? 'Predicción fuera de muestra y rendimiento observado.' : 'Resultado del modelo final.'} Valores en ${esc(unit)}.</small></div>` : ''}
    ${available.errores ? `<div id="panel-errores" class="chart" role="tabpanel" data-chart-panel="errores" aria-labelledby="tab-errores" hidden><h3>Diferencia respecto al observado</h3><div id="chart2"></div><small>Positivo: sobreestimación. Negativo: subestimación.</small></div>` : ''}
    ${available.aportes ? `<div id="panel-aportes" class="chart" role="tabpanel" data-chart-panel="aportes" aria-labelledby="tab-aportes" hidden><h3>${ctx?.shap_hgb_parcial?.length ? 'Aportes del componente HGB' : 'Aportes a la predicción'}</h3><div id="chart3"></div><small>Las contribuciones del modelo no prueban causalidad.</small>${explanationTable(data)}</div>` : ''}
    ${available.modelo ? `<div id="panel-modelo" class="chart" role="tabpanel" data-chart-panel="modelo" aria-labelledby="tab-modelo" hidden>${modelPanel(data)}</div>` : ''}</div>` : ''}
    ${measurements.length ? `<details class="data-details"><summary>Mediciones y capas de la parcela</summary><div class="table-wrap"><table><thead><tr><th>Capa</th><th>Periodo</th><th>Valor</th><th>Unidad</th></tr></thead><tbody>${measurements.map(x=>`<tr><td>${esc(x.capa || P.variable(x.capa_id))}</td><td>${esc(P.date(x.fecha))}</td><td>${number(x.valor,3)}</td><td>${esc(x.unidad || '')}</td></tr>`).join('')}</tbody></table></div></details>` : ''}`;
  if(available.rendimiento) renderChart1(data);
  if(available.errores) renderChart2(data);
  if(available.aportes) renderChart3(data);
  document.querySelectorAll('[data-neighbor-id]').forEach(button=>button.onclick=()=>irA(button.dataset.neighborId));
  showChart(activeChart);dashboardState('data');
  document.querySelectorAll('[data-chart-tab]').forEach(button=>{
    button.onclick=()=>showChart(button.dataset.chartTab);
    button.onkeydown=e=>{
      const ids=tabs.map(([id])=>id),index=ids.indexOf(activeChart);
      const next=e.key==='ArrowRight' ? (index+1)%ids.length : e.key==='ArrowLeft' ? (index+ids.length-1)%ids.length : e.key==='Home' ? 0 : e.key==='End' ? ids.length-1 : null;
      if(next!==null) {e.preventDefault();showChart(ids[next],true);}
    };
  });
}
function modelPanel(data) {
  const model=data.modelo,ctx=data.contexto_modelo,parts=[];
  const validation=(model?.validacion || []).filter(r=>r.modelo==='Ensamble_50_50');
  if(validation.length) parts.push(`<h3>Evaluación global del ensamble</h3><p>Métricas reportadas sobre ${model.entrenamiento} parcelas con observado.</p>${window.CHARTS.validation(validation)}<div class="table-wrap"><table><thead><tr><th>Validación</th><th>MAE (t/ha)</th><th>RMSE (t/ha)</th><th>R²</th><th>MAE por fold ± DE</th></tr></thead><tbody>${validation.map(r=>`<tr><td title="${esc(r.esquema)}">${esc(P.scheme(r.esquema))}</td><td>${number(r.MAE_pooled,3)}</td><td>${number(r.RMSE_pooled,3)}</td><td>${number(r.R2_pooled,3)}</td><td>${number(r.MAE_fold_media,3)} ± ${number(r.MAE_fold_sd,3)}</td></tr>`).join('')}</tbody></table></div><small>MAE y RMSE se calculan sobre parcelas (pooled). La media por fold da igual peso a cada partición; en LOGO, a cada municipio.</small>`);
  if(ctx?.validacion_parcela?.length) parts.push(`<h3>Predicción de esta parcela en validación</h3><div class="table-wrap"><table><thead><tr><th>Validación</th><th>Predicción (t/ha)</th><th>Error firmado (t/ha)</th></tr></thead><tbody>${ctx.validacion_parcela.map(r=>`<tr><td title="${esc(r.esquema)}">${esc(P.scheme(r.esquema))}</td><td>${number(r.prediccion)}</td><td>${number(r.error_firmado_t_ha)}</td></tr>`).join('')}</tbody></table></div>`);
  const importances=(model?.importancias_globales || []).filter(r=>hasNumber(r.shap_media));
  if(importances.length) parts.push(`<h3>Variables más importantes en el conjunto</h3><p>Media de |SHAP| · HGB agronómico sin coordenadas. Estas importancias globales no son aportes de esta parcela.</p>${window.CHARTS.importances(importances)}`);
  if(model?.limitaciones?.length) parts.push(`<details class="data-details"><summary>Alcance del modelo</summary><ul>${model.limitaciones.map(s=>`<li>${esc(s)}</li>`).join('')}</ul></details>`);
  const features=Object.entries(ctx?.variables_modelo || {}).filter(([,value])=>hasNumber(value));
  if(features.length) parts.push(`<details class="data-details"><summary>${features.length} variables disponibles de esta parcela</summary><p>Valores originales de los insumos. Pasa sobre un nombre para ver su identificador en el CSV.</p><div class="table-wrap"><table><thead><tr><th>Variable</th><th>Valor</th></tr></thead><tbody>${features.map(([key,value])=>`<tr><td title="${esc(key)}">${esc(P.variable(key))}</td><td>${number(value,4)}${P.unit(key) ? ' '+esc(P.unit(key)) : ''}</td></tr>`).join('')}</tbody></table></div></details>`);
  return parts.join('');
}
function renderChart1(data) {$('#chart1').innerHTML=window.CHARTS.yield(data);}
function renderChart2(data) {$('#chart2').innerHTML=window.CHARTS.error(data);}
function renderChart3(data) {
  const partial=data.contexto_modelo?.shap_hgb_parcial?.length ? data.contexto_modelo.shap_hgb_parcial : null;
  const rows=partial ? partial.map(c=>({variable:c.variable,aporte_t_ha:c.aporte_redondeado_t_ha})) : data.contribuciones;
  $('#chart3').innerHTML=(partial ? `<div class="chart-notice"><span class="eyebrow">EXPLICACIÓN PARCIAL</span><p>Tres aportes redondeados a la salida del HGB (${number(data.contexto_modelo.componentes.hgb)} t/ha). No reconstruyen el ensamble.</p></div>` : '')+
    window.CHARTS.contributions(rows,data.unidad_rendimiento)+(partial ? '' : `<p>Valor base: ${number(data.resultado.valor_base_t_ha)} · Predicción: ${number(data.resultado.prediccion)} ${esc(data.unidad_rendimiento)}</p>`);
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
    window.CHAT?.openExplanation(data.explanation,data.mode);
    $('#ai-caption').textContent='Interpretación breve en el chat. Continúa allí la conversación.';
  } catch (error) {
    if (!isCurrent() || error.name === 'AbortError') return;
    $('#info-error').textContent = error.message; $('#info-error').hidden = false;
  } finally { if (isCurrent()) { $('#info-loading').hidden = true; $('#info-button').disabled = false; $('#info-button').setAttribute('aria-busy','false'); } }
}
async function activateResultMap() {
  if(!resultMap.enabled) clearValueRange();
  resultMap.enabled=true;++layerSequence;
  const catalogueSequence=++resultMap.catalogueSequence;
  valores={};valueState.loading=true;valueState.error='';refreshStyle();
  $('#results-panel').hidden=false;
  $('#results-caption').textContent='Cargando conjuntos…';$('#results-error').hidden=true;updateLegend();
  try {
    resultCataloguePromise ??= json('/api/resultados/campanas').catch(error=>{resultCataloguePromise=null;throw error;});
    const catalogue=await resultCataloguePromise;
    if(!resultMap.enabled || catalogueSequence!==resultMap.catalogueSequence) return;
    resultMap.sets=catalogue.modelos.flatMap(model=>model.campanas.map(set=>({...set,model:model.version_modelo})));
    if(!resultMap.sets.length) throw new Error('No hay resultados disponibles');
    const preferred=resultMap.sets.findIndex(set=>set.model===(currentDashboard?.version_modelo || resultMap.model) && set.campaña===(currentDashboard?.campaña || resultMap.dataset));
    const index=preferred>=0 ? preferred : resultMap.sets.length-1;
    $('#results-set').innerHTML=resultMap.sets.map((set,i)=>`<option value="${i}">${esc(set.label)} · ${esc(set.model)} · ${esc(set.dataset_id)}</option>`).join('');
    $('#results-set').value=String(index);
    resultMap.model=resultMap.sets[index].model;resultMap.dataset=resultMap.sets[index].campaña;
    updateResultMetrics();
    await paintResultMap();
  } catch(error) {
    if(!resultMap.enabled || catalogueSequence!==resultMap.catalogueSequence) return;
    valueState.loading=false;valueState.error=error.message;renderParcelTable();
    $('#results-error').textContent=error.message;$('#results-error').hidden=false;$('#results-caption').textContent='No se pudieron cargar los resultados';
    updateLegend();
  }
}
function updateResultMetrics() {
  const set=resultMap.sets.find(s=>s.model===resultMap.model && s.campaña===resultMap.dataset);
  const options=[['prediccion','Predicción'],['observado','Observado'],['error_firmado_t_ha','Error firmado'],['error_absoluto_t_ha','Error absoluto']]
    .filter(([key])=>(!predictionOnly || key==='prediccion') && set?.metricas_disponibles?.[key]!==false);
  if(!options.some(([key])=>key===resultMap.metric)) {resultMap.metric=options[0]?.[0] || 'prediccion';clearValueRange();}
  $('#results-metric').innerHTML=options.map(([key,label])=>`<option value="${key}">${label}</option>`).join('');
  $('#results-metric').value=resultMap.metric;
  syncTableControls();
}
function disableResultMap(restore=true) {
  const wasEnabled=resultMap.enabled;
  resultMap.enabled=false;++resultMap.sequence;++resultMap.catalogueSequence;resultMap.controller?.abort();
  syncChatContext();
  $('#results-panel').hidden=true;
  if(wasEnabled) clearValueRange();
  const restored=restore ? pintar() : null;
  updateMapSummary();
  if(wasEnabled && selectedParcelId) selectParcel(selectedParcelId);
  return restored;
}
async function paintResultMap() {
  if(!resultMap.enabled || !resultMap.dataset || !resultMap.model) return;
  syncChatContext();
  const sequence=++resultMap.sequence;
  resultMap.controller?.abort();resultMap.controller=new AbortController();
  valores={};valueState.loading=true;valueState.error='';refreshStyle();$('#results-error').hidden=true;updateLegend();
  $('#results-caption').textContent='Cargando valores…';
  if(selectedParcelId) selectParcel(selectedParcelId);
  const params=new URLSearchParams({'campaña':resultMap.dataset,version_modelo:resultMap.model,metrica:resultMap.metric});
  try {
    const data=await json(`/api/resultados/valores?${params}`,{signal:resultMap.controller.signal});
    if(!resultMap.enabled || sequence!==resultMap.sequence) return;
    valores=data.valores;rango=data.rango;resultMap.unit=data.unidad;valueState.loading=false;drawParcels();
    const count=visibleFeatures().filter(feature=>hasNumber(valores[feature.id])).length;
    $('#results-caption').textContent=`${count} parcelas con dato · ${data.unidad}`;
    updateLegend();
    updateMapSummary();
  } catch(error) {
    if(!resultMap.enabled || sequence!==resultMap.sequence || error.name==='AbortError') return;
    valueState.loading=false;valueState.error=error.message;renderParcelTable();
    $('#results-error').textContent=error.message;$('#results-error').hidden=false;$('#results-caption').textContent='No se pudieron cargar los valores';
    updateLegend();
  }
}
$('#results-set').onchange=e=>{
  const set=resultMap.sets[Number(e.target.value)];
  resultMap.model=set.model;resultMap.dataset=set.campaña;updateResultMetrics();return paintResultMap();
};
$('#results-metric').onchange=e=>{clearValueRange();resultMap.metric=e.target.value;return paintResultMap();};
window.DASHBOARD_AGENT=window.createDashboardAgent({
  parcels:()=>allParcels?.features || [],layers:()=>capas,
  snapshot:()=>({vista:$('#container').hidden ? $('#tabla').hidden ? 'documentacion' : 'tabla' : 'mapa',capa:$('#capa').value,metrica:resultMap.enabled ? resultMap.metric : null,filtros:{conjunto:parcelFilters.cohort,estado:parcelFilters.state,municipio:parcelFilters.municipality,busqueda:parcelFilters.query,disponibilidad:parcelFilters.availability,minimo:parcelFilters.minimum==='' ? null : Number(parcelFilters.minimum),maximo:parcelFilters.maximum==='' ? null : Number(parcelFilters.maximum)}}),
  seleccionar_parcela:({id})=>irA(id),
  mostrar_capa:({id,fecha})=>{$('#capa').value=id;$('#fecha').dataset.capa='';clearValueRange();disableResultMap(false);pintar(fecha);},
  mostrar_resultados:({metrica})=>{clearValueRange();resultMap.metric=metrica;if(resultMap.enabled) {updateResultMetrics();paintResultMap();}else {resultMap.model ||= 'ensamble-50-50-v1';resultMap.dataset ||= 'agrocebada-final';activateResultMap();}},
  cambiar_vista:({vista:view})=>vista(view),
  filtrar_parcelas:args=>{
    const fields={conjunto:'cohort',estado:'state',municipio:'municipality',busqueda:'query',disponibilidad:'availability',minimo:'minimum',maximo:'maximum'};
    if(args.estado!==undefined && args.municipio===undefined) parcelFilters.municipality='';
    for(const [key,value] of Object.entries(args)) parcelFilters[fields[key]]=value==null ? '' : String(value);
    if(args.municipio) parcelFilters.state=allParcels.features.find(f=>f.properties.municipio===args.municipio)?.properties.estado || '';
    updatePopulation(parcelFilters.cohort);
    if(args.municipio) regionController?.focus(args.municipio);
  },
  limpiar_filtros:()=>$('#table-reset').onclick(),
  vista_general:()=>{vista('mapa');$('#region-home').onclick();},
  limites_geograficos:({visible})=>{const control=$('#administrative-borders');control.checked=visible;control.onchange({target:control});}
});
init().catch(error => { $('#map-status').textContent = error.message; $('#map-status').hidden = false; });


