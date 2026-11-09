"""Real GET/POST installer tests against extracted ZIPs and a DISPOSABLE MySQL DB.
Opt in: CPANEL_INSTALLER_HTTP=1 INSTALLER_TEST_DATABASE=crm_installer_test ...
The named database is dropped/recreated. Never point this at a live database.
"""
import base64
import http.cookiejar
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request
import zipfile


@unittest.skipUnless(os.environ.get('CPANEL_INSTALLER_HTTP') == '1', 'Real HTTP installer tests require explicit opt-in and disposable MySQL')
class InstallerHttpTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.database = os.environ.get('INSTALLER_TEST_DATABASE', '')
        if not re.fullmatch(r'crm_installer_[a-z0-9_]*test', cls.database):
            raise RuntimeError('INSTALLER_TEST_DATABASE must start crm_installer_ and end test; it will be erased.')
        cls.release = Path(os.environ.get('INSTALLER_TEST_RELEASE', 'cpanel-release')).resolve()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='crm installer HTTP ')
        self.addCleanup(self.tmp.cleanup)
        self.work = Path(self.tmp.name)
        self.private, self.public = self.work/'private app', self.work/'public domain'
        for kind, folder in [('private', self.private), ('public', self.public)]:
            with zipfile.ZipFile(self.release/f'cpanel-{kind}.zip') as z:
                z.extractall(folder)
        (self.public/'private-path.php').write_text('<?php return '+json.dumps(str(self.private))+';')
        self.admin_password = 'Admin$pass# with"\\and\'quote123'
        self.env = dict(os.environ)
        # The HTTP worker must load the installer's own .env, not CI's testing config.
        for key in list(self.env):
            if key.startswith(('APP_', 'DB_', 'CACHE_', 'SESSION_', 'CPANEL_')):
                self.env.pop(key)
        self.env.update(TEST_DB_NAME=self.database,
                        TEST_DB_HOST=os.environ.get('DB_HOST', '127.0.0.1'),
                        TEST_DB_PORT=os.environ.get('DB_PORT', '3306'),
                        TEST_DB_USER=os.environ.get('DB_USERNAME', 'root'),
                        TEST_DB_PASS=os.environ.get('DB_PASSWORD', 'test_password'))
        self.php('''$pdo=new PDO('mysql:host='.getenv('TEST_DB_HOST').';port='.getenv('TEST_DB_PORT'),getenv('TEST_DB_USER'),getenv('TEST_DB_PASS'),[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$db=getenv('TEST_DB_NAME');$pdo->exec("DROP DATABASE IF EXISTS `$db`");$pdo->exec("CREATE DATABASE `$db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");''')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            self.port = sock.getsockname()[1]
        self.server_log = open(self.work/'php-server.log', 'wb')
        self.addCleanup(self.server_log.close)
        php_args = ['php', '-d', 'display_errors=0']
        if self._testMethodName == 'test_native_psr_is_blocked_before_autoload':
            # Emulate the host's preloaded native interface without installing an obsolete PECL binary.
            prepend = self.work/'native-psr.php'
            prepend.write_text('<?php namespace PsrExt\\Log; interface LoggerInterface { public function emergency($message, array $context = []); }')
            php_args += ['-d', 'auto_prepend_file='+str(prepend)]
        self.server = subprocess.Popen(php_args + ['-S', f'127.0.0.1:{self.port}', '-t', str(self.public)],
                                       env=self.env, stdout=self.server_log, stderr=subprocess.STDOUT)
        self.addCleanup(self.stop_server)
        self.url=f'http://127.0.0.1:{self.port}/install.php'
        self.client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        for _ in range(100):
            try:
                status, body=self.request()
                break
            except urllib.error.URLError:
                if self.server.poll() is not None:
                    self.fail((self.work/'php-server.log').read_text())
                time.sleep(.05)
        else:
            self.fail('PHP server did not start')
        self.assertEqual(status, 200, body)
        self.csrf=re.search(r'name="csrf" value="([a-f0-9]+)"', body).group(1)

    def stop_server(self):
        self.server.terminate()
        try:
            self.server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.server.kill()
            self.server.wait()

    def php(self, code):
        result=subprocess.run(['php', '-r', code], env=self.env, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
        return result.stdout

    def request(self, data=None):
        try:
            response=self.client.open(self.url, urllib.parse.urlencode(data).encode() if data is not None else None, timeout=60)
        except urllib.error.HTTPError as error:
            response=error
        with response:
            return response.code, response.read().decode('utf-8', errors='replace')

    def submit(self, **overrides):
        fields=dict(csrf=self.csrf, app_url=f'http://127.0.0.1:{self.port}', db_host=self.env['TEST_DB_HOST'],
                    db_port=self.env['TEST_DB_PORT'], db_name=self.database, db_user=self.env['TEST_DB_USER'],
                    db_pass=self.env['TEST_DB_PASS'], admin_email='owner@example.test', admin_phone='09123456789',
                    admin_password=self.admin_password)
        fields.update(overrides)
        return self.request(fields)

    def assert_success(self, status, body):
        logs=(self.private/'storage/logs/installer.log')
        self.assertEqual(status, 200, body+'\n'+(logs.read_text() if logs.exists() else ''))
        self.assertIn('برنامه با موفقیت نصب شد', body)
        self.assertTrue((self.private/'storage/installed.lock').is_file())
        self.assertFalse((self.public/'install.php').exists())
        self.assertIn('CPANEL_INSTALL_PENDING=false', (self.private/'.env').read_text())
        # Confirm the actual posted admin password survived parsing/hashing.
        self.env['TEST_PRIVATE']=str(self.private)
        self.env['TEST_PUBLIC']=str(self.public)
        self.env['TEST_ADMIN_PASSWORD']=self.admin_password
        self.php('''require getenv('TEST_PRIVATE').'/vendor/autoload.php';
$_SERVER['APP_PUBLIC_PATH']=getenv('TEST_PUBLIC');$app=require getenv('TEST_PRIVATE').'/bootstrap/app.php';
$app->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap();
$u=App\\Models\\User::where('email','owner@example.test')->firstOrFail();
if(!Illuminate\\Support\\Facades\\Hash::check(getenv('TEST_ADMIN_PASSWORD'),$u->password)){fwrite(STDERR,'ADMIN_PASSWORD_MISMATCH');exit(3);}
$expected=Spatie\\Permission\\Models\\Permission::where('guard_name','web')->count();
$actual=$u->getAllPermissions()->count();
if($expected<18){fwrite(STDERR,"PERMISSION_SEED_INCOMPLETE expected=$expected");exit(5);}
if($actual!==$expected){fwrite(STDERR,"ADMIN_PERMISSION_COUNT actual=$actual expected=$expected");exit(4);}''')

    def assert_diagnostic(self, status, body, stage):
        self.assertEqual(status, 500, body)
        self.assertIn('کد پیگیری', body)
        self.assertIn(stage, body)
        self.assertNotIn(self.admin_password, body)
        self.assertFalse((self.private/'storage/installed.lock').exists())
        log=(self.private/'storage/logs/installer.log').read_text()
        self.assertIn(stage, log)
        self.assertNotIn(self.admin_password, log)
        self.assertNotIn(self.env['TEST_DB_PASS'], log)
        self.assertEqual((self.private/'storage/logs/installer.log').stat().st_mode & 0o777, 0o600)

    def test_real_form_creates_admin_and_locks_installer(self):
        self.assert_success(*self.submit())
        # Re-uploading install.php cannot bypass the durable lock.
        with zipfile.ZipFile(self.release/'cpanel-public.zip') as z:
            (self.public/'install.php').write_bytes(z.read('install.php'))
        self.assertEqual(self.request()[0], 403)

    def test_bootstrap_exception_is_reported_and_retry_preserves_key(self):
        broken=self.private/'config/installer_failure.php'
        broken.write_text("<?php throw new RuntimeException(base64_decode('"+base64.b64encode(('Injected failure '+self.admin_password).encode()).decode()+"'));")
        self.assert_diagnostic(*self.submit(), 'bootstrap')
        key=re.search(r'^APP_KEY=(.*)$', (self.private/'.env').read_text(), re.M).group(1)
        broken.unlink()
        status, body=self.request()
        self.assertEqual(status, 200, body)
        self.assert_success(*self.submit())
        self.assertIn('APP_KEY='+key, (self.private/'.env').read_text())

    def test_migration_failure_is_reported_and_nonempty_database_can_resume(self):
        broken=self.private/'database/migrations/2099_01_01_000001_installer_failure.php'
        broken.write_text('<?php return new class extends Illuminate\\Database\\Migrations\\Migration { public function up():void { throw new RuntimeException("Injected migration failure"); } };')
        self.assert_diagnostic(*self.submit(), 'migrations')
        broken.unlink()
        self.assert_success(*self.submit())

    def test_fatal_autoloader_failure_is_reported(self):
        (self.private/'vendor/autoload.php').write_text('<?php trigger_error("Injected platform fatal", E_USER_ERROR);')
        self.assert_diagnostic(*self.submit(), 'autoload')

    def test_database_password_with_special_characters(self):
        # Exercise dotenv quoting and pre-bootstrap retry decoding with real MySQL auth.
        self.env['TEST_SPECIAL_PASSWORD'] = 'DB$pass# with"\\and\'quote123'
        self.php('''$pdo=new PDO('mysql:host='.getenv('TEST_DB_HOST').';port='.getenv('TEST_DB_PORT'),getenv('TEST_DB_USER'),getenv('TEST_DB_PASS'),[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$user="'crm_installer_http'@'%'";$password=$pdo->quote(getenv('TEST_SPECIAL_PASSWORD'));
$pdo->exec("CREATE USER IF NOT EXISTS $user IDENTIFIED BY $password");
$pdo->exec("ALTER USER $user IDENTIFIED BY $password");
$db=getenv('TEST_DB_NAME');$pdo->exec("GRANT ALL PRIVILEGES ON `$db`.* TO $user");''')
        self.env['TEST_DB_USER'] = 'crm_installer_http'
        self.env['TEST_DB_PASS'] = self.env['TEST_SPECIAL_PASSWORD']
        broken=self.private/'config/installer_failure.php'
        broken.write_text('<?php throw new RuntimeException("Temporary bootstrap failure");')
        self.assert_diagnostic(*self.submit(), 'bootstrap')
        broken.unlink()
        status, body=self.request()
        self.assertEqual(status, 200, body)
        # If envValue did not unescape the saved password, the GET would show a DB error.
        warnings = re.findall(r'<div class="warn">.*?</div>', body, re.S)
        self.assertFalse(any('اتصال دیتابیس خطا می‌دهد' in warning for warning in warnings), str(warnings))
        self.assert_success(*self.submit())

    def test_native_psr_is_blocked_before_autoload(self):
        status, body = self.request()
        self.assertEqual(status, 200, body)
        self.assertIn('psr/PsrExt', body)
        self.assertIn('افزونه psr را غیرفعال کنید', body)
        self.assertIn(' disabled', body)
        # Even a manually submitted form cannot bypass the check.
        status, body = self.submit()
        self.assertEqual(status, 422, body)
        self.assertIn('psr/PsrExt', body)
        self.assertFalse((self.private/'.env').exists())

    def test_invalid_csrf_does_not_write_environment(self):
        self.assertEqual(self.submit(csrf='wrong')[0], 419)
        self.assertFalse((self.private/'.env').exists())


if __name__ == '__main__':
    unittest.main()
