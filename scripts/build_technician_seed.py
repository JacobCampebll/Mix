#!/usr/bin/env python3
"""Turn the Technician Plant Access roster (horizontal AMP-number columns)
into two normalized CSVs ready for Supabase's Table Editor CSV import:

    technicians_seed.csv              -> import into `technicians`
    technician_plant_access_seed.csv  -> import into `technician_plant_access`

Run supabase/schema.sql in the Supabase SQL Editor first to create the two
tables, then import these CSVs via Dashboard -> Table Editor -> (table) ->
Insert -> Import data from CSV.

These CSVs contain real names -- do not commit them to git. Re-run this
script and re-import whenever the roster spreadsheet changes; the schema's
primary keys (sm_id, and sm_id+amp_number) make re-importing idempotent as
long as your import tool is set to upsert/skip-duplicates rather than
insert-only.

Usage:
    python3 build_technician_seed.py /path/to/Technician_Plant_Access.xlsx [output_dir]
"""

import csv
import sys
from pathlib import Path

import openpyxl

SHEET_NAME = "Technician Plant Access"


def find_header_row(ws):
    """Anchor on the 'SM ID' label rather than assuming row 1, in case a
    title or blank row gets added above the table later."""
    for row in ws.iter_rows(min_row=1, max_row=10):
        for cell in row:
            if cell.value == "SM ID":
                return cell.row
    raise ValueError(f"Could not find an 'SM ID' header cell in sheet {ws.title!r}")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    src = Path(sys.argv[1])
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else src.parent

    wb = openpyxl.load_workbook(src, data_only=True)
    ws = wb[SHEET_NAME]

    header_row = find_header_row(ws)
    headers = [c.value for c in ws[header_row]]
    col = {name: idx for idx, name in enumerate(headers) if name}
    amp_cols = [idx for name, idx in col.items() if isinstance(name, str) and name.startswith("AMP ")]

    technicians_out = out_dir / "technicians_seed.csv"
    access_out = out_dir / "technician_plant_access_seed.csv"

    n_technicians = 0
    n_access_rows = 0

    with open(technicians_out, "w", newline="", encoding="utf-8") as tf, open(
        access_out, "w", newline="", encoding="utf-8"
    ) as af:
        t_writer = csv.writer(tf)
        a_writer = csv.writer(af)
        t_writer.writerow(["sm_id", "first_name", "last_name", "company", "certifications"])
        a_writer.writerow(["sm_id", "amp_number"])

        for row in ws.iter_rows(min_row=header_row + 1, values_only=True):
            sm_id = row[col["SM ID"]]
            if not sm_id:
                break  # first blank row ends the table; a notes block may follow it
            t_writer.writerow(
                [
                    sm_id,
                    row[col["First Name"]],
                    row[col["Last Name"]],
                    row[col["Company"]],
                    row[col["Certification(s)"]],
                ]
            )
            n_technicians += 1
            for idx in amp_cols:
                amp = row[idx]
                if amp:
                    a_writer.writerow([sm_id, amp])
                    n_access_rows += 1

    print(f"Wrote {technicians_out} ({n_technicians} technicians)")
    print(f"Wrote {access_out} ({n_access_rows} technician-plant access rows)")


if __name__ == "__main__":
    main()
