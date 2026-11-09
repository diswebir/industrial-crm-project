# ⬆️ راهنمای ارتقا به نسخه `v2.0.0` روی هاست cPanel

**بدون SSH، بدون Composer روی هاست، بدون از دست رفتن حتی یک رکورد داده.**

این راهنما سامانه در حال کار (نسخه ۱) را به نسخه `v2.0.0` ارتقا می‌دهد:
نقش‌های سازمانی و دامنه دسترسی به مشتریان، انبارداری و کنترل موجودی دستگاه‌ها،
مدیریت کامل دستگاه‌های تخصیص‌یافته، اعتبارسنجی مشتری حقیقی/حقوقی،
خروجی اکسل دوشیته، فونت وزیرمتن با ارقام فارسی و تغییر واژگان «قطعه» به «دستگاه».

| ویژگی ارتقا | وضعیت |
| :-- | :-- |
| حذف جدول یا ستون | ❌ انجام نمی‌شود |
| حذف/بازنویسی رکوردها | ❌ انجام نمی‌شود (`DROP`, `TRUNCATE`, `DELETE` هیچ‌کدام استفاده نشده‌اند) |
| تغییر مخرب نوع ستون | ❌ فقط `NOT NULL → NULL` که همیشه امن است |
| اجرای مجدد بدون خطا (Idempotent) | ✅ هم مایگریشن‌ها و هم فایل SQL خام |
| نیاز به SSH / Composer / Node روی هاست | ❌ ندارد |
| زمان تقریبی | ۲۰ تا ۴۰ دقیقه (بیشتر آن آپلود فایل‌ها) |
| قطعی سامانه | چند دقیقه در زمان جایگزینی فایل‌ها |

> 📌 اگر سامانه را هنوز نصب نکرده‌اید، این راهنما مربوط به شما نیست؛
> از [`README.md`](README.md) و ویزارد `install.php` استفاده کنید.

---

## ۱) پیش‌نیازها

- [ ] هاست cPanel با **PHP 8.4.1 یا بالاتر** و افزونه‌های `pdo_mysql`, `mbstring`, `intl`, `gd`, `zip`, `xml`, `curl`.
- [ ] دسترسی به **File Manager** و **phpMyAdmin**.
- [ ] بسته استقرار نسخه `v2.0.0`: `cpanel-public.zip` و `cpanel-private.zip`.
- [ ] مسیر خصوصی فعلی سامانه (مقدار داخل فایل عمومی `private-path.php`).
- [ ] مقدار `APP_KEY` از فایل `.env` در مسیر خصوصی (برای اجرای `update.php`).

نسخه خود را از روی فایل `VERSION` در ریشه مخزن یا کلید `app_version` در
`GET /api/v1/settings/company` بررسی کنید.

---

## ۲) پشتیبان‌گیری اجباری (پیش از هر اقدام)

> ⚠️ **بدون این چهار قلم ادامه ندهید.** همه تغییرات این نسخه افزودنی است،
> اما تنها راه بازگشت قطعی، همین پشتیبان‌ها هستند.

1. **پایگاه داده:** phpMyAdmin → پایگاه داده سامانه → تب **Export** → روش **Custom** →
   انتخاب همه جداول → قالب **SQL** → گزینه «Add DROP TABLE» را **خاموش** بگذارید → **Go**.
   فایل را با نام قابل تشخیص ذخیره کنید، مثلاً `crm-backup-before-v2.sql`.
2. **فایل `.env`:** از مسیر خصوصی کپی بگیرید (در File Manager، نمایش فایل‌های مخفی را
   با *Show Hidden Files* فعال کنید).
3. **فایل‌های بارگذاری‌شده:** پوشه `storage/app/public` (لوگو و آواتارها) از مسیر خصوصی
   و پوشه `storage/` عمومی را کپی یا فشرده کنید.
4. **فایل‌های برنامه نسخه فعلی:** یک کپی ZIP از مسیر خصوصی و مسیر عمومی بگیرید
   (برای Rollback سریع در بخش ۱۰).

همچنین می‌توانید از cPanel → **Backup** یک نسخه کامل بگیرید؛ در این صورت قلم ۱ تا ۳ پوشش داده می‌شوند.

---

## ۳) دریافت بسته `v2.0.0`

**روش الف — بدون SSH (توصیه‌شده):** در GitHub، Actions → workflow **cPanel package** →
Run workflow (روی تگ `v2.0.0`) → دانلود artifact `cpanel-package`.

**روش ب — ساخت محلی:** روی رایانه‌ای با PHP 8.4.1+، Composer، Node 22.12+ و zip:

```bash
bash deploy/cpanel/build.sh
bash deploy/cpanel/verify-package.sh cpanel-release
(cd cpanel-release && sha256sum -c SHA256SUMS)
```

> 🆕 از نسخه `v2.0.0` اسکریپت ساخت، پوشه‌های `backend/public/css` و `backend/public/fonts`
> را هم در بسته عمومی قرار می‌دهد و پیش از بسته‌بندی وجود
> `css/vazirmatn.css` و `fonts/vazirmatn-fd-Regular.woff2` را بررسی می‌کند؛
> اگر بسته شما این دو را ندارد، بسته را با نسخه جدید مخزن بسازید
> (در غیر این صورت فونت پنل مدیریت فارسی/رقم‌فارسی نخواهد شد).

---

## ۴) آماده‌سازی سامانه برای ارتقا

1. (توصیه‌شده) با **Directory Privacy** یا یک صفحه نگهداری موقت، دسترسی عمومی را محدود کنید
   تا در میانه جایگزینی فایل‌ها، کاربری درخواست نیمه‌کاره ثبت نکند.
2. مطمئن شوید هیچ **Cron** یا صفی در حال اجرا نیست.
3. مسیر خصوصی را از `private-path.php` بخوانید و در یادداشت نگه دارید:

```php
<?php
return '/home/alice/private_pro/project1/myc';
```

---

## ۵) جایگزینی فایل‌های خصوصی (`cpanel-private.zip`)

در File Manager، داخل **مسیر خصوصی**:

**استخراج/جایگزینی کنید (همه با نسخه جدید بازنویسی شوند):**

```text
app/            bootstrap/app.php   bootstrap/providers.php
config/         database/           routes/
vendor/         artisan             composer.json   composer.lock
public/         (فقط در صورتی که هسته خصوصی public جداگانه دارد)
```

**دست نزنید — این‌ها داده/تنظیم زنده سرور شما هستند:**

| قلم | چرا |
| :-- | :-- |
| `.env` | کلید برنامه، اتصال دیتابیس و تنظیمات پیامک شما |
| `storage/` | لوگو، آواتارها و لاگ‌های زنده |
| `storage/installed.lock` | قفل دائمی نصب؛ حذف آن ویزارد نصب را دوباره فعال می‌کند |
| `bootstrap/cache/*.php` | در گام ۸ پاک می‌شوند؛ جایگزینی لازم نیست |

> 🚫 **هرگز `install.php` را در سامانه نصب‌شده اجرا نکنید.** این نسخه برای ارتقا فقط
> `update.php` دارد. اگر `install.php` به‌اشتباه در پوشه عمومی وجود دارد، حذفش کنید.

> 💡 اگر هاست شما `open_basedir` دارد، مطمئن شوید مسیر خصوصی همچنان مجاز است
> (تغییری در این نسخه داده نشده است).

---

## ۶) جایگزینی فایل‌های عمومی (`cpanel-public.zip`)

در **Document Root دامنه** (مثلاً `/home/alice/xx.example.com`):

**استخراج/جایگزینی کنید:**

```text
index.html      index.php       .htaccess
assets/         (بسته فرانت‌اند نسخه ۲ — شامل فونت‌های Vazirmatn FD)
css/            (شامل css/vazirmatn.css و css/filament/)
fonts/          (شامل fonts/vazirmatn-fd-*.woff2 — ۵ وزن)
js/filament/    livewire/       favicon.svg
update.php      resolve-private.php   private-path.php ← فقط اگر وجود نداشت
storage/        (پوشه عمومی آپلود)
```

**دست نزنید:**

| قلم | چرا |
| :-- | :-- |
| `private-path.php` | مسیر خصوصی سرور شما در آن نوشته شده است؛ بازنویسی‌اش سامانه را قطع می‌کند |
| `storage/` عمومی | فایل‌های آپلودشده زنده |
| `install.php`, `setup-check.php` | اگر از قبل حذف شده‌اند، بازنگردانید |

> ⚠️ چون نام فایل‌های `assets/` با hash محتوا ساخته می‌شود، **کل پوشه `assets/` را
> با نسخه جدید جایگزین کنید** و سپس در مرورگر `Ctrl+F5` بزنید تا کش CSS/فونت قدیمی پاک شود.
> در غیر این صورت صفحه سفید یا بدون فونت فارسی دیده می‌شود.

---

## ۷) اعمال تغییرات پایگاه داده — دو روش (یکی را انتخاب کنید)

> ✅ هر دو مسیر، در workflow «cPanel package» روی GitHub Actions با اجرای واقعی آزمایش
> شده‌اند: نصب تازه روی **MySQL 8** و **SQLite**، سپس اجرای **دوباره** مایگریشن‌ها
> (Idempotent)، به‌همراه راستی‌آزمایی وجود ستون‌ها/جدول‌های جدید و منطق کسر و بازگشت
> موجودی انبار. جزئیات در
> [`docs/ACCEPTANCE-REPORT-v2.0.0.fa.md`](../../docs/ACCEPTANCE-REPORT-v2.0.0.fa.md).

### روش الف (توصیه‌شده): `update.php`

1. آدرس `https://xx.example.com/update.php` را باز کنید.
2. صفحه، وضعیت فعلی مایگریشن‌ها (`migrate:status`) را نشان می‌دهد؛ باید شش مایگریشن
   `2024_01_01_000014` تا `2024_01_01_000019` در وضعیت **Pending** باشند.
3. مقدار `APP_KEY` را از `.env` کپی و در فرم وارد کنید (فقط در فرم POST، نه در URL)
   و دکمه **«اجرای مایگریشن‌ها»** را بزنید.
4. اسکریپت این کارها را انجام می‌دهد:
   - `php artisan migrate --force` (فقط مایگریشن‌های جدید)؛
   - پاک‌سازی کش‌ها: `config:clear`, `route:clear`, `view:clear`, `cache:clear` و
     بازنشانی کش مجوزهای Spatie؛
   - ساخت دوباره `config:cache` و `route:cache`؛
   - نمایش **گزارش راستی‌آزمایی**: وجود ستون‌ها/جدول‌های جدید، دو مجوز جدید انبار و
     شمارش رکوردهای مشتریان، دستگاه‌ها و تخصیص‌ها (برای اطمینان از اینکه داده‌ای کم نشده)؛
   - حذف خودکار فایل `update.php`.
5. اگر `update.php` خودش حذف نشد، آن را دستی از پوشه عمومی حذف کنید.

### روش ب: فایل SQL خام در phpMyAdmin

اگر `update.php` در اختیار ندارید یا اجرای Artisan روی هاست مسدود است:

> 📎 این فایل عمداً **داخل بسته‌های `cpanel-*.zip` قرار نمی‌گیرد**
> (اسکریپت `verify-package.sh` هر فایل `.sql` را به‌عنوان ریسک نشتی داده رد می‌کند).
> آن را از مخزن (مسیر `deploy/cpanel/database/v2.0.0-mysql.sql`) بردارید و سپس
> در phpMyAdmin وارد کنید.

1. phpMyAdmin → پایگاه داده سامانه → تب **Import** → فایل
   [`database/v2.0.0-mysql.sql`](database/v2.0.0-mysql.sql) → **Go**.
   (یا تب **SQL** و چسباندن کامل متن فایل → **Go**)
2. در پایان، دو خروجی نمایش داده می‌شود:
   - جدول **گزارش پایانی** با ۱۷ ردیف که همه باید `OK` باشند؛
   - شمارش رکوردهای `customers`, `parts`, `customer_parts`, `part_service_histories`,
     `users`, `inventory_logs` — سه قلم اول باید دقیقاً برابر شمارش قبل از ارتقا باشند.
3. این فایل، مایگریشن‌ها را در جدول `migrations` هم ثبت می‌کند؛ بنابراین اجرای بعدی
   `update.php` یا `migrate --force` آن‌ها را دوباره اعمال نمی‌کند.
4. سپس **کش‌ها را پاک کنید** (گام ۸) — این قلم در روش ب خودکار انجام نمی‌شود.

> ویژگی‌های فایل SQL: فقط افزودنی؛ بدون `DROP`/`TRUNCATE`/`DELETE`؛
> بررسی وجود ستون/ایندکس/جدول/کلید خارجی از `INFORMATION_SCHEMA` پیش از هر تغییر
> (با `PREPARE`/`EXECUTE`)؛ حفظ طول و مجموعه‌کاراکتر فعلی ستون‌هایی که `NULL` می‌شوند؛
> و قابل اجرا به‌صورت چندباره بدون خطا.

---

## ۸) پاک‌سازی کش (در صورت استفاده از روش ب)

در File Manager، داخل مسیر خصوصی، پوشه `bootstrap/cache/` را باز کنید و همه فایل‌های
`*.php` آن را حذف کنید (فایل `.gitignore` را نگه دارید):

```text
bootstrap/cache/config.php     ← حذف شود (تنظیمات جدید acl.php و crm.php شناخته شوند)
bootstrap/cache/routes-v7.php  ← حذف شود (مسیرهای جدید انبار/دسترسی شناخته شوند)
bootstrap/cache/packages.php   ← حذف شود
bootstrap/cache/services.php   ← حذف شود
```

اگر کش مجوزها (`permission`) روی هاست شما فعال است، فایل‌های
`storage/framework/cache/data/**` را هم پاک کنید. ساده‌ترین راه، اجرای یک‌باره
`update.php` (روش الف) است که همه این کارها را خودش انجام می‌دهد.

> بدون پاک‌سازی کش پیکربندی، فایل‌های جدید `config/acl.php` و `config/crm.php` خوانده
> نمی‌شوند و خطای `Configuration ... not found` یا نقش‌های خالی خواهید دید.

---

## ۹) راستی‌آزمایی پس از ارتقا (چک‌لیست)

| # | بررسی | انتظار |
| :- | :-- | :-- |
| 1 | ورود با حساب مدیر فعلی | بدون تغییر رمز، ورود موفق |
| 2 | منوی کناری | «دستگاه‌ها» و «انبار و موجودی» دیده شود و واژه «قطعه» در هیچ صفحه‌ای باقی نمانده باشد |
| 3 | سربرگ سامانه (منوی کاربر) | نقش سازمانی و «دامنه دسترسی» نمایش داده شود |
| 4 | صفحه «تنظیمات ← کاربران، نقش‌ها و دسترسی‌ها» | ستون‌های «نقش سازمانی» و «دامنه دسترسی به مشتریان» + فیلتر نقش |
| 5 | ویرایش یک کاربر | انتخاب نقش، دامنه و اعطای «کارمندان مشخص»/«مشتریان تکی» |
| 6 | صفحه «کاتالوگ دستگاه‌ها» | ستون موجودی، حد هشدار و نشان «کمبود موجودی» |
| 7 | صفحه «انبار و موجودی» | کارت‌های آماری، جدول گردش کالا با فیلتر و «ثبت حرکت موجودی» |
| 8 | پروفایل یک مشتری | تب دستگاه‌ها با دکمه‌های ویرایش/حذف تخصیص و ویرایش/حذف سابقه سرویس |
| 9 | ثبت مشتری **حقوقی** بدون نام و موبایل | ذخیره موفق و نمایش نام شرکت به‌عنوان عنوان |
| 10 | خروجی اکسل مشتریان | دو شیت «مشتریان» و «دستگاه‌های تخصیص‌یافته» با سرستون فارسی و RTL |
| 11 | تقویم شمسی داخل مودال تخصیص | پاپ‌آپ کامل دیده شود و بریده نشود؛ با `Esc` بسته شود |
| 12 | ارقام در جدول‌ها، قیمت‌ها و تاریخ‌ها | فارسی (۰-۹)؛ سریال/کد/ایمیل چپ‌به‌راست |
| 13 | پنل `/admin` (Filament) | فونت وزیرمتن، نام «مدیریت دستگاه‌های صنعتی» و منبع «گردش انبار» |
| 14 | `GET /api/v1/settings/company` | `app_version` برابر `2.0.0` |
| 15 | شمارش رکوردها | برابر با شمارش قبل از ارتقا (از گزارش `update.php` یا phpMyAdmin) |

اگر قلم ۱۲ یا ۱۳ درست نبود، کش مرورگر را با `Ctrl+F5` پاک کنید و مطمئن شوید
پوشه‌های `css/` و `fonts/` در Document Root وجود دارند.

---

## ۱۰) اقدامات ضروری پس از ارتقا

### ۱۰٫۱ ثبت موجودی واقعی انبار (مهم‌ترین قلم)

موجودی (`stock_quantity`) همه دستگاه‌های موجود **صفر** ثبت شده است، زیرا سامانه پیش از
این نسخه هیچ اطلاعاتی از انبار واقعی نداشته و هیچ عددی به‌صورت ساختگی ساخته نشده است.

- به «کاتالوگ دستگاه‌ها» یا صفحه «انبار و موجودی» بروید.
- برای هر دستگاه **ورود کالا** ثبت کنید (تعداد، تاریخ، مرجع مثل شماره فاکتور خرید، توضیحات).
- برای هر ورود، یک ردیف در `inventory_logs` با `type = in` و موجودی قبل/بعد ثبت می‌شود.

> تا زمان ثبت موجودی، تخصیص دستگاه با خطای فارسی «موجودی دستگاه … کافی نیست
> (موجودی فعلی: ۰ عدد)» رد می‌شود. این رفتار عمدی است تا آمار انبار غیرواقعی نشود.
> اگر می‌خواهید برای مدت کوتاهی بدون کنترل موجودی کار کنید، «ورود کالا» را با تعداد
> تقریبی ثبت و بعداً با «اصلاح موجودی» دقیق کنید.

### ۱۰٫۲ بازبینی نقش و دامنه دسترسی کاربران

- همه کاربران فعلی نقش قبلی خود (ستون `user_type`) و دامنه **«همه مشتریان سامانه»** را
  نگه داشته‌اند تا هیچ‌کس قفل نشود.
- برای فعال‌سازی «کارمند فروش فقط مشتریان خودش را ببیند»، در صفحه کاربران،
  دامنه آن کاربر را به **«فقط مشتریان خودش + استثناهای اعطاشده»** تغییر دهید و
  در صورت نیاز، دسترسی به مشتریان چند کارمند مشخص یا چند مشتری تکی را اعطا کنید.

### ۱۰٫۳ تعیین مالک مشتریان قدیمی (اختیاری)

`created_by_user_id` برای مشتریان قدیمی `NULL` است (مالک نامشخص). مشتریان با مالک
نامشخص فقط برای کاربران با دامنه `all` دیده می‌شوند. اگر می‌خواهید کارمندان قدیمی هم
مشتریان خود را ببینند، یا دامنه آن‌ها را `all` نگه دارید، یا از پنل `/admin`
(منبع «مشتریان») مالک هر پرونده را تعیین کنید، یا مشتری را به‌صورت تکی به کاربر اعطا کنید.

### ۱۰٫۴ پاک‌سازی فایل‌های استقرار

- `update.php` باید حذف شده باشد (خودکار یا دستی).
- `install.php` و `setup-check.php` در پوشه عمومی نباشند.
- `storage/installed.lock` سالم و موجود باشد.

### ۱۰٫۵ بازگرداندن دسترسی عمومی

محدودیت Directory Privacy یا صفحه نگهداری را بردارید و به کاربران اطلاع دهید
که یک‌بار `Ctrl+F5` بزنند.

---

## ۱۱) بازگشت به نسخه قبل (Rollback)

1. فایل‌های نسخه قبل را که در گام ۲٫۴ ZIP کرده‌اید، به مسیر عمومی و خصوصی بازگردانید.
2. پایگاه داده را از `crm-backup-before-v2.sql` بازیابی کنید
   (phpMyAdmin → Import). ستون‌ها و جدول‌های جدید به‌تنهایی برای نسخه قدیمی بی‌ضررند،
   اما رکوردهای ثبت‌شده در `migrations` و مجوزهای جدید می‌توانند گزارش‌های نسخه قدیمی را
   گمراه کنند؛ بنابراین بازیابی کامل، تمیزترین راه است.
3. `bootstrap/cache/*.php` را دوباره پاک کنید.
4. اگر بین ارتقا و بازگشت، داده جدیدی (مشتری، تخصیص، لاگ انبار) ثبت شده است،
   آن داده‌ها با بازیابی بکاپ از بین می‌روند — پیش از بازگشت، خروجی اکسل بگیرید.

---

## ۱۲) فهرست دقیق فایل‌های تغییریافته در `v2.0.0`

### ۱۲٫۱ بک‌اند — فایل‌های **جدید**

```text
backend/config/acl.php                                   نقش‌ها، دامنه‌ها و پیش‌فرض مجوزها
backend/config/crm.php                                   شماره نسخه و تنظیمات سطح سامانه
backend/app/Models/InventoryLog.php                      مدل گردش انبار
backend/app/Services/Inventory/InventoryService.php      سرویس کسر/بازگشت/اصلاح موجودی
backend/app/Http/Controllers/Api/V1/InventoryController.php
backend/app/Exports/CustomersSheet.php                   شیت «مشتریان»
backend/app/Exports/CustomerDevicesSheet.php             شیت «دستگاه‌های تخصیص‌یافته»
backend/app/Filament/Resources/InventoryLogResource.php
backend/app/Filament/Resources/InventoryLogResource/Pages/ListInventoryLogs.php
backend/database/migrations/2024_01_01_000014_add_ownership_and_nullable_fields_to_customers_table.php
backend/database/migrations/2024_01_01_000015_add_customers_scope_and_access_tables_to_users.php
backend/database/migrations/2024_01_01_000016_add_inventory_fields_to_parts_table.php
backend/database/migrations/2024_01_01_000017_add_device_fields_to_customer_parts_table.php
backend/database/migrations/2024_01_01_000018_create_inventory_logs_table.php
backend/database/migrations/2024_01_01_000019_add_inventory_permissions.php
backend/public/fonts/vazirmatn-fd-Regular.woff2
backend/public/fonts/vazirmatn-fd-Medium.woff2
backend/public/fonts/vazirmatn-fd-SemiBold.woff2
backend/public/fonts/vazirmatn-fd-Bold.woff2
backend/public/fonts/vazirmatn-fd-Black.woff2
```

### ۱۲٫۲ بک‌اند — فایل‌های **تغییریافته**

```text
backend/routes/api.php                                   مسیرهای انبار، دسترسی‌ها، تخصیص/سابقه
backend/app/Http/Controllers/Controller.php              authorizeCustomerAccess() و پاسخ 403
backend/app/Http/Controllers/Api/V1/AuthController.php   payload نقش/دامنه در me و login
backend/app/Http/Controllers/Api/V1/CustomerController.php  دامنه دسترسی، جستجو، اعتبارسنجی حقیقی/حقوقی، ورود/خروج اکسل
backend/app/Http/Controllers/Api/V1/PartController.php   موجودی، تخصیص با تعداد/فاکتور، ویرایش/حذف
backend/app/Http/Controllers/Api/V1/UserController.php   نقش‌ها، دامنه، استثناها، کاتالوگ ۱۶ مجوز
backend/app/Http/Controllers/Api/V1/DashboardController.php  آمار انبار و گردش اخیر
backend/app/Http/Controllers/Api/V1/SmsController.php    اعمال دامنه دسترسی
backend/app/Http/Controllers/Api/V1/SettingController.php  app_version در خروجی
backend/app/Models/Customer.php      scopeVisibleTo(), full_name حقوقی, createdBy()
backend/app/Models/User.php          نقش‌ها، customers_scope, canAccessCustomer(), روابط استثنای دسترسی
backend/app/Models/Part.php          stock_quantity, min_stock_quantity, unit_label, is_low_stock
backend/app/Models/CustomerPart.php  quantity, invoice_*, assignedBy(), تاریخچه
backend/app/Services/Customers/CustomerService.php  تخصیص/ویرایش/حذف در Transaction + لاگ انبار
backend/app/Imports/CustomersImport.php  تشخیص تکراری، نرمال‌سازی موبایل، خطا/هشدار
backend/app/Exports/CustomersExport.php  WithMultipleSheets
backend/app/Exports/CustomersTemplateExport.php  ستون‌های جدید + برگه راهنما
backend/app/Filament/Resources/CustomerResource.php  مالک، شخصیت حقوقی، دامنه دسترسی
backend/app/Filament/Resources/PartResource.php      موجودی، حد هشدار، واحد، گردش انبار
backend/app/Filament/Resources/UserResource.php      نقش، دامنه، اعطای استثناها
backend/app/Providers/Filament/AdminPanelProvider.php  نام پنل + فونت Vazirmatn FD
backend/config/scramble.php                          عنوان و توضیح مستندات API
backend/database/migrations/2024_01_01_000011_create_initial_admin_and_permissions.php  مجوزهای انبار برای نصب تازه
backend/database/seeders/DatabaseSeeder.php          داده نمونه چهار نقش + انبار (فقط نصب تازه)
backend/public/css/vazirmatn.css                     بازنویسی برای خانواده Vazirmatn FD
```

### ۱۲٫۳ فرانت‌اند — فایل‌های **جدید**

```text
frontend/src/components/parts/StockMovementModal.tsx     ثبت ورود/خروج/برگشت/اصلاح موجودی
frontend/src/components/settings/RoleAccessFields.tsx    نقش + دامنه + اعطای استثناها
frontend/src/assets/fonts/vazirmatn-fd/*.woff2           ۶ وزن فونت + LICENSE-OFL.txt
```

### ۱۲٫۴ فرانت‌اند — فایل‌های **تغییریافته**

```text
frontend/index.html                       زبان/جهت، توضیحات، فونت پیش از رندر
frontend/src/index.css                    @font-face های FD + --font-sans/--font-mono + ایزوله‌سازی LTR
frontend/src/App.tsx                      مسیر /inventory
frontend/src/types/index.ts               تایپ‌های نقش، دامنه، انبار، تخصیص، ورودی اکسل
frontend/src/services/api.ts              کلاینت‌های aclApi، inventoryApi، customerPart/serviceHistory
frontend/src/utils/format.ts              fullName/customerLabel با پشتیبانی حقوقی، toEnDigits
frontend/src/utils/meta.ts                برچسب نقش‌ها، دامنه‌ها، انواع گردش انبار
frontend/src/utils/analytics.ts           سازگاری با فیلدهای اختیاری مشتری
frontend/src/layouts/nav.ts               منوی «انبار و موجودی» + مجوز inventory.logs
frontend/src/layouts/Sidebar.tsx          واژگان «دستگاه» و مجوزهای جدید
frontend/src/layouts/MainLayout.tsx       نقش و دامنه دسترسی در منوی کاربر
frontend/src/layouts/GlobalSearch.tsx     عنوان مشتری حقوقی + موبایل اختیاری
frontend/src/pages/Login.tsx              حذف مقادیر پیش‌فرض و باکس نمایش رمز
frontend/src/pages/Dashboard.tsx          KPIهای انبار + گردش اخیر
frontend/src/pages/Customers.tsx          صفحه‌بندی درست، عنوان حقوقی، فیلترها
frontend/src/pages/CustomerDetail.tsx     شش تب + ویرایش/حذف تخصیص و سابقه سرویس
frontend/src/pages/Parts.tsx              موجودی، حد هشدار، حرکت موجودی، جلوگیری از حذف
frontend/src/pages/Inventory.tsx          بازنویسی کامل صفحه «انبار و موجودی» (کارت‌های آماری، گردش کالا، فیلترها)
frontend/src/pages/SmsCenter.tsx          عنوان مشتری حقوقی در لاگ پیامک‌ها
frontend/src/pages/settings/UsersAclPage.tsx   نقش/دامنه/استثناها + مودال دسترسی مشتریان
frontend/src/pages/settings/CreateUserPage.tsx نقش و دامنه در فرم ساخت کاربر
frontend/src/pages/settings/EditUserPage.tsx   نقش و دامنه در فرم ویرایش کاربر
frontend/src/pages/settings/MyProfilePage.tsx  نقش، دامنه و وضعیت فعال بودن
frontend/src/pages/settings/SystemSettingsPage.tsx  نشان نسخه سامانه
frontend/src/components/customers/CustomerFormModal.tsx  حقیقی/حقوقی با ستاره و اعتبارسنجی شرطی
frontend/src/components/customers/ImportModal.tsx        خطا/هشدار، شمارش ساخت/به‌روزرسانی
frontend/src/components/parts/AssignPartModal.tsx        تعداد، فاکتور، کنترل موجودی
frontend/src/components/parts/ServiceHistoryModal.tsx    ویرایش/حذف و واژگان دستگاه
frontend/src/components/ui/DatePicker.tsx               Portal + fixed + اسکرول/ریسایز + Esc
frontend/src/components/ui/SearchableSelect.tsx         جستجو با کلاینت واقعی API
```

### ۱۲٫۵ استقرار و مستندات

```text
deploy/cpanel/build.sh                        کپی css/ و fonts/ + سه بررسی اجباری
deploy/cpanel/update.php                      پاک‌سازی/بازسازی کش + گزارش راستی‌آزمایی
deploy/cpanel/database/v2.0.0-mysql.sql       اسکریپت خام Idempotent برای phpMyAdmin (جدید)
deploy/cpanel/UPGRADE-v2.0.0.fa.md            همین راهنما (جدید)
deploy/cpanel/tests/test_build.py             پوشش فونت/CSS در آزمون بسته‌بندی
deploy/cpanel/tests/smoke-package.php         راستی‌آزمایی ۱۶ مجوز و ساختار جدید
deploy/cpanel/README.md، WINDOWS-BUILD-GUIDE.fa.md/.html   واژگان و چک‌لیست
docs/UPGRADE-PLAN-v2.0.0.fa.md                سند طراحی و برنامه ارتقا (جدید)
docs/ACCEPTANCE-REPORT-v2.0.0.fa.md           گزارش پذیرش (جدید)
VERSION، CHANGELOG.md، README.md               نسخه و تاریخچه
```

---

## ۱۳) عیب‌یابی

| علامت | علت احتمالی | راه‌حل |
| :-- | :-- | :-- |
| صفحه سفید یا استایل به‌هم‌ریخته | پوشه `assets/` قدیمی یا کش مرورگر | کل `assets/` را جایگزین و `Ctrl+F5` بزنید |
| خطای ۵۰۰ با پیام `Configuration [acl] not found` | کش پیکربندی قدیمی | `bootstrap/cache/config.php` را حذف کنید (گام ۸) |
| مسیر `/api/v1/inventory/logs` خطای ۴۰۴ | کش مسیرها قدیمی | `bootstrap/cache/routes-v7.php` را حذف کنید |
| دکمه «انبار و موجودی» دیده نمی‌شود | مجوز `inventory.logs` به کاربر داده نشده | در صفحه کاربران مجوزهای گروه «انبار» را فعال کنید؛ مایگریشن `000019` آن را به دارندگان `parts.view` داده است |
| تخصیص دستگاه خطای «موجودی کافی نیست» | موجودی اولیه صفر است | «ورود کالا» ثبت کنید (گام ۱۰٫۱) |
| کارمند، مشتریان قدیمی را نمی‌بیند | `created_by_user_id` برابر `NULL` و دامنه کاربر `own` است | مالک پرونده را تعیین کنید یا دامنه را `all` بگذارید یا مشتری را تکی اعطا کنید |
| ارقام پنل `/admin` انگلیسی است | `css/vazirmatn.css` یا `fonts/vazirmatn-fd-*.woff2` آپلود نشده | پوشه‌های `css/` و `fonts/` را در Document Root بررسی کنید و بسته را با `build.sh` نسخه جدید بسازید |
| `update.php` خطای `vendor` می‌دهد | هسته خصوصی کامل آپلود نشده | `vendor/` و `bootstrap/app.php` را در مسیر خصوصی بررسی کنید |
| `update.php` خطای «کلید نامعتبر» | `APP_KEY` اشتباه کپی شده | مقدار کامل `APP_KEY` (با پیشوند `base64:`) را از `.env` کپی کنید |
| Import فایل SQL در phpMyAdmin نیمه‌کاره ماند | محدودیت `max_execution_time`/حجم آپلود هاست | فایل را در تب **SQL** بچسبانید و اجرا کنید؛ در صورت نیاز بخش‌به‌بخش (۱ تا ۹) اجرا شود — هر بخش Idempotent است |

---

## ۱۴) تغییرات پایگاه داده در یک نگاه

| جدول | تغییر | اثر روی داده موجود |
| :-- | :-- | :-- |
| `customers` | افزودن `created_by_user_id` (+ایندکس و FK)؛ اختیاری شدن `first_name`, `last_name`, `mobile` | رکوردها دست‌نخورده؛ مالک = `NULL` |
| `users` | افزودن `customers_scope` (پیش‌فرض `all`) + ایندکس | دسترسی فعلی همه کاربران حفظ می‌شود |
| `user_staff_access` | جدول جدید | خالی |
| `user_customer_access` | جدول جدید | خالی |
| `parts` | افزودن `stock_quantity`, `min_stock_quantity` (پیش‌فرض `0`) و `unit_label` (پیش‌فرض «عدد») | موجودی صفر تا «ورود کالا» ثبت شود |
| `customer_parts` | افزودن `quantity` (پیش‌فرض `1`), `invoice_number`, `invoice_amount`, `assigned_by_user_id` | هر تخصیص قدیمی = ۱ دستگاه؛ فاکتور خالی |
| `inventory_logs` | جدول جدید با چهار نوع عملیات | خالی؛ از لحظه ارتقا پر می‌شود |
| `permissions` | افزودن `inventory.manage` و `inventory.logs` | اعطای خودکار به دارندگان `parts.manage`/`parts.view` و مدیران ارشد |
| `model_has_permissions` | افزودن ردیف برای دو مجوز جدید | هیچ ردیفی حذف نمی‌شود |
| `migrations` | ثبت شش مایگریشن `000014` تا `000019` | — |

---

**پایان راهنمای ارتقا.** فهرست کامل تغییرات نسخه را در
[`CHANGELOG.md`](../../CHANGELOG.md) و گزارش تطبیق کد با معیارهای پذیرش را در
[`docs/ACCEPTANCE-REPORT-v2.0.0.fa.md`](../../docs/ACCEPTANCE-REPORT-v2.0.0.fa.md) ببینید.
