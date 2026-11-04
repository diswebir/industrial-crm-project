<?php
/**
 * ═════════════════════════════════════════════════════════════════════
 *  🏭 Industrial CRM — نصب‌کننده تحت وب برای هاست cPanel (بدون SSH)
 *
 *  این فایل توسط build داخل public/ (web root) قرار می‌گیرد.
 *  بعد از نصب موفق، خودش را حذف می‌کند؛ اگر حذف نشد، دستی پاک کنید.
 *
 *  پشتیبانی از دو ساختار استقرار:
 *    • Split (پیشنهادی): فایل‌های public در web root (مثلاً ساب‌دامنه
 *      xx.example.com) و فایل‌های خصوصی در یک مسیر قابل تنظیم خارج از
 *      web root (مثلاً /home/USER/private_pro/project1/myc) — مسیر خصوصی
 *      در فایل app-path.txt کنار این فایل نوشته می‌شود.
 *    • Single-folder: کل برنامه داخل یک پوشه (public/ همان‌جا است).
 *
 *  مرحله ۱ (GET)  : بررسی پیش‌نیازها + فرم اطلاعات
 *  مرحله ۲ (POST) : تست اتصال → نوشتن app-path.txt و .env → migrate → seed
 * ═════════════════════════════════════════════════════════════════════
 */
declare(strict_types=1);

header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex');

$publicDir = __DIR__;

/* ─────────── Resolve the private application root ─────────── */

function crm_resolve_app_base(string $publicDir): array
{
    // 1) pointer file written by a previous install (app-path.txt next to index.php)
    $pointer = $publicDir . '/app-path.txt';
    if (is_file($pointer)) {
        $p = rtrim(trim((string) file_get_contents($pointer)), '/');
        if ($p !== '' && is_dir($p)) {
            return [$p, 'app-path.txt'];
        }
    }
    // 2) environment variable
    $env = getenv('APP_BASE_PATH');
    if ($env && is_dir($env)) {
        return [rtrim($env, '/'), 'APP_BASE_PATH env'];
    }
    // 3) standard single-folder layout: parent of public/
    return [dirname($publicDir), 'parent of public/'];
}

[$baseDir, $baseSource] = crm_resolve_app_base($publicDir);
$envPath = $baseDir . '/.env';
$isSplit = $baseDir !== dirname($publicDir);

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
    if (!$db['database']) {
        return ['state' => 'fresh', 'db' => $db];
    }
    try {
        $pdo = dbConnect($db);
        try {
            $users = $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
        } catch (Throwable $tableError) {
            // users table does not exist yet → treat as empty, not as an error
            return ['state' => 'db-empty', 'db' => $db];
        }
        if ((int) $users > 0) return ['state' => 'installed', 'db' => $db];
        return ['state' => 'db-empty', 'db' => $db]; // .env set but tables missing
    } catch (Throwable $e) {
        return ['state' => 'db-error', 'db' => $db, 'error' => $e->getMessage()];
    }
}

function checkEnvironment(string $baseDir, string $publicDir): array
{
    $checks = [];
    $checks[] = ['نسخه PHP (حداقل 8.2)', version_compare(PHP_VERSION, '8.2.0', '>='), PHP_VERSION];
    foreach (['pdo_mysql', 'mbstring', 'openssl', 'fileinfo', 'curl', 'tokenizer', 'xml'] as $ext) {
        $checks[] = ['افزونه PHP: ' . $ext, extension_loaded($ext), extension_loaded($ext) ? 'فعال' : 'غیرفعال — از Select PHP Version فعال کنید'];
    }
    $checks[] = ['وجود vendor (برنامه کامل)', is_file($baseDir . '/vendor/autoload.php'), is_file($baseDir . '/vendor/autoload.php') ? 'ok' : 'در مسیر خصوصی یافت نشد: ' . $baseDir . '/vendor'];
    $checks[] = ['وجود bootstrap/app.php', is_file($baseDir . '/bootstrap/app.php'), $baseDir . '/bootstrap/app.php'];
    foreach (['storage', 'storage/framework', 'storage/framework/sessions', 'storage/framework/cache', 'storage/framework/cache/data', 'storage/framework/views', 'storage/logs', 'bootstrap/cache'] as $dir) {
        $p = $baseDir . '/' . $dir;
        $checks[] = ['قابل نوشتن: ' . $dir, is_dir($p) && is_writable($p), $p];
    }
    $checks[] = ['قابل نوشتن: ریشه خصوصی (برای ساخت .env)', is_writable($baseDir), $baseDir];
    $checks[] = ['قابل نوشتن: web root (برای نوشتن app-path.txt)', is_writable($publicDir), $publicDir];
    $checks[] = ['قابل نوشتن: public/storage (آپلودها)', is_dir($publicDir . '/storage') ? is_writable($publicDir . '/storage') : false, $publicDir . '/storage'];
    return $checks;
}

function page(string $title, string $body): string
{
    return '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1"><title>' . e($title) . '</title>'
        . '<style>body{font-family:Tahoma,Vazirmatn,sans-serif;background:#f3f4f6;margin:0;padding:32px}'
        . '.card{max-width:780px;margin:auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden}'
        . '.hd{background:#111827;color:#fff;padding:16px 20px}.hd small{opacity:.7;display:block;margin-top:4px}'
        . '.steps{display:flex;gap:6px;padding:10px 20px;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-size:12px}'
        . '.step{padding:4px 12px;border-radius:999px;background:#e5e7eb;color:#374151;font-weight:bold}'
        . '.step.on{background:#2563eb;color:#fff}'
        . '.bd{padding:20px}table{width:100%;border-collapse:collapse;font-size:13px}'
        . 'td,th{padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right}'
        . '.ok{color:#16a34a}.bad{color:#dc2626;font-size:12px;direction:ltr;text-align:left}'
        . 'input{width:100%;padding:9px 11px;border:1px solid #d1d5db;border-radius:9px;box-sizing:border-box;direction:ltr;text-align:left;font-family:monospace}'
        . 'label{display:block;font-size:13px;font-weight:bold;margin:12px 0 5px}'
        . 'button{margin-top:18px;background:#2563eb;color:#fff;border:0;padding:11px 26px;border-radius:10px;font-size:15px;font-weight:bold;cursor:pointer;font-family:inherit}'
        . '.note{background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px 14px;font-size:13px;margin:14px 0}'
        . '.warn{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;font-size:13px;margin:14px 0}'
        . 'pre{background:#0f172a;color:#a5f3fc;padding:12px;border-radius:9px;overflow:auto;direction:ltr;text-align:left;font-size:12px}'
        . '</style></head><body><div class="card"><div class="hd"><b>🏭 نصب‌کننده Industrial CRM</b><small>استقرار روی هاست cPanel — بدون SSH</small></div>'
        . '<div class="steps"><span class="step on">۱ · بررسی محیط</span><span class="step">۲ · اطلاعات دیتابیس و مسیر</span><span class="step">۳ · نصب و راه‌اندازی</span></div>'
        . '<div class="bd">' . $body . '</div></div></body></html>';
}

/* ─────────── Guard: already installed? ─────────── */

$state = installedState($envPath);

if ($state['state'] === 'installed') {
    echo page('نصب شده', '<div class="warn">⚠️ این برنامه <b>قبلاً نصب شده</b> و دیتابیس آن آماده است.'
        . '<p>اگر می‌خواهید نسخه جدیدی نصب کنید، اول از دیتابیس فعلی بکاپ بگیرید.</p>'
        . '<p style="color:#dc2626"><b>برای امنیت، همین حالا فایل <code>install.php</code> را از web root حذف کنید.</b></p></div>');
    exit;
}

/* ─────────── Step 2: process form ─────────── */

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    // Private app path (split deployment) — from pointer, env, or the form field
    $privatePath = rtrim(trim((string) ($_POST['app_base_path'] ?? '')), '/');
    if ($privatePath === '') {
        [$privatePath] = crm_resolve_app_base($publicDir);
    }

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
    if ($privatePath === '' || !is_dir($privatePath)) {
        $errors[] = 'مسیر خصوصی برنامه معتبر نیست: ' . ($privatePath ?: '(خالی)');
    } elseif (!is_file($privatePath . '/vendor/autoload.php') || !is_file($privatePath . '/bootstrap/app.php')) {
        $errors[] = 'در مسیر خصوصی برنامه، vendor/autoload.php یا bootstrap/app.php یافت نشد. مطمئن شو cpanel-private.zip را درست استخراج کرده‌ای: ' . $privatePath;
    }
    if ($c['database'] === '') $errors[] = 'نام دیتابیس الزامی است.';
    if ($c['username'] === '') $errors[] = 'نام کاربری دیتابیس الزامی است.';
    if (!preg_match('#^https?://#i', $appUrl)) $errors[] = 'آدرس سایت باید با http:// یا https:// شروع شود.';

    if (!$errors) {
        try {
            $pdo = dbConnect($c);
        } catch (Throwable $e) {
            $errors[] = 'اتصال به دیتابیس ناموفق بود: ' . $e->getMessage();
        }
    }

    if ($errors) {
        echo page('خطا', '<div class="warn"><b>خطاها:</b><ul><li>' . implode('</li><li>', array_map('e', $errors)) . '</li></ul>'
            . '<a href="javascript:history.back()">← بازگشت و اصلاح</a></div>');
        exit;
    }

    $baseDir = $privatePath;
    $envPath = $baseDir . '/.env';

    // Persist the private-path pointer next to index.php (split deployment)
    $pointerWrote = false;
    if ($baseDir !== dirname($publicDir)) {
        $pointerWrote = @file_put_contents($publicDir . '/app-path.txt', $baseDir . "\n") !== false;
        if ($pointerWrote) @chmod($publicDir . '/app-path.txt', 0640);
    }

    // All good → write .env with a fresh APP_KEY
    $appKey = 'base64:' . base64_encode(random_bytes(32));
    $env = <<<ENV
APP_NAME="Parts CRM"
APP_ENV=production
APP_DEBUG=false
APP_KEY={$appKey}
APP_TIMEZONE=Asia/Tehran
APP_URL={$appUrl}

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
DB_HOST={$c['host']}
DB_PORT={$c['port']}
DB_DATABASE={$c['database']}
DB_USERNAME={$c['username']}
DB_PASSWORD={$c['password']}

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
        echo page('خطا', '<div class="warn">نوشتن فایل .env در مسیر خصوصی ممکن نشد: ' . e($envPath) . '<br>دسترسی پوشه را بررسی کنید (755/775).</div>');
        exit;
    }
    @chmod($envPath, 0640);

    // Ensure runtime dirs exist (private side + public side)
    foreach (['storage/framework/sessions', 'storage/framework/cache/data', 'storage/framework/views', 'storage/logs', 'bootstrap/cache'] as $dir) {
        @mkdir($baseDir . '/' . $dir, 0755, true);
    }
    @mkdir($publicDir . '/storage', 0755, true);

    // Bootstrap Laravel AFTER .env is written so it sees the new config
    putenv('APP_BASE_PATH=' . $baseDir);
    $_ENV['APP_BASE_PATH'] = $baseDir;
    $_SERVER['APP_BASE_PATH'] = $baseDir;
    putenv('APP_PUBLIC_PATH=' . $publicDir);
    $_ENV['APP_PUBLIC_PATH'] = $publicDir;
    $_SERVER['APP_PUBLIC_PATH'] = $publicDir;

    require $baseDir . '/vendor/autoload.php';
    $app = require $baseDir . '/bootstrap/app.php';
    $kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
    $kernel->bootstrap();

    $migrateOut = '';
    $seedOut = '';
    try {
        Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
        $migrateOut = Illuminate\Support\Facades\Artisan::output();
        Illuminate\Support\Facades\Artisan::call('db:seed', ['--force' => true]);
        $seedOut = Illuminate\Support\Facades\Artisan::output();
    } catch (Throwable $e) {
        echo page('خطای مایگریشن', '<div class="warn">دیتابیس متصل شد و .env نوشته شد، اما اجرای جداول خطا داد:</div>'
            . '<pre>' . e($e->getMessage()) . '</pre>'
            . '<div class="note">خطا را برطرف کنید و دوباره فرم را ارسال کنید (یا جداول را از phpMyAdmin حذف و تلاش کنید).</div>');
        exit;
    }

    $selfDeleted = @unlink(__FILE__);

    echo page('نصب کامل شد ✅',
        '<div class="note">🎉 تبریک! برنامه با موفقیت نصب شد.</div>'
        . '<p><b>مسیر خصوصی برنامه:</b> <code style="direction:ltr;display:inline-block">' . e($baseDir) . '</code>'
        . ($pointerWrote ? ' (در <code>app-path.txt</code> ثبت شد ✓)' : ($baseDir === dirname($publicDir) ? ' (ساختار تک‌پوشه‌ای — نیازی به اشاره‌گر نیست)' : ' ⚠️ نوشتن app-path.txt ناموفق بود؛ دستی بسازید')) . '</p>'
        . '<p><b>مراحل انجام‌شده:</b></p><pre>migrate:\n' . e(trim($migrateOut)) . '\n\nseed:\n' . e(trim($seedOut)) . '</pre>'
        . '<p><b>اطلاعات ورود مدیر سیستم:</b></p>'
        . '<pre>نام کاربری: admin@crm.local  (یا موبایل: 09120000000)\nرمز عبور:  Admin@123456</pre>'
        . '<div class="warn">⚠️ <b>الان سه کار فوری انجام بده:</b><ol>'
        . '<li>وارد برنامه شو و <b>رمز عبور ادمین را عوض کن</b></li>'
        . '<li>این فایل (' . ($selfDeleted ? 'که خودکار حذف شد ✓' : 'install.php — خودکار حذف نشد، دستی از web root حذف کن') . ') دیگر در دسترس نباشد</li>'
        . '<li>از cPanel بخش SSL/TLS یک گواهی رایگان AutoSSL فعال کن</li></ol></div>'
        . '<p style="text-align:center;margin-top:22px"><a href="' . e($appUrl) . '" style="background:#16a34a;color:#fff;text-decoration:none;padding:12px 34px;border-radius:10px;font-weight:bold">ورود به برنامه ←</a></p>');
    exit;
}

/* ─────────── Step 1: show requirements + form ─────────── */

$checks = checkEnvironment($baseDir, $publicDir);
$allOk = true;
$rows = '';
foreach ($checks as [$label, $ok, $detail]) {
    $allOk = $allOk && $ok;
    $rows .= '<tr><td>' . e($label) . '</td><td class="' . ($ok ? 'ok' : 'bad') . '">' . ($ok ? '✅' : '❌') . '</td>'
        . '<td class="det">' . e((string) $detail) . '</td></tr>';
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

$layoutNote = $isSplit
    ? '<div class="note">📂 <b>ساختار Split:</b> فایل‌های private در <code style="direction:ltr;display:inline-block">' . e($baseDir) . '</code> یافت شدند (' . e($baseSource) . ').</div>'
    : '<div class="note">📂 <b>ساختار تک‌پوشه‌ای شناسایی شد</b> (پوشه private همان والد public/ است). اگر فایل‌های private را خارج از web root قرار داده‌ای، مسیر آن را در فیلد زیر وارد کن؛ مثلاً <code style="direction:ltr">/home/youruser/private_pro/project1/myc</code></div>';

echo page('نصب Industrial CRM',
    ($allOk ? '' : '<div class="warn">⚠️ برخی پیش‌نیازها قرمز هستند — اول آن‌ها را از cPanel (MultiPHP Manager / Select PHP Version) فعال کنید.</div>')
    . '<table><tr><th>بررسی</th><th>وضعیت</th><th>جزئیات</th></tr>' . $rows . '</table>'
    . $dbNote
    . $layoutNote
    . '<form method="post">'
    . '<label>آدرس کامل سایت (APP_URL)</label><input name="app_url" value="' . e($guessUrl) . '" placeholder="https://xx.example.com">'
    . '<label>مسیر مطلق پوشه خصوصی برنامه (app-path) — خارج از web root</label><input name="app_base_path" value="' . e($baseDir) . '" placeholder="/home/youruser/private_pro/project1/myc">'
    . '<label>Host دیتابیس</label><input name="db_host" value="' . e($prefill['host']) . '">'
    . '<label>پورت دیتابیس</label><input name="db_port" value="' . e($prefill['port']) . '">'
    . '<label>نام دیتابیس (مثلاً youruser_crmdb)</label><input name="db_name" value="' . e($prefill['database']) . '" placeholder="youruser_crmdb">'
    . '<label>نام کاربری دیتابیس</label><input name="db_user" value="' . e($prefill['username']) . '" placeholder="youruser_crmuser">'
    . '<label>رمز عبور دیتابیس</label><input type="password" name="db_pass" placeholder="••••••••">'
    . '<button type="submit"' . ($allOk ? '' : ' disabled') . '>🚀 شروع نصب (نوشتن app-path.txt و .env + ساخت جداول + داده اولیه)</button>'
    . '</form>'
    . '<div class="note">💡 قبل از این فرم، در cPanel با <b>MySQL Database Wizard</b> یک دیتابیس خالی و کاربر آن را ساخته باش. این نصب‌کننده خودش جدول‌ها را می‌سازد — دیگر نیازی به Import فایل SQL از phpMyAdmin نیست.</div>');
