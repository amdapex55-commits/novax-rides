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

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const KARACHI = { lat: 24.8607, lng: 67.0011 };

// Small in-memory cache — booking flows geocode the same pickup/dropoff
// repeatedly as the user steps back and forth through the screens.
const cache = new Map();

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

  // ~0.5° box around the reference point keeps results in-city.
  const d = 0.5;
  const viewbox = [origin.lng - d, origin.lat + d, origin.lng + d, origin.lat - d].join(",");
  const url =
    `${NOMINATIM}?format=json&limit=1&countrycodes=pk&bounded=1` +
    `&viewbox=${encodeURIComponent(viewbox)}&q=${encodeURIComponent(q)}`;

  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`geocoder ${res.status}`);
    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) {
      return { ...origin, displayName: q, resolved: false };
    }
    const hit = {
      lat: parseFloat(results[0].lat),
      lng: parseFloat(results[0].lon),
      displayName: results[0].display_name || q,
      resolved: true,
    };
    cache.set(key, hit);
    return hit;
  } catch (err) {
    console.warn("[NovaX] geocode failed:", err.message);
    return { ...origin, displayName: q, resolved: false };
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
