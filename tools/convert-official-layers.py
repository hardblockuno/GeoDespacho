import argparse
import json
import re
import unicodedata
import zipfile
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree as ET


def slug(value):
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def key_slug(value):
    return slug(value).replace("_", "")


def local_name(tag):
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def child_text(element, name):
    for child in list(element):
        if local_name(child.tag) == name and child.text:
            return child.text.strip()
    return ""


def descendants(element, name):
    return [node for node in element.iter() if local_name(node.tag) == name]


def read_kml(path):
    if path.suffix.lower() == ".kmz":
        with zipfile.ZipFile(path) as archive:
            kml_names = [name for name in archive.namelist() if name.lower().endswith(".kml")]
            if not kml_names:
                raise ValueError(f"El KMZ no contiene KML: {path.name}")
            with archive.open(kml_names[0]) as handle:
                text = handle.read().decode("utf-8-sig", errors="replace")
    else:
        text = path.read_text(encoding="utf-8-sig", errors="replace")

    if "xsi:" in text and "xmlns:xsi=" not in text:
        text = re.sub(
            r"<kml\s+",
            '<kml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ',
            text,
            count=1,
        )
    return text


class TableCellParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_row = False
        self.in_cell = False
        self.current = []
        self.current_row = []
        self.cells = []
        self.rows = []

    def handle_starttag(self, tag, attrs):
        tag_name = tag.lower()
        if tag_name == "tr":
            self.in_row = True
            self.current_row = []
        if tag_name in {"td", "th"}:
            self.in_cell = True
            self.current = []

    def handle_endtag(self, tag):
        tag_name = tag.lower()
        if tag_name in {"td", "th"} and self.in_cell:
            value = " ".join("".join(self.current).split())
            if value:
                self.cells.append(value)
                if self.in_row:
                    self.current_row.append(value)
            self.in_cell = False
            self.current = []
        if tag_name == "tr" and self.in_row:
            if self.current_row:
                self.rows.append(self.current_row)
            self.in_row = False
            self.current_row = []

    def handle_data(self, data):
        if self.in_cell:
            self.current.append(data)


def parse_description_table(description):
    if not description:
        return {}

    parser = TableCellParser()
    try:
        parser.feed(description)
    except Exception:
        return {}

    props = {}
    for row in parser.rows:
        if len(row) == 2:
            key, value = row
            if key and value and key.lower() != value.lower():
                props[key] = value
        elif len(row) > 2:
            for index in range(0, len(row) - 1, 2):
                key = row[index].strip()
                value = row[index + 1].strip()
                if key and value and key.lower() != value.lower():
                    props[key] = value
    return props


def get_properties(placemark):
    properties = {}
    name = child_text(placemark, "name")
    if name:
        properties["nombre"] = name

    description = child_text(placemark, "description")
    properties.update(parse_description_table(description))

    for data in descendants(placemark, "Data"):
        key = data.attrib.get("name")
        value = child_text(data, "value")
        if key and value:
            properties[key] = value

    for data in descendants(placemark, "SimpleData"):
        key = data.attrib.get("name")
        value = (data.text or "").strip()
        if key and value:
            properties[key] = value

    return properties


def get_property(properties, *names):
    wanted = {key_slug(name) for name in names}
    for key, value in properties.items():
        if key_slug(key) in wanted and value not in (None, ""):
            return value
    return ""


def set_property(properties, name, value):
    if value in (None, ""):
        return
    for key in list(properties.keys()):
        if key.lower() == name.lower() and key != name:
            properties.pop(key, None)
    properties[name] = value


def parse_coordinate_text(text):
    coordinates = []
    for pair in (text or "").strip().split():
        parts = pair.split(",")
        if len(parts) < 2:
            continue
        try:
            lng = float(parts[0])
            lat = float(parts[1])
        except ValueError:
            continue
        coordinates.append([lng, lat])
    return coordinates


def close_ring(coordinates):
    if coordinates and coordinates[0] != coordinates[-1]:
        return coordinates + [coordinates[0]]
    return coordinates


def polygon_geometry(polygon):
    rings = []
    outer_nodes = descendants(polygon, "outerBoundaryIs")
    if outer_nodes:
        coord_nodes = descendants(outer_nodes[0], "coordinates")
        if coord_nodes:
            ring = close_ring(parse_coordinate_text(coord_nodes[0].text or ""))
            if len(ring) >= 4:
                rings.append(ring)

    for inner in descendants(polygon, "innerBoundaryIs"):
        coord_nodes = descendants(inner, "coordinates")
        if coord_nodes:
            ring = close_ring(parse_coordinate_text(coord_nodes[0].text or ""))
            if len(ring) >= 4:
                rings.append(ring)

    if not rings:
        return None
    return {"type": "Polygon", "coordinates": rings}


def get_geometry(placemark):
    geometries = []

    for point in descendants(placemark, "Point"):
        coord_nodes = descendants(point, "coordinates")
        if coord_nodes:
            coords = parse_coordinate_text(coord_nodes[0].text or "")
            if coords:
                geometries.append({"type": "Point", "coordinates": coords[0]})

    for line in descendants(placemark, "LineString"):
        coord_nodes = descendants(line, "coordinates")
        if coord_nodes:
            coords = parse_coordinate_text(coord_nodes[0].text or "")
            if len(coords) >= 2:
                geometries.append({"type": "LineString", "coordinates": coords})

    for polygon in descendants(placemark, "Polygon"):
        geometry = polygon_geometry(polygon)
        if geometry:
            geometries.append(geometry)

    if len(geometries) == 1:
        return geometries[0]
    if len(geometries) > 1:
        return {"type": "GeometryCollection", "geometries": geometries}
    return None


def layer_kind_for_file(file_name):
    name = slug(file_name)
    checks = [
        ("brigadas", "brigades"),
        ("deteccion|torre|camara", "towers"),
        ("personal_tecnico|personal", "technical"),
        ("snaspe|area_protegida|areas_protegidas", "protected"),
        ("infraestructura|infraestructuras", "critical"),
        ("fuentes_de_agua|fuente_de_agua", "water_sources"),
        ("hidrografia|hidrografia", "hydrography"),
        ("camino|caminos", "roads"),
        ("linea_electrica|electrica", "powerlines"),
        ("localidad|localidades", "localities"),
        ("comuna|comunas", "communes"),
        ("predio|predios", "properties"),
        ("roles|rol", "roles"),
        ("recurso|recursos", "resources"),
    ]
    for pattern, layer_kind in checks:
        if re.search(pattern, name):
            return layer_kind
    return "general"


def normalize_properties(properties, layer_kind):
    title = (
        get_property(properties, "nombre", "NOMBRE", "Name", "NOM_REGION", "COMUNA", "LOCALIDAD", "TIPO")
        or properties.get("nombre")
        or layer_kind
    )
    set_property(properties, "nombre", title)
    set_property(properties, "layer_kind", layer_kind)

    if layer_kind == "brigades":
        estado = get_property(properties, "Estado", "ESTADO", "estado") or "Operativa"
        dotacion = get_property(properties, "Dotacion", "Dotación", "DOTACION")
        set_property(properties, "base", get_property(properties, "Ubicacion", "Ubicación", "COMUNA", "Comuna"))
        set_property(properties, "tipo", get_property(properties, "Tipo Unidad", "Clase", "TIPO", "tipo") or "Brigada")
        set_property(properties, "estado", estado)
        set_property(properties, "disponible", not re.search(r"no|mantencion|mantenimiento|inactiva", estado.lower()))
        set_property(properties, "personal", int(dotacion) if str(dotacion).isdigit() else 0)
        set_property(properties, "velocidad_kmh", 50)
        set_property(properties, "alistamiento_min", 10)
    elif layer_kind == "towers":
        set_property(properties, "codigo", properties.get("nombre"))
        set_property(properties, "estado", get_property(properties, "estado", "ESTADO") or "Operativa")
    elif layer_kind == "critical":
        set_property(properties, "tipo", get_property(properties, "TIPO", "tipo") or "Infraestructura")
        set_property(properties, "criticidad", get_property(properties, "CRITICIDAD", "criticidad") or "Alta")
        set_property(properties, "estado", get_property(properties, "estado", "ESTADO") or "Vigente")
    elif layer_kind == "water_sources":
        set_property(properties, "tipo", get_property(properties, "TIPO", "tipo") or "Fuente de agua")
        set_property(properties, "estado", get_property(properties, "estado", "ESTADO") or "Disponible")
    elif layer_kind == "technical":
        set_property(properties, "tipo", get_property(properties, "TIPO", "tipo") or "Personal tecnico")
        set_property(properties, "estado", get_property(properties, "estado", "ESTADO") or "Vigente")

    return properties


def geometry_type(geometry):
    if not geometry:
        return "None"
    if geometry["type"] != "GeometryCollection":
        return geometry["type"]
    return "GeometryCollection"


def convert_file(path, output_dir):
    layer_kind = layer_kind_for_file(path.name)
    root = ET.fromstring(read_kml(path))
    features = []
    geometry_types = {}

    for placemark in descendants(root, "Placemark"):
        geometry = get_geometry(placemark)
        if not geometry:
            continue
        properties = normalize_properties(get_properties(placemark), layer_kind)
        features.append({"type": "Feature", "properties": properties, "geometry": geometry})
        geometry_types[geometry_type(geometry)] = geometry_types.get(geometry_type(geometry), 0) + 1

    payload = {
        "type": "FeatureCollection",
        "name": slug(path.stem),
        "source_file": path.name,
        "layer_kind": layer_kind,
        "converted_at": datetime.now().isoformat(timespec="seconds"),
        "features": features,
    }
    output_name = f"{slug(path.stem)}.geojson"
    output_path = output_dir / output_name
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return {
        "source": path.name,
        "output": output_name,
        "layer_kind": layer_kind,
        "features": len(features),
        "geometry_types": geometry_types,
        "bytes": output_path.stat().st_size,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", default="capas_oficiales_2025_2026/originales")
    parser.add_argument("--output-dir", default="capas_oficiales_2025_2026/geojson")
    args = parser.parse_args()

    source_dir = Path(args.source_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest = []
    for path in sorted(source_dir.iterdir(), key=lambda item: item.name.lower()):
        if path.suffix.lower() not in {".kml", ".kmz"}:
            continue
        try:
            result = convert_file(path, output_dir)
        except Exception as error:
            result = {
                "source": path.name,
                "output": None,
                "layer_kind": layer_kind_for_file(path.name),
                "features": 0,
                "error": str(error).splitlines()[0],
            }
        manifest.append(result)
        status = result["output"] or "ERROR"
        print(f"{path.name} -> {status} ({result['features']} features, {result['layer_kind']})")

    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
