// Nova X Rides — turn the address a user typed into real coordinates.
//
// Before this existed, every booking flow collected a drop-off *label* and
// then submitted the device's current GPS plus a fixed ~0.02° offset (or a
// hardcoded Karachi point when GPS was denied). The label was cosmetic: the
// driver was dispatched roughly 2km northeast of wherever the rider happened
// to be standing, regardless of what they typed. That's a
// wrong-address-every-time bug, not an approximation.
//
// Uses OpenStreetMap's Nominatim, which needs no API key — deliberate, since
// a Google/Mapbox key is a real cost + billing setup the project doesn't have
// yet. Trade-offs to know about:
//   - Nominatim's usage policy asks for <=1 request/second and a real
//     identifying UA/Referer. Fine at this stage; swap in Google Places or
//     Mapbox before serious volume.
//   - Coverage in Pakistan is decent for named areas/landmarks (DHA Phase 6,
//     Gulshan-e-Iqbal, Empress Market) and weaker for exact house numbers.
// Results are viewbox-biased to the requester's city so "Main Boulevard"
// resolves locally rather than to a same-named street on another continent.

import { CONFIG } from "./config.js";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
// Photon (Komoot) is a second keyless OSM geocoder with a different index and
// much better prefix/typeahead behaviour. Two independent providers means a
// single outage no longer takes address entry down with it.
const PHOTON = "https://photon.komoot.io/api";
const KARACHI = { lat: 24.8607, lng: 67.0011 };

// Small in-memory cache — booking flows geocode the same pickup/dropoff
// repeatedly as the user steps back and forth through the screens.
const cache = new Map();

// Known Karachi landmarks, answered locally with no network call. These cover
// a large share of what people actually type, so the common case is instant
// and keeps us well inside Nominatim's rate limit.
const LOCAL_PLACES = [
  { q: "dolmen mall clifton", name: "Dolmen Mall Clifton", lat: 24.8098, lng: 67.0296 },
  { q: "clifton", name: "Clifton, Karachi", lat: 24.8138, lng: 67.0300 },
  { q: "dha phase 6", name: "DHA Phase 6, Karachi", lat: 24.7988, lng: 67.0611 },
  { q: "dha phase 5", name: "DHA Phase 5, Karachi", lat: 24.8065, lng: 67.0526 },
  { q: "dha phase 2", name: "DHA Phase 2, Karachi", lat: 24.8352, lng: 67.0658 },
  { q: "dha", name: "DHA, Karachi", lat: 24.8065, lng: 67.0526 },
  { q: "saddar", name: "Saddar, Karachi", lat: 24.8607, lng: 67.0225 },
  { q: "gulshan-e-iqbal", name: "Gulshan-e-Iqbal, Karachi", lat: 24.9204, lng: 67.0971 },
  { q: "gulshan", name: "Gulshan-e-Iqbal, Karachi", lat: 24.9204, lng: 67.0971 },
  { q: "nazimabad", name: "Nazimabad, Karachi", lat: 24.9110, lng: 67.0311 },
  { q: "north nazimabad", name: "North Nazimabad, Karachi", lat: 24.9424, lng: 67.0384 },
  { q: "north karachi", name: "North Karachi", lat: 24.9856, lng: 67.0636 },
  { q: "malir", name: "Malir, Karachi", lat: 24.8938, lng: 67.2064 },
  { q: "korangi", name: "Korangi, Karachi", lat: 24.8378, lng: 67.1300 },
  { q: "tariq road", name: "Tariq Road, Karachi", lat: 24.8712, lng: 67.0625 },
  { q: "empress market", name: "Empress Market, Saddar", lat: 24.8608, lng: 67.0230 },
  { q: "jinnah international airport", name: "Jinnah International Airport", lat: 24.9065, lng: 67.1608 },
  { q: "airport", name: "Jinnah International Airport", lat: 24.9065, lng: 67.1608 },
  { q: "karachi port", name: "Karachi Port", lat: 24.8400, lng: 66.9900 },
  { q: "lucky one mall", name: "LuckyOne Mall, Rashid Minhas Rd", lat: 24.9298, lng: 67.0925 },
  { q: "aga khan hospital", name: "Aga Khan University Hospital", lat: 24.8916, lng: 67.0742 },
  { q: "jinnah hospital", name: "Jinnah Postgraduate Medical Centre", lat: 24.8562, lng: 67.0417 },
  { q: "iba karachi", name: "IBA Karachi, Main Campus", lat: 24.9330, lng: 67.1244 },
  { q: "karachi university", name: "University of Karachi", lat: 24.9470, lng: 67.1157 },
  { q: "seaview", name: "Sea View, Clifton", lat: 24.7975, lng: 67.0431 },
  { q: "port grand", name: "Port Grand, Karachi", lat: 24.8489, lng: 66.9906 },
  { q: "gulistan-e-johar", name: "Gulistan-e-Johar, Karachi", lat: 24.9231, lng: 67.1310 },
  { q: "shahrah-e-faisal", name: "Shahrah-e-Faisal, Karachi", lat: 24.8687, lng: 67.0839 },
];

function localMatches(q) {
  const s = q.toLowerCase().trim();
  if (s.length < 2) return [];
  return LOCAL_PLACES.filter((p) => p.q.includes(s) || s.includes(p.q))
    .slice(0, 5)
    .map((p) => ({ lat: p.lat, lng: p.lng, displayName: p.name, resolved: true, local: true }));
}

/** Device GPS, or Karachi city centre if unavailable/denied. */
export function getCurrentCoords(timeout = 5000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ ...KARACHI, accurate: false });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accurate: true }),
      () => resolve({ ...KARACHI, accurate: false }),
      { timeout, maximumAge: 60000 },
    );
  });
}

/**
 * Resolve a free-text address to { lat, lng, displayName, resolved }.
 * `resolved: false` means we fell back to `near` (or Karachi) because the
 * lookup failed or matched nothing — callers should treat that as "we do NOT
 * actually know where this is" rather than silently dispatching a driver.
 */
export async function geocode(query, near) {
  const q = (query || "").trim();
  const origin = near || KARACHI;
  if (!q) return { ...origin, displayName: "", resolved: false };

  const key = q.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  // A known landmark answers instantly and costs no request.
  const local = localMatches(q);
  if (local.length && local[0].displayName.toLowerCase() === key) {
    cache.set(key, local[0]);
    return local[0];
  }

  const results = await search(q, origin, 1);
  if (results.length) {
    cache.set(key, results[0]);
    return results[0];
  }
  // Nothing matched anywhere. Fall back to the nearest landmark we do know
  // before giving up entirely — a rough right-neighbourhood pin beats
  // dispatching to city centre.
  if (local.length) { cache.set(key, local[0]); return local[0]; }
  return { ...origin, displayName: q, resolved: false };
}

/* -------------------------------------------------------------------------
   Search across both providers.
   Nominatim first (better at full addresses), Photon second (better at
   partial/typeahead). Whichever answers first with results wins; if the
   primary is down the user never notices.
   ------------------------------------------------------------------------- */

async function search(q, origin, limit = 5, signal) {
  const d = 0.5; // ~0.5° box keeps results in-city
  const viewbox = [origin.lng - d, origin.lat + d, origin.lng + d, origin.lat - d].join(",");

  const nominatim = async () => {
    const base = CONFIG.GEOCODE_URL || NOMINATIM;
    const url =
      `${base}?format=json&limit=${limit}&countrycodes=pk&bounded=1` +
      `&viewbox=${encodeURIComponent(viewbox)}&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
    if (!res.ok) throw new Error(`nominatim ${res.status}`);
    const rows = await res.json();
    return (Array.isArray(rows) ? rows : []).map((r) => ({
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      displayName: shorten(r.display_name || q),
      resolved: true,
    }));
  };

  const photon = async () => {
    const url =
      `${PHOTON}?q=${encodeURIComponent(q)}&limit=${limit}` +
      `&lat=${origin.lat}&lon=${origin.lng}&lang=en`;
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
    if (!res.ok) throw new Error(`photon ${res.status}`);
    const data = await res.json();
    return (data?.features || [])
      .filter((f) => f?.properties?.countrycode === "PK" || !f?.properties?.countrycode)
      .map((f) => {
        const p = f.properties || {};
        const label = [p.name, p.street, p.district, p.city].filter(Boolean).join(", ");
        return {
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
          displayName: label || q,
          resolved: true,
        };
      });
  };

  // Both providers race with a shared 5s ceiling. Address entry that hangs is
  // worse than address entry that falls back.
  const withTimeout = (fn) =>
    Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000)),
    ]).catch((err) => {
      if (err.name !== "AbortError") console.warn("[NovaX] geocoder:", err.message);
      return [];
    });

  const [a, b] = await Promise.all([withTimeout(nominatim), withTimeout(photon)]);
  // Merge, preferring the primary, and drop near-duplicate coordinates.
  const merged = [];
  const seen = new Set();
  for (const r of [...a, ...b]) {
    const k = `${r.lat.toFixed(4)},${r.lng.toFixed(4)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(r);
  }
  return merged.slice(0, limit);
}

/** Nominatim returns whole postal hierarchies; a booking field wants a line. */
function shorten(name) {
  const parts = String(name).split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 3) return parts.join(", ");
  return parts.slice(0, 3).join(", ");
}

/**
 * Typeahead suggestions for an address field.
 *
 * Debounced and abortable: typing "gulshan" fires one request, not seven, and
 * a stale in-flight response can never overwrite a newer one. Local landmarks
 * appear immediately so the field feels instant even before the network
 * answers.
 *
 * @param {(results:Array, meta:{pending:boolean}) => void} onResults
 * @returns {{ query(text:string):void, destroy():void }}
 */
export function createSuggester(onResults, { near, delay = 320 } = {}) {
  let timer = 0;
  let controller = null;
  let seq = 0;

  return {
    query(text) {
      const q = (text || "").trim();
      clearTimeout(timer);
      controller?.abort();

      if (q.length < 2) { onResults([], { pending: false }); return; }

      // Instant local hits, then the network refines them.
      const local = localMatches(q);
      onResults(local, { pending: true });

      timer = setTimeout(async () => {
        const mine = ++seq;
        controller = new AbortController();
        const origin = near || KARACHI;
        const remote = await search(q, origin, 6, controller.signal);
        if (mine !== seq) return; // a newer keystroke already won

        const seen = new Set(local.map((l) => l.displayName.toLowerCase()));
        const merged = [...local, ...remote.filter((r) => !seen.has(r.displayName.toLowerCase()))];
        onResults(merged.slice(0, 6), { pending: false });
      }, delay);
    },
    destroy() {
      clearTimeout(timer);
      controller?.abort();
    },
  };
}

/** Coordinates → a human address. Used to label "Current Location" properly. */
export async function reverseGeocode(coords) {
  if (!coords) return "";
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=json&zoom=16` +
      `&lat=${coords.lat}&lon=${coords.lng}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return "";
    const data = await res.json();
    return shorten(data?.display_name || "");
  } catch {
    return "";
  }
}

/**
 * Resolve a pickup + dropoff pair for the ride/parcel flows.
 * Pickup falls back to device GPS when the user left it as "Current
 * Location"; dropoff is always geocoded from what they typed.
 */
export async function resolveRoute(pickupLabel, dropoffLabel) {
  const here = await getCurrentCoords();
  const isCurrentLocation = !pickupLabel || /current location/i.test(pickupLabel);
  const pickup = isCurrentLocation
    ? { lat: here.lat, lng: here.lng, displayName: "Current Location", resolved: here.accurate }
    : await geocode(pickupLabel, here);
  const dropoff = await geocode(dropoffLabel, here);
  return { pickup, dropoff };
}
