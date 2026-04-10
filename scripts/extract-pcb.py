"""
Extract PCB (Potongan Cukai Bulanan) data from Jadual_PCB_2018.pdf
Output: scripts/pcb-data.json

PDF structure:
- 733 pages, RM5 income bands
- 24 columns: income_range, B, K(Cat2), KA1-KA10(Cat2), K(Cat3), KA1-KA10(Cat3)
- Category 1 (B) = single person
- Category 2 = married, spouse NOT working
- Category 3 = married, spouse IS working

DB mapping:
- KA1 = single → PDF column B (col 1), children=0
- KA2 = married spouse not working → PDF Cat2 K,KA1-KA10 (cols 2-12), children=0-10
- KA3 = married spouse working → PDF Cat3 K,KA1-KA10 (cols 13-23), children=0-10
"""

import fitz
import json
import re
import sys

PDF_PATH = r'C:\Users\User\Downloads\Jadual_PCB_2018.pdf'
OUTPUT_PATH = r'C:\Users\User\Venture-Portal\scripts\pcb-data.json'

def parse_amount(val):
    """Parse a PCB amount value. Returns None for '-' (no tax due)."""
    if val is None:
        return None
    val = val.strip().replace(',', '')
    if val in ('-', '', 'RM', 'None'):
        return None
    try:
        return float(val)
    except ValueError:
        return None

def parse_income_range(cell):
    """Parse '3281 - 3285' into (3281, 3285)."""
    if cell is None:
        return None
    m = re.match(r'(\d[\d,]*)\s*-\s*(\d[\d,]*)', cell.strip())
    if m:
        return (int(m.group(1).replace(',', '')), int(m.group(2).replace(',', '')))
    return None

def extract_page(page):
    """Extract PCB data rows from a single PDF page."""
    tabs = page.find_tables()
    if not tabs.tables:
        return []

    table = tabs.tables[0]
    data = table.extract()
    rows = []

    for row in data:
        if not row or not row[0]:
            continue
        income = parse_income_range(row[0])
        if not income:
            continue

        income_from, income_to = income

        # Column mapping (0-indexed in row):
        # 0: income range
        # 1: B (single) = DB KA1
        # 2-12: Cat2 K, KA1-KA10 = DB KA2, children 0-10
        # 13-23: Cat3 K, KA1-KA10 = DB KA3, children 0-10

        # KA1 (single), children=0
        b_val = parse_amount(row[1]) if len(row) > 1 else None
        if b_val is not None and b_val > 0:
            rows.append({
                'income_from': income_from,
                'income_to': income_to,
                'category': 'KA1',
                'children': 0,
                'pcb_amount': b_val,
            })

        # KA2 (married, spouse not working), children 0-10
        for c in range(11):
            col_idx = 2 + c
            if col_idx < len(row):
                val = parse_amount(row[col_idx])
                if val is not None and val > 0:
                    rows.append({
                        'income_from': income_from,
                        'income_to': income_to,
                        'category': 'KA2',
                        'children': c,
                        'pcb_amount': val,
                    })

        # KA3 (married, spouse working), children 0-10
        for c in range(11):
            col_idx = 13 + c
            if col_idx < len(row):
                val = parse_amount(row[col_idx])
                if val is not None and val > 0:
                    rows.append({
                        'income_from': income_from,
                        'income_to': income_to,
                        'category': 'KA3',
                        'children': c,
                        'pcb_amount': val,
                    })

    return rows

def main():
    doc = fitz.open(PDF_PATH)
    total_pages = len(doc)
    all_rows = []
    errors = 0

    print(f'Processing {total_pages} pages...')

    for i in range(total_pages):
        try:
            rows = extract_page(doc[i])
            all_rows.extend(rows)
        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f'  Page {i+1} error: {e}')

        if (i + 1) % 100 == 0:
            print(f'  Page {i+1}/{total_pages}: {len(all_rows)} rows so far')

    print(f'\nDone. Total rows: {len(all_rows)}, errors: {errors}')

    # Stats
    if all_rows:
        incomes = set((r['income_from'], r['income_to']) for r in all_rows)
        print(f'Income bands: {len(incomes)}')
        print(f'Range: RM{min(r["income_from"] for r in all_rows)} - RM{max(r["income_to"] for r in all_rows)}')

        for cat in ['KA1', 'KA2', 'KA3']:
            cat_rows = [r for r in all_rows if r['category'] == cat]
            print(f'  {cat}: {len(cat_rows)} rows')

    # Validate against known PDF value
    test = [r for r in all_rows if r['income_from'] == 3281 and r['category'] == 'KA1' and r['children'] == 0]
    if test:
        print(f'\nValidation: RM3281-3285 single = RM{test[0]["pcb_amount"]} (expected 5.20)')

    # Write output
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(all_rows, f)
    print(f'\nSaved to {OUTPUT_PATH}')

if __name__ == '__main__':
    main()
