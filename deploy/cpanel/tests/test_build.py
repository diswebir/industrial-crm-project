"""Offline packaging regression tests. Dependency tools are doubles, NOT a Laravel runtime test.
Run: python3 -m unittest discover -s deploy/cpanel/tests -v
"""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import zipfile

DEPLOY = Path(__file__).resolve().parents[1]

PHP = r'''#!/usr/bin/env python3
import os, sys
if os.environ.get('TEST_BAD_PHP'):
    print('Current composer.lock requires PHP >= 8.4.1', file=sys.stderr); sys.exit(1)
if '-l' in sys.argv:
    sys.exit(1 if os.environ.get('TEST_BAD_LINT') else 0)
if 'echo PHP_VERSION;' in sys.argv:
    print('8.4.16', end='')
'''
COMPOSER = r'''#!/usr/bin/env python3
import os, pathlib, sys
if '--version' in sys.argv:
    print('Composer test double'); sys.exit(0)
if os.environ.get('TEST_FAIL_COMPOSER'):
    print('Simulated Composer failure', file=sys.stderr); sys.exit(9)
p = pathlib.Path(next(a.split('=',1)[1] for a in sys.argv if a.startswith('--working-dir=')))
assert 'production-secret' not in (p/'.env').read_text()
assert os.environ['APP_PUBLIC_PATH'] == str(p/'public')
if 'install' in sys.argv:
    for f in ['vendor/autoload.php','public/css/filament/test.css','public/js/filament/test.js','bootstrap/cache/packages.php','storage/logs/build.log']:
        out=p/f; out.parent.mkdir(parents=True, exist_ok=True); out.write_text('test double')
'''
NPM = r'''#!/usr/bin/env python3
import os, pathlib, sys
if os.environ.get('TEST_FAIL_NPM'): sys.exit(8)
if sys.argv[1:] == ['run','build']:
    p=pathlib.Path('dist'); (p/'assets').mkdir(parents=True)
    (p/'index.html').write_text('<html>test build</html>')
    (p/'assets/app.js').write_text('test build')
'''


class BuildTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='crm build tests ')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base/'source with spaces'
        self.root.mkdir()
        deploy = self.root/'deploy/cpanel'
        shutil.copytree(DEPLOY, deploy, ignore=shutil.ignore_patterns('tests', '__pycache__'))
        for name in ['app', 'bootstrap/cache', 'config', 'database', 'resources', 'routes', 'public', 'storage/logs']:
            (self.root/'backend'/name).mkdir(parents=True, exist_ok=True)
        for name in ['artisan', 'bootstrap/app.php', 'app/Test.php', 'composer.json', 'composer.lock']:
            (self.root/'backend'/name).write_text('{}')
        for name in ['index.php', 'private-path.php', 'resolve-private.php']:
            (self.root/'backend/public'/name).write_text('<?php // fixture')
        # فونت/استایل وزیرمتن FD بخشی از سورس است و باید در بسته عمومی قرار گیرد.
        (self.root/'backend/public/css').mkdir(parents=True)
        (self.root/'backend/public/css/vazirmatn.css').write_text('/* Vazirmatn FD fixture */')
        (self.root/'backend/public/fonts').mkdir(parents=True)
        (self.root/'backend/public/fonts/Vazirmatn-FD-Regular.woff2').write_text('font-fixture')
        for name in ['src', 'public']:
            (self.root/'frontend'/name).mkdir(parents=True)
        for name in ['index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'vite.config.ts', 'src/main.ts']:
            (self.root/'frontend'/name).write_text('{}')
        # Deliberately seed data that must NEVER enter release artifacts.
        for name in ['.env', '.env.backup', 'auth.json', 'storage/logs/private.log', 'database/database.sqlite', 'public/storage/customer.txt', 'vendor/old.txt', 'bootstrap/cache/config.php']:
            p = self.root/'backend'/name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text('production-secret')
        self.bin = self.base/'bin'
        self.bin.mkdir()
        for name, content in [('php', PHP), ('composer', COMPOSER), ('npm', NPM)]:
            p=self.bin/name; p.write_text(content); p.chmod(0o755)
        self.env = dict(os.environ, PATH=str(self.bin)+os.pathsep+os.environ['PATH'])
        self.env.pop('CPANEL_OUT_DIR', None)
        self.env['TMPDIR'] = str(self.base)
        self.out = self.root/'cpanel-release'

    def build(self, **env):
        return subprocess.run(['bash', str(self.root/'deploy/cpanel/build.sh')], cwd=self.root,
                              env=dict(self.env, **env), text=True, capture_output=True)

    def snapshot(self):
        return {str(p.relative_to(self.root)): hashlib.sha256(p.read_bytes()).hexdigest()
                for parent in ['backend', 'frontend'] for p in (self.root/parent).rglob('*') if p.is_file()}

    def assert_clean(self):
        self.assertFalse((self.out/'.build.lock').exists())
        self.assertFalse(list(self.base.glob('crm-build.*')))

    def test_success_and_source_unchanged(self):
        before=self.snapshot()
        result=self.build()
        self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
        self.assertEqual(before, self.snapshot())
        with zipfile.ZipFile(self.out/'cpanel-private.zip') as z:
            self.assertIn('vendor/autoload.php', z.namelist())
            self.assertNotIn('.env', z.namelist())
            self.assertNotIn('bootstrap/cache/packages.php', z.namelist())
            self.assertNotIn('database/database.sqlite', z.namelist())
        with zipfile.ZipFile(self.out/'cpanel-public.zip') as z:
            self.assertIn('index.html', z.namelist())
            self.assertNotIn('storage/customer.txt', z.namelist())
        check=subprocess.run(['sha256sum', '-c', 'SHA256SUMS'], cwd=self.out, capture_output=True)
        self.assertEqual(check.returncode, 0)
        self.assert_clean()

    def test_relative_output_path_with_spaces(self):
        result=self.build(CPANEL_OUT_DIR='output path/packages')
        self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
        self.assertTrue((self.root/'output path/packages/cpanel-public.zip').exists())

    def test_missing_env_is_not_created_in_source(self):
        (self.root/'backend/.env').unlink()
        result=self.build()
        self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
        self.assertFalse((self.root/'backend/.env').exists())

    def test_old_php_fails_before_touching_sources(self):
        before=self.snapshot()
        result=self.build(TEST_BAD_PHP='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('8.4.1', result.stderr)
        self.assertEqual(before, self.snapshot())
        self.assertFalse(self.out.exists())

    def test_failure_preserves_old_release_and_cleans_workspace(self):
        for variable in ['TEST_FAIL_COMPOSER', 'TEST_FAIL_NPM', 'TEST_BAD_LINT']:
            with self.subTest(variable=variable):
                self.out.mkdir(exist_ok=True)
                old={name: b'old-'+name.encode() for name in ['cpanel-public.zip', 'cpanel-private.zip', 'SHA256SUMS']}
                for name, contents in old.items(): (self.out/name).write_bytes(contents)
                before=self.snapshot()
                result=self.build(**{variable:'1'})
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('Build FAILED', result.stderr)
                for name, contents in old.items(): self.assertEqual((self.out/name).read_bytes(), contents)
                self.assertEqual(before, self.snapshot())
                self.assert_clean()

    def test_concurrent_build_does_not_remove_other_lock(self):
        (self.out/'.build.lock').mkdir(parents=True)
        result=self.build()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Another build', result.stderr)
        self.assertTrue((self.out/'.build.lock').exists())

    def test_missing_source_file_failure_cleans_workspace(self):
        (self.root/'frontend/package-lock.json').unlink()
        result=self.build()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Missing project file', result.stderr)
        self.assert_clean()

    def test_symlink_is_rejected(self):
        (self.root/'backend/app/leak').symlink_to(self.root/'backend/.env')
        result=self.build()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Symlinks', result.stderr)
        self.assert_clean()

    def test_verifier_rejects_secrets_and_zip_slip(self):
        result=self.build()
        self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
        archive=self.out/'cpanel-public.zip'
        original=archive.read_bytes()
        for name in ['.env', '../escape', '/absolute', 'storage/customer.txt', 'app/secret.php']:
            with self.subTest(name=name):
                archive.write_bytes(original)
                with zipfile.ZipFile(archive, 'a') as z: z.writestr(name, 'sensitive')
                result=subprocess.run(['bash', str(self.root/'deploy/cpanel/verify-package.sh'), str(self.out)], capture_output=True)
                self.assertNotEqual(result.returncode, 0)

    def test_verifier_rejects_truncated_archive(self):
        result=self.build()
        self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
        (self.out/'cpanel-private.zip').write_bytes(b'incomplete')
        result=subprocess.run(['bash', str(self.root/'deploy/cpanel/verify-package.sh'), str(self.out)], capture_output=True)
        self.assertNotEqual(result.returncode, 0)


if __name__ == '__main__':
    unittest.main()
