import unittest,datetime as dt
from fetch import parse_date,similar
from publish import finalise
class Pipeline(unittest.TestCase):
 def test_dates(self):
  self.assertIsNone(parse_date('not a date'));self.assertIsNone(parse_date('2026-10-13T12:00:00'));self.assertIsNotNone(parse_date('Tue, 13 Oct 2026 12:00:00 GMT'))
 def test_exact_cross_topic(self):
  a=dict(url='https://example.com/a',title='Story',topic='Tech',published='2026-10-13T12:00:00Z');b=dict(a,topic='India');self.assertTrue(similar(a,b))
 def test_conservative(self):
  a=dict(url='https://example.com/a',title='India banks expand digital payments pilot',topic='Business',published='2026-10-13T12:00:00Z');b=dict(a,url='https://example.com/b',title='India banks expand digital payments pilot today');self.assertTrue(similar(a,b))
 def test_missing_decisions_fail(self):
  with self.assertRaises(ValueError):finalise({'candidates':[{'id':'a'}]},{'decisions':{},'stories':[]},{},dt.datetime.now(dt.timezone.utc))
if __name__=='__main__':unittest.main()
