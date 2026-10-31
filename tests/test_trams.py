import csv
import importlib.util
import io
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('trams', Path(__file__).parents[1] / 'scripts/sync_trams.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def sample(rows):
    stream = io.StringIO(newline='')
    fields = sorted(m.REQUIRED)
    writer = csv.DictWriter(stream, fieldnames=fields)
    writer.writeheader()
    for changes in rows:
        r = {key: '0' for key in fields}
        r.update({'ปีที่เกิดเหตุ': '2026', 'วันที่เกิดเหตุ': '20/1/2026', 'หน่วยงาน': 'กรมทางหลวง', 'จังหวัด': 'ชลบุรี'})
        r.update(changes)
        writer.writerow(r)
    return stream.getvalue().encode('utf-8-sig')


class ImportTests(unittest.TestCase):
    def run_import(self, raw):
        return m.aggregate(raw, 2026, {'id': 'test', 'url': m.SOURCE}, '2026-10-31T00:00:00Z')

    def test_scope_motorcycle_and_blank_rows(self):
        raw = sample([{'รถจักรยานยนต์': '2', 'จำนวนผู้เสียชีวิต': '1'}, {'หน่วยงาน': 'กรมทางหลวงชนบท'}, {'จังหวัด': 'กรุงเทพมหานคร'}, {'รถจักรยานยนต์': '0'}])
        raw += (',' * (len(m.REQUIRED)-1) + '\n').encode()
        d = self.run_import(raw)
        self.assertEqual(d['totals']['records'], 3)
        self.assertEqual(d['totals']['deaths'], 1)
        self.assertEqual(next(r for r in d['provinces'] if r['province']=='ชลบุรี')['motorcyclePercent'], 50)
        self.assertEqual(len(d['provinces']), 77)
        self.assertEqual(next(r for r in d['provinces'] if r['province']=='กรุงเทพมหานคร')['records'], 1)
        self.assertEqual(d['quality']['blankRowsSkipped'], 1)
        self.assertEqual(d['sourceEventRange']['from'], '2026-01-20')

    def test_duplicates_are_reported_not_silently_removed(self):
        d = self.run_import(sample([{}, {}]))
        self.assertEqual(d['quality']['selectedExactDuplicateRows'], 1)
        self.assertEqual(d['totals']['records'], 2)

    def test_unattributed_reconciles_and_absence_is_explicit(self):
        d = self.run_import(sample([{'จังหวัด': ''}, {'จังหวัด': 'ชื่อจังหวัดผิด'}, {'จังหวัด': 'บึงกาฬ'}]))
        self.assertEqual(d['totals']['records'], 3)
        self.assertEqual(d['unattributed']['records'], 2)
        self.assertEqual(sum(r['records'] for r in d['provinces']) + d['unattributed']['records'], 3)
        self.assertEqual(d['quality']['provincesWithRecords'], 1)
        absent = next(r for r in d['provinces'] if r['province']=='ชลบุรี')
        self.assertFalse(absent['hasRecords'])
        self.assertIsNone(absent['motorcyclePercent'])
        self.assertIsNone(absent['latestEventDate'])

    def test_invalid_sources_fail(self):
        for raw in [b'<html>error</html>', sample([{'จำนวนผู้เสียชีวิต': ''}]), sample([{'ปีที่เกิดเหตุ': '2025'}]), sample([{'วันที่เกิดเหตุ': '31/2/2026'}]), sample([{'หน่วยงาน': ''}]), sample([{'จำนวนผู้บาดเจ็บสาหัส': '2', 'รวมจำนวนผู้บาดเจ็บ': '1'}])]:
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                self.run_import(raw)


if __name__ == '__main__':
    unittest.main()
