#!/usr/bin/env python3
"""Turn the Technician Plant Access roster (horizontal AMP-number columns)
into seed files for the two tables in supabase/schema.sql:

    technicians_seed.csv / .sql              -> `technicians`
    technician_plant_access_seed.csv / .sql  -> `technician_plant_access`

Run supabase/schema.sql in the Supabase SQL Editor first to create the
tables. Then load the data either way:

  - Table Editor -> (table) -> Insert -> Import data from CSV, using the
    .csv files. This is the easiest path, but Studio's CSV importer has
    been unreliable on tables with composite primary keys / foreign keys
    (technician_plant_access is both) -- if it rejects the file as
    "incompatible" with no useful detail, fall back to the .sql files
    below instead of fighting the importer.
  - SQL Editor -> paste the whole .sql file -> Run. Slower to set up but
    goes through the same path that already worked for schema.sql. Both
    .sql files use ON CONFLICT DO NOTHING, so re-running them after the
    roster changes only inserts new rows -- it won't duplicate or error
    on ones already there. (It also won't *update* a changed row or drop
    a removed one; for that, clear the table first or write a real diff.)

These seed files contain real names -- do not commit them to git. Re-run
this script whenever the roster spreadsheet changes.

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


def sql_string(value):
    """Postgres string literal, or NULL for an empty/missing value."""
    if value is None or value == "":
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


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

    technicians = []  # list of (sm_id, first, last, company, certs)
    access_rows = []  # list of (sm_id, amp_number)

    for row in ws.iter_rows(min_row=header_row + 1, values_only=True):
        sm_id = row[col["SM ID"]]
        if not sm_id:
            break  # first blank row ends the table; a notes block may follow it
        technicians.append(
            (sm_id, row[col["First Name"]], row[col["Last Name"]], row[col["Company"]], row[col["Certification(s)"]])
        )
        for idx in amp_cols:
            amp = row[idx]
            if amp:
                access_rows.append((sm_id, amp))

    # --- CSV output (Table Editor import) ---
    technicians_csv = out_dir / "technicians_seed.csv"
    access_csv = out_dir / "technician_plant_access_seed.csv"

    with open(technicians_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["sm_id", "first_name", "last_name", "company", "certifications"])
        w.writerows(technicians)

    with open(access_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["sm_id", "amp_number"])
        w.writerows(access_rows)

    # --- SQL output (SQL Editor fallback) ---
    technicians_sql = out_dir / "technicians_seed.sql"
    access_sql = out_dir / "technician_plant_access_seed.sql"

    with open(technicians_sql, "w", encoding="utf-8") as f:
        f.write("insert into technicians (sm_id, first_name, last_name, company, certifications)\nvalues\n")
        f.write(
            ",\n".join(
                f"  ({sql_string(sm_id)}, {sql_string(first)}, {sql_string(last)}, {sql_string(company)}, {sql_string(certs)})"
                for sm_id, first, last, company, certs in technicians
            )
        )
        f.write("\non conflict (sm_id) do nothing;\n")

    with open(access_sql, "w", encoding="utf-8") as f:
        f.write("insert into technician_plant_access (sm_id, amp_number)\nvalues\n")
        f.write(",\n".join(f"  ({sql_string(sm_id)}, {sql_string(amp)})" for sm_id, amp in access_rows))
        f.write("\non conflict (sm_id, amp_number) do nothing;\n")

    print(f"Wrote {technicians_csv} and {technicians_sql} ({len(technicians)} technicians)")
    print(f"Wrote {access_csv} and {access_sql} ({len(access_rows)} technician-plant access rows)")


if __name__ == "__main__":
    main()
