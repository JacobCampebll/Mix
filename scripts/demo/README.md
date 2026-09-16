# The demo film

    HARNESS_LIBS=/path/to/node_modules node scripts/demo/demo.mjs          # record
    HARNESS_LIBS=/path/to/node_modules node scripts/demo/demo.mjs --dry    # walk it, no video

Writes a ~3 minute 1280x800 WebM to `scripts/demo/out/`. `HARNESS_LIBS` wants
a `node_modules` carrying pdf-lib, xlsx and fflate — the same one the
regression harness uses, for the same reason: the page loads all three from a
CDN and the film has no network.

**It is the real page, clicked.** `page.mjs`'s `rewrittenPage()` is the
harness's own: Supabase stubbed, the three libraries pointed at disk, nothing
else changed. Every figure on screen is `designbook.html` computing it from
the real #467PA MixPack — the blend, the design values, the volumetrics, the
99.84375% and the -$312.50.

Three things are stood in for, all because the film runs offline, and none of
them invent a number:

- **Supabase** — the harness's stub, `scripts/amaw/harness/lib/stub.mjs`.
- **`sign-approval`** — `netlify/lib/canonical.mjs` is imported and run for
  real against the design on screen, so the MIX ID, the `#467` and the
  verification code are computed from its bytes. What is substituted is the
  production signing key and the Supabase auth check.
- **`kytc-items`** — not substituted. The lot's lookup reaches
  transportation.ky.gov, fails with no network, and leaves a red note; the
  film clears that note rather than filming it or inventing KYTC data in its
  place.

**Two identities, because the page insists on it.** A reviewer cannot approve
their own submission (`renderStage()`'s `canApprove`), so the film runs as a
contractor, submits, reloads as KYTC, and opens the submitted PDF. The page
reload in the middle is what it is in life — a different person opening an
emailed file — and the custody log at the end of that scene says so.

Scenes are a list at the top of `demo.mjs`; each is a small async function, so
one can be re-timed or dropped without touching the rest. `chrome.mjs` is the
film's own furniture — the cursor, the lower-third caption, the spotlight and
the title cards — injected into the page and appended to `<body>` so it
survives `renderForm()` rewriting `#sections`.
