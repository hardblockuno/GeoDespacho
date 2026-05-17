const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const INPUT = path.join(ROOT, "data", "personal_tecnico.geojson");
const OUTPUT = path.join(ROOT, "data", "personal_tecnico_puntos.geojson");

const source = JSON.parse(fs.readFileSync(INPUT, "utf8"));
const features = (source.features || []).filter((feature) => feature.geometry?.type === "Point");

const optimized = {
  type: "FeatureCollection",
  name: "personal_tecnico_puntos",
  source_file: "personal_tecnico.geojson",
  layer_kind: "technical",
  generated_at: new Date().toISOString(),
  features,
};

fs.writeFileSync(OUTPUT, JSON.stringify(optimized));
console.log(`Capa optimizada escrita en ${path.relative(ROOT, OUTPUT)} (${features.length} puntos)`);
