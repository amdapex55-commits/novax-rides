// Nova Go — saved places.
//
// Typing a full Karachi address every single booking is the difference between
// a two-tap ride and a six-tap one, and it's the tap people abandon on. Bykea
// and Careem both have this; not having it is felt on every repeat trip.
//
// Deliberately LOCAL ONLY (localStorage, this device). Two reasons:
//
//   1. A saved home address is the most sensitive thing a customer would give
//      us, and there is no product reason to hold it on a server during a
//      pilot. What we don't store can't leak.
//   2. It works offline and needs no endpoint, no migration and no sync
//      conflict — which means it ships today instead of next week.
//
// The trade is real and worth stating: change phones and the places don't
// follow. When there's a reason to sync them, this module is the seam — the
// views only ever call these four functions.

const KEY = "novago_saved_places_v1";
const MAX = 12;

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    // Corrupt storage shouldn't take the booking screen down with it.
    return [];
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* quota or private mode — saving is a convenience, never a requirement */
  }
}

/** Home and Work first, then most recently used. */
export function listSavedPlaces() {
  const rank = { home: 0, work: 1 };
  return readAll().sort((a, b) => {
    const ra = rank[a.kind] ?? 2;
    const rb = rank[b.kind] ?? 2;
    if (ra !== rb) return ra - rb;
    return (b.usedAt || 0) - (a.usedAt || 0);
  });
}

export function getSavedPlace(kind) {
  return readAll().find((p) => p.kind === kind) || null;
}

/**
 * Save (or replace) a place.
 *
 * @param {"home"|"work"|"other"} kind
 * @param {{label: string, lat: number, lng: number}} place
 */
export function savePlace(kind, place) {
  if (!place || place.lat == null || place.lng == null) return listSavedPlaces();
  const list = readAll();
  // home/work are singletons — saving a new one replaces it rather than
  // stacking two "Home"s a customer then has to tell apart.
  const rest = kind === "other" ? list : list.filter((p) => p.kind !== kind);
  const entry = {
    kind,
    label: String(place.label || "").slice(0, 120),
    lat: place.lat,
    lng: place.lng,
    usedAt: Date.now(),
  };
  const next = kind === "other"
    ? [entry, ...rest.filter((p) => !(p.lat === entry.lat && p.lng === entry.lng))]
    : [entry, ...rest];
  writeAll(next);
  return listSavedPlaces();
}

export function removePlace(kind, lat, lng) {
  writeAll(readAll().filter((p) => !(p.kind === kind && p.lat === lat && p.lng === lng)));
  return listSavedPlaces();
}

/** Bump recency so "other" places surface in the order people actually use. */
export function touchPlace(lat, lng) {
  const list = readAll();
  const hit = list.find((p) => p.lat === lat && p.lng === lng);
  if (!hit) return;
  hit.usedAt = Date.now();
  writeAll(list);
}

export const PLACE_META = {
  home: { icon: "home", label: "Home" },
  work: { icon: "store", label: "Work" },
  other: { icon: "location", label: "Saved" },
};

/* ---------------------------------------------------------------- recents ---

   RECENTS ARE NOT SAVED PLACES.

   Saving is a deliberate act — "this is my office". Recents are a by-product
   of using the app, and they are what actually removes typing for most
   customers, because most people will never open a menu to save anything.
   Every ride-hailing home screen in this market leads with them.

   Kept separate from the saved list on purpose: mixing them means a place
   someone deliberately named as Home competes for the same row as a shop
   they went to once, and the deliberate one loses as soon as the accidental
   one is more recent.

   Same local-only reasoning as above — this is a movement history, which is
   the most sensitive thing this app touches. It never leaves the device.  */

const RECENT_KEY = "novago_recent_places_v1";
const RECENT_MAX = 6;
// Under ~120m apart is the same doorway with GPS noise on top, not a second
// destination. Without this the list fills with four versions of one shop.
const SAME_PLACE_DEG = 0.0011;

function readRecents() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function listRecents() {
  return readRecents().sort((a, b) => (b.usedAt || 0) - (a.usedAt || 0));
}

/** Called when a trip is actually requested — not when a field is typed in. */
export function recordRecent(place) {
  if (!place || place.lat == null || place.lng == null) return;
  const label = String(place.label || "").trim();
  if (!label) return;

  const list = readRecents().filter(
    (p) =>
      Math.abs(p.lat - place.lat) > SAME_PLACE_DEG ||
      Math.abs(p.lng - place.lng) > SAME_PLACE_DEG,
  );
  list.unshift({ label: label.slice(0, 120), lat: place.lat, lng: place.lng, usedAt: Date.now() });
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    /* convenience only */
  }
}

/** Offered in settings: this is a movement history and people should be able
 *  to wipe it without clearing everything else the app stores. */
export function clearRecents() {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    /* nothing to do */
  }
}
