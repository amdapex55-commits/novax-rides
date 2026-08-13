// Nova Go Rides — minimal inline SVG icon set (stroke-based, consistent
// weight). One shared function so every screen's icons stay visually
// consistent instead of relying on an external icon font.
const PATHS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 3',
  wallet: 'M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM16 12h3',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 5-6 8-6s6.5 2 8 6',
  'arrow-back': 'M19 12H5M12 19l-7-7 7-7',
  'arrow-forward': 'M5 12h14M12 5l7 7-7 7',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 13l4 4L19 7',
  'check-circle': 'M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  'map-pin': 'M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  car: 'M3 13l1.5-5A2 2 0 0 1 6.4 6.5h11.2A2 2 0 0 1 19.5 8L21 13v5a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM6 17.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM18 17.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  bike: 'M5 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM5 15l4-7h4l3 4M9 8H7M15 15l-2-4',
  rickshaw: 'M4 17V10a2 2 0 0 1 2-2h6l3 4h3a1 1 0 0 1 1 1v4M4 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM15 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0z',
  phone: 'M4 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 2 6a2 2 0 0 1 2-2z',
  package: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  camera: 'M4 8a2 2 0 0 1 2-2h1l1.5-2h7L17 6h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3',
  bell: 'M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9zM10 19a2 2 0 0 0 4 0',
  gift: 'M20 7h-3.5a2.5 2.5 0 1 0-4.5-2 2.5 2.5 0 1 0-4.5 2H4a1 1 0 0 0-1 1v3h18V8a1 1 0 0 0-1-1zM4 11v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8M12 7v13',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  shield: 'M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z',
  chat: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4M12 17h.01',
  dashboard: 'M3 3h8v8H3zM13 3h8v5h-8zM13 12h8v9h-8zM3 15h8v6H3z',
  document: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6',
  chevronRight: 'M9 18l6-6-6-6',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  sos: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a1.7 1.7 0 0 0 1.5 2.6h17.4a1.7 1.7 0 0 0 1.5-2.6L13.7 3.9a1.7 1.7 0 0 0-3.4 0z',
  bolt: 'M13 2 3 14h7l-1 8 10-12h-7z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  layers: 'M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5',
  locate: 'M12 2v3M12 19v3M2 12h3M19 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  utensils: 'M6 2v7a2 2 0 0 0 4 0V2M8 9v13M16 2c-2 0-3 2-3 5s1 4 3 4M16 2v18',
  store: 'M3 7l1-4h16l1 4M3 7v13a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M3 7h18M9 21v-6h6v6',
  plus: 'M12 5v14M5 12h14',
  cart: 'M6 2l1.5 4M18 2l-1.5 4M3.5 6h17l-1.5 12a2 2 0 0 1-2 1.8H7a2 2 0 0 1-2-1.8L3.5 6zM9 10v4M15 10v4',
  swap: 'M7 4v3H3l4 4 4-4H7V4zM17 20v-3h4l-4-4-4 4h4v3z',
  taxi: 'M5 17V9l2-4h10l2 4v8M5 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM15 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM5 13h14M9 5v0M15 5v0',
  basket: 'M4 9h16l-1.5 10.5a2 2 0 0 1-2 1.5H7.5a2 2 0 0 1-2-1.5L4 9zM8 9l2-6M16 9l-2-6M9 13v4M15 13v4',

  // Added for the bike pilot + storefront wizard. Without these the icon()
  // helper silently falls back to the "help" question mark, which is how you
  // end up shipping a screen full of question marks.
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3.5 2',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8v0',
  image: 'M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6',
  add: 'M12 5v14M5 12h14',
  location: 'M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11zM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  restaurant: 'M6 2v7a2 2 0 0 0 4 0V2M8 9v13M16 2c-2 0-3 2-3 5s1 4 3 4M16 2v18',
};

/* Icons that encode a direction rather than a thing. In an RTL layout these
   have to mirror: a chevron still pointing right after the rest of the screen
   has flipped is pointing back the way the reader came, which reads as "go
   back" on a row that goes forward. The flip itself is one CSS rule in
   fonts.css keyed off this attribute — emitting the name is all this needs
   to do, and it costs nothing in LTR. */
const DIRECTIONAL = new Set([
  "arrow-back", "arrow-forward", "chevronRight", "chevronLeft", "logout", "send",
]);

export function icon(name, size = 20, strokeWidth = 2) {
  const d = PATHS[name] || PATHS.help;
  const dir = DIRECTIONAL.has(name) ? ` data-icon="${name}"` : "";
  return `<svg${dir} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">
    ${d.split("M").filter(Boolean).map((seg) => `<path d="M${seg.trim()}"/>`).join("")}
  </svg>`;
}
