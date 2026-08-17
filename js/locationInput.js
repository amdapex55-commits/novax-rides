// Shared address typeahead.
//
// The ride booking screen grew a good one — instant local matches, network
// results merged in behind them, two-line rows so the landmark is never the
// half that gets ellipsised. The parcel flow had none of it: two plain text
// boxes that only told you whether an address existed after you pressed
// Confirm, by which point you had also typed a receiver's name and number.
//
// This is that behaviour in one place so the two screens cannot drift.

import { createSuggester } from "./geocode.js";
import { icon } from "./icons.js";
import { esc } from "./ui.js";
import { haptic } from "./haptics.js";

/**
 * Splits one long geocoder string into the bit people recognise and the bit
 * that tells them WHICH one it is. "Dolmen Mall, Abdul Sattar Edhi Road,
 * Clifton, Karachi, Sindh, Pakistan" is a landmark plus an address; on one
 * truncated line you always lose the address.
 */
export function splitPlace(displayName) {
  const parts = String(displayName || "").split(",").map((x) => x.trim()).filter(Boolean);
  const primary = parts[0] || String(displayName || "");
  const secondary = parts
    .slice(1)
    .filter((x) => !/^(pakistan|sindh|\d{5,})$/i.test(x))
    .slice(0, 3)
    .join(", ");
  return { primary, secondary };
}

/**
 * @param {HTMLInputElement} input
 * @param {HTMLElement} listEl
 * @param {{ near?: {lat:number,lng:number}, onPick?: (place) => void,
 *           onOpenChange?: (open: boolean) => void }} opts
 * @returns {{ destroy(): void }}
 */
export function attachPlaceSuggest(input, listEl, opts = {}) {
  const { near, onPick, onOpenChange } = opts;

  const setOpen = (open) => {
    listEl.hidden = !open;
    onOpenChange?.(open);
  };

  const suggester = createSuggester(
    (results, { pending }) => {
      if (!results.length && !pending) { setOpen(false); return; }
      listEl.innerHTML =
        results
          .map((r) => {
            const { primary, secondary } = splitPlace(r.displayName);
            return `
            <button type="button" class="nx-suggest-row" data-lat="${r.lat}" data-lng="${r.lng}"
                    data-label="${esc(r.displayName)}">
              <span class="nx-suggest-ic">${icon(r.local ? "star" : "location", 15)}</span>
              <span class="nx-suggest-text">
                <span class="nx-suggest-primary">${esc(primary)}</span>
                ${secondary ? `<span class="nx-suggest-secondary">${esc(secondary)}</span>` : ""}
              </span>
            </button>`;
          })
          .join("") + (pending ? `<div class="nx-suggest-row muted"><span>Searching…</span></div>` : "");
      setOpen(true);

      listEl.querySelectorAll("[data-lat]").forEach((row) => {
        // mousedown fires before blur — without this the list hides before the
        // click lands and the tap does nothing at all.
        row.addEventListener("mousedown", (e) => e.preventDefault());
        row.addEventListener("click", () => {
          const label = row.dataset.label || row.textContent.trim();
          input.value = label;
          setOpen(false);
          haptic?.light?.();
          onPick?.({ lat: Number(row.dataset.lat), lng: Number(row.dataset.lng), label });
        });
      });
    },
    { near },
  );

  const onInput = () => suggester.query(input.value);
  const onBlur = () => setTimeout(() => setOpen(false), 120);
  input.addEventListener("input", onInput);
  input.addEventListener("blur", onBlur);

  return {
    destroy() {
      input.removeEventListener("input", onInput);
      input.removeEventListener("blur", onBlur);
      suggester.destroy?.();
    },
  };
}
