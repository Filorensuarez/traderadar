"""Query OSV with public Maven coordinates only; never send APK/source/signing data."""
import argparse
import json
import pathlib
import urllib.request


def coordinates(document):
    libraries = document.get('libraries')
    if not isinstance(libraries, list) or not libraries:
        raise ValueError('Resolved runtime dependency list is missing')
    result = []
    seen = set()
    for item in libraries:
        key = (item.get('group'), item.get('name'), item.get('version'))
        if not all(isinstance(x, str) and x and len(x) <= 200 for x in key):
            raise ValueError('Invalid Maven coordinate')
        if key not in seen:
            seen.add(key)
            result.append({'package': {'ecosystem': 'Maven', 'name': key[0] + ':' + key[1]}, 'version': key[2]})
    return result


def summarize(queries, response):
    results = response.get('results')
    if not isinstance(results, list) or len(results) != len(queries):
        raise ValueError('OSV response does not cover all queried dependencies')
    findings = []
    for query, result in zip(queries, results):
        if not isinstance(result, dict) or not isinstance(result.get('vulns', []), list):
            raise ValueError('OSV result schema is invalid')
        for vuln in result.get('vulns', []):
            if not isinstance(vuln.get('id'), str) or not vuln['id']:
                raise ValueError('OSV vulnerability identity missing')
            findings.append({'package': query['package']['name'], 'version': query['version'], 'id': vuln['id']})
    return findings


def audit(document):
    queries = coordinates(document)
    findings = []
    for start in range(0, len(queries), 100):
        batch = queries[start:start + 100]
        request = urllib.request.Request('https://api.osv.dev/v1/querybatch', data=json.dumps({'queries': batch}).encode(), headers={'Content-Type': 'application/json', 'User-Agent': 'TradeRadar-dependency-audit/1'})
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read(2 * 1024 * 1024 + 1)
            if len(raw) > 2 * 1024 * 1024:
                raise ValueError('OSV response too large')
            findings.extend(summarize(batch, json.loads(raw)))
    return {'status': 'complete', 'dependencies_checked': len(queries), 'findings': findings,
            'scope': 'Known vulnerabilities in resolved APK runtime Maven coordinates only; not malware/Play Protect, build-tool, OS, or device assurance'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--variant', choices=['debug', 'release'], required=True)
    args = parser.parse_args()
    try:
        report = audit(json.loads(pathlib.Path(args.input).read_text()))
    except Exception:
        report = {'status': 'unavailable', 'findings': [], 'error': 'Runtime vulnerability check could not complete; not a clean result'}
    pathlib.Path(args.output).write_text(json.dumps(report, indent=2) + '\n')
    complete = report['status'] == 'complete'
    count = len(report['findings'])
    print('::notice title=Android runtime dependency audit::' + (str(report['dependencies_checked']) + ' dependencies; ' + str(count) + ' known findings' if complete else 'UNAVAILABLE; no clean verdict'))
    for finding in report['findings']:
        safe = (finding['package'] + '@' + finding['version'] + ': ' + finding['id']).replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
        print('::warning title=Android dependency finding::' + safe)
    raise SystemExit(1 if args.variant == 'release' and (not complete or count) else 0)
