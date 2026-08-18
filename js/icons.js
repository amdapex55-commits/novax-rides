// Nova Go Rides — inline SVG icon set. One shared function so every screen's
// icons stay visually consistent instead of relying on an external icon font.
//
// DRAWING RULES, because an icon set drifts the moment they are unwritten:
//
//  * 24×24 grid, stroke-based, no fills. Optical bounds sit inside 3–21 so
//    nothing touches the edge of its container.
//  * Even optical weight. A glyph's job is to read at 16px on a cheap phone,
//    and density is what decides that — not detail. Two glyphs sitting next
//    to each other on the home grid must carry roughly the same amount of
//    ink, which is why `basket` lost its two internal ticks and `settings`
//    lost the twelve-node gear it used to be.
//  * Geometry over illustration. Circles are arcs, not hand-plotted curves,
//    so they stay round at every size.
//  * Round caps and joins, set once in icon() below.
//
// The renderer splits on "M", so every subpath must start with an absolute
// moveto and no path may use a relative "m".
const PATHS = {
  /* ---- navigation & chrome ---------------------------------------------- */
  home: 'M3 10.4 12 3l9 7.4M5.6 9.3V19.5A1.5 1.5 0 0 0 7.1 21h9.8a1.5 1.5 0 0 0 1.5-1.5V9.3M9.6 21v-5.6h4.8V21',
  history: 'M3.4 12a8.6 8.6 0 1 0 2.6-6.1M3.4 4.6v4.2h4.2M12 7.4v4.9l3.3 2',
  dashboard: 'M3.5 3.5h7v6.4h-7zM13.5 3.5h7v4.2h-7zM13.5 11.6h7v8.9h-7zM3.5 13.8h7v6.7h-7z',
  settings: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4M13 3.2h-2l-.4 2.4a6.9 6.9 0 0 0-1.8 1L6.5 5.5 5 8l1.9 1.5a6.9 6.9 0 0 0 0 2.1L5 13.1 6.5 15.6l2.3-1.1a6.9 6.9 0 0 0 1.8 1l.4 2.4h2l.4-2.4a6.9 6.9 0 0 0 1.8-1l2.3 1.1L19 13.1l-1.9-1.5a6.9 6.9 0 0 0 0-2.1L19 8l-1.5-2.5-2.3 1.1a6.9 6.9 0 0 0-1.8-1z',
  logout: 'M9.5 21H5.6A1.6 1.6 0 0 1 4 19.4V4.6A1.6 1.6 0 0 1 5.6 3h3.9M15.8 16.6 20.4 12l-4.6-4.6M20.4 12H9.5',
  layers: 'M12 3.2 20.8 7.6 12 12 3.2 7.6zM3.2 12 12 16.4 20.8 12M3.2 16.4 12 20.8l8.8-4.4',

  /* ---- arrows & disclosure ---------------------------------------------- */
  'arrow-back': 'M19.4 12H4.6M11.4 19.2 4.6 12l6.8-7.2',
  'arrow-forward': 'M4.6 12h14.8M12.6 4.8 19.4 12l-6.8 7.2',
  chevronRight: 'M9.4 4.8 16.6 12l-7.2 7.2',
  chevronLeft: 'M14.6 4.8 7.4 12l7.2 7.2',
  close: 'M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8',
  plus: 'M12 4.8v14.4M4.8 12h14.4',
  swap: 'M7.4 20.4V5.2M7.4 5.2 3.8 8.8M7.4 5.2 11 8.8M16.6 3.6v15.2M16.6 18.8 13 15.2M16.6 18.8l3.6-3.6',
  refresh: 'M20.6 12a8.6 8.6 0 1 1-2.5-6.1M20.6 3.9v5.2h-5.2',
  send: 'M20.8 3.2 3.6 9.6a.5.5 0 0 0 0 .9l7.1 2.7 2.7 7.1a.5.5 0 0 0 .9 0zM20.8 3.2 10.7 13.3',

  /* ---- confirmation & status -------------------------------------------- */
  check: 'M4.8 12.6 9.4 17.2 19.2 6.8',
  'check-circle': 'M20.8 12a8.8 8.8 0 1 1-17.6 0 8.8 8.8 0 0 1 17.6 0zM8.4 12.2l2.6 2.6 4.8-5',
  star: 'M12 3.1l2.8 5.7 6.3.9-4.6 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.7l6.3-.9z',
  shield: 'M12 3.2 19 6.1v5.6c0 4.5-2.9 7.7-7 9.1-4.1-1.4-7-4.6-7-9.1V6.1z',
  sos: 'M12 9.4v4M12 16.8h.01M10.4 4.4 2.6 17.6a1.6 1.6 0 0 0 1.4 2.4h16a1.6 1.6 0 0 0 1.4-2.4L13.6 4.4a1.6 1.6 0 0 0-3.2 0z',
  info: 'M20.8 12a8.8 8.8 0 1 1-17.6 0 8.8 8.8 0 0 1 17.6 0zM12 11.2v5M12 7.9h.01',
  help: 'M20.8 12a8.8 8.8 0 1 1-17.6 0 8.8 8.8 0 0 1 17.6 0zM9.4 9.4a2.7 2.7 0 0 1 5.2.9c0 1.8-2.6 2-2.6 3.6M12 17.2h.01',
  eye: 'M2.2 12S6.1 4.8 12 4.8 21.8 12 21.8 12 17.9 19.2 12 19.2 2.2 12 2.2 12zM12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6z',
  bolt: 'M13.4 3 4.6 13.6h5.8L10.6 21l8.8-10.6h-5.8z',

  /* ---- vehicles ---------------------------------------------------------
     THE BIKE WAS A BICYCLE. Nova Go dispatches motorcycles — the drop
     handlebars, thin frame and pedal crank of the old glyph described a
     different vehicle to every customer choosing a ride and every rider
     picking a job. This one has a fuel tank, a seat and flat bars. */
  bike: 'M5 20.2a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2zM19 20.2a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2zM5 17.1h3.5l3.1-4.6h4.3l2.9 4.6M8.6 12.5 7.4 9.7H4.8M15.7 12.5 17.3 9.2h2.9',
  car: 'M4.2 14.4 5.8 9.3A2 2 0 0 1 7.7 7.9h8.6a2 2 0 0 1 1.9 1.4l1.6 5.1M4.2 14.4h15.6v3.4a1.2 1.2 0 0 1-1.2 1.2h-1a1.2 1.2 0 0 1-1.2-1.2v-.9H7.6v.9a1.2 1.2 0 0 1-1.2 1.2h-1a1.2 1.2 0 0 1-1.2-1.2zM7.4 16.6h.01M16.6 16.6h.01',
  taxi: 'M4.2 14.4 5.8 9.3A2 2 0 0 1 7.7 7.9h8.6a2 2 0 0 1 1.9 1.4l1.6 5.1M4.2 14.4h15.6v3.4a1.2 1.2 0 0 1-1.2 1.2h-1a1.2 1.2 0 0 1-1.2-1.2v-.9H7.6v.9a1.2 1.2 0 0 1-1.2 1.2h-1a1.2 1.2 0 0 1-1.2-1.2zM7.4 16.6h.01M16.6 16.6h.01M9.8 7.9V5.2h4.4v2.7',
  rickshaw: 'M5 15V10.4A5.4 5.4 0 0 1 10.4 5h1.2A5.4 5.4 0 0 1 17 10.4V15M4.4 15h13.2M10.8 5.2V15M7.2 20.2a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM15 20.2a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  navigation: 'M20.8 3.2 3.9 10.4a.5.5 0 0 0 .1.9l6.6 1.9 1.9 6.6a.5.5 0 0 0 .9.1z',
  locate: 'M12 4.2V6.4M12 17.6v2.2M4.2 12h2.2M17.6 12h2.2M12 15.8a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6z',
  'map-pin': 'M12 21.4S18.7 15 18.7 10a6.7 6.7 0 1 0-13.4 0c0 5 6.7 11.4 6.7 11.4zM12 12.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z',

  /* ---- services ---------------------------------------------------------
     package and basket carry the same ink as bike so the home grid reads as
     one family. The basket's two internal ticks were the difference. */
  package: 'M12 3.1 20.6 7.6v8.8L12 20.9 3.4 16.4V7.6zM3.4 7.6 12 12.1l8.6-4.5M12 12.1v8.8',
  basket: 'M4.4 9.2h15.2l-1.4 9.3a2 2 0 0 1-2 1.7H7.8a2 2 0 0 1-2-1.7zM8.9 9.2 11.1 3.6M15.1 9.2 12.9 3.6',
  cart: 'M3.2 4.2h2.3l2.4 10.6a1.7 1.7 0 0 0 1.7 1.3h7.7a1.7 1.7 0 0 0 1.7-1.3L20.4 8.2H6.1M9.6 19.6h.01M17.2 19.6h.01',
  utensils: 'M6.6 3.2v6.4a2.2 2.2 0 0 0 4.4 0V3.2M8.8 9.6V20.8M17.4 3.2c-1.8 0-3 1.9-3 4.6s1.2 3.9 3 3.9M17.4 3.2v17.6',
  store: 'M4 8.6h16M4 8.6 5.3 3.8h13.4L20 8.6M5.2 8.6v10.6A1.4 1.4 0 0 0 6.6 20.6h10.8a1.4 1.4 0 0 0 1.4-1.4V8.6M9.8 20.6v-5.4h4.4v5.4',
  gift: 'M4.2 11.4h15.6v7.8a1.4 1.4 0 0 1-1.4 1.4H5.6a1.4 1.4 0 0 1-1.4-1.4zM3.2 7.6h17.6v3.8H3.2zM12 7.6v13M12 7.6H8.6a2.2 2.2 0 1 1 2.2-2.2v2.2M12 7.6h3.4a2.2 2.2 0 1 0-2.2-2.2v2.2',

  /* ---- money & documents ------------------------------------------------ */
  wallet: 'M19.8 9.4V7.6A1.6 1.6 0 0 0 18.2 6H5.6A1.6 1.6 0 0 0 4 7.6v8.8A1.6 1.6 0 0 0 5.6 18h12.6a1.6 1.6 0 0 0 1.6-1.6v-1.8M19.8 9.4h-3.6a2.6 2.6 0 0 0 0 5.2h3.6z',
  document: 'M13.6 3.2H7a1.9 1.9 0 0 0-1.9 1.9v13.8A1.9 1.9 0 0 0 7 20.8h10a1.9 1.9 0 0 0 1.9-1.9V8.5zM13.6 3.2v5.3h5.3M8.8 13.4h6.4M8.8 16.8h4.2',
  image: 'M3.6 4.6h16.8v14.8H3.6zM3.6 15.2 8.2 10.6l3.7 3.7 2.8-2.8 4.7 4.7M8.6 9.4h.01',
  camera: 'M4.2 8.6a1.9 1.9 0 0 1 1.9-1.9h1.2L8.8 4.4h6.4l1.5 2.3h1.2a1.9 1.9 0 0 1 1.9 1.9v8.8a1.9 1.9 0 0 1-1.9 1.9H6.1a1.9 1.9 0 0 1-1.9-1.9zM12 16.6a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2z',
  upload: 'M12 15.8V4.4M7.6 8.8 12 4.4l4.4 4.4M4.4 15.8v3.2a1.6 1.6 0 0 0 1.6 1.6h12a1.6 1.6 0 0 0 1.6-1.6v-3.2',

  /* ---- people & contact -------------------------------------------------- */
  person: 'M12 12.4a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4zM4.6 20.6a7.4 7.4 0 0 1 14.8 0',
  users: 'M9.2 11.4a3.9 3.9 0 1 0 0-7.8 3.9 3.9 0 0 0 0 7.8zM2.6 20.6a6.6 6.6 0 0 1 13.2 0M16.4 4a3.9 3.9 0 0 1 0 7.5M18 14.6a6.6 6.6 0 0 1 3.4 6',
  phone: 'M4.4 4.2h3.8l1.9 4.7-2.4 1.4a10.6 10.6 0 0 0 4.8 4.8l1.4-2.4 4.7 1.9v3.8a1.9 1.9 0 0 1-1.9 1.9A14.6 14.6 0 0 1 2.5 6.1a1.9 1.9 0 0 1 1.9-1.9z',
  chat: 'M20.6 11.6a8.1 8.1 0 0 1-8.6 8.1 8.6 8.6 0 0 1-3.6-.8l-5 1.7 1.7-5a8.6 8.6 0 0 1-.8-3.6 8.1 8.1 0 0 1 8.1-8.6h.5a8.1 8.1 0 0 1 7.7 7.7z',
  bell: 'M17.8 9.2a5.8 5.8 0 1 0-11.6 0c0 3.5-1.3 5.1-1.3 5.1h14.2s-1.3-1.6-1.3-5.1zM10.2 18.4a2 2 0 0 0 3.6 0',
  search: 'M11 4.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6zM19.8 19.8 15.8 15.8',
  clock: 'M20.8 12a8.8 8.8 0 1 1-17.6 0 8.8 8.8 0 0 1 17.6 0zM12 7.2v5l3.3 2',

  /* ---- theme ------------------------------------------------------------- */
  sun: 'M12 16.8a4.8 4.8 0 1 0 0-9.6 4.8 4.8 0 0 0 0 9.6zM12 2.4v2M12 19.6v2M4.6 4.6 6 6M18 18l1.4 1.4M2.4 12h2M19.6 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
  moon: 'M20.8 13.1A9 9 0 1 1 10.9 3.2a7 7 0 0 0 9.9 9.9z',
};

/* Aliases. These were duplicate path strings, which meant a change to one
   quietly desynced it from its twin — `restaurant` and `utensils` had already
   drifted apart once. Pointing them at a single source makes that
   impossible. */
PATHS.location = PATHS['map-pin'];
PATHS.restaurant = PATHS.utensils;
PATHS.add = PATHS.plus;

/* Icons that encode a direction rather than a thing. In an RTL layout these
   have to mirror: a chevron still pointing right after the rest of the screen
   has flipped is pointing back the way the reader came, which reads as "go
   back" on a row that goes forward. The flip itself is one CSS rule in
   fonts.css keyed off this attribute — emitting the name is all this needs
   to do, and it costs nothing in LTR. */
const DIRECTIONAL = new Set([
  "arrow-back", "arrow-forward", "chevronRight", "chevronLeft", "logout", "send",
]);

/* 1.75 rather than 2. These render between 13px and 23px, and a 2px stroke at
   that size fills the counters — the gap inside the `a` of a gear tooth, the
   hole in a wallet's card slot — which is what made the set look heavy next
   to the type. */
export function icon(name, size = 20, strokeWidth = 1.75) {
  const d = PATHS[name] || PATHS.help;
  const dir = DIRECTIONAL.has(name) ? ` data-icon="${name}"` : "";
  return `<svg${dir} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">
    ${d.split("M").filter(Boolean).map((seg) => `<path d="M${seg.trim()}"/>`).join("")}
  </svg>`;
}
