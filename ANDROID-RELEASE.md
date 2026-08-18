# Android — building the first signed AAB

Written 2026-08-18. Android Studio is installed; `android/` is generated and
ready. This is what turns it into a file the Play Console will accept.

---

## Open the project, do not create one

Android Studio's welcome screen offers **New Project**. Same trap as Xcode:
`android/` is **generated from the web app by Capacitor**, and a hand-made
project would be one Capacitor cannot sync into.

Click **Open** and choose:

```
/Users/aisha/Documents/GitHub/novax-rides/android
```

First open triggers a Gradle sync that downloads the Android Gradle Plugin and
dependencies. It takes a while and it is normal.

**There is no system Java on this Mac** (`java -version` fails). That is fine —
Android Studio ships its own JDK and builds with it. It only matters if you
ever run `./gradlew` from a terminal, which needs `JAVA_HOME` pointing at
Android Studio's bundled runtime.

---

## This machine's toolchain (verified 2026-08-18)

| | |
|---|---|
| Android Studio | **`~/Desktop/Android Studio.app`** — not `/Applications`. Tools that look in the conventional place will not find it. |
| Bundled JDK | 25. **Gradle 8.2.1 cannot run on it** — fails with `Unsupported class file major version 69`. |
| JDK for CLI builds | **17**, at `/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home` |
| SDK platforms | `android-34` (installed by Studio 2026-08-18) and `android-37.0` |
| Build-tools | 34.0.0, 36.0.0 |

Android Studio is **not** affected by the JDK problem — it resolves its own
Gradle JVM (`gradleJvm = #GRADLE_LOCAL_JAVA_HOME`) and syncs fine. Only
command-line `./gradlew` needs the export:

```bash
export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
```

The whole cluster — this JDK mismatch, targetSdk 34, AGP 8.2.1 — is one root
cause: Capacitor 6 scaffolds a two-year-old Android toolchain against a current
Studio, JDK and SDK.

## Always run select-app before you build

The four apps share one `android/` project. `scripts/select-app.js` swaps the
web assets, the applicationId, the manifest permissions and the signing config
on every build. **Building without it ships whichever app was built last.**

```bash
npm run app:driver && npx cap sync android
```

Swap `app:driver` for `app:customer` to build the other one. The command prints
what it wrote — check the `applicationId` line matches the app you meant.

---

## The keystore

**Do this once, and never lose the result.**

Google identifies an app by the key it was signed with. If you lose this file
you can never ship an update to that listing again — not with a new key, not by
asking support. The listing is dead and you start over with a new one.

Pick a real password. Do not reuse one you have used anywhere else, and do not
store it in a desktop sticky note.

```bash
mkdir -p ~/.novago && keytool -genkeypair -v -keystore ~/.novago/novago-release.keystore -alias novago -keyalg RSA -keysize 4096 -validity 10000
```

It asks for a password, then name / organisation / city / country. Those appear
in the certificate, not in the store listing. Use the real company details.

Then tell the build where it is — replace both passwords with the one you just
chose:

```bash
cat > ~/.novago/keystore.properties <<'EOF'
storeFile=/Users/aisha/.novago/novago-release.keystore
storePassword=YOUR_PASSWORD_HERE
keyAlias=novago
keyPassword=YOUR_PASSWORD_HERE
EOF
chmod 600 ~/.novago/keystore.properties
```

`~/.novago/` is outside both repos, same as the ops credentials. Nothing secret
is ever committed; `select-app.js` only points Gradle at these files.

### Back it up before the first upload

Two copies, neither of them this laptop. A password manager attachment and an
encrypted cloud folder is enough. **Roadmap item 18 (CI builds) exists partly
because putting the keystore in encrypted GitHub secrets backs it up by
definition.**

---

## Build the AAB

With the keystore in place, `npm run app:driver` prints
`android : release signing config injected`. Then in Android Studio:

**Build → Generate Signed App Bundle / APK → Android App Bundle**

Or from a terminal, once `JAVA_HOME` is set:

```bash
cd /Users/aisha/Documents/GitHub/novax-rides/android && ./gradlew bundleRelease
```

Output lands at `android/app/build/outputs/bundle/release/app-release.aab`.

---

## Before you upload either app

- [ ] `versionCode` in `android/app/build.gradle` increments on every upload.
      Play rejects a duplicate. It is currently `1`.
- [ ] **App icon** — still Capacitor's placeholder. Google rejects the default.
- [ ] Confirm the `applicationId` in the build log is the app you meant.
      Until 2026-08-18 every build carried the customer's ID, driver included.
- [ ] Customer build must NOT contain `ACCESS_BACKGROUND_LOCATION`. `select-app`
      handles this, but check the printed permission list — shipping it on the
      customer app triggers a policy review that build cannot pass.
- [ ] Test on a **real handset**, not just an emulator. Background GPS has never
      run on physical hardware and it is the biggest untested risk in the app.

---

## What to test on a real phone, in priority order

This is the whole reason to build now rather than after the store accounts
exist. None of it needs a Play account.

1. **Background GPS** — go online as a driver, lock the screen, put the phone in
   a pocket for fifteen minutes, and confirm ops still sees the rider moving.
   This is roadmap item 22 and the single biggest technical risk in the project.
   Xiaomi/Redmi/POCO, Oppo, Realme and Vivo battery managers kill foreground
   services; `BACKGROUND-GPS.md` flags this as the main failure mode in this
   market.
2. **Navigate handoff** — the `geo:` URI is inert in a desktop browser, so this
   has never been verified. Tapping Navigate should open Google Maps with the
   destination set.
3. **A full trip on two real phones**, driver and customer, on real Karachi
   roads. Everything so far has been two browser tabs.
4. **Weak network** — 3G, a tunnel, switching between wifi and mobile data,
   force-quitting the app mid-trip.
