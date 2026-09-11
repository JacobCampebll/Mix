# Netlify Functions

Three, and all three are **transit, not storage**. Nothing here keeps a
design; that is the whole point of the model in CLAUDE.md ("Designs: the file
is the record, not a table"). A function exists only where the browser
genuinely cannot do the job:

| Function | Why it can't be client-side |
|---|---|
| `sign-approval` | An approval must be impossible to forge by editing a file. That needs a secret the browser never sees. |
| `verify-approval` | Checking an approval needs the same secret. Open on purpose — a district office with a PDF should be able to check it without an account. |
| `kytc-items` | The contract's current line items, off `transportation.ky.gov`. No secret at all — the reason is CORS: the KYTC site is public and sends no `Access-Control-Allow-Origin`, so a browser cannot read it. Open, like `verify-approval`; it reads public pages and takes nothing but a contract ID. |

`kytc-items` is the one thing on a generated MixPack that a correct design
could still get wrong. Its Project Items sheet is what MEDL checks the load
against, and contractors fill it from the proposal they bid — which goes
stale the moment a change order adds, deletes or re-numbers an item, and MEDL
then refuses the file (Jake, 2026-09-11). KYTC's own current list is the
**newest pay estimate** for the contract, so that is what this reads:
`/Construction/Pay Estimates/<cid>-<vendor>-EST<nnnn>.html`, highest number
wins (the sequence can have gaps, so take the max rather than counting up),
falling back to `/Construction/Contract Items/<cid>items<vendor>.html` — the
items as awarded — for a contract with no estimate yet, which is the normal
state for a *new* design since paving has not started. The response says
which of the two answered.

Neither filename can be built from a contract ID alone: both carry the
contractor's KYTC vendor number. Rather than ask a technician for it, both
libraries are SharePoint document libraries whose classic view honours
`Forms/AllItems.aspx?FilterField1=FileLeafRef&FilterOp1=BeginsWith`, so the
contract ID finds the file and the vendor number comes back with it. (The
libraries' unfiltered listing only ever serves 300 old files, so paging it is
a dead end — the filter is the way in.)

The two reports are hand-rolled RTF-to-HTML from the 1990s — unclosed `<td>`,
stray `<font>`, tables nested inside table *rows* — so nothing parses them as
a tree. They are read as a flat run of `<tr>` blocks, with the header row that
most recently went past deciding how to read the cells (the two layouts differ:
the estimate has 12 columns and a live CURRENT QUANTITY, the item list has 8
and only the bid/plan quantity). A row under no known header is skipped rather
than guessed at.

There used to be a third, `send-submission`, which emailed the package to
KYTC. It is gone (Jake, 2026-09-10). A mail provider authenticates by DKIM
records in a domain you control; this is KYTC's system rather than a
contractor's, so the sender could not honestly be an Allen address, and a
Gmail address is structurally impossible because nobody can add DNS records
to `gmail.com`. Sending as `@ky.gov` would need the Commonwealth Office of
Technology to authorise a third-party sender. A technician's own mail
already reaches `@ky.gov`, so Submit now stamps the package, freezes it and
downloads it, and the technician emails it themselves. That removed three
environment variables and the only outbound dependency in the stack.

Note what was traded away: the submittal is **unsigned**. Whoever is signed
in is still stamped on it, but nothing proves the file was not edited after
the stamp. Only the approval is signed, and that is the artifact KYTC issues
and `verify.html` checks. Signing the submittal too is a small change on top
of `sign-approval` if Central Office ever wants it.

The shared code they import lives in **`netlify/lib/`** (`auth.mjs`,
`canonical.mjs`), deliberately outside this directory. Netlify deploys every
file in `netlify/functions/` as an endpoint, and a leading underscore does
**not** exempt it - an earlier version of this file said it did, and the deploy
preview proved otherwise (`/.netlify/functions/_auth` returned a 502 "handler
not found", not a 404). Anything that is not itself a function goes in `lib/`.

## Environment variables

Set these in Netlify → Site configuration → Environment variables. **None of
them may ever appear in a page** — `designbook.html` calls the functions and
never sees a secret.

| Variable | Used by | Notes |
|---|---|---|
| `SUPABASE_URL` | all | Same project the pages use. |
| `SUPABASE_ANON_KEY` | all | The public anon key. Safe here; RLS is the control. |
| `APPROVAL_SIGNING_SECRET` | sign, verify | **The real secret.** Long random string. Changing it invalidates every approval already issued. |

`kytc-items` needs none of them — it reads public KYTC pages and has no
Supabase or Netlify dependency at all, which is also why it is the one
function that works in a deploy preview with nothing configured.

`RESEND_API_KEY`, `KYTC_SUBMIT_TO` and `SUBMIT_FROM` are no longer used —
nothing here sends mail. Where a submittal goes is now `CONFIG.SUBMIT
.KYTC_EMAIL` in `designbook.html`: an address the page shows the technician,
not a secret, and the page naming it can no longer turn anything into an
open relay because there is no relay.

Until they are set, the functions return a clear "not configured yet"
message rather than failing obscurely — the flow can be clicked through and
will tell you what is missing.

## How an approval is trusted

`sign-approval` HMACs a canonical form of the design (`lib/canonical.mjs`) plus
the approver, the submitter and the timestamp. Two rules are enforced
**there** rather than in the page, because a page can be edited by whoever
is looking at it:

- only a `can_review` account may approve;
- the approver may not be the person who submitted it — read out of the
  file's own chain of custody. This used to be a Postgres trigger. The
  history entry it looks for is named by the server (`SUBMITTED_ACTION` in
  `lib/canonical.mjs`), never by the request, so a caller cannot point the
  lookup at a different entry. The history itself is still written by the
  page, so this rule is only as strong as the file — what the server
  guarantees is that whoever it finds is the one signed into the approval.

`sign-approval` also refuses an account that has not finished onboarding.
The pages redirect those to login, but a function cannot lean on a page: a
valid token can call it directly, and before onboarding the account's email
is the fabricated `@technicians.mix.local` address.

The approval number is derived from the signature, so it is a fingerprint of
that exact design and cannot be moved onto another one.

Verified against tampering: editing the design after approval, swapping the
approver, and reusing a code on a different design all fail; reordering JSON
keys and appending later history entries still pass.

## The approval number

KYTC numbers designs sequentially from 001 at the start of each year, around
2,000 a year, and the **same counter appears two ways**:

```
00250467   MIX ID NUM. on the sheet      #467PA   what KYTC calls it
  │ │  └── 0467  sequence                    └───  467 + PA
  │ └───── 25    the LETTING year
  └─────── 00    prefix
```

So the reviewer types **one thing — the sequence** — and both renderings come
from it (`lib/canonical.mjs`, `approvalNumbers`).

**There is no counter and no register here.** Sequential numbering needs
shared state and this model stores nothing, so the number comes from whatever
KYTC uses today. Nothing can prevent a duplicate or a skip. What *is*
guaranteed is that the number cannot be altered afterwards: it is inside what
the signature covers.

The year is the **letting** year, not the approval year — a design let in
December and approved in January still belongs to the letting year.

### PA

Mixes of nominal size **0.38 and 0.50 in A, B or D** (not C) are approved with
a performance review, and get `PA` after the number. That is only printed when
the CT and Hamburg results are actually present: asserting a review that did
not happen would be false, and dropping `PA` silently would hide a missing
test. So approval is **refused** with a message naming what is missing.

### Not yet verified

One thing read off a single example (`#467PA` / `00260467`, letting 2/19/26)
and isolated in `APPROVAL_RULES` so they are a one-line change:

- the `00` prefix and the 4-digit sequence — check `Design Data!H10` in
  another workbook (`#489PA` should read `00260489`);
Confirmed since: the short form is padded to at least three digits
(`#050PA`), which is a minimum rather than a maximum — past 999 it simply
runs to four.
