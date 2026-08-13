// Nova Go Rides — where the app points its API + socket calls.
//
// Environment is resolved from the hostname at runtime rather than hardcoded
// to one deployment, so the same build works locally, on GitHub Pages, and
// inside the Capacitor native shell without hand-editing this file before
// every test. Override explicitly by setting window.NOVAGO_API_BASE (and
// optionally window.NOVAGO_SOCKET_URL) before app.js loads — useful for
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
  /* DEV ESCAPE HATCH, LOCALHOST ONLY.
     window.NOVAGO_API_BASE has to be set before this module evaluates, which
     means editing HTML — and it does not survive the reload you need in order
     to test a signed-in screen. This reads the same override from
     localStorage so a local build can be pointed at the deployed backend from
     the console and stay there.

     Hard-gated on the hostname actually being localhost. It is not a
     mechanism a page on novago.pk can be talked into using, which matters:
     an attacker-settable API base is an attacker-readable access token. */
  if (typeof location !== "undefined" &&
      (location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    try {
      const override = localStorage.getItem("novago.dev.apiBase");
      if (override) {
        return {
          API_BASE_URL: override,
          SOCKET_URL: localStorage.getItem("novago.dev.socketUrl") || override.replace(/\/api\/v1\/?$/, ""),
        };
      }
    } catch {
      /* storage blocked — fall through to the normal resolution */
    }
  }

  // Explicit override always wins.
  if (typeof window !== "undefined" && window.NOVAGO_API_BASE) {
    return {
      API_BASE_URL: window.NOVAGO_API_BASE,
      SOCKET_URL: window.NOVAGO_SOCKET_URL || window.NOVAGO_API_BASE.replace(/\/api\/v1\/?$/, ""),
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
/* MAPBOX.
 *
 * Leave MAP_TOKEN empty and the app uses Carto's free basemap — no key, no
 * billing, and every screen still works. That fallback is deliberate: a map
 * provider is not allowed to be a single point of failure for booking a ride.
 *
 * The token below is a PUBLIC token (pk.*). Mapbox designs these to ship in
 * client code, so it being visible here is expected and not a leak — but it
 * is still your quota. RESTRICT IT BY URL in Mapbox → Tokens → your token →
 * URL restrictions, to your Pages domain and novago.pk. Without that, anyone
 * who views source can spend your free tier.
 *
 * Style: navigation-day-v1 is built for exactly this use — road hierarchy and
 * label density tuned for someone following a route, rather than the
 * general-purpose streets style.
 */
const MAP = {
  // Public token (pk.*). Mapbox designs these to ship in client code, so this
  // being readable in the bundle is expected, not a leak — but it is still
  // your quota, and URL restrictions are the only thing stopping a stranger
  // spending it. window.NOVAGO_MAP_TOKEN overrides, for a staging build that
  // should bill against a different token.
  // NOT COMMITTED. GitHub's push protection blocks Mapbox tokens in the repo,
  // and it's right to: once a token is in history it stays there even after
  // you rotate it, and this repo is public.
  //
  // Set it in js/map-token.js instead — that file is gitignored, and both
  // scripts/deploy-public.js and GitHub Pages read it at runtime. See
  // js/map-token.example.js.
  //
  // With no token the app uses Carto's free basemap and every screen still
  // works, so a missing token degrades the look and nothing else.
  TOKEN: (typeof window !== "undefined" && window.NOVAGO_MAP_TOKEN) || "",
  STYLE: "mapbox/navigation-day-v1",
};

const GEO = {
  // OSRM-compatible directions endpoint. Self-host: docker run osrm/osrm-backend
  ROUTING_URL: (typeof window !== "undefined" && window.NOVAGO_ROUTING_URL) || "",
  // Nominatim-compatible search endpoint.
  GEOCODE_URL: (typeof window !== "undefined" && window.NOVAGO_GEOCODE_URL) || "",
};

export const CONFIG = { ...resolve(), ...GEO, MAP };
