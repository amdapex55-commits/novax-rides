// Nova X Rides — small cross-view state store. Backed by sessionStorage so
// an accidental reload mid-flow doesn't lose the booking in progress; kept
// behind a single get/set API so views never touch storage directly.
const KS = "nx_";

function read(key, fallback = null) {
  const raw = sessionStorage.getItem(KS + key);
  if (raw === null) return fallback;
  try { return JSON.parse(raw); } catch { return raw; }
}
function write(key, value) {
  if (value === null || value === undefined) sessionStorage.removeItem(KS + key);
  else sessionStorage.setItem(KS + key, typeof value === "string" ? value : JSON.stringify(value));
}

export const state = {
  get pendingPhone() { return read("pendingPhone"); },
  set pendingPhone(v) { write("pendingPhone", v); },

  get pickup() { return read("pickup"); }, // { label, lat, lng }
  set pickup(v) { write("pickup", v); },

  get dropoff() { return read("dropoff"); },
  set dropoff(v) { write("dropoff", v); },

  get selectedVehicle() { return read("selectedVehicle"); }, // "BIKE" | "RICKSHAW" | "CAR"
  set selectedVehicle(v) { write("selectedVehicle", v); },

  get activeTripId() { return read("activeTripId"); },
  set activeTripId(v) { write("activeTripId", v); },

  get activeDeliveryId() { return read("activeDeliveryId"); },
  set activeDeliveryId(v) { write("activeDeliveryId", v); },

  get offerTripId() { return read("offerTripId"); },
  set offerTripId(v) { write("offerTripId", v); },

  get parcelDraft() { return read("parcelDraft", {}); }, // { note, recipientName, recipientPhone }
  set parcelDraft(v) { write("parcelDraft", v); },

  get isDriverOnline() { return read("isDriverOnline", false); },
  set isDriverOnline(v) { write("isDriverOnline", v); },

  // Where to send the user after they finish phone+OTP login — set right
  // before bouncing a guest to /phone (either by the router's auth guard or
  // by an action button like "Request Ride"), consumed once on success.
  get postAuthRedirect() { return read("postAuthRedirect"); },
  set postAuthRedirect(v) { write("postAuthRedirect", v); },

  clearBookingDraft() {
    write("pickup", null);
    write("dropoff", null);
    write("selectedVehicle", null);
  },
};
