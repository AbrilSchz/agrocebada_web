import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

let permission,recorders=[],tracks=[],requests=[],transcripts=[],states=[],errors=[];
class Recorder {
  static isTypeSupported(mime) {return mime==='audio/ogg;codecs=opus';}
  constructor(stream,options) {this.stream=stream;this.options=options;this.state='inactive';recorders.push(this);}
  start() {this.state='recording';}
  stop() {this.state='inactive';this.ondataavailable({data:new Blob(['x'.repeat(500)])});this.done=this.onstop();}
}
class Reader {readAsDataURL(blob) {blob.arrayBuffer().then(data=>{this.result='data:audio/ogg;base64,'+Buffer.from(data).toString('base64');this.onload();});}}
const scope={window:{isSecureContext:true,MediaRecorder:Recorder},navigator:{mediaDevices:{getUserMedia:()=>new Promise(resolve=>{permission=()=>{const track={stopped:false,stop(){this.stopped=true;}};tracks.push(track);resolve({getTracks:()=>[track]});};})}},MediaRecorder:Recorder,Blob,FileReader:Reader,AbortController,setTimeout,clearTimeout,
  fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>url.endsWith('config') ? {voice:true} : {transcript:'Abre la tabla de parcelas'}};}};
vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/voice.js',import.meta.url),'utf8'),scope);
const voice=scope.window.createChatVoice({onState:s=>states.push(s),onTranscript:t=>transcripts.push(t),onError:e=>errors.push(e)});
assert.equal(requests.length,0,'Crear el chat no enciende el micrófono ni llama a Gemini');
assert(voice.supported());
let start=voice.start();await new Promise(resolve=>setImmediate(resolve));
voice.cancel();permission();await start;
assert(tracks[0].stopped);assert.equal(recorders.length,0,'Cancelar durante permiso no comienza captura');
start=voice.start();await new Promise(resolve=>setImmediate(resolve));permission();await start;
assert.equal(recorders[0].options.mimeType,'audio/ogg;codecs=opus');assert.equal(recorders[0].state,'recording');
await voice.start();await recorders[0].done;
assert(tracks[1].stopped);assert.deepEqual(transcripts,['Abre la tabla de parcelas']);
const audio=JSON.parse(requests.find(r=>r.url==='/api/chat/voz').options.body);
assert.equal(audio.mimeType,'audio/ogg');assert.equal(Buffer.from(audio.audio,'base64').length,500);
assert(states.includes('transcribing'));assert.equal(states.at(-1),'idle');
start=voice.start();await new Promise(resolve=>setImmediate(resolve));permission();await start;
voice.cancel();await recorders[1].done;assert(tracks[2].stopped);assert.equal(transcripts.length,1);
scope.window.isSecureContext=false;assert.equal(voice.supported(),false);await voice.start();assert(errors.at(-1).includes('HTTPS'));
console.log('Voz OK: sin captura automática, selección de formato OGG, permiso cancelado, transcripción, envío y cierre del micrófono.');
