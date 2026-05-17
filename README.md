# GeoDespacho

Aplicacion web GIS estatica para apoyo operacional preliminar de focos de incendios forestales.

## Abrir localmente en Windows

Haz doble clic en:

```text
abrir-sitio.bat
```

El lanzador abre el sitio. Si el servidor local no esta activo, lo inicia automaticamente y luego abre:

```text
http://127.0.0.1:8000/
```

No abras `index.html` directamente con doble clic: el navegador puede bloquear la carga de archivos GeoJSON locales.

## Publicar en GitHub Pages

Sube estos archivos a la raiz del repositorio:

```text
index.html
style.css
app.js
data/
```

Luego activa GitHub Pages desde la rama principal. No requiere build.

## Capas permanentes

Las capas que quedan publicadas de forma permanente en GitHub Pages viven en:

```text
data/brigadas.geojson
data/torres.geojson
data/snaspe.geojson
data/estructuras_criticas.geojson
data/fuentes_agua.geojson
data/comunas.geojson
data/personal_tecnico.geojson
data/personal_tecnico_puntos.geojson
data/hidrografia.geojson
data/caminos.geojson
data/predios_empresa.geojson
data/localidades.geojson
data/lineas_electricas.geojson
```

Para actualizarlas, exporta desde QGIS a GeoJSON, reemplaza el archivo correspondiente, haz commit y push al repositorio.

## Capas oficiales 2025

Las capas oficiales originales se guardan sin modificar en:

```text
capas_oficiales_2025/originales/
```

Las versiones convertidas para web quedan en:

```text
capas_oficiales_2025/geojson/
```

Para convertir nuevamente KML/KMZ oficiales a GeoJSON:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\convert-official-layers.ps1
```

El conversor detecta:

```text
Brigadas 2024-2025.kml -> brigadas_2024_2025.geojson
Recursos de detección 2024-2025.kml -> recursos_de_deteccion_2024_2025.geojson
Personal tecnico.kmz -> personal_tecnico.geojson
```

Actualmente `data/brigadas.geojson`, `data/torres.geojson` y `data/personal_tecnico.geojson` ya usan esas capas oficiales convertidas. La capa `Personal tecnico` inicia apagada porque contiene polígonos más pesados.

## Capas oficiales 2025-2026

La nueva temporada queda preparada en:

```text
capas_oficiales_2025_2026/originales/
capas_oficiales_2025_2026/geojson/
capas_oficiales_2025_2026/metadata/
```

Copia los KML/KMZ originales 2025-2026 en `originales/` y los Excel/CSV de respaldo en `metadata/`. Para convertirlos a GeoJSON:

```powershell
C:\Users\lucas\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe tools\convert-official-layers.py --source-dir capas_oficiales_2025_2026\originales --output-dir capas_oficiales_2025_2026\geojson
```

Capas convertidas e integradas como oficiales activas:

```text
Recurso.kmz -> capas_oficiales_2025_2026/geojson/recurso.geojson
recurso_brigadas.geojson -> data/brigadas.geojson
2. SNASPE Region de la Araucania.kmz -> data/snaspe.geojson
9. Infraestructuras.kmz -> data/estructuras_criticas.geojson
7. Fuentes de Agua 2025.kmz -> data/fuentes_agua.geojson
6. Comunas.kmz -> data/comunas.geojson
```

`Recurso.kmz` mezcla brigadas con torres y otros puntos. El script `tools/split-resource-layer.py` separa solo las brigadas despachables con prefijos `BC`, `BNC` y `BHC` para que el calculo de despacho no asigne torres por error.

Capas oficiales disponibles bajo carga diferida desde el panel:

```text
15. Hidrografia Region de la Araucania.kmz -> data/hidrografia.geojson
8. Caminos.kmz -> data/caminos.geojson
5. Predios de empresa 2024.kmz -> data/predios_empresa.geojson
4. Localidades.kmz -> data/localidades.geojson
11. Linea electrica IX.kmz -> data/lineas_electricas.geojson
```

`3. Roles_IX.kmz` queda convertido en `capas_oficiales_2025_2026/geojson/3_roles_ix.geojson`, pero no se carga automaticamente porque genera un GeoJSON de mas de 200 MB. Para usarlo en produccion conviene simplificarlo, filtrarlo por comuna/area o publicarlo como teselas vectoriales.

## Rendimiento

La web carga al inicio solo las capas necesarias para operar:

```text
brigadas
torres
comunas como borde contextual
personal tecnico optimizado como puntos
```

Las capas no visibles por defecto se cargan bajo demanda cuando el usuario las activa en el panel.

`data/personal_tecnico.geojson` conserva la capa oficial completa. La app usa `data/personal_tecnico_puntos.geojson` para el panel operativo porque evita cargar poligonos comunales innecesarios al inicio. Si se actualiza la capa oficial completa, regenera la version liviana con:

```powershell
C:\Users\lucas\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tools\build-technical-points.js
```

El analisis de contexto de 5 km usa:

```text
data/exposure_index.json
```

Ese indice resume infraestructura critica, predios y localidades con bbox/centroide, evitando descargar y analizar todos los GeoJSON pesados en cada foco. Cuando se actualicen `data/estructuras_criticas.geojson`, `data/predios_empresa.geojson` o `data/localidades.geojson`, regenera el indice con:

```powershell
C:\Users\lucas\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tools\build-exposure-index.js
```

Antes de reemplazar las capas activas se guardo respaldo en:

```text
capas_oficiales_2025_2026/metadata/backup_data_antes_2025_2026/
```

## POA

El Excel POA original se conserva en:

```text
capas_oficiales_2025/metadata/POA 01-10-2024-2025.xlsx
```

Para generar CSV limpios y cruzar datos POA con las capas activas:

```powershell
C:\Users\lucas\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe tools\process-poa.py
```

Esto genera:

```text
capas_oficiales_2025/metadata/poa_terrestre_2024_2025.csv
capas_oficiales_2025/metadata/poa_deteccion_recursos_2024_2025.csv
capas_oficiales_2025/metadata/poa_deteccion_personal_2024_2025.csv
capas_oficiales_2025/metadata/poa_aereo_2024_2025.csv
capas_oficiales_2025/metadata/poa_procesamiento_resumen.json
```

El cruce actual enriquece `data/brigadas.geojson` con dotacion, proveedor, patente y plan desde el POA. Tambien intenta enriquecer `data/torres.geojson` con comuna, fechas y nomina de deteccion cuando el nombre coincide.

## Carga temporal desde la web

El panel "Cargar capa" permite visualizar archivos locales sin modificar el repositorio:

```text
.geojson
.json
.kml
.kmz
.csv
```

Los CSV deben incluir columnas de coordenadas con nombres como:

```text
latitud,longitud
lat,lon
y,x
```

Si cargas una capa como "Brigadas", sus puntos tambien participan en el calculo de brigada mas cercana durante esa sesion.

## Rutas viales

El despacho usa primero una preseleccion por distancia directa y luego consulta ruta vial para las brigadas candidatas mas cercanas. La ruta se solicita a OSRM con geometria GeoJSON y se dibuja sobre el mapa.

Si el servicio externo de rutas no responde, la web mantiene el fallback anterior: distancia directa y linea punteada.

Para uso operacional real conviene reemplazar el servidor publico de OSRM por una API propia o institucional.

## Focos activos

La web permite mantener varios focos activos en el mapa. Cada foco queda registrado con un ID propio, coordenadas GMS, prioridad, brigada sugerida, ETA y ruta.

Desde el panel "Focos activos" se puede:

```text
seleccionar un foco
recalcular su despacho
eliminar un foco por falso reporte o cierre operacional
eliminar todos los focos activos
```

El panel "Brigada sugerida" siempre muestra el despacho del foco seleccionado, por lo que se pueden analizar varios focos de forma separada sin perder el resto del registro temporal.

## Coordenadas operacionales

El formulario de despacho usa GMS como formato principal, pensado para operacion de central:

```text
Latitud: 37° 50' 44.16" S
Longitud: 72° 21' 22.32" O
```

La app convierte internamente a decimal para Leaflet, OSRM y GeoJSON. El modo decimal queda disponible como apoyo tecnico.

Cuando se hace clic en el mapa o se carga el foco demo, la web rellena automaticamente ambos formatos.
