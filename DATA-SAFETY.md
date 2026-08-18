# Data Safety (Play) & App Privacy (Apple)

Every answer below was checked against `prisma/schema.prisma` and the code
that writes it — not against what we intended to collect.

**Both stores treat a wrong answer here as a policy violation, not a mistake.**
Under-declaring is the one that gets apps pulled after launch. Where something
was arguable I have declared the broader answer.

The two apps are **separate submissions with different answers.** Do not copy
the passenger sheet into the rider listing.

---

## Shared facts

| | |
|---|---|
| Data encrypted in transit | **Yes** — HTTPS/WSS only, `upgrade-insecure-requests` in CSP |
| Users can request deletion | **Yes** — in-app (Profile → Settings) and at `novagorides.com/delete-account.html` |
| Committed to Play Families policy | Not applicable — not aimed at children |
| Independent security review | **No** — answer honestly |

### Third-party SDKs and services that receive data

| Service | What it receives | Why |
|---|---|---|
| Sentry | Crash and error reports. **Coordinates, phone numbers, OTP codes and address searches are stripped before sending** (see `sentryOnLoad` in each HTML entry point) | Diagnostics |
| Firebase Cloud Messaging | Device push token | Notifications |
| Mapbox / CARTO | Map tile requests | Map display |
| Nominatim, Photon | Address text being searched | Geocoding |
| OSRM | Origin and destination coordinates | Route and distance |
| Railway | Our own backend and database | The service itself |

Declare **all** of these. "It's just a map" is exactly the omission that gets
flagged.

---

## 1 · Nova Go (passenger)

### Location
| Type | Collected | Shared | Purpose | Optional? |
|---|---|---|---|---|
| Approximate location | Yes | No | App functionality | Required |
| Precise location | Yes | No | App functionality | Required |

Not shared with third parties for advertising. Coordinates go to the routing
and map services listed above purely to draw a route.

**Background location: NO.** The passenger app requests foreground only.

### Personal info
| Type | Collected | Shared | Purpose |
|---|---|---|---|
| Name | Yes | No | Account management |
| Email address | Yes | No | Account management |
| Phone number | Yes | No | Account management, so your rider can call you |
| Other (destination addresses) | Yes | No | App functionality |

The rider is shown the passenger's **first name and phone number** for the
duration of a trip. This is between two users of the service, not a sale to a
third party — Play calls this "shared" only when it leaves the app's
providers, so answer **No** to shared and disclose it in the privacy policy.

### Financial info
**None.** Cash only. No card, no wallet, no payment credential is ever entered.
Tick nothing here — declaring a payment method you do not take is its own
inaccuracy.

### Messages
| Type | Collected | Shared | Purpose |
|---|---|---|---|
| Other in-app messages | Yes | No | App functionality, support |

In-app chat between passenger and rider, plus support tickets.

### Photos and audio
| Type | Collected | Shared | Purpose |
|---|---|---|---|
| Voice or sound recordings | Yes | No | App functionality |

Optional pickup voice note. Recorded only when the user taps the microphone.

### App activity & diagnostics
| Type | Collected | Shared | Purpose |
|---|---|---|---|
| App interactions | Yes | No | Analytics |
| Crash logs | Yes | No | Diagnostics |
| Diagnostics | Yes | No | Diagnostics |

### Device IDs
| Type | Collected | Shared | Purpose |
|---|---|---|---|
| Device or other IDs | Yes | No | Notifications (FCM token) |

### Apple App Privacy — "Data Linked to You"
Location · Contact Info (name, email, phone) · User Content (messages, voice
notes) · Identifiers (device token) · Usage Data · Diagnostics.

**Not** used for tracking. Answer **No** to "used to track you across apps and
websites" — there is no ad SDK and no cross-app identifier.

---

## 2 · Nova Go Rider (driver)

Everything above, **plus** the following. This app collects considerably more,
and the extra items are the sensitive ones.

### Location — the important difference
| Type | Collected | Shared | Purpose | Optional? |
|---|---|---|---|---|
| Precise location | Yes | **Yes** — with the passenger during a trip | App functionality | Required |

**Background location: YES.** Declare it and justify it:

> A rider must transmit their position while online so Nova Go can dispatch
> nearby jobs, give the passenger live tracking of the motorcycle they are
> waiting for, and locate the rider if the passenger raises an emergency
> alert. Collection begins only when the rider explicitly taps "Go Online" and
> stops when they go offline or the trip ends.

Play will likely require the **background-location declaration form and a
demo video** showing the in-app disclosure, the permission prompt, and the
feature working. Record it after the first build.

### Personal info — additional
| Type | Collected | Shared | Purpose |
|---|---|---|---|
| Government ID (CNIC) | Yes | No | Identity verification, fraud prevention |
| Other (driving licence, vehicle registration, photos of both) | Yes | No | Identity verification, safety |
| Other (emergency contact name and phone) | Yes | No | Safety |

`DriverProfile.cnicNumber`, `cnicFrontUrl`, `cnicBackUrl`,
`licenseFrontUrl`, `licenseBackUrl`, `vehicleDocUrl`, `vehiclePhotoUrl`,
`emergencyContactName`, `emergencyContactPhone`.

**This is the section most likely to be under-declared, and CNIC is
government ID.** Declare it.

### Financial info — additional
| Type | Collected | Shared | Purpose |
|---|---|---|---|
| Other financial info (payout account) | Yes | No | To pay the rider |

`payoutMethod`, `payoutAccountName`, `payoutAccountNumber` — a JazzCash,
Easypaisa or bank destination we send earnings **to**. It is not a payment
credential and cannot be charged, but it is financial information: declare it.

### Apple App Privacy — additional "Data Linked to You"
Sensitive Info (government ID, licence) · Financial Info (payout destination) ·
Contacts (emergency contact).

---

## Before you submit

1. The privacy policy must **name every item above** and be reachable without
   logging in. Ours is at `/legal/privacy` in-app and must also live at
   `novagorides.com/privacy`.
2. It must name the legal entity — fill `COMPANY` in `js/launch.config.js`
   first, or the policy has a blank where your company name goes.
3. Answer the passenger and rider forms **separately**. Copying the passenger
   answers into the rider listing under-declares CNIC, licence, payout details
   and background location, all four at once.
