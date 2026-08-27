# Disaster Recovery Runbook — CM-Law SecureExam

Written after the first real production deployment (2026-08-27), which hit
five distinct failure modes back to back. Nothing here is theoretical —
every incident below actually happened, in this order, on this project.
Kept as a runbook, not a post-mortem: written so the *next* person (possibly
future-you) can recognize the symptom and jump straight to the fix instead
of re-diagnosing from scratch.

Production stack: Vercel (Next.js hosting) + Neon (Postgres, via Vercel's
Neon integration) + GitHub (source). Custom domain attempt used InfinityFree
DNS (see Incident 4).

---

## Incident 1 — Deployment blocked: "commit author did not have contributing access"

**Symptom:** Vercel deployment shows status **Blocked**, with the message
*"The deployment was blocked because the commit author did not have
contributing access to the project on Vercel. The Hobby Plan does not
support collaboration for private repositories."*

**Cause:** Vercel's Hobby plan only accepts deploys triggered by commits
whose author (by git `user.email`) matches the GitHub identity actually
connected to the Vercel account/team. If you push from a machine with a
different local git identity than your Vercel-linked GitHub account, every
push gets blocked — regardless of repo visibility.

**Diagnosis:**
```bash
git log -1 --format="%H %an <%ae>"
```
Compare the author email against the GitHub account shown at
**Vercel → Account Settings → Authentication → GitHub**.

**Fix:**
1. Find the Vercel-linked GitHub account's verified email:
   `github.com/settings/emails` while logged in as that account.
2. Set the *local, repo-only* git identity to match (don't touch `--global`
   — this can be a different identity than your other projects):
   ```bash
   cd app
   git config user.name "Your Name"
   git config user.email "the-vercel-linked-email@example.com"
   ```
3. Push a new commit (an empty one is fine if there's nothing else to
   ship) — the *next* commit deploys correctly. Amending/force-pushing the
   blocked commit is unnecessary; a fresh commit with the right author is
   simpler and doesn't rewrite history.

**Note:** Making the GitHub repo public does *not* fix this — that was
tried first and made no difference. The restriction is about commit
authorship, not repo visibility, despite what the error message implies.

---

## Incident 2 — Deployment "Ready," domain "Valid Configuration," but the site 404s

**Symptom:** Vercel shows the deployment as **Ready**, the domain as
**Valid Configuration**, yet visiting the site returns a platform-level
`404: NOT_FOUND` (`X-Vercel-Error: NOT_FOUND` in response headers — check
with `curl -sD - -o /dev/null <url>`). Vercel's own **Observability** tab
shows **Function Invocations: 0** even after repeated visits — the request
never reaches the app at all.

**Cause (two layered issues, found in order):**
1. **Vercel Authentication** (Project Settings → Deployment Protection)
   was ON, requiring visitors to be logged into Vercel and on the team.
   This alone produces exactly this symptom for anonymous visitors.
2. Turning that off did **not** fully fix it — the project's domain/routing
   binding was independently stuck (root cause never fully identified;
   likely residue from the project having cycled through several
   Blocked/Error deployments before its first success). No amount of
   redeploying, removing/re-adding the domain, or waiting fixed it.

**Diagnosis:**
- Check **Settings → Deployment Protection → Vercel Authentication** first
  — if "Require Log In" is on, turn it off and retest before assuming
  anything is more seriously wrong.
- If still 404 after that, check **Observability → Function Invocations**.
  Zero invocations after real traffic means the platform routing layer
  itself isn't dispatching to your deployment — this is not something an
  app-code fix can address.

**Fix (last resort, but it worked and was fast):**
Delete the Vercel project entirely and recreate it fresh from the same
GitHub repo. The database (Neon), the GitHub repo, and all code are
untouched — only the Vercel project's internal routing/domain state gets
rebuilt from scratch.
1. **Settings → General → Delete Project** (type the project name + "delete
   my project" to confirm).
2. **vercel.com/new** → Import the same GitHub repo.
3. Set **Root Directory** to `app` (this repo's Next.js app lives in a
   subdirectory, not the repo root) — the framework preset should
   auto-detect as Next.js once the root directory is set correctly.
4. Re-add environment variables (`AUTH_SECRET` — generate fresh with
   `openssl rand -base64 32`; see Incident 3 for `DATABASE_URL`).
5. Deploy, then re-add any custom domains (see Incident 4 for the gotcha
   there).

---

## Incident 3 — Build succeeds, but every page 500s: "table does not exist"

**Symptom:** Deployment builds and goes **Ready**. Visiting any page that
touches the database throws a 500. Vercel **Runtime Logs** show:
```
PrismaClientKnownRequestError: The table `public.Institution` does not exist
code: 'P2021'
```

**Cause:** `DATABASE_URL` is wired up correctly (via Vercel's Neon
integration), but **migrations were never run against that specific
database**. This happens easily right after connecting a *new* database to
a *new* Vercel project (e.g., after Incident 2's project recreation) —
Vercel deploys the app, but nothing automatically runs
`prisma migrate deploy` against a freshly connected database.

**Fix:**
```bash
cd app
npx vercel login                    # your own browser auth, one time
npx vercel link --yes --project <project-name> --scope <team-slug>
npx vercel env pull .env.production.local --environment production --yes
```
`vercel env pull` writes `[SENSITIVE]` placeholders for any env var marked
"Sensitive" (Neon's integration marks `DATABASE_URL` sensitive by default)
— it cannot be read back via the CLI by design. Get the real value from
**Vercel → Environment Variables → DATABASE_URL → reveal (eye icon) →
copy**, and paste it into `.env.production.local` yourself, replacing the
`[SENSITIVE]` placeholder. Then:
```bash
DOTENV_CONFIG_PATH=.env.production.local npx prisma migrate deploy
DOTENV_CONFIG_PATH=.env.production.local npx tsx prisma/seed.ts   # only if you want the demo accounts
```
**Delete `.env.production.local` immediately after** — it now contains a
live production database password. Never commit it (already covered by
`.env*` in `.gitignore`, but don't rely on that alone — delete the file).

---

## Incident 4 — Custom subdomain CNAME never resolves (InfinityFree DNS)

**Symptom:** Added a subdomain (e.g. `examtrainer.slicklab.digital`) in
Vercel, added the CNAME record Vercel asked for in the DNS provider, but
Vercel keeps reporting **Invalid Configuration**, and the domain never
resolves to Vercel — it keeps resolving to InfinityFree's own hosting IP
instead.

**Cause:** InfinityFree (the host for the *root* `slicklab.digital` site)
has a **wildcard DNS record** (`*.slicklab.digital → <infinityfree IP>`)
that catches *any* subdomain, including ones with no InfinityFree
"Sub Domains" entry at all — confirmed by querying a made-up subdomain
that had never been created anywhere and getting the same IP back. A
specific CNAME record added afterward does not override this wildcard on
InfinityFree's DNS servers (non-standard: a specific record should
normally beat a wildcard, but doesn't here).

**Status: not resolved.** Two real options, neither attempted yet:
1. Ask InfinityFree support to exclude one specific subdomain from the
   wildcard.
2. Move `slicklab.digital`'s DNS off InfinityFree's nameservers to a
   provider without this limitation (Cloudflare free tier, Namecheap
   BasicDNS) — bigger change, affects the main site's DNS too, needs its
   own careful migration, not a quick fix.

**Workaround used for the demo:** just use the project's own
`<project-name>.vercel.app` domain, which works correctly and doesn't
depend on any of this.

---

## Incident 5 — Real app bug: camera/mic device check silently fails

**Symptom:** On the pre-exam Device Check step, the microphone level meter
never moves, and clicking "Take Photo" does nothing — no error shown
either time, just silent failure.

**Cause:** Real code bug, not infrastructure — see
`src/components/DeviceAndIdentityCheck.tsx`. The camera stream's
`srcObject` was assigned to `videoRef.current` at a moment when the
component was still in its "requesting" phase, whose JSX renders no
`<video>` element at all — so the assignment silently targeted `null` and
was never retried once the video element actually mounted a moment later.
Separately, the `AudioContext` powering the mic meter could start
`suspended` (a Chrome autoplay-policy edge case for contexts created after
an `await`), and nothing ever called `.resume()`.

**Fix:** Already applied (commit `b91ff31`) — an effect now re-attaches
`srcObject` once the `<video>` element mounts, keyed on the component's
`phase` state, and `audioCtx.resume()` is called right after creation.
Documented here only because "camera/mic doesn't work" is exactly the kind
of report that looks like a permissions or hardware issue and wastes time
being diagnosed as one — check this class of ref/effect-timing bug in
`DeviceAndIdentityCheck.tsx` first if it resurfaces.

---

## Quick reference: where things live

| What | Where |
|---|---|
| Vercel project | `vercel.com/ezlikdragons-projects/slick-lab-digital-exam-trainer` |
| Vercel team | `ezlikdragons-projects` (Hobby plan) |
| Neon database | `neon-coquelicot-blanket`, survives Vercel project deletion — reconnect via **Storage → Connect Database** |
| Production DB migrations | `DOTENV_CONFIG_PATH=.env.production.local npx prisma migrate deploy` from `app/` (see Incident 3 for getting the connection string) |
| GitHub repo | `github.com/NickyMontederamos/SlickLab.Digital-ExamTrainer` (public — see `SECURITY.md`/repo settings for why) |
| Live URL | `https://slick-lab-digital-exam-trainer.vercel.app` |
| Demo accounts | `{superadmin,admin,faculty,proctor,student}@cmlaw.demo`, password `DemoPass!2026` (seeded via `prisma/seed.ts`) |

## General principle for next time

Every incident above except #5 was infrastructure, not app code — and every
one of them produced a *generic-looking* symptom (404, 500, blank
DNS) that could plausibly be blamed on the app. The actual diagnostic
sequence that worked, every time: check Vercel's own dashboard state
(Deployment Protection, Function Invocations, Runtime Logs) *before*
touching application code. None of these five incidents needed a single
line of app code changed to fix (except #5, which really was app code).
