"""API en modo live con transporte Gemini simulado, sin usar claves ni consumir cuota."""
import base64
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as tmp:
    copied=Path(tmp)/'final.sqlite'
    with sqlite3.connect((ROOT/'db/parcelas_final.sqlite').as_uri()+'?mode=ro',uri=True) as original,sqlite3.connect(copied) as target:
        original.backup(target)
    preload=Path(tmp)/'gemini-simulado.mjs'
    preload.write_text(r'''
import assert from 'node:assert/strict';
globalThis.fetch=async(url,options)=>{
  assert(url.startsWith('https://generativelanguage.googleapis.com/'));
  assert.equal(options.headers['x-goog-api-key'],'test-only-key');
  const body=JSON.parse(options.body);
  assert(!options.body.includes('test-only-key'));
  const response=parts=>({ok:true,status:200,json:async()=>({candidates:[{content:{role:'model',parts}}]})});
  if(body.contents[0].parts[0].inlineData) {
    assert.equal(body.contents[0].parts[0].inlineData.mimeType,'audio/ogg');
    return response([{text:'Abre la tabla de parcelas'}]);
  }
  if(body.systemInstruction.parts[0].text.startsWith('Explica en español')) return response([{text:'Parcela AGC_003, predicción 3.503 t/ha.'}]);
  if(body.contents.at(-1).parts[0].text==='simula cuota') return {ok:false,status:429};
  if(body.toolConfig?.functionCallingConfig.mode==='NONE') {
    assert.equal(body.contents.at(-2).parts[0].thoughtSignature,'firma-simulada');
    const answers=body.contents.at(-1).parts.map(p=>p.functionResponse);
    assert.equal(answers[0].id,'consulta-1');
    const data=answers[0].response.datos;
    assert.equal(data.ID_POLIGONO,'AGC_001');assert.equal(data.resultado.observado,3.5);
    assert.equal(data.resultado.prediccion,3.048988762556173);
    return response([{text:'Respuesta con observado almacenado: '+data.resultado.observado}]);
  }
  assert(body.tools[0].functionDeclarations.some(f=>f.name==='consultar_parcela'));
  return response([{functionCall:{id:'consulta-1',name:'consultar_parcela',args:{id:'AGC_001'}},thoughtSignature:'firma-simulada'},
    {functionCall:{name:'filtrar_parcelas',args:{municipio:'Singuilucan',minimo:0,maximo:5}}}]);
};
''')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    env={**os.environ,'DB_PATH':str(copied),'READ_ONLY':'1','DEMO_MODE':'0','LLM_MODE':'live','GEMINI_API_KEY':'test-only-key','PORT':str(port)}
    process=subprocess.Popen(['node','--import',str(preload),'server.js'],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
    base=f'http://127.0.0.1:{port}'
    def call(path,body=None,expected=200):
        req=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(req,timeout=5) as response:
                assert expected==200;return json.load(response)
        except urllib.error.HTTPError as error:
            assert error.code==expected;return json.load(error)
    try:
        for attempt in range(50):
            try:call('/api/health');break
            except urllib.error.URLError:
                if process.poll() is not None:raise RuntimeError(process.stdout.read())
                time.sleep(.1)
        else:raise RuntimeError('No arrancó el servidor')
        assert call('/api/chat/config')=={'voice':True}
        result=call('/api/chat',{'message':'Consulta otra parcela y filtra municipio','ui':{'vista':'mapa','capa':'final_prec','metrica':None,'filtros':{}}})
        assert result['mode']=='live' and '3.5' in result['reply']
        assert result['actions']==[{'type':'filtrar_parcelas','args':{'municipio':'Singuilucan','minimo':0,'maximo':5}}]
        brief=call('/api/parcelas/AGC_003/informacion-inteligente',{})
        assert not any(c.isdigit() for c in brief['explanation']) and len(brief['explanation'].split())<=90
        audio=base64.b64encode(bytes(100)).decode()
        transcript=call('/api/chat/voz',{'mimeType':'audio/ogg','audio':audio})['transcript']
        action=call('/api/chat',{'message':transcript})
        assert action['mode']=='local' and action['actions'][0]['args']['vista']=='tabla'
        assert 'Cuota' in call('/api/chat',{'message':'simula cuota'},429)['error']
        call('/api/chat',{'message':'x','ui':{'prediccion':999}},400)
        print('API live simulada OK: contexto SQLite, dos pasos con firma, acciones, párrafo sin cifras, audio → transcripción → comando y errores de cuota.')
    finally:
        process.terminate();output=process.communicate(timeout=5)[0]
        if process.returncode not in (-15,0):raise RuntimeError(output)
