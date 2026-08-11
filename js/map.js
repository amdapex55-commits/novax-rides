// Nova Go Rides — the map layer.
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

/** Respect the OS "reduce motion" setting for every animation in this file. */
function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

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
  let routeCasing = null;
  let driverAnim = 0;
  let extraMarkers = [];
  let accuracyRing = null;
  let nearbyMarkers = [];

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

    /**
     * NOVA PULSE — the accuracy halo.
     *
     * Browser geolocation gives a confidence radius in metres, and until now
     * we used it only to allow or block a booking. Drawing it does something
     * no competitor here does: it shows the customer *how well we know where
     * they are*, in the same units the rider will experience. A tight 15m
     * ring reads as "they've got me". An 800m ring explains, without words,
     * why we're asking them to type an address.
     *
     * It's a real circle in map units, so it scales correctly as you zoom —
     * not a fixed-pixel decoration.
     */
    setAccuracy(coords, meters) {
      if (accuracyRing) { map.removeLayer(accuracyRing); accuracyRing = null; }
      if (!coords || !meters) return;
      const good = meters <= 120;
      accuracyRing = L.circle([coords.lat, coords.lng], {
        radius: meters,
        color: good ? "#6d28d9" : "#d97706",
        weight: 1.5,
        opacity: 0.55,
        fillColor: good ? "#6d28d9" : "#d97706",
        fillOpacity: 0.10,
        className: "nx-accuracy-ring",
        interactive: false,
      }).addTo(map);
    },

    /**
     * Live rider density near a point — supply, made visible.
     *
     * Ride-hailing apps show ghost cars that mean nothing. These are the
     * real online riders from the matching service, so "4 riders nearby"
     * is a fact the customer can trust, and an empty map honestly says
     * we can't serve them right now instead of pretending.
     */
    setNearbyRiders(riders = []) {
      nearbyMarkers.forEach((m) => map.removeLayer(m));
      nearbyMarkers = riders
        .filter((r) => typeof r?.lat === "number" && typeof r?.lng === "number")
        .map((r) =>
          L.marker([r.lat, r.lng], {
            icon: L.divIcon({
              className: "nx-pin-wrap",
              html: `<div class="nx-rider-dot"></div>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            }),
            interactive: false,
            zIndexOffset: -200, // always behind pickup/dropoff pins
          }).addTo(map),
        );
    },
    setDropoff(coords) {
      dropoffMarker = setMarker(dropoffMarker, coords, pinIcon(L, { color: "var(--accent-2)" }));
    },
    /** Move the driver marker. Leaflet snaps by default, which looks like
     * teleporting between GPS pings; we interpolate so the vehicle glides
     * along the road the way riders expect from Uber/Careem. */
    setDriver(coords, { animate = true } = {}) {
      if (!coords) { driverMarker = setMarker(driverMarker, null); return; }
      if (!driverMarker || !animate) {
        driverMarker = setMarker(driverMarker, coords, vehicleIcon(L));
        return;
      }
      const from = driverMarker.getLatLng();
      const to = L.latLng(coords.lat, coords.lng);
      // Beyond ~2km it's a GPS jump, not movement — snap rather than glide.
      if (from.distanceTo(to) > 2000) { driverMarker.setLatLng(to); return; }

      // Point the marker along its heading so it reads as a vehicle.
      const bearing =
        (Math.atan2(to.lng - from.lng, to.lat - from.lat) * 180) / Math.PI;
      const el = driverMarker.getElement()?.querySelector(".nx-driver-marker");
      if (el) el.style.setProperty("--bearing", `${bearing}deg`);

      const t0 = performance.now();
      const dur = 900;
      cancelAnimationFrame(driverAnim);
      const tick = (now) => {
        const p = Math.min((now - t0) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        driverMarker.setLatLng([
          from.lat + (to.lat - from.lat) * eased,
          from.lng + (to.lng - from.lng) * eased,
        ]);
        if (p < 1) driverAnim = requestAnimationFrame(tick);
      };
      driverAnim = requestAnimationFrame(tick);
    },

    /**
     * Draw a route. Pass the `coordinates` array from routing.js `getRoute()`
     * and this renders the actual road path; pass just two pins and it falls
     * back to a dashed direct line that is visibly provisional, so a straight
     * line can never masquerade as a real route.
     */
    setRoute(points) {
      if (routeCasing) { map.removeLayer(routeCasing); routeCasing = null; }
      if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
      const valid = (points || []).filter(Boolean);
      if (valid.length < 2) return;

      const latlngs = valid.map((p) => [p.lat, p.lng]);
      const accent =
        getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#6d28d9";
      const isRealRoute = valid.length > 2;

      if (isRealRoute) {
        // Casing underneath gives the line depth against busy map detail —
        // the trick every mapping app uses to keep a route legible.
        routeCasing = L.polyline(latlngs, {
          color: "#ffffff", weight: 9, opacity: 0.9, lineCap: "round", lineJoin: "round",
        }).addTo(map);
        routeLine = L.polyline(latlngs, {
          color: accent, weight: 5, opacity: 1, lineCap: "round", lineJoin: "round",
          className: "nx-route-line",
        }).addTo(map);

        // NOVA PULSE — draw the route rather than snapping it in.
        // The path animates from pickup to destination in ~900ms, which
        // makes the app feel like it is *working out* your route instead of
        // having a picture of one. Implemented with stroke-dasharray on the
        // real SVG path, so it costs nothing and degrades to a static line
        // if the browser won't animate.
        const path = routeLine.getElement?.();
        if (path && !prefersReducedMotion()) {
          try {
            const len = path.getTotalLength();
            path.style.strokeDasharray = `${len}`;
            path.style.strokeDashoffset = `${len}`;
            // Force layout so the transition has a start value to animate from.
            void path.getBoundingClientRect();
            path.style.transition = "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)";
            path.style.strokeDashoffset = "0";
          } catch { /* getTotalLength unsupported — static line is fine */ }
        }
      } else {
        routeLine = L.polyline(latlngs, {
          color: accent, weight: 4, opacity: 0.7, dashArray: "1 8", lineCap: "round",
        }).addTo(map);
      }
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

    /**
     * Plot a whole fleet — what the ops dashboard needs. Each entry is
     * { lat, lng, status, label }, and status drives colour so a dispatcher
     * can read availability from the map alone without clicking anything.
     */
    setFleet(drivers = []) {
      extraMarkers.forEach((m) => map.removeLayer(m));
      extraMarkers = [];
      // "stale" = we have a position but it's too old to act on. It reads as
      // grey and semi-transparent so a dispatcher's eye skips it, instead of
      // it sitting there looking exactly as dispatchable as a live driver.
      const colors = { idle: "#6d28d9", busy: "#e2960a", offline: "#98a5ad", stale: "#98a5ad" };
      drivers.forEach((d) => {
        if (typeof d?.lat !== "number" || typeof d?.lng !== "number") return;
        const color = colors[d.status] || colors.idle;
        const isStale = d.status === "stale";
        const marker = L.marker([d.lat, d.lng], {
          icon: L.divIcon({
            className: "nx-pin-wrap",
            html: `<div class="nx-fleet-dot${isStale ? " is-stale" : ""}" style="--dot:${color};"></div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          }),
          // Live drivers draw on top of dead ones where they overlap.
          zIndexOffset: isStale ? -100 : 0,
        }).addTo(map);
        if (d.label) marker.bindTooltip(String(d.label), { direction: "top", offset: [0, -8] });
        extraMarkers.push(marker);
      });
    },

    /** Leaflet mis-sizes itself when its container was hidden/resized while
     * it wasn't looking — every sheet-over-map screen needs this. */
    refresh() {
      setTimeout(() => map.invalidateSize(), 60);
    },

    destroy() {
      cancelAnimationFrame(driverAnim);
      nearbyMarkers.forEach((m) => { try { map.removeLayer(m); } catch {} });
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
