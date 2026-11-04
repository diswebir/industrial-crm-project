<?php
/**
 * ═════════════════════════════════════════════════════════════════════
 *  🔄 Industrial CRM — به‌روزرسانی دیتابیس بدون SSH (اجرای مایگریشن‌ها)
 *
 *  این فایل توسط build به داخل public/ اضافه می‌شود.
 *
 *  استفاده: بعد از جایگزینی فایل‌های برنامه با نسخه جدید، این آدرس را باز کن:
 *     https://دامنه/update.php?key=مقدار-APP_KEY-از-فایل-env
 *
 *  امنیت: فقط با داشتن APP_KEY (که فقط در فایل .env سرور توست) اجرا می‌شود.
 *  بعد از اجرای موفق، خودش را حذف می‌کند.
 * ═════════════════════════════════════════════════════════════════════
 */
declare(strict_types=1);

header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex');

$publicDir = __DIR__;

/* Resolve the private app root: app-path.txt pointer → APP_BASE_PATH env → parent of public/ */
function crm_resolve_app_base(string $publicDir): string
{
    $pointer = $publicDir . '/app-path.txt';
    if (is_file($pointer)) {
        $p = rtrim(trim((string) file_get_contents($pointer)), '/');
        if ($p !== '' && is_dir($p)) return $p;
    }
    $env = getenv('APP_BASE_PATH');
    if ($env && is_dir($env)) return rtrim($env, '/');
    return dirname($publicDir);
}

$baseDir = crm_resolve_app_base($publicDir);
$envPath = $baseDir . '/.env';

function e(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

function envValue(string $file, string $key): ?string
{
    if (!is_file($file)) return null;
    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (preg_match('/^\s*' . preg_quote($key, '/') . '\s*=\s*(.*)$/', $line, $m)) {
            $v = trim($m[1]);
            if (preg_match('/^(["\'])(.*)\1$/', $v, $q)) $v = $q[2];
            return $v;
        }
    }
    return null;
}

function page(string $title, string $body): string
{
    return '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1"><title>' . e($title) . '</title>'
        . '<style>body{font-family:Tahoma,Vazirmatn,sans-serif;background:#f3f4f6;margin:0;padding:32px}'
        . '.card{max-width:720px;margin:auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden}'
        . '.hd{background:#111827;color:#fff;padding:16px 20px}.hd small{opacity:.7;display:block;margin-top:4px}'
        . '.bd{padding:20px}pre{background:#0f172a;color:#a5f3fc;padding:12px;border-radius:9px;overflow:auto;direction:ltr;text-align:left;font-size:12px;white-space:pre-wrap}'
        . '.note{background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px 14px;font-size:13px;margin:14px 0}'
        . '.ok{color:#16a34a;font-weight:bold}button{background:#2563eb;color:#fff;border:0;padding:11px 26px;border-radius:10px;font-size:15px;font-weight:bold;cursor:pointer;font-family:inherit}'
        . 'input{width:100%;padding:9px 11px;border:1px solid #d1d5db;border-radius:9px;box-sizing:border-box;direction:ltr;text-align:left;font-family:monospace}</style>'
        . '</head><body><div class="card"><div class="hd"><b>🔄 به‌روزرسانی دیتابیس Industrial CRM</b><small>اجرای مایگریشن‌های جدید — بدون SSH</small></div><div class="bd">' . $body . '</div></div></body></html>';
}

/* ─── لود Laravel ─── */
if (!is_file($baseDir . '/vendor/autoload.php')) {
    http_response_code(500);
    echo page('خطا', 'پوشه vendor یافت نشد — برنامه کامل آپلود نشده است.');
    exit;
}
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

$appKey = (string) envValue($envPath, 'APP_KEY');

if ($appKey === '' || $appKey === 'base64:') {
    echo page('نصب نشده', '<div class="note">برنامه هنوز نصب نشده است. اول <code>install.php</code> را اجرا کنید.</div>');
    exit;
}

/* ─── اعتبارسنجی کلید (APP_KEY از فایل .env) ─── */
$provided = isset($_REQUEST['key']) ? str_replace(' ', '+', trim((string) $_REQUEST['key'])) : '';

if ($provided === '' ) {
    echo page('کلید لازم است',
        '<div class="note">برای اجرا، مقدار <b>APP_KEY</b> را از فایل <code>.env</code> (قابل مشاهده از File Manager با Show Hidden Files) کپی کن و به انتهای آدرس اضافه کن:<br><br>'
        . '<code>https://دامنه/update.php?key=APP_KEY</code></div>');
    exit;
}
if (!hash_equals($appKey, $provided)) {
    http_response_code(403);
    echo page('کلید نامعتبر', '❌ کلید واردشده با APP_KEY سرور مطابقت ندارد.');
    exit;
}

/* ─── GET: وضعیت مایگریشن‌ها + دکمه اجرا ─── */
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Illuminate\Support\Facades\Artisan::call('migrate:status');
    $status = Illuminate\Support\Facades\Artisan::output();
    echo page('وضعیت مایگریشن‌ها',
        '<div class="note">وضعیت فعلی جدول‌های دیتابیس (Pending = مایگریشن‌هایی که اجرا نشده‌اند):</div>'
        . '<pre>' . e($status) . '</pre>'
        . '<form method="post"><input type="hidden" name="key" value="' . e($appKey) . '">'
        . '<button type="submit">▶ اجرای مایگریشن‌های اجرانشده (migrate --force)</button></form>'
        . '<div class="note">💡 قبل از اجرا از دیتابیس بکاپ بگیر (phpMyAdmin → Export).</div>');
    exit;
}

/* ─── POST: اجرای migrate ─── */
try {
    Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
    $out = Illuminate\Support\Facades\Artisan::output();
} catch (Throwable $e) {
    echo page('خطا', '❌ اجرای مایگریشن خطا داد:<pre>' . e($e->getMessage()) . '</pre>');
    exit;
}

$selfDeleted = @unlink(__FILE__);

echo page('بروزرسانی انجام شد ✅',
    '<pre>' . e($out) . '</pre>'
    . '<p class="ok">✅ دیتابیس برنامه با موفقیت به‌روزرسانی شد.</p>'
    . '<div class="note">فایل update.php ' . ($selfDeleted ? 'خودکار حذف شد ✓' : 'خودکار حذف نشد — لطفاً دستی از پوشه public حذفش کن') . '.</div>'
    . '<p><a href="' . e((string) envValue($envPath, 'APP_URL')) . '">← بازگشت به برنامه</a></p>');
