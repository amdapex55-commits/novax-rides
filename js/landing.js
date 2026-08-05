// Nova X — landing page hero: the city as a live movement network.
//
// What's being shown, and why: an abstract Karachi-like grid seen from a low
// aerial angle. Blocks rise from the plate, arterial routes glow between
// them, and lit particles travel those routes in three colours — green for
// rides and parcels, amber for food, blue for the ops signal watching it all.
// Hub nodes pulse where routes converge. It's the product's actual shape:
// four kinds of participant moving through one network.
//
// Constraints this file respects:
//   - Three.js only, from CDN, no models, no textures, no post-processing.
//     Everything is generated maths, so the whole scene costs ~40KB of code
//     on top of the library and nothing to download per-asset.
//   - Capped device pixel ratio and a modest particle count, because this
//     runs on the mid-range Android phones our customers actually own.
//   - If WebGL is missing or fails, the page falls back to a CSS-only hero
//     that still looks deliberate (see `.no-webgl` in landing.css).
//   - prefers-reduced-motion renders exactly one frame and stops.

const THREE_URL = "https://unpkg.com/three@0.160.0/build/three.module.js";

const COLORS = {
  ride: 0x17e08a,
  food: 0xffb02e,
  ops: 0x4d9dff,
  block: 0x0e1620,
  blockEdge: 0x1b2b3a,
  grid: 0x14202c,
};

const prefersReducedMotion =
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export async function initHero(canvas, heroEl) {
  // Cheap capability probe before we pay for the library download.
  if (!hasWebGL()) { heroEl.classList.add("no-webgl"); return; }

  let THREE;
  try {
    THREE = await import(/* @vite-ignore */ THREE_URL);
  } catch {
    heroEl.classList.add("no-webgl");
    return;
  }

  try {
    run(THREE, canvas, heroEl);
  } catch (err) {
    console.warn("[NovaX] hero scene failed:", err);
    heroEl.classList.add("no-webgl");
  }
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch { return false; }
}

function run(THREE, canvas, heroEl) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05070a, 0.028);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 300);
  camera.position.set(0, 26, 42);
  camera.lookAt(0, 0, -6);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  // Cap DPR at 2 — beyond that the pixel cost doubles for no visible gain,
  // and mid-range phones are exactly where this scene must not stutter.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const world = new THREE.Group();
  scene.add(world);

  // ---------------------------------------------------------------- grid --
  // A faint ground plate so the routes read as sitting ON something.
  const grid = new THREE.GridHelper(160, 40, COLORS.grid, COLORS.grid);
  grid.material.transparent = true;
  grid.material.opacity = 0.22;
  world.add(grid);

  // -------------------------------------------------------------- blocks --
  // City blocks: instanced boxes on a jittered grid, with gaps left where the
  // arterial routes run so buildings never sit on top of a road.
  const BLOCK_SPAN = 8;
  const positions = [];
  for (let x = -64; x <= 64; x += BLOCK_SPAN) {
    for (let z = -64; z <= 40; z += BLOCK_SPAN) {
      // Leave the two arterials clear.
      if (Math.abs(x) < 5 || Math.abs(z + 12) < 5) continue;
      // Thin out the far field — density near the camera, air in the distance.
      const distance = Math.hypot(x, z + 12);
      if (Math.random() > 1 - distance / 130) continue;
      positions.push({ x: x + (Math.random() - 0.5) * 2, z: z + (Math.random() - 0.5) * 2, d: distance });
    }
  }

  const blockGeo = new THREE.BoxGeometry(1, 1, 1);
  const blockMat = new THREE.MeshBasicMaterial({ color: COLORS.block, transparent: true, opacity: 0.9 });
  const blocks = new THREE.InstancedMesh(blockGeo, blockMat, positions.length);
  const edgeMat = new THREE.LineBasicMaterial({ color: COLORS.blockEdge, transparent: true, opacity: 0.5 });
  const edgeGeo = new THREE.EdgesGeometry(blockGeo);
  const edges = new THREE.InstancedMesh(edgeGeo, edgeMat, positions.length);
  edges.frustumCulled = false;

  const dummy = new THREE.Object3D();
  const blockHeights = [];
  positions.forEach((p, i) => {
    // Taller towers toward the centre: a skyline, not a uniform field.
    const h = 1.2 + Math.pow(Math.max(0, 1 - p.d / 80), 2) * 11 * (0.35 + Math.random());
    blockHeights.push(h);
    const w = 3.2 + Math.random() * 1.8;
    dummy.position.set(p.x, h / 2, p.z);
    dummy.scale.set(w, h, w);
    dummy.updateMatrix();
    blocks.setMatrixAt(i, dummy.matrix);
    edges.setMatrixAt(i, dummy.matrix);
  });
  blocks.instanceMatrix.needsUpdate = true;
  world.add(blocks);

  // EdgesGeometry can't be instanced as a mesh — use LineSegments per-instance
  // only if the count is small. It isn't, so instead we draw a single subtle
  // wireframe overlay via a second instanced mesh with a wireframe material.
  const wireMat = new THREE.MeshBasicMaterial({
    color: COLORS.blockEdge, wireframe: true, transparent: true, opacity: 0.28,
  });
  const wire = new THREE.InstancedMesh(blockGeo, wireMat, positions.length);
  positions.forEach((p, i) => {
    const h = blockHeights[i];
    const w = 3.2;
    dummy.position.set(p.x, h / 2, p.z);
    dummy.scale.set(w, h, w);
    dummy.updateMatrix();
    wire.setMatrixAt(i, dummy.matrix);
  });
  wire.instanceMatrix.needsUpdate = true;
  world.add(wire);

  // -------------------------------------------------------------- routes --
  // Curved arterials. Each carries traffic of one type, so the colour tells
  // you what's moving: green rides/parcels, amber food, blue the ops signal.
  const routeDefs = [
    { pts: [[-70, -10], [-30, -6], [0, -12], [34, -20], [70, -14]], color: COLORS.ride, speed: 0.055, count: 22 },
    { pts: [[-60, 26], [-22, 14], [4, 2], [30, -8], [66, -26]], color: COLORS.food, speed: 0.042, count: 16 },
    { pts: [[-4, 40], [-2, 12], [2, -14], [6, -44]], color: COLORS.ride, speed: 0.068, count: 18 },
    { pts: [[-66, -34], [-24, -26], [10, -18], [46, -4], [72, 12]], color: COLORS.ops, speed: 0.036, count: 12 },
    { pts: [[62, 30], [26, 18], [-6, 6], [-38, -2], [-70, 4]], color: COLORS.food, speed: 0.048, count: 14 },
  ];

  const routes = routeDefs.map((def) => {
    const curve = new THREE.CatmullRomCurve3(
      def.pts.map(([x, z]) => new THREE.Vector3(x, 0.35, z)),
    );
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(140));
    const mat = new THREE.LineBasicMaterial({ color: def.color, transparent: true, opacity: 0.30 });
    world.add(new THREE.Line(geo, mat));
    return { curve, ...def, mat };
  });

  // ------------------------------------------------------------ traffic --
  // One Points cloud per route. Each particle is a job in flight; `offset`
  // is its progress along the curve, so animating is a single float add.
  const traffic = routes.map((route) => {
    const n = route.count;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const offsets = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      offsets[i] = Math.random();
      const p = route.curve.getPointAt(offsets[i]);
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: route.color,
      size: 1.5,
      transparent: true,
      opacity: 0.95,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    world.add(points);
    return { route, geo, offsets, speed: route.speed };
  });

  // --------------------------------------------------------------- hubs --
  // Where routes converge: customers, drivers, kitchens, ops. They breathe.
  const hubDefs = [
    { x: 0, z: -12, color: COLORS.ride, size: 3.0 },
    { x: -30, z: -6, color: COLORS.ride, size: 2.1 },
    { x: 30, z: -8, color: COLORS.food, size: 2.4 },
    { x: 4, z: 2, color: COLORS.food, size: 1.9 },
    { x: -24, z: -26, color: COLORS.ops, size: 2.0 },
    { x: 46, z: -4, color: COLORS.ops, size: 1.7 },
  ];
  const ringGeo = new THREE.RingGeometry(0.82, 1, 48);
  const hubs = hubDefs.map((h) => {
    const g = new THREE.Group();
    // Core dot
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 12, 12),
      new THREE.MeshBasicMaterial({ color: h.color, transparent: true, opacity: 0.95 }),
    );
    g.add(core);
    // Two expanding rings, offset in phase so the pulse never looks mechanical
    const rings = [0, 0.5].map((phase) => {
      const m = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: h.color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
      );
      m.rotation.x = -Math.PI / 2;
      m.userData.phase = phase;
      g.add(m);
      return m;
    });
    g.position.set(h.x, 0.4, h.z);
    world.add(g);
    return { group: g, rings, size: h.size };
  });

  // -------------------------------------------------------------- resize --
  function resize() {
    const w = heroEl.clientWidth;
    const h = heroEl.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // On narrow screens pull the camera back and raise it, so the skyline
    // still reads instead of filling the frame with three towers.
    const narrow = w < 720;
    camera.position.set(0, narrow ? 34 : 26, narrow ? 54 : 42);
    camera.lookAt(0, 0, -6);
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize, { passive: true });

  // ------------------------------------------------------- pointer drift --
  // Very restrained parallax — the scene should feel alive, not seasick.
  let targetX = 0, targetY = 0, driftX = 0, driftY = 0;
  if (!prefersReducedMotion) {
    window.addEventListener("pointermove", (e) => {
      targetX = (e.clientX / window.innerWidth - 0.5) * 2;
      targetY = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
  }

  // Pause when the hero scrolls out of view — no reason to burn battery
  // animating a scene nobody is looking at.
  let visible = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      ([entry]) => { visible = entry.isIntersecting; },
      { threshold: 0.01 },
    ).observe(heroEl);
  }
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; });

  // ---------------------------------------------------------------- loop --
  const clock = new THREE.Clock();
  let raf = 0;

  function frame() {
    raf = requestAnimationFrame(frame);
    if (!visible) return;

    const dt = Math.min(clock.getDelta(), 0.05); // clamp after a tab switch
    const t = clock.elapsedTime;

    // Traffic along routes
    for (const lane of traffic) {
      const pos = lane.geo.attributes.position.array;
      for (let i = 0; i < lane.offsets.length; i++) {
        lane.offsets[i] = (lane.offsets[i] + lane.speed * dt) % 1;
        const p = lane.route.curve.getPointAt(lane.offsets[i]);
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      }
      lane.geo.attributes.position.needsUpdate = true;
    }

    // Hub pulses
    for (const hub of hubs) {
      hub.rings.forEach((ring) => {
        const phase = (t * 0.5 + ring.userData.phase) % 1;
        const s = hub.size * (0.5 + phase * 1.5);
        ring.scale.set(s, s, s);
        ring.material.opacity = 0.42 * (1 - phase);
      });
    }

    // Route breathing — arterials brighten and dim slightly out of sync
    routes.forEach((r, i) => {
      r.mat.opacity = 0.22 + Math.sin(t * 0.7 + i * 1.3) * 0.10;
    });

    // Camera: slow orbit plus damped pointer parallax
    driftX += (targetX - driftX) * 0.035;
    driftY += (targetY - driftY) * 0.035;
    world.rotation.y = Math.sin(t * 0.045) * 0.10 + driftX * 0.045;
    world.rotation.x = driftY * 0.018;
    camera.position.y += (Math.sin(t * 0.3) * 0.6 - (camera.position.y - (heroEl.clientWidth < 720 ? 34 : 26))) * 0.02;
    camera.lookAt(0, 0, -6);

    renderer.render(scene, camera);
  }

  if (prefersReducedMotion) {
    // One static, correctly-composed frame. Still a real 3D city, just still.
    renderer.render(scene, camera);
  } else {
    frame();
  }

  // Give the page a way to tear this down if it ever needs to.
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    renderer.dispose();
  };
}
