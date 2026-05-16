import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "capas_oficiales_2025_2026" / "geojson" / "recurso.geojson"
BRIGADES_OUTPUT = ROOT / "capas_oficiales_2025_2026" / "geojson" / "recurso_brigadas.geojson"
OTHER_OUTPUT = ROOT / "capas_oficiales_2025_2026" / "geojson" / "recurso_no_despacho.geojson"
ACTIVE_BRIGADES = ROOT / "data" / "brigadas.geojson"


DISPATCH_PREFIX = re.compile(r"^(BC|BNC|BHC)-", re.IGNORECASE)


def is_dispatch_brigade(feature):
    name = str(feature.get("properties", {}).get("nombre", "")).strip()
    return bool(DISPATCH_PREFIX.match(name))


def normalize_brigade(feature):
    props = feature.setdefault("properties", {})
    props["layer_kind"] = "brigades"
    props["tipo"] = props.get("tipo") or "Brigada"
    props["base"] = props.get("base") or "Base no informada"
    props["estado"] = props.get("estado") or "Disponible"
    props["disponible"] = True
    props["personal"] = int(props.get("personal") or 0)
    props["velocidad_kmh"] = float(props.get("velocidad_kmh") or 50)
    props["alistamiento_min"] = float(props.get("alistamiento_min") or 10)
    props["temporada"] = "2025-2026"
    return feature


def feature_collection(source, layer_kind, features):
    return {
        "type": "FeatureCollection",
        "name": layer_kind,
        "source_file": source.get("source_file", "Recurso.kmz"),
        "layer_kind": layer_kind,
        "features": features,
    }


def save(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    brigades = []
    other = []

    for feature in source.get("features", []):
        if is_dispatch_brigade(feature):
            brigades.append(normalize_brigade(feature))
        else:
            other.append(feature)

    brigades_payload = feature_collection(source, "brigades", brigades)
    other_payload = feature_collection(source, "resources_non_dispatch", other)

    save(BRIGADES_OUTPUT, brigades_payload)
    save(OTHER_OUTPUT, other_payload)
    save(ACTIVE_BRIGADES, brigades_payload)

    print(json.dumps({
        "source": str(SOURCE.relative_to(ROOT)),
        "brigades": len(brigades),
        "non_dispatch_resources": len(other),
        "active_output": str(ACTIVE_BRIGADES.relative_to(ROOT)),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
