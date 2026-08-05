// Nova X landing — the interactive product surfaces.
//
// The thing that separates a real company's site from a template is that it
// SHOWS THE PRODUCT WORKING. So instead of describing the app in prose, this
// file animates it: a phone that actually books a ride step by step, an
// earnings slider a driver can move, an ops console with a feed that keeps
// arriving. Nothing here talks to the backend — it's a faithful re-creation
// of screens that exist in customer.html / driver.html / ops.html.
//
// Everything respects prefers-reduced-motion: sequences render their final,
// most informative frame and stop rather than looping.

const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const money = (n) => "Rs. " + Math.round(n).toLocaleString("en-PK");

/* ==========================================================================
   1. HERO PHONE — a ride, booked and matched, on a loop.
   ========================================================================== */

const RIDE_SEQUENCE = [
  {
    ms: 2600,
    map: { car: [22, 62], route: false, pins: false },
    sheet: `
      <span class="nx-chip ride">Where to?</span>
      <div style="margin-top:14px; border:1px solid #e6ebe8; border-radius:14px; padding:12px 14px;">
        <div class="nx-row" style="gap:10px; margin-bottom:10px;">
          <span style="width:9px;height:9px;border-radius:50%;background:#0fa968;flex:none;"></span>
          <span style="font-size:13.5px;color:#0e1d16;">Current location</span>
        </div>
        <div style="height:1px;background:#eef2f0;margin:0 0 10px 19px;"></div>
        <div class="nx-row" style="gap:10px;">
          <span style="width:9px;height:9px;border-radius:2px;background:#e2960a;flex:none;"></span>
          <span style="font-size:13.5px;color:#0e1d16;">Dolmen Mall, Clifton</span>
        </div>
      </div>
      <div class="nx-fakebtn solid" style="margin-top:14px;">Continue</div>`,
  },
  {
    ms: 3000,
    map: { car: [22, 62], route: true, pins: true },
    sheet: `
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <span style="font-size:15px;font-weight:800;letter-spacing:-0.02em;">Choose a ride</span>
        <span style="font-size:11.5px;color:#7b8a83;">6.2 km · 15 min</span>
      </div>
      <div style="margin-top:12px;display:flex;flex-direction:column;gap:7px;">
        <div style="display:flex;align-items:center;gap:11px;padding:11px 13px;border:2px solid #0fa968;border-radius:13px;background:rgba(15,169,104,0.05);">
          <span style="font-size:19px;">🛵</span>
          <div style="flex:1;"><div style="font-size:13.5px;font-weight:700;">Nova Moto</div><div style="font-size:11px;color:#7b8a83;">Fastest through traffic</div></div>
          <span style="font-size:14px;font-weight:800;">Rs. 210</span>
        </div>
        <div style="display:flex;align-items:center;gap:11px;padding:11px 13px;border:1px solid #e6ebe8;border-radius:13px;">
          <span style="font-size:19px;">🚗</span>
          <div style="flex:1;"><div style="font-size:13.5px;font-weight:700;">Nova Premium</div><div style="font-size:11px;color:#7b8a83;">AC car</div></div>
          <span style="font-size:14px;font-weight:800;">Rs. 640</span>
        </div>
      </div>
      <div class="nx-fakebtn solid" style="margin-top:12px;">Request ride</div>`,
  },
  {
    ms: 2400,
    map: { car: [40, 50], route: true, pins: true },
    sheet: `
      <span class="nx-chip live">Finding a driver</span>
      <div class="nx-row" style="margin-top:16px;gap:12px;">
        <span style="width:22px;height:22px;border:2.5px solid #e6ebe8;border-top-color:#0fa968;border-radius:50%;display:inline-block;animation:nx-spin 0.8s linear infinite;"></span>
        <span style="font-size:14px;color:#5c6a63;">Contacting drivers near you…</span>
      </div>
      <div style="margin-top:16px;padding-top:14px;border-top:1px solid #eef2f0;display:flex;justify-content:space-between;">
        <span style="font-size:12px;color:#7b8a83;">Pay cash to your driver</span>
        <span style="font-size:12px;color:#0fa968;font-weight:700;">Rs. 210</span>
      </div>`,
  },
  {
    ms: 4200,
    map: { car: [58, 40], route: true, pins: true },
    sheet: `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <span class="nx-chip ride">Driver on the way</span>
        <span style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#98a5ad;letter-spacing:0.05em;">#A7F3C1</span>
      </div>
      <div class="nx-row" style="margin-top:15px;padding-bottom:14px;border-bottom:1px solid #eef2f0;">
        <div class="nx-av">B</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="nx-t-title">Bilal A.</span>
            <span style="font-size:9.5px;font-weight:800;color:#0fa968;background:rgba(15,169,104,0.11);padding:2px 7px;border-radius:99px;">✓ VERIFIED</span>
          </div>
          <div class="nx-t-sub">★ 4.9 · Nova Moto · 3 min away</div>
        </div>
        <span class="nx-plate">KHI-4417</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:13px;">
        <div class="nx-fakebtn soft" style="flex:1;font-size:13px;">Message</div>
        <div class="nx-fakebtn soft" style="flex:1;font-size:13px;">Share ride</div>
      </div>`,
  },
];

const FOOD_SEQUENCE = [
  {
    ms: 3000,
    map: null,
    sheet: `
      <span class="nx-chip food">Order confirmed</span>
      <div class="nx-food-card" style="margin-top:13px;">
        <div class="nx-food-banner">
          <span style="font-size:27px;">🍛</span>
          <span style="position:absolute;top:9px;left:9px;font-size:9.5px;font-weight:800;background:rgba(255,255,255,0.94);color:#0b8a54;padding:3px 8px;border-radius:99px;">OPEN NOW</span>
        </div>
        <div class="nx-food-body">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div><div style="font-size:14px;font-weight:800;letter-spacing:-0.01em;">Karachi Karahi House</div>
            <div style="font-size:11px;color:#7b8a83;margin-top:2px;">Pakistani · BBQ</div></div>
            <span style="font-size:10.5px;font-weight:800;background:rgba(15,169,104,0.11);color:#0b8a54;padding:3px 8px;border-radius:99px;">★ 4.7</span>
          </div>
          <div style="font-size:11px;color:#7b8a83;margin-top:8px;">25–40 min · Delivery Rs. 50 · Cash on delivery</div>
        </div>
      </div>
      <div style="margin-top:11px;display:flex;justify-content:space-between;font-size:13px;">
        <span style="color:#5c6a63;">2× Chicken Karahi</span><span style="font-weight:800;">Rs. 1,480</span>
      </div>`,
  },
  {
    ms: 3400,
    map: null,
    sheet: `
      <span class="nx-chip food">Preparing your order</span>
      <p style="font-size:16px;font-weight:800;letter-spacing:-0.02em;margin-top:11px;">The kitchen is cooking</p>
      <div style="margin-top:15px;display:flex;flex-direction:column;gap:11px;">
        ${["Order placed", "Restaurant accepted", "Preparing", "On the way"].map((s, i) => `
          <div class="nx-row" style="gap:11px;">
            <span style="width:21px;height:21px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;
              ${i < 3 ? "background:#0fa968;color:#fff;" : "background:#eef2f0;color:#98a5ad;"}">${i < 3 ? "✓" : i + 1}</span>
            <span style="font-size:13px;${i < 3 ? "color:#0e1d16;font-weight:600;" : "color:#98a5ad;"}">${s}</span>
          </div>`).join("")}
      </div>`,
  },
  {
    ms: 3600,
    map: { car: [50, 44], route: true, pins: true, food: true },
    sheet: `
      <span class="nx-chip food">On the way to you</span>
      <div class="nx-row" style="margin-top:15px;padding-bottom:13px;border-bottom:1px solid #eef2f0;">
        <div class="nx-av" style="color:#a86c05;background:#fff4e0;">S</div>
        <div style="flex:1;">
          <div class="nx-t-title">Saad R.</div>
          <div class="nx-t-sub">★ 4.8 · Picked up · 8 min away</div>
        </div>
        <span class="nx-plate">KHI-8823</span>
      </div>
      <div style="margin-top:12px;display:flex;justify-content:space-between;font-size:13px;">
        <span style="color:#5c6a63;">Total (cash)</span><span style="font-weight:800;">Rs. 1,530</span>
      </div>`,
  },
];

export function initHeroPhone(root) {
  const map = root.querySelector("[data-map]");
  const sheet = root.querySelector("[data-sheet]");
  if (!map || !sheet) return;

  // Two stories, told back to back: a ride, then a food order. Nova X is
  // both, and a phone showing only one under-sells the product.
  const script = [...RIDE_SEQUENCE, ...FOOD_SEQUENCE];
  let i = 0;
  let timer = 0;

  function paintMap(m) {
    if (!m) { map.style.opacity = "0"; return; }
    map.style.opacity = "1";
    const accent = m.food ? "var(--nx-food)" : "var(--nx-ride)";
    map.innerHTML = `
      ${m.route ? `
        <div class="nx-route" style="left:18%;top:60%;width:36%;transform:rotate(-24deg);background:linear-gradient(90deg,${accent},${accent}40);"></div>
        <div class="nx-route" style="left:50%;top:44%;width:32%;transform:rotate(9deg);background:linear-gradient(90deg,${accent}bb,${accent}30);"></div>` : ""}
      ${m.pins ? `
        <div class="nx-pin" style="left:16%;top:62%;background:var(--nx-ride);"></div>
        <div class="nx-pin" style="left:78%;top:40%;background:var(--nx-food);"></div>` : ""}
      <div class="nx-car" style="left:${m.car[0]}%;top:${m.car[1]}%;background:${accent};transition:left 1.4s cubic-bezier(0.4,0,0.2,1),top 1.4s cubic-bezier(0.4,0,0.2,1);"></div>
    `;
  }

  function step() {
    const s = script[i % script.length];
    paintMap(s.map);
    sheet.innerHTML = `<div class="nx-sheet-grab"></div><div class="nx-sheet-step">${s.sheet}</div>`;
    i++;
    if (!reduce) timer = setTimeout(step, s.ms);
  }

  if (reduce) {
    // Show the matched-driver frame: the single most reassuring screen.
    const s = RIDE_SEQUENCE[3];
    paintMap(s.map);
    sheet.innerHTML = `<div class="nx-sheet-grab"></div><div>${s.sheet}</div>`;
  } else {
    step();
  }

  return () => clearTimeout(timer);
}

/* ==========================================================================
   2. HEADLINE ROTATOR
   ========================================================================== */

export function initRotator(el) {
  const words = Array.from(el.querySelectorAll("span"));
  if (!words.length) return;
  let i = 0;
  words[0].classList.add("on");
  if (reduce) return;
  setInterval(() => {
    words[i % words.length].classList.remove("on");
    i++;
    words[i % words.length].classList.add("on");
  }, 2300);
}

/* ==========================================================================
   3. COUNT-UP — numbers earn attention by arriving, not just sitting there.
   ========================================================================== */

export function initCounters(scope = document) {
  const els = scope.querySelectorAll("[data-count]");
  if (!("IntersectionObserver" in window)) {
    els.forEach((el) => (el.textContent = el.dataset.suffix ? el.dataset.count + el.dataset.suffix : el.dataset.count));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      io.unobserve(el);
      const target = parseFloat(el.dataset.count);
      const suffix = el.dataset.suffix || "";
      const prefix = el.dataset.prefix || "";
      if (reduce) { el.textContent = prefix + target.toLocaleString("en-PK") + suffix; return; }
      const dur = 1300;
      const t0 = performance.now();
      (function tick(now) {
        const p = Math.min((now - t0) / dur, 1);
        // easeOutExpo — fast start, soft landing, reads as confident
        const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
        el.textContent = prefix + Math.round(target * eased).toLocaleString("en-PK") + suffix;
        if (p < 1) requestAnimationFrame(tick);
      })(t0);
    });
  }, { threshold: 0.4 });
  els.forEach((el) => io.observe(el));
}

/* ==========================================================================
   4. SERVICE SWITCHER — tabs drive the phone, auto-advancing.
   ========================================================================== */

const SERVICE_SCREENS = {
  ride: RIDE_SEQUENCE[3],
  food: FOOD_SEQUENCE[2],
  parcel: {
    map: { car: [46, 48], route: true, pins: true },
    sheet: `
      <span class="nx-chip ride">Parcel in transit</span>
      <div class="nx-row" style="margin-top:15px;padding-bottom:13px;border-bottom:1px solid #eef2f0;">
        <div class="nx-av">📦</div>
        <div style="flex:1;">
          <div class="nx-t-title">To: Sara Khan</div>
          <div class="nx-t-sub">DHA Phase 6 · picked up 4 min ago</div>
        </div>
      </div>
      <div style="margin-top:12px;display:flex;justify-content:space-between;font-size:13px;">
        <span style="color:#5c6a63;">Cash to collect</span><span style="font-weight:800;">Rs. 1,500</span>
      </div>
      <div class="nx-fakebtn soft" style="margin-top:12px;font-size:13px;">Track live</div>`,
  },
  errand: {
    map: null,
    sheet: `
      <span class="nx-chip food">Shopping for you</span>
      <p style="font-size:16px;font-weight:800;letter-spacing:-0.02em;margin-top:11px;">Your rider is in-store</p>
      <div style="margin-top:13px;border:1px solid #e6ebe8;border-radius:13px;padding:12px 14px;">
        <div style="font-size:11px;color:#98a5ad;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">Your list</div>
        <div style="font-size:13px;color:#0e1d16;margin-top:7px;line-height:1.65;">
          2kg mangoes · 1 dozen eggs<br/>Fresh naan ×4
        </div>
      </div>
      <div style="margin-top:12px;display:flex;justify-content:space-between;font-size:13px;">
        <span style="color:#5c6a63;">Budget</span><span style="font-weight:800;">Rs. 2,000</span>
      </div>`,
  },
};

export function initSwitcher(root) {
  const tabs = Array.from(root.querySelectorAll("[data-service]"));
  const map = root.querySelector("[data-sw-map]");
  const sheet = root.querySelector("[data-sw-sheet]");
  if (!tabs.length || !sheet) return;

  let idx = 0;
  let timer = 0;

  function show(k) {
    const s = SERVICE_SCREENS[k];
    if (!s) return;
    if (map) {
      if (!s.map) { map.style.opacity = "0"; }
      else {
        map.style.opacity = "1";
        const accent = k === "food" || k === "errand" ? "var(--nx-food)" : "var(--nx-ride)";
        map.innerHTML = `
          <div class="nx-route" style="left:18%;top:60%;width:36%;transform:rotate(-24deg);background:linear-gradient(90deg,${accent},${accent}40);"></div>
          <div class="nx-pin" style="left:16%;top:62%;background:var(--nx-ride);"></div>
          <div class="nx-pin" style="left:78%;top:40%;background:var(--nx-food);"></div>
          <div class="nx-car" style="left:${s.map.car[0]}%;top:${s.map.car[1]}%;background:${accent};"></div>`;
      }
    }
    sheet.innerHTML = `<div class="nx-sheet-grab"></div><div class="nx-sheet-step">${s.sheet}</div>`;
    tabs.forEach((t) => t.classList.toggle("on", t.dataset.service === k));
  }

  function advance() {
    idx = (idx + 1) % tabs.length;
    show(tabs[idx].dataset.service);
    if (!reduce) timer = setTimeout(advance, 7000);
  }

  tabs.forEach((t, i) => {
    t.addEventListener("click", () => {
      clearTimeout(timer);
      idx = i;
      // Restart the fill animation so the timer bar matches reality.
      const bar = t.querySelector(".nx-tab-bar i");
      if (bar) { bar.style.animation = "none"; void bar.offsetWidth; bar.style.animation = ""; }
      show(t.dataset.service);
      if (!reduce) timer = setTimeout(advance, 7000);
    });
  });

  show(tabs[0].dataset.service);
  if (!reduce) timer = setTimeout(advance, 7000);
}

/* ==========================================================================
   5. ORDER JOURNEY — plays through once when scrolled into view.
   ========================================================================== */

export function initJourney(root) {
  const steps = Array.from(root.querySelectorAll(".nx-jstep"));
  if (!steps.length) return;
  const play = () => {
    steps.forEach((s, i) => {
      setTimeout(() => {
        steps.forEach((x) => x.classList.remove("active"));
        s.classList.add("done", "active");
        if (i === steps.length - 1) setTimeout(() => s.classList.remove("active"), 900);
      }, reduce ? 0 : i * 620);
    });
  };
  if (reduce || !("IntersectionObserver" in window)) { play(); return; }
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { play(); io.disconnect(); }
  }, { threshold: 0.4 });
  io.observe(root);
}

/* ==========================================================================
   6. EARNINGS CALCULATOR — the single most persuasive thing on a driver page.
   Numbers come from js/support.config.js so the site can never quote a
   commission the app doesn't actually charge.
   ========================================================================== */

export function initEarnings(root, { commissionPct = 15 } = {}) {
  const slider = root.querySelector("[data-trips]");
  const out = root.querySelector("[data-gross]");
  const tripsLabel = root.querySelector("[data-trips-label]");
  const cells = {
    fares: root.querySelector("[data-fares]"),
    commission: root.querySelector("[data-commission]"),
    keep: root.querySelector("[data-keep]"),
  };
  if (!slider || !out) return;

  const AVG_FARE = 280; // conservative mixed bike/car average for Karachi

  function render() {
    const perDay = Number(slider.value);
    const weeklyTrips = perDay * 6; // a realistic 6-day week
    const gross = weeklyTrips * AVG_FARE;
    const commission = gross * (commissionPct / 100);
    const keep = gross - commission;

    tripsLabel.textContent = `${perDay} trips a day`;
    out.textContent = money(keep);
    cells.fares.textContent = money(gross);
    cells.commission.textContent = "− " + money(commission);
    cells.keep.textContent = `${100 - commissionPct}%`;

    // Fill the track left of the thumb so the control reads as a gauge.
    const pct = ((perDay - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.background = `linear-gradient(90deg, var(--nx-ride) ${pct}%, var(--nx-border-2) ${pct}%)`;
  }

  slider.addEventListener("input", render);
  render();
}

/* ==========================================================================
   7. OPS CONSOLE — a live feed that keeps arriving.
   Deliberately illustrative, and labelled as a preview in the markup, so it
   never reads as a claim about real current volume.
   ========================================================================== */

const FEED_TEMPLATES = [
  { kind: "Ride", color: "var(--nx-ride)", who: ["Ayesha M.", "Hamza K.", "Zainab R.", "Usman T.", "Fatima S."], amt: [180, 640] },
  { kind: "Food", color: "var(--nx-food)", who: ["Karachi Karahi House", "Bundu Khan", "Student Biryani", "Kolachi"], amt: [700, 2400] },
  { kind: "Parcel", color: "var(--nx-parcel)", who: ["Clifton → Gulshan", "Saddar → DHA", "Tariq Rd → Nazimabad"], amt: [150, 420] },
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function initOpsFeed(root) {
  const feed = root.querySelector("[data-feed]");
  if (!feed) return;
  let timer = 0;

  function row(ageSec) {
    const t = pick(FEED_TEMPLATES);
    const amt = Math.round(t.amt[0] + Math.random() * (t.amt[1] - t.amt[0]));
    const el = document.createElement("div");
    el.className = "nx-feed-row";
    el.innerHTML = `
      <span class="tag" style="background:${t.color};"></span>
      <span class="who"><strong style="font-weight:700;">${t.kind}</strong> · ${pick(t.who)}</span>
      <span class="amt">${money(amt)}</span>
      <span class="ago">${ageSec}s</span>`;
    return el;
  }

  // Seed with a full list so the console never appears empty.
  for (let i = 0; i < 5; i++) feed.appendChild(row(8 + i * 11));

  if (reduce) return;

  function push() {
    feed.insertBefore(row(1), feed.firstChild);
    while (feed.children.length > 5) feed.removeChild(feed.lastChild);
    // Age the existing rows so the list feels like time passing.
    Array.from(feed.children).forEach((c, i) => {
      const ago = c.querySelector(".ago");
      if (ago && i > 0) ago.textContent = `${i * 12 + Math.floor(Math.random() * 6)}s`;
    });
    timer = setTimeout(push, 2600 + Math.random() * 2600);
  }
  timer = setTimeout(push, 2600);

  return () => clearTimeout(timer);
}
