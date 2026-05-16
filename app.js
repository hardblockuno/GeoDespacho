const DATASETS = {
  brigades: "./data/brigadas.geojson",
  towers: "./data/torres.geojson",
  protected: "./data/snaspe.geojson",
  critical: "./data/estructuras_criticas.geojson",
  water_sources: "./data/fuentes_agua.geojson",
  communes: "./data/comunas.geojson",
  technical: "./data/personal_tecnico.geojson",
};

const BASE_LAYERS = {
  standard: {
    label: "Mapa",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  satellite: {
    label: "Satelital",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 19,
      attribution:
        "Tiles &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    },
  },
};

const OPTIONAL_DATASETS = {
  hydrography: "./data/hidrografia.geojson",
  roads: "./data/caminos.geojson",
  properties: "./data/predios_empresa.geojson",
  localities: "./data/localidades.geojson",
  powerlines: "./data/lineas_electricas.geojson",
};

const PRIORITY_FACTORS = {
  Critica: 0.9,
  Alta: 1,
  Media: 1.12,
  Observacion: 1.25,
};

const ROUTING = {
  endpoint: "https://router.project-osrm.org/route/v1/driving",
  candidateLimit: 6,
  timeoutMs: 9000,
};

const EXPOSURE_RADIUS_KM = 5;
const WIND_VECTOR_LENGTH_KM = 4.2;
const LOCATION_LABEL_BEARING = 280;
const LOCATION_LABEL_DISTANCE_FACTOR = 1.02;
const TOWER_BEARING_LIMIT = 4;
const TOWER_BEARING_RADIUS_KM = 35;
const EXPOSURE_DATASETS = {
  critical: {
    label: "Infraestructura critica",
    source: "loaded",
    limit: 5,
  },
  properties: {
    label: "Predios empresa",
    source: "optional",
    limit: 5,
  },
  localities: {
    label: "Viviendas / localidades",
    source: "optional",
    limit: 5,
  },
};

const state = {
  map: null,
  data: {
    brigades: null,
    towers: null,
    protected: null,
    critical: null,
    water_sources: null,
    communes: null,
    technical: null,
    hydrography: null,
    roads: null,
    properties: null,
    localities: null,
    powerlines: null,
  },
  analysisLoads: {},
  layers: {},
  baseLayers: {},
  activeBaseLayer: "standard",
  boundaryLayer: null,
  importedLayers: [],
  nextImportId: 1,
  incidents: [],
  nextIncidentId: 1,
  activeIncidentId: null,
  incidentLayer: null,
  coordinateMode: "dms",
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  initMap();
  bindEvents();
  renderIncidentList();
  loadAllData();
  if (window.lucide) {
    window.lucide.createIcons();
  }
});

function cacheElements() {
  els.form = document.querySelector("#incidentForm");
  els.lat = document.querySelector("#latInput");
  els.lng = document.querySelector("#lngInput");
  els.latDeg = document.querySelector("#latDegInput");
  els.latMin = document.querySelector("#latMinInput");
  els.latSec = document.querySelector("#latSecInput");
  els.latHem = document.querySelector("#latHemInput");
  els.lngDeg = document.querySelector("#lngDegInput");
  els.lngMin = document.querySelector("#lngMinInput");
  els.lngSec = document.querySelector("#lngSecInput");
  els.lngHem = document.querySelector("#lngHemInput");
  els.coordinateReadout = document.querySelector("#coordinateReadout");
  els.dmsFields = document.querySelector("#dmsFields");
  els.decimalFields = document.querySelector("#decimalFields");
  els.priority = document.querySelector("#priorityInput");
  els.feedback = document.querySelector("#formFeedback");
  els.nearestCard = document.querySelector("#nearestCard");
  els.distanceMetric = document.querySelector("#distanceMetric");
  els.etaMetric = document.querySelector("#etaMetric");
  els.availableMetric = document.querySelector("#availableMetric");
  els.towerMetric = document.querySelector("#towerMetric");
  els.protectedMetric = document.querySelector("#protectedMetric");
  els.datasetStatus = document.querySelector("#datasetStatus");
  els.consoleText = document.querySelector("#consoleText");
  els.candidateList = document.querySelector("#candidateList");
  els.exposureCard = document.querySelector("#exposureCard");
  els.incidentList = document.querySelector("#incidentList");
  els.clearFociBtn = document.querySelector("#clearFociBtn");
  els.demoFocusBtn = document.querySelector("#demoFocusBtn");
  els.fitMapBtn = document.querySelector("#fitMapBtn");
  els.locateBtn = document.querySelector("#locateBtn");
  els.layerFile = document.querySelector("#layerFileInput");
  els.layerType = document.querySelector("#layerTypeInput");
  els.layerName = document.querySelector("#layerNameInput");
  els.importLayerBtn = document.querySelector("#importLayerBtn");
  els.clearImportsBtn = document.querySelector("#clearImportsBtn");
  els.importFeedback = document.querySelector("#importFeedback");
  els.importedLayerList = document.querySelector("#importedLayerList");
  els.baseLayerToggles = document.querySelectorAll("[data-base-layer]");
}

function initMap() {
  state.map = L.map("map", {
    zoomControl: false,
    preferCanvas: true,
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
  }).setView([-37.72, -72.45], 8);

  createMapPanes();
  L.control.zoom({ position: "bottomright" }).addTo(state.map);
  initBaseLayers();

  state.incidentLayer = L.layerGroup().addTo(state.map);

  scheduleMapRefresh();
  window.addEventListener("resize", scheduleMapRefresh);

  state.map.on("click", (event) => {
    setCoordinateInputs(event.latlng.lat, event.latlng.lng);
    els.consoleText.textContent = `Coordenadas precargadas: ${event.latlng.lat.toFixed(
      5,
    )}, ${event.latlng.lng.toFixed(5)} | ${formatDmsPair(event.latlng.lat, event.latlng.lng)}.`;
  });
}

function initBaseLayers() {
  Object.entries(BASE_LAYERS).forEach(([key, config]) => {
    state.baseLayers[key] = L.tileLayer(config.url, config.options);
  });
  setBaseLayer(state.activeBaseLayer);
}

function setBaseLayer(layerName) {
  const nextLayer = state.baseLayers[layerName];
  if (!nextLayer) return;

  Object.values(state.baseLayers).forEach((layer) => {
    if (state.map.hasLayer(layer)) {
      layer.remove();
    }
  });

  nextLayer.addTo(state.map);
  state.activeBaseLayer = layerName;
  document.querySelectorAll("[data-base-layer]").forEach((input) => {
    input.checked = input.value === layerName;
  });
  scheduleMapRefresh();
}

function createMapPanes() {
  state.map.createPane("boundaryPane");
  state.map.getPane("boundaryPane").style.zIndex = 360;
  state.map.getPane("boundaryPane").style.pointerEvents = "none";

  state.map.createPane("contextPane");
  state.map.getPane("contextPane").style.zIndex = 430;
  state.map.getPane("contextPane").style.pointerEvents = "auto";
}

function bindEvents() {
  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    createIncidentFromForm();
  });

  els.demoFocusBtn.addEventListener("click", () => {
    const demo = { lat: -37.8456, lng: -72.3562, priority: "Critica" };
    setCoordinateInputs(demo.lat, demo.lng);
    els.priority.value = demo.priority;
    createIncident(demo);
  });

  els.fitMapBtn.addEventListener("click", fitOperationalArea);
  els.clearFociBtn.addEventListener("click", clearIncidents);
  els.importLayerBtn.addEventListener("click", handleLayerImport);
  els.clearImportsBtn.addEventListener("click", clearImportedLayers);

  els.incidentList.addEventListener("click", (event) => {
    const selectButton = event.target.closest("[data-select-incident]");
    const recalcButton = event.target.closest("[data-recalculate-incident]");
    const deleteButton = event.target.closest("[data-delete-incident]");

    if (selectButton) {
      selectIncident(selectButton.dataset.selectIncident, { focusMap: true });
    } else if (recalcButton) {
      const incidentId = recalcButton.dataset.recalculateIncident;
      selectIncident(incidentId);
      calculateNearestBrigades(incidentId);
    } else if (deleteButton) {
      deleteIncident(deleteButton.dataset.deleteIncident);
    }
  });

  els.locateBtn.addEventListener("click", () => {
    state.map.locate({ setView: true, maxZoom: 12, enableHighAccuracy: true });
  });

  state.map.on("locationfound", (event) => {
    setCoordinateInputs(event.latlng.lat, event.latlng.lng);
    els.consoleText.textContent = `Ubicacion detectada: ${formatDmsPair(event.latlng.lat, event.latlng.lng)}.`;
  });

  state.map.on("locationerror", () => {
    els.consoleText.textContent = "No fue posible obtener la ubicacion del navegador.";
  });

  document.querySelectorAll("[data-layer-toggle]").forEach((toggle) => {
    toggle.addEventListener("change", async () => {
      const layerName = toggle.dataset.layerToggle;

      if (toggle.checked) {
        if (!state.layers[layerName] && OPTIONAL_DATASETS[layerName]) {
          toggle.disabled = true;
          try {
            await loadOptionalLayer(layerName);
          } catch (error) {
            toggle.checked = false;
            els.consoleText.textContent = error.message;
          } finally {
            toggle.disabled = false;
          }
        }
        const layer = state.layers[layerName];
        if (!layer) return;
        layer.addTo(state.map);
      } else {
        const layer = state.layers[layerName];
        if (!layer) return;
        layer.remove();
      }
    });
  });

  els.baseLayerToggles.forEach((toggle) => {
    toggle.addEventListener("change", () => {
      if (!toggle.checked) return;
      setBaseLayer(toggle.value);
      els.consoleText.textContent = `Mapa base activo: ${BASE_LAYERS[toggle.value]?.label || toggle.value}.`;
    });
  });

  document.querySelectorAll("[data-coordinate-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextMode = button.dataset.coordinateMode;
      syncCoordinatesFromActiveMode();
      setCoordinateMode(nextMode);
    });
  });

  [
    els.latDeg,
    els.latMin,
    els.latSec,
    els.latHem,
    els.lngDeg,
    els.lngMin,
    els.lngSec,
    els.lngHem,
  ].forEach((input) => {
    input.addEventListener("input", () => {
      if (state.coordinateMode === "dms") {
        syncDecimalFromDms();
      }
    });
    input.addEventListener("change", () => {
      if (state.coordinateMode === "dms") {
        syncDecimalFromDms();
      }
    });
  });

  [els.lat, els.lng].forEach((input) => {
    input.addEventListener("input", () => {
      if (state.coordinateMode === "decimal") {
        syncDmsFromDecimal();
      }
    });
  });
}

async function loadAllData() {
  try {
    const entries = await Promise.all(
      Object.entries(DATASETS).map(async ([key, url]) => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`No se pudo cargar ${url}`);
        }
        return [key, await response.json()];
      }),
    );

    entries.forEach(([key, geojson]) => {
      state.data[key] = geojson;
    });

    renderLayers();
    updateDatasetMetrics();
    fitOperationalArea();
    scheduleMapRefresh();
    els.datasetStatus.textContent = "Datos GIS cargados";
  } catch (error) {
    els.datasetStatus.textContent = "Error al cargar datos GIS";
    els.consoleText.textContent = error.message;
  }
}

function renderLayers() {
  state.layers.protected = L.geoJSON(state.data.protected, {
    style: (feature) => ({
      color: feature.properties.color || "#78b866",
      weight: 1.4,
      fillColor: feature.properties.color || "#78b866",
      fillOpacity: 0.18,
    }),
    onEachFeature: (feature, layer) => {
      const props = feature.properties || {};
      layer.bindPopup(`
        <h3 class="popup-title">${props.nombre}</h3>
        <p class="popup-line"><strong>Categoria:</strong> ${props.categoria || props.tipo || "SNASPE"}</p>
        <p class="popup-line"><strong>Estado:</strong> ${props.estado || props.riesgo || "Vigente"}</p>
      `);
    },
  });
  addLayerIfChecked("protected");

  state.layers.towers = L.layerGroup();
  L.geoJSON(state.data.towers, {
    pointToLayer: (feature, latlng) =>
      L.marker(latlng, {
        icon: createDivIcon("tower", "T"),
      }),
    onEachFeature: (feature, layer) => {
      const props = feature.properties;
      const radiusKm = normalizeNumber(props.radio_km || props.radio || "0");
      const detailRows = [
        ["Codigo", props.codigo],
        ["Empresa", props.EMPRESA || props.empresa],
        ["Estructura", props.ESTRUCTURA || props.estructura || props.tipo],
        ["Horario", props.HORARIO || props.horario],
        ["POA comuna", props.poa_comuna],
        ["POA personas", props.poa_personas],
        ["POA nomina", props.poa_nomina],
        ["Radio", radiusKm > 0 ? `${radiusKm} km` : null],
      ]
        .filter(([, value]) => value !== null && value !== undefined && value !== "")
        .map(([label, value]) => `<p class="popup-line"><strong>${label}:</strong> ${value}</p>`)
        .join("");

      layer.bindPopup(`
        <h3 class="popup-title">${props.nombre}</h3>
        ${detailRows}
      `);
      if (radiusKm > 0) {
        L.circle(layer.getLatLng(), {
          radius: radiusKm * 1000,
          color: "#49b8d8",
          weight: 1,
          fillOpacity: 0.04,
        }).addTo(state.layers.towers);
      }
    },
  }).addTo(state.layers.towers);
  addLayerIfChecked("towers");

  state.layers.brigades = L.geoJSON(state.data.brigades, {
    pointToLayer: (feature, latlng) => {
      const props = normalizeBrigadeProperties(feature.properties);
      return L.marker(latlng, {
        icon: createDivIcon(props.disponible ? "brigade" : "brigade offline", "B"),
      });
    },
    onEachFeature: (feature, layer) => {
      const props = normalizeBrigadeProperties(feature.properties);
      layer.bindPopup(`
        <h3 class="popup-title">${props.nombre}</h3>
        <p class="popup-line"><strong>Tipo:</strong> ${props.tipo}</p>
        <p class="popup-line"><strong>Estado:</strong> ${props.estado}</p>
        <p class="popup-line"><strong>Personal:</strong> ${props.personal}</p>
        ${props.poa_plan ? `<p class="popup-line"><strong>Plan:</strong> ${props.poa_plan}</p>` : ""}
        ${props.poa_proveedor ? `<p class="popup-line"><strong>Proveedor:</strong> ${props.poa_proveedor}</p>` : ""}
        ${props.poa_patente ? `<p class="popup-line"><strong>Patente:</strong> ${props.poa_patente}</p>` : ""}
      `);
    },
  });
  addLayerIfChecked("brigades");

  state.layers.critical = L.geoJSON(state.data.critical, {
    pointToLayer: (feature, latlng) =>
      L.marker(latlng, {
        icon: createDivIcon("critical", "C"),
      }),
    onEachFeature: (feature, layer) => {
      const props = feature.properties;
      layer.bindPopup(`
        <h3 class="popup-title">${props.nombre}</h3>
        <p class="popup-line"><strong>Tipo:</strong> ${props.tipo}</p>
        <p class="popup-line"><strong>Criticidad:</strong> ${props.criticidad}</p>
        <p class="popup-line"><strong>Estado:</strong> ${props.estado}</p>
      `);
    },
  });
  addLayerIfChecked("critical");

  state.layers.water_sources = createOperationalGeoJsonLayer(state.data.water_sources, "water_sources");
  addLayerIfChecked("water_sources");

  state.layers.communes = createOperationalGeoJsonLayer(state.data.communes, "communes");
  addLayerIfChecked("communes");
  renderBoundaryContextLayer();

  state.layers.technical = createOperationalGeoJsonLayer(state.data.technical, "technical");
  addLayerIfChecked("technical");

}

function renderBoundaryContextLayer() {
  state.boundaryLayer?.remove();
  if (!state.data.communes) return;

  state.boundaryLayer = L.geoJSON(state.data.communes, {
    pane: "boundaryPane",
    interactive: false,
    style: {
      color: "#0e5565",
      weight: 2,
      opacity: 0.78,
      fillOpacity: 0,
      dashArray: "6 7",
    },
  }).addTo(state.map);
}

function addLayerIfChecked(layerName) {
  const toggle = document.querySelector(`[data-layer-toggle="${layerName}"]`);
  if (toggle?.checked && state.layers[layerName]) {
    state.layers[layerName].addTo(state.map);
  }
}

async function loadOptionalLayer(layerName) {
  const url = OPTIONAL_DATASETS[layerName];
  if (!url) {
    throw new Error("Capa opcional no configurada.");
  }

  els.consoleText.textContent = `Cargando capa oficial ${getLayerTypeLabel(layerName)}.`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`No se pudo cargar ${url}`);
  }

  const geojson = await response.json();
  state.data[layerName] = geojson;
  state.layers[layerName] = createOperationalGeoJsonLayer(geojson, layerName);
  els.consoleText.textContent = `Capa oficial ${getLayerTypeLabel(layerName)} cargada (${geojson.features.length} elementos).`;
}

function createDivIcon(className, text) {
  return L.divIcon({
    className: "",
    html: `<span class="marker-dot ${className}">${text}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -16],
  });
}

function createIncidentFromForm() {
  const coordinates = getCoordinatesFromForm();
  const lat = coordinates.lat;
  const lng = coordinates.lng;
  const priority = els.priority.value;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    setFeedback("Ingresa coordenadas validas en GMS o decimal.");
    return;
  }

  if (lat < -56 || lat > -17 || lng < -76 || lng > -66) {
    setFeedback("Las coordenadas deben estar dentro de Chile continental operativo.");
    return;
  }

  createIncident({ lat, lng, priority });
}

function normalizeNumber(value) {
  return Number.parseFloat(String(value).trim().replace(",", "."));
}

function getCoordinatesFromForm() {
  if (state.coordinateMode === "decimal") {
    return {
      lat: normalizeNumber(els.lat.value),
      lng: normalizeNumber(els.lng.value),
    };
  }

  const lat = dmsToDecimal(
    els.latDeg.value,
    els.latMin.value,
    els.latSec.value,
    els.latHem.value,
  );
  const lng = dmsToDecimal(
    els.lngDeg.value,
    els.lngMin.value,
    els.lngSec.value,
    els.lngHem.value,
  );

  return { lat, lng };
}

function dmsToDecimal(degreesValue, minutesValue, secondsValue, hemisphere) {
  const degrees = normalizeNumber(degreesValue);
  const minutes = normalizeNumber(minutesValue || "0");
  const seconds = normalizeNumber(secondsValue || "0");

  if (
    !Number.isFinite(degrees) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    minutes < 0 ||
    minutes >= 60 ||
    seconds < 0 ||
    seconds >= 60
  ) {
    return Number.NaN;
  }

  const absolute = Math.abs(degrees) + minutes / 60 + seconds / 3600;
  const hemi = String(hemisphere || "").toUpperCase();
  const sign = hemi === "S" || hemi === "O" || hemi === "W" ? -1 : 1;
  return absolute * sign;
}

function decimalToDms(value, latLngType) {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = (minutesFloat - minutes) * 60;
  const hemisphere = latLngType === "lat" ? (value < 0 ? "S" : "N") : value < 0 ? "O" : "E";

  return {
    degrees,
    minutes,
    seconds,
    hemisphere,
  };
}

function setCoordinateInputs(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  els.lat.value = lat.toFixed(6);
  els.lng.value = lng.toFixed(6);

  const latDms = decimalToDms(lat, "lat");
  const lngDms = decimalToDms(lng, "lng");
  els.latDeg.value = latDms.degrees;
  els.latMin.value = latDms.minutes;
  els.latSec.value = latDms.seconds.toFixed(2);
  els.latHem.value = latDms.hemisphere;
  els.lngDeg.value = lngDms.degrees;
  els.lngMin.value = lngDms.minutes;
  els.lngSec.value = lngDms.seconds.toFixed(2);
  els.lngHem.value = lngDms.hemisphere;
  updateCoordinateReadout(lat, lng);
}

function syncDecimalFromDms() {
  const { lat, lng } = getCoordinatesFromForm();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    updateCoordinateReadout(null, null);
    return;
  }

  els.lat.value = lat.toFixed(6);
  els.lng.value = lng.toFixed(6);
  updateCoordinateReadout(lat, lng);
}

function syncDmsFromDecimal() {
  const lat = normalizeNumber(els.lat.value);
  const lng = normalizeNumber(els.lng.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    updateCoordinateReadout(null, null);
    return;
  }

  setCoordinateInputs(lat, lng);
}

function syncCoordinatesFromActiveMode() {
  if (state.coordinateMode === "decimal") {
    syncDmsFromDecimal();
  } else {
    syncDecimalFromDms();
  }
}

function setCoordinateMode(mode) {
  state.coordinateMode = mode === "decimal" ? "decimal" : "dms";
  document.querySelectorAll("[data-coordinate-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.coordinateMode === state.coordinateMode);
  });
  els.dmsFields.hidden = state.coordinateMode !== "dms";
  els.decimalFields.hidden = state.coordinateMode !== "decimal";
}

function updateCoordinateReadout(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    els.coordinateReadout.textContent = "GMS: -- | Decimal: --";
    return;
  }

  els.coordinateReadout.textContent = `GMS: ${formatDmsPair(lat, lng)} | Decimal: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function formatDmsPair(lat, lng) {
  return `${formatDmsClean(lat, "lat")} | ${formatDmsClean(lng, "lng")}`;
}

function formatDms(value, latLngType) {
  const dms = decimalToDms(value, latLngType);
  const seconds = dms.seconds.toFixed(2).padStart(5, "0");
  return `${dms.degrees}° ${String(dms.minutes).padStart(2, "0")}' ${seconds}\" ${dms.hemisphere}`;
}

function formatDmsClean(value, latLngType) {
  const dms = decimalToDms(value, latLngType);
  const seconds = dms.seconds.toFixed(2).padStart(5, "0");
  return `${dms.degrees}\u00b0 ${String(dms.minutes).padStart(2, "0")}' ${seconds}\" ${dms.hemisphere}`;
}

function createIncident({ lat, lng, priority }) {
  setFeedback("");

  const sequence = state.nextIncidentId;
  const incident = {
    id: `F-${String(sequence).padStart(3, "0")}`,
    sequence,
    lat,
    lng,
    priority,
    createdAt: new Date(),
    marker: null,
    exposureCircle: null,
    locationLabel: null,
    windLayer: null,
    towerBearingLayer: null,
    routeLine: null,
    dispatch: null,
    wind: null,
    towerBearings: [],
    context: {
      status: "loading",
      locality: null,
      commune: null,
      error: null,
    },
    exposure: {
      status: "pending",
      summary: {},
      total: 0,
      error: null,
    },
    routeRequestId: 0,
    isRouting: false,
  };

  state.nextIncidentId += 1;

  incident.marker = L.marker([lat, lng], {
    icon: createIncidentIcon(incident, true),
    zIndexOffset: 1000 + sequence,
  })
    .addTo(state.incidentLayer)
    .bindPopup(renderIncidentPopup(incident))
    .openPopup();

  incident.marker.on("click", () => selectIncident(incident.id));
  incident.exposureCircle = L.circle([lat, lng], {
    pane: "contextPane",
    radius: EXPOSURE_RADIUS_KM * 1000,
    color: "#00a7ff",
    weight: 3,
    opacity: 1,
    fillColor: "#00a7ff",
    fillOpacity: 0.09,
    dashArray: "8 6",
  }).addTo(state.map);
  incident.exposureCircle.on("click", () => selectIncident(incident.id));

  incident.wind = estimateWindContext(incident);
  incident.towerBearings = getNearestTowerBearings(incident);
  drawIncidentLocationLabel(incident);
  drawIncidentWindVector(incident);
  drawIncidentTowerBearings(incident);

  state.incidents.push(incident);
  selectIncident(incident.id);

  state.map.setView([lat, lng], Math.max(state.map.getZoom(), 10), { animate: false });
  scheduleMapRefresh();
  calculateNearestBrigades(incident.id);
  resolveIncidentContext(incident.id);
  analyzeIncidentExposure(incident.id);
}

function getIncidentById(id) {
  return state.incidents.find((incident) => incident.id === id);
}

function getActiveIncident() {
  return getIncidentById(state.activeIncidentId);
}

function createIncidentIcon(incident, isActive) {
  const label = incident.sequence > 99 ? "F" : `F${incident.sequence}`;
  return createDivIcon(`active-fire${isActive ? " selected" : ""}`, label);
}

function renderIncidentPopup(incident) {
  const best = incident.dispatch?.best;
  const dispatchRows = best
    ? `<p class="popup-line"><strong>Brigada:</strong> ${escapeHtml(
        getFeatureName(best.feature.properties, "Brigada"),
      )}</p>
       <p class="popup-line"><strong>ETA:</strong> ${formatEta(best.etaMinutes)}</p>`
    : '<p class="popup-line"><strong>Despacho:</strong> pendiente de calculo</p>';

  const exposureRows =
    incident.exposure?.status === "ready"
      ? `<p class="popup-line"><strong>Exposicion 5 km:</strong> ${incident.exposure.total} elementos</p>`
      : '<p class="popup-line"><strong>Exposicion 5 km:</strong> en analisis</p>';

  return `<div class="incident-popup">
    <h3 class="popup-title">Foco ${escapeHtml(incident.id)}</h3>
    ${renderIncidentLocationRows(incident)}
    <p class="popup-line"><strong>Prioridad:</strong> ${escapeHtml(incident.priority)}</p>
    <p class="popup-line"><strong>GMS:</strong> ${formatDmsPair(incident.lat, incident.lng)}</p>
    <p class="popup-line"><strong>Decimal:</strong> ${incident.lat.toFixed(5)}, ${incident.lng.toFixed(5)}</p>
    ${renderIncidentWindRows(incident)}
    ${renderIncidentTowerRows(incident)}
    ${exposureRows}
    ${dispatchRows}
  </div>`;
}

function renderIncidentLocationRows(incident) {
  const context = incident.context;
  if (!context || context.status === "loading") {
    return '<p class="popup-line"><strong>Ubicacion:</strong> resolviendo localidad y comuna</p>';
  }

  if (context.status === "error") {
    return '<p class="popup-line"><strong>Ubicacion:</strong> no disponible</p>';
  }

  const locality = context.locality
    ? `${context.locality.name}${context.locality.matchType === "nearest" ? " (cercana)" : ""}`
    : "Sector sin localidad oficial";
  const commune = context.commune?.name || "Comuna no resuelta";

  return `
    <p class="popup-line popup-location"><strong>Localidad:</strong> ${escapeHtml(locality)}</p>
    <p class="popup-line"><strong>Comuna:</strong> ${escapeHtml(commune)}</p>
  `;
}

function renderIncidentWindRows(incident) {
  const wind = incident.wind || estimateWindContext(incident);
  return `
    <p class="popup-line"><strong>Viento ref.:</strong> desde ${escapeHtml(
      wind.fromCardinal,
    )} hacia ${formatBearing(wind.toDegrees)} | ${wind.speedKmh} km/h</p>
  `;
}

function renderIncidentTowerRows(incident) {
  if (!incident.towerBearings?.length) {
    return '<p class="popup-line"><strong>Torres:</strong> sin torres cercanas calculadas</p>';
  }

  const rows = incident.towerBearings
    .slice(0, 3)
    .map(
      (tower) =>
        `<li><span>${escapeHtml(tower.name)}</span><strong>${formatBearing(tower.bearing)} | ${tower.distanceKm.toFixed(
          1,
        )} km</strong></li>`,
    )
    .join("");

  return `
    <div class="popup-mini-list">
      <strong>Azimut torres</strong>
      <ul>${rows}</ul>
    </div>
  `;
}

async function resolveIncidentContext(incidentId) {
  const incident = getIncidentById(incidentId);
  if (!incident) return;

  try {
    const localitiesGeoJson = await getAnalysisGeoJson("localities", EXPOSURE_DATASETS.localities).catch(() => null);
    const currentIncident = getIncidentById(incidentId);
    if (!currentIncident) return;

    currentIncident.context = {
      status: "ready",
      locality: localitiesGeoJson
        ? findContextFeature(localitiesGeoJson, currentIncident.lat, currentIncident.lng, {
            maxDistanceKm: 12,
            nameKeys: ["nombre", "NOMBRE", "LOCALIDAD", "Localidad", "NOM_LOC", "SECTOR"],
          })
        : null,
      commune: state.data.communes
        ? findContextFeature(state.data.communes, currentIncident.lat, currentIncident.lng, {
            maxDistanceKm: 60,
            nameKeys: ["COMUNA", "nombre", "NOMBRE"],
          })
        : null,
      error: null,
    };

    drawIncidentLocationLabel(currentIncident);
    updateIncidentPopup(currentIncident);
    renderIncidentList();
    if (currentIncident.id === state.activeIncidentId) {
      renderExposure(currentIncident);
    }
  } catch (error) {
    const currentIncident = getIncidentById(incidentId);
    if (!currentIncident) return;
    currentIncident.context = {
      status: "error",
      locality: null,
      commune: null,
      error: error.message,
    };
    updateIncidentPopup(currentIncident);
    if (currentIncident.id === state.activeIncidentId) {
      renderExposure(currentIncident);
    }
  }
}

function findContextFeature(geojson, lat, lng, options = {}) {
  const maxDistanceKm = options.maxDistanceKm ?? Number.POSITIVE_INFINITY;
  const nameKeys = options.nameKeys || ["nombre", "name", "COMUNA"];
  let nearest = null;

  for (const feature of geojson?.features || []) {
    const name = getMeaningfulPropertyName(feature.properties || {}, nameKeys);
    if (!name) continue;

    if (featureContainsLatLng(feature.geometry, lat, lng)) {
      return {
        name,
        distanceKm: 0,
        matchType: "inside",
        properties: feature.properties || {},
      };
    }

    const distanceKm = distanceToFeatureKm(lat, lng, feature.geometry);
    if (!Number.isFinite(distanceKm)) continue;
    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = {
        name,
        distanceKm,
        matchType: "nearest",
        properties: feature.properties || {},
      };
    }
  }

  return nearest && nearest.distanceKm <= maxDistanceKm ? nearest : null;
}

function featureContainsLatLng(geometry, lat, lng) {
  if (!geometry) return false;

  if (geometry.type === "Point") {
    const [featureLng, featureLat] = geometry.coordinates;
    return haversineKm(lat, lng, featureLat, featureLng) <= 0.1;
  }

  if (geometry.type === "Polygon") {
    return pointInPolygon([lng, lat], geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInPolygon([lng, lat], polygon));
  }

  if (geometry.type === "GeometryCollection") {
    return geometry.geometries.some((child) => featureContainsLatLng(child, lat, lng));
  }

  return false;
}

function getIncidentLocationLabel(incident) {
  const context = incident.context;
  if (!context || context.status === "loading") return "Resolviendo";
  if (context.status === "error") return "No disponible";
  if (context.locality) {
    return `${context.locality.name}${context.locality.matchType === "nearest" ? " (cercana)" : ""}`;
  }
  return "Sector sin localidad oficial";
}

function estimateWindContext(incident) {
  const now = new Date();
  const hour = now.getHours();
  const coastalZone = incident.lng < -73.05;
  const andeanZone = incident.lng > -72.05;
  const baseFrom = coastalZone ? 245 : andeanZone ? 275 : 235;
  const hourShift = hour >= 13 && hour <= 20 ? 12 : hour <= 8 ? -8 : 0;
  const spatialShift = Math.round(((Math.abs(incident.lat) * 9 + Math.abs(incident.lng) * 5) % 18) - 9);
  const fromDegrees = normalizeBearing(baseFrom + hourShift + spatialShift);
  const toDegrees = normalizeBearing(fromDegrees + 180);
  const speedBase = coastalZone ? 20 : andeanZone ? 14 : 17;
  const speedKmh = Math.round(speedBase + (hour >= 13 && hour <= 20 ? 5 : 0) + Math.abs(spatialShift) * 0.35);

  return {
    fromDegrees,
    toDegrees,
    fromCardinal: cardinalDirection(fromDegrees),
    toCardinal: cardinalDirection(toDegrees),
    speedKmh,
    source: "estimacion operacional local",
  };
}

function drawIncidentWindVector(incident) {
  incident.windLayer?.remove();
  const wind = incident.wind || estimateWindContext(incident);
  const end = destinationPoint(incident.lat, incident.lng, wind.toDegrees, WIND_VECTOR_LENGTH_KM);
  const mid = destinationPoint(incident.lat, incident.lng, wind.toDegrees, WIND_VECTOR_LENGTH_KM * 0.58);
  const group = L.layerGroup();
  const windLine = [
    [incident.lat, incident.lng],
    end,
  ];

  L.polyline(windLine, {
    pane: "contextPane",
    color: "#07151d",
    weight: 9,
    opacity: 0.68,
    lineCap: "round",
  }).addTo(group);

  L.polyline(
    windLine,
    {
      pane: "contextPane",
      color: "#23c7ff",
      weight: 5,
      opacity: 0.98,
      lineCap: "round",
    },
  )
    .bindTooltip(`Viento ref. hacia ${formatBearing(wind.toDegrees)} | ${wind.speedKmh} km/h`, {
      sticky: true,
      direction: "top",
    })
    .addTo(group);

  L.marker(mid, {
    pane: "contextPane",
    interactive: false,
    icon: L.divIcon({
      className: "wind-vector-icon",
      html: `<span class="wind-vector-head" style="--wind-angle:${wind.toDegrees}deg"></span>`,
      iconSize: [46, 46],
      iconAnchor: [23, 23],
    }),
  }).addTo(group);

  L.marker(end, {
    pane: "contextPane",
    interactive: false,
    icon: L.divIcon({
      className: "wind-vector-label",
      html: `<span>${formatBearing(wind.toDegrees)} | ${wind.speedKmh} km/h</span>`,
      iconSize: [104, 24],
      iconAnchor: [52, -2],
    }),
  }).addTo(group);

  group.addTo(state.map);
  incident.windLayer = group;
}

function drawIncidentLocationLabel(incident) {
  const label = getIncidentLocationLabel(incident);
  const labelLatLng = destinationPoint(
    incident.lat,
    incident.lng,
    LOCATION_LABEL_BEARING,
    EXPOSURE_RADIUS_KM * LOCATION_LABEL_DISTANCE_FACTOR,
  );
  const html = `<span>${escapeHtml(label)}</span>`;

  if (incident.locationLabel) {
    incident.locationLabel.setLatLng(labelLatLng);
    incident.locationLabel.setIcon(createIncidentLocationIcon(html));
    return;
  }

  incident.locationLabel = L.marker(labelLatLng, {
    pane: "contextPane",
    interactive: false,
    zIndexOffset: 850,
    icon: createIncidentLocationIcon(html),
  }).addTo(state.map);
}

function createIncidentLocationIcon(html) {
  return L.divIcon({
    className: "incident-location-label",
    html,
    iconSize: [190, 30],
    iconAnchor: [95, 0],
  });
}

function drawIncidentTowerBearings(incident) {
  incident.towerBearingLayer?.remove();
  const group = L.layerGroup();

  incident.towerBearings.forEach((tower, index) => {
    const line = [
      [incident.lat, incident.lng],
      [tower.lat, tower.lng],
    ];
    L.polyline(line, {
      pane: "contextPane",
      color: "#101417",
      weight: index === 0 ? 6.5 : 5,
      opacity: tower.withinRadius ? 0.58 : 0.34,
      dashArray: index === 0 ? "11 8" : "6 9",
      contextRole: "tower-bearing-halo",
    }).addTo(group);

    L.polyline(line, {
      pane: "contextPane",
      color: index === 0 ? "#ffd84f" : "#ffb13b",
      weight: index === 0 ? 3.2 : 2.4,
      opacity: tower.withinRadius ? 0.98 : 0.72,
      dashArray: index === 0 ? "11 8" : "6 9",
      contextRole: "tower-bearing-line",
    })
      .bindTooltip(`${tower.name} | ${formatBearing(tower.bearing)} | ${tower.distanceKm.toFixed(1)} km`, {
        sticky: true,
      })
      .addTo(group);
  });

  group.addTo(state.map);
  incident.towerBearingLayer = group;
}

function syncContextLayerStyles(incident, isActive) {
  incident.windLayer?.eachLayer((layer) => {
    if (typeof layer.setStyle === "function") {
      layer.setStyle({
        opacity: isActive ? (layer.options?.color === "#07151d" ? 0.68 : 0.98) : 0.22,
      });
    }
    if (isActive && typeof layer.bringToFront === "function") {
      layer.bringToFront();
    }
  });
  incident.locationLabel?.setOpacity(isActive ? 1 : 0.48);

  incident.towerBearingLayer?.eachLayer((layer) => {
    if (typeof layer.setStyle === "function") {
      const isHalo = layer.options?.contextRole === "tower-bearing-halo";
      layer.setStyle({
        opacity: isActive ? (isHalo ? 0.58 : 0.98) : isHalo ? 0.16 : 0.28,
      });
    }
    if (isActive && typeof layer.bringToFront === "function") {
      layer.bringToFront();
    }
  });
}

function getNearestTowerBearings(incident) {
  const seenTowers = new Set();
  const towers = (state.data.towers?.features || [])
    .filter((feature) => feature.geometry?.type === "Point")
    .map((feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      const distanceKm = haversineKm(incident.lat, incident.lng, lat, lng);
      const bearing = bearingDegrees(incident.lat, incident.lng, lat, lng);
      return {
        feature,
        lat,
        lng,
        distanceKm,
        bearing,
        withinRadius: distanceKm <= TOWER_BEARING_RADIUS_KM,
        name: getFeatureName(feature.properties || {}, "Torre"),
      };
    })
    .filter((tower) => {
      const key = `${tower.name}|${tower.lat.toFixed(5)}|${tower.lng.toFixed(5)}`;
      if (seenTowers.has(key)) return false;
      seenTowers.add(key);
      return true;
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const withinRadius = towers.filter((tower) => tower.withinRadius);
  return (withinRadius.length ? withinRadius : towers).slice(0, TOWER_BEARING_LIMIT);
}

function bearingDegrees(lat1, lng1, lat2, lng2) {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaLng = toRadians(lng2 - lng1);
  const y = Math.sin(deltaLng) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLng);
  return normalizeBearing(toDegrees(Math.atan2(y, x)));
}

function destinationPoint(lat, lng, bearing, distanceKm) {
  const angularDistance = distanceKm / 6371;
  const bearingRad = toRadians(bearing);
  const latRad = toRadians(lat);
  const lngRad = toRadians(lng);
  const destinationLat = Math.asin(
    Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearingRad),
  );
  const destinationLng =
    lngRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(destinationLat),
    );

  return [toDegrees(destinationLat), normalizeLng(toDegrees(destinationLng))];
}

function formatBearing(degrees) {
  return `${String(Math.round(normalizeBearing(degrees))).padStart(3, "0")}\u00b0`;
}

function cardinalDirection(degrees) {
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
  const index = Math.round(normalizeBearing(degrees) / 22.5) % directions.length;
  return directions[index];
}

function normalizeBearing(degrees) {
  return ((degrees % 360) + 360) % 360;
}

function normalizeLng(degrees) {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

function selectIncident(id, options = {}) {
  const incident = getIncidentById(id);
  if (!incident) return;

  state.activeIncidentId = id;
  setCoordinateInputs(incident.lat, incident.lng);
  els.priority.value = incident.priority;
  updateIncidentPopup(incident);
  syncIncidentLayerStyles();
  renderIncidentList();

  if (incident.dispatch) {
    renderNearest(incident.dispatch.best, incident.dispatch.candidates, incident);
  } else if (incident.isRouting) {
    renderRoutingPendingForIncident(incident);
  } else {
    renderDispatchWaiting(incident);
  }
  renderExposure(incident);

  if (options.focusMap) {
    state.map.setView([incident.lat, incident.lng], Math.max(state.map.getZoom(), 10), { animate: false });
    incident.marker?.openPopup();
  }
}

function updateIncidentPopup(incident) {
  if (incident.marker) {
    incident.marker.setPopupContent(renderIncidentPopup(incident));
  }
}

function syncIncidentLayerStyles() {
  state.incidents.forEach((incident) => {
    const isActive = incident.id === state.activeIncidentId;
    incident.marker?.setIcon(createIncidentIcon(incident, isActive));

    if (incident.routeLine) {
      const routeSource = incident.dispatch?.best?.routeSource;
      incident.routeLine.setStyle({
        color: isActive ? "#ffca45" : "#a7b4b7",
        weight: isActive ? (routeSource === "road" ? 6.5 : 5.5) : 3.4,
        opacity: isActive ? 0.98 : 0.34,
        dashArray: routeSource === "road" ? null : "8 8",
      });

      if (isActive) {
        incident.routeLine.bringToFront();
      }
    }

    if (incident.exposureCircle) {
      incident.exposureCircle.setStyle({
        color: isActive ? "#00a7ff" : "#7f9298",
        weight: isActive ? 3 : 1.6,
        opacity: isActive ? 1 : 0.45,
        fillColor: isActive ? "#00a7ff" : "#7f9298",
        fillOpacity: isActive ? 0.09 : 0.035,
      });

      if (isActive) {
        incident.exposureCircle.bringToFront();
      }
    }

    syncContextLayerStyles(incident, isActive);
  });
}

async function calculateNearestBrigades(incidentId = state.activeIncidentId) {
  if (!state.data.brigades) return;

  const incident = getIncidentById(incidentId);
  if (!incident) return;

  incident.routeRequestId += 1;
  incident.isRouting = true;
  incident.dispatch = null;
  if (incident.routeLine) {
    incident.routeLine.remove();
    incident.routeLine = null;
  }
  const routeRequestId = incident.routeRequestId;
  const priorityFactor = PRIORITY_FACTORS[incident.priority] || 1;
  const candidates = getDispatchBrigadeFeatures()
    .map((feature) => ({
      ...feature,
      properties: normalizeBrigadeProperties(feature.properties),
    }))
    .filter((feature) => feature.properties.disponible && feature.geometry?.type === "Point")
    .map((feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      const distanceKm = haversineKm(incident.lat, incident.lng, lat, lng);
      const travelMinutes = (distanceKm / feature.properties.velocidad_kmh) * 60;
      const etaMinutes = Math.round((travelMinutes + feature.properties.alistamiento_min) * priorityFactor);
      return {
        feature,
        lat,
        lng,
        distanceKm,
        etaMinutes,
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm || a.etaMinutes - b.etaMinutes);

  if (!candidates.length) {
    incident.isRouting = false;
    renderIncidentList();
    if (incident.id === state.activeIncidentId) {
      renderNoDispatchAvailable(incident);
    }
    return;
  }

  renderRoutingPending(candidates, incident);

  const routedCandidates = await enrichCandidatesWithRoadRoutes(candidates, incident, priorityFactor, routeRequestId);
  const currentIncident = getIncidentById(incident.id);
  if (!currentIncident || currentIncident.routeRequestId !== routeRequestId) return;

  currentIncident.isRouting = false;
  currentIncident.dispatch = {
    best: routedCandidates[0],
    candidates: routedCandidates,
    calculatedAt: new Date(),
  };
  updateIncidentPopup(currentIncident);
  drawRoute(routedCandidates[0], currentIncident);

  if (currentIncident.id === state.activeIncidentId) {
    renderNearest(routedCandidates[0], routedCandidates, currentIncident);
  }
  renderIncidentList();
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function toDegrees(radians) {
  return radians * (180 / Math.PI);
}

function renderRoutingPending(candidates, incident) {
  if (incident.id !== state.activeIncidentId) {
    renderIncidentList();
    return;
  }

  const best = candidates[0];
  const props = best.feature.properties;

  els.nearestCard.classList.remove("empty-state");
  els.nearestCard.innerHTML = `
    <span class="status-tag">Foco ${incident.id}</span>
    <span class="status-tag route-tag">Calculando ruta vial</span>
    <h2>${props.nombre}</h2>
    <p>${props.tipo} | ${props.base} | preseleccion por distancia directa</p>
    <div class="nearest-meta">
      <span>${best.distanceKm.toFixed(1)} km directos</span>
      <strong>...</strong>
    </div>
  `;

  els.distanceMetric.textContent = "...";
  els.etaMetric.textContent = "...";
  els.availableMetric.textContent = candidates.length;
  els.consoleText.textContent = `Consultando rutas viales para las ${Math.min(
    ROUTING.candidateLimit,
    candidates.length,
  )} brigadas mas cercanas del foco ${incident.id}.`;
}

function renderRoutingPendingForIncident(incident) {
  els.nearestCard.classList.remove("empty-state");
  els.nearestCard.innerHTML = `
    <span class="status-tag">Foco ${incident.id}</span>
    <span class="status-tag route-tag">Calculando ruta vial</span>
    <h2>Despacho en proceso</h2>
    <p>Consultando rutas para este foco seleccionado.</p>
  `;
  els.distanceMetric.textContent = "...";
  els.etaMetric.textContent = "...";
  els.candidateList.innerHTML = '<li class="muted-row">Calculando brigadas candidatas.</li>';
  els.consoleText.textContent = `Foco ${incident.id} seleccionado. Calculo de despacho en proceso.`;
}

function renderDispatchWaiting(incident) {
  els.nearestCard.classList.add("empty-state");
  els.nearestCard.innerHTML = `
    <span class="status-tag">Foco ${incident.id}</span>
    <h2>Despacho pendiente</h2>
    <p>Recalcula el despacho para este foco o espera el resultado de rutas.</p>
  `;
  els.distanceMetric.textContent = "--";
  els.etaMetric.textContent = "--";
  els.candidateList.innerHTML = '<li class="muted-row">Sin ranking calculado para este foco.</li>';
  els.consoleText.textContent = `Foco ${incident.id} seleccionado en ${formatDmsPair(incident.lat, incident.lng)}.`;
}

function renderNoDispatchAvailable(incident) {
  els.nearestCard.classList.add("empty-state");
  els.nearestCard.innerHTML = `
    <span class="status-tag">Foco ${incident.id}</span>
    <h2>Sin brigadas disponibles</h2>
    <p>No hay recursos disponibles para calcular despacho.</p>
  `;
  els.distanceMetric.textContent = "--";
  els.etaMetric.textContent = "--";
  els.availableMetric.textContent = "0";
  els.candidateList.innerHTML = '<li class="muted-row">No hay brigadas disponibles.</li>';
  els.consoleText.textContent = `No hay brigadas disponibles para el foco ${incident.id}.`;
}

async function enrichCandidatesWithRoadRoutes(candidates, incident, priorityFactor, routeRequestId) {
  const shortlist = candidates.slice(0, ROUTING.candidateLimit);
  const routeResults = await Promise.allSettled(
    shortlist.map((candidate) => queryRoadRoute(candidate, incident)),
  );

  const currentIncident = getIncidentById(incident.id);
  if (!currentIncident || currentIncident.routeRequestId !== routeRequestId) return candidates;

  const routeByName = new Map();
  routeResults.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value) {
      routeByName.set(getCandidateKey(shortlist[index]), result.value);
    }
  });

  const enriched = candidates.map((candidate) => {
    const roadRoute = routeByName.get(getCandidateKey(candidate));
    if (!roadRoute) {
      return {
        ...candidate,
        routeSource: "direct",
      };
    }

    const alistamiento = candidate.feature.properties.alistamiento_min || 0;
    return {
      ...candidate,
      distanceKm: roadRoute.distanceKm,
      etaMinutes: Math.round((roadRoute.durationMinutes + alistamiento) * priorityFactor),
      roadDurationMinutes: roadRoute.durationMinutes,
      roadDistanceKm: roadRoute.distanceKm,
      routeGeometry: roadRoute.geometry,
      routeSource: "road",
    };
  });

  const hasRoadRoutes = enriched.some((candidate) => candidate.routeSource === "road");
  if (!hasRoadRoutes) {
    if (incident.id === state.activeIncidentId) {
      els.consoleText.textContent = "No fue posible calcular ruta vial; se mantiene estimacion por distancia directa.";
    }
    return candidates.map((candidate) => ({ ...candidate, routeSource: "direct" }));
  }

  return enriched.sort((a, b) => {
    if (a.routeSource !== b.routeSource) {
      return a.routeSource === "road" ? -1 : 1;
    }
    return a.etaMinutes - b.etaMinutes || a.distanceKm - b.distanceKm;
  });
}

async function queryRoadRoute(candidate, incident) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), ROUTING.timeoutMs);
  const coordinates = `${candidate.lng},${candidate.lat};${incident.lng},${incident.lat}`;
  const url = `${ROUTING.endpoint}/${coordinates}?overview=full&geometries=geojson&steps=false&alternatives=false`;

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`OSRM ${response.status}`);
    }

    const payload = await response.json();
    const route = payload.routes?.[0];
    if (payload.code !== "Ok" || !route?.geometry?.coordinates?.length) {
      throw new Error(payload.message || "Sin ruta vial");
    }

    return {
      distanceKm: route.distance / 1000,
      durationMinutes: route.duration / 60,
      geometry: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

function getCandidateKey(candidate) {
  return `${candidate.feature.properties.nombre}|${candidate.lat}|${candidate.lng}`;
}

function renderNearest(best, candidates, incident = getActiveIncident()) {
  if (!incident) return;

  const props = best.feature.properties;
  const distanceLabel = `${best.distanceKm.toFixed(1)} km`;
  const etaLabel = formatEta(best.etaMinutes);
  const routeLabel = best.routeSource === "road" ? "Ruta vial OSRM" : "Estimacion directa";
  const priorityFactor = PRIORITY_FACTORS[incident.priority] || 1;
  const priorityNote = priorityFactor !== 1 ? `; factor ${incident.priority.toLowerCase()} aplicado` : "";
  const routeNote =
    best.routeSource === "road"
      ? `${formatEta(Math.round(best.roadDurationMinutes))} viaje + ${props.alistamiento_min} min alistamiento${priorityNote}`
      : "Sin ruta vial disponible";

  els.nearestCard.classList.remove("empty-state");
  els.nearestCard.innerHTML = `
    <span class="status-tag">Foco ${incident.id}</span>
    <span class="status-tag">${props.estado}</span>
    <span class="status-tag route-tag">${routeLabel}</span>
    <h2>${props.nombre}</h2>
    <p>${props.tipo} | ${props.base} | ${props.personal} combatientes</p>
    <div class="nearest-meta">
      <span>${distanceLabel}</span>
      <strong>${etaLabel}</strong>
    </div>
    <p class="route-note">${routeNote}</p>
  `;

  els.distanceMetric.textContent = distanceLabel;
  els.etaMetric.textContent = etaLabel;
  els.availableMetric.textContent = candidates.length;
  els.consoleText.textContent = `Foco ${incident.id}: despacho sugerido ${props.nombre}, ETA ${etaLabel}, distancia ${distanceLabel} (${
    best.routeSource === "road" ? "ruta vial" : "estimacion directa"
  }).`;

  els.candidateList.innerHTML = candidates
    .slice(0, 5)
    .map((candidate, index) => {
      const candidateProps = candidate.feature.properties;
      const routeType = candidate.routeSource === "road" ? "ruta vial" : "directa";
      return `
        <li>
          <div class="candidate-name">
            <strong>${index + 1}. ${candidateProps.nombre}</strong>
            <span>${candidateProps.tipo} | ${candidate.distanceKm.toFixed(1)} km | ${routeType}</span>
          </div>
          <span class="candidate-eta">${formatEta(candidate.etaMinutes)}</span>
        </li>
      `;
    })
    .join("");
}

function formatEta(minutes) {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours} h ${remainder.toString().padStart(2, "0")} min`;
}

function drawRoute(best, incident) {
  if (incident.routeLine) {
    incident.routeLine.remove();
  }

  const routeLatLngs =
    best.routeGeometry && best.routeGeometry.length
      ? best.routeGeometry
      : [
          [incident.lat, incident.lng],
          [best.lat, best.lng],
        ];

  incident.routeLine = L.polyline(routeLatLngs, {
    color: "#ffca45",
    weight: best.routeSource === "road" ? 6.5 : 5.5,
    opacity: 0.98,
    dashArray: best.routeSource === "road" ? null : "8 8",
  }).addTo(state.map);

  incident.routeLine.on("click", () => selectIncident(incident.id));
  syncIncidentLayerStyles();

  if (incident.id === state.activeIncidentId) {
    const bounds = L.latLngBounds(routeLatLngs);
    state.map.fitBounds(bounds.pad(0.35), { maxZoom: 11, animate: false });
  }
}

async function analyzeIncidentExposure(incidentId) {
  const incident = getIncidentById(incidentId);
  if (!incident) return;

  incident.exposure = {
    status: "loading",
    summary: {},
    total: 0,
    error: null,
  };
  if (incident.id === state.activeIncidentId) {
    renderExposure(incident);
  }
  renderIncidentList();

  try {
    const summaryEntries = await Promise.all(
      Object.entries(EXPOSURE_DATASETS).map(async ([layerType, config]) => {
        const geojson = await getAnalysisGeoJson(layerType, config);
        return [layerType, analyzeGeoJsonWithinRadius(geojson, layerType, incident, config)];
      }),
    );

    const summary = Object.fromEntries(summaryEntries);
    const total = Object.values(summary).reduce((sum, item) => sum + item.count, 0);
    const currentIncident = getIncidentById(incidentId);
    if (!currentIncident) return;

    currentIncident.exposure = {
      status: "ready",
      summary,
      total,
      error: null,
      radiusKm: EXPOSURE_RADIUS_KM,
      calculatedAt: new Date(),
    };
    updateIncidentPopup(currentIncident);
    renderIncidentList();
    if (currentIncident.id === state.activeIncidentId) {
      renderExposure(currentIncident);
    }
  } catch (error) {
    const currentIncident = getIncidentById(incidentId);
    if (!currentIncident) return;
    currentIncident.exposure = {
      status: "error",
      summary: {},
      total: 0,
      error: error.message,
    };
    renderIncidentList();
    if (currentIncident.id === state.activeIncidentId) {
      renderExposure(currentIncident);
    }
  }
}

async function getAnalysisGeoJson(layerType, config) {
  if (state.data[layerType]) {
    return state.data[layerType];
  }

  if (state.analysisLoads[layerType]) {
    return state.analysisLoads[layerType];
  }

  const url = OPTIONAL_DATASETS[layerType];
  if (!url || config.source !== "optional") {
    throw new Error(`No hay fuente de analisis para ${getLayerTypeLabel(layerType)}.`);
  }

  state.analysisLoads[layerType] = fetch(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(`No se pudo cargar ${url}`);
    }
    const geojson = await response.json();
    state.data[layerType] = geojson;
    return geojson;
  });

  return state.analysisLoads[layerType];
}

function analyzeGeoJsonWithinRadius(geojson, layerType, incident, config) {
  const matches = (geojson?.features || [])
    .map((feature) => {
      const distanceKm = distanceToFeatureKm(incident.lat, incident.lng, feature.geometry);
      if (!Number.isFinite(distanceKm) || distanceKm > EXPOSURE_RADIUS_KM) {
        return null;
      }

      return {
        name: getFeatureName(feature.properties || {}, getLayerTypeLabel(layerType)),
        distanceKm,
        properties: feature.properties || {},
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  return {
    label: config.label,
    count: matches.length,
    nearest: matches.slice(0, config.limit),
  };
}

function distanceToFeatureKm(lat, lng, geometry) {
  if (!geometry) return Number.POSITIVE_INFINITY;

  if (geometry.type === "Point") {
    const [featureLng, featureLat] = geometry.coordinates;
    return haversineKm(lat, lng, featureLat, featureLng);
  }

  if (geometry.type === "LineString") {
    return minDistanceToCoordinatesKm(lat, lng, geometry.coordinates);
  }

  if (geometry.type === "Polygon") {
    if (pointInPolygon([lng, lat], geometry.coordinates)) return 0;
    return minDistanceToRingsKm(lat, lng, geometry.coordinates);
  }

  if (geometry.type === "MultiPoint" || geometry.type === "MultiLineString") {
    return minDistanceToNestedCoordinatesKm(lat, lng, geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    let minDistance = Number.POSITIVE_INFINITY;
    geometry.coordinates.forEach((polygon) => {
      const distance = pointInPolygon([lng, lat], polygon) ? 0 : minDistanceToRingsKm(lat, lng, polygon);
      if (distance < minDistance) minDistance = distance;
    });
    return minDistance;
  }

  if (geometry.type === "GeometryCollection") {
    let minDistance = Number.POSITIVE_INFINITY;
    geometry.geometries.forEach((child) => {
      const distance = distanceToFeatureKm(lat, lng, child);
      if (distance < minDistance) minDistance = distance;
    });
    return minDistance;
  }

  return Number.POSITIVE_INFINITY;
}

function minDistanceToCoordinatesKm(lat, lng, coordinates) {
  if (!Array.isArray(coordinates) || !coordinates.length) return Number.POSITIVE_INFINITY;
  let minDistance = Number.POSITIVE_INFINITY;
  coordinates.forEach((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length < 2) return;
    const [featureLng, featureLat] = coordinate;
    const distance = haversineKm(lat, lng, featureLat, featureLng);
    if (distance < minDistance) minDistance = distance;
  });
  return minDistance;
}

function minDistanceToRingsKm(lat, lng, rings) {
  let minDistance = Number.POSITIVE_INFINITY;
  rings.forEach((ring) => {
    const distance = minDistanceToCoordinatesKm(lat, lng, ring);
    if (distance < minDistance) minDistance = distance;
  });
  return minDistance;
}

function minDistanceToNestedCoordinatesKm(lat, lng, coordinates) {
  const distances = [];
  const visit = (node) => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === "number" && typeof node[1] === "number") {
      distances.push(haversineKm(lat, lng, node[1], node[0]));
      return;
    }
    node.forEach(visit);
  };
  visit(coordinates);
  return distances.length ? Math.min(...distances) : Number.POSITIVE_INFINITY;
}

function pointInPolygon(point, rings) {
  if (!rings?.length) return false;
  if (!pointInRing(point, rings[0])) return false;
  return !rings.slice(1).some((ring) => pointInRing(point, ring));
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

function renderExposure(incident = getActiveIncident()) {
  if (!els.exposureCard) return;

  if (!incident) {
    els.exposureCard.classList.add("empty-state");
    els.exposureCard.innerHTML = `
      <h2 id="exposure-title">Contexto visible - 5 km</h2>
      <p>El analisis se activa al crear o seleccionar un foco.</p>
    `;
    return;
  }

  const exposure = incident.exposure || { status: "pending" };
  if (exposure.status === "loading" || exposure.status === "pending") {
    els.exposureCard.classList.remove("empty-state");
    els.exposureCard.innerHTML = `
      <span class="status-tag">Foco ${incident.id}</span>
      <span class="status-tag route-tag">Radio ${EXPOSURE_RADIUS_KM} km</span>
      <h2>Analizando contexto visible</h2>
      ${renderExposureOperationalContext(incident)}
      <p>Cargando base georreferenciada de predios, localidades e infraestructura.</p>
    `;
    return;
  }

  if (exposure.status === "error") {
    els.exposureCard.classList.add("empty-state");
    els.exposureCard.innerHTML = `
      <span class="status-tag">Foco ${incident.id}</span>
      <h2>Analisis no disponible</h2>
      ${renderExposureOperationalContext(incident)}
      <p>${escapeHtml(exposure.error || "No fue posible calcular exposicion.")}</p>
    `;
    return;
  }

  const sections = Object.entries(exposure.summary)
    .map(([, item]) => {
      const rows = item.nearest.length
        ? item.nearest
            .map(
              (match) => `
                <li>
                  <span>${escapeHtml(match.name)}</span>
                  <strong>${match.distanceKm.toFixed(1)} km</strong>
                </li>
              `,
            )
            .join("")
        : '<li class="muted-row">Sin elementos dentro del radio.</li>';

      return `
        <div class="exposure-group">
          <div class="exposure-group-title">
            <span>${escapeHtml(item.label)}</span>
            <strong>${item.count}</strong>
          </div>
          <ul>${rows}</ul>
        </div>
      `;
    })
    .join("");

  els.exposureCard.classList.remove("empty-state");
  els.exposureCard.innerHTML = `
    <span class="status-tag">Foco ${incident.id}</span>
    <span class="status-tag route-tag">Radio ${EXPOSURE_RADIUS_KM} km</span>
    <h2>${exposure.total} elementos expuestos</h2>
    ${renderExposureOperationalContext(incident)}
    <p>Base de analisis georreferenciada, no necesariamente visible como capa operacional.</p>
    <div class="exposure-summary">${sections}</div>
  `;
}

function renderExposureOperationalContext(incident) {
  const wind = incident.wind || estimateWindContext(incident);
  const location = getIncidentLocationLabel(incident);
  const commune = incident.context?.commune?.name || "--";
  const towers = incident.towerBearings?.length
    ? incident.towerBearings
        .slice(0, 3)
        .map((tower) => `${tower.name} ${formatBearing(tower.bearing)}`)
        .join(" | ")
    : "Sin torres calculadas";

  return `
    <div class="exposure-context-grid">
      <div>
        <span>Localidad</span>
        <strong>${escapeHtml(location || "Resolviendo")}</strong>
      </div>
      <div>
        <span>Comuna</span>
        <strong>${escapeHtml(commune)}</strong>
      </div>
      <div>
        <span>Viento ref.</span>
        <strong>${escapeHtml(wind.fromCardinal)} -> ${formatBearing(wind.toDegrees)} | ${wind.speedKmh} km/h</strong>
      </div>
      <div>
        <span>Azimut torres</span>
        <strong>${escapeHtml(towers)}</strong>
      </div>
    </div>
  `;
}

function renderIncidentList() {
  if (!els.incidentList) return;

  if (!state.incidents.length) {
    els.incidentList.innerHTML = '<li class="muted-row">Sin focos activos.</li>';
    return;
  }

  els.incidentList.innerHTML = state.incidents
    .map((incident) => {
      const isActive = incident.id === state.activeIncidentId;
      const best = incident.dispatch?.best;
      const dispatchLabel = incident.isRouting
        ? "Calculando"
        : best
          ? `${getFeatureName(best.feature.properties, "Brigada")} | ${formatEta(best.etaMinutes)}`
          : "Pendiente";
      const exposureLabel =
        incident.exposure?.status === "ready"
          ? `Exposicion: ${incident.exposure.total}`
          : incident.exposure?.status === "loading"
            ? "Exposicion: analizando"
            : "Exposicion: pendiente";
      const locationLabel = getIncidentLocationLabel(incident);

      return `
        <li class="${isActive ? "is-active" : ""}">
          <button class="incident-select-button" type="button" data-select-incident="${incident.id}">
            <span class="incident-main">
              <strong>${incident.id} | ${escapeHtml(incident.priority)}</strong>
              <small>${escapeHtml(locationLabel)}</small>
              <small>${formatDmsPair(incident.lat, incident.lng)}</small>
              <small>${escapeHtml(exposureLabel)}</small>
            </span>
            <span class="incident-status">${escapeHtml(dispatchLabel)}</span>
          </button>
          <div class="incident-actions" aria-label="Acciones foco ${incident.id}">
            <button class="mini-action" type="button" data-recalculate-incident="${incident.id}" title="Recalcular despacho">
              <i data-lucide="rotate-cw" aria-hidden="true"></i>
            </button>
            <button class="mini-action danger" type="button" data-delete-incident="${incident.id}" title="Eliminar foco">
              <i data-lucide="x" aria-hidden="true"></i>
            </button>
          </div>
        </li>
      `;
    })
    .join("");

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function deleteIncident(id) {
  const incident = getIncidentById(id);
  if (!incident) return;

  incident.routeRequestId += 1;
  incident.marker?.remove();
  incident.exposureCircle?.remove();
  incident.locationLabel?.remove();
  incident.windLayer?.remove();
  incident.towerBearingLayer?.remove();
  incident.routeLine?.remove();
  state.incidents = state.incidents.filter((item) => item.id !== id);

  if (state.activeIncidentId === id) {
    state.activeIncidentId = null;
    const nextIncident = state.incidents[0];
    if (nextIncident) {
      selectIncident(nextIncident.id);
    } else {
      clearDispatchPanel();
      renderIncidentList();
    }
  } else {
    renderIncidentList();
    syncIncidentLayerStyles();
  }

  els.consoleText.textContent = `Foco ${id} eliminado del registro operativo.`;
  scheduleMapRefresh();
}

function clearIncidents() {
  state.incidents.forEach((incident) => {
    incident.routeRequestId += 1;
    incident.marker?.remove();
    incident.exposureCircle?.remove();
    incident.locationLabel?.remove();
    incident.windLayer?.remove();
    incident.towerBearingLayer?.remove();
    incident.routeLine?.remove();
  });
  state.incidents = [];
  state.activeIncidentId = null;
  clearDispatchPanel();
  renderIncidentList();
  els.consoleText.textContent = "Focos activos eliminados del registro operativo.";
  scheduleMapRefresh();
}

function clearDispatchPanel() {
  els.nearestCard.classList.add("empty-state");
  els.nearestCard.innerHTML = `
    <h2 id="nearest-title">Sin foco activo</h2>
    <p>Canal de despacho en espera de coordenadas.</p>
  `;
  els.distanceMetric.textContent = "--";
  els.etaMetric.textContent = "--";
  els.candidateList.innerHTML = '<li class="muted-row">Esperando coordenadas.</li>';
  renderExposure(null);
  updateDatasetMetrics();
}

function recalculateAllIncidents() {
  if (!state.incidents.length) return;
  state.incidents.forEach((incident) => calculateNearestBrigades(incident.id));
}

function updateDatasetMetrics() {
  const available = state.data.brigades
    ? getDispatchBrigadeFeatures()
        .map((feature) => normalizeBrigadeProperties(feature.properties))
        .filter((props) => props.disponible).length
    : "--";
  els.availableMetric.textContent = available;
  els.towerMetric.textContent = state.data.towers?.features?.length ?? "--";
  els.protectedMetric.textContent = state.data.protected?.features?.length ?? "--";
}

function fitOperationalArea() {
  const bounds = L.latLngBounds([]);
  Object.values(state.layers)
    .filter(Boolean)
    .filter((layer) => state.map.hasLayer(layer))
    .forEach((layer) => extendBounds(bounds, layer));

  if (state.incidentLayer?.getLayers().length) {
    extendBounds(bounds, state.incidentLayer);
  }

  if (bounds.isValid()) {
    state.map.fitBounds(bounds.pad(0.12), { animate: false });
    scheduleMapRefresh();
  }
}

function extendBounds(bounds, layer) {
  if (typeof layer.getBounds === "function") {
    bounds.extend(layer.getBounds());
    return;
  }

  if (typeof layer.getLatLng === "function") {
    bounds.extend(layer.getLatLng());
    return;
  }

  if (typeof layer.eachLayer === "function") {
    layer.eachLayer((childLayer) => extendBounds(bounds, childLayer));
  }
}

function scheduleMapRefresh() {
  syncMapElementSize();
  state.map.invalidateSize({ animate: false });

  requestAnimationFrame(() => {
    syncMapElementSize();
    state.map.invalidateSize({ animate: false });
  });

  window.setTimeout(() => {
    syncMapElementSize();
    state.map.invalidateSize({ animate: false });
  }, 250);

  window.setTimeout(() => {
    syncMapElementSize();
    state.map.invalidateSize({ animate: false });
  }, 750);
}

function syncMapElementSize() {
  const stage = document.querySelector(".map-stage");
  const mapElement = document.querySelector("#map");
  if (!stage || !mapElement) return;

  const rect = stage.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  mapElement.style.width = `${Math.round(rect.width)}px`;
  mapElement.style.height = `${Math.round(rect.height)}px`;
}

function setFeedback(message) {
  els.feedback.textContent = message;
}

async function handleLayerImport() {
  const file = els.layerFile.files?.[0];
  if (!file) {
    setImportFeedback("Selecciona un archivo de capa.", false);
    return;
  }

  try {
    const layerType = els.layerType.value;
    const layerName = els.layerName.value.trim() || cleanLayerName(file.name);
    const geojson = await parseLayerFile(file, layerType);
    const layer = createOperationalGeoJsonLayer(geojson, layerType);
    const id = `import-${state.nextImportId}`;

    state.nextImportId += 1;
    layer.addTo(state.map);
    state.importedLayers.push({
      id,
      name: layerName,
      type: layerType,
      geojson,
      layer,
      featureCount: geojson.features.length,
      fileName: file.name,
    });

    renderImportedLayerList();
    updateDatasetMetrics();
    if (state.incidents.length && layerType === "brigades") {
      recalculateAllIncidents();
    } else {
      fitOperationalArea();
    }

    els.layerFile.value = "";
    els.layerName.value = "";
    setImportFeedback(`${layerName}: ${geojson.features.length} elementos cargados.`, true);
    els.consoleText.textContent = `Capa cargada: ${layerName} (${geojson.features.length} elementos).`;
  } catch (error) {
    setImportFeedback(error.message, false);
    els.consoleText.textContent = error.message;
  }
}

async function parseLayerFile(file, layerType) {
  const extension = getFileExtension(file.name);

  if (extension === "geojson" || extension === "json") {
    return normalizeGeoJson(JSON.parse(await file.text()));
  }

  if (extension === "kml") {
    return parseKmlToGeoJson(await file.text());
  }

  if (extension === "kmz") {
    return parseKmzToGeoJson(file);
  }

  if (extension === "csv") {
    return parseCsvToGeoJson(await file.text(), layerType);
  }

  throw new Error("Formato no soportado. Usa GeoJSON, KML, KMZ o CSV.");
}

function normalizeGeoJson(input) {
  if (input?.type === "FeatureCollection" && Array.isArray(input.features)) {
    return input;
  }

  if (input?.type === "Feature") {
    return {
      type: "FeatureCollection",
      features: [input],
    };
  }

  throw new Error("El archivo no contiene GeoJSON valido.");
}

async function parseKmzToGeoJson(file) {
  if (!window.JSZip) {
    throw new Error("No se pudo cargar el lector KMZ.");
  }

  const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
  const kmlEntry = Object.values(zip.files).find((entry) => entry.name.toLowerCase().endsWith(".kml"));
  if (!kmlEntry) {
    throw new Error("El KMZ no contiene un archivo KML.");
  }

  return parseKmlToGeoJson(await kmlEntry.async("text"));
}

function parseKmlToGeoJson(kmlText) {
  const xml = new DOMParser().parseFromString(kmlText, "text/xml");
  if (xml.querySelector("parsererror")) {
    throw new Error("El archivo KML no es valido.");
  }

  const features = Array.from(xml.querySelectorAll("Placemark"))
    .map((placemark) => {
      const geometry = parsePlacemarkGeometry(placemark);
      if (!geometry) return null;

      return {
        type: "Feature",
        properties: parsePlacemarkProperties(placemark),
        geometry,
      };
    })
    .filter(Boolean);

  if (!features.length) {
    throw new Error("El KML no contiene geometria compatible.");
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function parsePlacemarkProperties(placemark) {
  const properties = {};
  const name = placemark.querySelector("name")?.textContent?.trim();
  const description = placemark.querySelector("description")?.textContent?.trim();

  if (name) properties.nombre = name;
  if (description) properties.descripcion = description;

  placemark.querySelectorAll("Data").forEach((node) => {
    const key = node.getAttribute("name");
    const value = node.querySelector("value")?.textContent?.trim();
    if (key && value) properties[key] = value;
  });

  placemark.querySelectorAll("SimpleData").forEach((node) => {
    const key = node.getAttribute("name");
    const value = node.textContent?.trim();
    if (key && value) properties[key] = value;
  });

  return properties;
}

function parsePlacemarkGeometry(placemark) {
  const geometries = [];

  placemark.querySelectorAll("Point").forEach((point) => {
    const coordinates = parseCoordinateText(point.querySelector("coordinates")?.textContent || "");
    if (coordinates[0]) {
      geometries.push({
        type: "Point",
        coordinates: coordinates[0],
      });
    }
  });

  placemark.querySelectorAll("LineString").forEach((line) => {
    const coordinates = parseCoordinateText(line.querySelector("coordinates")?.textContent || "");
    if (coordinates.length >= 2) {
      geometries.push({
        type: "LineString",
        coordinates,
      });
    }
  });

  placemark.querySelectorAll("Polygon").forEach((polygon) => {
    const outerRing = polygon.querySelector("outerBoundaryIs coordinates");
    const rings = [];
    const exterior = parseCoordinateText(outerRing?.textContent || "");
    if (exterior.length >= 4) {
      rings.push(closeLinearRing(exterior));
    }

    polygon.querySelectorAll("innerBoundaryIs coordinates").forEach((innerRing) => {
      const interior = parseCoordinateText(innerRing.textContent || "");
      if (interior.length >= 4) {
        rings.push(closeLinearRing(interior));
      }
    });

    if (rings.length) {
      geometries.push({
        type: "Polygon",
        coordinates: rings,
      });
    }
  });

  if (geometries.length === 1) {
    return geometries[0];
  }

  if (geometries.length > 1) {
    return {
      type: "GeometryCollection",
      geometries,
    };
  }

  return null;
}

function parseCoordinateText(text) {
  return text
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [lng, lat] = pair.split(",").map(Number);
      return Number.isFinite(lat) && Number.isFinite(lng) ? [lng, lat] : null;
    })
    .filter(Boolean);
}

function closeLinearRing(coordinates) {
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return [...coordinates, first];
  }
  return coordinates;
}

function parseCsvToGeoJson(text, layerType) {
  const delimiter = detectCsvDelimiter(text);
  const rows = parseDelimitedRows(text, delimiter).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) {
    throw new Error("El CSV debe incluir encabezados y al menos una fila.");
  }

  const headers = rows[0].map((header) => header.trim());
  const normalizedHeaders = headers.map(normalizeHeader);
  const latIndex = findHeaderIndex(normalizedHeaders, ["lat", "latitud", "latitude", "y"]);
  const lngIndex = findHeaderIndex(normalizedHeaders, ["lng", "lon", "long", "longitud", "longitude", "x"]);

  if (latIndex < 0 || lngIndex < 0) {
    throw new Error("El CSV necesita columnas latitud/longitud o lat/lon.");
  }

  const features = rows
    .slice(1)
    .map((row) => {
      const lat = normalizeNumber(row[latIndex]);
      const lng = normalizeNumber(row[lngIndex]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      const properties = {};
      headers.forEach((header, index) => {
        properties[header || `campo_${index + 1}`] = row[index] || "";
      });
      if (!properties.nombre && !properties.name) {
        properties.nombre = `${getLayerTypeLabel(layerType)} ${featuresLabelIndex(properties)}`;
      }

      return {
        type: "Feature",
        properties,
        geometry: {
          type: "Point",
          coordinates: [lng, lat],
        },
      };
    })
    .filter(Boolean);

  if (!features.length) {
    throw new Error("El CSV no contiene coordenadas validas.");
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function detectCsvDelimiter(text) {
  const firstLine = text.split(/\r?\n/)[0] || "";
  const commas = (firstLine.match(/,/g) || []).length;
  const semicolons = (firstLine.match(/;/g) || []).length;
  return semicolons > commas ? ";" : ",";
}

function parseDelimitedRows(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  rows.push(row);
  return rows;
}

function findHeaderIndex(headers, candidates) {
  return headers.findIndex((header) => candidates.includes(header));
}

function normalizeHeader(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function createOperationalGeoJsonLayer(geojson, layerType) {
  const group = L.layerGroup();
  const geoJsonLayer = L.geoJSON(geojson, {
    style: (feature) => getGeometryStyle(layerType, feature),
    pointToLayer: (feature, latlng) =>
      L.marker(latlng, {
        icon: createDivIcon(getMarkerClass(layerType, feature), getMarkerLetter(layerType)),
      }),
    onEachFeature: (feature, layer) => {
      bindOperationalPopup(feature, layer, layerType);
      if (layerType === "towers" && feature.geometry?.type === "Point") {
        const radiusKm = normalizeNumber(feature.properties?.radio_km || feature.properties?.radio || "0");
        if (radiusKm > 0 && typeof layer.getLatLng === "function") {
          L.circle(layer.getLatLng(), {
            radius: radiusKm * 1000,
            color: "#49b8d8",
            weight: 1,
            fillOpacity: 0.04,
          }).addTo(group);
        }
      }
    },
  });

  geoJsonLayer.addTo(group);
  return group;
}

function getGeometryStyle(layerType, feature) {
  const color = getLayerColor(layerType, feature);
  const isBoundary = layerType === "protected" || layerType === "communes" || layerType === "properties" || layerType === "roles";
  const isNetwork = layerType === "roads" || layerType === "hydrography" || layerType === "powerlines";
  const weight = isNetwork ? 3.4 : layerType === "communes" ? 2.1 : layerType === "protected" ? 2.4 : 2.3;
  return {
    color,
    weight,
    opacity: layerType === "communes" ? 0.82 : 0.96,
    fillColor: color,
    fillOpacity: isBoundary ? 0.07 : layerType === "critical" ? 0.2 : 0.08,
  };
}

function getLayerColor(layerType, feature) {
  if (feature?.properties?.color) return feature.properties.color;

  const colors = {
    brigades: "#26a269",
    towers: "#49b8d8",
    critical: "#ffb13b",
    technical: "#e36da8",
    protected: "#78f06d",
    water_sources: "#23c7ff",
    communes: "#c4f26c",
    hydrography: "#23c7ff",
    roads: "#ffd15c",
    properties: "#d28cff",
    localities: "#ff8b6e",
    powerlines: "#ffe66d",
    roles: "#d7e2de",
    general: "#d7e2de",
  };

  return colors[layerType] || colors.general;
}

function getMarkerClass(layerType, feature) {
  if (layerType === "brigades") {
    return normalizeBrigadeProperties(feature.properties).disponible ? "brigade" : "brigade offline";
  }

  const classes = {
    towers: "tower",
    critical: "critical",
    technical: "technical",
    protected: "protected",
    water_sources: "water_sources",
    communes: "communes",
    hydrography: "water_sources",
    roads: "general",
    localities: "localities",
    properties: "properties",
    powerlines: "powerlines",
    general: "general",
  };

  return classes[layerType] || classes.general;
}

function getMarkerLetter(layerType) {
  const letters = {
    brigades: "B",
    towers: "T",
    critical: "C",
    technical: "P",
    protected: "A",
    water_sources: "W",
    communes: "M",
    hydrography: "H",
    roads: "R",
    properties: "P",
    localities: "L",
    powerlines: "E",
    general: "G",
  };

  return letters[layerType] || "G";
}

function bindOperationalPopup(feature, layer, layerType) {
  const props = feature.properties || {};
  const title = getFeatureName(props, getLayerTypeLabel(layerType));
  const rows = Object.entries(props)
    .filter(([key]) => !["name", "nombre"].includes(key.toLowerCase()))
    .slice(0, 8)
    .map(
      ([key, value]) =>
        `<p class="popup-line"><strong>${escapeHtml(key)}:</strong> ${escapeHtml(String(value))}</p>`,
    )
    .join("");

  layer.bindPopup(`
    <h3 class="popup-title">${escapeHtml(title)}</h3>
    ${rows || `<p class="popup-line">${escapeHtml(getLayerTypeLabel(layerType))}</p>`}
  `);
}

function getDispatchBrigadeFeatures() {
  const baseFeatures = state.data.brigades?.features || [];
  const importedFeatures = state.importedLayers
    .filter((layer) => layer.type === "brigades")
    .flatMap((layer) => layer.geojson.features);

  return [...baseFeatures, ...importedFeatures];
}

function normalizeBrigadeProperties(properties = {}) {
  const disponible = parseAvailability(properties.disponible ?? properties.disponibilidad ?? properties.estado);
  return {
    ...properties,
    nombre: getFeatureName(properties, "Brigada importada"),
    tipo: properties.tipo || properties.clase || "Brigada",
    base: properties.base || properties.comuna || properties.sector || "Base no informada",
    estado: properties.estado || (disponible ? "Disponible" : "No disponible"),
    disponible,
    personal: normalizeInteger(properties.personal || properties.dotacion || properties.combatientes, 0),
    velocidad_kmh: normalizeNumber(properties.velocidad_kmh || properties.velocidad || "50") || 50,
    alistamiento_min: normalizeNumber(properties.alistamiento_min || properties.alistamiento || "10") || 10,
  };
}

function parseAvailability(value) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return true;

  const normalized = String(value).trim().toLowerCase();
  if (["false", "no", "0", "inactivo", "no disponible", "mantenimiento"].includes(normalized)) {
    return false;
  }

  return true;
}

function normalizeInteger(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function renderImportedLayerList() {
  if (!state.importedLayers.length) {
    els.importedLayerList.innerHTML = '<li class="muted-row">Sin capas externas.</li>';
    return;
  }

  els.importedLayerList.innerHTML = state.importedLayers
    .map(
      (layer) => `
        <li>
          <span title="${escapeHtml(layer.fileName)}">${escapeHtml(layer.name)} | ${escapeHtml(
            getLayerTypeLabel(layer.type),
          )} | ${layer.featureCount}</span>
          <button class="remove-layer-button" type="button" data-remove-import="${layer.id}" title="Quitar capa">
            <i data-lucide="x" aria-hidden="true"></i>
          </button>
        </li>
      `,
    )
    .join("");

  document.querySelectorAll("[data-remove-import]").forEach((button) => {
    button.addEventListener("click", () => removeImportedLayer(button.dataset.removeImport));
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function removeImportedLayer(id) {
  const target = state.importedLayers.find((layer) => layer.id === id);
  if (!target) return;

  target.layer.remove();
  state.importedLayers = state.importedLayers.filter((layer) => layer.id !== id);
  renderImportedLayerList();
  updateDatasetMetrics();

  if (state.incidents.length && target.type === "brigades") {
    recalculateAllIncidents();
  }

  setImportFeedback(`${target.name} retirada del mapa.`, true);
}

function clearImportedLayers() {
  const hadBrigades = state.importedLayers.some((layer) => layer.type === "brigades");
  state.importedLayers.forEach((layer) => layer.layer.remove());
  state.importedLayers = [];
  renderImportedLayerList();
  updateDatasetMetrics();
  if (hadBrigades && state.incidents.length) {
    recalculateAllIncidents();
  }
  setImportFeedback("Capas externas retiradas.", true);
}

function getFeatureName(properties = {}, fallback) {
  const candidates = [
    properties.nombre,
    properties.NOMBRE,
    properties.Nombre,
    properties.name,
    properties.Name,
    properties.LOCALIDAD,
    properties.Localidad,
    properties.NOM_LOC,
    properties.NOM_LOCALI,
    properties.SECTOR,
    properties.Nom_Ruta,
    properties.NOM_PREDIO,
    properties.COMUNA,
    properties.codigo,
    properties.id,
  ];
  const value = candidates.find(isMeaningfulName);
  return value || fallback;
}

function getMeaningfulPropertyName(properties = {}, keys = []) {
  for (const key of keys) {
    if (isMeaningfulName(properties[key])) {
      return String(properties[key]).trim();
    }
  }
  return null;
}

function isMeaningfulName(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  const normalized = text.toLowerCase();
  return !["<null>", "null", "undefined", "-", "s/i", "sin informacion", "localities"].includes(normalized);
}

function getLayerTypeLabel(layerType) {
  const labels = {
    brigades: "Brigadas",
    towers: "Torres",
    critical: "Estructuras criticas",
    technical: "Personal tecnico",
    protected: "Areas protegidas",
    water_sources: "Fuentes de agua",
    communes: "Comunas",
    hydrography: "Hidrografia",
    roads: "Caminos",
    properties: "Predios empresa",
    localities: "Localidades",
    powerlines: "Linea electrica",
    roles: "Roles",
    general: "General",
  };

  return labels[layerType] || labels.general;
}

function featuresLabelIndex(properties) {
  return properties.id || properties.codigo || "";
}

function cleanLayerName(fileName) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
}

function getFileExtension(fileName) {
  return fileName.toLowerCase().split(".").pop();
}

function setImportFeedback(message, isSuccess) {
  els.importFeedback.textContent = message;
  els.importFeedback.classList.toggle("success", Boolean(isSuccess));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
