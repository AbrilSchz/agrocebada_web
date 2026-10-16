// Prueba del HTML generado y navegación de pestañas; no sustituye revisión visual.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const fixture=JSON.parse(execFileSync('python3',['-c',String.raw`
import sqlite3,json
from pathlib import Path
db=sqlite3.connect(Path('db/parcelas_final.sqlite').resolve().as_uri()+'?mode=ro',uri=True)
db.row_factory=sqlite3.Row
summary=json.loads(db.execute('SELECT contenido_json FROM modelo_resumen').fetchone()[0])
rows={}
for pid in ['AGC_001','AGC_003']:
 rows[pid]={'resultado':dict(db.execute('SELECT * FROM parcelas_resultados WHERE ID_POLIGONO=?',(pid,)).fetchone()),'contexto':json.loads(db.execute('SELECT contenido_json FROM parcelas_contexto_modelo WHERE ID_POLIGONO=?',(pid,)).fetchone()[0])}
db.close()
db=sqlite3.connect(Path('db/parcelas_final.sqlite').resolve().as_uri()+'?mode=ro',uri=True)
features=[]
for pid,lon,lat,geometry,context in db.execute('SELECT p.ID_POLIGONO,p.longitud_ref,p.latitud_ref,p.geometria_geojson,c.contenido_json FROM parcelas p JOIN parcelas_contexto_modelo c ON p.ID_POLIGONO=c.ID_POLIGONO'):
 ctx=json.loads(context)
 features.append({'type':'Feature','id':pid,'geometry':json.loads(geometry),'properties':{'cohorte':ctx['cohorte'],'municipio':ctx['municipio'],'longitud_ref':lon,'latitud_ref':lat}})
db.close()
print(json.dumps({'summary':summary,'rows':rows,'features':features}))
`],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8'}));
const summary=fixture.summary;
function parcel(id) {
  const row=fixture.rows[id].resultado,ctx=fixture.rows[id].contexto;
  return {ID_POLIGONO:id,unidad_rendimiento:'t/ha',dataset:{label:'AgroCebada final'},
    resultado:{prediccion:row.prediccion,observado:row.observado,tipo_prediccion:row.tipo_prediccion,esquema_oof:ctx.esquema_oof},
    metricas:{error_firmado_t_ha:row.error_firmado_t_ha,error_absoluto_t_ha:row.error_absoluto_t_ha,error_relativo_pct:row.error_relativo_pct},
    contexto_modelo:ctx,contribuciones:[],mediciones_existentes:[],modelo:{...summary,importancias_globales:summary.importancias_globales.slice(0,10)}};
}
let markup='',buttons=[],panels=[],elements=new Map();
function node(id) {
  return {id,innerHTML:'',value:'',hidden:false,attributes:{},dataset:{},style:{},children:[],events:{},classList:{toggle(){}},replaceChildren(){this.innerHTML='';},append(child){this.children.push(child);},addEventListener(key,callback){this.events[key]=callback;},
    get options(){return [...this.innerHTML.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map(m=>({value:m[1],textContent:m[2]}));},
    get selectedOptions(){return this.options.filter(o=>o.value===this.value);},
    setAttribute(key,value){this.attributes[key]=value;},focus(){this.focused=true;}};
}
const dashboard=node('dashboard-data');
Object.defineProperty(dashboard,'innerHTML',{get:()=>markup,set:value=>{
  markup=value;elements=new Map([['#dashboard-data',dashboard]]);
  for(const m of value.matchAll(/id="([^"]+)"/g)) if(m[1]!=='dashboard-data') elements.set('#'+m[1],node(m[1]));
  buttons=[...value.matchAll(/<button id="tab-([^"]+)"[^>]*>/g)].map(m=>{
    const b=elements.get('#tab-'+m[1]);b.dataset.chartTab=m[1];return b;
  });
  panels=[...value.matchAll(/data-chart-panel="([^"]+)"/g)].map(m=>{
    const p=elements.get('#panel-'+m[1]);p.dataset.chartPanel=m[1];return p;
  });
}});
elements.set('#dashboard-data',dashboard);
const scope={window:{},console,document:{querySelector:key=>elements.get(key),querySelectorAll:key=>key==='[data-chart-tab]' ? buttons : key==='[data-chart-panel]' ? panels : []}};
vm.createContext(scope);
vm.runInContext(readFileSync(new URL('../public/labels.js',import.meta.url),'utf8'),scope);
vm.runInContext(readFileSync(new URL('../public/charts.js',import.meta.url),'utf8'),scope);
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const functions=source.slice(source.indexOf('function showChart('),source.indexOf('async function requestExplanation('));
vm.runInContext(`const P=window.PRESENTATION,hasNumber=P.hasNumber,$=s=>document.querySelector(s);const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const number=(v,d=2)=>hasNumber(v)?Number(v).toFixed(d):'';let activeChart='errores';function dashboardState(){}function irA(){};${functions}`,scope);
scope.data=parcel('AGC_001');vm.runInContext('updateDashboard(data)',scope);
assert(markup.includes('data-chart-tab="errores"'));
assert(!markup.includes('data-chart-tab="aportes"'));
assert(!markup.includes('Variables de la explicación'));
assert(!markup.includes('Mediciones y capas de la parcela'));
assert(!markup.includes('No disponible'));
assert.equal(vm.runInContext('activeChart',scope),'errores');
scope.data=parcel('AGC_003');vm.runInContext('updateDashboard(data)',scope);
assert(!markup.includes('data-chart-tab="errores"'));
assert(markup.includes('data-chart-tab="aportes"'));
assert(!markup.includes('metric-observed'));
assert(!markup.includes('metric-signed'));
assert(markup.includes('Variables con aportes del HGB'));
assert(markup.includes('Precipitación · mayo 2025'));
assert(!markup.includes('No disponible'));
assert(!elements.get('#chart1').innerHTML.includes('Observado'));
assert.equal(vm.runInContext('activeChart',scope),'rendimiento');
const ids=buttons.map(b=>b.dataset.chartTab);
assert.deepEqual(ids,['rendimiento','aportes','modelo']);
buttons[0].onkeydown({key:'ArrowRight',preventDefault(){}});
assert.equal(vm.runInContext('activeChart',scope),'aportes');
buttons[1].onkeydown({key:'ArrowRight',preventDefault(){}});
assert.equal(vm.runInContext('activeChart',scope),'modelo');
assert.equal(panels.find(p=>p.dataset.chartPanel==='modelo').hidden,false);
scope.data={resultado:{prediccion:0,observado:0},metricas:{error_firmado_t_ha:0,error_absoluto_t_ha:0,error_relativo_pct:null},dataset:{label:'Cero real'},unidad_rendimiento:'t/ha',contribuciones:[]};
vm.runInContext('updateDashboard(data)',scope);
assert(markup.includes('data-chart-tab="errores"'));
assert(!markup.includes('data-chart-tab="aportes"'));
assert(!markup.includes('data-chart-tab="modelo"'));
assert(markup.includes('0.00'));
assert(!markup.includes('metric-relative'));
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const controls=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>['#'+m[1],node(m[1])]));
controls.get('#capa').value='final_Elevacion_INEGI_CEM4_120m_mean';
controls.get('#capa').innerHTML='<option value="final_Elevacion_INEGI_CEM4_120m_mean">Elevación</option><option value="final_prec">Precipitación</option>';
controls.get('#fecha').hidden=true;
let layers=new Set(),borderRequests=0;
const panes=new Map(),motions=[],container=node('map-container'),mapEvents=new Map();let mapZoom=10;
const map={removeLayer(layer){layers.delete(layer);},createPane(name){const p=node(name);panes.set(name,p);return p;},getPane(name){return panes.get(name);},getContainer(){return container;},on(names,fn){for(const name of names.split(' ')) {const list=mapEvents.get(name)||[];list.push(fn);mapEvents.set(name,list);}},getZoom(){return mapZoom;},getSize(){return {x:700,y:650};},stop(){},flyToBounds(bounds,options){motions.push({method:'fly',bounds,options});},fitBounds(bounds,options){motions.push({method:'fit',bounds,options});},containerPointToLayerPoint(){return {x:0,y:0};},latLngToContainerPoint([lat,lon]){return {x:(lon+99)*300,y:(21-lat)*300};}};
const borderData=JSON.parse(readFileSync(new URL('../public/geografia/limites.geojson',import.meta.url),'utf8'));
const mapScope={window:{PRESENTATION:scope.window.PRESENTATION,matchMedia:()=>({matches:mapScope.reducedMotion || false})},document:{querySelector:key=>controls.get(key),createElementNS:(_ns,tag)=>node(tag),createElement:tag=>node(tag)},
  map,L:{DomEvent:{disableClickPropagation(){},disableScrollPropagation(){},stopPropagation(){}},DomUtil:{setPosition(target,pos){target.position=pos;}},geoJSON(data,options){
    const list=data.features.map(feature=>{
      const element=node(feature.properties.cvegeo || feature.id);
      const layer={feature,events:{},on(key,callback){if(typeof key==='string')this.events[key]=callback;else Object.assign(this.events,key);return this;},bindTooltip(text){this.tooltip=text;return this;},getTooltip(){return this.tooltip;},unbindTooltip(){this.tooltip=null;return this;},setStyle(style){this.style=style;return this;},getBounds(){return {isValid:()=>true,id:feature.properties.cvegeo || feature.id};},getElement(){return element;},openTooltip(){this.tooltipOpen=true;},closeTooltip(){this.tooltipOpen=false;}};
      options.onEachFeature?.(feature,layer);return layer;
    });
    return {features:data.features,options,children:list,addTo(){layers.add(this);return this;},setStyle(style){list.forEach(layer=>layer.setStyle(typeof style==='function' ? style(layer.feature) : style));},eachLayer(fn){list.forEach(fn);},getBounds(){return {isValid:()=>data.features.length>0};}};
  }},
  fixture,borderData,console,AbortController,URLSearchParams,requestAnimationFrame:()=>1,json:async url=>{
    if(url==='geografia/limites.geojson') {borderRequests++;return borderData;}
    if(url==='/api/resultados/campanas') return {modelos:[{version_modelo:'modelo-final',campanas:[{campaña:'final',label:'Final',dataset_id:'final',metricas_disponibles:{prediccion:true,observado:true,error_firmado_t_ha:true,error_absoluto_t_ha:true}}]}]};
    if(url.startsWith('/api/resultados/valores')) return {valores:{AGC_001:3.049,AGC_003:3.503},rango:[3,4],unidad:'t/ha',dataset_label:'Final'};
    if(url.endsWith('/fechas')) return ['2025-04','2025-05'];
    if(url.includes('/valores?')) return {valores:{AGC_001:21,AGC_003:30}};
    throw Error(url);
  },setTimeout,clearTimeout,P:scope.window.PRESENTATION};
vm.createContext(mapScope);
for(const file of ['config.js','parcels.js','regions.js','agent-actions.js','dashboard-agent.js']) vm.runInContext(readFileSync(new URL('../public/'+file,import.meta.url),'utf8'),mapScope);
mapScope.window.AGENT_ACTIONS=mapScope.AGENT_ACTIONS;
mapScope.C=mapScope.window.CONFIG;
const mapFunctions=source.slice(source.indexOf('function visibleFeatures('),source.indexOf('async function json('));
vm.runInContext(`const $=s=>document.querySelector(s),hasNumber=P.hasNumber,esc=v=>String(v??''),number=(v,d=2)=>Number(v).toFixed(d);let allParcels=window.REGIONS.enrichParcels({type:'FeatureCollection',features:fixture.features},borderData,C.estados),geo,predictionOnly=false,regionController=null,administrativePromise=null,selectedParcelId='AGC_001';let valores={},rango=[0,1],layerSequence=0,resultCataloguePromise=null,currentDashboard=null;const parcelFilters={state:'',cohort:'',municipality:'',query:'',availability:'',minimum:'',maximum:''},tableSort={key:'id',direction:'asc'},valueState={loading:false,error:''},ramp=['red','blue'];const resultMap={enabled:false,model:null,dataset:null,metric:'prediccion',sets:[],sequence:0,catalogueSequence:0,controller:null};const capas=[{id:'final_Elevacion_INEGI_CEM4_120m_mean',nombre:'Elevación',unidad:'m'},{id:'final_prec',nombre:'Precipitación',unidad:'mm'}];let mapVisits=0;function estilo(){}function refreshStyle(){renderParcelTable();}function selectParcel(id){selectedParcelId=id;}function clearSelection(){selectedParcelId=null;}function irA(){mapVisits++;}function toggleLayers(){};${mapFunctions}`,mapScope);
vm.runInContext(source.slice(source.indexOf('function syncChatContext('),source.indexOf('function visibleFeatures(')),mapScope);
vm.runInContext(source.slice(source.indexOf('async function pintar('),source.indexOf("$('#info-button').onclick")),mapScope);
vm.runInContext(source.slice(source.indexOf('async function activateResultMap('),source.indexOf('init().catch(')),mapScope);
vm.runInContext('updatePredictionFilter(true)',mapScope);
assert.equal(vm.runInContext('geo.features.length',mapScope),59);
assert.equal(vm.runInContext('selectedParcelId',mapScope),null);
assert.equal(controls.get('#prediction-filter').attributes['aria-pressed'],'true');
assert.equal((controls.get('#t').innerHTML.match(/<tr data-id=/g)||[]).length,59);
assert(controls.get('#map-summary').innerHTML.includes('Elevación'));
vm.runInContext('updatePredictionFilter(false)',mapScope);
assert.equal(vm.runInContext('geo.features.length',mapScope),197);
controls.get('#table-query').oninput({target:{value:'agc_003'}});
await new Promise(resolve=>setTimeout(resolve,150));
assert.equal(vm.runInContext('geo.features.length',mapScope),1);
assert.equal(controls.get('#map-query').value,'agc_003');
controls.get('#table-reset').onclick();
controls.get('#map-municipality').onchange({target:{value:'Singuilucan'}});
assert.equal(vm.runInContext('geo.features.length',mapScope),23);
assert.equal(controls.get('#table-municipality').value,'Singuilucan');
controls.get('#table-reset').onclick();
controls.get('#t').onclick({target:{closest:selector=>selector==='[data-parcel]' ? {dataset:{parcel:'AGC_003'}} : null}});
assert.equal(vm.runInContext('selectedParcelId',mapScope),'AGC_003');
assert.equal(vm.runInContext('mapVisits',mapScope),0,'Abrir una fila mantiene la vista de tablas');
await controls.get('#table-layer').onchange({target:{value:'final_prec'}});
assert.equal(controls.get('#capa').value,'final_prec');
assert.equal(controls.get('#table-date').value,'2025-05');
assert.equal(controls.get('#table-date-label').hidden,false);
await controls.get('#table-date').onchange({target:{value:'2025-04'}});
assert.equal(controls.get('#fecha').value,'2025-04');
await controls.get('#table-source').onchange({target:{value:'resultados'}});
assert.equal(vm.runInContext('resultMap.enabled',mapScope),true);
assert.equal(controls.get('#table-set').value,controls.get('#results-set').value);
await controls.get('#table-metric').onchange({target:{value:'observado'}});
assert.equal(vm.runInContext('resultMap.metric',mapScope),'observado');
vm.runInContext('updatePredictionFilter(true)',mapScope);
assert.equal(controls.get('#table-metric').options.length,1);
assert.equal(vm.runInContext('resultMap.metric',mapScope),'prediccion');
await vm.runInContext('paintResultMap()',mapScope);
assert.equal(controls.get('#table-cohort').attributes['aria-pressed'],'true');
assert.equal((controls.get('#t').innerHTML.match(/<tr data-id=/g)||[]).length,59);
await controls.get('#table-source').onchange({target:{value:'capas'}});
assert.equal(vm.runInContext('resultMap.enabled',mapScope),false);
assert.equal(controls.get('#table-layer').value,'final_prec');
assert(controls.get('#leyenda').innerHTML.includes('linear-gradient'));
assert(controls.get('#legend-title').textContent.includes('Precipitación'));
controls.get('#table-reset').onclick();
controls.get('#table-state').onchange({target:{value:'Puebla'}});
assert.equal(vm.runInContext('geo.features.length',mapScope),100);
assert.equal(controls.get('#map-state').value,'Puebla');
controls.get('#table-reset').onclick();
await controls.get('#table-population').onchange({target:{value:'referencia'}});
assert.equal(vm.runInContext('geo.features.length',mapScope),138);
controls.get('#table-reset').onclick();
controls.get('#table-availability').onchange({target:{value:'present'}});
assert.equal(vm.runInContext('geo.features.length',mapScope),2);
controls.get('#table-min').oninput({target:{value:'25'}});
await new Promise(resolve=>setTimeout(resolve,150));
assert.equal(vm.runInContext('geo.features.length',mapScope),1);
assert.equal(controls.get('#map-min').value,'25');
assert(controls.get('#t').innerHTML.includes('AGC_003'));
controls.get('#table-reset').onclick();
const borderControl=controls.get('#administrative-borders');
borderControl.checked=true;await borderControl.onchange({target:borderControl});
assert.equal(borderRequests,1);
const regions=vm.runInContext('regionController',mapScope);
assert(layers.has(regions.municipalities));
assert.equal(regions.features.length,9);
assert.equal(regions.states.options.interactive,false);
assert.equal(panes.get('municipalities').style.zIndex,350,'Los municipios quedan debajo de las parcelas (400)');
assert(!regions.blur.hidden && regions.path.attributes.d.startsWith('M-8 -8'));
assert(regions.layers.has('13021') && !regions.layers.has('29046'),'Emiliano Zapata es el de Hidalgo');
const singuilucan=regions.layers.get('13057');
singuilucan.events.mouseover();assert.equal(singuilucan.style.fillOpacity,.26);
assert(singuilucan.tooltip.includes('Singuilucan') && singuilucan.tooltip.includes('23 parcelas'));
singuilucan.openTooltip();mapZoom=13.99;mapEvents.get('zoom').forEach(fn=>fn());assert(singuilucan.getTooltip());
mapZoom=14;mapEvents.get('zoom').forEach(fn=>fn());assert.equal(singuilucan.getTooltip(),null);assert.equal(singuilucan.tooltipOpen,false);
singuilucan.getElement().events.focus();assert.equal(singuilucan.tooltipOpen,false,'Tampoco aparece con foco de teclado sobre el umbral');
mapZoom=13;mapEvents.get('zoom').forEach(fn=>fn());assert(singuilucan.getTooltip().includes('Singuilucan'));
singuilucan.events.click();
assert.equal(vm.runInContext('geo.features.length',mapScope),23);
assert.equal(motions.at(-1).options.maxZoom,12);
const parcelLayer=vm.runInContext('geo.children.find(l=>l.feature.id==="AGC_003")',mapScope);
parcelLayer.events.click({});
assert.equal(motions.at(-1).options.maxZoom,17);
assert.equal(motions.at(-1).method,'fly');
assert.equal(motions.at(-1).options.duration,1.1);
mapScope.reducedMotion=true;
parcelLayer.events.click({});assert.equal(motions.at(-1).method,'fit');
assert.equal(motions.at(-1).options.animate,false);
const path=singuilucan.getElement();assert.equal(path.attributes.role,'button');
path.events.keydown({key:'Enter',preventDefault(){}});assert.equal(motions.at(-1).options.maxZoom,12);
borderControl.checked=false;await borderControl.onchange({target:borderControl});
assert(!layers.has(regions.municipalities) && regions.blur.hidden);
borderControl.checked=true;await borderControl.onchange({target:borderControl});
assert.equal(borderRequests,1);
console.log('Dashboard OK: controles y tablas condicionales, cambio de parcela, cero real, etiquetas, gráfica sin barra ausente y teclado.');
assert.equal(vm.runInContext('allParcels.features.filter(f=>!f.properties.estado).length',mapScope),0);
assert.equal(vm.runInContext('allParcels.features.filter(f=>f.properties.estado==="Hidalgo").length',mapScope),51);
assert.equal(vm.runInContext('allParcels.features.filter(f=>f.properties.estado==="Tlaxcala").length',mapScope),46);
console.log('Mapa OK: nueve municipios por CVEGEO, estados, máscara, hover/teclado, caché, zoom municipio → parcela y movimiento reducido.');
console.log('Tabla OK: filtros por estado, conjunto, dato, rango, municipio/capa/periodo y métrica sincronizados; ficha sin navegar y leyenda persistente.');
const styles=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
assert(/\.leaflet-pane svg path\s*\{[^}]*vector-effect:non-scaling-stroke/.test(styles));
assert(source.includes("className:'parcel-shape'"));
console.log('Zoom OK: contornos SVG sin escalado de grosor y etiquetas cerradas/desvinculadas desde zoom 14, restauradas al alejar.');
const agent=mapScope.window.DASHBOARD_AGENT;
agent.apply([{type:'limpiar_filtros',args:{}},{type:'filtrar_parcelas',args:{conjunto:'prediccion'}}]);
assert.equal(vm.runInContext('geo.features.length',mapScope),59);
assert.equal(controls.get('#map-cohort').value,'prediccion');assert.equal(controls.get('#table-population').value,'prediccion');
assert.throws(()=>agent.apply([{type:'mostrar_resultados',args:{metrica:'error_absoluto_t_ha'}}]));
agent.apply([{type:'limpiar_filtros',args:{}},{type:'filtrar_parcelas',args:{municipio:'Singuilucan',estado:'Hidalgo'}}]);
assert.equal(vm.runInContext('geo.features.length',mapScope),23);
assert.equal(controls.get('#table-municipality').value,'Singuilucan');
agent.apply([{type:'limites_geograficos',args:{visible:false}}]);
assert(!layers.has(regions.municipalities));
agent.apply([{type:'limpiar_filtros',args:{}},{type:'mostrar_capa',args:{id:'final_prec',fecha:'2025-04'}}]);
await new Promise(resolve=>setImmediate(resolve));
assert.equal(controls.get('#fecha').value,'2025-04');assert.equal(controls.get('#table-date').value,'2025-04');
console.log('Integración del agente OK: controles reales de capa/fecha, tabla/mapa, 59 parcelas, municipios y límites.');
