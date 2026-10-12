#!/usr/bin/env python3
"""Integra los artefactos finales recibidos; no ejecuta libretas ni reentrena modelos."""
import argparse
from collections import Counter
from contextlib import redirect_stdout
from datetime import datetime, timezone
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import statistics
import sys
import tempfile
from types import SimpleNamespace
from zipfile import ZipFile

import importar_modelo as generic

ROOT = Path(__file__).resolve().parents[1]
DATASET = 'agrocebada-final'
MODEL = 'ensamble-50-50-v1'
LABEL = 'AgroCebada final · Ensamble KNN + HGB'
SCHEMES = ('RepeatedKFold', 'GroupKFold_CHIRPS', 'LOGO_Municipio')
LIMIT = 100 * 1024 * 1024


def package_files(path):
    """Lee fuentes sin extraer rutas del ZIP ni cargar los ZIP internos duplicados."""
    if path.is_dir():
        members = ((p.relative_to(path).as_posix(), p.read_bytes())
                   for p in sorted(path.rglob('*')) if p.is_file())
    else:
        if path.stat().st_size > LIMIT:
            generic.fail('El paquete supera 100 MiB')
        with ZipFile(path) as archive:
            if sum(i.file_size for i in archive.infolist()) > LIMIT:
                generic.fail('El paquete descomprimido supera 100 MiB')
            members = [(i.filename, archive.read(i)) for i in archive.infolist() if not i.is_dir()]
    files, total = {}, 0
    for name, content in members:
        parts = Path(name).parts
        if '__MACOSX' in parts or Path(name).name.startswith('.') or name.lower().endswith('.zip'):
            continue
        lower = name.lower()
        if 'data/' not in lower:
            continue
        key = lower[lower.index('data/') + 5:]
        if Path(key).suffix not in {'.csv', '.json'}:
            continue
        if key in files and files[key] != content:
            generic.fail(f'Dos archivos distintos para {key}')
        total += len(content)
        if total > LIMIT:
            generic.fail('Las tablas superan 100 MiB')
        files[key] = content
    if not files:
        generic.fail('No se encontró Data/ con las tablas finales')
    return files


def num(value, field, optional=False):
    return generic.number(value, field, optional)


def close(a, b, field, tolerance=1e-6):
    if abs(a - b) > tolerance:
        generic.fail(f'{field}: {a} no coincide con {b}')


def quantile(values, q):
    values = sorted(values)
    pos = (len(values) - 1) * q
    low = math.floor(pos)
    return values[low] + (values[min(low + 1, len(values) - 1)] - values[low]) * (pos - low)


def distance(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, [a['latitud'], a['longitud'], b['latitud'], b['longitud']])
    h = math.sin((lat2 - lat1) / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2)**2
    return 6371000 * 2 * math.asin(math.sqrt(min(1, h)))


def boolean(value, field):
    if value not in {'True', 'False'}:
        generic.fail(f'{field}: se esperaba True o False')
    return value == 'True'


def prepare(files):
    def rows(name):
        name = name.lower()
        if name not in files:
            generic.fail(f'Falta Data/{name}')
        return generic.csv_records(files[name], name)

    def document(name):
        name = name.lower()
        if name not in files:
            generic.fail(f'Falta Data/{name}')
        return json.loads(files[name])

    def indexed(name):
        result = {}
        for row in rows(name):
            pid = generic.identifier(row.get('ID_POLIGONO'), 'ID_POLIGONO')
            if pid in result:
                generic.fail(f'{name}: ID repetido {pid}')
            result[pid] = row
        return result

    quality = document('01_calidad/resumen_libreta01.json')
    phenology = document('02_fenologia/resumen_libreta02.json')
    shap_summary = document('04_shap/resumen_libreta04.json')
    references = indexed('05_final/dashboard_parcelas_referencia.csv')
    predictions = indexed('05_final/dashboard_parcelas_prediccion.csv')
    delivery = indexed('05_final/predicciones_59_ensamble.csv')
    oof = indexed('03_validacion/predicciones_oof_todos_esquemas.csv')
    spatial = indexed('03_validacion/metadatos_espaciales_validacion.csv')
    features = indexed('02_fenologia/X_integrado_completo.csv')
    all_ids = set(references) | set(predictions)
    if set(references) & set(predictions):
        generic.fail('Las cohortes de referencia y predicción se solapan')
    if not references or not predictions:
        generic.fail('Falta alguna cohorte')
    if not (set(references) == set(oof) == set(spatial)) or set(predictions) != set(delivery) or all_ids != set(features):
        generic.fail('Los IDs no coinciden entre las tablas de referencia, OOF, predicción y variables')
    if (len(all_ids), len(references), len(predictions)) != (quality['n_parcelas'], quality['n_entrenamiento'], quality['n_prediccion']):
        generic.fail('Los recuentos no coinciden con resumen_libreta01.json')
    contexts, results, measurements, layers = {}, [], [], []
    monthly = re.compile(r'^(PREC|Tmax|Tmin)_2025_(\d{2})_mean$')
    climate = {'PREC': ('Precipitación mensual', 'mm', 'CHIRPS'),
               'Tmax': ('Temperatura máxima mensual', '°C', 'CHIRTS'),
               'Tmin': ('Temperatura mínima mensual', '°C', 'CHIRTS')}
    for key, (name, unit, source) in climate.items():
        layers.append(dict(id='final_' + key.lower(), nombre=name, grupo='Clima final · 2025',
                           descripcion='Agregado mensual recibido; el día 01 identifica el mes, no una captura diaria.',
                           unidad=unit, fuente=source + ' · X_integrado_completo.csv',
                           agregacion='mean espacial sobre el raster mensual; ventana abril–octubre 2025'))
    for col, name, unit in [('Elevacion_INEGI_CEM4_120m_mean', 'Elevación', 'm'),
                             ('Pendiente_INEGI_CEM4_120m_grados_mean', 'Pendiente', '°')]:
        layers.append(dict(id='final_' + col, nombre=name, grupo='Topografía final',
                           descripcion='Valor recibido en X_integrado_completo.csv', unidad=unit,
                           fuente='INEGI CEM4 · 120 m', agregacion='mean espacial por parcela'))

    coords = {}
    for pid, row in {**references, **predictions}.items():
        lat, lon = num(row['latitud'], pid + ' latitud'), num(row['longitud'], pid + ' longitud')
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            generic.fail(f'{pid}: coordenadas fuera de rango')
        coords[pid] = {'latitud': lat, 'longitud': lon}
    ref_y = {pid: num(row['RENDIMIENTO_T_HA'], pid + ' observado') for pid, row in references.items()}
    for pid in sorted(all_ids):
        row = references.get(pid, predictions.get(pid))
        values = {col: num(value, pid + ' ' + col, True)
                  for col, value in features[pid].items() if col not in {'ID_POLIGONO', '_fila'}}
        if len(values) != phenology['n_variables_totales']:
            generic.fail(f'{pid}: número inesperado de variables')
        ctx = dict(municipio=row['municipio'], cohorte='referencia' if pid in references else 'prediccion',
                   centroide=coords[pid], variables_modelo=values)
        if pid in references:
            close(num(oof[pid]['RENDIMIENTO_T_HA'], pid), ref_y[pid], pid + ' observado OOF')
            close(num(spatial[pid]['latitud'], pid), coords[pid]['latitud'], pid + ' latitud')
            close(num(spatial[pid]['longitud'], pid), coords[pid]['longitud'], pid + ' longitud')
            if spatial[pid]['grupo_municipio'] != row['municipio']:
                generic.fail(f'{pid}: municipio distinto entre fuentes')
            ctx['estado'] = spatial[pid].get('estado') or None
            ctx['celda_chirps'] = spatial[pid]['celda_chirps']
            ctx['validacion_parcela'] = []
            for scheme in SCHEMES:
                pred = num(oof[pid][scheme + '__Ensamble_50_50'], pid + ' OOF')
                knn = num(oof[pid][scheme + '__KNN_Espacial'], pid + ' KNN')
                hgb = num(oof[pid][scheme + '__HGB_final'], pid + ' HGB')
                close(pred, .5 * (knn + hgb), pid + ' ensamble OOF')
                ctx['validacion_parcela'].append(dict(esquema=scheme, prediccion=pred, error_firmado_t_ha=pred-ref_y[pid]))
            ctx['esquema_oof'] = 'RepeatedKFold'
            ctx['agregacion_oof'] = 'Promedio de 3 repeticiones; no hay un único fold_id en el CSV recibido'
            ctx['componentes'] = dict(knn=num(oof[pid]['RepeatedKFold__KNN_Espacial'], pid),
                                     hgb=num(oof[pid]['RepeatedKFold__HGB_final'], pid), alcance='OOF promediado')
            pred = ctx['validacion_parcela'][0]['prediccion']
        else:
            pred = num(row['RENDIMIENTO_T_HA_PRED'], pid + ' predicción')
            close(pred, num(delivery[pid]['RENDIMIENTO_T_HA_PRED'], pid), pid + ' entrega redondeada', 5.00001e-5)
            knn, hgb = num(row['pred_knn'], pid), num(row['pred_hgb_final'], pid)
            close(pred, .5 * (knn + hgb), pid + ' ensamble final')
            ctx['componentes'] = dict(knn=knn, hgb=hgb, alcance='Ajuste final con las 138 referencias')
            ctx['vecinos_referencia'] = []
            for index in range(1, 4):
                neighbor = row[f'vecino{index}_id']
                if neighbor not in references:
                    generic.fail(f'{pid}: vecino {neighbor} no es una referencia')
                d = num(row[f'vecino{index}_dist_m'], pid + ' distancia')
                if d < 0:
                    generic.fail(f'{pid}: distancia negativa')
                close(d, distance(coords[pid], coords[neighbor]), pid + ' distancia haversine', .01)
                y = num(row[f'vecino{index}_rend_t_ha'], pid)
                close(y, ref_y[neighbor], pid + ' rendimiento del vecino')
                ctx['vecinos_referencia'].append(dict(ID_POLIGONO=neighbor,distancia_m=d,observado=y))
            nearest = num(row['dist_vecino_mas_cercano_m'], pid)
            actual_nearest = min(distance(coords[pid], coords[n]) for n in references)
            close(nearest, actual_nearest, pid + ' vecino más cercano', .01)
            close(nearest, ctx['vecinos_referencia'][0]['distancia_m'], pid + ' vecino 1')
            nearby = boolean(row['zona_con_referencias'], pid)
            threshold = num(shap_summary['umbral_referencia_m'], 'umbral')
            if nearby != (nearest <= threshold):
                generic.fail(f'{pid}: clasificación de zona incoherente')
            kind = 'interpolacion' if nearby else 'zona_sin_referencias'
            if row['tipo_intervalo'] != kind:
                generic.fail(f'{pid}: tipo de intervalo incoherente')
            half = num(shap_summary['q80_interpolacion' if nearby else 'q80_zona_nueva'], 'q80')
            low, high = num(row['intervalo80_inf'], pid), num(row['intervalo80_sup'], pid)
            close(low, pred-half, pid + ' intervalo inferior')
            close(high, pred+half, pid + ' intervalo superior')
            ctx['intervalo_empirico80'] = dict(inferior=low, superior=high, semiancho_t_ha=half, tipo=kind,
                                             zona_con_referencias=nearby,distancia_referencia_m=nearest,
                                             umbral_referencia_m=threshold, cobertura_garantizada=False)
            partial = []
            for item in row.get('top3_variables_hgb_shap', '').split(';'):
                if not item.strip():
                    continue
                match = re.fullmatch(r'\s*(.+?)\s+\(([+-]?\d+(?:\.\d+)?)\)\s*', item)
                if not match or match[1] not in set(values) | {'latitud', 'longitud'}:
                    generic.fail(f'{pid}: formato o variable inválida en SHAP parcial')
                partial.append(dict(variable=match[1],aporte_redondeado_t_ha=float(match[2])))
            if len(partial) not in {0, 3} or len({x['variable'] for x in partial}) != len(partial):
                generic.fail(f'{pid}: se esperaban 3 aportes HGB distintos')
            ctx['shap_hgb_parcial'] = partial
        results.append(dict(ID_POLIGONO=pid,version_modelo=MODEL,prediccion=pred,
                            observado=ref_y.get(pid),unidad_rendimiento='t/ha',
                            tipo_prediccion='oof' if pid in references else 'final'))
        contexts[pid] = ctx
        for col, value in values.items():
            match = monthly.fullmatch(col)
            if match:
                key, month = match.groups()
                if not 4 <= int(month) <= 10:
                    generic.fail('Mes climático fuera de la ventana abril–octubre')
                measurements.append(dict(ID_POLIGONO=pid,capa_id='final_' + key.lower(),
                                         fecha=f'2025-{month}-01',variable=key,valor=value))
            elif col in {'Elevacion_INEGI_CEM4_120m_mean', 'Pendiente_INEGI_CEM4_120m_grados_mean'}:
                measurements.append(dict(ID_POLIGONO=pid,capa_id='final_' + col,fecha='',variable=col,valor=value))
    if sum(bool(monthly.fullmatch(col)) for col in values) != 21:
        generic.fail('Se esperaban 21 columnas mensuales: PREC, Tmax y Tmin de abril a octubre')

    for scheme, field in [('RepeatedKFold','q80_interpolacion'),('LOGO_Municipio','q80_zona_nueva')]:
        errors = [abs(num(oof[pid][scheme+'__Ensamble_50_50'],pid)-ref_y[pid]) for pid in references]
        close(quantile(errors,.8),num(shap_summary[field],field),'Cuantil de errores '+scheme)
    nearest_train = [min(distance(coords[pid],coords[n]) for n in references if n != pid) for pid in references]
    close(quantile(nearest_train,.95),num(shap_summary['umbral_referencia_m'],'umbral'),'Umbral de referencias',.01)
    validation, folds = rows('03_validacion/resultados_validacion.csv'), rows('03_validacion/resultados_por_fold.csv')
    keys = set()
    for row in validation:
        key = (row['esquema'],row['modelo'])
        if key in keys or key[0] not in SCHEMES:
            generic.fail('Esquema o modelo repetido en validación')
        keys.add(key)
        selected = [f for f in folds if (f['esquema'],f['modelo']) == key]
        if len(selected) != int(row['n_folds']) or len({f['fold'] for f in selected}) != len(selected):
            generic.fail('Recuento de folds inconsistente')
        for metric in ['MAE','RMSE']:
            vals = [num(f[metric],metric) for f in selected]
            if any(v<0 for v in vals):
                generic.fail('Métrica negativa')
            close(statistics.mean(vals),num(row[metric+'_fold_media'],metric),'Media por fold '+str(key))
            close(statistics.stdev(vals),num(row[metric+'_fold_sd'],metric),'Desviación por fold '+str(key))
        for col in set(row)-{'esquema','modelo','_fila'}:
            row[col] = num(row[col],col)
        row.pop('_fila',None)
    if keys != {(s,m) for s in SCHEMES for m in ['Dummy','KNN_Espacial','HGB_agronomico','HGB_final','Ensamble_50_50']}:
        generic.fail('Faltan resultados de los tres esquemas y cinco modelos')
    importance = rows('04_shap/importancia_variables.csv')
    if len(importance) != phenology['n_variables_totales'] or len({r['variable'] for r in importance}) != len(importance):
        generic.fail('Importancias globales incompletas o repetidas')
    for row in importance:
        for col in ['shap_media','shap_sd','perm_media','perm_sd','folds_en_top10']:
            row[col] = num(row[col],col)
        if row['shap_media'] < 0 or row['shap_sd'] < 0:
            generic.fail('La importancia SHAP absoluta no puede ser negativa')
        row.pop('_fila',None)
    digest = {name:hashlib.sha256(data).hexdigest() for name,data in sorted(files.items())}
    source_hash = hashlib.sha256(json.dumps(digest,sort_keys=True).encode()).hexdigest()
    summary = dict(dataset_id=DATASET,version_modelo=MODEL,estado='artefactos_recibidos',
                   entrenamiento=len(references),prediccion=len(predictions),parcelas=len(all_ids),
                   variables=phenology['n_variables_totales'],ventana_insumos=quality['ventana_temporal'],
                   municipios=dict(Counter(c['municipio'] for c in contexts.values())),
                   validacion=validation,importancias_globales=sorted(importance,key=lambda x:-x['shap_media']),
                   modelo_importancias='HGB_agronomico · sin coordenadas · 15 folds',
                   intervalos=shap_summary,respuestas=document('04_shap/respuestas_preguntas_guia.json'),
                   hash_tablas=source_hash,archivos_sha256=digest,
                   limitaciones=['Evaluación retrospectiva; rendimiento cerrado, sin serie anual.',
                     'Modelos e intervalos no reentrenados ni reevaluados por el importador.',
                     'Intervalo empírico nominal 80 %; sin garantía de cobertura en parcelas nuevas.',
                     'SHAP parcial del HGB final: tres aportes redondeados, sin base ni descomposición completa del ensamble.',
                     'Las métricas CSV prevalecen en la interfaz; el reporte recibido contiene discrepancias.'])
    return dict(resultados=results,mediciones=measurements,capas=layers), contexts, summary


def run(args):
    incoming,base,output = args.archivo.resolve(),args.base.resolve(),args.salida.resolve()
    if not base.is_file():
        generic.fail('No existe la base de geometrías')
    if output == base or (output.exists() and os.path.samefile(output,base)):
        generic.fail('La salida debe ser distinta de la base de referencia')
    if output == incoming or (output.exists() and incoming.is_file() and os.path.samefile(output,incoming)):
        generic.fail('La salida no puede reemplazar la entrada')
    tables,contexts,summary = prepare(package_files(incoming))
    with generic.readonly(base) as db:
        known = {r[0] for r in db.execute('SELECT ID_POLIGONO FROM parcelas')}
    options = SimpleNamespace(dataset=DATASET,tolerancia=1e-6,sin_mediciones=False)
    _,_,_,_,warnings,status = generic.validate(tables,options,known)
    report = dict(parcelas=summary['parcelas'],observados=summary['entrenamiento'],
                  predicciones_finales=summary['prediccion'],shap_completo=status,
                  shap_hgb_parcial=sum(bool(c.get('shap_hgb_parcial')) for c in contexts.values()),
                  mediciones=len(tables['mediciones']),capas=len(tables['capas']),avisos=warnings,
                  sha256_tablas=summary['hash_tablas'])
    if args.validar:
        print(json.dumps(report,ensure_ascii=False,indent=2))
        return report
    for suffix in ['-wal','-shm','-journal']:
        if Path(str(output)+suffix).exists():
            generic.fail('Detén el servidor que utiliza la salida antes de reemplazarla')
    output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='libretas-',dir=output.parent) as temporary:
        staging = Path(temporary)/'parcelas_final.sqlite'
        if output.exists():
            with generic.readonly(output) as old,sqlite3.connect(staging) as db:
                old.backup(db)
        canonical = Path(temporary)/'normalizado.zip'
        with ZipFile(canonical,'w') as archive:
            for name,records in tables.items():
                import csv
                buffer=io.StringIO()
                writer=csv.DictWriter(buffer,fieldnames=list(records[0]))
                writer.writeheader();writer.writerows(records)
                archive.writestr(name+'.csv',buffer.getvalue())
        imported = io.StringIO()
        with redirect_stdout(imported):
            generic.import_data(SimpleNamespace(**vars(options),archivo=canonical,base=base,
                                               salida=staging,validar=False,etiqueta=LABEL))
        stamp = datetime.now(timezone.utc).isoformat()
        summary['imported_at'] = stamp
        with sqlite3.connect(staging) as db:
            db.executescript('''
              CREATE TABLE IF NOT EXISTS parcelas_contexto_modelo (
                ID_POLIGONO TEXT NOT NULL,campana TEXT NOT NULL,version_modelo TEXT NOT NULL,
                contenido_json TEXT NOT NULL,PRIMARY KEY(ID_POLIGONO,campana,version_modelo));
              CREATE TABLE IF NOT EXISTS modelo_resumen (
                campana TEXT NOT NULL,version_modelo TEXT NOT NULL,contenido_json TEXT NOT NULL,
                PRIMARY KEY(campana,version_modelo));
            ''')
            with db:
                db.execute('DELETE FROM parcelas_contexto_modelo WHERE campana=? AND version_modelo=?',(DATASET,MODEL))
                db.executemany('INSERT INTO parcelas_contexto_modelo VALUES (?,?,?,?)',
                  [(pid,DATASET,MODEL,json.dumps(c,ensure_ascii=False,allow_nan=False)) for pid,c in contexts.items()])
                db.execute('INSERT OR REPLACE INTO modelo_resumen VALUES (?,?,?)',
                           (DATASET,MODEL,json.dumps(summary,ensure_ascii=False,allow_nan=False)))
                db.execute('UPDATE modelo_importaciones SET source_file=?,source_sha256=?,imported_at=? WHERE campana=? AND version_modelo=?',
                           (incoming.name,summary['hash_tablas'],stamp,DATASET,MODEL))
            if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':
                generic.fail('Falló la integridad de SQLite')
        if output.exists():
            backup=output.with_name(output.name+'.backup-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f'))
            with generic.readonly(output) as old,sqlite3.connect(backup) as copy:
                old.backup(copy)
            report['respaldo']=str(backup)
        os.replace(staging,output)
    report.update(salida=str(output),integridad='ok')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    return report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archivo',type=Path,help='Libretas_finales.zip o carpeta con Data/')
    parser.add_argument('--base',type=Path,default=ROOT/'db/parcelas_master.sqlite')
    parser.add_argument('--salida',type=Path,default=ROOT/'db/parcelas_final.sqlite')
    parser.add_argument('--validar',action='store_true')
    try:
        run(parser.parse_args())
    except (ValueError,OSError,sqlite3.Error,KeyError,IndexError) as error:
        print(f'Importación cancelada: {error}',file=sys.stderr)
        return 1
    return 0


if __name__=='__main__':
    sys.exit(main())
