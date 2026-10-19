import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {notebookView} from '../lib/documentation.js';

const nodes=new Map(),tabs=[],panels=[];
function node(id) {
  return {id,hidden:false,innerHTML:'',attributes:{},setAttribute(k,v){this.attributes[k]=v;},focus(){this.focused=true;}};
}
for(const name of ['reto','equipo','resultados','codigo']) {
  const button=node('doc-tab-'+name),panel=node('doc-panel-'+name);
  nodes.set('#'+button.id,button);nodes.set('#'+panel.id,panel);tabs.push(button);panels.push(panel);
}
for(const id of ['notebook-list','notebook-viewer','doc-code-status','source-list']) nodes.set('#'+id,node(id));
const context={window:{},document:{querySelector:s=>nodes.get(s),querySelectorAll:s=>s==='.doc-tabs [role=tab]' ? tabs : s==='.doc-panel' ? panels : []},
  fetch:async()=>({ok:true,json:async()=>({notebooks:[],fuentes:[]})})};
vm.createContext(context);
for(const file of ['labels.js','parcels.js','documentation.js','charts.js','regions.js']) vm.runInContext(readFileSync(new URL('../public/'+file,import.meta.url),'utf8'),context);
const parcels=context.window.PARCELS;
const features=[
  {id:'AGC_001',properties:{estado:'Hidalgo',municipio:'Apan',cohorte:'referencia'}},
  {id:'AGC_003',properties:{estado:'Hidalgo',municipio:'Singuilucan',cohorte:'prediccion'}},
  {id:'AGC_010',properties:{estado:'Hidalgo',municipio:'Apan',cohorte:'prediccion'}},
  {id:'AGC_011',properties:{estado:'Tlaxcala',municipio:'Apán',cohorte:'referencia'}}
];
const values={AGC_001:0,AGC_003:null,AGC_010:-2,AGC_011:4};
assert.equal(parcels.filter(features,{query:'apAn'}).length,3);
assert.equal(parcels.filter(features,{query:' AGC_003 ',predictionOnly:true}).length,1);
assert.equal(parcels.filter(features,{municipality:'Apan',predictionOnly:true}).length,1);
assert.equal(parcels.filter(features,{query:'desconocida'}).length,0);
assert.equal(parcels.filter(features,{state:'Hidalgo',cohort:'referencia',values,minimum:'0',maximum:'0',availability:'present'}).length,1);
assert.equal(parcels.filter(features,{values,availability:'missing'}).length,1);
assert.equal(parcels.filter(features,{values,minimum:'0'}).length,2,'El cero se conserva y el ausente se excluye del rango');
assert.equal(parcels.filter(features,{values,minimum:'5',maximum:'1'}).length,0);
assert.deepEqual(Array.from(parcels.sort(features,{key:'value',values}),f=>f.id),['AGC_010','AGC_001','AGC_011','AGC_003']);
assert.deepEqual(Array.from(parcels.sort(features,{key:'value',direction:'desc',values}),f=>f.id),['AGC_011','AGC_001','AGC_010','AGC_003']);
assert.equal(features[0].id,'AGC_001','Ordenar no muta los originales');
const csv=parcels.csv(features,values,'Predicción (t/ha)');
assert(csv.includes('"AGC_001","Hidalgo","Apan","Entrenamiento · OOF","0"'));
assert(csv.includes('"AGC_003","Hidalgo","Singuilucan","Predicción final",""'));
assert(parcels.csv([{id:'=SUM(A1)',properties:{municipio:'<script>',cohorte:'prediccion'}}],{},'Valor').includes('"\'=SUM(A1)"'));
const final={ID_POLIGONO:'AGC_003',unidad_rendimiento:'t/ha',resultado:{tipo_prediccion:'final',prediccion:0,observado:null},metricas:{error_firmado_t_ha:null},
  contexto_modelo:{municipio:'<script>alert(1)</script>',variables_modelo:{PREC_2025_05_mean:0,ausente:null}}};
const detail=parcels.detail(final);
assert(detail.includes('0.000'));
assert(!detail.includes('Observado'));
assert(!detail.includes('Error firmado'));
assert(detail.includes('Variables del modelo (1)'));
assert(detail.includes('&lt;script&gt;'));
assert(!detail.includes('<script>'));
const charts=context.window.CHARTS;
for(const result of [{prediccion:0,observado:null},{prediccion:3.5,observado:4},{prediccion:-.3,observado:0}]) {
  const plot=charts.yield({resultado:result,unidad_rendimiento:'t/ha'});
  assert(!plot.includes('NaN') && !plot.includes('Infinity'));
  assert(plot.includes('role="img"') && plot.includes('<title>'));
  assert([...plot.matchAll(/<rect[^>]*height="([^"]+)"/g)].every(m=>Number(m[1])>=0));
  if(result.observado===null) assert(!plot.includes('Observado'));
}
assert(charts.error({metricas:{error_firmado_t_ha:0},unidad_rendimiento:'t/ha'}).includes('Coincide con el observado'));
assert.equal(charts.error({metricas:{error_firmado_t_ha:null}}),'');
const validation=charts.validation([{esquema:'LOGO_municipio',MAE_pooled:2,RMSE_pooled:4,R2_pooled:-.12}]);
assert(validation.includes('width:50%') && validation.includes('width:100%'));
assert(validation.includes('-0.120'));
const shap=charts.contributions([{variable:'PREC_2025_05_mean',aporte_t_ha:-.67}], 't/ha');
assert(shap.includes('Precipitación') && shap.includes('-0.67'));
assert(!shap.includes('NaN'));
const polygon={type:'Polygon',coordinates:[[[0,0],[4,0],[4,4],[0,4],[0,0]],[[1,1],[2,1],[2,2],[1,2],[1,1]]]};
assert(context.window.REGIONS.contains(polygon,[.5,.5]));
assert(!context.window.REGIONS.contains(polygon,[1.5,1.5]));
const mask=context.window.REGIONS.maskPath([{geometry:polygon}],([lat,lon])=>({x:lon,y:lat}),100,100);
assert(mask.startsWith('M-8 -8H108V108H-8Z'));
assert(mask.includes('M0.0 0.0L4.0 0.0L4.0 4.0'));

const unsafe={metadata:{language_info:{name:'python'}},cells:[{cell_type:'code',execution_count:2,source:['print("hola")\n'],outputs:[
  {data:{'text/html':['<script>alert(1)</script>'],'application/javascript':'alert(1)','image/svg+xml':'<svg onload="alert(1)">','text/plain':['Resultado <img onerror="alert(1)">']}},
  {data:{'image/png':'aGVsbG8=','image/jpeg':'"><script>'}},
  {output_type:'error',ename:'ValueError',evalue:'dato vacío'}
]}]};
const view=notebookView(unsafe);
assert.equal(view.celdas[0].fuente,'print("hola")\n');
assert.equal(view.celdas[0].salidas.length,3);
assert.equal(view.celdas[0].salidas[1].mime,'image/png');
assert(!JSON.stringify(view).includes('application/javascript'));
assert(!JSON.stringify(view).includes('image/svg+xml'));
const html=context.window.DOCUMENTATION.markdown('# Título\n<script>alert(1)</script>\n**Texto**\n| Variable | Valor |\n| --- | --- |\n| X | 0 |\n```python\nprint("hola")\n```');
assert(html.includes('<h3>Título</h3>'));
assert(html.includes('&lt;script&gt;'));
assert(!html.includes('<script>'));
assert(html.includes('<strong>Texto</strong>'));
assert(html.includes('<td>0</td>'));
tabs[0].onkeydown({key:'ArrowRight',preventDefault(){}});
assert.equal(tabs[1].attributes['aria-selected'],'true');
assert.equal(panels[1].hidden,false);
assert.equal(panels[0].hidden,true);
tabs[1].onkeydown({key:'End',preventDefault(){}});
assert.equal(tabs[3].attributes['aria-selected'],'true');
tabs[3].onkeydown({key:'Home',preventDefault(){}});
assert.equal(tabs[0].attributes['aria-selected'],'true');
console.log('Explorador OK: filtros combinados, orden numérico con ausentes al final, CSV y ficha sin errores inventados.');
console.log('Libretas OK: código sin ejecutar, solo texto/PNG/JPEG, HTML escapado, tablas Markdown y pestañas accesibles por teclado.');
console.log('Gráficas y geografía OK: SVG sin dimensiones negativas, cero/ausente, MAE/RMSE con escala común, R² negativo y máscara con huecos.');
