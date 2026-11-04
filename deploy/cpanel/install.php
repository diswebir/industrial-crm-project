<?php
/**
 * ═════════════════════════════════════════════════════════════════════
 *  🏭 Industrial CRM — نصب‌کننده تحت وب برای هاست cPanel (بدون SSH)
 *
 *  این فایل توسط build به داخل public/ اضافه می‌شود.
 *  بعد از نصب موفق تلاش می‌کند خودش را حذف کند؛ اگر حذف نشد دستی پاک کنید.
 *
 *  مرحله ۱ (GET)  : بررسی پیش‌نیازها + فرم اطلاعات دیتابیس
 *  مرحله ۲ (POST) : تست اتصال → نوشتن .env → migrate → seed
 * ═════════════════════════════════════════════════════════════════════
 */
declare(strict_types=1);

header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex');

$baseDir = require __DIR__ . '/paths.php';
if (!is_string($baseDir) || !is_file($baseDir . '/vendor/autoload.php')) {
    http_response_code(500);
    exit('Application path is not configured.');
}
$envPath = $baseDir . '/.env';

/* ─────────── Helper functions ─────────── */

function e(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

function envValue(?string $file, string $key): ?string
{
    if (!$file || !is_file($file)) return null;
    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (preg_match('/^\s*' . preg_quote($key, '/') . '\s*=\s*(.*)$/', $line, $m)) {
            $v = trim($m[1]);
            if (preg_match('/^(["\'])(.*)\1$/', $v, $q)) $v = $q[2];
            return $v;
        }
    }
    return null;
}

function dbConnect(array $c): PDO
{
    return new PDO(
        "mysql:host={$c['host']};port={$c['port']};dbname={$c['database']};charset=utf8mb4",
        $c['username'],
        $c['password'],
        [PDO::ATTR_TIMEOUT => 8, PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
}

function installedState(string $envPath): array
{
    $db = [
        'host'     => envValue($envPath, 'DB_HOST') ?: '127.0.0.1',
        'port'     => envValue($envPath, 'DB_PORT') ?: '3306',
        'database' => envValue($envPath, 'DB_DATABASE') ?: '',
        'username' => envValue($envPath, 'DB_USERNAME') ?: '',
        'password' => (string) envValue($envPath, 'DB_PASSWORD'),
    ];
    if (!$db['database'] || $db['database'] === 'cpuser_crmdb') {
        return ['state' => 'fresh', 'db' => $db];
    }
    try {
        $pdo = dbConnect($db);
        $users = $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
        if ((int) $users > 0) return ['state' => 'installed', 'db' => $db];
        return ['state' => 'db-empty', 'db' => $db]; // .env set but tables missing
    } catch (Throwable $e) {
        return ['state' => 'db-error', 'db' => $db, 'error' => $e->getMessage()];
    }
}

function checkEnvironment(string $baseDir): array
{
    $checks = [];
    $checks[] = ['نسخه PHP (حداقل 8.4.1)', version_compare(PHP_VERSION, '8.4.1', '>='), PHP_VERSION];
    foreach (['pdo_mysql', 'mbstring', 'openssl', 'fileinfo', 'curl', 'tokenizer', 'xml', 'dom', 'xmlwriter', 'xmlreader', 'zip', 'gd', 'bcmath'] as $ext) {
        $checks[] = ['افزونه PHP: ' . $ext, extension_loaded($ext), extension_loaded($ext) ? 'فعال' : 'غیرفعال — از Select PHP Version فعال کنید'];
    }
    $checks[] = ['وجود vendor (برنامه کامل)', is_dir($baseDir . '/vendor'), is_dir($baseDir . '/vendor') ? 'ok' : 'vendor یافت نشد'];
    foreach (['storage', 'storage/framework', 'storage/framework/sessions', 'storage/framework/cache', 'storage/framework/views', 'storage/logs', 'bootstrap/cache'] as $dir) {
        $p = $baseDir . '/' . $dir;
        $checks[] = ['قابل نوشتن: ' . $dir, is_dir($p) && is_writable($p), $p];
    }
    $checks[] = ['قابل نوشتن: ریشه برنامه (برای ساخت .env)', is_writable($baseDir), $baseDir];
    return $checks;
}

function page(string $title, string $body): string
{
    return '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1"><title>' . e($title) . '</title>'
        . '<style>body{font-family:Tahoma,Vazirmatn,sans-serif;background:#f3f4f6;margin:0;padding:32px}'
        . '.card{max-width:760px;margin:auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden}'
        . '.hd{background:#111827;color:#fff;padding:16px 20px}.hd small{opacity:.7;display:block;margin-top:4px}'
        . '.bd{padding:20px}table{width:100%;border-collapse:collapse;font-size:13px}'
        . 'td,th{padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right}'
        . '.ok{color:#16a34a}.bad{color:#dc2626;font-size:12px;direction:ltr;text-align:left}'
        . 'input{width:100%;padding:9px 11px;border:1px solid #d1d5db;border-radius:9px;box-sizing:border-box;direction:ltr;text-align:left;font-family:monospace}'
        . 'label{display:block;font-size:13px;font-weight:bold;margin:12px 0 5px}'
        . 'button{margin-top:18px;background:#2563eb;color:#fff;border:0;padding:11px 26px;border-radius:10px;font-size:15px;font-weight:bold;cursor:pointer;font-family:inherit}'
        . '.note{background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px 14px;font-size:13px;margin:14px 0}'
        . '.warn{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;font-size:13px;margin:14px 0}'
        . 'pre{background:#0f172a;color:#a5f3fc;padding:12px;border-radius:9px;overflow:auto;direction:ltr;text-align:left;font-size:12px}'
        . '</style></head><body><div class="card"><div class="hd"><b>🏭 نصب‌کننده Industrial CRM</b><small>استقرار روی هاست cPanel — بدون SSH</small></div><div class="bd">'
        . $body . '</div></div></body></html>';
}

// A secret placed manually outside the web root enables the installer.
$tokenFile = $baseDir . '/.install-token';
$expected = is_file($tokenFile) ? trim((string) file_get_contents($tokenFile)) : '';
if (strlen($expected) < 32 || !preg_match('/^[a-f0-9]{32,128}$/i', $expected)) {
    http_response_code(403);
    exit('Installer is disabled. Create a random hexadecimal .install-token in the private directory.');
}
session_start();
if (isset($_POST['install_token']) && hash_equals($expected, (string) $_POST['install_token'])) {
    session_regenerate_id(true);
    $_SESSION['installer_authorized'] = hash('sha256', $expected);
    header('Location: install.php', true, 303);
    exit;
}
if (!hash_equals(hash('sha256', $expected), (string) ($_SESSION['installer_authorized'] ?? ''))) {
    echo page('ورود نصب‌کننده', '<form method="post"><label>کد نصب از فایل خصوصی .install-token</label><input type="password" name="install_token" required><button>ادامه</button></form>');
    exit;
}
if (is_file($envPath)) {
    http_response_code(403);
    exit('An .env file already exists. For a fresh installation remove it manually only after backing it up.');
}

/* ─────────── Guard: already installed? ─────────── */

$state = installedState($envPath);

if ($state['state'] === 'installed') {
    echo page('نصب شده', '<div class="warn">⚠️ این برنامه <b>قبلاً نصب شده</b> و دیتابیس آن آماده است.'
        . '<p>اگر می‌خواهید نسخه جدیدی نصب کنید، اول از دیتابیس فعلی بکاپ بگیرید.</p>'
        . '<p style="color:#dc2626"><b>برای امنیت، همین حالا فایل <code>install.php</code> را از پوشه public حذف کنید.</b></p></div>');
    exit;
}

/* ─────────── Step 2: process form ─────────── */

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $c = [
        'host'     => trim($_POST['db_host'] ?? '127.0.0.1'),
        'port'     => trim($_POST['db_port'] ?? '3306') ?: '3306',
        'database' => trim($_POST['db_name'] ?? ''),
        'username' => trim($_POST['db_user'] ?? ''),
        'password' => (string) ($_POST['db_pass'] ?? ''),
    ];
    $appUrl   = rtrim(trim($_POST['app_url'] ?? ''), '/');
    $appUrl   = $appUrl !== '' ? $appUrl : 'https://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');

    $errors = [];
    $adminPassword = (string) ($_POST['admin_password'] ?? '');
    if (strlen($adminPassword) < 12 || preg_match('/[\r\n]/', $adminPassword)) $errors[] = 'رمز مدیر باید حداقل ۱۲ نویسه و بدون خط جدید باشد.';
    foreach ([$c['host'], $c['port'], $c['database'], $c['username'], $c['password'], $appUrl] as $value) {
        if (preg_match('/[\r\n]/', $value)) $errors[] = 'مقادیر فرم نباید شامل خط جدید باشند.';
    }
    if (!preg_match('/^[a-zA-Z0-9_.:-]+$/', $c['host']) || !ctype_digit($c['port']) || (int)$c['port'] < 1 || (int)$c['port'] > 65535 || !preg_match('/^[a-zA-Z0-9_$-]+$/', $c['database'])) $errors[] = 'مشخصات اتصال دیتابیس نامعتبر است.';
    if (!filter_var($appUrl, FILTER_VALIDATE_URL)) $errors[] = 'آدرس سایت نامعتبر است.';
    if ($c['database'] === '') $errors[] = 'نام دیتابیس الزامی است.';
    if ($c['username'] === '') $errors[] = 'نام کاربری دیتابیس الزامی است.';
    if (!preg_match('#^https?://#i', $appUrl)) $errors[] = 'آدرس سایت باید با http:// یا https:// شروع شود.';

    if (!$errors) {
        try {
            $pdo = dbConnect($c);
            if ($pdo->query('SHOW TABLES')->fetchColumn() !== false) $errors[] = 'دیتابیس باید خالی باشد.';
        } catch (Throwable $e) {
            $errors[] = 'اتصال به دیتابیس ناموفق بود: ' . $e->getMessage();
        }
    }

    if ($errors) {
        echo page('خطا', '<div class="warn"><b>خطاها:</b><ul><li>' . implode('</li><li>', array_map('e', $errors)) . '</li></ul>'
            . '<a href="javascript:history.back()">← بازگشت و اصلاح</a></div>');
        exit;
    }

    // All good → write .env with a fresh APP_KEY
    $appKey = 'base64:' . base64_encode(random_bytes(32));
    // dotenv single quotes preserve special characters without interpolation.
    $quote = static fn(string $v): string => "'" . str_replace(['\\', "'"], ['\\\\', "\\'"], $v) . "'";
    $appUrlEnv = $quote($appUrl);
    $hostEnv = $quote($c['host']);
    $dbEnv = $quote($c['database']);
    $userEnv = $quote($c['username']);
    $passEnv = $quote($c['password']);
    $env = <<<ENV
APP_NAME="Parts CRM"
APP_ENV=production
APP_DEBUG=false
APP_KEY={$appKey}
APP_TIMEZONE=Asia/Tehran
APP_URL={$appUrlEnv}

APP_LOCALE=en
APP_FALLBACK_LOCALE=en
APP_FAKER_LOCALE=en_US

APP_MAINTENANCE_DRIVER=file

BCRYPT_ROUNDS=12

LOG_CHANNEL=stack
LOG_STACK=single
LOG_DEPRECATIONS_CHANNEL=null
LOG_LEVEL=error

DB_CONNECTION=mysql
DB_HOST={$hostEnv}
DB_PORT={$c['port']}
DB_DATABASE={$dbEnv}
DB_USERNAME={$userEnv}
DB_PASSWORD={$passEnv}

SESSION_DRIVER=file
SESSION_LIFETIME=120
SESSION_ENCRYPT=false
SESSION_PATH=/
SESSION_DOMAIN=null

BROADCAST_CONNECTION=log
FILESYSTEM_DISK=public
QUEUE_CONNECTION=sync

CACHE_STORE=file
CACHE_PREFIX=

MAIL_MAILER=log
MAIL_FROM_ADDRESS="hello@example.com"
MAIL_FROM_NAME="\${APP_NAME}"

MELIPAYAMAK_USERNAME=
MELIPAYAMAK_PASSWORD=
MELIPAYAMAK_FROM=
MELIPAYAMAK_SANDBOX=true
ENV;

    if (!@file_put_contents($envPath, $env)) {
        echo page('خطا', '<div class="warn">نوشتن فایل .env در ریشه برنامه ممکن نشد. دسترسی پوشه را بررسی کنید (755/775).</div>');
        exit;
    }
    @chmod($envPath, 0640);

    // Ensure runtime dirs exist
    foreach (['storage/framework/sessions', 'storage/framework/cache/data', 'storage/framework/views', 'storage/logs'] as $dir) {
        @mkdir($baseDir . '/' . $dir, 0755, true);
    }

    @mkdir(__DIR__ . '/storage', 0755, true);

    putenv('INITIAL_ADMIN_PASSWORD=' . $adminPassword);

    // Bootstrap Laravel AFTER .env is written so it sees the new config
    require $baseDir . '/vendor/autoload.php';
    $app = require $baseDir . '/bootstrap/app.php';
    $app->usePublicPath(__DIR__);
    $kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
    $kernel->bootstrap();

    $migrateOut = '';
    $seedOut = '';
    try {
        if (Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]) !== 0) throw new RuntimeException('Migration failed. Check the server log.');
        $migrateOut = Illuminate\Support\Facades\Artisan::output();

    } catch (Throwable $e) {
        echo page('خطای مایگریشن', '<div class="warn">دیتابیس متصل شد و .env نوشته شد، اما اجرای جداول خطا داد:</div>'
            . '<pre>' . e($e->getMessage()) . '</pre>'
            . '<div class="note">برای تلاش مجدد، پس از بررسی خطا و تهیه پشتیبان، .env خصوصی و جدول‌های نصب ناقص را دستی حذف کنید.</div>');
        exit;
    }

    putenv('INITIAL_ADMIN_PASSWORD');
    @unlink($tokenFile);
    $selfDeleted = @unlink(__FILE__);

    echo page('نصب کامل شد ✅',
        '<div class="note">🎉 تبریک! برنامه با موفقیت نصب شد.</div>'
        . '<p><b>مراحل انجام‌شده:</b></p><pre>migrate:\n' . e(trim($migrateOut)) . '</pre>'
        . '<p><b>اطلاعات ورود مدیر سیستم:</b></p>'
        . '<pre>نام کاربری: admin@crm.local  (یا موبایل: 09120000000)\nرمز عبور: رمزی که در فرم وارد کردید</pre>'
        . '<div class="warn">⚠️ <b>الان سه کار فوری انجام بده:</b><ol>'
        . '<li>وارد برنامه شو و <b>رمز عبور ادمین را عوض کن</b></li>'
        . '<li>این فایل (' . ($selfDeleted ? 'که خودکار حذف شد ✓' : 'install.php — خودکار حذف نشد، دستی از پوشه public حذف کن') . ') دیگر در دسترس نباشد</li>'
        . '<li>از cPanel بخش SSL/TLS یک گواهی رایگان AutoSSL فعال کن</li></ol></div>'
        . '<p style="text-align:center;margin-top:22px"><a href="' . e($appUrl) . '" style="background:#16a34a;color:#fff;text-decoration:none;padding:12px 34px;border-radius:10px;font-weight:bold">ورود به برنامه ←</a></p>');
    exit;
}

/* ─────────── Step 1: show requirements + form ─────────── */

$checks = checkEnvironment($baseDir);
$allOk = true;
$rows = '';
foreach ($checks as [$label, $ok, $detail]) {
    $allOk = $allOk && $ok;
    $rows .= '<tr><td>' . e($label) . '</td><td class="' . ($ok ? 'ok' : 'bad') . '">' . ($ok ? '✅' : '❌') . '</td>'
        . '<td class="bad">' . e((string) $detail) . '</td></tr>';
}

$dbNote = '';
if ($state['state'] === 'db-error') {
    $dbNote = '<div class="warn">⚠️ فایل .env موجود است ولی اتصال دیتابیس خطا می‌دهد: <span style="direction:ltr;display:inline-block">' . e($state['error'] ?? '') . '</span><br>فرم زیر را با اطلاعات درست پر کنید تا .env بازنویسی شود.</div>';
}
if ($state['state'] === 'db-empty') {
    $dbNote = '<div class="note">ℹ️ فایل .env موجود است ولی جدول‌ها ساخته نشده‌اند. با ارسال فرم زیر، جداول ساخته می‌شوند.</div>';
}

$prefill = $state['db'];
$guessUrl = 'https://' . ($_SERVER['HTTP_HOST'] ?? 'your-domain.ir');

echo page('نصب Industrial CRM',
    ($allOk ? '' : '<div class="warn">⚠️ برخی پیش‌نیازها قرمز هستند — اول آن‌ها را از cPanel (MultiPHP Manager / Select PHP Version) فعال کنید.</div>')
    . '<table><tr><th>بررسی</th><th>وضعیت</th><th>جزئیات</th></tr>' . $rows . '</table>'
    . $dbNote
    . '<form method="post">'
    . '<label>آدرس کامل سایت (APP_URL)</label><input name="app_url" value="' . e($guessUrl) . '" placeholder="https://crm.yoursite.ir">'
    . '<label> host دیتابیس</label><input name="db_host" value="' . e($prefill['host']) . '">'
    . '<label>پورت دیتابیس</label><input name="db_port" value="' . e($prefill['port']) . '">'
    . '<label>نام دیتابیس (مثلاً youruser_crmdb)</label><input name="db_name" value="' . e($prefill['database']) . '" placeholder="youruser_crmdb">'
    . '<label>نام کاربری دیتابیس</label><input name="db_user" value="' . e($prefill['username']) . '" placeholder="youruser_crmuser">'
    . '<label>رمز عبور دیتابیس</label><input type="password" name="db_pass" placeholder="••••••••">'
    . '<label>رمز مدیر (حداقل ۱۲ نویسه)</label><input type="password" name="admin_password" minlength="12" required>'
    . '<button type="submit"' . ($allOk ? '' : ' disabled') . '>🚀 شروع نصب (ساخت جداول + داده اولیه)</button>'
    . '</form>'
    . '<div class="note">💡 قبل از این فرم، در cPanel با <b>MySQL Database Wizard</b> یک دیتابیس خالی و کاربر آن را ساخته باش. این نصب‌کننده خودش جدول‌ها را می‌سازد — دیگر نیازی به Import فایل SQL از phpMyAdmin نیست.</div>');
