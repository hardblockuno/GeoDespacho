const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "data", "exposure_index.json");

const SOURCES = {
  critical: {
    file: "estructuras_criticas.geojson",
    label: "Infraestructura critica",
    nameKeys: ["nombre", "NOMBRE", "Nombre", "name", "TIPO", "tipo"],
    propertyKeys: ["tipo", "TIPO", "criticidad", "CRITICIDAD", "estado", "ESTADO", "comuna", "COMUNA"],
  },
  properties: {
    file: "predios_empresa.geojson",
    label: "Predios empresa",
    nameKeys: ["nombre", "NOM_PREDIO", "PREDIO", "NOMBRE", "Name", "CODIGO", "CD_PREDIO"],
    propertyKeys: ["EMPRESA", "NOM_PREDIO", "PREDIO", "CD_PREDIO", "CODIGO", "COMUNA", "COMUNA_", "SUPERFICIE", "SUP_MED"],
  },
  localities: {
    file: "localidades.geojson",
    label: "Viviendas / localidades",
    nameKeys: ["nombre", "NOMBRE", "LOCALIDAD", "Localidad", "NOM_LOC", "SECTOR"],
    propertyKeys: ["nombre", "NOMBRE", "LOCALIDAD", "Localidad", "NOM_LOC", "SECTOR", "COMUNA"],
  },
};

function readGeoJson(file) {
  const fullPath = path.join(ROOT, "data", file);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function roundCoord(value) {
  return Number(Number(value).toFixed(6));
}

function isMeaningfulName(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  const normalized = text.toLowerCase();
  return !["<null>", "null", "undefined", "-", "s/i", "sin informacion", "localities"].includes(normalized);
}

function firstMeaningfulProperty(properties, keys) {
  for (const key of keys) {
    if (isMeaningfulName(properties[key])) {
      return String(properties[key]).trim();
    }
  }
  return null;
}

function compactProperties(properties, keys) {
  return Object.fromEntries(
    keys
      .filter((key) => properties[key] !== undefined && properties[key] !== null && String(properties[key]).trim() !== "")
      .map((key) => [key, properties[key]]),
  );
}

function visitCoordinates(geometry, visitor) {
  if (!geometry) return;

  if (geometry.type === "Point") {
    visitor(geometry.coordinates);
    return;
  }

  if (geometry.type === "GeometryCollection") {
    (geometry.geometries || []).forEach((child) => visitCoordinates(child, visitor));
    return;
  }

  const visitNode = (node) => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === "number" && typeof node[1] === "number") {
      visitor(node);
      return;
    }
    node.forEach(visitNode);
  };

  visitNode(geometry.coordinates);
}

function summarizeGeometry(geometry) {
  const stats = {
    minLng: Number.POSITIVE_INFINITY,
    minLat: Number.POSITIVE_INFINITY,
    maxLng: Number.NEGATIVE_INFINITY,
    maxLat: Number.NEGATIVE_INFINITY,
    sumLng: 0,
    sumLat: 0,
    count: 0,
  };

  visitCoordinates(geometry, ([lng, lat]) => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    stats.minLng = Math.min(stats.minLng, lng);
    stats.minLat = Math.min(stats.minLat, lat);
    stats.maxLng = Math.max(stats.maxLng, lng);
    stats.maxLat = Math.max(stats.maxLat, lat);
    stats.sumLng += lng;
    stats.sumLat += lat;
    stats.count += 1;
  });

  if (!stats.count) return null;

  return {
    bbox: [stats.minLng, stats.minLat, stats.maxLng, stats.maxLat].map(roundCoord),
    lat: roundCoord(stats.sumLat / stats.count),
    lng: roundCoord(stats.sumLng / stats.count),
    vertices: stats.count,
  };
}

function buildLayer(layerType, config) {
  const geojson = readGeoJson(config.file);
  const items = [];

  (geojson.features || []).forEach((feature, index) => {
    const geometrySummary = summarizeGeometry(feature.geometry);
    if (!geometrySummary) return;

    const properties = feature.properties || {};
    const name = firstMeaningfulProperty(properties, config.nameKeys);
    const label = name || `${config.label} ${String(index + 1).padStart(4, "0")}`;

    items.push({
      id: `${layerType}-${index + 1}`,
      name,
      label,
      geometryType: feature.geometry?.type || "Unknown",
      ...geometrySummary,
      properties: compactProperties(properties, config.propertyKeys),
    });
  });

  return {
    label: config.label,
    sourceFile: config.file,
    featureCount: items.length,
    items,
  };
}

const index = {
  type: "GeoDespachoExposureIndex",
  version: 1,
  generatedAt: new Date().toISOString(),
  precision: "bbox-centroid",
  radiusKm: 5,
  layers: Object.fromEntries(Object.entries(SOURCES).map(([layerType, config]) => [layerType, buildLayer(layerType, config)])),
};

fs.writeFileSync(OUTPUT, JSON.stringify(index));
console.log(`Indice de exposicion escrito en ${path.relative(ROOT, OUTPUT)}`);
