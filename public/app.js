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
const resultMap = {enabled:false,model:null,dataset:null,metric:'prediccion',sets:[],sequence:0,controller:null};
let resultCataloguePromise=null;
const ramp = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'];
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function color(t) {
  t = Math.min(1, Math.max(0, t)) * (ramp.length - 1);
  const i = Math.min(Math.floor(t), ramp.length - 2), f = t - i, a = hex(ramp[i]), b = hex(ramp[i + 1]);
  return `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * f))})`;
}
let geo, allParcels=null, predictionOnly=false, administrativeLayer=null, administrativePromise=null;
let capas = [], valores = {}, rango = [0, 1], selectedParcelId = null;
let dashboardSequence = 0, dashboardController = null, infoSequence = 0, infoController = null, currentDashboard = null, layerSequence = 0;
const estilo = feature => {
  const v = valores[feature.id], selected = String(feature.id) === selectedParcelId;
  return { color: selected ? '#ffb000' : '#fff', weight: selected ? 3 : ($('#contornos').checked ? 1.5 : 0),
    fillColor: v == null ? '#888' : color((v - rango[0]) / (rango[1] - rango[0] || 1)),
    fillOpacity: Number($('#opacidad').value) * (v == null ? 0.4 : 1) };
};
function refreshStyle() { if (geo) geo.setStyle(estilo); }
function visibleFeatures() {return allParcels?.features.filter(f=>!predictionOnly || f.properties.cohorte==='prediccion') || [];}
function updateMapSummary() {
  const visible=visibleFeatures(),name=resultMap.enabled ? $('#results-metric').selectedOptions[0]?.textContent : capas.find(c=>c.id===$('#capa').value)?.nombre;
  $('#map-summary').hidden=!visible.length;
  $('#map-summary').innerHTML=`<strong>${esc(name || 'Parcelas')}</strong><span>${visible.length} parcelas${predictionOnly ? ' de predicción final' : ' en el mapa'}</span>`;
}
function drawParcels() {
  const features=visibleFeatures();
  if(geo) map.removeLayer(geo);
  geo=L.geoJSON({type:'FeatureCollection',features},{style:estilo,onEachFeature:(feature,layer)=>layer.on('click',e=>{
    if(e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
    selectParcel(String(feature.id));
  })}).addTo(map);
  if(selectedParcelId && !features.some(f=>String(f.id)===selectedParcelId)) clearSelection();
  $('#ids').innerHTML=features.map(f=>`<option value="${esc(f.id)}"></option>`).join('');
  $('#t').innerHTML=`<caption>${features.length} parcelas${predictionOnly ? ' de predicción final' : ''}</caption><thead><tr><th>Parcela</th><th>Municipio</th><th>Conjunto</th></tr></thead><tbody>`+
    features.map(f=>`<tr data-id="${esc(f.id)}"><td><button type="button">${esc(f.id)}</button></td><td>${esc(f.properties.municipio || '')}</td><td>${f.properties.cohorte==='prediccion' ? 'Predicción final' : f.properties.cohorte==='referencia' ? 'Entrenamiento · OOF' : ''}</td></tr>`).join('')+'</tbody>';
  $('#t').onclick=e=>{const id=e.target.closest('tr')?.dataset.id;if(id)irA(id);};
  updateMapSummary();
}
function updatePredictionFilter(enabled) {
  predictionOnly=enabled;
  $('#prediction-filter').setAttribute('aria-pressed',String(enabled));
  drawParcels();
  if(resultMap.enabled) {updateResultMetrics();paintResultMap();}
}
$('#prediction-filter').onclick=()=>updatePredictionFilter(!predictionOnly);
L.DomEvent.disableClickPropagation($('#map-tools'));
map.createPane('administrative');
map.getPane('administrative').style.zIndex=450;
map.getPane('administrative').style.pointerEvents='none';
$('#administrative-borders').onchange=async e=>{
  const control=e.target,status=$('#administrative-status');
  if(!control.checked) {
    if(administrativeLayer) map.removeLayer(administrativeLayer);
    status.hidden=true;return;
  }
  status.hidden=false;status.textContent='Cargando límites…';
  try {
    administrativePromise ??= json(C.limitesAdministrativos).catch(error=>{administrativePromise=null;throw error;});
    const data=await administrativePromise;
    administrativeLayer ??= L.geoJSON(data,{pane:'administrative',interactive:false,style:feature=>({
      color:feature.properties.nivel==='estado' ? '#f0b75c' : '#82d4e2',
      weight:feature.properties.nivel==='estado' ? 3 : 1.3,
      opacity:.95,fill:false,dashArray:feature.properties.nivel==='municipio' ? '5 4' : undefined
    })});
    if(!control.checked) return;
    administrativeLayer.addTo(map);
    status.innerHTML='<span class="border-key state-key"></span> Estados <span class="border-key municipality-key"></span> Municipios<br><small>INEGI · límites geoestadísticos</small>';
  } catch(error) {
    if(!control.checked) return;
    control.checked=false;status.textContent='No se pudieron cargar los límites. Activa el control para reintentar.';
  }
};
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
  if (resultMap.enabled) return;
  const sequence = ++layerSequence, capa = $('#capa').value, fSel = $('#fecha');
  $('#layers-error').hidden = true;
  if (!capa) { valores = {}; fSel.hidden = true; $('#leyenda').replaceChildren(); refreshStyle(); return; }
  try {
    if (fSel.dataset.capa !== capa) {
      const fechas = await json(`/api/capas/${encodeURIComponent(capa)}/fechas`);
      if (sequence !== layerSequence || resultMap.enabled) return;
      fSel.innerHTML = fechas.map(f => `<option value="${esc(f)}">${esc(P.date(f))}</option>`).join('');
      fSel.value = fechas.at(-1) ?? ''; fSel.dataset.capa = capa;
    }
    fSel.hidden = !fSel.value || fSel.options.length<2;
    const data = await json(`/api/capas/${encodeURIComponent(capa)}/valores?fecha=${encodeURIComponent(fSel.value)}`);
    if (sequence !== layerSequence || resultMap.enabled) return;
    valores = data.valores;
    const c = capas.find(x => x.id === capa), vs = Object.values(valores).filter(v => v != null && Number.isFinite(v));
    rango = [c?.min ?? (vs.length ? Math.min(...vs) : 0), c?.max ?? (vs.length ? Math.max(...vs) : 1)];
    $('#leyenda').innerHTML = `<div class="grad" style="background:linear-gradient(90deg,${ramp})"></div><div class="rango"><span>${esc(number(rango[0]))}</span><span>${esc(number(rango[1]))}</span></div><small>${esc(c?.unidad || '')}</small>`;
    refreshStyle();
    updateMapSummary();
  } catch (error) { if (sequence === layerSequence) { $('#layers-error').textContent = error.message; $('#layers-error').hidden = false; } }
}
$('#capa').onchange = $('#fecha').onchange = () => { disableResultMap(false); pintar(); };
$('#info-button').onclick = () => { if (currentDashboard) requestExplanation(currentDashboard); };
function vista(view) {
  $('#container').hidden = view !== 'mapa'; $('#tabla').hidden = view !== 'tabla'; $('#documentacion').hidden = view !== 'documentacion';
  document.querySelectorAll('.nav a[data-v]').forEach(a => a.classList.toggle('active', a.dataset.v === view));
  if (view === 'mapa') requestAnimationFrame(() => { map.invalidateSize(); ajustarLimites(); });
}
document.querySelectorAll('.nav a[data-v]').forEach(a => a.onclick = e => { e.preventDefault(); vista(a.dataset.v); });
function irA(id) {
  if (!geo) return;
  if(predictionOnly && allParcels.features.some(f=>String(f.id)===id && f.properties.cohorte!=='prediccion')) updatePredictionFilter(false);
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
    const fc = parcelResult.value;allParcels=fc;drawParcels();
    const predictionCount=fc.features.filter(f=>f.properties.cohorte==='prediccion').length;
    $('#prediction-filter').hidden=predictionCount===0;
    $('#prediction-filter').textContent=`${predictionCount} parcelas`;
    if (geo.getBounds().isValid()) { map.fitBounds(geo.getBounds()); ajustarLimites(); }
    $('#map-status').hidden = true;
  } else { $('#map-status').textContent = `No se pudieron cargar las parcelas: ${parcelResult.reason.message}`; }
  if (layerResult.status === 'fulfilled') {
    capas = layerResult.value;
    const grupos = {}; capas.forEach(c => (grupos[c.grupo] ??= []).push(c));
    $('#capa').insertAdjacentHTML('beforeend', Object.entries(grupos).map(([grupo, lista]) =>
      `<optgroup label="${esc(grupo)}">${lista.map(c => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('')}</optgroup>`).join(''));
    const initial=capas.find(c=>c.id===C.capaInicial) || capas.find(c=>c.nombre==='Elevación');
    if(initial) {$('#capa').value=initial.id;await pintar();}
  } else { $('#layers-error').textContent = `No se pudieron cargar las capas: ${layerResult.reason.message}`; $('#layers-error').hidden = false; }
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
  const sequence = ++dashboardSequence;
  ++infoSequence; dashboardController?.abort(); infoController?.abort();
  dashboardController = new AbortController();
  $('#dashboard-data').replaceChildren(); clearExplanation();
  dashboardState('loading', `Cargando parcela ${id}…`); refreshStyle();
  try {
    const selectors = resultMap.enabled ? `?${new URLSearchParams({'campaña':resultMap.dataset,version_modelo:resultMap.model})}` : '';
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
  if(validation.length) parts.push(`<h3>Evaluación global del ensamble</h3><p>Métricas reportadas sobre ${model.entrenamiento} parcelas con observado.</p><div class="table-wrap"><table><thead><tr><th>Validación</th><th>MAE (t/ha)</th><th>RMSE (t/ha)</th><th>R²</th><th>MAE por fold ± DE</th></tr></thead><tbody>${validation.map(r=>`<tr><td title="${esc(r.esquema)}">${esc(P.scheme(r.esquema))}</td><td>${number(r.MAE_pooled,3)}</td><td>${number(r.RMSE_pooled,3)}</td><td>${number(r.R2_pooled,3)}</td><td>${number(r.MAE_fold_media,3)} ± ${number(r.MAE_fold_sd,3)}</td></tr>`).join('')}</tbody></table></div><small>MAE y RMSE se calculan sobre parcelas (pooled). La media por fold da igual peso a cada partición; en LOGO, a cada municipio.</small>`);
  if(ctx?.validacion_parcela?.length) parts.push(`<h3>Predicción de esta parcela en validación</h3><div class="table-wrap"><table><thead><tr><th>Validación</th><th>Predicción (t/ha)</th><th>Error firmado (t/ha)</th></tr></thead><tbody>${ctx.validacion_parcela.map(r=>`<tr><td title="${esc(r.esquema)}">${esc(P.scheme(r.esquema))}</td><td>${number(r.prediccion)}</td><td>${number(r.error_firmado_t_ha)}</td></tr>`).join('')}</tbody></table></div>`);
  const importances=(model?.importancias_globales || []).filter(r=>hasNumber(r.shap_media));
  if(importances.length) {
    const max=Math.max(.001,...importances.map(r=>r.shap_media));
    parts.push(`<h3>Variables más importantes en el conjunto</h3><p>Media de |SHAP| · HGB agronómico sin coordenadas. Estas importancias globales no son aportes de esta parcela.</p><div class="importance-list">${importances.map((r,i)=>`<div class="importance-row"><span title="${esc(r.variable)}">${esc(P.variable(r.variable))}</span><div class="importance-track"><div class="importance-color-${i%3}" style="width:${100*r.shap_media/max}%"></div></div><small>${number(r.shap_media,3)} ± ${number(r.shap_sd,3)} t/ha</small></div>`).join('')}</div>`);
  }
  if(model?.limitaciones?.length) parts.push(`<details class="data-details"><summary>Alcance del modelo</summary><ul>${model.limitaciones.map(s=>`<li>${esc(s)}</li>`).join('')}</ul></details>`);
  const features=Object.entries(ctx?.variables_modelo || {}).filter(([,value])=>hasNumber(value));
  if(features.length) parts.push(`<details class="data-details"><summary>${features.length} variables disponibles de esta parcela</summary><p>Valores originales de los insumos. Pasa sobre un nombre para ver su identificador en el CSV.</p><div class="table-wrap"><table><thead><tr><th>Variable</th><th>Valor</th></tr></thead><tbody>${features.map(([key,value])=>`<tr><td title="${esc(key)}">${esc(P.variable(key))}</td><td>${number(value,4)}${P.unit(key) ? ' '+esc(P.unit(key)) : ''}</td></tr>`).join('')}</tbody></table></div></details>`);
  return parts.join('');
}
function svgChart(content, height = 190) { return `<svg viewBox="0 0 460 ${height}" role="img" aria-label="Gráfica de resultados">${content}</svg>`; }
function renderChart1(data) {
  const rows=[['Predicción',data.resultado.prediccion,'#218f83'],['Observado',data.resultado.observado,'#5b6fa9']].filter(row=>hasNumber(row[1]));
  const max=Math.max(1,...rows.map(row=>row[1]).filter(v=>v!=null))*1.2;
  const y=value=>155-115*value/max;
  let svg='<text x="48" y="15" font-size="11">'+esc(data.unidad_rendimiento)+'</text><line x1="48" y1="155" x2="435" y2="155" stroke="#bbb"/>';
  for(let i=0;i<=4;i++) {
    const value=max*i/4;
    svg+=`<line x1="48" y1="${y(value)}" x2="435" y2="${y(value)}" stroke="#eee"/><text x="40" y="${y(value)+4}" text-anchor="end" font-size="11">${number(value,1)}</text>`;
  }
  rows.forEach(([name,value,fill],i)=>{
    const x=rows.length===1 ? 240 : 130+i*180;
    svg+=`<text x="${x}" y="180" text-anchor="middle" font-size="12">${esc(name)}</text>`;
    if(value==null) svg+=`<text x="${x}" y="105" text-anchor="middle" font-size="12">Sin dato</text>`;
    else svg+=`<rect x="${x-35}" y="${y(value)}" width="70" height="${155-y(value)}" rx="5" fill="${fill}"><title>${esc(name)}: ${number(value)} ${esc(data.unidad_rendimiento)}</title></rect><text x="${x}" y="${y(value)-8}" text-anchor="middle" font-size="12">${number(value)}</text>`;
  });
  $('#chart1').innerHTML=svgChart(svg,200);
}
function renderChart2(data) {
  const error=data.metricas.error_firmado_t_ha;
  if(error==null) { $('#chart2').innerHTML='<p>Sin rendimiento observado: no se puede calcular el error.</p>';return; }
  const extent=Math.max(1,Math.abs(error)*1.2),x=value=>240+175*value/extent;
  const left=Math.min(240,x(error)),width=Math.abs(x(error)-240);
  const svg=`<text x="240" y="25" text-anchor="middle" font-size="13">${number(error)} ${esc(data.unidad_rendimiento)}</text><line x1="65" y1="100" x2="415" y2="100" stroke="#bbb"/><line x1="240" y1="45" x2="240" y2="115" stroke="#777"/><rect x="${left}" y="62" width="${width}" height="30" rx="4" fill="${error>=0 ? '#3b528b' : '#21918c'}"><title>Error firmado: ${number(error)} ${esc(data.unidad_rendimiento)}</title></rect><text x="65" y="135" text-anchor="middle" font-size="11">${number(-extent,1)}</text><text x="240" y="135" text-anchor="middle" font-size="11">0</text><text x="415" y="135" text-anchor="middle" font-size="11">${number(extent,1)}</text>`;
  $('#chart2').innerHTML=svgChart(svg,155);
}
function renderChart3(data) {
  const partial=data.contexto_modelo?.shap_hgb_parcial?.length ? data.contexto_modelo.shap_hgb_parcial : null;
  const rows = partial ? partial.map(c=>({variable:c.variable,aporte_t_ha:c.aporte_redondeado_t_ha})) : data.contribuciones;
  if (!rows.length) {
    const status=data.explicabilidad?.estado;
    $('#chart3').innerHTML=status==='incoherente' ? '<p>Los SHAP recibidos no reconstruyen la predicción mostrada. Explicación pendiente de corregir.</p>' : data.modelo ? '<p>No se exportó una explicación SHAP completa para esta predicción OOF. Consulta Modelo para las importancias globales.</p>' : '<p>Explicación SHAP pendiente: falta confirmar el modelo y la predicción que explican los aportes.</p>';
    return;
  }
  const max = Math.max(.01, ...rows.map(c => Math.abs(c.aporte_t_ha))), height = rows.length * 36 + 40, zero = 310;
  let svg = `<line x1="${zero}" y1="5" x2="${zero}" y2="${height-28}" stroke="#777"/>`;
  rows.forEach((c, i) => {
    const width = Math.abs(c.aporte_t_ha) * 96 / max, y = i * 36 + 10;
    svg += `<text x="195" y="${y+16}" text-anchor="end" font-size="11">${esc(P.variable(c.variable).length>30 ? P.variable(c.variable).slice(0,28)+'…' : P.variable(c.variable))}</text><rect x="${c.aporte_t_ha >= 0 ? zero : zero-width}" y="${y}" width="${width}" height="22" fill="${c.aporte_t_ha >= 0 ? '#21918c' : '#3b528b'}"><title>${number(c.aporte_t_ha)} ${esc(data.unidad_rendimiento)}</title></rect><text x="448" y="${y+16}" text-anchor="end" font-size="10">${number(c.aporte_t_ha)}</text>`;
  });
  $('#chart3').innerHTML = (partial ? `<h4>Componente HGB final: tres aportes redondeados</h4><p>Tres contribuciones redondeadas a la salida del HGB (${number(data.contexto_modelo.componentes.hgb)} t/ha). Son una explicación parcial de ese componente y no reconstruyen el ensamble.</p>` : '') + svgChart(svg, height) + (partial ? '' : `<p>Valor base: ${number(data.resultado.valor_base_t_ha)} · Predicción: ${number(data.resultado.prediccion)} ${esc(data.unidad_rendimiento)}</p>`);
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
    $('#ai-caption').textContent = data.mode === 'mock' ? 'Explicación local: sin llamada a IA.' : `Análisis de la parcela ${context.ID_POLIGONO}`;
  } catch (error) {
    if (!isCurrent() || error.name === 'AbortError') return;
    $('#info-error').textContent = error.message; $('#info-error').hidden = false;
  } finally { if (isCurrent()) { $('#info-loading').hidden = true; $('#info-button').disabled = false; $('#info-button').setAttribute('aria-busy','false'); } }
}
async function activateResultMap() {
  resultMap.enabled=true;++layerSequence;
  $('#results-panel').hidden=false;$('#results-button').setAttribute('aria-expanded','true');
  $('#results-caption').textContent='Cargando conjuntos…';$('#results-error').hidden=true;toggleLayers(false);
  try {
    resultCataloguePromise ??= json('/api/resultados/campanas').catch(error=>{resultCataloguePromise=null;throw error;});
    const catalogue=await resultCataloguePromise;
    if(!resultMap.enabled) return;
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
    if(!resultMap.enabled) return;
    $('#results-error').textContent=error.message;$('#results-error').hidden=false;$('#results-caption').textContent='Resultados no disponibles';
  }
}
function updateResultMetrics() {
  const set=resultMap.sets.find(s=>s.model===resultMap.model && s.campaña===resultMap.dataset);
  const options=[['prediccion','Predicción'],['observado','Observado'],['error_firmado_t_ha','Error firmado'],['error_absoluto_t_ha','Error absoluto']]
    .filter(([key])=>(!predictionOnly || key==='prediccion') && set?.metricas_disponibles?.[key]!==false);
  if(!options.some(([key])=>key===resultMap.metric)) resultMap.metric=options[0]?.[0] || 'prediccion';
  $('#results-metric').innerHTML=options.map(([key,label])=>`<option value="${key}">${label}</option>`).join('');
  $('#results-metric').value=resultMap.metric;
}
function disableResultMap(restore=true) {
  const wasEnabled=resultMap.enabled;
  resultMap.enabled=false;++resultMap.sequence;resultMap.controller?.abort();
  $('#results-panel').hidden=true;$('#results-button').setAttribute('aria-expanded','false');
  if(restore) pintar();
  updateMapSummary();
  if(wasEnabled && selectedParcelId) selectParcel(selectedParcelId);
}
async function paintResultMap() {
  if(!resultMap.enabled || !resultMap.dataset || !resultMap.model) return;
  const sequence=++resultMap.sequence;
  resultMap.controller?.abort();resultMap.controller=new AbortController();
  valores={};refreshStyle();$('#results-error').hidden=true;$('#results-legend').replaceChildren();
  $('#results-caption').textContent='Cargando valores…';
  if(selectedParcelId) selectParcel(selectedParcelId);
  const params=new URLSearchParams({'campaña':resultMap.dataset,version_modelo:resultMap.model,metrica:resultMap.metric});
  try {
    const data=await json(`/api/resultados/valores?${params}`,{signal:resultMap.controller.signal});
    if(!resultMap.enabled || sequence!==resultMap.sequence) return;
    valores=data.valores;rango=data.rango;refreshStyle();
    const count=visibleFeatures().filter(feature=>hasNumber(valores[feature.id])).length;
    $('#results-caption').textContent=`${count} parcelas con dato · ${data.unidad}`;
    $('#results-legend').innerHTML=`<div class="grad" style="background:linear-gradient(90deg,${ramp})"></div><div class="rango"><span>${number(rango[0])}</span><span>${number(rango[1])}</span></div><small>${esc(data.dataset_label)} · Gris: sin dato.</small>`;
    updateMapSummary();
  } catch(error) {
    if(!resultMap.enabled || sequence!==resultMap.sequence || error.name==='AbortError') return;
    $('#results-error').textContent=error.message;$('#results-error').hidden=false;$('#results-caption').textContent='No se pudieron cargar los valores';
  }
}
$('#results-button').onclick=()=>resultMap.enabled ? disableResultMap() : activateResultMap();
$('#results-close').onclick=()=>disableResultMap();
$('#results-set').onchange=e=>{
  const set=resultMap.sets[Number(e.target.value)];
  resultMap.model=set.model;resultMap.dataset=set.campaña;updateResultMetrics();paintResultMap();
};
$('#results-metric').onchange=e=>{resultMap.metric=e.target.value;paintResultMap();};
for(const id of ['results-panel','results-button']) {
  L.DomEvent.disableClickPropagation($('#'+id));L.DomEvent.disableScrollPropagation($('#'+id));
}
init().catch(error => { $('#map-status').textContent = error.message; $('#map-status').hidden = false; });


