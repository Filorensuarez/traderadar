"""Audit decoded final manifest + actual APK asset surface; no malware verdict."""
import argparse
import json
import pathlib
import xml.etree.ElementTree as ET
import zipfile
import hashlib

ANDROID = '{http://schemas.android.com/apk/res/android}'
ALLOWED = {
    'android.permission.INTERNET', 'android.permission.POST_NOTIFICATIONS',
    'android.permission.FOREGROUND_SERVICE', 'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
    'android.permission.WAKE_LOCK',
}
ASSETS = {'assets/pro/' + name for name in ['index.html', 'app.js', 'style.css', 'config.js', 'android-transport.js']}


def inspect(manifest, names, variant):
    root = ET.fromstring(manifest)
    issues = []
    if root.get('package') != 'com.traderadar.pro':
        issues.append('Unexpected application ID')
    permissions = sorted({p.get(ANDROID + 'name') for tag in ['uses-permission', 'uses-permission-sdk-23'] for p in root.findall(tag)})
    if set(permissions) != ALLOWED:
        issues.append('Permissions differ from the reviewed functional allowlist')
    app = root.find('application')
    if app is None:
        raise ValueError('Application declaration missing')
    if app.get(ANDROID + 'allowBackup', 'true') != 'false' or app.get(ANDROID + 'usesCleartextTraffic', 'true') != 'false':
        issues.append('Backup or cleartext traffic is enabled')
    debuggable = app.get(ANDROID + 'debuggable', 'false') == 'true'
    if variant == 'release' and debuggable:
        issues.append('Release package is debuggable')
    seen = set()
    for tag in ['activity', 'activity-alias', 'service', 'receiver', 'provider']:
        for component in app.findall(tag):
            name = component.get(ANDROID + 'name', '')
            if tag == 'activity' and name in ['.ProActivity', 'com.traderadar.pro.ProActivity']:
                seen.add('launcher')
                if component.get(ANDROID + 'exported') != 'true':
                    issues.append('Launcher declaration is invalid')
            elif tag == 'service' and name in ['.ScanService', 'com.traderadar.pro.ScanService']:
                seen.add('scanner')
                if component.get(ANDROID + 'exported') != 'false' or component.get(ANDROID + 'foregroundServiceType') not in ['dataSync', '1', '0x00000001']:
                    issues.append('Scan service exposure/type differs from policy')
            else:
                issues.append('Unreviewed Android component: ' + name)
    if seen != {'launcher', 'scanner'}:
        issues.append('Required launcher or scan service missing')
    if {n for n in names if n.startswith('assets/') and not n.endswith('/')} != ASSETS:
        issues.append('APK contains missing or unreviewed assets')
    if len(names) != len(set(names)):
        issues.append('APK contains duplicate ZIP entries')
    if any(n.startswith('lib/') or n.endswith('.so') for n in names):
        issues.append('Unreviewed native binary library')
    if any(n.lower().endswith(('.jks', '.keystore', '.p12', '.pfx')) or pathlib.PurePosixPath(n).name in ['.env', 'id_rsa', 'id_ed25519'] for n in names):
        issues.append('Private signing or credential material found in package')
    return {'permissions': permissions, 'debuggable': debuggable, 'variant': variant, 'issues': issues,
            'scope': 'Packaging policy check, not malware scanning, Play Protect approval, or device validation'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--apk', required=True)
    parser.add_argument('--variant', choices=['debug', 'release'], required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    with zipfile.ZipFile(args.apk) as apk:
        names = apk.namelist()
        report = inspect(pathlib.Path(args.manifest).read_text(), names, args.variant)
        for asset in ASSETS:
            if asset not in names:
                continue
            source = pathlib.Path('pro/public') / pathlib.PurePosixPath(asset).name
            if hashlib.sha256(apk.read(asset)).digest() != hashlib.sha256(source.read_bytes()).digest():
                report['issues'].append('Packaged asset differs from reviewed source: ' + asset)
    pathlib.Path(args.output).write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    raise SystemExit(1 if report['issues'] else 0)
