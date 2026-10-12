"""Verifica el contrato de la API real sobre una copia temporal de solo lectura."""
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as tmp:
    copied=Path(tmp)/'final.sqlite'
    with sqlite3.connect((ROOT/'db/parcelas_final.sqlite').as_uri()+'?mode=ro',uri=True) as original,sqlite3.connect(copied) as target:
        original.backup(target)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    env={**os.environ,'DB_PATH':str(copied),'READ_ONLY':'1','DEMO_MODE':'0','LLM_MODE':'mock','PORT':str(port)}
    process=subprocess.Popen(['node','server.js'],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
    base=f'http://127.0.0.1:{port}'
    def get(path):
        with urllib.request.urlopen(base+path,timeout=5) as r:return json.load(r)
    try:
        for attempt in range(50):
            try:
                assert get('/api/health')['ok'];break
            except urllib.error.URLError:
                if process.poll() is not None:raise RuntimeError(process.stdout.read())
                time.sleep(.1)
        else:raise RuntimeError('El servidor no arrancó')
        assert len(get('/api/parcelas')['features'])==197
        ref=get('/api/parcelas/AGC_001/dashboard');pred=get('/api/parcelas/AGC_003/dashboard')
        assert ref['resultado']['tipo_prediccion']=='oof' and ref['resultado']['observado']==3.5
        assert ref['resultado']['fold_id'] is None and len(ref['contexto_modelo']['validacion_parcela'])==3
        assert pred['resultado']['tipo_prediccion']=='final' and pred['resultado']['observado'] is None
        assert all(v is None for v in pred['metricas'].values())
        assert pred['explicabilidad']['estado']=='parcial_hgb' and pred['contribuciones']==[]
        assert len(pred['contexto_modelo']['shap_hgb_parcial'])==3
        assert len(pred['contexto_modelo']['vecinos_referencia'])==3
        assert len(pred['contexto_modelo']['variables_modelo'])==187
        summary=get('/api/modelo/resumen')
        assert len(summary['validacion'])==15 and len(summary['importancias_globales'])==187
        assert get('/api/resultados/campanas')['modelos'][0]['campanas'][0]['parcelas']==197
        for metric,count in [('prediccion',197),('observado',138),('error_absoluto_t_ha',138)]:
            data=get('/api/resultados/valores?'+urllib.parse.urlencode({'campaña':'agrocebada-final','version_modelo':'ensamble-50-50-v1','metrica':metric}))
            assert sum(v is not None for v in data['valores'].values())==count
        assert len([r for r in get('/api/capas') if r['id'].startswith('final_')])==5
        assert len(get('/api/capas/final_prec/fechas'))==7
        for row in [ref,pred]:
            req=urllib.request.Request(base+'/api/parcelas/'+row['ID_POLIGONO']+'/informacion-inteligente',data=b'{}',headers={'Content-Type':'application/json'},method='POST')
            with urllib.request.urlopen(req,timeout=5) as r:explain=json.load(r)
            assert explain['mode']=='mock' and 'Municipio' in explain['explanation']
        req=urllib.request.Request(base+'/api/datos',data=b'[]',headers={'Content-Type':'application/json'},method='POST')
        try:urllib.request.urlopen(req,timeout=5);raise AssertionError('Se permitió escribir')
        except urllib.error.HTTPError as e:assert e.code==403
        with urllib.request.urlopen(base+'/fuentes/05_final/dashboard_parcelas_prediccion.csv',timeout=5) as r:assert len(r.read())>1000
        print('API OK: salud, 197 geometrías, OOF/final, ausencias, SHAP parcial, validación, mapas, clima, mock, descargas y escritura bloqueada.')
        print('AGC_001 OOF:',ref['resultado']['prediccion'],'observado:',ref['resultado']['observado'])
        print('AGC_003 final:',pred['resultado']['prediccion'],'intervalo:',pred['contexto_modelo']['intervalo_empirico80']['inferior'],pred['contexto_modelo']['intervalo_empirico80']['superior'])
    finally:
        process.terminate()
        process.communicate(timeout=5)
