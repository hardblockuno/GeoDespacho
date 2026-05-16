# Proyecto GeoDespacho

## Objetivo

Aplicacion web GIS para visualizacion y apoyo operacional preliminar de focos de incendios forestales en la Region de La Araucania, Chile.

## Tecnologias

- HTML
- CSS
- JavaScript
- Leaflet
- GeoJSON

## Funciones actuales

- Mapa Leaflet con base estandar y satelital.
- Panel operacional lateral.
- Capas de brigadas, torres, personal tecnico y capas oficiales opcionales.
- Ingreso de coordenadas en GMS y decimal.
- Registro de multiples focos activos.
- Calculo de brigada cercana, ETA y ruta vial.
- Radio de contexto de 5 km.
- Analisis de infraestructura, localidades y predios cercanos.
- Rumbo/azimut hacia torres cercanas.
- Flecha de viento referencial.

## Publicacion

El sitio es estatico y esta preparado para GitHub Pages desde la raiz del repositorio.

## Cuidado con datos

Todo archivo dentro de `data/` queda expuesto si el sitio se publica en GitHub Pages. Antes de publicar en abierto, revisar si alguna capa oficial contiene datos sensibles.
