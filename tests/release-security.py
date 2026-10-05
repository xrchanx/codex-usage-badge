"""Runnable release privacy and archive trust boundary checks (stdlib only)."""
from pathlib import Path
import hashlib
import importlib.util
import json
import stat
import tempfile
import zipfile

spec = importlib.util.spec_from_file_location('audit_release', Path(__file__).resolve().parents[1] / 'scripts/audit_release.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def rejects(fn):
    try:
        fn()
    except (SystemExit, KeyError, ValueError):
        return
    raise AssertionError('Unsafe fixture was accepted')


secrets = [b'sk-' + b'A'*40, b'ghp_' + b'A'*40, b'github_pat_' + b'A'*40,
           b'Bearer ' + b'A'*32, b'eyJ' + b'A'*16 + b'.' + b'B'*16 + b'.' + b'C'*16,
           b'-----BEGIN ' + b'PRIVATE KEY-----', b'-----BEGIN ENCRYPTED ' + b'PRIVATE KEY-----',
           b'{"access_' + b'token":"' + b'A'*30+b'"}', b'{"refresh_' + b'token":"'+b'A'*30+b'"}',
           b'C:\\' + b'Users\\Person\\file', b'C:/' + b'Users/Person/file', b'/Users/' + b'Person/file']
for data in secrets:
    rejects(lambda: audit.inspect('fixture.txt', data))
for name in ['auth.json','.env.local','cookies','tokens.sqlite3','runtime.json','screenshots/a.png','logs/a.txt','state.db-wal']:
    rejects(lambda: audit.inspect(name, b'fixture'))
audit.inspect('src/safe.cjs', b'const value = JSON.stringify(data);')

with tempfile.TemporaryDirectory(prefix='badge-release-test-') as temp:
    archive = Path(temp)/'CodexUsageBadge-Windows-1.2.3.zip'
    prefix = archive.stem+'/'
    files = {name:b'fixture' for name in audit.common_files | audit.platform_files['Windows'] if name != 'SHA256SUMS.txt'}
    files['assets/cover.png'] = (audit.root/'assets/cover.png').read_bytes()
    for name in files:
        if name.endswith('.ps1'): files[name] = b'\xef\xbb\xbf'+files[name]
    files['update.json'] = json.dumps({'schema':1,'repository':'xrchanx/codex-usage-badge','platform':'Windows','version':'1.2.3'}).encode()

    def write(payload, special=None, duplicate=False, wrong_hash=False):
        sums = ''.join(hashlib.sha256(data).hexdigest()+'  '+name+'\n' for name,data in sorted(payload.items())).encode()
        if wrong_hash: sums = b'0'*64+sums[64:]
        with zipfile.ZipFile(archive,'w') as z:
            for name,data in {**payload,'SHA256SUMS.txt':sums}.items():
                info = zipfile.ZipInfo(prefix+name)
                info.create_system = 3
                info.external_attr = (stat.S_IFLNK | 0o777 if name == special else stat.S_IFREG | 0o644)<<16
                z.writestr(info,data)
            if duplicate: z.writestr(prefix+'AGENT.CJS',b'fixture')
    write(files)
    audit.audit_archive(archive)
    write({**files,'extra.cjs':b'fixture'})
    rejects(lambda: audit.audit_archive(archive))
    write({**files,'../escape':b'fixture'})
    rejects(lambda: audit.audit_archive(archive))
    write(files,special='agent.cjs')
    rejects(lambda: audit.audit_archive(archive))
    write(files,duplicate=True)
    rejects(lambda: audit.audit_archive(archive))
    other = dict(files)
    other['update.json'] = other['update.json'].replace(b'xrchanx',b'untrusted')
    write(other)
    rejects(lambda: audit.audit_archive(archive))
    write(files,wrong_hash=True)
    rejects(lambda: audit.audit_archive(archive))
print('PASS release security: secrets, private artifacts, allowlist, paths, symlink, collisions, metadata and checksums')

