// Nova X Rides — the map layer.
//
// Leaflet + OpenStreetMap tiles: a real, live, pannable map with zero API
// key and zero billing account, which is why it's here instead of Google or
// Mapbox. Everything in this file is deliberately provider-agnostic — swap
// the TILE_URL and this whole app moves to Mapbox/Google without any screen
// changing, because no view touches Leaflet directly.
//
// What this gives the money screens: pickup/dropoff pins, a live driver
// marker that animates between GPS pings, a route line, and a fitted
// viewport. That's the difference between "app that looks like a demo" and
// "app people trust with their location."

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

// Carto's light basemap — cleaner and less visually noisy than raw OSM, and
// it sits properly under our light UI instead of fighting it.
const TILE_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIB = '&copy; OpenStreetMap &copy; CARTO';

const KARACHI = { lat: 24.8607, lng: 67.0011 };

let leafletReady = null;

/** Load Leaflet once, lazily — no reason to pay for it on screens with no map. */
function ensureLeaflet() {
  if (leafletReady) return leafletReady;
  leafletReady = new Promise((resolve, reject) => {
    if (typeof window.L !== "undefined") return resolve(window.L);

    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("Couldn't load the map library"));
    document.head.appendChild(script);
  });
  return leafletReady;
}

/** Coloured teardrop pin as a divIcon — no image assets, themable from CSS
 * variables, and crisp at any density. */
function pinIcon(L, { color = "var(--accent)", glyph = "" } = {}) {
  return L.divIcon({
    className: "nx-pin-wrap",
    html: `<div class="nx-pin" style="--pin:${color};">${glyph}</div>`,
    iconSize: [28, 36],
    iconAnchor: [14, 34],
  });
}

function vehicleIcon(L) {
  return L.divIcon({
    className: "nx-pin-wrap",
    html: `<div class="nx-driver-marker"></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/**
 * Mount a map into `container`.
 *
 * Returns a small handle the views drive — deliberately narrow so no screen
 * ever reaches into Leaflet internals (that's what keeps the provider swap
 * cheap).
 */
export async function createMap(container, opts = {}) {
  const L = await ensureLeaflet();
  const center = opts.center || KARACHI;

  const map = L.map(container, {
    center: [center.lat, center.lng],
    zoom: opts.zoom ?? 14,
    zoomControl: false,
    attributionControl: true,
    // A map inside a scrolling page that hijacks the wheel is infuriating;
    // drag/pinch still work.
    scrollWheelZoom: !!opts.scrollWheelZoom,
    // Touch-first: the map is usually behind a bottom sheet.
    tap: true,
  });

  L.tileLayer(TILE_URL, { attribution: TILE_ATTRIB, maxZoom: 19 }).addTo(map);

  let pickupMarker = null;
  let dropoffMarker = null;
  let driverMarker = null;
  let routeLine = null;

  function setMarker(existing, coords, icon) {
    if (!coords) {
      if (existing) map.removeLayer(existing);
      return null;
    }
    if (existing) {
      existing.setLatLng([coords.lat, coords.lng]);
      return existing;
    }
    return L.marker([coords.lat, coords.lng], { icon }).addTo(map);
  }

  const handle = {
    raw: map,

    setPickup(coords) {
      pickupMarker = setMarker(pickupMarker, coords, pinIcon(L, { color: "var(--accent)" }));
    },
    setDropoff(coords) {
      dropoffMarker = setMarker(dropoffMarker, coords, pinIcon(L, { color: "var(--accent-2)" }));
    },
    setDriver(coords) {
      driverMarker = setMarker(driverMarker, coords, vehicleIcon(L));
    },

    /** Straight line between points. Honest about what it is: we have no
     * routing engine, so this is the direct path, not the road path. Swap
     * for a real polyline the moment a routing provider exists. */
    setRoute(points) {
      if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
      const valid = (points || []).filter(Boolean);
      if (valid.length < 2) return;
      routeLine = L.polyline(valid.map((p) => [p.lat, p.lng]), {
        color: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#0fa968",
        weight: 4,
        opacity: 0.75,
        dashArray: "1 8",
        lineCap: "round",
      }).addTo(map);
    },

    /** Fit everything currently on the map, with room for the bottom sheet. */
    fit(points, padding = [50, 50]) {
      const valid = (points || []).filter(Boolean);
      if (valid.length === 0) return;
      if (valid.length === 1) { map.setView([valid[0].lat, valid[0].lng], 15); return; }
      map.fitBounds(valid.map((p) => [p.lat, p.lng]), { padding });
    },

    center(coords, zoom) {
      if (coords) map.setView([coords.lat, coords.lng], zoom ?? map.getZoom());
    },

    /** Leaflet mis-sizes itself when its container was hidden/resized while
     * it wasn't looking — every sheet-over-map screen needs this. */
    refresh() {
      setTimeout(() => map.invalidateSize(), 60);
    },

    destroy() {
      try { map.remove(); } catch { /* already torn down */ }
    },
  };

  handle.refresh();
  return handle;
}

/** Placeholder for screens where the map hasn't loaded (or failed to). Keeps
 * the layout stable instead of collapsing to nothing. */
export function mapSkeleton(height = "280px") {
  return `<div class="nx-map-skeleton skeleton" style="height:${height};"></div>`;
}

export { KARACHI };
