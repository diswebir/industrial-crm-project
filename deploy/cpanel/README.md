# نصب cPanel با مسیر عمومی و خصوصی مستقل

این بسته برای **Apache/LiteSpeed با mod_rewrite و AllowOverride** و PHP **8.4.1 یا بالاتر سازگار** طراحی شده است. MySQL 8 / MariaDB سازگار با Laravel لازم است. روی هاست Node، Composer، SSH، Redis یا symlink لازم نیست؛ ساخت بسته باید روی رایانه توسعه‌دهنده یا GitHub Actions انجام شود.

> **اصلاح پیش‌نیاز نسخه فعلی:** حداقل 8.2 مربوط به تعریف کلی پروژه است؛ `composer.lock` فعلی وابستگی‌هایی با نیاز **PHP >= 8.4.1** دارد. برای ساخت و اجرای همین lock از PHP 8.4 به‌روز روی ماشین ساخت و هاست استفاده کنید؛ `--ignore-platform-reqs` راه‌حل نیست.

## ساخت روی کامپیوتر ویندوزی

آموزش کامل نصب ابزارها در WSL، ساخت محلی دو ZIP، انتقال به ویندوز و آپلود مستقیم به هاست: [راهنمای ویندوز](WINDOWS-BUILD-GUIDE.fa.md).

## ۱. دریافت بسته

بسته‌ها **خودکار** توسط GitHub Actions ساخته و در Release منتشر می‌شوند: هر push به `main`
تگ چرخشی `latest-build` را تازه می‌کند و هر تگ `v*` یک Release نسخه‌دار با نشان **Latest**
می‌سازد. دریافت در پوشه `cpanel-release/`:

```bash
bash deploy/cpanel/download-release.sh              # جدیدترین بیلد main
bash deploy/cpanel/download-release.sh v2.0.1       # یک نسخه مشخص
```

```powershell
powershell -ExecutionPolicy Bypass -File deploy\cpanel\download-release.ps1
```

آدرس ثابت مرورگر (بدون ورود به Actions):
`https://github.com/diswebir/industrial-crm-project/releases/download/latest-build/cpanel-public.zip`
و همان مسیر برای `cpanel-private.zip`. توضیح کامل اتوماسیون، راستی‌آزمایی و عیب‌یابی:
[RELEASE-AUTOMATION.fa.md](RELEASE-AUTOMATION.fa.md). PRها فقط artifact می‌سازند
(`cpanel-package` در تب Actions) و هرگز Release منتشر نمی‌کنند.

اگر می‌خواهید بسته را خودتان بسازید، روی ماشین دارای PHP و افزونه‌های موردنیاز، Composer، Node 22.12+، npm و zip:

```bash
bash deploy/cpanel/build.sh
```

خروجی‌ها در `cpanel-release/`:
- `cpanel-public.zip`: فقط فایل‌های قابل انتشار در وب
- `cpanel-private.zip`: Laravel، vendor، تنظیمات، دیتابیس و فایل‌های خصوصی

ساخت جدید در پوشه موقت و مستقل انجام می‌شود و `.env`، vendor و node_modules سورس را تغییر نمی‌دهد. اطلاعات runtime و آپلودها کپی نمی‌شوند. قبل از ساخت، ابزارها، PHP 8.4.1+ و Node سازگار بررسی می‌شوند؛ در خطا خروجی ناقص جایگزین نسخه قبلی نمی‌شود.

کنترل خروجی:
```bash
bash deploy/cpanel/verify-package.sh cpanel-release
(cd cpanel-release && sha256sum -c SHA256SUMS)
```

آزمون بسته‌بندی بدون شبکه (با ابزارهای شبیه‌سازی‌شده):
```bash
python3 -m unittest discover -s deploy/cpanel/tests -v
```

آزمون واقعی Laravel روی بسته استخراج‌شده و SQLite موقت (نیازمند pdo_sqlite):
```bash
bash deploy/cpanel/tests/smoke-package.sh cpanel-release
```

`build-info.txt` نسخه ابزارها و hash فایل‌های lock را ثبت می‌کند. مسیر خروجی دلخواه، حتی نسبی و دارای فاصله:
```bash
CPANEL_OUT_DIR="./my output/packages" bash deploy/cpanel/build.sh
```

## ۲. مسیرها و استخراج

مثال برای نام کاربری cPanel برابر `alice`:

```text
/home/alice/xx.example.com/              ← محتویات cpanel-public.zip
    index.php, index.html, assets/, .htaccess,
    private-path.php, resolve-private.php, install.php, storage/ ...
/home/alice/private_pro/project1/myc/     ← محتویات cpanel-private.zip
    app/, bootstrap/, config/, database/, routes/, storage/, vendor/ ...
```

در cPanel → Domains، Document Root دامنه `xx.example.com` را روی `/home/alice/xx.example.com` بگذارید. پوشه خصوصی نباید Document Root هیچ دامنه‌ای یا زیرمجموعه پوشه عمومی باشد. `.htaccess` خصوصی نیز دسترسی وب را مسدود می‌کند، اما جای جداسازی واقعی مسیر را نمی‌گیرد.

در فایل عمومی `private-path.php`، **مسیر مطلق واقعی سرور** را بنویسید:

```php
<?php
return '/home/alice/private_pro/project1/myc';
```

مسیر `/private_pro/project1/myc` معمولاً منظور مسیر داخل home حساب است، نه ریشه سیستم‌عامل؛ مسیر واقعی را در File Manager بررسی کنید. مسیر خصوصی از ورودی درخواست وب خوانده نمی‌شود. برای جابه‌جایی بعدی همین فایل و مقدار `APP_PUBLIC_PATH` در `.env` را اصلاح کنید؛ کش config قبلی را حذف کنید.

فایل‌های مخفی را با Show Hidden Files نمایش دهید. پوشه‌ها معمولاً 755 و فایل‌ها 644؛ `storage/` و `bootstrap/cache/` خصوصی و `storage/` عمومی باید توسط PHP قابل نوشتن باشند. هرگز 777 ندهید. محدودیت `open_basedir` هاست باید هر دو مسیر را مجاز کند.

## ۳. ویزارد نصب

1. پیش از انتشار، SSL/AutoSSL را فعال کنید و از **Directory Privacy** یا محدودیت IP موقت برای حفاظت پوشه نصب استفاده کنید؛ نصب‌کننده عمومیِ راه‌اندازی‌نشده نباید در اختیار دیگران باشد.
2. در MySQL Database Wizard دیتابیس **خالی** و کاربر با ALL PRIVILEGES بسازید. نام‌ها معمولاً پیشوند نام حساب دارند.
3. در Select PHP Version افزونه‌های نمایش‌داده‌شده در ویزارد (از جمله pdo_mysql، mbstring، intl، gd، zip، XML و curl) را فعال کنید.
4. `https://xx.example.com/install.php` را باز کنید. پیش‌نیازها و مسیرها را بررسی کنید، آدرس ریشه دامنه، اتصال دیتابیس و ایمیل، موبایل و رمز اختصاصی مدیر (حداقل ۱۲ کاراکتر) را بدهید.
5. ویزارد `.env` و کلید اختصاصی، جداول و مدیر را می‌سازد. داده نمایشی وارد نمی‌شود. برای این روش رمز عمومی `Admin@123456` قابل استفاده نیست.
6. پس از موفقیت، قفل دائمی `storage/installed.lock` در مسیر خصوصی ساخته می‌شود؛ نصب‌کننده حتی اگر دوباره آپلود شود اجرا نمی‌شود. `install.php` و `setup-check.php` را از پوشه عمومی حذف کنید و `update.php` را نیز تا زمان نیاز حذف کنید.

مسیر public در اجرای وب و CLI یکسان تنظیم می‌شود؛ آپلود عمومی مستقیم به `xx.example.com/storage` می‌رود و نیازی به `storage:link` نیست. **فایل‌های حساس را روی دیسک public ذخیره نکنید**؛ دیسک local در storage/app/private خصوصی باقی می‌ماند.

نصب از ریشه دامنه/ساب‌دامنه پشتیبانی می‌شود؛ نصب زیر URL مثل `/crm` در این نسخه پشتیبانی نمی‌شود.

## خطای ۵۰۰ بعد از ارسال فرم نصب

در نسخه اصلاح‌شده، بارگذاری vendor، bootstrap، مایگریشن و ساخت مدیر همگی زیر مدیریت خطا هستند؛ خطای fatal وابستگی‌ها نیز تا حد امکان گزارش می‌شود. در خطا، مرحله و کد پیگیری روی صفحه و جزئیات بدون رمزهای فرم در `storage/logs/installer.log` **خصوصی** ثبت می‌شود. اگر لاگ قابل نوشتن نبود، Errors در cPanel را ببینید. APP_DEBUG را روشن نکنید.

برای نصب نیمه‌کاره، ابتدا از `.env` و دیتابیس بکاپ بگیرید، سپس `install.php` جدید را در پوشه عمومی جایگزین کنید و صفحه را مجدداً باز کنید. اگر بسته‌های مسیر مستقل این پروژه را دارید، برای دریافت پیام خطا نیازی به جایگزینی کل هسته نیست. در بسته جدید `resolve-private.php` نیز بدون وابستگی به تابع putenv کار می‌کند؛ هنگام جایگزینی آن، `private-path.php` واقعی خود را حفظ کنید.

دیتابیس، جدول‌ها، APP_KEY و قفل نصب موفق را حذف نکنید. روی هاست PHP حداقل 8.4.1 و vendor کامل لازم است. اگر باز هم فقط ۵۰۰ عمومی نمایش داده شد، لاگ همان زمان را از cPanel بررسی کنید؛ خطای وب‌سرور، ModSecurity یا توقف اجباری PHP ممکن است قبل از رسیدن به کد نصب رخ دهد.

### خطای Monolog و PsrExt روی هاست

اگر خطا شامل `Monolog\Logger::emergency` و `PsrExt\Log\LoggerInterface` است، افزونه بومی `psr` روی PHP هاست رابط لاگ‌گیری قدیمی را قبل از Composer بارگذاری کرده و با Monolog پروژه تداخل دارد. این مشکل دیتابیس یا مسیر خصوصی نیست.

1. در cPanel → Select PHP Version → Extensions، افزونه **psr** را برای PHP همین دامنه غیرفعال و تغییرات را ذخیره کنید.
2. اگر گزینه وجود ندارد یا PHP تحت MultiPHP/EasyApache مدیریت می‌شود، از پشتیبانی بخواهید افزونه `psr/PsrExt` را برای PHP handler/pool دامنه غیرفعال و پردازش‌های LiteSpeed/LSAPI یا PHP-FPM مربوط را reload/restart کند. روی هاست مشترک این تغییر را سراسری برای حساب‌های دیگر انجام ندهید.
3. نسخه واقعی PHP وب دامنه باید حداقل 8.4.1 باشد. برچسبی مثل `php74` در نام handler لاگ به تنهایی نسخه PHP فعال را ثابت نمی‌کند؛ نسخه گزارش‌شده توسط ویزارد را ملاک بگیرید.
4. صفحه نصب را دوباره باز کنید. نصب‌کننده جدید پیش از vendor این تداخل را بررسی و ارسال فرم را مسدود می‌کند.

**پکیج Composer به نام `psr/log` را حذف نکنید** و امضای متدهای Monolog یا فایل‌های vendor را تغییر ندهید. `psr/log` با افزونه بومی `psr` فرق دارد و برای برنامه لازم است. غیرفعال‌سازی افزونه بارگذاری‌شده با `ini_set` یا افزودن `extension=` خالی در `.user.ini` انجام نمی‌شود. نصب دوباره دیتابیس یا ساخت مجدد ZIP هم افزونه سرور را غیرفعال نمی‌کند.

متن پیشنهادی تیکت:

> در دامنه موردنظر، PHP افزونه psr/PsrExt را با امضای قدیمی LoggerInterface بارگذاری می‌کند و Monolog 3 با خطای Declaration of Monolog\Logger::emergency(Stringable|string ...) must be compatible with PsrExt\Log\LoggerInterface::emergency($message, ...) متوقف می‌شود. لطفاً افزونه psr را برای handler/pool این دامنه غیرفعال کنید، PHP وب را روی 8.4.1 یا بالاتر سازگار قرار دهید و workerهای مربوط را reload کنید. پکیج Composer psr/log باید باقی بماند.

## ۴. آزمون پس از نصب

- `/login` و refresh مستقیم `/customers` باید SPA را برگردانند.
- `/up` باید پاسخ سلامت Laravel باشد، نه HTML فرانت‌اند.
- ورود با مدیر انتخاب‌شده، خروج، ثبت مشتری و دستگاه، تخصیص، ورود/خروج انبار، تاریخچه، اکسل و آپلود لوگو/آواتار را امتحان کنید.
- `/admin` و فایل‌های Filament باید بارگذاری شوند.
- `/.env` و `/private-path.php` و `/resolve-private.php` نباید اطلاعات بدهند.
- بارگذاری PHP در `/storage` باید مسدود باشد.
- پیامک ابتدا در حالت Sandbox است؛ **قبل از استفاده واقعی از ورود پیامکی Sandbox را خاموش کنید** و ارسال/خطای سرویس را با حساب واقعی آزمایش کنید.

## ۵. ارتقا

از دیتابیس، `.env`، `storage/` خصوصی، `storage/` عمومی و `private-path.php` بکاپ بگیرید. هنگام جایگزینی فایل‌های نسخه جدید این موارد و قفل نصب را حفظ کنید؛ فایل `private-path.php` بسته جدید را روی تنظیم واقعی سرور overwrite نکنید. فایل‌های cache قبلی `bootstrap/cache/config.php`، `events.php` و `routes*.php` را قبل از اجرا حذف کنید. `update.php` را موقتاً آپلود، با HTTPS باز و APP_KEY را **فقط داخل فرم POST** وارد کنید، نه URL. پس از ارتقا آن را حذف کنید. ارتقا rollback خودکار ندارد و نباید `migrate:fresh` یا seed نمایشی اجرا شود.

## محدودیت تأیید

بیلد فرانت‌اند جای آزمون هاست واقعی نیست. workflow شامل بررسی syntax PHP، ساخت بسته و اجرای مایگریشن MySQL دوبار است؛ آزمون کامل مرورگری و سرویس ملی‌پیامک روی هاست مقصد همچنان لازم است. گزارش بررسی در `deploy/cpanel/AUDIT.md` است.
