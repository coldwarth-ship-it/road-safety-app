"""Import public MOT TRAMS CSV; publish aggregates only, never individual records."""
import argparse
import csv
import datetime as dt
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import urllib.parse
import urllib.request

CATALOG = 'https://datagov.mot.go.th/api/3/action/package_show?id=roadaccident'
SOURCE = 'https://datagov.mot.go.th/dataset/roadaccident'
PROVINCES = tuple(item['name'] for item in json.loads(
    (Path(__file__).resolve().parents[1] / 'disaster/thailand-data.json').read_text(encoding='utf-8')))
if len(set(PROVINCES)) != 77:
    raise ValueError('Expected 77 distinct provinces in the reference list')
METRICS = {'deaths': 'จำนวนผู้เสียชีวิต', 'seriousInjuries': 'จำนวนผู้บาดเจ็บสาหัส', 'injuries': 'รวมจำนวนผู้บาดเจ็บ'}
REQUIRED = {'ปีที่เกิดเหตุ', 'วันที่เกิดเหตุ', 'หน่วยงาน', 'จังหวัด', 'รถจักรยานยนต์', *METRICS.values()}


def fetch(url):
    if urllib.parse.urlparse(url).scheme != 'https' or urllib.parse.urlparse(url).hostname != 'datagov.mot.go.th':
        raise ValueError('Only the official HTTPS MOT host is accepted')
    with urllib.request.urlopen(url, timeout=120) as response:
        if urllib.parse.urlparse(response.url).hostname != 'datagov.mot.go.th':
            raise ValueError('Unexpected redirect host')
        return response.read(30_000_001)


def count(value):
    text = str(value).strip()
    if not text.isdigit():
        raise ValueError('Missing or invalid numeric count: ' + repr(value))
    return int(text)


def aggregate(raw, year, resource, fetched_at):
    text = raw.decode('utf-8-sig')
    reader = csv.DictReader(io.StringIO(text, newline=''))
    if not REQUIRED.issubset(reader.fieldnames or []):
        raise ValueError('Source schema changed; previous snapshot is preserved')
    rows, blank_rows = [], 0
    for number, row in enumerate(reader, 2):
        if None in row or any(v is None for v in row.values()):
            raise ValueError(f'Malformed CSV at line {number}')
        if not any(v.strip() for v in row.values()):
            blank_rows += 1
            continue
        date = dt.datetime.strptime(row['วันที่เกิดเหตุ'].strip(), '%d/%m/%Y').date()
        if date.year != year or count(row['ปีที่เกิดเหตุ']) != year:
            raise ValueError(f'Unexpected event year at line {number}')
        if not row['หน่วยงาน'].strip():
            raise ValueError(f'Missing agency at line {number}')
        for key in (*METRICS.values(), 'รถจักรยานยนต์'):
            count(row[key])
        if count(row[METRICS['injuries']]) < count(row[METRICS['seriousInjuries']]):
            raise ValueError(f'Inconsistent injury totals at line {number}')
        rows.append((row, date.isoformat()))
    if not rows:
        raise ValueError('Empty source; previous snapshot is preserved')
    selected = [(r, d) for r, d in rows if r['หน่วยงาน'].strip() == 'กรมทางหลวง']
    if not selected:
        raise ValueError('No matching DOH records; previous snapshot is preserved')
    def summarize(province, matching):
        values = {'province': province, 'hasRecords': bool(matching), 'records': len(matching)}
        for metric, column in METRICS.items():
            values[metric] = sum(count(r[column]) for r, _ in matching)
        values['motorcycleRecords'] = sum(count(r['รถจักรยานยนต์']) > 0 for r, _ in matching)
        values['motorcyclePercent'] = round(values['motorcycleRecords'] / len(matching) * 100, 2) if matching else None
        values['latestEventDate'] = max((d for _, d in matching), default=None)
        return values
    result = [summarize(province, [(r, d) for r, d in selected if r['จังหวัด'].strip() == province])
              for province in PROVINCES]
    unattributed = summarize('ไม่ระบุจังหวัด / จังหวัดไม่ตรงรายการ',
                            [(r, d) for r, d in selected if r['จังหวัด'].strip() not in PROVINCES])
    def duplicates(items):
        return len(items) - len({tuple(sorted(r.items())) for r, _ in items})
    return {
        'schemaVersion': 2, 'year': year, 'agency': 'กรมทางหลวง', 'sourceUrl': SOURCE,
        'resourceId': resource['id'], 'downloadUrl': resource['url'],
        'resourceModifiedAt': resource.get('last_modified'), 'fetchedAt': fetched_at,
        'sha256': hashlib.sha256(raw).hexdigest(),
        'sourceEventRange': {'from': min(d for _, d in rows), 'to': max(d for _, d in rows)},
        'selectedEventRange': {'from': min(d for _, d in selected), 'to': max(d for _, d in selected)},
        'quality': {'sourceRecords': len(rows), 'blankRowsSkipped': blank_rows,
                    'exactDuplicateRows': duplicates(rows), 'selectedExactDuplicateRows': duplicates(selected),
                    'missingProvinceRows': sum(not r['จังหวัด'].strip() for r, _ in rows),
                    'selectedUnattributedRows': unattributed['records'],
                    'provincesWithRecords': sum(p['hasRecords'] for p in result),
                    'duplicatesPolicy': 'Keep source records; no unique incident ID is provided in this CSV.'},
        'provinces': result, 'unattributed': unattributed,
        'totals': {key: sum(r[key] for r in result) + unattributed[key] for key in ('records', *METRICS, 'motorcycleRecords')},
    }


def save_atomic(path, payload):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=path.parent, delete=False) as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
        file.write('\n')
        temp = file.name
    os.replace(temp, path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--year', type=int, default=dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).year)
    parser.add_argument('--output', default='data/trams-doh-preview.json')
    parser.add_argument('--csv', help='Use an already downloaded official CSV for reproducible testing')
    parser.add_argument('--catalog', help='Use saved official catalog metadata')
    args = parser.parse_args()
    catalog = json.loads(Path(args.catalog).read_text()) if args.catalog else json.loads(fetch(CATALOG))
    if not catalog.get('success'):
        raise ValueError('Catalog request failed')
    candidates = [r for r in catalog['result']['resources'] if str(r.get('format', '')).upper() == 'CSV' and str(args.year + 543) in r.get('name', '')]
    if len(candidates) != 1:
        raise ValueError('Expected exactly one annual CSV resource')
    resource = candidates[0]
    raw = Path(args.csv).read_bytes() if args.csv else fetch(resource['url'])
    if len(raw) > 30_000_000:
        raise ValueError('Source is too large')
    payload = aggregate(raw, args.year, resource, dt.datetime.now(dt.timezone.utc).isoformat())
    save_atomic(args.output, payload)
    print(json.dumps({'range': payload['sourceEventRange'], 'totals': payload['totals'], 'quality': payload['quality']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
