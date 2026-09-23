#!/usr/bin/env python3
"""Build the Mix change log PDF for 10-23 September 2026.

    OUT=/tmp/changelog.pdf python3 scripts/report/changelog_2026-09-10_to_09-23.py

Standalone and runnable with explicit paths, per CLAUDE.md's Python
conventions; reportlab for generation, same as every other PDF here.

THE CONTENT IS CURATED, NOT GENERATED. It is a hand pass over the 250 commits
in that window, keeping every MAJOR and MID change and dropping the pure
CLAUDE.md commits, the work-in-progress commits and the comment corrections.
So this file is a record of one report rather than a tool: a changelog for a
different window is a new DAYS list, not a new date range. The layout below is
the reusable part.

MAJOR = a new capability, or a decision that changed how the work is done.
MID   = a real change to behaviour, layout or correctness.
"""
import os
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph,
                                Spacer, Table, TableStyle, KeepTogether, Image)

OUT = os.environ.get("OUT", "/tmp/Mix_changes_Sep10-23_2026.pdf")
LOGO = "/home/user/Mix/public/assets/kytc-logo.png"

NAVY  = colors.HexColor("#002050")
INK   = colors.HexColor("#083860")
MUTED = colors.HexColor("#6E7580")
LINE  = colors.HexColor("#DAD7CE")
GOLD  = colors.HexColor("#FFC312")
SKY   = colors.HexColor("#5FB2E4")
PAPER = colors.HexColor("#F2F1EC")

M = 0.72 * inch
PW, PH = LETTER

S = dict(
    title=ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=21, leading=25,
                         textColor=NAVY, spaceAfter=2),
    sub=ParagraphStyle("s", fontName="Helvetica", fontSize=10.5, leading=15,
                       textColor=MUTED, spaceAfter=14),
    lead=ParagraphStyle("l", fontName="Helvetica", fontSize=10.5, leading=16,
                        textColor=INK, spaceAfter=10),
    day=ParagraphStyle("d", fontName="Helvetica-Bold", fontSize=13, leading=16,
                       textColor=colors.white, spaceBefore=0, spaceAfter=0),
    daynote=ParagraphStyle("dn", fontName="Helvetica", fontSize=9, leading=12,
                           textColor=colors.HexColor("#C9D4E2")),
    h2=ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=12.5, leading=15,
                      textColor=NAVY, spaceBefore=13, spaceAfter=6),
    item=ParagraphStyle("i", fontName="Helvetica", fontSize=9.6, leading=13.4,
                        textColor=INK, alignment=TA_LEFT),
    tag=ParagraphStyle("g", fontName="Helvetica-Bold", fontSize=7.2, leading=9,
                       textColor=colors.white, alignment=1),
    who=ParagraphStyle("w", fontName="Helvetica", fontSize=7.6, leading=9.6,
                       textColor=MUTED, alignment=2),
    foot=ParagraphStyle("f", fontName="Helvetica", fontSize=7.8, leading=10,
                        textColor=MUTED),
)

def chrome(canv, doc):
    canv.saveState()
    canv.setFillColor(NAVY); canv.rect(0, PH - 0.30 * inch, PW, 0.30 * inch, stroke=0, fill=1)
    canv.setFillColor(GOLD); canv.rect(0, PH - 0.335 * inch, PW, 0.035 * inch, stroke=0, fill=1)
    canv.setFont("Helvetica", 7.6); canv.setFillColor(colors.HexColor("#C9D4E2"))
    canv.drawString(M, PH - 0.215 * inch, "Mix — DesignBook & PlantBook · change log")
    canv.drawRightString(PW - M, PH - 0.215 * inch, "10–23 September 2026")
    canv.setStrokeColor(LINE); canv.setLineWidth(0.5)
    canv.line(M, 0.62 * inch, PW - M, 0.62 * inch)
    canv.setFont("Helvetica", 7.8); canv.setFillColor(MUTED)
    canv.drawString(M, 0.46 * inch, "kytcmix.netlify.app · generated from the repository history, 23 September 2026")
    canv.drawRightString(PW - M, 0.46 * inch, "Page %d" % doc.page)
    canv.restoreState()

doc = BaseDocTemplate(OUT, pagesize=LETTER, leftMargin=M, rightMargin=M,
                      topMargin=0.62 * inch, bottomMargin=0.82 * inch,
                      title="Mix — change log, 10–23 September 2026",
                      author="The Allen Company / KYTC")
doc.addPageTemplates([PageTemplate(id="p",
    frames=[Frame(M, 0.82 * inch, PW - 2 * M, PH - 1.44 * inch, id="f",
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)],
    onPage=chrome)])

def esc(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def bold_lead(text):
    """'Lead — rest' renders the lead in bold."""
    for sep in (" — ", " – "):
        if sep in text:
            head, tail = text.split(sep, 1)
            return "<b>%s</b>%s%s" % (esc(head), sep, esc(tail))
    return esc(text)

TAGC = {"MAJOR": NAVY, "MID": colors.HexColor("#8A94A3")}

def item(tier, text, who):
    """One change: a tier chip, the sentence, and who wrote it."""
    chip = Table([[Paragraph(tier, S["tag"])]], colWidths=[0.46 * inch], rowHeights=[0.15 * inch])
    chip.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), TAGC[tier]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    t = Table([[chip, Paragraph(bold_lead(text), S["item"]), Paragraph(who, S["who"])]],
              colWidths=[0.56 * inch, (PW - 2 * M) - 0.56 * inch - 0.62 * inch, 0.62 * inch])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
    ]))
    return t

def dayhead(date, note):
    t = Table([[Paragraph(date, S["day"]), Paragraph(note, S["daynote"])]],
              colWidths=[(PW - 2 * M) * 0.42, (PW - 2 * M) * 0.58])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (0, 0), 9), ("RIGHTPADDING", (-1, 0), (-1, 0), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, -1), 2.2, GOLD),
    ]))
    return t

# ---------------------------------------------------------------------
# The changes. Curated from 250 commits; pure documentation commits,
# work-in-progress commits and comment corrections are left out.
# C = Claude, AD = Andrew Denmark.
# ---------------------------------------------------------------------
DAYS = [
 ("Wednesday 10 September", "DesignBook layout", [
  ("MID", "Performance Testing fits on one line — all three tables side by side, with KYCT and the Hamburg curve sharing a row.", "C"),
  ("MID", "Design Values redesigned — two lists side by side, pairing like with like, filling the width instead of hugging the left edge.", "C"),
  ("MID", "Aggregate columns size to their content rather than splitting into equal thirds, and the field grid loses its slack.", "C"),
  ("MID", "A column's decimal precision is enforced where it renders, so an imported formula value stops printing to fifteen places.", "C"),
 ]),
 ("Thursday 11 September", "DesignBook: the guided form, and the SiteManager hand-off", [
  ("MAJOR", "DesignBook becomes a guided form — one step on screen at a time on a desktop, with the whole design still on one scroll on a phone. The steps are the schema, so adding a section adds a step.", "C"),
  ("MAJOR", "An approved design downloads as a real MixPack workbook for SiteManager — KYTC's own blank template, filled and with the ten hidden MEDL staging sheets evaluated. Reviewer-only.", "C"),
  ("MAJOR", "Contract Information fills itself from the KYTC proposal — county, funding, tonnage and the mix's line items, with a Look up contract button for the rest.", "C"),
  ("MAJOR", "Project Items are looked up rather than typed, from the contract's newest pay estimate. This is the sheet a change order makes stale and MEDL then refuses.", "C"),
  ("MAJOR", "Polish-resistant class resolves per producer against the LAM, not just per material name — a new reference table of all 45 approved producer and bench entries, plus the automatic Class A rule for natural sand.", "AD"),
  ("MID", "Polish fine aggregate counts material rather than sources, so a coarse aggregate's own minus-No.4 is credited.", "C"),
  ("MID", "The Polish section says in spec or out of spec at the top, instead of leaving it to be worked out.", "C"),
  ("MID", "TSR imports its six specimens and computes from the weights — bulk specific gravity, air voids and saturation — against the TSR tab's own Gmm.", "C"),
  ("MID", "The air-voids-against-binder chart gets real axes, and an extrapolated solve is flagged rather than drawn as if measured.", "AD"),
  ("MID", "Design Values stops printing the uploaded workbook's own figure beside the computed one — the calculated value is the record.", "AD"),
  ("MID", "AADTT Class is prefilled from the chosen mix's signature instead of being asked for.", "AD"),
  ("MID", "Section heads become a navy band with a gold rule; the Portal's card headings match.", "C"),
  ("MID", "The phone header drops from 375px to 116px on a 390px screen, and the Portal's from 204px to 97px.", "C"),
  ("MID", "One column below 1240px, a wrapping section rail, citation chips that hold one line, and the section tag hidden on a phone.", "C"),
  ("MID", "A legacy MixPack import resolves the producer by KYTC's own AGP or AMP number rather than the free-text name, which had raised an off-list warning on nearly every row.", "C"),
  ("MID", "Consensus Properties moves inside Aggregate Structure, where the blend that produces them is; TSR opens with its six waiting rows.", "C"),
 ]),
 ("Saturday 13 September", "PlantBook is built and goes live", [
  ("MAJOR", "PlantBook goes live — the book switch works, and a lot opens as the second view of the same page, sharing every renderer and the whole schema mechanism.", "C"),
  ("MAJOR", "The lot pay calculation is ported and verified cell for cell against two real completed AMAW lots.", "C"),
  ("MAJOR", "A lot downloads as the AMAW workbook for MEDL, generated in the browser from KYTC's blank template.", "C"),
  ("MAJOR", "The approval upload is PlantBook's front door — signed and verified on the way in, and the lot inherits contract, plant, mix, blend, Gsb and the three figures the pay is measured against.", "C"),
  ("MAJOR", "A lot saves and submits as a PDF at any point, the same way a design does, with the whole lot carried inside the file.", "C"),
  ("MID", "Sublots and Verification compute their volumetrics from raw weights rather than asking for the finished figures, so a lot cannot disagree with the workbook it is loaded into.", "C"),
  ("MID", "Each core takes its own weights and reports its own density pay; Cores opens with every slot the lot has, and only on an Option A job.", "C"),
  ("MID", "Six things stop being asked for and are derived instead: acceptance method, AADTT class, joint density, the compaction option (read off the proposal by a new lookup), the $50 unit price and the lot's 4,000 tons.", "C"),
  ("MID", "The producer/supplier lab comes from the plant rather than from a technician typing it.", "C"),
  ("MID", "Where a prefilled value came from moves onto the box as a tooltip, instead of a grey line under every field.", "C"),
  ("MID", "A row's figures pack three across on a phone while only its text takes the full width — PlantBook's page went from 19,517px to 15,000px, DesignBook's from 15,059px to 12,797px.", "C"),
  ("MID", "A repeating table that cannot fit its columns scrolls instead of squeezing them.", "C"),
  ("MID", "Fixed: DesignBook's section heading said \"Step 1 of 9\" over an action bar saying \"Step 1 of 8\" on the default new design.", "C"),
  ("MID", "Fixed: every approval PDF ever issued described itself internally as a review copy.", "C"),
 ]),
 ("Sunday 14 September", "Sublot tabs, and the workbook the form was not reaching", [
  ("MAJOR", "Sublots, Cores, Gradation, Aggregate Blend and Department Verification become four Sublot 1–4 tabs, so a technician works one sublot at a time.", "AD"),
  ("MAJOR", "The AMAW download becomes reviewer-only — contractors see the PDF they submit, KYTC turns it into the MEDL file.", "C"),
  ("MAJOR", "Gradation takes the sieve weights and computes percent passing, instead of asking for the percentage.", "C"),
  ("MID", "Fixed, the most serious of the period — a lot built on the form reached the AMAW generator with 72 filled rows and wrote 13 cells. Every ticket, specimen weight, gradation, core and verification record went nowhere. All six storing blocks are populated now, 533 cells.", "C"),
  ("MID", "Fixed: the typed as-tested binder content was written to a dead cell, and the workbook substituted its own back-calculation. It is back-calculated properly now, with a moisture correction.", "C"),
  ("MID", "Fixed: every generated AMAW told KYTC the plant's equipment had not been verified, because the flag was written to a formula rather than the cell beneath it.", "C"),
  ("MID", "Fixed: every repeating table's column headings sat over the wrong values, in both books, at every width — 7px to 969px out.", "C"),
  ("MID", "PlantBook's three spec citations verified — all three named the wrong section of the spec book.", "C"),
  ("MID", "Contract & Mix mirrors the approved design's aggregate structure and design values.", "AD"),
  ("MID", "A binder banner with additive dosage, and navy banners on every sublot grouping.", "AD"),
 ]),
 ("Monday 15 September", "Lot Pay opens up, and sublots lock", [
  ("MAJOR", "Lot Pay becomes a layered readout — click a property to see why it paid what it did, click a sublot to see the weighings and the formula behind every figure.", "C"),
  ("MAJOR", "A sublot stays locked until its random sample point exists, so nobody can jump ahead to sublot 3. Lot 1's first sublot is always open, because it is the setup.", "C"),
  ("MAJOR", "Contract & Mix is drawn as a ledger — label and value under hairlines — because the step is mostly read rather than filled.", "C"),
  ("MID", "Aggregate Blend becomes one table per sublot tab, carrying the design percentage beside the sublot's own.", "AD"),
  ("MID", "Fixed: a row table's header and its rows resolved to different column widths, putting the headings back off their values a week after the first fix.", "C"),
  ("MID", "Fixed: the Department Verification tables were seeded in an order that made rows migrate between sublot tabs on every save and reopen.", "C"),
  ("MID", "The unit price box is gone — it is a spec constant — and the project items look themselves up when a lot opens.", "C"),
  ("MID", "The approval's sample id is derived rather than asked for; nobody should type a MEDL identifier freehand.", "C"),
  ("MID", "\"ESAL Class\" is reworded to AADTT Class everywhere a person reads it.", "AD"),
  ("MID", "The sublot tabs reclaim wide-screen width, and each sublot's gradation is charted.", "AD"),
 ]),
 ("Tuesday 16 September", "The lot-to-lot door", [
  ("MAJOR", "Start lot n+1 — a finished lot opens the next one, carrying the contract, plant, mix, approval, blend and project items, and clearing every measurement.", "C"),
  ("MID", "A demo film of the whole chain, recorded by driving the real page rather than a mock-up.", "C"),
  ("MID", "Lot Pay drops the workbook cell references from its lines and keeps them in the tooltip.", "C"),
 ]),
 ("Wednesday 17 September", "Lab ids, and who approves which class", [
  ("MAJOR", "Two lab-id reference tables from SiteManager's own export — the contractor labs, scoped so a technician sees only their own company's, and KYTC's district labs.", "AD"),
  ("MAJOR", "Class 3 and Class 4 mix designs route to Central Office and Class 2 to the district — confirmed against two real approved district MixPacks, and all twelve districts filled in.", "AD"),
  ("MID", "A sublot's gradation becomes four columns: grams, that sublot's percent passing, the JMF target, and the deviation between them.", "C"),
  ("MID", "The gradation table narrows and hands the width to the chart, which grows by exactly what the table gives up.", "C"),
  ("MID", "Contract & Mix marks a required box gold until it is filled, then blue.", "C"),
  ("MID", "A Lot Pay working line links back to the box it was measured in — 88 of them on a filled lot.", "C"),
  ("MID", "Fixed: Aggregate Blend wrapped back to the first aggregates on any design with fewer than six components, showing one sublot another's rows.", "AD"),
  ("MID", "Fixed: PlantBook's front door crashed on any upload that was not a PDF or JSON, including a real AMAW.", "AD"),
  ("MID", "Seven lab rows flagged where the export's company disagrees with the plant's current operator — kept and marked unverified rather than dropped.", "AD"),
 ]),
 ("Thursday 18 September", "The spec sweeps", [
  ("MAJOR", "Eleven design-side spec checks raised in DesignBook — minimum binder content, dust ratio, VMA, percent of maximum gravity, Hamburg and KYCT performance limits, class substitution, reclaimed materials, absorption and reference-design age.", "C"),
  ("MAJOR", "Nine production thresholds raised in PlantBook — the 0.90 sublot stop-work floor, mixture moisture, dust ratio, mix temperature, core counts, a changed binder supplier or grade, Department verification tolerance, the setup binder adjustment and the 50-ton sampling rule.", "C"),
  ("MAJOR", "The job mix formula tolerance envelope is drawn on both 0.45 charts, hatched over the control-point band.", "C"),
  ("MID", "A No. 4 mix takes no cores at all, so it is forced to Option B rather than carrying a density weight it can never fill.", "C"),
  ("MID", "Joint cores follow the nominal size alone — 0.38 and 0.50 take two per sublot, larger sizes none.", "C"),
  ("MID", "The appbar reads \"LOT 8 of ~11\", the denominator coming from the line item's own quantity.", "C"),
  ("MID", "Nine polish-resistant producers from the LAM inserted into the aggregates table — granite and most siltstone sources had no match at all, so a real approved producer read as unproven.", "AD"),
 ]),
 ("Monday 21 September", "Notation and reference data", [
  ("MID", "Notation made consistent across both books — Unit Weight in pounds per cubic foot, and real subscripts on every specific-gravity and gyration term.", "AD"),
  ("MID", "The aggregate types table audited against SiteManager's own material-code export; 24 rows disagree with SiteManager's tier and are documented rather than silently changed.", "AD"),
 ]),
 ("Tuesday 22 September", "Storage, and paying a specialty mixture", [
  ("MAJOR", "PlantBook lot storage — a lot saves itself as it is filled, reopens from a list rather than a file, works with no signal, and is sealed on submission so nobody can quietly rewrite what KYTC received. The data is deleted a week after submission; the record that the lot existed is permanent.", "C"),
  ("MAJOR", "A gradation-accepted lot is paid — the Specialty Mixtures schedule, for leveling and wedging, scratch course, open-graded friction course and the rest.", "C"),
  ("MID", "Fixed: the shaded target band on every 0.45 chart in both books had been drawn one sieve too coarse since it shipped on 4 September.", "C"),
  ("MID", "The review PDF prints the gradation sublots in its Lot Pay table.", "C"),
  ("MID", "Chart tick marks, a subscript on bulk specific gravity, Design Values spacing and weight precision.", "AD"),
 ]),
]

# ---- the document ---------------------------------------------------
story = []

if os.path.exists(LOGO):
    try:
        _logo = Image(LOGO, width=1.05 * inch, height=0.42 * inch, kind="proportional")
        _logo.hAlign = "LEFT"
        story.append(_logo)
        story.append(Spacer(1, 8))
    except Exception:
        pass

story.append(Paragraph("What changed in Mix", S["title"]))
story.append(Paragraph("DesignBook and PlantBook · 10&#8211;23 September 2026", S["sub"]))

n_major = sum(1 for _, _, items in DAYS for t, _, _ in items if t == "MAJOR")
n_mid   = sum(1 for _, _, items in DAYS for t, _, _ in items if t == "MID")

story.append(Paragraph(
    "PlantBook did not exist on 10 September. It was built, wired to the lot pay schedules, "
    "given a workbook generator for MEDL, and taught to store a lot that several people fill "
    "over a week. DesignBook became a guided form and learned to produce the MixPack KYTC "
    "loads into SiteManager. Everything below is live at kytcmix.netlify.app.", S["lead"]))

stat = Table([[
    Paragraph("<b>%d</b><br/><font size=8 color='#6E7580'>major changes</font>" % n_major,
              ParagraphStyle("k", fontName="Helvetica", fontSize=17, leading=20, textColor=NAVY, alignment=1)),
    Paragraph("<b>%d</b><br/><font size=8 color='#6E7580'>mid-level changes</font>" % n_mid,
              ParagraphStyle("k2", fontName="Helvetica", fontSize=17, leading=20, textColor=NAVY, alignment=1)),
    Paragraph("<b>250</b><br/><font size=8 color='#6E7580'>commits</font>",
              ParagraphStyle("k3", fontName="Helvetica", fontSize=17, leading=20, textColor=NAVY, alignment=1)),
    Paragraph("<b>10</b><br/><font size=8 color='#6E7580'>working days</font>",
              ParagraphStyle("k4", fontName="Helvetica", fontSize=17, leading=20, textColor=NAVY, alignment=1)),
]], colWidths=[(PW - 2 * M) / 4.0] * 4)
stat.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), PAPER),
    ("BOX", (0, 0), (-1, -1), 0.5, LINE),
    ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
    ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
]))
story.append(stat)
story.append(Spacer(1, 12))

story.append(Paragraph(
    "<font color='#002050'><b>MAJOR</b></font> is a new capability or a decision that changed how the "
    "work is done. <font color='#8A94A3'><b>MID</b></font> is a real change to behaviour, layout or "
    "correctness. Documentation-only commits and work in progress are left out. "
    "The right-hand initial is who wrote it &#8212; C for the Claude sessions, AD for Andrew Denmark.",
    S["foot"]))
story.append(Spacer(1, 16))

for date, note, items in DAYS:
    block = [dayhead(date, note), Spacer(1, 5)]
    block.append(item(*items[0]))
    story.append(KeepTogether(block))
    for it in items[1:]:
        story.append(item(*it))
    story.append(Spacer(1, 16))

story.append(Spacer(1, 4))
story.append(Paragraph("Still open", S["h2"]))
for t in [
 "The lot storage schema is written and tested but <b>not yet applied</b> to the live database, and the "
 "week-long retention does not start deleting until the scheduled job is switched on. Until then a lot "
 "lives in the browser, which is what it did before.",
 "<b>No browser-built workbook has been loaded into MEDL yet</b> — neither the MixPack nor the AMAW. "
 "That is the one test that has not been run.",
 "Every file the app has been checked against is one shop's: two real lots, one approved design, one "
 "contract. A completed workbook from another district or producer is worth more than any new feature.",
 "Two policy questions for KYTC: whether Central Office should see a contractor's in-progress test data "
 "before a lot is submitted, and whether a week is the right retention window.",
]:
    p = Table([[Paragraph("•", ParagraphStyle("b", fontName="Helvetica-Bold", fontSize=10, textColor=GOLD)),
                Paragraph(t, S["item"])]],
              colWidths=[0.2 * inch, (PW - 2 * M) - 0.2 * inch])
    p.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                           ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    story.append(p)

doc.build(story)
print("wrote", OUT)
