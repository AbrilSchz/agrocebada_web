// Ejecuta los scripts completos en el orden real del HTML. Leaflet se simula,
// pero rechaza nodos inexistentes como el navegador, antes de llegar a init().
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
assert(html.indexOf('id="welcome-guide"')<html.indexOf('id="plant-assistant"') && html.indexOf('id="plant-assistant"')<html.indexOf('id="selection-steps"'),'La guía inicial muestra la planta junto a los pasos');
const scripts=[...html.matchAll(/<script src="([^"/]+\.js)"><\/script>/g)].map(m=>m[1]);
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function node() {
  let markup='';
  const nested=new Map(),listeners={};
  return {hidden:false,value:'',checked:true,style:{},dataset:{},children:[],textContent:'',
    classList:{toggle(){},add(){},remove(){}},setAttribute(name,value){this[name]=value;},addEventListener(type,listener){listeners[type]=listener;},
    append(...children){for(const child of children){if(child.parentElement) child.parentElement.children=child.parentElement.children.filter(node=>node!==child);child.parentElement=this;this.children.push(child);}},
    insertBefore(child,reference){if(child.parentElement) child.parentElement.children=child.parentElement.children.filter(node=>node!==child);const index=this.children.indexOf(reference);child.parentElement=this;this.children.splice(index<0 ? this.children.length : index,0,child);},replaceChildren(){this.children=[];},
    contains(){return false;},focus(){},scrollIntoView(options){this.scrolledIntoView=true;this.scrollOptions=options;},querySelectorAll(){return [];},
    querySelector(selector){if(!nested.has(selector))nested.set(selector,node());return nested.get(selector);},
    listeners,
    get innerHTML(){return markup;},set innerHTML(v){markup=v;},
    insertAdjacentHTML(_where,v){markup+=v;},
    get options(){return [...markup.matchAll(/<option value="([^"]*)"/g)].map(m=>({value:m[1]}));},
    get selectedOptions(){return [{textContent:'Elevación'}];}
  };
}
async function boot({failParcels=false,appSource=source,initialTheme=null,isMobile=false}={}) {
  const nodes=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>['#'+m[1],node()]));
  const workspaceButtons=[...html.matchAll(/data-workspace-target="([^"]+)"/g)].map(match=>{const button=node();button.dataset.workspaceTarget=match[1];return button;});
  nodes.get('#plant-welcome').textContent='¡Hola! Soy Fruti, tu asistente de campo. ¡Exploremos!';
  nodes.get('#plant-assistant').dataset.position='welcome';
  nodes.get('#welcome-guide').append(nodes.get('#selection-steps'));
  nodes.get('#welcome-guide').insertBefore(nodes.get('#plant-assistant'),nodes.get('#selection-steps'));
  const stored=new Map();
  if(initialTheme)stored.set('fruticebada-theme',initialTheme);
  nodes.get('#opacidad').value='0.75';nodes.get('#map-status').textContent='Cargando parcelas…';
  const documentElement={dataset:{}};
  const requests=[],drawn=[],mapListeners={};
  let plantProjectionCount=0;
  const bounds={isValid:()=>true};
  const map={setView(){return this;},on(events,listener){for(const event of events.split(' ')) mapListeners[event]=listener;return this;},getSize:()=>({x:900,y:700}),
    latLngToContainerPoint(){plantProjectionCount++;return {x:430,y:285};},
    setMinZoom(){},getBoundsZoom:()=>9,panInsideBounds(){},invalidateSize(){},removeLayer(){},fitBounds(){}};
  const checkElement=element=>assert(element,'Leaflet recibió un contenedor inexistente');
  const L={latLngBounds:()=>bounds,map:()=>map,tileLayer:()=>({addTo(){return this;}}),
    DomEvent:{disableClickPropagation:checkElement,disableScrollPropagation:checkElement},
    geoJSON(fc,options){drawn.push(fc.features);fc.features.forEach(f=>options.onEachFeature(f,{on(){return this;}}));return {addTo(){return this;},setStyle(){},getBounds:()=>bounds};}};
  const body=node();
  const scope={console,AbortController,setTimeout,clearTimeout,requestAnimationFrame:callback=>callback(),L,navigator:{},ResizeObserver:class {observe(){}},
    document:{documentElement,querySelector:s=>nodes.get(s)||null,querySelectorAll:s=>s==='[data-workspace-target]' ? workspaceButtons : [],createElement:node,body,addEventListener(){}},
    localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)},
    addEventListener(){},matchMedia:query=>({matches:isMobile && query==='(max-width: 980px)'}),
    fetch:async url=>{
      requests.push(url);
      // Los límites son auxiliares: fallar aquí no debe bloquear las parcelas.
      if(url==='geografia/limites.geojson') throw Error('Límites no disponibles');
      if(url==='/api/parcelas' && failParcels) throw Error('Servidor no disponible');
      const payload=url==='/api/parcelas' ? {type:'FeatureCollection',features:[{type:'Feature',id:'AGC_003',properties:{cohorte:'prediccion',municipio:'Apan',latitud_ref:19.7,longitud_ref:-98.45},geometry:{type:'Polygon',coordinates:[]}}]} :
        url==='/api/capas' ? [{id:'final_Elevacion_INEGI_CEM4_120m_mean',nombre:'Elevación',grupo:'Topografía',unidad:'m'}] :
        url.endsWith('/fechas') ? ['2025-01-01'] : url.includes('/valores?') ? {valores:{AGC_003:2400}} : null;
      assert(payload,'Petición inesperada: '+url);return {ok:true,json:async()=>payload};
    }};
  scope.window=scope;vm.createContext(scope);
  for(const file of scripts) vm.runInContext(file==='app.js' ? appSource : readFileSync(new URL('../public/'+file,import.meta.url),'utf8'),scope,{filename:file});
  for(let i=0;i<3;i++) await new Promise(resolve=>setImmediate(resolve));
  return {nodes,requests,drawn,documentElement,stored,mapListeners,scope,body,workspaceButtons,plantProjectionCount:()=>plantProjectionCount};
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
const plantAssistant=success.nodes.get('#plant-assistant');
assert.equal(plantAssistant.dataset.position,'welcome','La planta aparece en la guía inicial');
assert.equal(plantAssistant.parentElement,success.nodes.get('#welcome-guide'),'La planta acompaña los pasos de bienvenida');
vm.runInContext('vista("tabla")',success.scope);
assert.equal(plantAssistant.dataset.position,'floating-page','La planta usa su invitación flotante en Parcelas');
assert.equal(plantAssistant.parentElement,success.body,'La planta acompaña Parcelas sin depender de la tabla');
assert.equal(success.nodes.get('#plant-welcome').textContent,'¿En qué te ayudo?','La invitación de Parcelas propone abrir el chat');
assert.equal(success.nodes.get('#chat-panel').hidden,true,'La invitación queda visible antes de desplegar el chat');
success.nodes.get('#plant-welcome').onclick();
assert.equal(success.nodes.get('#chat-panel').hidden,false,'Pulsar la invitación despliega el chat');
vm.runInContext('vista("documentacion")',success.scope);
assert.equal(plantAssistant.dataset.position,'floating-page','La planta también acompaña Documentación');
assert.equal(success.nodes.get('#plant-welcome').textContent,'¿En qué te ayudo?','Documentación conserva la invitación al chat');
vm.runInContext('vista("mapa")',success.scope);
assert.equal(plantAssistant.dataset.position,'welcome','Volver al mapa restaura su bienvenida');
assert(success.nodes.get('#plant-welcome').textContent.includes('¡Hola!'),'El mapa conserva la frase de bienvenida existente');
success.nodes.get('#t').onclick({target:{closest(selector){return selector==='[data-parcel]' ? {dataset:{parcel:'AGC_003'}} : null;}}});
assert.equal(plantAssistant.dataset.position,'map','Al seleccionar una parcela, la planta pasa al mapa');
assert.equal(plantAssistant.parentElement,success.nodes.get('#mapa'),'La planta deja la guía al mostrar la parcela seleccionada');
assert.equal(plantAssistant.style.left,undefined,'La espiga conserva su posición fija al seleccionar una parcela');
assert.equal(plantAssistant.style.top,undefined,'La espiga no recibe una posición geográfica');
assert.equal(plantAssistant.style.left,undefined,'La espiga conserva su posición fija al mover el mapa');
assert.equal(success.mapListeners.move,undefined,'El mapa no actualiza la posición de la espiga');
assert.equal(success.plantProjectionCount(),0,'La espiga no se proyecta sobre las coordenadas del mapa');
assert(success.nodes.get('#plant-welcome').textContent.includes('¡Hola!'),'La burbuja conserva el mensaje de bienvenida');
let chatOpened;
success.scope.CHAT.open=focus=>{chatOpened=focus;};
success.nodes.get('#plant-welcome').onclick();
assert.equal(chatOpened,true,'En escritorio, la burbuja abre el chat y enfoca el campo');
success.nodes.get('#table-detail').onclick({target:{closest(selector){return selector==='[data-detail-close]' ? {} : null;}}});
assert.equal(plantAssistant.style.left,undefined,'La posición de la espiga no cambia al cerrar la selección');
assert.equal(plantAssistant.dataset.position,'welcome','Al limpiar la selección, la planta vuelve a la guía');
assert(success.nodes.get('#welcome-guide').children.indexOf(plantAssistant)<success.nodes.get('#welcome-guide').children.indexOf(success.nodes.get('#selection-steps')),'La planta recupera su lugar antes de los pasos al volver a la guía');
const mobile=await boot({isMobile:true});
let mobileChatOpened;
mobile.scope.CHAT.open=focus=>{mobileChatOpened=focus;};
mobile.nodes.get('#plant-welcome').onclick();
assert.equal(mobileChatOpened,false,'En móvil, la burbuja no abre el teclado al mostrar el chat');
assert(mobile.nodes.get('#assistant-dock').scrolledIntoView,'En móvil, la burbuja lleva el chat a la vista');
assert.equal(mobile.nodes.get('#assistant-dock').scrollOptions.behavior,'instant','En móvil, abrir el chat evita una animación de desplazamiento larga');
mobile.workspaceButtons.find(button=>button.dataset.workspaceTarget==='assistant-dock').onclick();
assert.equal(mobileChatOpened,false,'La navegación móvil muestra el chat sin abrir el teclado');
assert.equal(mobile.nodes.get('#assistant-dock').scrollOptions.behavior,'instant','La navegación móvil llega al chat sin animación de desplazamiento');
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
