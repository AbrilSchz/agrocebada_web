// Ejecuta los scripts completos en el orden real del HTML. Leaflet se simula,
// pero rechaza nodos inexistentes como el navegador, antes de llegar a init().
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script src="([^"/]+\.js)"><\/script>/g)].map(m=>m[1]);
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function node() {
  let markup='';
  const nested=new Map(),listeners={};
  return {hidden:false,value:'',checked:true,style:{},dataset:{},children:[],textContent:'',
    classList:{toggle(){},add(){},remove(){}},setAttribute(name,value){this[name]=value;},addEventListener(type,listener){listeners[type]=listener;},
    append(...children){this.children.push(...children);},replaceChildren(){this.children=[];},
    contains(){return false;},focus(){},querySelectorAll(){return [];},
    querySelector(selector){if(!nested.has(selector))nested.set(selector,node());return nested.get(selector);},
    listeners,
    get innerHTML(){return markup;},set innerHTML(v){markup=v;},
    insertAdjacentHTML(_where,v){markup+=v;},
    get options(){return [...markup.matchAll(/<option value="([^"]*)"/g)].map(m=>({value:m[1]}));},
    get selectedOptions(){return [{textContent:'Elevación'}];}
  };
}
async function boot({failParcels=false,appSource=source,initialTheme=null}={}) {
  const nodes=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>['#'+m[1],node()]));
  const stored=new Map();
  if(initialTheme)stored.set('fruticebada-theme',initialTheme);
  nodes.get('#opacidad').value='0.75';nodes.get('#map-status').textContent='Cargando parcelas…';
  const documentElement={dataset:{}};
  const requests=[],drawn=[];
  const bounds={isValid:()=>true};
  const map={setView(){return this;},on(){},getSize:()=>({x:900,y:700}),
    setMinZoom(){},getBoundsZoom:()=>9,panInsideBounds(){},invalidateSize(){},removeLayer(){},fitBounds(){}};
  const checkElement=element=>assert(element,'Leaflet recibió un contenedor inexistente');
  const L={latLngBounds:()=>bounds,map:()=>map,tileLayer:()=>({addTo(){return this;}}),
    DomEvent:{disableClickPropagation:checkElement,disableScrollPropagation:checkElement},
    geoJSON(fc,options){drawn.push(fc.features);fc.features.forEach(f=>options.onEachFeature(f,{on(){return this;}}));return {addTo(){return this;},setStyle(){},getBounds:()=>bounds};}};
  const scope={console,AbortController,setTimeout,clearTimeout,L,navigator:{},ResizeObserver:class {observe(){}},
    document:{documentElement,querySelector:s=>nodes.get(s)||null,querySelectorAll:()=>[],createElement:node,body:node(),addEventListener(){}},
    localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)},
    addEventListener(){},matchMedia:()=>({matches:false}),
    fetch:async url=>{
      requests.push(url);
      // Los límites son auxiliares: fallar aquí no debe bloquear las parcelas.
      if(url==='geografia/limites.geojson') throw Error('Límites no disponibles');
      if(url==='/api/parcelas' && failParcels) throw Error('Servidor no disponible');
      const payload=url==='/api/parcelas' ? {type:'FeatureCollection',features:[{type:'Feature',id:'AGC_003',properties:{cohorte:'prediccion',municipio:'Apan'},geometry:{type:'Polygon',coordinates:[]}}]} :
        url==='/api/capas' ? [{id:'final_Elevacion_INEGI_CEM4_120m_mean',nombre:'Elevación',grupo:'Topografía',unidad:'m'}] :
        url.endsWith('/fechas') ? ['2025-01-01'] : url.includes('/valores?') ? {valores:{AGC_003:2400}} : null;
      assert(payload,'Petición inesperada: '+url);return {ok:true,json:async()=>payload};
    }};
  scope.window=scope;vm.createContext(scope);
  for(const file of scripts) vm.runInContext(file==='app.js' ? appSource : readFileSync(new URL('../public/'+file,import.meta.url),'utf8'),scope,{filename:file});
  for(let i=0;i<3;i++) await new Promise(resolve=>setImmediate(resolve));
  return {nodes,requests,drawn,documentElement,stored};
}

// Reproduce la regresión original: una excepción anterior a init deja el indicador.
await assert.rejects(boot({appSource:source.replace("L.DomEvent.disableClickPropagation($('#map-legend'));","L.DomEvent.disableClickPropagation($('#map-legend'));\nL.DomEvent.disableClickPropagation($('#map-assistant'));")}),/contenedor inexistente/);
const success=await boot();
assert(success.requests.includes('/api/parcelas'));
assert(success.nodes.get('#map-status').hidden,'La carga termina y retira el mensaje');
assert(success.drawn.at(-1).some(f=>f.id==='AGC_003'));
assert(success.nodes.get('#t').innerHTML.includes('AGC_003'),'La tabla también recibió la parcela');
assert(success.nodes.get('#leyenda').innerHTML.includes('2400.00'),'La capa inicial se pintó');
assert.equal(success.nodes.get('#chat-panel').hidden,false,'El chat sigue abierto');
const themeToggle=success.nodes.get('#theme-toggle');
assert.equal(themeToggle['aria-pressed'],'false','El modo claro es la opción inicial');
themeToggle.listeners.click();
assert.equal(success.documentElement.dataset.theme,'dark','El control activa el modo oscuro');
assert.equal(themeToggle['aria-pressed'],'true','El botón expone el estado activo');
assert.equal(success.stored.get('fruticebada-theme'),'dark','La preferencia se guarda');
const savedTheme=await boot({initialTheme:'dark'});
assert.equal(savedTheme.documentElement.dataset.theme,'dark','La preferencia guardada se aplica al iniciar');
const failure=await boot({failParcels:true});
assert(!failure.nodes.get('#map-status').hidden);
assert(failure.nodes.get('#map-status').textContent.includes('No se pudieron cargar las parcelas'));
assert(!failure.nodes.get('#map-status').textContent.includes('Cargando parcelas'));
console.log('Arranque OK: regresión reproducida, scripts completos, parcela/tabla/capa inicial y error visible sin carga infinita.');
