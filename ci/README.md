# Android build workflow — needs one manual step

`ci/android.yml` is a complete GitHub Actions workflow that builds signed AABs
for both apps. It is parked here rather than at `.github/workflows/` because
pushing it was rejected:

```
refusing to allow a Personal Access Token to create or update workflow
.github/workflows/android.yml without `workflow` scope
```

That is a GitHub permission on the token, not a problem with the file.

## To activate it — either way works

**A. Grant the scope**, then move the file:

```bash
git mv ci/android.yml .github/workflows/android.yml && git commit -m "Enable Android CI" && git push
```

(Regenerate the PAT at github.com/settings/tokens with `workflow` ticked.)

**B. Paste it in the browser** — github.com → the repo → Add file → Create new
file → name it `.github/workflows/android.yml` → paste the contents of
`ci/android.yml` → Commit. No token scope needed.

## Secrets it expects

| Secret | What |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -i your.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password |

Without them it still builds — unsigned, which proves the pipeline compiles
but cannot be uploaded to Play.

**Storing the keystore as a secret is also its backup.** Lose that file and
you can never update the Play listing again; the only remedy is a new app
under a new package name, abandoning your reviews and installs.
