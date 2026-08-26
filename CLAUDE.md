# Mix — project conventions

<!-- FILL IN: one or two sentences on what this repo is and who uses it. -->
Purpose: TBD.

Collaborators: two people working from separate Claude accounts against this
shared repo. Neither can see the other's chats — this file is the shared
context. If you learn something durable about the project, add it here rather
than leaving it in a conversation.

## Ground rules for Claude Code

- Read this file and the existing code before proposing changes.
- Deliver full, runnable files. Do not hand back patch fragments or
  "add this near line 40" snippets.
- One concern per commit. Small commits, clear messages.
- Never commit secrets. API keys live in Netlify environment variables and are
  read server-side only. If a key is needed client-side, that is a design
  error — proxy it instead.
- Do not rewrite git history or force-push. Two people work here.
- If a change touches a file the other person is likely editing, say so in the
  commit message.

## Architecture conventions

- **Single-file HTML apps.** One `.html` file per app: markup, CSS, and JS
  together. No build step, no bundler, no framework unless there is a specific
  reason.
- **CONFIG block at the top.** Every app opens with a single `CONFIG` object
  holding all tunable values — endpoints, thresholds, spec limits, plant lists,
  feature flags. No magic numbers buried in functions.
- **Netlify static hosting.** The `.html` file deploys as-is.
- **Netlify Functions as API-key proxies.** Any third-party API call goes
  through a function in `netlify/functions/`. The browser never sees a key.
- **Client-side JSON knowledge bases.** Reference data ships as a JSON file
  loaded at runtime, with BM25 retrieval when search is needed.
- **No localStorage in artifacts.** In-memory state only for anything that will
  run inside Claude. Standalone Netlify apps may use localStorage.

## Python conventions

- `openpyxl` for Excel read/write.
- `pdfplumber` for PDF parsing.
- `reportlab` for PDF generation.
- Anchor spreadsheet reads on **labels, not fixed cell addresses**. Find the
  label cell, then offset. KYTC workbooks move between revisions.
- Scripts are standalone and runnable with explicit paths, no notebook-only
  code.

## Domain notes

<!-- FILL IN as the project develops. Suggested headings below. -->

### Mix designs / JMFs
TBD.

### Specifications and tolerances
TBD — cite the governing spec section when encoding a limit in code.

### Gotchas found the hard way
- (Log real bugs here so the other person does not rediscover them.)

## Conventions for changing this file

Both collaborators edit `CLAUDE.md`. To avoid merge conflicts, append to the
end of a section rather than restructuring, and keep edits to one section per
commit where possible.
