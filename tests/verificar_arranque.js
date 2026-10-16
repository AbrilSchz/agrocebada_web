// Ejecuta los scripts completos en el orden real del HTML. Leaflet se simula,
// pero rechaza nodos inexistentes como el navegador, antes de llegar a init().
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
assert(html.indexOf('id="welcome-guide"')<html.indexOf('id="plant-assistant"') && html.indexOf('id="plant-assistant"')<html.indexOf('id="selection-steps"'),'La guía inicial muestra la planta junto a los pasos');
assert(html.indexOf('id="mapa"')<html.indexOf('id="workspace-resizer"') && html.indexOf('id="workspace-resizer"')<html.indexOf('id="dashboard"'),'El divisor solo separa el mapa de su panel derecho en la pantalla principal');
assert(html.includes('id="workspace-resizer" role="separator"'),'El divisor se expone con semántica accesible');
assert(html.indexOf('id="assistant-dock"')<html.indexOf('id="chat-resizer"') && html.indexOf('id="chat-resizer"')<html.indexOf('id="dashboard-results"'),'El divisor vertical solo separa el chat de los resultados');
assert(html.includes('id="chat-resizer" role="separator"'),'El divisor vertical se expone con semántica accesible');
assert(html.includes('id="chat-resizer" role="separator" tabindex="0" aria-label="Ajustar altura del chat" aria-orientation="horizontal"'),'El divisor vertical permite teclado y se anuncia como horizontal');
assert(html.includes('<div id="walker-root"') && html.includes('<script src="walker.js"></script>'),'El personaje se integra desde el HTML común con un módulo aislado');
assert(!html.includes('<video src="fruti-asistente.mp4"'),'La planta anterior no carga el video que reemplaza el personaje caminante');
const workspaceStyles=readFileSync(new URL('../public/workspace.css',import.meta.url),'utf8');
assert(!workspaceStyles.includes('plant-patrol'),'El antiguo recorrido de la burbuja se desactiva para mantenerla fija');
assert(workspaceStyles.includes('#plant-assistant[data-position="floating-page"] #plant-welcome') && workspaceStyles.includes('bottom: calc(100% - 16px);') && workspaceStyles.includes('left: 50%;'),'En las otras pantallas la burbuja se coloca arriba del personaje');
const walkerSource=readFileSync(new URL('../public/walker.js',import.meta.url),'utf8');
const walkerStyles=readFileSync(new URL('../public/walker.css',import.meta.url),'utf8');
assert(walkerSource.includes('MutationObserver') && walkerSource.includes('chatPanel.hidden'),'El caminante observa el estado real del chat sin modificarlo');
assert(walkerSource.includes('prefers-reduced-motion') && walkerSource.includes('cancelAnimationFrame'),'El caminante respeta movimiento reducido y se pausa sin consumir animación');
assert(html.includes('<div class="walker-character"') && html.includes('<img class="walker-sprite"') && html.includes('<div class="walker-shadow"'),'El personaje se compone del sprite animado y su sombra');
assert(walkerSource.includes('WALKER_CONFIG') && walkerSource.includes('requestAnimationFrame') && walkerSource.includes('scaleX(${-state.direction})'),'La configuración controla el recorrido y compensa la orientación original del personaje');
assert(walkerSource.includes('CONFIG.fps') && walkerSource.includes('Promise.all([preloadImage'),'El sprite se precarga y avanza a los FPS configurados');
assert(walkerStyles.includes('will-change: transform') && walkerStyles.includes('overflow: hidden') && walkerSource.includes('sprite.style.transform'),'La hoja de cuadros se recorta y avanza mediante composición por transform');
assert(walkerStyles.includes('walker-idle-breathe') && walkerStyles.includes('walker-arrive') && walkerStyles.includes('data-mode="welcome"'),'En el mapa principal el personaje queda junto al saludo, respira suavemente y aparece al seleccionar parcela');
assert(walkerStyles.includes('#walker-root[data-mode="patrol"][data-paused="true"]'),'La pausa por chat conserva el recorrido de las demás pantallas sin detener el movimiento sutil del mapa principal');
assert(walkerStyles.includes('pointer-events: none'),'El personaje no intercepta clics');
const walkerAssets=new URL('../public/assets/walker/',import.meta.url);
const checkPng=(filename,width,height)=>{
  const bytes=readFileSync(new URL(filename,walkerAssets));
  assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10],`${filename} es un PNG válido`);
  assert.equal(bytes.readUInt32BE(16),width,`${filename} tiene el ancho esperado`);
  assert.equal(bytes.readUInt32BE(20),height,`${filename} tiene el alto esperado`);
  assert.equal(bytes[25],6,`${filename} conserva canal alfa`);
  return bytes.length;
};
for(let frame=1;frame<=10;frame++) checkPng(`camina${String(frame).padStart(2,'0')}.png`,172,238);
checkPng('quieto.png',172,238);
const sheetBytes=checkPng('camina-sheet.png',1720,238);
assert(sheetBytes<10*statSync(new URL('camina01.png',walkerAssets)).size,'El sprite sheet evita repetir el coste fijo de las diez imágenes');
checkPng('camina-sheet-20fps.png',3440,238);
const scripts=[...html.matchAll(/<script src="([^"/]+\.js)"><\/script>/g)].map(m=>m[1]).filter(file=>file!=='walker.js');
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
assert(!source.includes('plantGreetingTimeout') && !source.includes('},4500);'),'El saludo no tiene un temporizador que lo oculte');
function node() {
  let markup='';
  const nested=new Map(),listeners={};
  return {hidden:false,value:'',checked:true,style:{setProperty(name,value){this[name]=value;},getPropertyValue(name){return this[name]||'';}},dataset:{},children:[],textContent:'',
    classList:{toggle(){},add(){},remove(){}},setAttribute(name,value){this[name]=value;if(name.startsWith('data-'))this.dataset[name.slice(5)]=value;},addEventListener(type,listener){listeners[type]=listener;},
    setPointerCapture(pointerId){this.capturedPointer=pointerId;},getBoundingClientRect(){return this.rect||{left:0,width:1000};},
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
  nodes.get('#container').rect={left:0,width:1000};
  nodes.get('#mapa').rect={left:0,width:642};
  nodes.get('#workspace-resizer').rect={left:642,width:12};
  nodes.get('#dashboard').rect={left:654,top:0,width:346,height:800};
  nodes.get('#assistant-dock').rect={left:654,top:18,width:310,height:360};
  nodes.get('#chat-panel').rect={left:654,top:18,width:310,height:360};
  nodes.get('#chat-resizer').rect={left:654,top:378,width:310,height:12};
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
  let plantProjectionCount=0,mapResizeCount=0;
  const bounds={isValid:()=>true};
  const map={setView(){return this;},on(events,listener){for(const event of events.split(' ')) mapListeners[event]=listener;return this;},getSize:()=>({x:900,y:700}),
    latLngToContainerPoint(){plantProjectionCount++;return {x:430,y:285};},
    setMinZoom(){},getBoundsZoom:()=>9,panInsideBounds(){},invalidateSize(){mapResizeCount++;},removeLayer(){},fitBounds(){}};
  const checkElement=element=>assert(element,'Leaflet recibió un contenedor inexistente');
  const L={latLngBounds:()=>bounds,map:()=>map,tileLayer:()=>({addTo(){return this;}}),
    DomEvent:{disableClickPropagation:checkElement,disableScrollPropagation:checkElement},
    geoJSON(fc,options){drawn.push(fc.features);fc.features.forEach(f=>options.onEachFeature(f,{on(){return this;}}));return {addTo(){return this;},setStyle(){},getBounds:()=>bounds};}};
  const body=node();
  const scope={console,AbortController,setTimeout,clearTimeout,requestAnimationFrame:callback=>callback(),L,navigator:{},innerHeight:900,ResizeObserver:class {observe(){}},
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
  return {nodes,requests,drawn,documentElement,stored,mapListeners,scope,body,workspaceButtons,plantProjectionCount:()=>plantProjectionCount,mapResizeCount:()=>mapResizeCount};
}

// Reproduce la regresión original: una excepción anterior a init deja el indicador.
await assert.rejects(boot({appSource:source.replace("L.DomEvent.disableClickPropagation($('#map-legend'));","L.DomEvent.disableClickPropagation($('#map-legend'));\nL.DomEvent.disableClickPropagation($('#map-assistant'));")}),/contenedor inexistente/);
const success=await boot();
const resizer=success.nodes.get('#workspace-resizer');
assert.equal(resizer['aria-valuenow'],'65','El mapa inicia con el reparto horizontal 65/35');
resizer.listeners.pointerdown({pointerId:1,preventDefault(){}});
assert.equal(resizer.capturedPointer,1,'El divisor captura el puntero durante el arrastre');
resizer.listeners.pointermove({clientX:900});
assert.equal(resizer['aria-valuenow'],'67','El divisor limita el ancho máximo para preservar espacio al panel derecho');
assert.equal(success.nodes.get('#container').style['--map-fr'],'67','El arrastre actualiza la proporción del mapa');
resizer.listeners.pointermove({clientX:100});
assert.equal(resizer['aria-valuenow'],'33','El divisor limita el ancho mínimo del mapa');
resizer.listeners.pointerup();
resizer.listeners.keydown({key:'ArrowRight',preventDefault(){}});
assert.equal(resizer['aria-valuenow'],'35','Las flechas del teclado también ajustan el ancho');
resizer.listeners.keydown({key:'End',preventDefault(){}});
assert.equal(resizer['aria-valuenow'],'67','Fin lleva el divisor al límite máximo');
assert(success.mapResizeCount()>=4,'Cada ajuste solicita actualizar el tamaño del mapa Leaflet');
const chatResizer=success.nodes.get('#chat-resizer');
assert.equal(chatResizer['aria-valuenow'],'360','El chat inicia con su altura actual');
chatResizer.listeners.pointerdown({pointerId:2,preventDefault(){}});
assert.equal(chatResizer.capturedPointer,2,'El divisor del chat captura el puntero');
chatResizer.listeners.pointermove({clientY:624});
assert.equal(chatResizer['aria-valuenow'],'590','El chat se amplía sin dejar los resultados sin espacio');
assert.equal(success.nodes.get('#chat-panel').style['--chat-height'],'590px','El arrastre actualiza la altura del chat');
chatResizer.listeners.pointermove({clientY:100});
assert.equal(chatResizer['aria-valuenow'],'220','El divisor limita la altura mínima del chat');
chatResizer.listeners.pointerup();
chatResizer.listeners.keydown({key:'ArrowUp',preventDefault(){}});
assert.equal(chatResizer['aria-valuenow'],'244','Las flechas verticales ajustan la altura del chat');
chatResizer.listeners.keydown({key:'End',preventDefault(){}});
assert.equal(chatResizer['aria-valuenow'],'590','Fin lleva la altura del chat al límite máximo');
assert(success.requests.includes('/api/parcelas'));
assert(success.nodes.get('#map-status').hidden,'La carga termina y retira el mensaje');
assert(success.drawn.at(-1).some(f=>f.id==='AGC_003'));
assert(success.nodes.get('#t').innerHTML.includes('AGC_003'),'La tabla también recibió la parcela');
assert(success.nodes.get('#leyenda').innerHTML.includes('2400.00'),'La capa inicial se pintó');
assert.equal(success.nodes.get('#chat-panel').hidden,false,'El chat sigue abierto');
const plantAssistant=success.nodes.get('#plant-assistant');
assert.equal(plantAssistant.dataset.position,'welcome','La planta aparece en la guía inicial');
assert.equal(plantAssistant.parentElement,success.nodes.get('#welcome-guide'),'La planta acompaña los pasos de bienvenida');
assert.equal(success.nodes.get('#plant-welcome').hidden,false,'El saludo permanece visible mientras no se elija una parcela');
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
assert.equal(success.nodes.get('#plant-welcome').hidden,true,'El saludo se oculta al seleccionar una parcela');
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
assert.equal(success.nodes.get('#plant-welcome').hidden,false,'Al volver a la guía, el saludo vuelve a mostrarse');
assert(success.nodes.get('#welcome-guide').children.indexOf(plantAssistant)<success.nodes.get('#welcome-guide').children.indexOf(success.nodes.get('#selection-steps')),'La planta recupera su lugar antes de los pasos al volver a la guía');
const mobile=await boot({isMobile:true});
mobile.nodes.get('#workspace-resizer').listeners.pointerdown({pointerId:1,preventDefault(){}});
mobile.nodes.get('#workspace-resizer').listeners.pointermove({clientX:800});
assert.equal(mobile.nodes.get('#container').style['--map-fr'],undefined,'El divisor no cambia el reparto en el diseño móvil');
mobile.nodes.get('#chat-resizer').listeners.pointerdown({pointerId:2,preventDefault(){}});
mobile.nodes.get('#chat-resizer').listeners.pointermove({clientY:600});
assert.equal(mobile.nodes.get('#chat-panel').style['--chat-height'],undefined,'El divisor vertical no cambia la altura del chat en móvil');
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
