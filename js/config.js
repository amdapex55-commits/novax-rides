// Nova X Rides — where the app points its API + socket calls.
//
// Environment is resolved from the hostname at runtime rather than hardcoded
// to one deployment, so the same build works locally, on GitHub Pages, and
// inside the Capacitor native shell without hand-editing this file before
// every test. Override explicitly by setting window.NOVAX_API_BASE (and
// optionally window.NOVAX_SOCKET_URL) before app.js loads — useful for
// pointing a local build at a staging backend.

const PRODUCTION = {
  API_BASE_URL: "https://novax-backend-production-68af.up.railway.app/api/v1",
  SOCKET_URL: "https://novax-backend-production-68af.up.railway.app",
};

const LOCAL = {
  API_BASE_URL: "http://localhost:3000/api/v1",
  SOCKET_URL: "http://localhost:3000",
};

function resolve() {
  // Explicit override always wins.
  if (typeof window !== "undefined" && window.NOVAX_API_BASE) {
    return {
      API_BASE_URL: window.NOVAX_API_BASE,
      SOCKET_URL: window.NOVAX_SOCKET_URL || window.NOVAX_API_BASE.replace(/\/api\/v1\/?$/, ""),
    };
  }
  const host = typeof location !== "undefined" ? location.hostname : "";
  const protocol = typeof location !== "undefined" ? location.protocol : "";
  // Capacitor/native serves the app from capacitor://, ionic:// or file://
  // while still talking to the DEPLOYED backend — so only a real browser on
  // localhost counts as local dev.
  const isNativeShell = /^(capacitor|ionic|file):$/.test(protocol);
  const isLocal = !isNativeShell && (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local"));
  return isLocal ? LOCAL : PRODUCTION;
}

// Map/geo providers. All three default to keyless public endpoints so the app
// runs with zero billing setup. Each can be repointed independently — at
// volume you'd move ROUTING_URL to your own OSRM box and GEOCODE_URL to a
// paid geocoder, without touching a single screen.
const GEO = {
  // OSRM-compatible directions endpoint. Self-host: docker run osrm/osrm-backend
  ROUTING_URL: (typeof window !== "undefined" && window.NOVAX_ROUTING_URL) || "",
  // Nominatim-compatible search endpoint.
  GEOCODE_URL: (typeof window !== "undefined" && window.NOVAX_GEOCODE_URL) || "",
};

export const CONFIG = { ...resolve(), ...GEO };
