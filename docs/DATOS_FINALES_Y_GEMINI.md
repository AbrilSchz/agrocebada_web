# Datos finales y conexión con Gemini

## Activar el chat

En Render, abre el servicio → Environment y configura:

```
GEMINI_API_KEY=tu_clave_privada
GEMINI_MODEL=gemini-3.5-flash-lite
LLM_MODE=live
DB_PATH=db/parcelas_final.sqlite
READ_ONLY=1
DEMO_MODE=0
```

Crea la clave en https://aistudio.google.com/app/apikey y guárdala únicamente en
el entorno del servidor. No la envíes por el chat ni la pongas en public/.
Guarda la configuración y vuelve a desplegar. El código no puede validar una
clave que todavía no se ha configurado. /api/chat/config informa mode y configured
sin revelar la clave; eso comprueba configuración, no acceso real a Google.
Prueba después «Explica las limitaciones de este modelo»: una respuesta marcada
IA comprueba la conexión. «Abre la tabla» puede ser un atajo local sin llamada.

Localmente: npm ci, copia .env.example a .env, completa la clave y ejecuta
npm run start:local. .env está excluido de Git. LLM_MODE=mock sirve para pruebas
sin Google y no convierte los datos en sintéticos.

Errores: 401/403 → clave/permisos; 404 → modelo no disponible para esa clave;
429 → cuota del proyecto; 504 → tiempo de espera. Consulta los modelos vigentes
en https://ai.google.dev/gemini-api/docs/models y las claves en
https://ai.google.dev/gemini-api/docs/api-key.

## Integración del ZIP recibido

El paquete original queda en modelos/mediciones_corregidas/paquete.zip y su
huella SHA-256 y recuentos en importacion.json. Se importan 40,431 mediciones,
32 capas y 197 parcelas: ningún ID desconocido ni clave duplicada. Se conservan
las 4,531 mediciones previas no sintéticas: total 44,962. Las 1,188 filas retiradas
pertenecían exclusivamente a capas descritas como «DEMO: valores aleatorios».
No se eliminan capas solo por llamarse NIR o NDVI. Las predicciones del ensamble,
la geometría y los contextos del modelo se conservan.

Las nuevas capas aparecen en el selector, con fechas para colorear el mapa;
la ficha muestra sus mediciones y unidades, y el chat recibe esas mediciones.
El rendimiento del modelo sigue siendo un resultado cerrado, no una serie anual.

Se conservan literalmente las unidades y agregaciones pendientes de confirmar:
que el archivo sea final no demuestra que toda su documentación esté completa.
No se atribuyen unidades ni métodos de agregación inventados.

La auditoría SHAP incluida se refiere a hgb-integrado-v1, campaña 2025; NO se
mezcla con ensamble-50-50-v1. Su indicador OOF_probable es una inferencia, no
prueba de validación. La plantilla Python no se ejecuta ni reentrena el modelo.

## Reproducción y recuperación

Con el servidor detenido, guarda una copia consistente de la base (sqlite backup)
y ejecuta:

```
python3 scripts/importar_mediciones_finales.py modelos/mediciones_corregidas/paquete.zip --db db/parcelas_final.sqlite
```

La importación valida antes de escribir y usa una transacción. Reimportar actualiza
las mismas claves sin duplicar. Valores vacíos o no finitos se rechazan; nunca se
rellenan con cero. Filas no incluidas en el paquete se conservan. No modifica
resultados ni SHAP. Solo añade fuente/agregacion si el esquema antiguo no las tiene.
Para recuperar, con el servidor detenido restaura el respaldo previo o la versión
anterior de la base desde Git. No se importa durante el arranque de Render.

## Interfaz

Chat más alto por defecto. El separador horizontal permite ajustar su altura;
el vertical cambia el ancho mapa/dashboard con mínimo de 320 px por panel
(o la mitad disponible en ventanas estrechas). Las flechas ajustan, Inicio/Fin
van a los límites. El ancho se recuerda en el navegador. En móvil se conserva
la disposición apilada. A partir de zoom 14 los municipios no capturan clics ni
teclado; para regresar se usa el control explícito de vista general.
