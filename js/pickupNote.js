// Nova Go — the pickup note.
//
// WHAT THIS IS, AND WHAT IT DELIBERATELY ISN'T
//
// The idea it came from was "voice booking": hold a mic, speak your
// destination, get a ride. That needs Urdu speech-to-text, place-name
// resolution against Karachi's informal addressing, and a confirmation step —
// and if any link in that chain is wrong, a rider is dispatched to a place the
// customer never said. There is no version of that which is safe to ship in a
// 40-rider pilot.
//
// But the REAL problem underneath it is worth solving, and it's cheap:
// Karachi addresses are spoken, not written. "Gate ke saamne", "masjid ke
// peeche wali gali", "neeli building". A GPS pin gets a rider to the street.
// It doesn't get them to you.
//
// So this is a NOTE TO YOUR RIDER, attached to a booking that was made
// normally. Type it, or record ten seconds of your own voice saying it. The
// rider sees the text and can play the audio. Nothing is transcribed, nothing
// is interpreted, nothing is dispatched on it — so there is no chain to break.
//
// Text is the default because it always works. Voice is the option for people
// who'd rather talk, which in this market is a lot of people.

import { icon } from "./icons.js";
import { toast } from "./ui.js";
import { api } from "./api.js";

const MAX_SECONDS = 15;
// Records that don't fit a bike rider's data plan don't get listened to.
const MAX_BYTES = 400 * 1024;

/**
 * Mount the pickup-note control.
 *
 * @param {HTMLElement} container
 * @param {(note: {text: string, audioUrl: string|null}) => void} onChange
 * @returns {{ getNote(): object, destroy(): void }}
 */
export function mountPickupNote(container, onChange = () => {}) {
  let text = "";
  let audioUrl = null;
  let recorder = null;
  let chunks = [];
  let stream = null;
  let timer = 0;
  let seconds = 0;

  // MediaRecorder is unavailable on older Android WebViews and on iOS Safari
  // before 14.3. Rather than showing a button that fails on press, we check
  // first and simply don't offer voice — the text field alone is a complete
  // feature, not a degraded one.
  const canRecord =
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    window.isSecureContext;

  container.innerHTML = `
    <div class="nx-note">
      <label class="field-label" for="noteText">Help your rider find you</label>
      <input id="noteText" class="input" maxlength="120" autocomplete="off"
             placeholder="e.g. Neeli building, gate ke saamne"/>
      <div class="nx-note-row">
        <span class="nx-note-hint" id="noteHint">Optional — but it saves everyone a phone call</span>
        ${canRecord ? `
          <button type="button" class="nx-note-mic" id="noteMic" aria-label="Record a voice note">
            ${icon("chat", 16)}<span id="noteMicLabel">Record</span>
          </button>` : ""}
      </div>
      <div class="nx-note-audio" id="noteAudio" hidden></div>
    </div>
  `;

  const $ = (s) => container.querySelector(s);
  const input = $("#noteText");
  const hint = $("#noteHint");
  const audioWrap = $("#noteAudio");

  input.addEventListener("input", () => {
    text = input.value.trim();
    onChange(getNote());
  });

  /* ------------------------------------------------------------- voice --- */

  function resetMic() {
    const mic = $("#noteMic");
    if (!mic) return;
    mic.classList.remove("recording");
    $("#noteMicLabel").textContent = "Record";
    clearInterval(timer);
    seconds = 0;
  }

  function releaseMic() {
    // Release the microphone or the browser keeps showing a recording
    // indicator, which is alarming and looks like we're still listening.
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  async function start() {
    if (recorder) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      hint.textContent = "Microphone blocked — type it instead, that works too.";
      return;
    }

    chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = handleStop;
    recorder.start();

    const mic = $("#noteMic");
    mic.classList.add("recording");
    seconds = 0;
    timer = setInterval(() => {
      seconds++;
      $("#noteMicLabel").textContent = `${MAX_SECONDS - seconds}s`;
      // Hard stop. An open microphone that never closes is both a privacy
      // problem and a way to produce a file nobody will download.
      if (seconds >= MAX_SECONDS) stop();
    }, 1000);
  }

  function stop() {
    if (!recorder || recorder.state === "inactive") return;
    try { recorder.stop(); } catch { /* already stopped */ }
    resetMic();
  }

  async function handleStop() {
    releaseMic();
    const blob = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
    recorder = null;
    if (!blob.size) return;

    if (blob.size > MAX_BYTES) {
      hint.textContent = "That was too long — try a shorter note.";
      return;
    }

    // Play it back locally straight away, so they know it recorded before
    // they commit to uploading anything.
    const localUrl = URL.createObjectURL(blob);
    audioWrap.hidden = false;
    audioWrap.innerHTML = `
      <audio controls src="${localUrl}" style="width:100%;height:36px;"></audio>
      <button type="button" class="nx-note-clear" id="noteClear">Remove</button>
    `;
    $("#noteClear").addEventListener("click", () => {
      URL.revokeObjectURL(localUrl);
      audioUrl = null;
      audioWrap.hidden = true;
      audioWrap.innerHTML = "";
      onChange(getNote());
    });

    // Upload through the SAME presigned-R2 path every other file uses. No new
    // storage, no new bucket, no new credentials.
    hint.textContent = "Saving your note…";
    try {
      const { uploadUrl, publicUrl } = await api.presignUpload(
        "pickup-note",
        blob.type.split(";")[0],
        "pickup-note.webm",
      );
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": blob.type.split(";")[0] },
        body: blob,
      });
      if (!res.ok) throw new Error("upload failed");
      audioUrl = publicUrl;
      hint.textContent = "Your rider will hear this when they accept.";
      onChange(getNote());
    } catch {
      // Non-fatal by design. The booking must never fail because a voice
      // note didn't upload — the typed text still goes with the trip.
      audioUrl = null;
      hint.textContent = "Couldn't save the voice note — your typed note still goes through.";
      toast("Voice note didn't upload, but your booking is fine");
    }
  }

  const mic = $("#noteMic");
  if (mic) {
    // Pointer events only. Binding mousedown AND touchstart fires both on
    // most Android browsers, which starts two recorders and leaves one
    // running with the microphone open.
    mic.addEventListener("pointerdown", (e) => { e.preventDefault(); start(); });
    mic.addEventListener("pointerup", (e) => { e.preventDefault(); stop(); });
    mic.addEventListener("pointercancel", stop);
    mic.addEventListener("pointerleave", stop);
  }

  function getNote() {
    return { text, audioUrl };
  }

  return {
    getNote,
    destroy() {
      stop();
      releaseMic();
      clearInterval(timer);
    },
  };
}
