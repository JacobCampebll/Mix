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
| `KYTC_SUBMIT_TO` | send | Where submissions go. Comma-separated for several. |
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
