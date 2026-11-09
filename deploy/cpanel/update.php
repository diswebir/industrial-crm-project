<?php
/**
 * ═════════════════════════════════════════════════════════════════════
 *  🔄 Industrial CRM — به‌روزرسانی دیتابیس بدون SSH (اجرای مایگریشن‌ها)
 *
 *  این فایل توسط build به داخل public/ اضافه می‌شود.
 *
 *  استفاده: بعد از جایگزینی فایل‌های برنامه با نسخه جدید، این آدرس را باز کن:
 *     https://دامنه/update.php (POST form only)
 *
 *  امنیت: فقط با داشتن APP_KEY (که فقط در فایل .env سرور توست) اجرا می‌شود.
 *  بعد از اجرای موفق، خودش را حذف می‌کند.
 * ═════════════════════════════════════════════════════════════════════
 */
declare(strict_types=1);

header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex');
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');

$baseDir = require __DIR__ . '/resolve-private.php';
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
$provided = isset($_POST['key']) ? trim((string) $_POST['key']) : '';

if ($provided === '' ) {
    echo page('کلید لازم است', '<div class="note">ابتدا از دیتابیس بکاپ بگیرید. کلید APP_KEY را فقط در فرم زیر وارد کنید، نه در URL.</div>'
        . '<form method="post"><input type="password" name="key" required autocomplete="off"><button>اجرای مایگریشن‌ها</button></form>');
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
    if (Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]) !== 0) {
        throw new RuntimeException(Illuminate\Support\Facades\Artisan::output());
    }
    $out = Illuminate\Support\Facades\Artisan::output();
} catch (Throwable $e) {
    echo page('خطا', '❌ اجرای مایگریشن خطا داد:<pre>' . e($e->getMessage()) . '</pre>');
    exit;
}

/* ─── پاک‌سازی کش‌ها ───
 * از نسخه ۲٫۰٫۰ فایل‌های پیکربندی جدید (config/acl.php و config/crm.php) و
 * مجوزهای جدید ACL اضافه شده‌اند. اگر کش پیکربندی یا کش مجوزها (Spatie)
 * پاک نشود، تغییرات جدید اعمال نمی‌شوند.
 */
$cacheLog = [];
foreach (['config:clear', 'route:clear', 'view:clear', 'cache:clear'] as $command) {
    try {
        $code = Illuminate\Support\Facades\Artisan::call($command);
        $cacheLog[] = $command . ' → ' . ($code === 0 ? 'OK' : 'EXIT ' . $code);
    } catch (Throwable $e) {
        $cacheLog[] = $command . ' → SKIPPED (' . $e->getMessage() . ')';
    }
}

try {
    if (class_exists(\Spatie\Permission\PermissionRegistrar::class)) {
        app(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();
        $cacheLog[] = 'permission cache reset → OK';
    }
} catch (Throwable $e) {
    $cacheLog[] = 'permission cache reset → SKIPPED (' . $e->getMessage() . ')';
}

/* ─── بازسازی کش پیکربندی و مسیرها (اختیاری، فقط در صورت موفقیت) ─── */
foreach (['config:cache', 'route:cache'] as $command) {
    try {
        $code = Illuminate\Support\Facades\Artisan::call($command);
        $cacheLog[] = $command . ' → ' . ($code === 0 ? 'OK' : 'EXIT ' . $code . ' (بدون کش هم کار می‌کند)');
    } catch (Throwable $e) {
        $cacheLog[] = $command . ' → SKIPPED (' . $e->getMessage() . ')';
    }
}

/* ─── خلاصه وضعیت نسخه و ساختار دیتابیس پس از ارتقا ─── */
$summary = [];
try {
    $summary['نسخه برنامه'] = (string) config('crm.version_name', config('crm.version', 'نامشخص'));
    $checks = [
        'customers.created_by_user_id' => ['customers', 'created_by_user_id'],
        'users.customers_scope'        => ['users', 'customers_scope'],
        'parts.stock_quantity'         => ['parts', 'stock_quantity'],
        'customer_parts.quantity'      => ['customer_parts', 'quantity'],
        'customer_parts.invoice_amount' => ['customer_parts', 'invoice_amount'],
    ];
    foreach ($checks as $label => [$table, $column]) {
        $summary[$label] = Illuminate\Support\Facades\Schema::hasColumn($table, $column) ? 'OK' : 'MISSING';
    }
    foreach (['inventory_logs', 'user_staff_access', 'user_customer_access'] as $table) {
        $summary['table ' . $table] = Illuminate\Support\Facades\Schema::hasTable($table) ? 'OK' : 'MISSING';
    }
    $summary['مجوز inventory.manage'] = Illuminate\Support\Facades\DB::table('permissions')
        ->where('name', 'inventory.manage')->where('guard_name', 'web')->exists() ? 'OK' : 'MISSING';
    $summary['مجوز inventory.logs'] = Illuminate\Support\Facades\DB::table('permissions')
        ->where('name', 'inventory.logs')->where('guard_name', 'web')->exists() ? 'OK' : 'MISSING';
    $summary['تعداد مشتریان (بدون تغییر)'] = (string) Illuminate\Support\Facades\DB::table('customers')->count();
    $summary['تعداد دستگاه‌ها (بدون تغییر)'] = (string) Illuminate\Support\Facades\DB::table('parts')->count();
    $summary['تعداد تخصیص‌ها (بدون تغییر)'] = (string) Illuminate\Support\Facades\DB::table('customer_parts')->count();
} catch (Throwable $e) {
    $summary['بررسی ساختار'] = 'SKIPPED (' . $e->getMessage() . ')';
}

$summaryHtml = '';
foreach ($summary as $label => $value) {
    $color = $value === 'OK' ? '#16a34a' : (str_contains((string) $value, 'MISSING') ? '#dc2626' : '#0f172a');
    $summaryHtml .= '<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px dashed #e5e7eb;font-size:13px">'
        . '<span>' . e((string) $label) . '</span><b style="color:' . $color . '">' . e((string) $value) . '</b></div>';
}

$selfDeleted = @unlink(__FILE__);

echo page('بروزرسانی انجام شد ✅',
    '<pre>' . e($out) . '</pre>'
    . '<p class="ok">✅ دیتابیس برنامه با موفقیت به‌روزرسانی شد.</p>'
    . '<div class="note"><b>وضعیت کش‌ها:</b><pre>' . e(implode("\n", $cacheLog)) . '</pre></div>'
    . '<div class="note"><b>راستی‌آزمایی ساختار پایگاه داده پس از ارتقا:</b>' . $summaryHtml . '</div>'
    . '<div class="note">💡 گام بعدی: در پنل سامانه به «کاتالوگ دستگاه‌ها ← انبار» بروید و برای هر دستگاه'
    . ' «ورود کالا» ثبت کنید تا موجودی واقعی انبار مقداردهی شود (موجودی اولیه همه دستگاه‌ها صفر است).</div>'
    . '<div class="note">فایل update.php ' . ($selfDeleted ? 'خودکار حذف شد ✓' : 'خودکار حذف نشد — لطفاً دستی از پوشه public حذفش کن') . '.</div>'
    . '<p><a href="' . e((string) envValue($envPath, 'APP_URL')) . '">← بازگشت به برنامه</a></p>');
