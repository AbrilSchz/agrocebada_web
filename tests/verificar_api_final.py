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
        features=get('/api/parcelas')['features']
        assert len(features)==197
        assert sum(f['properties'].get('cohorte')=='prediccion' for f in features)==59
        assert sum(f['properties'].get('cohorte')=='referencia' for f in features)==138
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
        catalogue=get('/api/resultados/campanas')['modelos'][0]['campanas'][0]
        assert catalogue['parcelas']==197 and all(catalogue['metricas_disponibles'].values())
        borders=get('/geografia/limites.geojson')
        assert sum(f['properties']['nivel']=='estado' for f in borders['features'])==3
        assert sum(f['properties']['nivel']=='municipio' for f in borders['features'])==169
        assert borders['metadata']['fuente'].startswith('INEGI')
        for metric,count in [('prediccion',197),('observado',138),('error_absoluto_t_ha',138)]:
            data=get('/api/resultados/valores?'+urllib.parse.urlencode({'campaña':'agrocebada-final','version_modelo':'ensamble-50-50-v1','metrica':metric}))
            assert sum(v is not None for v in data['valores'].values())==count
        assert len([r for r in get('/api/capas') if r['id'].startswith('final_')])==5
        assert len(get('/api/capas/final_prec/fechas'))==7
        with urllib.request.urlopen(base+'/',timeout=5) as r:page=r.read().decode()
        assert '>API</a>' not in page and 'id="results-button"' not in page
        assert 'id="map-legend"' in page and 'id="map-source"' in page
        for asset in ['regions.js','charts.js']:
            with urllib.request.urlopen(base+'/'+asset,timeout=5) as r:assert r.read()==(ROOT/'public'/asset).read_bytes()
        for row in [ref,pred]:
            req=urllib.request.Request(base+'/api/parcelas/'+row['ID_POLIGONO']+'/informacion-inteligente',data=b'{}',headers={'Content-Type':'application/json'},method='POST')
            with urllib.request.urlopen(req,timeout=5) as r:explain=json.load(r)
            assert explain['mode']=='mock' and 'Municipio' in explain['explanation']
        req=urllib.request.Request(base+'/api/datos',data=b'[]',headers={'Content-Type':'application/json'},method='POST')
        try:urllib.request.urlopen(req,timeout=5);raise AssertionError('Se permitió escribir')
        except urllib.error.HTTPError as e:assert e.code==403
        with urllib.request.urlopen(base+'/fuentes/05_final/dashboard_parcelas_prediccion.csv',timeout=5) as r:assert len(r.read())>1000
        docs=get('/api/documentacion')
        assert len(docs['notebooks'])==4 and len(docs['fuentes'])==10
        for notebook in docs['notebooks']:
            original=json.loads((ROOT/'modelos/libretas_finales'/notebook['archivo']).read_text())
            view=get(notebook['url'])
            assert len(view['celdas'])==len(original['cells'])
            for cell,source in zip(view['celdas'],original['cells']):
                assert cell['fuente']==''.join(source['source'])
                assert all(o['tipo']=='texto' or o['mime'] in ['image/png','image/jpeg'] for o in cell['salidas'])
            with urllib.request.urlopen(base+notebook['descarga'],timeout=5) as r:
                assert r.read()==(ROOT/'modelos/libretas_finales'/notebook['archivo']).read_bytes()
        for source in docs['fuentes']:
            with urllib.request.urlopen(base+source['descarga'],timeout=5) as r:assert r.read()==(ROOT/source['archivo']).read_bytes()
        with urllib.request.urlopen(base+'/documentacion/archivos/reporte',timeout=5) as r:
            assert r.read()==(ROOT/'modelos/libretas_finales/Reporte_Metodologico_AgroCebada_Final.docx').read_bytes()
        for route in ['/api/documentacion/notebooks/desconocido','/documentacion/archivos/desconocido','/documentacion/archivos/%2e%2e%2fserver.js']:
            try:urllib.request.urlopen(base+route);raise AssertionError('Se permitió un ID fuera de la lista')
            except urllib.error.HTTPError as e:assert e.code==404
        print('API OK: salud, 197 geometrías, OOF/final, ausencias, SHAP parcial, validación, mapas, clima, mock, descargas y escritura bloqueada.')
        print('AGC_001 OOF:',ref['resultado']['prediccion'],'observado:',ref['resultado']['observado'])
        print('AGC_003 final:',pred['resultado']['prediccion'],'intervalo:',pred['contexto_modelo']['intervalo_empirico80']['inferior'],pred['contexto_modelo']['intervalo_empirico80']['superior'])
        print('Documentación OK: cuatro libretas completas, descarga original, diez fuentes, reporte y rutas limitadas por ID.')
    finally:
        process.terminate()
        process.communicate(timeout=5)
