import importlib.util
import pathlib
import unittest
import xml.etree.ElementTree as ET

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / 'audit-android-package.py'
SPEC = importlib.util.spec_from_file_location('apk_policy', SCRIPT)
POLICY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(POLICY)


class ApkPolicyTest(unittest.TestCase):
    def manifest(self):
        root = ET.parse(SCRIPT.parents[1] / 'android/app/src/main/AndroidManifest.xml').getroot()
        root.set('package', 'com.traderadar.pro')  # Gradle injects this into the actual merged manifest.
        return root

    def audit(self, root, names=None, variant='release'):
        return POLICY.inspect(ET.tostring(root, encoding='unicode'), list(POLICY.ASSETS) if names is None else names, variant)

    def test_current_manifest_policy(self):
        self.assertEqual(self.audit(self.manifest())['issues'], [])

    def test_android_service_flag_renderings(self):
        for value in ['dataSync', '1', '0x1', '0x00000001']:
            root = self.manifest()
            root.find('application/service').set(POLICY.ANDROID + 'foregroundServiceType', value)
            self.assertEqual(self.audit(root)['issues'], [], value)
        for value in ['0', '0x3', 'dataSync|location', None]:
            self.assertFalse(POLICY.data_sync_type(value))

    def test_extra_permission_and_exported_component(self):
        root = self.manifest()
        ET.SubElement(root, 'uses-permission', {POLICY.ANDROID + 'name': 'android.permission.READ_SMS'})
        ET.SubElement(root.find('application'), 'receiver', {POLICY.ANDROID + 'name': '.Unknown', POLICY.ANDROID + 'exported': 'true'})
        self.assertEqual(len(self.audit(root)['issues']), 2)

    def test_debuggable_release_and_cleartext_fail(self):
        root = self.manifest()
        root.find('application').set(POLICY.ANDROID + 'debuggable', 'true')
        self.assertTrue(self.audit(root)['issues'])
        self.assertEqual(self.audit(root, variant='debug')['issues'], [])
        root.find('application').set(POLICY.ANDROID + 'usesCleartextTraffic', 'true')
        self.assertTrue(self.audit(root, variant='debug')['issues'])

    def test_extra_assets_private_key_and_native_binary_fail(self):
        names = list(POLICY.ASSETS) + ['assets/remote.html', 'release.jks', 'lib/arm64-v8a/unknown.so']
        issues = self.audit(self.manifest(), names)['issues']
        self.assertEqual(len(issues), 3)

    def test_duplicate_entries_and_missing_service_fail(self):
        root = self.manifest()
        root.find('application').remove(root.find('application/service'))
        names = list(POLICY.ASSETS) + ['assets/pro/index.html']
        self.assertEqual(len(self.audit(root, names)['issues']), 2)


if __name__ == '__main__':
    unittest.main()
