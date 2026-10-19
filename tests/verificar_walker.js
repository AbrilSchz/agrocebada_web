import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/walker.js',import.meta.url),'utf8');
const frames=new Map(),windowListeners={},documentListeners={};
let nextFrame=1,clock=0,reducedMotionCallback;
const sprite={style:{},src:''};
const character={style:{},querySelector(){return sprite;}};
const root={dataset:{},style:{},classes:new Set(),classList:{toggle(name,enabled){if(enabled) root.classes.add(name);else root.classes.delete(name);}},querySelector(){return character;}};
const chatPanel={hidden:true};
const container={hidden:false,addEventListener(){}};
const observers=[];
const plantAssistant={dataset:{position:'welcome'},style:{},append(child){child.parentElement=this;}};
const mapBounds={left:0,right:700,top:0,bottom:800};
const mapArea={getBoundingClientRect:()=>mapBounds,append(child){child.parentElement=this;}};
const mapLegend={hidden:false,getBoundingClientRect:()=>({left:20,right:280,top:500,bottom:650})};
const body={append(child){child.parentElement=this;}};
const reducedMotion={matches:false,addEventListener(_type,callback){reducedMotionCallback=callback;}};
const scope={
  console,
  innerWidth:1200,
  innerHeight:800,
  performance:{now:()=>clock},
  matchMedia:()=>reducedMotion,
  addEventListener(type,callback){windowListeners[type]=callback;},
  requestAnimationFrame(callback){const id=nextFrame++;frames.set(id,callback);return id;},
  cancelAnimationFrame(id){frames.delete(id);},
  Image:class {
    set src(value){this.source=value;this.onload?.();}
  },
  MutationObserver:class {constructor(callback){this.callback=callback;}observe(target){observers.push({target,callback:this.callback});}},
  document:{
    hidden:false,
    body,
    querySelector(selector){
      return selector==='#walker-root' ? root : selector==='#chat-panel' ? chatPanel :
        selector==='#plant-assistant' ? plantAssistant :
        selector==='#container' ? container : selector==='#mapa' ? mapArea :
        selector==='#map-legend' ? mapLegend : null;
    },
    addEventListener(type,callback){documentListeners[type]=callback;},
  },
};
scope.window=scope;
vm.createContext(scope);
vm.runInContext(source,scope,{filename:'walker.js'});
await new Promise(resolve=>setImmediate(resolve));
const chatObserver=observers.find(observer=>observer.target===chatPanel).callback;
const viewObserver=observers.find(observer=>observer.target===container).callback;
const positionObserver=observers.find(observer=>observer.target===plantAssistant).callback;
const walkerOffset=()=>Number.parseFloat(root.style.transform.match(/translate3d\(([-\d.]+)px/)[1]);
const walkerWidth=()=>Number.parseFloat(root.style.width);
const bubbleOffset=()=>Number.parseFloat(plantAssistant.style.transform.match(/translate3d\(([-\d.]+)px/)[1]);

function step(time) {
  clock=time;
  const [id,callback]=frames.entries().next().value || [];
  assert(callback,'El caminante debe tener un cuadro de animación pendiente');
  frames.delete(id);
  callback(time);
}

assert.equal(root.dataset.paused,'false','El personaje está disponible cuando el chat está cerrado');
assert.equal(root.dataset.mode,'welcome','En la pantalla principal empieza junto al saludo');
assert.equal(root.parentElement,plantAssistant,'En bienvenida, el personaje ocupa el espacio reservado junto al mensaje');
assert.equal(root.style.transform,'none','La pose de bienvenida no recibe el transform del recorrido');
assert(sprite.src.includes('quieto.png'),'En bienvenida usa la pose quieta con animación CSS sutil');
assert.equal(frames.size,0,'En bienvenida no recorre el mapa ni inicia el bucle de caminata');

plantAssistant.dataset.position='map';
mapArea.append(plantAssistant);
positionObserver();
assert.equal(root.dataset.mode,'selected','Al seleccionar una parcela cambia al modo lateral del mapa');
assert.equal(root.parentElement,plantAssistant,'Con una parcela seleccionada acompaña al asistente junto al mapa');
assert.equal(frames.size,0,'Con la parcela seleccionada permanece quieta en su posición lateral');
assert.equal(root.style.transform,'none','La posición fija del mapa no depende del recorrido horizontal');

container.hidden=true;
plantAssistant.dataset.position='floating-page';
viewObserver();
assert.equal(root.dataset.mode,'patrol','Fuera de la pantalla principal conserva el recorrido previo');
assert.equal(root.parentElement,body,'En las otras vistas el caminante sigue al nivel común de la página');
assert.equal(root.dataset.paused,'false','El recorrido global empieza activo si el chat está cerrado');
assert(walkerOffset()>12,'El personaje comienza separado del borde del mapa, contando su ancho reflejado');
assert(Math.abs(bubbleOffset()-(walkerOffset()-walkerWidth()-16))<0.001,'En otras pantallas la burbuja se alinea horizontalmente con la caminante');
assert(sprite.src.includes('camina-sheet-20fps.png'),'La animación carga el sprite sheet de 20 cuadros por segundo');
step(0);
assert.equal(root.dataset.state,'walking','El personaje inicia directamente en pose de caminata');
const initialX=Number.parseFloat(root.style.transform.match(/translate3d\(([-\d.]+)px/)[1]);
step(50);
step(100);
const movedX=Number.parseFloat(root.style.transform.match(/translate3d\(([-\d.]+)px/)[1]);
assert(movedX>initialX,'La posición horizontal avanza usando transform');
assert(Math.abs(bubbleOffset()-(movedX-walkerWidth()-16))<0.001,'La burbuja acompaña cada avance del personaje');
assert.equal(sprite.style.transform,'translate3d(-10%, 0, 0)','El sprite avanza un cuadro tras 100 ms al FPS configurado');
assert(root.classes.has('walker--walking'),'La pose de caminata se controla con una clase CSS');
assert(root.style.transform.endsWith('scaleX(-1)'),'Al caminar hacia la derecha voltea el personaje que originalmente mira a la izquierda');
step(150);
assert.equal(sprite.style.transform,'translate3d(-15%, 0, 0)','El sprite avanza otro cuadro tras el intervalo de 50 ms');
for(let index=0;index<500 && root.dataset.state==='walking';index++) step(150+index*50);
assert.equal(root.dataset.state,'pausing','Al alcanzar el límite derecho el personaje entra en reposo');
assert(sprite.src.includes('quieto.png'),'En los extremos muestra la imagen quieta');
step(clock+4100);
assert.equal(root.dataset.facing,'left','Al terminar la pausa invierte su dirección');
assert(root.style.transform.endsWith('scaleX(1)'),'Al caminar hacia la izquierda recupera la orientación original del video');

chatPanel.hidden=false;
chatObserver();
assert.equal(root.dataset.paused,'true','El chat visible detiene al caminante');
assert.equal(root.dataset.state,'pausing','Al abrir el chat cambia a la pose quieta');
assert(root.classes.has('walker--idle'),'Al abrir el chat activa la clase de reposo');
assert.equal(frames.size,0,'El caminante cancela su ciclo de animación mientras el chat está abierto');
const pausedPosition=root.style.transform;
const pausedBubblePosition=plantAssistant.style.transform;
const pausedX=Number.parseFloat(pausedPosition.match(/translate3d\(([-\d.]+)px/)[1]);
chatPanel.hidden=true;
chatObserver();
assert.equal(root.dataset.paused,'false','Al cerrar el chat el caminante se reactiva');
assert.equal(Number.parseFloat(root.style.transform.match(/translate3d\(([-\d.]+)px/)[1]),pausedX,'El personaje retoma desde la misma posición horizontal');
assert.equal(root.style.transform,pausedPosition,'Al cerrar el chat continúa exactamente desde donde se detuvo');
assert.equal(plantAssistant.style.transform,pausedBubblePosition,'Al abrir el chat la burbuja permanece sobre la posición detenida del personaje');

scope.innerWidth=500;
windowListeners.resize();
assert(Math.abs(Number.parseFloat(root.style.width)-(116*0.72*172/238))<0.01,'El personaje reduce su tamaño en pantallas pequeñas');
reducedMotion.matches=true;
reducedMotionCallback();
assert.equal(root.dataset.paused,'true','Movimiento reducido deja al personaje quieto');
assert.equal(frames.size,0,'Movimiento reducido evita mantener un bucle de animación');

console.log('Caminante OK: bienvenida y selección estáticas en el mapa principal, recorrido en otras vistas, chat, resize y movimiento reducido.');
