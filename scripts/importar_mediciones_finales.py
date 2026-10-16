#!/usr/bin/env python3
"""Importa el paquete corregido en una base existente, en una transacción."""
import argparse
import csv
import hashlib
import io
import json
import math
import sqlite3
from datetime import date
from pathlib import Path
from zipfile import ZipFile


def importar(package, database):
    with ZipFile(package) as z:
        if sum(i.file_size for i in z.infolist()) > 20_000_000:
            raise ValueError('Paquete demasiado grande')
        read = lambda n: list(csv.DictReader(io.StringIO(z.read(n).decode('utf-8-sig'))))
        layers = read('capas_corregido.csv')
        rows = read('mediciones_corregido.csv')
    layer_ids = {x['id'] for x in layers}
    if len(layer_ids) != len(layers):
        raise ValueError('Capas duplicadas')
    con = sqlite3.connect(database)
    try:
        ids = {x[0] for x in con.execute('SELECT ID_POLIGONO FROM parcelas')}
        unknown = sorted({r['ID_POLIGONO'] for r in rows} - ids)
        if unknown:
            raise ValueError(f'IDs sin geometría: {unknown}')
        values, seen = [], set()
        for r in rows:
            key = (r['ID_POLIGONO'], r['capa_id'], r['fecha'])
            if key in seen or r['capa_id'] not in layer_ids:
                raise ValueError(f'Clave duplicada o capa desconocida: {key}')
            seen.add(key)
            date.fromisoformat(r['fecha'])
            if not r['valor'].strip():
                raise ValueError(f'Valor ausente: {key}; no se sustituye por cero')
            value = float(r['valor'])
            if not math.isfinite(value):
                raise ValueError(f'Valor no finito: {key}')
            values.append((*key, '', value))
        before = con.execute('SELECT count(*) FROM datos').fetchone()[0]
        with con:
            # Solo retirar capas con procedencia sintética explícita, nunca por nombre.
            demo = [r[0] for r in con.execute("SELECT id FROM capas WHERE descripcion='DEMO: valores aleatorios'")]
            removed = 0
            for layer in demo:
                removed += con.execute('DELETE FROM datos WHERE capa_id=?', (layer,)).rowcount
                con.execute('DELETE FROM capas WHERE id=?', (layer,))
            columns = {r[1] for r in con.execute('PRAGMA table_info(capas)')}
            for column in ('fuente', 'agregacion'):
                if column not in columns:
                    con.execute(f'ALTER TABLE capas ADD COLUMN {column} TEXT')
            for r in layers:
                description = r['descripcion'] + '; Variable del modelo: ' + r['variable_modelo']
                con.execute('''INSERT INTO capas(id,nombre,grupo,descripcion,unidad,min,max,fuente,agregacion)
                    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                    nombre=excluded.nombre,grupo=excluded.grupo,descripcion=excluded.descripcion,
                    unidad=excluded.unidad,min=excluded.min,max=excluded.max,
                    fuente=excluded.fuente,agregacion=excluded.agregacion''',
                    (r['id'],r['nombre'],r['grupo'],description,r['unidad'],
                     float(r['min']) if r['min'] else None,float(r['max']) if r['max'] else None,r['fuente'],r['agregacion']))
            con.executemany('''INSERT INTO datos VALUES(?,?,?,?,?)
                ON CONFLICT(ID_POLIGONO,capa_id,fecha,variable) DO UPDATE SET valor=excluded.valor''', values)
        return {'mediciones_archivo':len(values),'parcelas':len({r[0] for r in values}),
                'capas_importadas':len(layers),'antes':before,'despues':con.execute('SELECT count(*) FROM datos').fetchone()[0],
                'capas_sinteticas_retiradas':demo,'mediciones_sinteticas_retiradas':removed,
                'sha256':hashlib.sha256(Path(package).read_bytes()).hexdigest(),
                'integridad':con.execute('PRAGMA integrity_check').fetchone()[0]}
    finally:
        con.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('paquete',type=Path)
    parser.add_argument('--db',type=Path,required=True)
    args = parser.parse_args()
    if not args.db.is_file():
        parser.error('La base debe existir')
    print(json.dumps(importar(args.paquete,args.db),ensure_ascii=False,indent=2))
