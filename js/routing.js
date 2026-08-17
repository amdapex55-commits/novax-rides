// Nova Go — real road routing.
//
// Until now every route on every screen was a straight line between two pins,
// and every ETA was that straight-line distance times a guessed speed. In a
// city like Karachi that is not an approximation — it is wrong. A 4km
// straight line across Clifton is a 7km drive; quoting the 4km fare loses the
// driver money on every single trip, and quoting the straight-line ETA makes
// the app look like it is lying every single trip.
//
// This module gives the app the three things it actually needs:
//   1. the road polyline, so the drawn route matches the road the driver takes
//   2. real driving distance, so fares are computed on the distance driven
//   3. real duration, so ETAs are defensible
//
// Provider: OSRM's public demo server. Chosen because it needs no API key and
// no billing account — the same reason we're on OSM tiles and Nominatim.
//
// Honest limits, because dispatch depends on this:
//   - The demo server is best-effort with no uptime guarantee and asks for
//     light use. It is fine for launch volume and NOT fine at scale.
//   - It routes on the global car profile, so it does not know Karachi
//     motorcycle shortcuts or current traffic. Durations are free-flow.
//   - We apply a city traffic multiplier below to stop free-flow ETAs from
//     being systematically optimistic.
//
// To move to a paid provider later, reimplement `fetchRoute` only. Everything
// else — fares, ETAs, drawn lines — reads the shape this returns and does not
// care where it came from. Set ROUTING_URL in js/config.js to point at your
// own OSRM instance or a Mapbox Directions proxy.

import { CONFIG } from "./config.js";

const DEFAULT_OSRM = "https://router.project-osrm.org/route/v1/driving";

// Free-flow durations are optimistic for Karachi. 1.35 is a conservative
// city multiplier: better to quote 18 minutes and arrive in 15 than the
// reverse. Tune this from real completed-trip data once you have some.
const TRAFFIC_MULTIPLIER = 1.35;

// Straight-line distance is ~70% of real road distance in a dense grid city.
// Used only when routing is unavailable, so estimates stay conservative
// rather than silently under-quoting.
const DETOUR_FACTOR = 1.4;

const cache = new Map();
const MAX_CACHE = 60;

/** Haversine great-circle distance in km. */
export function straightLineKm(a, b) {
  if (!a || !b) return 0;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function cacheKey(a, b) {
  const r = (n) => Math.round(n * 2000) / 2000; // ~50m buckets
  return `${r(a.lat)},${r(a.lng)}|${r(b.lat)},${r(b.lng)}`;
}

function remember(key, value) {
  cache.set(key, value);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
}

/**
 * The fallback every caller gets when routing is unreachable. Marked
 * `estimated: true` so the UI can say "estimated" instead of implying we
 * measured a road we never looked at.
 */
function estimate(from, to) {
  const km = straightLineKm(from, to) * DETOUR_FACTOR;
  return {
    km: Math.round(km * 10) / 10,
    minutes: Math.max(3, Math.round((km / 22) * 60 * 1)), // ~22km/h city average
    coordinates: [from, to],
    estimated: true,
  };
}

/**
 * Road route between two points.
 * Always resolves — never rejects — because a booking screen must still work
 * when the routing host is down. Check `.estimated` to know which you got.
 *
 * @returns {Promise<{km:number, minutes:number, coordinates:Array<{lat,lng}>, estimated:boolean}>}
 */
export async function getRoute(from, to, { signal } = {}) {
  if (!from || !to) return estimate(from || to, to || from);

  const key = cacheKey(from, to);
  if (cache.has(key)) return cache.get(key);

  const base = CONFIG.ROUTING_URL || DEFAULT_OSRM;
  const url =
    `${base}/${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?overview=full&geometries=geojson&alternatives=false&steps=false`;

  try {
    // 6s ceiling: a booking screen cannot hang waiting for a demo server.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    if (signal) signal.addEventListener("abort", () => ctrl.abort(), { once: true });

    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`routing ${res.status}`);

    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route || !route.geometry?.coordinates?.length) throw new Error("no route");

    const result = {
      km: Math.round((route.distance / 1000) * 10) / 10,
      minutes: Math.max(2, Math.round((route.duration / 60) * TRAFFIC_MULTIPLIER)),
      // GeoJSON is [lng, lat]; the rest of the app speaks {lat, lng}.
      coordinates: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      estimated: false,
    };
    remember(key, result);
    return result;
  } catch (err) {
    if (err.name !== "AbortError") {
      console.warn("[NovaGo] routing unavailable, using estimate:", err.message);
    }
    return estimate(from, to);
  }
}

/**
 * Format a duration for display. Small helper, but it stops six screens from
 * each inventing their own slightly different phrasing.
 */
export function formatEta(minutes) {
  if (!minutes || minutes < 1) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** "6.2 km · 18 min" — the single line most ride screens want. */
export function routeSummary(route) {
  if (!route) return "";
  const prefix = route.estimated ? "~" : "";
  return `${prefix}${route.km} km · ${prefix}${formatEta(route.minutes)}`;
}

/* --------------------------------------------------------------------------
   HOW LONG UNTIL A RIDER REACHES YOU

   This was being guessed as 30% of the TRIP duration, which is not a
   related quantity: how long someone takes to get TO you has nothing to do
   with how far you are then going. A 2km hop and a 20km cross-city run
   quoted wildly different pickup waits from the same rider standing on the
   same corner — and the long trip, where the customer is least patient,
   quoted the longest wait.

   The honest inputs are where the nearest rider actually is, and how fast a
   bike moves through this city.
   -------------------------------------------------------------------------- */

// DETOUR_FACTOR is already defined above and used by the fallback estimate;
// the same crow-to-road correction applies here, so it is reused rather than
// given a second, quietly different value.
// Effective door-to-door speed for a bike in Karachi traffic, not the speed
// on an open road — it has to absorb lights, turns and the last 100m.
const BIKE_KMH = 18;
// Accepting the job, starting up, and finding the gate. Never zero.
const PICKUP_OVERHEAD_MIN = 1.5;

/**
 * @param {{lat:number,lng:number}} pickup
 * @param {Array<{lat:number,lng:number}>} riders  anonymised nearby positions
 * @returns {number|null} minutes, or null when there is nobody to quote for
 */
export function pickupEtaMinutes(pickup, riders) {
  if (!pickup || !Array.isArray(riders) || !riders.length) return null;
  let nearestKm = Infinity;
  for (const r of riders) {
    if (typeof r?.lat !== "number" || typeof r?.lng !== "number") continue;
    const km = straightLineKm(pickup, r);
    if (km < nearestKm) nearestKm = km;
  }
  if (!Number.isFinite(nearestKm)) return null;

  // Positions are jittered ~150m server-side to stop individual tracking, so
  // this is honest to roughly the minute — which is the precision the answer
  // is quoted at anyway.
  const minutes = (nearestKm * DETOUR_FACTOR) / BIKE_KMH * 60 + PICKUP_OVERHEAD_MIN;
  // Floor of 2: "arrives in about 1 min" is never true, and reads as a bug.
  return Math.max(2, Math.round(minutes));
}
