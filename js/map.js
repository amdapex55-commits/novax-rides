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

import { CONFIG } from "./config.js";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

// BASEMAP.
//
// Mapbox when a token is configured, Carto's free basemap when it isn't.
//
// The fallback is not a nicety. A map provider must never be a single point
// of failure for booking a ride: if the token is missing, expired, over quota
// or restricted to the wrong domain, every screen still works — it just looks
// plainer. Silently degrading beats a blank grey rectangle where the map
// should be.
//
// navigation-day-v1 over the general streets style: it's tuned for someone
// following a route, so road hierarchy is clearer and label density is lower,
// which is what you want on a 5-inch screen in daylight.
//
// @2x tiles because almost every phone in this market is a retina-class
// display, and 1x tiles look visibly soft on them.
const CARTO_TILES = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const CARTO_ATTRIB = "&copy; OpenStreetMap &copy; CARTO";

function basemap() {
  const token = CONFIG.MAP?.TOKEN;
  if (!token) {
    return { url: CARTO_TILES, attribution: CARTO_ATTRIB, maxZoom: 19 };
  }
  const style = CONFIG.MAP.STYLE || "mapbox/navigation-day-v1";
  return {
    url: `https://api.mapbox.com/styles/v1/${style}/tiles/512/{z}/{x}/{y}@2x?access_token=${token}`,
    attribution: '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    // 512px tiles carry a zoom offset of -1, or every label renders a zoom
    // level too large and the map reads as permanently zoomed in.
    tileSize: 512,
    zoomOffset: -1,
    maxZoom: 20,
  };
}

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

  const tiles = basemap();
  const layer = L.tileLayer(tiles.url, tiles).addTo(map);
  // If Mapbox refuses (bad token, wrong URL restriction, quota exhausted),
  // swap to Carto rather than leaving the customer looking at nothing.
  if (CONFIG.MAP?.TOKEN) {
    let swapped = false;
    layer.on("tileerror", () => {
      if (swapped) return;
      swapped = true;
      console.warn("[NovaGo] Mapbox tiles failed — falling back to the free basemap.");
      map.removeLayer(layer);
      L.tileLayer(CARTO_TILES, { attribution: CARTO_ATTRIB, maxZoom: 19 }).addTo(map);
    });
  }

  let pickupMarker = null;
  let dropoffMarker = null;
  let driverMarker = null;
  let routeLine = null;
  let routeCasing = null;
  let driverAnim = 0;
  let lastFixAt = 0;
  let extraMarkers = [];
  let accuracyRing = null;
  let nearbyMarkers = [];
  let userMarker = null;
  let userHalo = null;

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
      /* Glide for as long as the gap between pings, so the marker is still
         moving when the next one lands. A fixed 900ms against a 4s cadence
         means the bike sprints, freezes for three seconds, sprints again —
         which reads as a broken feed rather than a moving vehicle. */
      const gap = lastFixAt ? Math.min(6000, Math.max(700, performance.now() - lastFixAt)) : 900;
      lastFixAt = performance.now();
      const dur = gap;
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

    /* KEEP THE DRIVER ON SCREEN WITHOUT FIGHTING THE CUSTOMER.

       Re-fitting on every position ping snaps the camera back while someone
       is pinching around the map — which is why the old screen felt like it
       was wrestling you. This only moves the camera when the driver actually
       drifts out of a comfortable inner box, and it glides rather than jumps.
       Pan the map yourself and it leaves you alone until the rider genuinely
       leaves the frame. */
    follow(coords, { padRatio = 0.22 } = {}) {
      if (!coords) return;
      const p = map.latLngToContainerPoint([coords.lat, coords.lng]);
      const size = map.getSize();
      const padX = size.x * padRatio;
      const padY = size.y * padRatio;
      const outside =
        p.x < padX || p.x > size.x - padX ||
        p.y < padY || p.y > size.y - padY * 1.9; // sheet covers the bottom
      if (outside) map.panTo([coords.lat, coords.lng], { animate: true, duration: 0.9 });
    },

    /** Frame exactly two points — the live leg — leaving room for the sheet. */
    frameLeg(a, b, { bottomPad = 300 } = {}) {
      if (!a || !b) return;
      map.fitBounds([[a.lat, a.lng], [b.lat, b.lng]], {
        paddingTopLeft: [50, 70],
        paddingBottomRight: [50, bottomPad],
        animate: true,
        duration: 0.8,
        maxZoom: 16,
      });
    },

    /** Fit everything currently on the map, with room for the bottom sheet. */
    fit(points, padding = [50, 50]) {
      const valid = (points || []).filter(Boolean);
      if (valid.length === 0) return;
      if (valid.length === 1) { map.setView([valid[0].lat, valid[0].lng], 15); return; }
      map.fitBounds(valid.map((p) => [p.lat, p.lng]), { padding });
    },

    /** Where the viewport is pointing — what a centre-crosshair pin means. */
    getCenter() {
      const c = map.getCenter();
      return { lat: c.lat, lng: c.lng };
    },

    /** Subscribe to pan/zoom. Returns an unsubscribe. */
    onMove(handler, { settled = true } = {}) {
      const evt = settled ? "moveend" : "move";
      map.on(evt, handler);
      return () => map.off(evt, handler);
    },

    center(coords, zoom, { animate = false } = {}) {
      if (!coords) return;
      // flyTo GLIDES; setView jumps. On the first fix a jump reads as the map
      // being swapped out from under you, while a glide reads as the map
      // finding you — which is the thing that actually just happened.
      if (animate && typeof map.flyTo === "function") {
        map.flyTo([coords.lat, coords.lng], zoom ?? map.getZoom(), { duration: 0.9 });
      } else {
        map.setView([coords.lat, coords.lng], zoom ?? map.getZoom());
      }
    },

    /**
     * "You are here" — distinct from the pickup pin on purpose.
     *
     * The pickup pin says where the rider will come to; this says where the
     * phone thinks it is, with an honest halo for how sure it is. Conflating
     * the two is how someone ends up waiting on the wrong side of a road
     * because a 300m fix was drawn as a precise point.
     */
    setUserLocation(coords, accuracyMeters) {
      if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
      if (userHalo) { map.removeLayer(userHalo); userHalo = null; }
      if (!coords) return;

      // Only drawn when it is big enough to matter — a 12m halo is noise.
      if (accuracyMeters && accuracyMeters > 40) {
        userHalo = L.circle([coords.lat, coords.lng], {
          radius: accuracyMeters,
          className: "nx-accuracy-ring",
          interactive: false,
          stroke: false,
          fillOpacity: 0.12,
        }).addTo(map);
      }
      userMarker = L.marker([coords.lat, coords.lng], {
        icon: L.divIcon({
          className: "nx-pin-wrap",
          html: `<div class="nx-user-dot"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
        interactive: false,
        zIndexOffset: -100,
      }).addTo(map);
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
        /* TEXT, NOT HTML. Leaflet parses a string tooltip as HTML, and this
           label is built from a driver's own name and phone number. A driver
           who sets their name to an <img onerror> payload would have it run
           inside the ops console — the one session that can approve drivers,
           suspend accounts and move money. Handing bindTooltip a DOM node
           whose text is set with textContent closes that path at the only
           place every fleet marker goes through. */
        if (d.label) {
          const tip = document.createElement("span");
          tip.textContent = String(d.label);
          marker.bindTooltip(tip, { direction: "top", offset: [0, -8] });
        }
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
      try { if (userMarker) map.removeLayer(userMarker); } catch {}
      try { if (userHalo) map.removeLayer(userHalo); } catch {}
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
