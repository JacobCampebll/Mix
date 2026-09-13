#!/usr/bin/env node
/* PlantBook regression harness — run everything, print a table, exit non-zero.
 *
 *   node scripts/amaw/harness/run.mjs                 # everything
 *   node scripts/amaw/harness/run.mjs steps ids       # named checks only
 *   HARNESS_LIBS=/path/to/node_modules node ...       # turns on the PDF case
 *
 * WHAT THIS IS FOR. PlantBook is about to be spliced into public/designbook.html
 * as a second VIEW sharing the same renderer, wizard and styling (CLAUDE.md:
 * "DesignBook and PlantBook are two views of one page"). The checks under
 * checks/ are the traps CLAUDE.md already paid for, written down so the splice
 * has something to fail against.
 *
 * IT PASSES TRIVIALLY TODAY, BY DESIGN. #bookPlant is `disabled`, login.html
 * and portal.html both carry `built: false`, and there is nothing behind the
 * button. So every PlantBook case reports SKIP with that as its reason and the
 * DesignBook cases report what the page does now. The moment the button is
 * enabled, every skipped line starts running — no check needs editing for
 * that, which is the only way a harness written ahead of its subject is worth
 * anything.
 *
 * A SKIP IS NOT A PASS. It is printed in its own block at the end with its
 * reason, and the exit summary counts it separately. A check that cannot see
 * its subject must say so; a check that quietly passes because it found
 * nothing to look at is worse than no check at all.
 *
 * Nothing here touches public/designbook.html — it reads it, rewrites a copy
 * into a temp dir, and drives that.
 */
import { loadChromium, CHROMIUM, PAGE, findLibs } from "./lib/page.mjs";
import { Results, printTable, FAIL, SKIP } from "./lib/report.mjs";
import { BOOKS } from "./lib/books.mjs";
import fs from "node:fs";

import * as viewports from "./checks/viewports.mjs";
import * as ids from "./checks/ids.mjs";
import * as steps from "./checks/steps.mjs";
import * as roundtrip from "./checks/roundtrip.mjs";
import * as shapes from "./checks/shapes.mjs";
import * as bookswitch from "./checks/bookswitch.mjs";

const CHECKS = [ids, steps, shapes, roundtrip, viewports, bookswitch];

async function main() {
  const want = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const run = want.length ? CHECKS.filter((c) => want.includes(c.id)) : CHECKS;
  if (!run.length) {
    console.error(`No such check. Available: ${CHECKS.map((c) => c.id).join(", ")}`);
    process.exit(2);
  }

  const results = new Results();

  // ---- preconditions. Each one is a SKIP-the-world, not a crash. ----------
  if (!fs.existsSync(PAGE)) {
    console.error(`The page is not where the harness expects it: ${PAGE}`);
    process.exit(2);
  }
  const pw = loadChromium();
  if (!pw) {
    console.error("Playwright is not resolvable. Set HARNESS_PLAYWRIGHT to its package directory.");
    console.error("Every check SKIPPED — nothing was measured.");
    process.exit(2);
  }
  if (!fs.existsSync(CHROMIUM)) {
    console.error(`No chromium at ${CHROMIUM}. Set PW_CHROMIUM.`);
    console.error("Every check SKIPPED — nothing was measured.");
    process.exit(2);
  }

  const libs = findLibs();
  console.log(`page      ${PAGE}`);
  console.log(`chromium  ${CHROMIUM}`);
  console.log(`libs      ${Object.keys(libs).join(", ") || "none (pdf-lib/xlsx/fflate cases will skip)"}`);
  console.log(`checks    ${run.map((c) => c.id).join(", ")}\n`);

  const browser = await pw.chromium.launch({ executablePath: CHROMIUM });
  const t0 = Date.now();
  try {
    for (const check of run) {
      try {
        await check.run({ browser, results, books: BOOKS });
      } catch (err) {
        // A check that throws is a failed check, not a failed run: the rest
        // still has something to say.
        results.fail(check.id, "-", "check threw", String(err && err.message || err));
      }
    }
  } finally {
    await browser.close();
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  // ---- the table ---------------------------------------------------------
  printTable(results.rows.filter((r) => r.status !== SKIP));
  if (results.skipped.length) {
    console.log("\nSKIPPED — subject not present. Each of these starts running on its own:\n");
    printTable(results.skipped, { maxDetail: 110 });
  }

  const { passed, failed, skipped } = results;
  console.log(`\n${passed.length} passed · ${failed.length} failed · ${skipped.length} skipped · ${secs}s`);
  if (failed.length) {
    console.log("\nFAILURES");
    for (const f of failed) console.log(`  ${f.check} / ${f.book} / ${f.case}\n    ${f.detail}`);
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(2); });
