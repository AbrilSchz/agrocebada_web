import contextlib
import copy
import csv
import hashlib
import io
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
from types import SimpleNamespace
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import importar_libretas as importer


class FinalArtifactsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.files = importer.package_files(ROOT/'modelos/libretas_finales')

    def modify(self, files, name, change):
        name=name.lower()
        reader=csv.DictReader(io.StringIO(files[name].decode('utf-8-sig')))
        headers=reader.fieldnames; rows=list(reader)
        change(rows)
        out=io.StringIO(); writer=csv.DictWriter(out,fieldnames=headers)
        writer.writeheader();writer.writerows(rows)
        files[name]=out.getvalue().encode()

    def test_cohorts_and_provenance(self):
        tables,contexts,summary=importer.prepare(self.files)
        rows={r['ID_POLIGONO']:r for r in tables['resultados']}
        self.assertEqual((summary['parcelas'],summary['entrenamiento'],summary['prediccion']),(197,138,59))
        self.assertEqual(rows['AGC_001']['tipo_prediccion'],'oof')
        self.assertEqual(rows['AGC_003']['tipo_prediccion'],'final')
        self.assertIsNone(rows['AGC_003']['observado'])
        self.assertNotIn('fold_id',rows['AGC_001'])
        self.assertNotIn('contribuciones',tables)
        self.assertEqual(len(contexts['AGC_003']['shap_hgb_parcial']),3)
        self.assertNotIn('shap_hgb_parcial',contexts['AGC_001'])
        self.assertEqual(len(tables['capas']),5)
        self.assertEqual(len(tables['mediciones']),4531)

    def test_duplicate_id_rejected(self):
        files=dict(self.files)
        self.modify(files,'05_final/dashboard_parcelas_prediccion.csv',lambda rows:rows.append(copy.deepcopy(rows[0])))
        with self.assertRaisesRegex(ValueError,'ID repetido'):importer.prepare(files)

    def test_ensemble_mismatch_rejected(self):
        files=dict(self.files)
        self.modify(files,'05_final/dashboard_parcelas_prediccion.csv',lambda rows:rows[0].update(pred_knn='99'))
        with self.assertRaisesRegex(ValueError,'ensamble final'):importer.prepare(files)

    def test_interval_mismatch_rejected(self):
        files=dict(self.files)
        self.modify(files,'05_final/dashboard_parcelas_prediccion.csv',lambda rows:rows[0].update(intervalo80_sup='99'))
        with self.assertRaisesRegex(ValueError,'intervalo superior'):importer.prepare(files)

    def test_wrong_neighbor_rejected(self):
        files=dict(self.files)
        self.modify(files,'05_final/dashboard_parcelas_prediccion.csv',lambda rows:rows[0].update(vecino1_id='AGC_003'))
        with self.assertRaisesRegex(ValueError,'no es una referencia'):importer.prepare(files)

    def test_fold_metric_mismatch_rejected(self):
        files=dict(self.files)
        self.modify(files,'03_validacion/resultados_validacion.csv',lambda rows:rows[0].update(MAE_fold_media='99'))
        with self.assertRaisesRegex(ValueError,'Media por fold'):importer.prepare(files)

    def test_nonfinite_value_rejected(self):
        files=dict(self.files)
        self.modify(files,'05_final/dashboard_parcelas_prediccion.csv',lambda rows:rows[0].update(pred_knn='NaN'))
        with self.assertRaisesRegex(ValueError,'NaN'):importer.prepare(files)

    def test_reimport_preserves_geometry_and_other_data(self):
        before=hashlib.sha256((ROOT/'db/parcelas_master.sqlite').read_bytes()).hexdigest()
        with tempfile.TemporaryDirectory() as tmp:
            output=Path(tmp)/'results.sqlite'
            args=SimpleNamespace(archivo=ROOT/'modelos/libretas_finales',base=ROOT/'db/parcelas_master.sqlite',salida=output,validar=False)
            with contextlib.redirect_stdout(io.StringIO()):importer.run(args)
            with sqlite3.connect(output) as db:
                db.execute("INSERT INTO datos VALUES ('AGC_001','externo','','x',0)")
                self.assertEqual(db.execute('select count(*) from parcelas_resultados').fetchone()[0],197)
                self.assertEqual(db.execute('select count(*) from parcelas_contribuciones').fetchone()[0],0)
                self.assertEqual(db.execute('select count(*) from parcelas_resultados where observado is null').fetchone()[0],59)
            with contextlib.redirect_stdout(io.StringIO()):report=importer.run(args)
            self.assertTrue(Path(report['respaldo']).is_file())
            with sqlite3.connect(output) as db,sqlite3.connect(ROOT/'db/parcelas_master.sqlite') as base:
                self.assertEqual(db.execute('select * from parcelas order by ID_POLIGONO').fetchall(),base.execute('select * from parcelas order by ID_POLIGONO').fetchall())
                self.assertEqual(db.execute("select valor from datos where capa_id='externo'").fetchone()[0],0)
                self.assertEqual(db.execute('select count(*) from modelo_mediciones').fetchone()[0],4531)
                self.assertEqual(db.execute('pragma integrity_check').fetchone()[0],'ok')
        self.assertEqual(before,hashlib.sha256((ROOT/'db/parcelas_master.sqlite').read_bytes()).hexdigest())

    def test_invalid_source_does_not_replace_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            output=Path(tmp)/'results.sqlite'
            output.write_bytes(b'resultado anterior')
            args=SimpleNamespace(archivo=Path(tmp)/'missing.zip',base=ROOT/'db/parcelas_master.sqlite',salida=output,validar=False)
            with self.assertRaises(OSError):importer.run(args)
            self.assertEqual(output.read_bytes(),b'resultado anterior')


if __name__=='__main__':unittest.main()
