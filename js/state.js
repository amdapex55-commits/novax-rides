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

  get pendingReferralCode() { return read("pendingReferralCode"); },
  set pendingReferralCode(v) { write("pendingReferralCode", v); },

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

  // Fare/fareType/distanceKm snapshot from the trip:offer socket payload —
  // lets the incoming-offer screen show a BID trip's proposed price (or the
  // FIXED estimate) instead of a generic "fare shown after accept" line.
  get incomingTripOffer() { return read("incomingTripOffer"); },
  set incomingTripOffer(v) { write("incomingTripOffer", v); },

  get parcelDraft() { return read("parcelDraft", {}); }, // { note, recipientName, recipientPhone }
  set parcelDraft(v) { write("parcelDraft", v); },

  get isDriverOnline() { return read("isDriverOnline", false); },
  set isDriverOnline(v) { write("isDriverOnline", v); },

  get driverMode() { return read("driverMode", "RIDE"); }, // "RIDE" | "FOOD_ERRAND"
  set driverMode(v) { write("driverMode", v); },

  get offerFoodOrderId() { return read("offerFoodOrderId"); },
  set offerFoodOrderId(v) { write("offerFoodOrderId", v); },

  get offerErrandId() { return read("offerErrandId"); },
  set offerErrandId(v) { write("offerErrandId", v); },

  // Where to send the user after they finish phone+OTP login — set right
  // before bouncing a guest to /phone (either by the router's auth guard or
  // by an action button like "Request Ride"), consumed once on success.
  get postAuthRedirect() { return read("postAuthRedirect"); },
  set postAuthRedirect(v) { write("postAuthRedirect", v); },

  // Which top-level home tab was last active — Food / Bike / Taxi — so
  // switching apps mid-flow and coming back doesn't dump the user back on
  // the default tab.
  get homeTab() { return read("homeTab", "BIKE"); },
  set homeTab(v) { write("homeTab", v); },

  // Taxi tab tier — cosmetic multiplier on top of the real CAR fare (same
  // vehicleType/backend pricing as Bike's "Nova Premium" car option; the
  // tier just changes the client-side preview + a comfort-level tag sent
  // along in trip notes, since VehicleType in the backend only knows
  // BIKE/RICKSHAW/CAR, not per-tier pricing yet).
  get taxiTier() { return read("taxiTier", "STANDARD"); },
  set taxiTier(v) { write("taxiTier", v); },

  // --- Food marketplace ---
  get currentRestaurant() { return read("currentRestaurant"); }, // full restaurant + menuItems payload
  set currentRestaurant(v) { write("currentRestaurant", v); },

  get cart() { return read("cart", { restaurantId: null, restaurantName: null, items: [] }); }, // items: [{menuItemId, name, price, quantity}]
  set cart(v) { write("cart", v); },

  get activeFoodOrderId() { return read("activeFoodOrderId"); },
  set activeFoodOrderId(v) { write("activeFoodOrderId", v); },

  get foodDropoff() { return read("foodDropoff"); }, // { label, lat, lng }
  set foodDropoff(v) { write("foodDropoff", v); },

  get foodOrderNotes() { return read("foodOrderNotes", ""); },
  set foodOrderNotes(v) { write("foodOrderNotes", v); },

  // --- Errand (Pick & Deliver to Me) ---
  get errandDraft() { return read("errandDraft", {}); }, // { storeLabel, itemsDescription, estimatedBudget }
  set errandDraft(v) { write("errandDraft", v); },

  get activeErrandId() { return read("activeErrandId"); },
  set activeErrandId(v) { write("activeErrandId", v); },

  // Which thread /chat-thread should open — { contextType: "TRIP" |
  // "DELIVERY" | "FOOD_ORDER" | "ERRAND", contextId, otherPartyLabel }.
  get chatContext() { return read("chatContext"); },
  set chatContext(v) { write("chatContext", v); },

  clearCart() {
    write("cart", { restaurantId: null, restaurantName: null, items: [] });
  },

  clearBookingDraft() {
    write("pickup", null);
    write("dropoff", null);
    write("selectedVehicle", null);
  },
};
