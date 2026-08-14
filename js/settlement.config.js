// Nova Go — where drivers send the commission they owe.
//
// WHY THIS IS A SEPARATE FILE WITH TODOs IN IT
//
// The credit limit works: a driver past Rs 2,000 of unsettled commission is
// filtered out of matching and stops receiving jobs. What did not exist was
// any way for them to DO something about it. The app knew they were blocked,
// knew the exact amount, and told them nothing — so the only route back was
// phoning ops, and the likely outcome is a driver who assumes the app is
// broken and goes back to Bykea.
//
// These are the accounts money comes INTO. They are not payment credentials
// and nothing here is secret — an Easypaisa number is printed on shop
// windows across the city. But they must be RIGHT, because a driver sending
// Rs 1,400 to a mistyped number has lost it and it is our fault.
//
// The launch-readiness check treats an unfilled entry as a blocker (see
// launchReadiness() in launch.config.js), for the same reason it does with
// support contacts: a payment instruction that is wrong is worse than one
// that is absent.

export const SETTLEMENT = {
  /* Each channel a driver can pay through. Set `enabled: false` on any you
     don't offer rather than deleting it — the screen renders only what is
     enabled, and keeping the shape makes turning one on a one-word change. */
  channels: [
    {
      key: "easypaisa",
      label: "Easypaisa",
      enabled: true,
      // TODO: your real Easypaisa merchant/personal number
      accountNumber: "",
      accountTitle: "",       // TODO: the name that shows when they enter it
      // Shown under the number. Keep it to what a driver needs to do next.
      hint: "Open Easypaisa → Send Money → enter this number.",
    },
    {
      key: "jazzcash",
      label: "JazzCash",
      enabled: true,
      accountNumber: "",      // TODO
      accountTitle: "",       // TODO
      hint: "Open JazzCash → Money Transfer → Mobile Account.",
    },
    {
      key: "raast",
      label: "Raast",
      enabled: true,
      // Raast IDs are usually a mobile number registered with a bank.
      accountNumber: "",      // TODO
      accountTitle: "",       // TODO
      hint: "Any bank app → Raast → Send to mobile number. No fee.",
    },
    {
      key: "bank",
      label: "Bank transfer",
      enabled: true,
      accountNumber: "",      // TODO: IBAN
      accountTitle: "",       // TODO
      bankName: "",           // TODO
      hint: "IBAN transfer from any bank app.",
    },
  ],

  /* What a driver must do AFTER sending money, and how fast we promise to
     act. Both halves matter: a settlement we can't match to a driver stays
     unapplied, and a driver who doesn't know how long to wait phones ops. */
  proofInstruction:
    "Send the screenshot to the ops desk on WhatsApp with your name and bike number.",
  // Realistic, not aspirational. Ops applies these by hand on the settle desk.
  clearedWithin: "usually within an hour during booking hours",
};

/** Only the channels that are both enabled and actually filled in. */
export function activeSettlementChannels() {
  return SETTLEMENT.channels.filter((c) => c.enabled && c.accountNumber && c.accountTitle);
}

/** True when a driver can actually be told how to pay. */
export function settlementConfigured() {
  return activeSettlementChannels().length > 0;
}
