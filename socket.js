// Nova X Rides — socket.io wrapper for the backend's /location namespace.
//
// Real upgrade over the old multi-page Stitch build: this is a true SPA, so
// the connection is a genuine app-wide singleton — it opens once after
// login and survives every screen navigation, instead of dying and
// reconnecting on every page load. Matches how Uber/Careem/InDrive actually
// keep a live socket open in the background.
import { CONFIG } from "./config.js";
import { Token } from "./api.js";

let socket = null;
const pendingListeners = []; // {event, handler} registered before connect()

export const socketManager = {
  connect() {
    if (socket && socket.connected) return socket;
    const token = Token.access;
    if (!token) {
      console.warn("[NovaX] socket.connect() called with no access token");
      return null;
    }
    if (typeof io === "undefined") {
      console.error("[NovaX] socket.io-client not loaded");
      return null;
    }
    socket = io(`${CONFIG.SOCKET_URL}/location`, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });
    pendingListeners.forEach(({ event, handler }) => socket.on(event, handler));
    return socket;
  },
  disconnect() {
    if (socket) socket.disconnect();
    socket = null;
  },
  get() { return socket; },
  // Views can call this even before connect() resolves — the listener is
  // queued and (re)attached whenever a real socket exists.
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
