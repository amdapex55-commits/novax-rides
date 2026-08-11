// Copy to js/map-token.js and paste your Mapbox public token.
//
//   cp js/map-token.example.js js/map-token.js
//
// js/map-token.js is gitignored. GitHub's push protection rejects Mapbox
// tokens in a repo, and it's right to — a token committed once lives in git
// history forever, including after you rotate it.
//
// This is a PUBLIC token (pk.*). It ships in the deployed files and anyone can
// read it there; that's how Mapbox intends browser tokens to work. The control
// that matters is URL RESTRICTIONS — set them in Mapbox > Tokens > your token,
// to your Pages domain and novago.pk. Without them, anyone who views source
// can spend your free tier.
window.NOVAGO_MAP_TOKEN = "pk.your_token_here";
