// Nova Go Merchant — storefront onboarding.
//
// The old version was four inputs on a white page: name, description,
// address, cuisine tags. Two problems with that.
//
// First, it didn't collect enough to actually open a storefront. No logo, no
// banner, no hours, no prep time, no contact number for when an order goes
// wrong, no payout destination. Every one of those had to be chased by phone
// afterwards, which is the slowest and most expensive part of signing a
// kitchen — and until they're filled in, the restaurant cannot go live.
//
// Second, it looked like a form, not an opportunity. A restaurant owner is
// deciding whether to trust us with their dinner rush. Four grey inputs make
// that decision harder than it needs to be.
//
// So: a five-step wizard with a LIVE STOREFRONT PREVIEW that builds itself as
// they type. They watch their restaurant appear exactly as customers will see
// it. That preview is the entire persuasion strategy — it turns data entry
// into "look, that's my place, on the app".
//
// Design notes:
//   - Progress is always visible; nobody abandons a form they can see the end of.
//   - Every step validates on its own, so errors surface next to the field
//     that caused them rather than after a long scroll on submit.
//   - Draft state persists to sessionStorage, so a dropped connection or a
//     misfired back button doesn't cost them fifteen minutes of typing.
//   - Only name + address are truly required. Everything else can be skipped
//     and completed later from the store profile — a wizard that won't let
//     you finish is worse than one that collects less.

import { api } from "../api.js";
import { icon } from "../icons.js";
import { toast, esc, confettiBurst } from "../ui.js";
import { navigate } from "../router.js";
import { geocode, getCurrentCoords, createSuggester } from "../geocode.js";

const DRAFT_KEY = "novago_restaurant_draft";

const DAYS = [
  ["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"],
  ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"],
];

const CUISINES = [
  "Pakistani", "BBQ", "Biryani", "Karahi", "Fast Food", "Burgers", "Pizza",
  "Chinese", "Broast", "Desi Breakfast", "Nihari", "Rolls & Shawarma",
  "Seafood", "Continental", "Desserts", "Chai & Snacks",
];

const PAYOUT_METHODS = [
  { id: "JAZZCASH", label: "JazzCash", hint: "Mobile wallet number" },
  { id: "EASYPAISA", label: "Easypaisa", hint: "Mobile wallet number" },
  { id: "BANK", label: "Bank account", hint: "IBAN or account number" },
];

/** Fresh draft. Sensible defaults so a hurried owner can skip most of this. */
function blankDraft() {
  const hours = {};
  DAYS.forEach(([k]) => { hours[k] = { open: "11:00", close: "23:00", closed: false }; });
  return {
    name: "", description: "", address: "", cuisineTags: [],
    logoUrl: "", bannerUrl: "",
    ownerName: "", ownerPhone: "", notifyPhone: "",
    openingHours: hours,
    prepTimeMinutes: 25,
    deliveryRadiusKm: 5,
    minOrderValue: 0,
    payoutMethod: "", payoutAccountName: "", payoutAccountNumber: "",
    menu: [],
    lat: null, lng: null,
  };
}

function loadDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return blankDraft();
    return { ...blankDraft(), ...JSON.parse(raw) };
  } catch { return blankDraft(); }
}
function saveDraft(d) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* private mode */ }
}

/* ==========================================================================
   Image upload — presigned PUT straight to R2, no file ever touches our API.
   ========================================================================== */

async function uploadImage(file, purpose) {
  if (!file) return "";
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new Error("Use a JPG, PNG or WebP image");
  }
  // 5MB. A phone camera shot is often 4–8MB, so this is a real limit people
  // hit — the message says what to do rather than just refusing.
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("That image is over 5MB — try a smaller one");
  }
  const { uploadUrl, publicUrl } = await api.presignUpload(purpose, file.type, file.name);
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) throw new Error("Upload failed — check your connection");
  return publicUrl;
}

/* ==========================================================================
   The live preview — a real storefront card, exactly as food browse renders it.
   ========================================================================== */

function previewHtml(d) {
  const tags = d.cuisineTags.length ? d.cuisineTags.slice(0, 3).join(" · ") : "Add your cuisine";
  const name = d.name.trim() || "Your restaurant name";
  const unnamed = !d.name.trim();
  const prep = d.prepTimeMinutes || 25;
  const eta = `${prep}–${prep + 15} min`;

  return `
    <div class="nx-store-preview">
      <div class="nx-store-banner" ${d.bannerUrl ? `style="background-image:url('${esc(d.bannerUrl)}');"` : ""}>
        ${d.bannerUrl ? "" : `<span class="nx-store-banner-hint">${icon("image", 22)}<span>Banner photo</span></span>`}
        <span class="nx-store-openpill">OPEN NOW</span>
        ${d.logoUrl
          ? `<img class="nx-store-logo" src="${esc(d.logoUrl)}" alt=""/>`
          : `<div class="nx-store-logo placeholder">${esc((d.name.trim()[0] || "?").toUpperCase())}</div>`}
      </div>
      <div class="nx-store-body">
        <div class="nx-store-row">
          <h4 class="${unnamed ? "muted" : ""}">${esc(name)}</h4>
          <span class="nx-store-rating">★ 5.0</span>
        </div>
        <p class="nx-store-tags">${esc(tags)}</p>
        <div class="nx-store-meta">
          <span>${eta}</span><span>·</span>
          <span>Delivery Rs. 50</span><span>·</span>
          <span>${d.deliveryRadiusKm} km radius</span>
        </div>
        ${d.minOrderValue > 0
          ? `<p class="nx-store-min">Min order Rs. ${d.minOrderValue}</p>` : ""}
      </div>
    </div>
    <p class="nx-preview-caption">${icon("eye", 13)} This is exactly what customers see</p>
  `;
}

/* ==========================================================================
   Steps
   ========================================================================== */

const STEPS = [
  { id: "identity", title: "Your restaurant", sub: "The name and look customers see first." },
  { id: "location", title: "Where you are", sub: "So we only show you to nearby customers." },
  { id: "hours",    title: "When you're open", sub: "We hide your storefront outside these hours." },
  { id: "money",    title: "Getting paid", sub: "Where your weekly share is sent." },
  { id: "menu",     title: "A few dishes", sub: "Start with three. You can add the rest later." },
];

function stepIdentity(d) {
  return `
    <label class="field-label">Restaurant name *</label>
    <input id="f-name" class="input mb-4" maxlength="80" value="${esc(d.name)}"
           placeholder="e.g. Karachi Karahi House" autocomplete="organization"/>

    <label class="field-label">Logo</label>
    <div class="nx-upload-row mb-4">
      <div class="nx-upload-thumb ${d.logoUrl ? "has" : ""}" id="logoThumb">
        ${d.logoUrl ? `<img src="${esc(d.logoUrl)}" alt=""/>` : icon("store", 22)}
      </div>
      <div style="flex:1;">
        <button type="button" class="btn btn-secondary btn-sm" id="logoBtn">
          ${d.logoUrl ? "Change logo" : "Upload logo"}
        </button>
        <p class="text-xs text-muted mt-1">Square works best. JPG or PNG, under 5MB.</p>
      </div>
      <input type="file" id="logoFile" accept="image/jpeg,image/png,image/webp" hidden/>
    </div>

    <label class="field-label">Banner photo</label>
    <div class="nx-upload-row mb-4">
      <div class="nx-upload-thumb wide ${d.bannerUrl ? "has" : ""}" id="bannerThumb">
        ${d.bannerUrl ? `<img src="${esc(d.bannerUrl)}" alt=""/>` : icon("image", 22)}
      </div>
      <div style="flex:1;">
        <button type="button" class="btn btn-secondary btn-sm" id="bannerBtn">
          ${d.bannerUrl ? "Change banner" : "Upload banner"}
        </button>
        <p class="text-xs text-muted mt-1">A wide shot of your best dish sells more than a logo.</p>
      </div>
      <input type="file" id="bannerFile" accept="image/jpeg,image/png,image/webp" hidden/>
    </div>

    <label class="field-label">What you're known for</label>
    <textarea id="f-desc" class="input mb-4" maxlength="500" rows="3"
      placeholder="Home-style karahi and BBQ, cooked fresh since 1998.">${esc(d.description)}</textarea>

    <label class="field-label">Cuisine</label>
    <p class="text-xs text-muted mb-2">Pick up to 4 — these are the filters customers search by.</p>
    <div class="nx-chip-pick mb-2" id="cuisineWrap">
      ${CUISINES.map((c) => `
        <button type="button" class="nx-chip-opt ${d.cuisineTags.includes(c) ? "on" : ""}" data-cuisine="${esc(c)}">${esc(c)}</button>
      `).join("")}
    </div>
  `;
}

function stepLocation(d) {
  return `
    <label class="field-label">Street address *</label>
    <div class="nx-autocomplete mb-1">
      <input id="f-address" class="input" maxlength="200" value="${esc(d.address)}"
             placeholder="Shop 4, Zamzama Blvd, DHA Phase 5" autocomplete="off"/>
      <div class="nx-suggest" id="addrSuggest" hidden></div>
    </div>
    <p class="text-xs text-muted mb-4" id="geoStatus">
      ${d.lat ? `${icon("check", 12)} Pinned on the map` : "Start typing and pick your area from the list."}
    </p>

    <label class="field-label">How far will you deliver?</label>
    <div class="nx-range-row mb-1">
      <input type="range" id="f-radius" class="nx-range" min="1" max="15" step="1" value="${d.deliveryRadiusKm}"/>
      <output id="radiusOut" class="nx-range-out">${d.deliveryRadiusKm} km</output>
    </div>
    <p class="text-xs text-muted mb-5">
      We won't show your storefront to anyone further than this. Smaller radius means hotter food.
    </p>

    <label class="field-label">Typical prep time</label>
    <div class="nx-seg mb-1" id="prepWrap">
      ${[15, 20, 25, 30, 45].map((m) => `
        <button type="button" class="nx-seg-btn ${d.prepTimeMinutes === m ? "on" : ""}" data-prep="${m}">${m} min</button>
      `).join("")}
    </div>
    <p class="text-xs text-muted mb-5">
      This drives the ETA customers see. Be honest — a realistic 35 minutes beats
      a hopeful 20 that arrives late.
    </p>

    <label class="field-label">Minimum order <span class="text-muted" style="text-transform:none;font-weight:400;">(optional)</span></label>
    <input id="f-minorder" class="input mb-4" type="number" min="0" step="50" value="${d.minOrderValue || ""}"
           placeholder="0 — no minimum" inputmode="numeric"/>
  `;
}

function stepHours(d) {
  return `
    <div class="nx-hours" id="hoursWrap">
      ${DAYS.map(([k, label]) => {
        const h = d.openingHours[k] || { open: "11:00", close: "23:00", closed: false };
        return `
          <div class="nx-hours-row ${h.closed ? "closed" : ""}" data-day="${k}">
            <label class="nx-hours-day">
              <input type="checkbox" data-day-open="${k}" ${h.closed ? "" : "checked"}/>
              <span>${label}</span>
            </label>
            <div class="nx-hours-times">
              <input type="time" class="input nx-time" data-open="${k}" value="${esc(h.open)}" ${h.closed ? "disabled" : ""}/>
              <span class="text-muted">to</span>
              <input type="time" class="input nx-time" data-close="${k}" value="${esc(h.close)}" ${h.closed ? "disabled" : ""}/>
            </div>
          </div>`;
      }).join("")}
    </div>
    <button type="button" class="btn btn-ghost btn-sm btn-block mt-3" id="copyMon">
      Apply Monday's hours to every day
    </button>

    <div class="nx-launch-note mt-5">
      ${icon("info", 16)}
      <span>Closing early on a quiet night? You can flip your storefront closed
      any time with one tap — these hours are just the default.</span>
    </div>
  `;
}

function stepMoney(d) {
  return `
    <label class="field-label">Owner / manager name</label>
    <input id="f-owner" class="input mb-4" maxlength="80" value="${esc(d.ownerName)}"
           placeholder="Who should we ask for?" autocomplete="name"/>

    <label class="field-label">Number to call about live orders</label>
    <input id="f-notify" class="input mb-1" maxlength="20" value="${esc(d.notifyPhone)}"
           placeholder="03XX XXXXXXX" inputmode="tel" autocomplete="tel"/>
    <p class="text-xs text-muted mb-5">
      This is the kitchen phone, not your login. If an order goes quiet at 9pm,
      this is the number a real person on our team dials.
    </p>

    <label class="field-label">Where should we send your earnings?</label>
    <div class="nx-pay-grid mb-4" id="payWrap">
      ${PAYOUT_METHODS.map((m) => `
        <button type="button" class="nx-pay-opt ${d.payoutMethod === m.id ? "on" : ""}" data-pay="${m.id}">
          <span class="nx-pay-name">${m.label}</span>
          <span class="nx-pay-hint">${m.hint}</span>
        </button>
      `).join("")}
    </div>

    <div id="payFields" ${d.payoutMethod ? "" : "hidden"}>
      <label class="field-label">Account title</label>
      <input id="f-payname" class="input mb-4" maxlength="80" value="${esc(d.payoutAccountName)}"
             placeholder="Name on the account"/>
      <label class="field-label">Account number</label>
      <input id="f-paynum" class="input mb-3" maxlength="34" value="${esc(d.payoutAccountNumber)}"
             placeholder="03XX XXXXXXX or IBAN" inputmode="numeric"/>
    </div>

    <div class="nx-launch-note">
      ${icon("shield", 16)}
      <span><strong>This is a payout destination, not a payment method.</strong>
      Nova Go never asks for a card, PIN or password. Money only ever moves
      <em>to</em> this account, ${
        // Pulled from the same config the driver/merchant explainers read.
        ""}every week.</span>
    </div>
  `;
}

function stepMenu(d) {
  return `
    <p class="text-secondary text-sm mb-4">
      Three dishes is enough to go live. Customers order your best-known item
      far more than anything else — start there.
    </p>

    <div id="menuList" class="flex-col gap-2 mb-3">
      ${d.menu.length ? d.menu.map((m, i) => `
        <div class="nx-menu-draft" data-idx="${i}">
          <div style="flex:1;min-width:0;">
            <p class="font-bold text-sm">${esc(m.name)}</p>
            <p class="text-xs text-muted">${esc(m.category || "Main")}</p>
          </div>
          <span class="font-bold text-sm">Rs. ${Number(m.price).toLocaleString("en-PK")}</span>
          <button type="button" class="btn-icon" data-remove="${i}" aria-label="Remove">${icon("close", 16)}</button>
        </div>
      `).join("") : `
        <div class="nx-empty" style="padding:26px 18px;">
          <div class="nx-empty-art" style="width:56px;height:56px;">${icon("restaurant", 24)}</div>
          <h3 style="font-size:15px;">No dishes yet</h3>
          <p style="font-size:12.5px;margin-bottom:0;">Add your first one below.</p>
        </div>`}
    </div>

    <div class="card">
      <label class="field-label">Dish name</label>
      <input id="m-name" class="input mb-3" maxlength="80" placeholder="Chicken Karahi (Half)"/>
      <div style="display:flex;gap:10px;">
        <div style="flex:1;">
          <label class="field-label">Price (Rs.)</label>
          <input id="m-price" class="input mb-3" type="number" min="1" step="10" placeholder="740" inputmode="numeric"/>
        </div>
        <div style="flex:1;">
          <label class="field-label">Category</label>
          <input id="m-cat" class="input mb-3" maxlength="40" placeholder="Karahi" list="catList"/>
          <datalist id="catList">
            <option value="Starters"></option><option value="Karahi"></option>
            <option value="BBQ"></option><option value="Biryani"></option>
            <option value="Breads"></option><option value="Drinks"></option>
            <option value="Desserts"></option>
          </datalist>
        </div>
      </div>
      <button type="button" class="btn btn-secondary btn-block" id="addDish">
        ${icon("add", 16)} Add dish
      </button>
    </div>

    <p class="text-xs text-muted mt-4" style="text-align:center;">
      You can skip this and build your full menu after approval.
    </p>
  `;
}

const RENDERERS = [stepIdentity, stepLocation, stepHours, stepMoney, stepMenu];

/* ==========================================================================
   The view
   ========================================================================== */

export function renderRestaurantOnboarding(root) {
  let draft = loadDraft();
  let step = 0;
  let suggester = null;

  root.innerHTML = `
    <div class="page nx-onboard">
      <div class="nx-onboard-head">
        <button id="backBtn" class="btn-icon" aria-label="Back">${icon("arrow-back", 20)}</button>
        <div class="nx-steps" id="steps">
          ${STEPS.map(() => "<i></i>").join("")}
        </div>
        <span class="nx-step-label" id="stepCount"></span>
      </div>

      <h1 class="text-xl mb-1" id="stepTitle"></h1>
      <p class="text-secondary text-sm mb-5" id="stepSub"></p>

      <div id="preview" class="mb-5"></div>

      <form id="stepForm" autocomplete="on"></form>

      <div class="nx-onboard-actions">
        <button type="button" class="btn btn-ghost" id="skipBtn">Skip</button>
        <button type="button" class="btn btn-primary" id="nextBtn" style="flex:1;"></button>
      </div>
    </div>
  `;

  const $ = (s) => root.querySelector(s);
  const form = $("#stepForm");
  const preview = $("#preview");

  function paintPreview() {
    // Only shown on the steps where it means something. On hours/payout it
    // would just be decoration taking up the screen.
    if (step > 1) { preview.innerHTML = ""; preview.hidden = true; return; }
    preview.hidden = false;
    preview.innerHTML = previewHtml(draft);
  }

  function paintProgress() {
    const bars = root.querySelectorAll("#steps i");
    bars.forEach((b, i) => {
      b.className = i < step ? "done" : i === step ? "now" : "";
    });
    $("#stepCount").textContent = `${step + 1} of ${STEPS.length}`;
    $("#stepTitle").textContent = STEPS[step].title;
    $("#stepSub").textContent = STEPS[step].sub;
    $("#nextBtn").textContent = step === STEPS.length - 1 ? "Submit for approval" : "Continue";
    // Steps 0 and 1 carry the only required fields, so skipping them is off.
    $("#skipBtn").hidden = step < 2;
  }

  function render() {
    suggester?.destroy();
    suggester = null;
    form.innerHTML = RENDERERS[step](draft);
    form.classList.remove("nx-stagger");
    void form.offsetWidth;      // restart the entrance animation
    form.classList.add("nx-stagger");
    paintProgress();
    paintPreview();
    bindStep();
    root.scrollTo?.({ top: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* -------------------------------------------------- per-step wiring --- */

  function bindStep() {
    if (step === 0) bindIdentity();
    if (step === 1) bindLocation();
    if (step === 2) bindHours();
    if (step === 3) bindMoney();
    if (step === 4) bindMenu();
  }

  function bindIdentity() {
    $("#f-name").addEventListener("input", (e) => {
      draft.name = e.target.value; saveDraft(draft); paintPreview();
    });
    $("#f-desc").addEventListener("input", (e) => {
      draft.description = e.target.value; saveDraft(draft);
    });

    root.querySelectorAll("[data-cuisine]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const c = btn.dataset.cuisine;
        const has = draft.cuisineTags.includes(c);
        if (!has && draft.cuisineTags.length >= 4) {
          toast("Four is the limit — it keeps search useful", true);
          return;
        }
        draft.cuisineTags = has
          ? draft.cuisineTags.filter((x) => x !== c)
          : [...draft.cuisineTags, c];
        btn.classList.toggle("on", !has);
        saveDraft(draft); paintPreview();
      });
    });

    const wire = (btnId, fileId, thumbId, purpose, field) => {
      const fileInput = $(`#${fileId}`);
      $(`#${btnId}`).addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        const thumb = $(`#${thumbId}`);
        const btn = $(`#${btnId}`);
        thumb.classList.add("nx-shimmer");
        btn.disabled = true;
        try {
          const url = await uploadImage(file, purpose);
          draft[field] = url;
          thumb.innerHTML = `<img src="${esc(url)}" alt=""/>`;
          thumb.classList.add("has");
          saveDraft(draft); paintPreview();
          toast("Uploaded");
        } catch (err) {
          toast(err.message || "Upload failed", true);
        } finally {
          thumb.classList.remove("nx-shimmer");
          btn.disabled = false;
        }
      });
    };
    wire("logoBtn", "logoFile", "logoThumb", "restaurant-logo", "logoUrl");
    wire("bannerBtn", "bannerFile", "bannerThumb", "restaurant-banner", "bannerUrl");
  }

  function bindLocation() {
    const input = $("#f-address");
    const list = $("#addrSuggest");
    const status = $("#geoStatus");

    suggester = createSuggester((results, { pending }) => {
      if (!results.length) { list.hidden = true; return; }
      list.hidden = false;
      list.innerHTML =
        results.map((r) => `
          <button type="button" class="nx-suggest-row" data-lat="${r.lat}" data-lng="${r.lng}">
            ${icon("location", 15)}<span>${esc(r.displayName)}</span>
          </button>`).join("") +
        (pending ? `<div class="nx-suggest-row muted">${icon("search", 14)}<span>Searching…</span></div>` : "");

      list.querySelectorAll("[data-lat]").forEach((row) => {
        row.addEventListener("click", () => {
          draft.address = row.textContent.trim();
          draft.lat = Number(row.dataset.lat);
          draft.lng = Number(row.dataset.lng);
          input.value = draft.address;
          list.hidden = true;
          status.innerHTML = `${icon("check", 12)} Pinned on the map`;
          saveDraft(draft);
        });
      });
    }, { near: null });

    input.addEventListener("input", (e) => {
      draft.address = e.target.value;
      // Typing after picking means the pin no longer matches the text.
      draft.lat = null; draft.lng = null;
      saveDraft(draft);
      suggester.query(e.target.value);
    });
    input.addEventListener("blur", () => setTimeout(() => { list.hidden = true; }, 180));

    const radius = $("#f-radius");
    radius.addEventListener("input", () => {
      draft.deliveryRadiusKm = Number(radius.value);
      $("#radiusOut").textContent = `${radius.value} km`;
      saveDraft(draft); paintPreview();
    });

    root.querySelectorAll("[data-prep]").forEach((b) => {
      b.addEventListener("click", () => {
        draft.prepTimeMinutes = Number(b.dataset.prep);
        root.querySelectorAll("[data-prep]").forEach((x) => x.classList.toggle("on", x === b));
        saveDraft(draft); paintPreview();
      });
    });

    $("#f-minorder").addEventListener("input", (e) => {
      draft.minOrderValue = Math.max(0, Number(e.target.value) || 0);
      saveDraft(draft); paintPreview();
    });
  }

  function bindHours() {
    root.querySelectorAll("[data-day-open]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const day = cb.dataset.dayOpen;
        draft.openingHours[day].closed = !cb.checked;
        const row = root.querySelector(`[data-day="${day}"]`);
        row.classList.toggle("closed", !cb.checked);
        row.querySelectorAll(".nx-time").forEach((t) => { t.disabled = !cb.checked; });
        saveDraft(draft);
      });
    });
    root.querySelectorAll("[data-open]").forEach((t) =>
      t.addEventListener("change", () => {
        draft.openingHours[t.dataset.open].open = t.value; saveDraft(draft);
      }));
    root.querySelectorAll("[data-close]").forEach((t) =>
      t.addEventListener("change", () => {
        draft.openingHours[t.dataset.close].close = t.value; saveDraft(draft);
      }));

    $("#copyMon").addEventListener("click", () => {
      const mon = { ...draft.openingHours.mon };
      DAYS.forEach(([k]) => { draft.openingHours[k] = { ...mon }; });
      saveDraft(draft);
      render();
      toast("Applied to all seven days");
    });
  }

  function bindMoney() {
    $("#f-owner").addEventListener("input", (e) => { draft.ownerName = e.target.value; saveDraft(draft); });
    $("#f-notify").addEventListener("input", (e) => { draft.notifyPhone = e.target.value; saveDraft(draft); });

    root.querySelectorAll("[data-pay]").forEach((b) => {
      b.addEventListener("click", () => {
        draft.payoutMethod = b.dataset.pay;
        root.querySelectorAll("[data-pay]").forEach((x) => x.classList.toggle("on", x === b));
        $("#payFields").hidden = false;
        saveDraft(draft);
      });
    });
    $("#f-payname").addEventListener("input", (e) => { draft.payoutAccountName = e.target.value; saveDraft(draft); });
    $("#f-paynum").addEventListener("input", (e) => { draft.payoutAccountNumber = e.target.value; saveDraft(draft); });
  }

  function bindMenu() {
    $("#addDish").addEventListener("click", () => {
      const name = $("#m-name").value.trim();
      const price = Number($("#m-price").value);
      const category = $("#m-cat").value.trim() || "Main";
      if (!name) { toast("Give the dish a name", true); return; }
      if (!price || price <= 0) { toast("Add a price", true); return; }
      draft.menu.push({ name, price, category });
      saveDraft(draft);
      render();
    });
    root.querySelectorAll("[data-remove]").forEach((b) =>
      b.addEventListener("click", () => {
        draft.menu.splice(Number(b.dataset.remove), 1);
        saveDraft(draft);
        render();
      }));
  }

  /* ------------------------------------------------------- validation --- */

  async function validateStep() {
    if (step === 0) {
      if (!draft.name.trim()) { toast("Your restaurant needs a name", true); $("#f-name")?.focus(); return false; }
      return true;
    }
    if (step === 1) {
      if (!draft.address.trim()) { toast("We need your address to place you on the map", true); $("#f-address")?.focus(); return false; }
      if (draft.lat == null) {
        // They typed an address without picking a suggestion. Resolve it now
        // rather than sending the storefront to the wrong part of the city.
        const btn = $("#nextBtn");
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner"></span>`;
        const here = await getCurrentCoords();
        const hit = await geocode(draft.address, here);
        btn.disabled = false;
        btn.textContent = "Continue";
        if (hit.resolved) {
          draft.lat = hit.lat; draft.lng = hit.lng; saveDraft(draft);
        } else {
          // Last resort: the device's own position. A kitchen signing up is
          // almost always standing in the kitchen.
          draft.lat = here.lat; draft.lng = here.lng; saveDraft(draft);
          toast("Couldn't find that address — using your current location. You can fix the pin later.");
        }
      }
      return true;
    }
    if (step === 3 && draft.payoutMethod) {
      if (!draft.payoutAccountNumber.trim()) {
        toast("Add the account number, or clear the payout method", true);
        return false;
      }
    }
    return true;
  }

  /* ----------------------------------------------------------- submit --- */

  async function submit() {
    const btn = $("#nextBtn");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>`;
    try {
      // Only send what's actually filled — the DTO treats everything except
      // name/address/lat/lng as optional, and empty strings would overwrite
      // good defaults with nothing.
      const payload = {
        name: draft.name.trim(),
        address: draft.address.trim(),
        lat: draft.lat, lng: draft.lng,
        cuisineTags: draft.cuisineTags,
        prepTimeMinutes: draft.prepTimeMinutes,
        deliveryRadiusKm: draft.deliveryRadiusKm,
        openingHours: draft.openingHours,
      };
      const optional = {
        description: draft.description.trim(),
        logoUrl: draft.logoUrl, bannerUrl: draft.bannerUrl,
        ownerName: draft.ownerName.trim(), notifyPhone: draft.notifyPhone.trim(),
        payoutMethod: draft.payoutMethod,
        payoutAccountName: draft.payoutAccountName.trim(),
        payoutAccountNumber: draft.payoutAccountNumber.trim(),
      };
      Object.entries(optional).forEach(([k, v]) => { if (v) payload[k] = v; });
      if (draft.minOrderValue > 0) payload.minOrderValue = draft.minOrderValue;

      await api.createRestaurant(payload);

      // Menu items are a separate endpoint. If one fails we do NOT fail the
      // whole signup — the storefront already exists, and losing it over a
      // mistyped price would be absurd. Report the count that made it.
      let added = 0;
      for (const m of draft.menu) {
        try {
          await api.addMenuItem({ name: m.name, price: m.price, category: m.category });
          added++;
        } catch (e) { console.warn("[NovaGo] menu item failed:", m.name, e.message); }
      }
      if (draft.menu.length && added < draft.menu.length) {
        toast(`Storefront created. ${added}/${draft.menu.length} dishes saved — add the rest from your menu.`);
      }

      sessionStorage.removeItem(DRAFT_KEY);
      const r = btn.getBoundingClientRect();
      confettiBurst(r.left + r.width / 2, r.top);
      setTimeout(() => navigate("/restaurant/pending"), 700);
    } catch (err) {
      toast(err.message || "Couldn't submit — try again", true);
      btn.disabled = false;
      btn.textContent = "Submit for approval";
    }
  }

  /* ------------------------------------------------------ navigation --- */

  $("#nextBtn").addEventListener("click", async () => {
    if (!(await validateStep())) return;
    if (step === STEPS.length - 1) { submit(); return; }
    step++;
    render();
  });

  $("#skipBtn").addEventListener("click", () => {
    if (step === STEPS.length - 1) { submit(); return; }
    step++;
    render();
  });

  $("#backBtn").addEventListener("click", () => {
    if (step === 0) { history.back(); return; }
    step--;
    render();
  });

  render();

  return () => suggester?.destroy();
}
