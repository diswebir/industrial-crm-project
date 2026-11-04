<?php
/**
 * ─────────────────────────────────────────────────────────────
 *  بررسی محیط سرور برای استقرار CRM روی cPanel
 *  این فایل را بعد از تکمیل استقرار حتماً حذف کنید!
 *  آدرس: https://دامنه-شما/setup-check.php
 * ─────────────────────────────────────────────────────────────
 */
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

$baseDir = crm_resolve_app_base($publicDir); // private Laravel root

$requiredExtensions = ['pdo_mysql', 'mbstring', 'openssl', 'fileinfo', 'curl', 'tokenizer', 'xml', 'ctype', 'json'];
$recommendedExtensions = ['gd', 'intl', 'zip', 'bcmath'];

$envPath = $baseDir . '/.env';
$envExists = is_file($envPath);

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

$db = [
    'host'     => envValue($envPath, 'DB_HOST') ?: '127.0.0.1',
    'port'     => envValue($envPath, 'DB_PORT') ?: '3306',
    'database' => envValue($envPath, 'DB_DATABASE') ?: '',
    'username' => envValue($envPath, 'DB_USERNAME') ?: '',
    'password' => (string) envValue($envPath, 'DB_PASSWORD'),
];

$dbStatus = '—';
$dbMessage = '';
if ($envExists && $db['database'] && $db['database'] !== 'cpuser_crmdb') {
    try {
        $pdo = new PDO(
            "mysql:host={$db['host']};port={$db['port']};dbname={$db['database']};charset=utf8mb4",
            $db['username'],
            $db['password'],
            [PDO::ATTR_TIMEOUT => 5, PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
        $count = $pdo->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = " . $pdo->quote($db['database']))->fetchColumn();
        $dbStatus = 'ok';
        $dbMessage = "اتصال موفق — تعداد جداول: {$count}";
    } catch (Throwable $e) {
        $dbStatus = 'fail';
        $dbMessage = $e->getMessage();
    }
} elseif ($envExists) {
    $dbStatus = 'warn';
    $dbMessage = 'هنوز مشخصات دیتابیس در .env تنظیم نشده است.';
}

function row(string $label, string $status, string $detail = ''): string
{
    $icon = $status === 'ok' ? '✅' : ($status === 'warn' ? '⚠️' : ($status === 'fail' ? '❌' : 'ℹ️'));
    $color = $status === 'ok' ? '#16a34a' : ($status === 'warn' ? '#d97706' : ($status === 'fail' ? '#dc2626' : '#6b7280'));
    return '<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">' . htmlspecialchars($label) . '</td>'
        . '<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:' . $color . ';white-space:nowrap">' . $icon . ' ' . htmlspecialchars($status) . '</td>'
        . '<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;direction:ltr;text-align:left;font-size:12px;color:#4b5563">' . htmlspecialchars($detail) . '</td></tr>';
}
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>بررسی محیط سرور — Industrial CRM</title>
</head>
<body style="font-family:Tahoma,Vazirmatn,sans-serif;background:#f3f4f6;margin:0;padding:32px">
<div style="max-width:780px;margin:auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
  <div style="background:#111827;color:#fff;padding:16px 20px">
    <b>🏭 بررسی محیط سرور برای استقرار CRM</b>
    <div style="font-size:12px;opacity:.7;margin-top:4px">پس از تکمیل استقرار، این فایل (setup-check.php) را از پوشه public حذف کنید.</div>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead>
      <tr style="background:#f9fafb;text-align:right">
        <th style="padding:10px 12px">بررسی</th><th style="padding:10px 12px">وضعیت</th><th style="padding:10px 12px">جزئیات</th>
      </tr>
    </thead>
    <tbody>
      <?php
      echo row('مسیر خصوصی برنامه (app base)', 'info', $baseDir);
      echo row('نسخه PHP (حداقل 8.2)', version_compare(PHP_VERSION, '8.2.0', '>=') ? 'ok' : 'fail', PHP_VERSION);
      foreach ($requiredExtensions as $ext) {
          echo row('افزونه PHP: ' . $ext, extension_loaded($ext) ? 'ok' : 'fail', extension_loaded($ext) ? 'loaded' : 'در MultiPHP Manager فعال کنید');
      }
      foreach ($recommendedExtensions as $ext) {
          echo row('افزونه پیشنهادی: ' . $ext, extension_loaded($ext) ? 'ok' : 'warn', extension_loaded($ext) ? 'loaded' : 'اختیاری — در صورت نبود، برخی قابلیت‌ها محدود می‌شود');
      }
      echo row('وجود فایل .env', $envExists ? 'ok' : 'fail', $envExists ? '.env' : 'فایل .env در ریشه برنامه یافت نشد');
      foreach (['storage', 'storage/app', 'storage/framework', 'storage/logs', 'bootstrap/cache'] as $dir) {
          $p = $baseDir . '/' . $dir;
          echo row('قابل نوشتن (private): ' . $dir, (is_dir($p) && is_writable($p)) ? 'ok' : 'fail', $p);
      }
      $pubStorage = $publicDir . '/storage';
      echo row('قابل نوشتن (web root): storage', (is_dir($pubStorage) && is_writable($pubStorage)) ? 'ok' : 'fail', $pubStorage);
      echo row('اتصال دیتابیس MySQL', $dbStatus, $dbMessage);
      echo row('APP_KEY', envValue($envPath, 'APP_KEY') ? 'ok' : 'fail', envValue($envPath, 'APP_KEY') ? 'تنظیم شده' : 'در .env تنظیم نشده');
      ?>
    </tbody>
  </table>
  <div style="padding:14px 20px;background:#f9fafb;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb">
    اگر همه موارد سبز هستند، برنامه آماده استفاده است. 🎉
  </div>
</div>
</body>
</html>
