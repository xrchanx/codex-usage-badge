"""Fail publication on private artifacts, unsafe archives, or likely credentials."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import re
import stat
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
patterns = [
    re.compile(rb'/Users/[A-Za-z0-9_. -]+/'),
    re.compile(rb'/home/[A-Za-z0-9_.-]+/'),
    re.compile(rb'/var/folders/[A-Za-z0-9_/.-]+'),
    re.compile(rb'[A-Za-z]:[\\/]Users[\\/][^\\/\r\n]+[\\/]'),
    re.compile(rb'gh[pousr]_[A-Za-z0-9]{20,}'),
    re.compile(rb'github_pat_[A-Za-z0-9_]{20,}'),
    re.compile(rb'sk-[A-Za-z0-9_-]{24,}'),
    re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----'),
    re.compile(rb'(?i)Bearer\s+[A-Za-z0-9_.~+/-]{20,}'),
    re.compile(rb'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'),
    re.compile(rb'''(?i)["']?(?:access_token|refresh_token|id_token|api_key|api-key)["']?\s*[:=]\s*["'][A-Za-z0-9_./+~-]{16,}["']'''),
    re.compile(rb'(?i)Cookie\s*:\s*[A-Za-z0-9_.-]+=[A-Za-z0-9_.~+/-]{20,}'),
]
forbidden_parts = {'node_modules','vendor','backups','.devtools','__macosx','logs','sessions','screenshots'}
forbidden_suffixes = {'.png','.jpg','.jpeg','.webp','.gif','.sqlite','.sqlite3','.db','.log','.pem','.key','.p12','.pfx'}
forbidden_names = {'auth.json','config.json','worker.json','runtime.json','session.json','cdp.json','preferences.json','update-preferences.json','startup-receipt.json','cookies','cookies.json','cookies.sqlite','.ds_store','stop.request'}
approved_media = {'assets/cover.png': {'5639dcca0897c23304b63a3578a9f226984fe55cdbe51b62c381266b3d7ae9e6', 'a963d451cd700d8dbe8b7831ac30b9e813b23d5cd28144498192edf95ba93ce5'}}
common_files = {'agent.cjs','README.md','CHANGELOG.md','LICENSE','SECURITY.md','docs/windows.md','docs/macos.md','docs/development.md','assets/cover.png','runtime/state.cjs','updater/network.cjs','update.json','SHA256SUMS.txt'}
platform_files = {
    'Windows': {'manage-windows.ps1','bridge.cjs','update.cjs','update-windows.ps1','README-Windows.md','startup/controller.cjs','startup/windows.cjs','startup/windows-bridge.ps1','startup/windows-native.cs'} | {action+'.cmd' for action in ('Install','Launch','Status','Uninstall','Update','CheckUpdate','UpdatesOn','UpdatesOff')},
    'macOS': {'manage.cjs','scripts/mac-entry.sh','macos/shortcuts.cjs','macos/startup/bridge','macos/startup/controller.cjs','macos/startup/watch.cjs','updater/core.cjs','updater/worker.cjs','updater/run.sh'} | {action+'.command' for action in ('安装','诊断','卸载','检查更新','更新','关闭自动更新','开启自动更新')},
}


def inspect(name, data):
    p = PurePosixPath(name.replace('\\', '/'))
    approved = approved_media.get(p.as_posix())
    if approved and hashlib.sha256(data).hexdigest() not in approved:
        raise SystemExit('Media changed; visual/privacy review required: '+name)
    if forbidden_parts.intersection(part.lower() for part in p.parts) or (p.suffix.lower() in forbidden_suffixes and not approved) or p.name.lower() in forbidden_names or p.name.lower().startswith('.env') or p.name.lower().endswith(('-wal','-shm')):
        raise SystemExit('Forbidden artifact: '+name)
    if data.startswith(b'SQLite format 3\x00') or any(pattern.search(data) for pattern in patterns):
        raise SystemExit('Potential secret/personal path (content withheld): '+name)


def audit_archive(archive):
    with zipfile.ZipFile(archive) as z:
        infos = z.infolist()
        if Path(archive).stat().st_size > 16 * 1024 * 1024 or len(infos) > 256 or any(i.file_size > 8 * 1024 * 1024 for i in infos) or sum(i.file_size for i in infos) > 20 * 1024 * 1024:
            raise SystemExit('Archive expanded size limit exceeded')
        seen = set()
        for info in infos:
            name = info.filename
            p = PurePosixPath(name)
            mode = stat.S_IFMT(info.external_attr >> 16)
            if name.startswith('/') or '\\' in name or ':' in name or any(ord(c) < 32 or ord(c) == 127 for c in name) or name != name.rstrip(' .') or '..' in p.parts or '.' in name.split('/') or '' in name.split('/') or mode not in (0, stat.S_IFREG) or info.is_dir():
                raise SystemExit('Unsafe ZIP entry')
            if name.casefold() in seen:
                raise SystemExit('Duplicate/case-collision ZIP entry')
            seen.add(name.casefold())
        if z.testzip(): raise SystemExit('Corrupt archive: '+archive.name)
        sums = [n for n in z.namelist() if n.endswith('/SHA256SUMS.txt')]
        if len(sums) != 1: raise SystemExit('Missing checksum manifest: '+archive.name)
        prefix = sums[0].rsplit('/',1)[0]+'/'
        expected = set()
        for line in z.read(sums[0]).decode().splitlines():
            if not re.fullmatch(r'[0-9a-f]{64}  [^\r\n]+', line): raise SystemExit('Invalid checksum entry')
            digest, name = line.split('  ',1)
            if name in expected: raise SystemExit('Duplicate checksum entry')
            expected.add(name)
            if prefix+name not in z.namelist() or hashlib.sha256(z.read(prefix+name)).hexdigest() != digest: raise SystemExit('Hash mismatch: '+name)
        if set(z.namelist()) != {prefix+n for n in expected} | {sums[0]}: raise SystemExit('Unexpected archive file')
        manifest = json.loads(z.read(prefix+'update.json'))
        if manifest != {'schema':1,'repository':'xrchanx/codex-usage-badge','platform':manifest.get('platform'),'version':manifest.get('version')} or manifest['platform'] not in ('Windows','macOS') or not re.fullmatch(r'\d+\.\d+\.\d+',str(manifest['version'])):
            raise SystemExit('Invalid update manifest')
        if prefix != f"CodexUsageBadge-{manifest['platform']}-{manifest['version']}/" or archive.name != prefix[:-1]+'.zip':
            raise SystemExit('Archive metadata mismatch')
        if {n.removeprefix(prefix) for n in z.namelist()} != common_files | platform_files[manifest['platform']]:
            raise SystemExit('Release file allowlist/required files mismatch')
        for info in infos:
            data = z.read(info.filename)
            inspect(info.filename.removeprefix(prefix), data)
            if info.filename.endswith('.ps1') and not data.startswith(b'\xef\xbb\xbf'): raise SystemExit('Missing PowerShell BOM')


def main():
    tracked = subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0')
    count = 0
    for name in filter(None,tracked):
        source = root / name
        if source.is_symlink() or bool(getattr(source.lstat(), 'st_file_attributes', 0) & 0x400): raise SystemExit('Symlink/reparse source: '+name)
        inspect(name,source.read_bytes())
        count += 1
    if not count: raise SystemExit('No tracked files: stage the reviewed source before auditing')
    for archive in sorted((root/'dist').glob('*.zip')):
        audit_archive(archive)
        print('PASS archive privacy, paths, manifest and checksums:',archive.name)
    print(f'PASS source privacy scan: {count} tracked files')


if __name__ == '__main__':
    main()

