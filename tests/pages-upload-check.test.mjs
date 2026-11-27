import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const script = path.resolve(import.meta.dirname, '../.github/scripts/check-pages-upload.py');
test('uploaded Pages ZIP contains exactly the staged site bytes', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pages-upload-'));
  try {
    const site = path.join(root, 'site'), tar = path.join(root, 'artifact.tar'), zip = path.join(root, 'artifact.zip');
    mkdirSync(path.join(site, 'dev'), { recursive: true });
    writeFileSync(path.join(site, 'index.html'), 'production');
    writeFileSync(path.join(site, 'dev', 'index.html'), 'development');
    execFileSync('tar', ['--directory', site, '-cf', tar, '.']);
    execFileSync('python3', ['-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],"w"); z.write(sys.argv[2],"artifact.tar"); z.close()', zip, tar]);
    execFileSync('python3', [script, zip, site]);
    writeFileSync(path.join(site, 'dev', 'index.html'), 'tampered');
    assert.throws(() => execFileSync('python3', [script, zip, site], { stdio: 'pipe' }));
    writeFileSync(path.join(site, 'extra.txt'), 'not uploaded');
    assert.throws(() => execFileSync('python3', [script, zip, site], { stdio: 'pipe' }));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
