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
for pid,geometry,context in db.execute('SELECT p.ID_POLIGONO,p.geometria_geojson,c.contenido_json FROM parcelas p JOIN parcelas_contexto_modelo c ON p.ID_POLIGONO=c.ID_POLIGONO'):
 ctx=json.loads(context)
 features.append({'type':'Feature','id':pid,'geometry':json.loads(geometry),'properties':{'cohorte':ctx['cohorte'],'municipio':ctx['municipio']}})
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
  return {id,innerHTML:'',value:'',hidden:false,attributes:{},dataset:{},classList:{toggle(){}},replaceChildren(){this.innerHTML='';},
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
const controls=new Map(['prediction-filter','map-tools','administrative-borders','administrative-status','ids','t','map-summary','capa','fecha','leyenda','layers-error','results-panel','results-button','results-close','results-set','results-metric','results-caption','results-error','results-legend','table-cohort','table-source','table-layer','table-date','table-set','table-metric','table-layer-label','table-date-label','table-set-label','table-metric-label','map-query','table-query','map-municipality','table-municipality','table-status','table-export','table-reset','table-detail'].map(id=>['#'+id,node(id)]));
controls.get('#capa').value='final_Elevacion_INEGI_CEM4_120m_mean';
controls.get('#capa').innerHTML='<option value="final_Elevacion_INEGI_CEM4_120m_mean">Elevación</option><option value="final_prec">Precipitación</option>';
controls.get('#fecha').hidden=true;
let layers=new Set(),borderRequests=0;
const map={removeLayer(layer){layers.delete(layer);},createPane(){},getPane(){return {style:{}};}};
const borderData=JSON.parse(readFileSync(new URL('../public/geografia/limites.geojson',import.meta.url),'utf8'));
const mapScope={window:{PRESENTATION:scope.window.PRESENTATION},document:{querySelector:key=>controls.get(key)},C:{limitesAdministrativos:'geografia/limites.geojson'},
  map,L:{DomEvent:{disableClickPropagation(){},disableScrollPropagation(){}},geoJSON(data,options){return {features:data.features,options,addTo(){layers.add(this);return this;}};}},
  fixture,console,AbortController,URLSearchParams,json:async url=>{
    if(url==='geografia/limites.geojson') {borderRequests++;return borderData;}
    if(url==='/api/resultados/campanas') return {modelos:[{version_modelo:'modelo-final',campanas:[{campaña:'final',label:'Final',dataset_id:'final',metricas_disponibles:{prediccion:true,observado:true,error_firmado_t_ha:true,error_absoluto_t_ha:true}}]}]};
    if(url.startsWith('/api/resultados/valores')) return {valores:{AGC_001:3.049,AGC_003:3.503},rango:[3,4],unidad:'t/ha',dataset_label:'Final'};
    if(url.endsWith('/fechas')) return ['2025-04','2025-05'];
    if(url.includes('/valores?')) return {valores:{AGC_001:21,AGC_003:30}};
    throw Error(url);
  },P:scope.window.PRESENTATION};
vm.createContext(mapScope);
vm.runInContext(readFileSync(new URL('../public/parcels.js',import.meta.url),'utf8'),mapScope);
const mapFunctions=source.slice(source.indexOf('function visibleFeatures('),source.indexOf('async function json('));
vm.runInContext(`const $=s=>document.querySelector(s),hasNumber=P.hasNumber,esc=v=>String(v??''),number=(v,d=2)=>Number(v).toFixed(d);let allParcels={type:'FeatureCollection',features:fixture.features},geo,predictionOnly=false,administrativeLayer=null,administrativePromise=null,selectedParcelId='AGC_001';let valores={},rango=[0,1],layerSequence=0,resultCataloguePromise=null,currentDashboard=null;const parcelFilters={municipality:'',query:''},tableSort={key:'id',direction:'asc'},valueState={loading:false,error:''},ramp=['red','blue'];const resultMap={enabled:false,model:null,dataset:null,metric:'prediccion',sets:[],sequence:0,controller:null};const capas=[{id:'final_Elevacion_INEGI_CEM4_120m_mean',nombre:'Elevación',unidad:'m'},{id:'final_prec',nombre:'Precipitación',unidad:'mm'}];let mapVisits=0;function estilo(){}function refreshStyle(){renderParcelTable();}function selectParcel(id){selectedParcelId=id;}function clearSelection(){selectedParcelId=null;}function irA(){mapVisits++;}function toggleLayers(){};${mapFunctions}`,mapScope);
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
const borderControl=controls.get('#administrative-borders');
borderControl.checked=true;await borderControl.onchange({target:borderControl});
assert.equal(borderRequests,1);
assert(layers.has(vm.runInContext('administrativeLayer',mapScope)));
assert.equal(vm.runInContext('administrativeLayer.options.interactive',mapScope),false);
borderControl.checked=false;await borderControl.onchange({target:borderControl});
assert(!layers.has(vm.runInContext('administrativeLayer',mapScope)));
borderControl.checked=true;await borderControl.onchange({target:borderControl});
assert.equal(borderRequests,1);
console.log('Dashboard OK: controles y tablas condicionales, cambio de parcela, cero real, etiquetas, gráfica sin barra ausente y teclado.');
console.log('Mapa OK: 59/197 parcelas, tabla y selección coherentes, activar/ocultar límites, caché y capa administrativa sin capturar clics.');
console.log('Tabla OK: búsqueda, municipio, capa, periodo, conjunto y métrica sincronizados; ficha sin navegar; errores ocultos en las 59 finales.');
