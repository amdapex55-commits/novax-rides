// Nova Go — ops marketplace desk.
//
// WHY THIS EXISTS SEPARATELY FROM THE DASHBOARD
//
// "Today" answers what HAPPENED: trips, revenue, signups. Those are outcomes,
// and every one of them can look healthy on a day the marketplace is quietly
// failing — because a customer who opened the app, waited, and gave up never
// becomes a trip and never appears in any of them.
//
// This screen answers the only question that decides whether the pilot
// survives: can a person who opens Nova Go actually get a rider?
//
// The number to act on is NO-MATCH RATE BY AREA. Booking is Karachi-wide
// deliberately, and the trade that makes that work is recruiting riders in
// tight clusters rather than fencing customers out. An area with demand and
// no supply shows up here — that is the next recruitment drive, not a reason
// to shrink the service area.

import { api } from "../api.js";
import { icon } from "../icons.js";
import { esc, skeletonRows } from "../ui.js";
import { state } from "../state.js";
import { reportHandled } from "../errors.js";

const WINDOWS = [
  { key: 60, label: "Last hour" },
  { key: 180, label: "3 hours" },
  { key: 720, label: "12 hours" },
];

export function renderOpsMarket(root) {
  let windowMinutes = 60;
  let timer = null;

  root.innerHTML = `
    <div class="page nx-stagger">
      <h1 class="text-xl mb-1">Marketplace</h1>
      <p class="text-secondary text-sm mb-4">
        Whether someone opening the app right now can actually get a rider.
      </p>

      <div class="nx-seg mb-4" id="winSeg" role="group" aria-label="Time window">
        ${WINDOWS.map((w) => `<button class="nx-seg-btn${w.key === 60 ? " active" : ""}" data-win="${w.key}">${w.label}</button>`).join("")}
      </div>

      <div id="marketBody">${skeletonRows(3)}</div>
    </div>
  `;

  const body = root.querySelector("#marketBody");

  function load() {
    api.getMarketplaceMetrics(windowMinutes)
      .then((m) => { if (root.isConnected) body.innerHTML = marketHtml(m); })
      .catch((err) => {
        if (!root.isConnected) return;
        reportHandled(err, "opsMarketplace");
        body.innerHTML = `<div class="empty-state"><p>Couldn't load marketplace metrics.</p></div>`;
      });
  }

  root.querySelector("#winSeg").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-win]");
    if (!btn) return;
    root.querySelectorAll("[data-win]").forEach((b) => b.classList.toggle("active", b === btn));
    windowMinutes = Number(btn.dataset.win);
    body.innerHTML = skeletonRows(3);
    load();
  });

  load();
  // Liquidity is a right-now property; a dispatcher leaves this open.
  timer = setInterval(load, 30_000);
  return () => clearInterval(timer);
}

/* Match rate is the headline because it is the one number that maps directly
   onto "did a customer get served". Everything else on this screen exists to
   explain it. */
function healthTone(matchRate) {
  if (matchRate == null) return { cls: "", word: "No requests yet" };
  if (matchRate >= 90) return { cls: "ok", word: "Healthy" };
  if (matchRate >= 70) return { cls: "warn", word: "Under strain" };
  return { cls: "bad", word: "Failing" };
}

function marketHtml(m) {
  const tone = healthTone(m.matchRate);
  const unmatched = Math.max(0, (m.requested ?? 0) - (m.matched ?? 0));

  return `
    <div class="nx-market-hero ${tone.cls} mb-4">
      <p class="nx-owe-label">Match rate · ${esc(String(m.windowMinutes))} min</p>
      <p class="nx-market-big">${m.matchRate == null ? "—" : m.matchRate + "%"}</p>
      <p class="nx-market-word">${esc(tone.word)}</p>
      <p class="nx-owe-meta" style="margin-top:8px;">
        ${m.requested ?? 0} requested · ${m.matched ?? 0} matched · ${unmatched} never got a rider
      </p>
    </div>

    <div class="nx-desk-grid nx-stat-grid mb-4">
      ${statCard("Riders online", m.onlineDrivers ?? 0, "var(--success)")}
      ${statCard("Requests / min", m.requestsPerMinute ?? 0, "var(--accent)")}
      ${statCard("Median wait", m.medianMatchSeconds == null ? "—" : m.medianMatchSeconds + "s", "var(--accent-2)")}
      ${statCard("Cancelled", (m.cancellationRate ?? 0) + "%", "var(--text-secondary)")}
      ${statCard("No driver found", m.noDriver ?? 0, "var(--warning)")}
      ${statCard("Escalated to ops", m.escalated ?? 0, "var(--error)")}
    </div>

    <!-- The actionable half. Everything above describes the problem; this
         says where to go and fix it. -->
    <div class="nx-sec"><span class="nx-sec-title">Where supply is thin</span></div>
    ${(m.worstAreas || []).length === 0 ? `
      <div class="empty-state">
        <div class="icon">${icon("check-circle", 30)}</div>
        <p class="font-bold" style="color:var(--text-primary);">Everything matched</p>
        <p class="text-sm mt-1">No area failed to find a rider in this window.</p>
      </div>` : `
      <p class="text-xs text-muted mb-3">
        Each row is roughly a 1km square around the pickups that failed. These
        are recruitment targets, not reasons to shrink the service area.
      </p>
      <div class="flex-col gap-2">
        ${m.worstAreas.map((a) => `
          <div class="nx-heat-row ${a.noMatchRate >= 60 ? "hot" : a.noMatchRate >= 30 ? "warm" : "normal"}">
            <span class="nx-heat-flame">${icon("map-pin", 17)}</span>
            <div style="flex:1;min-width:0;">
              <p class="font-bold text-sm" dir="auto">${esc(a.label || a.key)}</p>
              <p class="text-xs text-secondary">
                ${a.unmatched} of ${a.requests} requests found nobody
              </p>
            </div>
            <span class="badge ${a.noMatchRate >= 60 ? "badge-danger" : "badge-warning"}">${a.noMatchRate}%</span>
          </div>`).join("")}
      </div>`}
  `;
}

function statCard(label, value, colour) {
  return `
    <div class="card" style="padding:14px 16px;">
      <p class="text-xs text-secondary mb-1">${esc(label)}</p>
      <p class="font-bold nx-stat-num" style="color:${colour};">${esc(String(value))}</p>
    </div>`;
}

/* ==================================================================== 
   TRIP TIMELINE
   ====================================================================

   The audit trail existed and nothing could read it.

   When a customer says "my driver never came", the trip's final status is
   identical whether the driver was offered and declined four times, accepted
   and never moved, or was never found at all. Those are three different
   failures with three different responses — refund and apologise, discipline
   a rider, or recruit in that area — and only the sequence tells them apart.

   Rendered as a vertical timeline rather than a table because the QUESTION is
   always "what happened, in what order, and where did the gap appear". A gap
   is visible as a jump in the timestamps; in a table it is arithmetic.       */

const EVENT_META = {
  REQUESTED:      { icon: "bolt",         tone: "neutral", label: "Ride requested" },
  QUOTED:         { icon: "wallet",       tone: "neutral", label: "Fare quoted" },
  OFFERED:        { icon: "send",         tone: "neutral", label: "Offered to a rider" },
  DECLINED:       { icon: "close",        tone: "warn",    label: "Rider declined or timed out" },
  ACCEPTED:       { icon: "check-circle", tone: "good",    label: "Rider accepted" },
  ARRIVED:        { icon: "map-pin",      tone: "good",    label: "Rider arrived at pickup" },
  STARTED:        { icon: "bike",         tone: "good",    label: "Trip started" },
  COMPLETED:      { icon: "check",        tone: "good",    label: "Trip completed" },
  CANCELLED:      { icon: "close",        tone: "bad",     label: "Cancelled" },
  NO_DRIVER:      { icon: "help",         tone: "bad",     label: "No rider found in any radius" },
  OPS_ALERTED:    { icon: "bell",         tone: "warn",    label: "Ops alerted" },
  OPS_ESCALATED:  { icon: "sos",          tone: "bad",     label: "Escalated to manual dispatch" },
  FARE_DRIFT:     { icon: "shield",       tone: "bad",     label: "Fare drift detected" },
};

export function renderTripTimeline(root) {
  /* The id comes from state (set by whoever linked here). The hash fallback
     supports a pasted deep link like #/ops/trip/<id> — and is guarded on the
     segment count, because a bare #/ops/trip otherwise parses "trip" itself
     as the id and fires a request at /trips/trip/events. That returned a
     confusing 4xx instead of an honest "no trip selected". */
  const segments = location.hash.replace(/^#/, "").split("/").filter(Boolean);
  const fromHash = segments.length > 2 && segments[0] === "ops" && segments[1] === "trip"
    ? segments[2]
    : null;
  const tripId = state.opsTripId || fromHash;

  root.innerHTML = `
    <div class="page nx-stagger">
      <button id="backBtn" class="btn-icon mb-4">${icon("arrow-back", 20)}</button>
      <h1 class="text-xl mb-1">Trip timeline</h1>
      <p class="text-secondary text-sm mb-4">
        <span class="ref-id">#${esc((tripId || "").slice(0, 8).toUpperCase())}</span>
        — everything that happened, in order.
      </p>
      <div id="timelineBody">${skeletonRows(4)}</div>
    </div>
  `;
  root.querySelector("#backBtn").addEventListener("click", () => history.back());

  const body = root.querySelector("#timelineBody");
  if (!tripId) {
    body.innerHTML = `<div class="empty-state"><p>No trip selected.</p></div>`;
    return;
  }

  api.getTripEvents(tripId)
    .then((events) => {
      if (!root.isConnected) return;
      if (!Array.isArray(events) || events.length === 0) {
        body.innerHTML = `
          <div class="empty-state">
            <div class="icon">${icon("history", 30)}</div>
            <p class="font-bold" style="color:var(--text-primary);">No events recorded</p>
            <p class="text-sm mt-1">
              This trip predates the audit trail, or nothing has happened yet.
            </p>
          </div>`;
        return;
      }
      body.innerHTML = timelineHtml(events);
    })
    .catch((err) => {
      if (!root.isConnected) return;
      reportHandled(err, "tripTimeline");
      body.innerHTML = `<div class="empty-state"><p>Couldn't load this trip's history.</p></div>`;
    });
}

function timelineHtml(events) {
  const start = new Date(events[0].createdAt).getTime();
  return `<div class="nx-timeline">${events
    .map((e, i) => {
      const meta = EVENT_META[e.type] || { icon: "help", tone: "neutral", label: e.type };
      const at = new Date(e.createdAt);
      const offset = Math.round((at.getTime() - start) / 1000);
      // The gap since the PREVIOUS event is the number that matters — a long
      // one is where the trip went wrong, and it is otherwise mental
      // arithmetic across two timestamps.
      const gap = i === 0 ? null : Math.round((at.getTime() - new Date(events[i - 1].createdAt).getTime()) / 1000);
      return `
        <div class="nx-tl-row ${meta.tone}">
          <span class="nx-tl-dot">${icon(meta.icon, 13)}</span>
          <div style="flex:1;min-width:0;">
            <p class="nx-tl-label">${esc(meta.label)}</p>
            ${metaLine(e.meta)}
            <p class="nx-tl-time">
              ${at.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              · +${offset}s${gap != null && gap >= 20 ? ` · <strong>${gap}s gap</strong>` : ""}
            </p>
          </div>
        </div>`;
    })
    .join("")}</div>`;
}

/** Only the fields worth reading at a glance; the rest stays in the database
 *  rather than becoming a wall of JSON on a dispatcher's screen. */
function metaLine(meta) {
  if (!meta || typeof meta !== "object") return "";
  const bits = [];
  if (meta.fare != null) bits.push(`Rs ${Math.round(Number(meta.fare))}`);
  if (meta.finalFare != null) bits.push(`Rs ${Math.round(Number(meta.finalFare))}`);
  if (meta.reason) bits.push(String(meta.reason).toLowerCase().replace(/_/g, " "));
  if (meta.waitingMs != null) bits.push(`after ${Math.round(meta.waitingMs / 1000)}s`);
  if (meta.distanceKm != null) bits.push(`${meta.distanceKm} km`);
  if (meta.distanceSource === "ESTIMATED") bits.push("distance estimated");
  if (meta.accepted != null && meta.computed != null) {
    bits.push(`accepted Rs ${Math.round(meta.accepted)} vs computed Rs ${Math.round(meta.computed)}`);
  }
  return bits.length ? `<p class="nx-tl-meta" dir="auto">${esc(bits.join(" · "))}</p>` : "";
}
