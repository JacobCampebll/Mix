# Netlify Functions

Three, and all three are **transit, not storage**. Nothing here keeps a
design; that is the whole point of the model in CLAUDE.md ("Designs: the
file is the record, not a table"). A function exists only where the browser
genuinely cannot do the job:

| Function | Why it can't be client-side |
|---|---|
| `send-submission` | A browser cannot attach a file to an email, and the KYTC address must not be something the page can change. |
| `sign-approval` | An approval must be impossible to forge by editing a file. That needs a secret the browser never sees. |
| `verify-approval` | Checking an approval needs the same secret. Open on purpose — a district office with a PDF should be able to check it without an account. |

`_auth.mjs` and `_canonical.mjs` are shared modules, not functions (Netlify
skips names starting with `_`).

## Environment variables

Set these in Netlify → Site configuration → Environment variables. **None of
them may ever appear in a page** — `designbook.html` calls the functions and
never sees a secret.

| Variable | Used by | Notes |
|---|---|---|
| `SUPABASE_URL` | all | Same project the pages use. |
| `SUPABASE_ANON_KEY` | all | The public anon key. Safe here; RLS is the control. |
| `APPROVAL_SIGNING_SECRET` | sign, verify | **The real secret.** Long random string. Changing it invalidates every approval already issued. |
| `RESEND_API_KEY` | send | Or swap the provider in `send-submission.mjs`. |
| `KYTC_SUBMIT_TO` | send | Where submissions go. Every design goes to the same two Central Office people (Andrew Denmark, Tate Salle) — comma-separated. |
| `SUBMIT_FROM` | send | A verified sender on the mail provider. |

Until they are set, the functions return a clear "not configured yet"
message rather than failing obscurely — the flow can be clicked through and
will tell you what is missing.

## How an approval is trusted

`sign-approval` HMACs a canonical form of the design (`_canonical.mjs`) plus
the approver, the submitter and the timestamp. Two rules are enforced
**there** rather than in the page, because a page can be edited by whoever
is looking at it:

- only a `can_review` account may approve;
- the approver may not be the person who submitted it — read out of the
  file's own chain of custody. This used to be a Postgres trigger.

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
from it (`_canonical.mjs`, `approvalNumbers`).

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

Two things read off a single example (`#467PA` / `00260467`, letting 2/19/26)
and isolated in `APPROVAL_RULES` so they are a one-line change:

- the `00` prefix and the 4-digit sequence — check `Design Data!H10` in
  another workbook (`#489PA` should read `00260489`);
- whether a low number pads in the short form (`#50PA` or `#050PA`). Every
  example seen is three digits. Currently unpadded.
