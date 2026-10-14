import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {runAgent,validateAction,localCommand,briefLocal,singleParagraph} from '../lib/agent.js';

const catalogue={parcelas:['AGC_001','AGC_003'],capas:[{id:'elevacion',nombre:'Elevación',fechas:['']}],estados:['Hidalgo'],municipios:['Singuilucan']};
const context={campaña:'final',version_modelo:'modelo',resultado:{prediccion:3.5,observado:null},dataset:{id:'final',demonstration:false},modelo:{entrenamiento:138,prediccion:59}};
assert.equal(localCommand('Selecciona la parcela AGC 003',catalogue).actions[0].args.id,'AGC_003');
assert.equal(localCommand('Muestra la elevación',catalogue).actions[0].args.id,'elevacion');
assert.equal(localCommand('¿Qué significa validación cruzada?',catalogue),null);
for(const action of [{type:'eval',args:{}},{type:'seleccionar_parcela',args:{id:'NO_EXISTE'}},{type:'mostrar_capa',args:{id:'elevacion',fecha:'2099-01-01'}},{type:'filtrar_parcelas',args:{minimo:4,maximo:2}},{type:'limpiar_filtros',args:{url:'https://x'}},{type:'filtrar_parcelas',args:{estado:'NO_EXISTE'}}]) assert.throws(()=>validateAction(action,catalogue));
assert(!/\d|AGC_|\n/.test(briefLocal(context)));
assert(!/\d|AGC_|\n/.test(briefLocal({...context,resultado:{observado:0}})));
assert.equal(singleParagraph(' Hola\n\n mundo '),'Hola mundo');
assert(singleParagraph('Palabra '.repeat(150)).split(' ').length<=90);

let calls=[],consulted=[];
const firstContent={role:'model',parts:[{functionCall:{id:'call-1',name:'consultar_parcela',args:{id:'AGC_001'}},thoughtSignature:'firma-original'},{functionCall:{name:'filtrar_parcelas',args:{municipio:'Singuilucan',minimo:0,maximo:4}}}]};
const options={mode:'live',catalogue,consultParcel:id=>{consulted.push(id);return {resultado:{prediccion:0,observado:null}};},generate:async body=>{
  calls.push(body);return calls.length===1 ? {content:firstContent,calls:firstContent.parts.map(p=>p.functionCall),text:''} : {text:'Consulta verificada y filtro preparado.',calls:[]};
}};
const result=await runAgent(context,{message:'Consulta AGC_001 y filtra Singuilucan',history:[]},options);
assert.equal(result.actions.length,1);assert.deepEqual(consulted,['AGC_001']);assert.equal(calls.length,2);
assert.equal(calls[1].contents.at(-2),firstContent,'Conserva la firma y todos los parts en el retorno a Gemini');
const response=calls[1].contents.at(-1).parts[0].functionResponse;
assert.equal(response.id,'call-1');assert.equal(response.response.datos.resultado.prediccion,0);assert.equal(response.response.datos.resultado.observado,null);
assert.equal(calls[1].toolConfig.functionCallingConfig.mode,'NONE');
assert.equal(calls[0].tools[0].functionDeclarations.length,9);
calls=[];
const invalid=await runAgent(context,{message:'Una petición compleja',history:[]},{...options,generate:async body=>{calls.push(body);return calls.length===1 ? {content:{role:'model',parts:[]},calls:[{name:'ejecutar_codigo',args:{codigo:'alert(1)'}}]} : {text:'Esa acción no está disponible.',calls:[]};}});
assert.deepEqual(invalid.actions,[]);assert(calls[1].contents.at(-1).parts[0].functionResponse.response.error);
await assert.rejects(runAgent(context,{message:'Petición',history:[]},{...options,generate:async()=>({calls:Array(5).fill({name:'vista_general'})})}),e=>e.status===502);
const local=await runAgent(context,{message:'Abre la tabla de parcelas',history:[]},{...options,generate:()=>{throw Error('No debe llamar al LLM');}});assert.equal(local.mode,'local');

// Broker del navegador: valida el lote entero antes de modificar controles.
const applied=[],window={};const scope={window};vm.createContext(scope);
vm.runInContext(readFileSync(new URL('../public/agent-actions.js',import.meta.url),'utf8'),scope);window.AGENT_ACTIONS=scope.AGENT_ACTIONS;
vm.runInContext(readFileSync(new URL('../public/dashboard-agent.js',import.meta.url),'utf8'),scope);
const api={parcels:()=>[{id:'AGC_003',properties:{estado:'Hidalgo',municipio:'Singuilucan'}}],layers:()=>catalogue.capas,snapshot:()=>({filtros:{conjunto:'prediccion'}})};
for(const declaration of scope.AGENT_ACTIONS.functions) api[declaration.name]=args=>applied.push({name:declaration.name,args});
const broker=window.createDashboardAgent(api);
assert.throws(()=>broker.apply([{type:'cambiar_vista',args:{vista:'tabla'}},{type:'ejecutar_codigo',args:{}}]));assert.equal(applied.length,0);
assert.throws(()=>broker.apply([{type:'mostrar_resultados',args:{metrica:'error_absoluto_t_ha'}}]));assert.equal(applied.length,0);
assert.equal(broker.apply([{type:'filtrar_parcelas',args:{conjunto:'referencia'}},{type:'mostrar_resultados',args:{metrica:'error_absoluto_t_ha'}}]).length,2);
assert.equal(applied[1].args.metrica,'error_absoluto_t_ha');
console.log('Agente OK: atajos, consulta real simulada, retorno de funciones con firma, acciones permitidas y lote validado antes de tocar la web.');
