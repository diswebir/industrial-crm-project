<?php
/**
 * ═════════════════════════════════════════════════════════════════════
 *  🏭 Industrial CRM — نصب‌کننده تحت وب برای هاست cPanel (بدون SSH)
 *
 *  این فایل توسط build به داخل public/ اضافه می‌شود.
 *  بعد از نصب موفق تلاش می‌کند خودش را حذف کند؛ اگر حذف نشد دستی پاک کنید.
 *
 *  مرحله ۱ (GET)  : بررسی پیش‌نیازها + فرم اطلاعات دیتابیس
 *  مرحله ۲ (POST) : تست اتصال → نوشتن .env → migrate → ساخت مدیر
 * ═════════════════════════════════════════════════════════════════════
 */
declare(strict_types=1);

header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex');
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
/* ─────────── Helper functions ─────────── */

function e(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

function envValue(?string $file, string $key): ?string
{
    if (!$file || !is_file($file)) return null;
    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (preg_match('/^\s*' . preg_quote($key, '/') . '\s*=\s*(.*)$/', $line, $m)) {
            $v = trim($m[1]);
            if (preg_match('/^(["\'])(.*)\1$/', $v, $q)) {
                $v = $q[2];
                if ($q[1] === '"') {
                    $v = strtr($v, ['\\\\' => '\\', '\\"' => '"', '\\$' => '$']);
                }
            }
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
        if ($pdo->query("SHOW TABLES LIKE 'users'")->fetchColumn() === false) {
            return ['state' => 'db-empty', 'db' => $db];
        }
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
    // Native PSR interfaces can shadow Composer's psr/log and fatally break Monolog 3.
    // Keep this check before vendor/autoload.php: loading Monolog to test it is already too late.
    $nativePsr = extension_loaded('psr') || interface_exists('PsrExt\\Log\\LoggerInterface', false)
        || interface_exists('Psr\\Log\\LoggerInterface', false);
    $checks[] = ['غیرفعال بودن افزونه بومی psr/PsrExt (تداخل با Monolog)', !$nativePsr,
        $nativePsr ? 'در Select PHP Version افزونه psr را غیرفعال کنید؛ اگر در فهرست نیست از پشتیبانی هاست بخواهید برای همین دامنه غیرفعالش کند.' : 'بدون تداخل'];
    foreach (['pdo_mysql', 'mbstring', 'openssl', 'fileinfo', 'curl', 'tokenizer', 'xml', 'dom', 'xmlreader', 'xmlwriter', 'zip', 'gd', 'intl', 'ctype', 'iconv', 'simplexml'] as $ext) {
        $checks[] = ['افزونه PHP: ' . $ext, extension_loaded($ext), extension_loaded($ext) ? 'فعال' : 'غیرفعال — از Select PHP Version فعال کنید'];
    }
    $checks[] = ['قابل نوشتن: پوشه عمومی آپلود', is_dir(__DIR__.'/storage') && is_writable(__DIR__.'/storage'), __DIR__.'/storage'];
    $checks[] = ['وجود vendor (برنامه کامل)', is_file($baseDir . '/vendor/autoload.php') && is_file($baseDir . '/vendor/composer/platform_check.php'), is_file($baseDir . '/vendor/autoload.php') ? 'ok' : 'vendor یافت نشد'];
    foreach (['storage', 'storage/framework', 'storage/framework/sessions', 'storage/framework/cache', 'storage/framework/cache/data', 'storage/framework/views', 'storage/logs', 'bootstrap/cache'] as $dir) {
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


/** Report failures independently of Laravel's exception handler/logger. */
function installerFailure(Throwable $error): void
{
    global $installerStage, $installerErrorShown, $baseDir, $installerBufferLevel;
    if ($installerErrorShown) return;
    $installerErrorShown = true;
    $reference = date('Ymd-His').'-'.substr(hash('sha256', uniqid('', true)), 0, 8);
    $detail = get_class($error).': '.$error->getMessage().' in '.$error->getFile().':'.$error->getLine();
    // Do not put credentials in the diagnostic log, even in dotenv/SQL errors.
    foreach (['db_pass', 'admin_password'] as $key) {
        $secret = (string) ($_POST[$key] ?? '');
        if ($secret !== '') {
            $quoted = str_replace(['\\', '"', '$'], ['\\\\', '\\"', '\\$'], $secret);
            $detail = str_replace([$quoted, $secret], '[REDACTED]', $detail);
        }
    }
    if (isset($GLOBALS['appKey']) && is_string($GLOBALS['appKey'])) {
        $detail = str_replace($GLOBALS['appKey'], '[REDACTED]', $detail);
    }
    $line = json_encode(['time' => date(DATE_ATOM), 'reference' => $reference,
        'stage' => $installerStage, 'error' => $detail], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE)."\n";
    $logged = false;
    if (is_string($baseDir) && is_dir($baseDir.'/storage/logs')) {
        $logPath = $baseDir.'/storage/logs/installer.log';
        // Set restrictive permissions before writing any diagnostic data.
        $handle = @fopen($logPath, 'ab');
        if ($handle) {
            @chmod($logPath, 0600);
            if (flock($handle, LOCK_EX)) {
                $logged = fwrite($handle, $line) !== false;
                flock($handle, LOCK_UN);
            }
            fclose($handle);
        }
    }
    if (!$logged && function_exists('error_log')) @error_log('[CRM installer] '.$line);
    while (ob_get_level() > $installerBufferLevel) @ob_end_clean();
    http_response_code(500);
    header('Content-Type: text/html; charset=utf-8');
    $hints = [
        'session' => 'فضای session و تنظیمات PHP هاست را بررسی کنید.',
        'autoload' => 'PHP دامنه باید حداقل 8.4.1 باشد و پوشه vendor کامل از همان بسته آپلود شده باشد.',
        'bootstrap' => 'فایل .env، افزونه‌های PHP، محدودیت open_basedir و دسترسی bootstrap/cache و storage را بررسی کنید.',
        'migrations' => 'مجوزهای کاربر دیتابیس و خطای مایگریشن ثبت‌شده در لاگ را بررسی کنید.',
        'administrator' => 'ساخت مدیر کامل نشده است؛ لاگ نصب را بررسی کنید. جدول‌ها را حذف نکنید.',
        'finalize' => 'نوشتن قفل نصب یا تنظیمات نهایی ممکن نشد؛ دسترسی storage و فایل .env را بررسی کنید.',
    ];
    echo page('نصب کامل نشد', '<div class="warn"><b>نصب در این مرحله متوقف شد: '.e($installerStage).'</b>'
        .'<p>'.e($hints[$installerStage] ?? 'خطای نصب در لاگ خصوصی ثبت شده است.').'</p>'
        .'<p>کد پیگیری: <code>'.e($reference).'</code></p></div>'
        .'<div class="note">جزئیات را در <code>storage/logs/installer.log</code> در مسیر خصوصی بخوانید.'
        .(!$logged ? ' اگر فایل لاگ قابل نوشتن نبود، بخش Errors در cPanel را بررسی کنید.' : '')
        .'<p>پس از اصلاح مشکل، صفحه نصب را دوباره باز کنید. دیتابیس، جدول‌ها و APP_KEY را حذف نکنید و APP_DEBUG را روشن نکنید.</p></div>');
}

$installerStage = 'session';
$installerErrorShown = false;
$baseDir = null;
$installerBufferLevel = ob_get_level();
ob_start();
if (function_exists('ini_set')) @ini_set('display_errors', '0');
// Reserve enough memory to show a useful response on an out-of-memory fatal error.
$installerReserve = str_repeat('x', 65536);
register_shutdown_function(function () {
    global $installerReserve, $installerErrorShown;
    $installerReserve = null;
    $last = error_get_last();
    if (!$installerErrorShown && $last && in_array($last['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR, E_RECOVERABLE_ERROR], true)) {
        installerFailure(new ErrorException($last['message'], 0, $last['type'], $last['file'], $last['line']));
    }
});

try {

if (function_exists('ini_set')) ini_set('session.use_strict_mode', '1');
session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict', 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off']);
if (!session_start()) { throw new RuntimeException('PHP session could not be started.'); }
$_SESSION['install_csrf'] ??= bin2hex(random_bytes(32));

$baseDir = require __DIR__ . '/resolve-private.php';
$envPath = $baseDir . '/.env';
if (is_file($baseDir.'/storage/installed.lock')) {
    http_response_code(403);
    exit('Installation is locked. Remove install.php from the public directory.');
}



/* ─────────── Guard: already installed? ─────────── */

$state = installedState($envPath);

if ($state['state'] === 'installed' && envValue($envPath, 'CPANEL_INSTALL_PENDING') !== 'true') {
    echo page('نصب شده', '<div class="warn">⚠️ این برنامه <b>قبلاً نصب شده</b> و دیتابیس آن آماده است.'
        . '<p>اگر می‌خواهید نسخه جدیدی نصب کنید، اول از دیتابیس فعلی بکاپ بگیرید.</p>'
        . '<p style="color:#dc2626"><b>برای امنیت، همین حالا فایل <code>install.php</code> را از پوشه public حذف کنید.</b></p></div>');
    exit;
}

/* ─────────── Step 2: process form ─────────── */

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!hash_equals($_SESSION['install_csrf'], (string) ($_POST['csrf'] ?? ''))) {
        http_response_code(419);
        exit('Invalid session. Reload installer.');
    }
    session_write_close();
    if (function_exists('set_time_limit')) @set_time_limit(180);
    foreach (checkEnvironment($baseDir) as [$label, $ok]) {
        if (!$ok) { http_response_code(422); exit(e($label)); }
    }
    // Hold an exclusive process lock through the entire installation.
    $installerStage = 'installation-lock';
    $installMutex = fopen($baseDir.'/storage/install.mutex', 'c');
    if (!$installMutex || !flock($installMutex, LOCK_EX | LOCK_NB)) {
        http_response_code(409); exit('Installation already running.');
    }
    if (is_file($baseDir.'/storage/installed.lock')) { http_response_code(403); exit('Installed.'); }
    $adminEmail = trim((string) ($_POST['admin_email'] ?? ''));
    $adminPhone = trim((string) ($_POST['admin_phone'] ?? ''));
    $adminPassword = (string) ($_POST['admin_password'] ?? '');

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
    if (!filter_var($adminEmail, FILTER_VALIDATE_EMAIL)) $errors[] = 'ایمیل مدیر معتبر نیست.';
    if (!preg_match('/^09[0-9]{9}$/', $adminPhone)) $errors[] = 'شماره مدیر باید ۱۱ رقم و با 09 شروع شود.';
    if (strlen($adminPassword) < 12) $errors[] = 'رمز مدیر باید حداقل ۱۲ کاراکتر باشد.';
    if (!ctype_digit($c['port']) || (int) $c['port'] < 1 || (int) $c['port'] > 65535) $errors[] = 'پورت نامعتبر است.';
    if (preg_match('/[;\r\n]/', $c['host'].$c['database'])) $errors[] = 'مشخصات دیتابیس نامعتبر است.';
    foreach (array_merge(array_values($c), [$appUrl]) as $value) {
        if (preg_match('/[\r\n\x00]/', $value)) $errors[] = 'کاراکتر کنترلی مجاز نیست.';
    }

    if ($c['database'] === '') $errors[] = 'نام دیتابیس الزامی است.';
    if ($c['username'] === '') $errors[] = 'نام کاربری دیتابیس الزامی است.';
    if (!filter_var($appUrl, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $appUrl) || (parse_url($appUrl, PHP_URL_PATH) ?: '/') !== '/') $errors[] = 'آدرس سایت باید با http:// یا https:// شروع شود.';

    if (!$errors) {
        try {
            $pdo = dbConnect($c);
            $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
            if ($tables && envValue($envPath, 'CPANEL_INSTALL_PENDING') !== 'true') {
                throw new RuntimeException('برای نصب جدید یک دیتابیس خالی انتخاب کنید.');
            }
        } catch (Throwable $e) {
            $errors[] = 'اتصال به دیتابیس ناموفق بود: ' . $e->getMessage();
        }
    }

    if ($errors) {
        echo page('خطا', '<div class="warn"><b>خطاها:</b><ul><li>' . implode('</li><li>', array_map('e', $errors)) . '</li></ul>'
            . '<a href="javascript:history.back()">← بازگشت و اصلاح</a></div>');
        exit;
    }

    $installerStage = 'environment';
    // Preserve the key on retries. Quote values without dotenv interpolation.
    $appKey = envValue($envPath, 'APP_KEY') ?: 'base64:' . base64_encode(random_bytes(32));
    $rawConfig = ['APP_URL' => $appUrl, 'APP_PUBLIC_PATH' => __DIR__];
    foreach (['host', 'port', 'database', 'username', 'password'] as $key) {
        $rawConfig['DB_'.strtoupper($key)] = $c[$key];
    }

    $env = <<<ENV
APP_NAME="Parts CRM"
APP_ENV=production
CPANEL_INSTALL_PENDING=true
APP_DEBUG=false
APP_KEY={$appKey}
APP_TIMEZONE=Asia/Tehran
APP_URL=

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
DB_HOST=
DB_PORT=
DB_DATABASE=
DB_USERNAME=
DB_PASSWORD=

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
MELIPAYAMAK_SANDBOX=false
ENV;

    foreach ($rawConfig as $key => $value) {
        $encoded = '"'.str_replace(['\\', '"', '$'], ['\\\\', '\\"', '\\$'], $value).'"';
        if (preg_match('/^'.preg_quote($key, '/').'=/m', $env)) {
            $env = preg_replace_callback('/^'.preg_quote($key, '/').'=.*$/m', fn () => $key.'='.$encoded, $env);
        } else { $env .= "\n".$key.'='.$encoded; }
    }
    $temporaryEnv = $envPath.'.installing';
    if (!@file_put_contents($temporaryEnv, $env, LOCK_EX) || !@chmod($temporaryEnv, 0640) || !@rename($temporaryEnv, $envPath)) {
        echo page('خطا', '<div class="warn">نوشتن فایل .env در ریشه برنامه ممکن نشد. دسترسی پوشه را بررسی کنید (755/775).</div>');
        exit;
    }
    @chmod($envPath, 0640);

    // Ensure runtime dirs exist
    foreach (['storage/framework/sessions', 'storage/framework/cache/data', 'storage/framework/views', 'storage/logs'] as $dir) {
        @mkdir($baseDir . '/' . $dir, 0755, true);
    }

    // Bootstrap Laravel AFTER .env is written so it sees the new config
    // Discard environment-specific caches from a previous deployment before boot.
    foreach (['config.php', 'events.php'] as $cache) @unlink($baseDir.'/bootstrap/cache/'.$cache);
    foreach (glob($baseDir.'/bootstrap/cache/routes*.php') ?: [] as $cache) @unlink($cache);
    $installerStage = 'autoload';
    require $baseDir . '/vendor/autoload.php';
    $installerStage = 'bootstrap';
    $app = require $baseDir . '/bootstrap/app.php';
    $kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
    $kernel->bootstrap();

    $migrateOut = '';
    $installerStage = 'migrations';
    if (Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]) !== 0) {
        throw new RuntimeException(Illuminate\Support\Facades\Artisan::output());
    }
    $migrateOut = Illuminate\Support\Facades\Artisan::output();
    $installerStage = 'administrator';
    // No demonstration customers or known-password account in production.
    Illuminate\Support\Facades\DB::transaction(function () use ($adminEmail, $adminPhone, $adminPassword) {
        $admin = App\Models\User::where('email', 'admin@crm.local')->first()
            ?? App\Models\User::where('email', $adminEmail)->where('user_type', 'administrator')->firstOrFail();
        $admin->fill(['email' => $adminEmail, 'phone' => $adminPhone,
            'password' => Illuminate\Support\Facades\Hash::make($adminPassword),
            'user_type' => 'administrator', 'is_active' => true])->save();
        $admin->syncPermissions(Spatie\Permission\Models\Permission::all());
    });
    $installerStage = 'finalize';
    // Keep pending=true until the durable lock exists, allowing a safe retry after failure.
    if (file_put_contents($baseDir.'/storage/installed.lock', date(DATE_ATOM), LOCK_EX) === false) {
        throw new RuntimeException('Could not write installation lock.');
    }
    $completedEnv = str_replace('CPANEL_INSTALL_PENDING=true', 'CPANEL_INSTALL_PENDING=false', $env);
    if (file_put_contents($envPath.'.installing', $completedEnv, LOCK_EX) === false
        || !chmod($envPath.'.installing', 0640) || !rename($envPath.'.installing', $envPath)) {
        @unlink($baseDir.'/storage/installed.lock');
        throw new RuntimeException('Could not finalize environment.');
    }

    @unlink(__DIR__.'/setup-check.php');
    $selfDeleted = @unlink(__FILE__);

    echo page('نصب کامل شد ✅',
        '<div class="note">🎉 تبریک! برنامه با موفقیت نصب شد.</div>'
        . '<p><b>مراحل انجام‌شده:</b></p><pre>migrate:\n' . e(trim($migrateOut)) . '</pre>'
        . '<p><b>اطلاعات ورود مدیر سیستم:</b></p>'
        . '<p>از ایمیل و رمز انتخاب‌شده در ویزارد استفاده کنید.</p>'
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
    . '<div class="note">مرحله ۱: بررسی محیط ← مرحله ۲: مشخصات اتصال و مدیر ← مرحله ۳: نصب و قفل خودکار<br>مسیر خصوصی: <code>'.e($baseDir).'</code><br>مسیر عمومی: <code>'.e(__DIR__).'</code></div>'
    . '<form method="post"><input type="hidden" name="csrf" value="'.e($_SESSION['install_csrf']).'">'
    . '<label>ایمیل مدیر</label><input type="email" name="admin_email" required>'
    . '<label>موبایل مدیر</label><input name="admin_phone" pattern="09[0-9]{9}" required>'
    . '<label>رمز مدیر (حداقل ۱۲ کاراکتر)</label><input type="password" name="admin_password" minlength="12" autocomplete="new-password" required>'
    . '<label>آدرس کامل سایت (APP_URL)</label><input name="app_url" value="' . e($guessUrl) . '" placeholder="https://crm.yoursite.ir">'
    . '<label> host دیتابیس</label><input name="db_host" value="' . e($prefill['host']) . '">'
    . '<label>پورت دیتابیس</label><input name="db_port" value="' . e($prefill['port']) . '">'
    . '<label>نام دیتابیس (مثلاً youruser_crmdb)</label><input name="db_name" value="' . e($prefill['database']) . '" placeholder="youruser_crmdb">'
    . '<label>نام کاربری دیتابیس</label><input name="db_user" value="' . e($prefill['username']) . '" placeholder="youruser_crmuser">'
    . '<label>رمز عبور دیتابیس</label><input type="password" name="db_pass" placeholder="••••••••">'
    . '<button type="submit"' . ($allOk ? '' : ' disabled') . '>🚀 شروع نصب (ساخت جداول + داده اولیه)</button>'
    . '</form>'
    . '<div class="note">💡 قبل از این فرم، در cPanel با <b>MySQL Database Wizard</b> یک دیتابیس خالی و کاربر آن را ساخته باش. این نصب‌کننده خودش جدول‌ها را می‌سازد — دیگر نیازی به Import فایل SQL از phpMyAdmin نیست.</div>');

} catch (Throwable $error) {
    installerFailure($error);
}
