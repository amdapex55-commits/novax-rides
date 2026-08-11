// Nova Go — socket.io wrapper for the backend's /location namespace.
//
// A true SPA singleton: the connection opens once after login and survives
// every screen navigation, instead of dying and reconnecting on each page
// load. That's how Uber/Careem/inDrive keep a live socket open.
//
// ============================================================================
// WHY THE LIBRARY IS LOADED HERE AND NOT WITH A <script> TAG
// ============================================================================
// Every entry point used to load socket.io from cdn.socket.io with a blocking
// <script> tag. Two problems, both of which bite hardest in Karachi:
//
//   1. If that CDN is slow or unreachable — and international CDN routing from
//      Pakistani ISPs degrades regularly, especially during submarine cable
//      faults — the tag blocks the parser and the whole app is late or dead.
//   2. If it fails entirely, `io` is undefined and live tracking silently
//      stops working, with nothing on screen explaining why.
//
// Now: nothing loads until a socket is actually needed (so the customer's
// first paint never waits on it), and the loader tries a LOCAL copy first,
// then the CDN. If both fail we don't pretend — `degraded` goes true and the
// tracking screens fall back to polling the REST API, which is slower but
// works on any connection that can load the app at all.
//
// To vendor the local copy (recommended before launch — one command):
//   npm run vendor:socket
// ============================================================================

import { CONFIG } from "./config.js";
import { Token } from "./api.js";

// Local first. If vendor/socket.io.min.js exists it's served from the same
// origin as the app — same TLS session, no extra DNS, no foreign hop.
const SOURCES = [
  "vendor/socket.io.min.js",
  "https://cdn.socket.io/4.7.5/socket.io.min.js",
];

let socket = null;
let loading = null;
const pendingListeners = []; // {event, handler} registered before connect()

/** Load a script tag, resolving only if it actually executed. */
function loadScript(src, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    const timer = setTimeout(() => {
      el.remove();
      reject(new Error(`timeout: ${src}`));
    }, timeoutMs);
    el.onload = () => {
      clearTimeout(timer);
      // A 404 page can load "successfully" and define nothing.
      typeof window.io === "function" ? resolve() : reject(new Error(`no io export: ${src}`));
    };
    el.onerror = () => {
      clearTimeout(timer);
      el.remove();
      reject(new Error(`failed: ${src}`));
    };
    document.head.appendChild(el);
  });
}

/** Fetch socket.io once, trying each source in order. */
function ensureLibrary() {
  if (typeof window.io === "function") return Promise.resolve(true);
  if (loading) return loading;

  loading = (async () => {
    for (const src of SOURCES) {
      try {
        await loadScript(src);
        console.info(`[NovaGo] socket.io loaded from ${src}`);
        return true;
      } catch (err) {
        console.warn(`[NovaGo] ${err.message}`);
      }
    }
    // Both failed. Not fatal — see `degraded` below.
    console.warn("[NovaGo] socket.io unavailable — live tracking will poll instead");
    return false;
  })();

  return loading;
}

export const socketManager = {
  /**
   * True when we could not load socket.io at all. Tracking views read this
   * and switch to REST polling rather than showing a map that never moves.
   */
  degraded: false,

  /**
   * Open the connection. Async now, because the library may still be
   * downloading. Callers that don't await it still work — listeners
   * registered through .on() are queued and attached on connect.
   */
  async connect() {
    if (socket && socket.connected) return socket;

    const token = Token.access;
    if (!token) {
      console.warn("[NovaGo] socket.connect() called with no access token");
      return null;
    }

    const ready = await ensureLibrary();
    if (!ready) {
      this.degraded = true;
      return null;
    }
    this.degraded = false;

    socket = window.io(`${CONFIG.SOCKET_URL}/location`, {
      auth: { token },
      // Polling first would be slower but survives networks that block
      // websocket upgrades — socket.io falls back on its own, so listing
      // both here is what gives us that.
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      reconnectionAttempts: 10,
      timeout: 10000,
    });

    socket.on("connect_error", (err) => {
      console.warn("[NovaGo] socket connect_error:", err?.message);
    });

    pendingListeners.forEach(({ event, handler }) => socket.on(event, handler));
    return socket;
  },

  disconnect() {
    if (socket) socket.disconnect();
    socket = null;
  },

  get() { return socket; },

  /** True only when a live channel actually exists right now. */
  isLive() { return !!(socket && socket.connected); },

  // Views can call this before connect() resolves — the listener is queued
  // and attached whenever a real socket exists.
  on(event, handler) {
    pendingListeners.push({ event, handler });
    if (socket) socket.on(event, handler);
  },
  off(event, handler) {
    const i = pendingListeners.findIndex((l) => l.event === event && l.handler === handler);
    if (i !== -1) pendingListeners.splice(i, 1);
    if (socket) socket.off(event, handler);
  },
  emit(event, payload) {
    if (socket && socket.connected) socket.emit(event, payload);
  },
};
