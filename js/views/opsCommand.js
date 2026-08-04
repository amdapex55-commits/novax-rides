// Nova X Rides — the ops command center.
//
// This is the screen that decides whether a launch survives its first busy
// evening. Automatic matching WILL fail — nobody online in that area,
// everyone declined, a driver accepted then went quiet. Without this, the
// customer stares at a spinner and nobody at Nova X knows it's happening.
//
// Three surfaces, in order of urgency:
//   1. Live safety incidents (someone pressed SOS)
//   2. Stuck jobs (nothing is moving — call a driver and assign by hand)
//   3. Funnel (where people are dropping off)
import { api } from "../api.js";
import { icon } from "../icons.js";
import { toast, esc, fmtMoney, skeletonRows, emptyRich } from "../ui.js";
import { navigate } from "../router.js";
import { socketManager } from "../socket.js";

export function renderOpsCommand(root) {
  root.innerHTML = `
    <div class="page pb-0">
      <div class="flex justify-between items-center mb-4">
        <div>
          <h1 class="text-xl">Command center</h1>
          <p class="text-secondary text-xs" id="pulse">Watching live…</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="pulse-dot" style="width:8px;height:8px;background:var(--success);"></span>
          <span class="text-xs text-secondary">Live</span>
        </div>
      </div>

      <div id="incidentBlock" class="mb-5"></div>

      <div class="flex justify-between items-center mb-2">
        <h3 class="text-sm text-secondary" style="text-transform:uppercase; letter-spacing:0.04em;">Stuck jobs</h3>
        <select id="minsSelect" class="input" style="width:auto; height:32px; font-size:12px; padding:0 8px;">
          <option value="2">2+ min</option>
          <option value="3" selected>3+ min</option>
          <option value="5">5+ min</option>
          <option value="10">10+ min</option>
        </select>
      </div>
      <div id="stuckBlock" class="mb-5">${skeletonRows(2)}</div>

      <h3 class="text-sm text-secondary mb-2" style="text-transform:uppercase; letter-spacing:0.04em;">Funnel — last 7 days</h3>
      <div id="funnelBlock" class="mb-6">${skeletonRows(2)}</div>
    </div>
  `;

  let cancelled = false;
  let drivers = [];

  // ---------- Incidents ----------
  async function loadIncidents() {
    const block = root.querySelector("#incidentBlock");
    try {
      const incidents = await api.listOpenIncidents();
      if (cancelled) return;
      if (!incidents.length) {
        block.innerHTML = `
          <div class="card flex items-center gap-3" style="border-color:var(--surface-border);">
            <div class="list-row-icon" style="background:var(--brand-ride-soft); color:var(--accent);">${icon("check-circle", 18)}</div>
            <p class="text-sm text-secondary" style="flex:1;">No open safety incidents</p>
          </div>`;
        return;
      }
      block.innerHTML = `
        <div class="card" style="border:2px solid var(--error); background:rgba(225,29,72,0.05);">
          <p class="font-bold mb-3" style="color:var(--error);">${icon("sos", 16)} ${incidents.length} open incident${incidents.length === 1 ? "" : "s"}</p>
          <div class="flex-col gap-3">
            ${incidents.map((i) => `
              <div style="border-top:1px solid var(--surface-border); padding-top:var(--sp-3);">
                <div class="flex justify-between items-start">
                  <div>
                    <p class="font-bold text-sm">${esc(i.user?.name || i.user?.phone || "User")} · ${esc(i.type)}</p>
                    <p class="text-xs text-muted">${esc(i.user?.phone || "")} · ${new Date(i.createdAt).toLocaleTimeString()}</p>
                    ${i.note ? `<p class="text-xs text-secondary mt-1">${esc(i.note)}</p>` : ""}
                  </div>
                  <span class="badge ${i.status === "OPEN" ? "badge-error" : "badge-warning"}">${esc(i.status)}</span>
                </div>
                <div class="flex gap-2 mt-2">
                  ${i.user?.phone ? `<a href="tel:${esc(i.user.phone)}" class="btn btn-secondary btn-sm" style="flex:1;">Call</a>` : ""}
                  ${i.lat ? `<a href="https://www.google.com/maps?q=${i.lat},${i.lng}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="flex:1;">Location</a>` : ""}
                  <button class="btn btn-primary btn-sm" style="flex:1;" data-resolve="${esc(i.id)}">Resolve</button>
                </div>
              </div>`).join("")}
          </div>
        </div>`;

      block.querySelectorAll("[data-resolve]").forEach((b) =>
        b.addEventListener("click", async () => {
          b.disabled = true;
          try {
            await api.updateIncident(b.dataset.resolve, "RESOLVED", "Handled by ops");
            toast("Incident resolved");
            loadIncidents();
          } catch (err) { toast(err.message || "Couldn't update", true); b.disabled = false; }
        }),
      );
    } catch {
      if (!cancelled) block.innerHTML = "";
    }
  }

  // ---------- Stuck jobs ----------
  async function loadStuck() {
    const block = root.querySelector("#stuckBlock");
    const mins = root.querySelector("#minsSelect").value;
    try {
      const [data, avail] = await Promise.all([api.getStuckJobs(mins), api.getAvailableDrivers().catch(() => [])]);
      if (cancelled) return;
      drivers = avail || [];
      root.querySelector("#pulse").textContent =
        data.total > 0 ? `${data.total} job${data.total === 1 ? "" : "s"} need attention` : "Everything is moving";

      if (data.total === 0) {
        block.innerHTML = emptyRich({
          icon: icon("check-circle", 26),
          title: "Nothing stuck",
          body: "Every job is matched or in progress. This is what a good evening looks like.",
        });
        return;
      }

      const rows = [
        ...data.trips.map((t) => ({
          kind: "TRIP", id: t.id, wait: t.waitingMinutes,
          title: `Ride · ${String(t.vehicleType || "").toLowerCase()}`,
          value: t.fare, who: t.rider, phone: t.rider?.phone,
        })),
        ...data.deliveries.map((d) => ({
          kind: "DELIVERY", id: d.id, wait: d.waitingMinutes,
          title: "Parcel", value: d.fare, who: d.sender, phone: d.sender?.phone,
        })),
        ...data.foodOrders.map((o) => ({
          kind: "FOOD_ORDER", id: o.id, wait: o.waitingMinutes,
          title: `Food · ${o.restaurant?.name || "restaurant"}`,
          value: o.total, who: o.customer, phone: o.customer?.phone,
          extraPhone: o.restaurant?.notifyPhone, extraLabel: "Call kitchen",
          status: o.status,
        })),
        ...data.errands.map((e) => ({
          kind: "ERRAND", id: e.id, wait: e.waitingMinutes,
          title: "Errand", value: null, who: e.requester, phone: e.requester?.phone,
        })),
      ].sort((a, b) => b.wait - a.wait);

      block.innerHTML = rows.map((r) => `
        <div class="card mb-3" style="border-left:4px solid ${r.wait >= 8 ? "var(--error)" : "var(--warning)"};">
          <div class="flex justify-between items-start mb-2">
            <div>
              <p class="font-bold text-sm">${esc(r.title)}</p>
              <p class="ref-id">#${esc(r.id.slice(0, 8).toUpperCase())} · waiting ${r.wait} min</p>
            </div>
            ${r.value != null ? `<p class="font-bold">${fmtMoney(r.value)}</p>` : ""}
          </div>
          <p class="text-xs text-secondary mb-3">${esc(r.who?.name || "Customer")} · ${esc(r.phone || "no number")}</p>
          <div class="flex gap-2 mb-2">
            ${r.phone ? `<a href="tel:${esc(r.phone)}" class="btn btn-secondary btn-sm" style="flex:1;">Call customer</a>` : ""}
            ${r.extraPhone ? `<a href="tel:${esc(r.extraPhone)}" class="btn btn-secondary btn-sm" style="flex:1;">${esc(r.extraLabel)}</a>` : ""}
          </div>
          ${r.kind === "FOOD_ORDER" && r.status === "PLACED"
            ? `<p class="text-xs text-muted">Kitchen hasn't accepted yet — call them, no rider needed until it's ready.</p>`
            : `
              <div class="flex gap-2">
                <select class="input" data-driver-for="${esc(r.id)}" style="flex:1; height:40px; font-size:13px;">
                  <option value="">Assign a driver…</option>
                  ${drivers.map((d) => `<option value="${esc(d.userId)}">${esc(d.user?.name || d.user?.phone)} · ${esc(d.vehicleType)}${d.serviceZone ? ` · ${esc(d.serviceZone)}` : ""}</option>`).join("")}
                </select>
                <button class="btn btn-primary btn-sm" data-assign="${esc(r.id)}" data-kind="${r.kind}">Assign</button>
              </div>`}
        </div>
      `).join("");

      block.querySelectorAll("[data-assign]").forEach((b) =>
        b.addEventListener("click", async () => {
          const jobId = b.dataset.assign;
          const sel = block.querySelector(`[data-driver-for="${jobId}"]`);
          const driverId = sel?.value;
          if (!driverId) { toast("Pick a driver first", true); return; }
          b.disabled = true;
          b.innerHTML = `<span class="spinner"></span>`;
          try {
            await api.manuallyAssign(b.dataset.kind, jobId, driverId);
            toast("Assigned — driver notified");
            loadStuck();
          } catch (err) {
            toast(err.message || "Couldn't assign", true);
            b.disabled = false;
            b.textContent = "Assign";
          }
        }),
      );
    } catch (err) {
      if (!cancelled) block.innerHTML = `<div class="empty-state"><p class="text-sm">${esc(err.message || "Couldn't load stuck jobs")}</p></div>`;
    }
  }

  // ---------- Funnel ----------
  async function loadFunnel() {
    const block = root.querySelector("#funnelBlock");
    try {
      const f = await api.getFunnel(7);
      if (cancelled) return;
      const c = f.counts || {};
      const conv = f.conversion || {};
      const row = (label, value, suffix = "") =>
        `<div class="flex justify-between items-center" style="padding:var(--sp-2) 0; border-bottom:1px solid rgba(14,29,22,0.06);">
           <span class="text-sm text-secondary">${label}</span>
           <span class="font-bold">${value}${suffix}</span>
         </div>`;
      block.innerHTML = `
        <div class="card">
          ${row("OTP requested", c.otp_requested || 0)}
          ${row("OTP verified", c.otp_verified || 0)}
          ${row("→ verified rate", conv.otpVerifiedOfRequested ?? 0, "%")}
          ${row("Rides requested", c.ride_requested || 0)}
          ${row("Drivers matched", c.ride_driver_matched || 0)}
          ${row("Rides completed", c.ride_completed || 0)}
          ${row("→ completion rate", conv.rideCompletedOfRequested ?? 0, "%")}
          ${row("Food orders placed", c.food_order_placed || 0)}
          ${row("Food delivered", c.food_delivered || 0)}
          ${row("Driver accept rate", conv.driverAcceptOfOffered ?? 0, "%")}
        </div>`;
    } catch {
      if (!cancelled) block.innerHTML = `<div class="empty-state"><p class="text-sm">Funnel data unavailable</p></div>`;
    }
  }

  root.querySelector("#minsSelect").addEventListener("change", loadStuck);

  loadIncidents();
  loadStuck();
  loadFunnel();

  // An SOS must land on this screen without anyone refreshing.
  socketManager.connect();
  const onIncident = () => { toast("🚨 New SOS incident"); loadIncidents(); };
  socketManager.on("incident:new", onIncident);

  const poll = setInterval(() => { loadStuck(); loadIncidents(); }, 15000);

  return () => {
    cancelled = true;
    clearInterval(poll);
    socketManager.off("incident:new", onIncident);
  };
}
