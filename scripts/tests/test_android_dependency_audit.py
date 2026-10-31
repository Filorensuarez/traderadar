import importlib.util
import pathlib
import unittest

SPEC = importlib.util.spec_from_file_location('dep_audit', pathlib.Path(__file__).resolve().parents[1] / 'audit-android-dependencies.py')
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


class DependencyAuditTest(unittest.TestCase):
    def queries(self):
        return AUDIT.coordinates({'libraries': [{'group': 'test', 'name': 'fixture', 'version': '1'}]})

    def test_deduplicate_and_reject_empty_inventory(self):
        item = {'group': 'test', 'name': 'fixture', 'version': '1'}
        self.assertEqual(len(AUDIT.coordinates({'libraries': [item, item]})), 1)
        with self.assertRaises(ValueError):
            AUDIT.coordinates({'libraries': []})

    def test_positive_finding_and_complete_clean_response(self):
        self.assertEqual(AUDIT.summarize(self.queries(), {'results': [{}]}), [])
        self.assertEqual(AUDIT.summarize(self.queries(), {'results': [{'vulns': [{'id': 'TEST-FIXTURE'}]}]})[0]['id'], 'TEST-FIXTURE')

    def test_partial_or_malformed_response_is_not_clean(self):
        for response in [{}, {'results': []}, {'results': ['bad']}, {'results': [{'vulns': [{}]}]}]:
            with self.assertRaises((ValueError, AttributeError)):
                AUDIT.summarize(self.queries(), response)


if __name__ == '__main__':
    unittest.main()
