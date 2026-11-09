# راهنمای ارتقای سامانه از نسخه ۱ به ۲٫۰٫۰ روی cPanel

این سند مراحل دقیق ارتقای **بدون از دست رفتن داده** را برای نسخه‌ای که روی هاست اشتراکی
cPanel نصب شده است توضیح می‌دهد. برنامه روی cPanel معمولاً به این شکل مستقر است:

```
/home/CPANEL_USER/private_pro/project1/myc     ← بخش خصوصی (Laravel + vendor + .env)
/home/CPANEL_USER/public_html                   ← بخش عمومی (index.php + build + fonts)
```

> اگر مسیر شما متفاوت است، همان ساختار را در نظر بگیرید: فایل‌های «خصوصی» بیرون از
> `public_html` و فایل‌های «عمومی» داخل `public_html` قرار می‌گیرند.

---

## به‌روزرسانی ۲٫۰٫۱ (نسخه پچ رفع اشکال)

اگر نسخه ۲٫۰٫۰ را نصب کرده‌اید، برای رسیدن به ۲٫۰٫۱ **هیچ تغییری در دیتابیس لازم نیست** و
اجرای دوباره فایل SQL ضروری نیست. فقط فایل‌های بک‌اند/فرانت‌اند این نسخه را جایگزین کنید:

```
backend/app/Exports/CustomersTemplateExport.php
backend/app/Http/Controllers/Api/V1/CustomerController.php
backend/app/Http/Controllers/Api/V1/InventoryController.php
backend/app/Http/Controllers/Api/V1/PartController.php
backend/app/Http/Controllers/Api/V1/SmsController.php
backend/app/Imports/CustomersImport.php
backend/app/Models/Customer.php
backend/database/seeders/DatabaseSeeder.php
frontend/ (فقط اجرای build و آپلود پوشه build در public_html)
```

سپس در `public_html` فایل‌های build جدید را جایگزین کنید و یک‌بار `php artisan config:clear`
(یا از Route پاک‌سازی کش) را اجرا کنید. جزئیات فهرست کامل فایل‌ها در بخش ۱ آمده است.

---


## ۰) پیش از هر کاری: بکاپ کامل

1. **بکاپ دیتابیس:** cPanel → phpMyAdmin → دیتابیس سامانه → تب Export → روش
   *Quick – SQL* → دانلود فایل `.sql`.
2. **بکاپ فایل‌ها:** cPanel → File Manager → روی پوشه برنامه راست‌کلیک →
   Compress → فایل `.zip` بسازید و دانلود کنید. حداقل این دو مورد را نگه دارید:
   - `.env` (کلید `APP_KEY` و اطلاعات دیتابیس)
   - پوشه `storage/` (فایل‌های آپلودشده کاربران و لاگ‌ها)
3. مطمئن شوید در ساعات کم‌ترافیک این کار را انجام می‌دهید؛ در حین آپلود فایل‌های
   جدید، کاربران ممکن است چند دقیقه خطا ببینند.

> ⛔ **هرگز** پوشه `storage/`، فایل `.env`، پوشه `vendor/` و دیتابیس را حذف/بازنویسی
> نکنید. نسخه ۲ هیچ‌کدام را نیاز ندارد.

---

## ۱) فهرست دقیق فایل‌های تغییر‌یافته و جدید

### الف) فایل‌های جدید بک‌اند

```
backend/app/Http/Controllers/Api/V1/InventoryController.php
backend/app/Models/CustomerAccessGrant.php
backend/app/Models/InventoryLog.php
backend/app/Services/Customers/CustomerAccessService.php
backend/app/Services/Inventory/InventoryService.php
backend/database/migrations/2025_01_01_000001_add_customer_ownership_and_access_grants.php
backend/database/migrations/2025_01_01_000002_add_device_quantity_invoice_and_inventory.php
backend/database/migrations/2025_01_01_000003_seed_inventory_permissions_and_backfill.php
backend/public/css/vazirmatn.css                       (بازنویسی‌شده — نسخه FD)
backend/public/fonts/Vazirmatn-FD-Thin.woff2
backend/public/fonts/Vazirmatn-FD-ExtraLight.woff2
backend/public/fonts/Vazirmatn-FD-Light.woff2
backend/public/fonts/Vazirmatn-FD-Regular.woff2
backend/public/fonts/Vazirmatn-FD-Medium.woff2
backend/public/fonts/Vazirmatn-FD-SemiBold.woff2
backend/public/fonts/Vazirmatn-FD-Bold.woff2
backend/public/fonts/Vazirmatn-FD-ExtraBold.woff2
backend/public/fonts/Vazirmatn-FD-Black.woff2
```

### ب) فایل‌های تغییر‌یافته بک‌اند

```
backend/app/Exports/CustomersExport.php
backend/app/Exports/CustomersTemplateExport.php
backend/app/Filament/Resources/CustomerResource.php
backend/app/Filament/Resources/PartResource.php
backend/app/Filament/Resources/UserResource.php
backend/app/Http/Controllers/Api/V1/AuthController.php
backend/app/Http/Controllers/Api/V1/CustomerController.php
backend/app/Http/Controllers/Api/V1/DashboardController.php
backend/app/Http/Controllers/Api/V1/PartController.php
backend/app/Http/Controllers/Api/V1/SmsController.php
backend/app/Http/Controllers/Api/V1/UserController.php
backend/app/Http/Controllers/Controller.php
backend/app/Imports/CustomersImport.php
backend/app/Models/Customer.php
backend/app/Models/CustomerPart.php
backend/app/Models/Part.php
backend/app/Models/User.php
backend/app/Providers/Filament/AdminPanelProvider.php
backend/app/Services/Customers/CustomerService.php
backend/config/app.php
backend/config/scramble.php
backend/database/seeders/DatabaseSeeder.php
backend/routes/api.php
```

### ج) فایل‌های جدید فرانت‌اند

```
frontend/src/components/parts/AssignDeviceModal.tsx
frontend/src/components/parts/StockMovementModal.tsx
frontend/src/components/settings/CustomerAccessEditor.tsx
frontend/src/version.ts
frontend/public/fonts/Vazirmatn-FD-Thin.woff2
frontend/public/fonts/Vazirmatn-FD-ExtraLight.woff2
frontend/public/fonts/Vazirmatn-FD-Light.woff2
frontend/public/fonts/Vazirmatn-FD-Regular.woff2
frontend/public/fonts/Vazirmatn-FD-Medium.woff2
frontend/public/fonts/Vazirmatn-FD-SemiBold.woff2
frontend/public/fonts/Vazirmatn-FD-Bold.woff2
frontend/public/fonts/Vazirmatn-FD-ExtraBold.woff2
frontend/public/fonts/Vazirmatn-FD-Black.woff2
```

### د) فایل‌های تغییر‌یافته فرانت‌اند

```
frontend/index.html
frontend/package.json
frontend/package-lock.json
frontend/src/App.tsx
frontend/src/components/customers/CustomerFormModal.tsx
frontend/src/components/parts/ServiceHistoryModal.tsx
frontend/src/components/ui/DatePicker.tsx
frontend/src/index.css
frontend/src/layouts/GlobalSearch.tsx
frontend/src/layouts/Sidebar.tsx
frontend/src/layouts/nav.ts
frontend/src/main.tsx
frontend/src/pages/CustomerDetail.tsx
frontend/src/pages/Customers.tsx
frontend/src/pages/Dashboard.tsx
frontend/src/pages/Inventory.tsx
frontend/src/pages/Login.tsx
frontend/src/pages/Parts.tsx
frontend/src/pages/settings/CreateUserPage.tsx
frontend/src/pages/settings/EditUserPage.tsx
frontend/src/pages/settings/UsersAclPage.tsx
frontend/src/services/api.ts
frontend/src/types/index.ts
frontend/src/utils/format.ts
frontend/src/utils/meta.ts
```

### ه) فایل حذف‌شده

```
frontend/src/components/parts/AssignPartModal.tsx
```

این فایل با `AssignDeviceModal.tsx` جایگزین شده است. اگر در هاست باقی بماند خطایی
ایجاد نمی‌کند، اما بهتر است حذف شود.

### و) بسته انتشار و مستندات

```
deploy/cpanel/sql/2025_01_01_upgrade_v2_0_0.sql   (اجرای دستی دیتابیس در phpMyAdmin)
deploy/cpanel/build.sh                            (بسته‌بندی فونت‌ها در release)
CHANGELOG.md
docs/upgrade-v2-cpanel.fa.md                      (همین فایل)
docs/PHASE3-ACCEPTANCE.fa.md                      (چک‌لیست پذیرش)
```

> **نکته مهم:** در cPanel نیازی به کپی کردن پوشه `frontend/src` نیست؛ فقط خروجی
> ساخته‌شده (`frontend/dist`) در `public_html` قرار می‌گیرد. اگر بسته نهایی
> `cpanel-public.zip` و `cpanel-private.zip` را از `deploy/cpanel/build.sh`
> ساخته‌اید، همان دو ZIP کافی است و این فهرست برای جایگزینی دستی فایل‌ها است.

---

## ۲) جایگزینی فایل‌ها

### روش A — استفاده از بسته آماده (پیشنهادی)

```bash
cd deploy/cpanel
bash build.sh
# خروجی در پوشه cpanel-release/ ساخته می‌شود:
#   cpanel-public.zip  → محتوای public_html
#   cpanel-private.zip → پوشه خصوصی برنامه (بدون .env و vendor)
```

سپس:

1. محتوای `cpanel-public.zip` را در `public_html` آپلود/Extract کنید.
2. محتوای `cpanel-private.zip` را در پوشه خصوصی برنامه (مثلاً
   `private_pro/project1/myc`) آپلود/Extract کنید.
3. **`.env` قدیمی را دست نزنید؛** اگر بسته فایل `.env.cpanel.example` را آورد، فقط
   برای مرجع است.
4. مطمئن شوید پوشه‌های `storage/` و `bootstrap/cache/` قابل نوشتن هستند (مجوز 775).

### روش B — جایگزینی دستی

1. فایل‌های بخش «الف/ب» را در پوشه خصوصی برنامه جایگزین کنید.
2. محتوای `frontend/dist` (پس از `npm ci && npm run build`) را در `public_html`
   بریزید تا `assets/`، `fonts/` و `index.html` جدید جایگزین شوند.
3. فایل‌های `backend/public/css/vazirmatn.css` و `backend/public/fonts/` را در
   `public_html/css/` و `public_html/fonts/` کپی کنید (برای فونت پنل `/admin`).
4. اگر با SSH نیستید و امکان build ندارید، از بسته آماده روش A استفاده کنید.

> پس از جایگزینی، اگر صفحه سفید شد، ابتدا `public_html/index.php` و
> `resolve-private.php`/`private-path.php` را بررسی کنید؛ آدرس پوشه خصوصی باید
> همان مسیر قبلی باشد.

---

## ۳) ارتقای دیتابیس (بدون از دست رفتن داده)

### روش A — از طریق مرورگر (بدون SSH)

1. فایل `update.php` را (از بسته) در `public_html` قرار دهید.
2. به `https://دامنه/update.php` بروید.
3. کلید `APP_KEY` را از فایل `.env` کپی و در فرم وارد کنید.
4. دکمه اجرا را بزنید. خروجی باید وضعیت مایگریشن‌های جدید را `Ran` نشان دهد.
5. فایل `update.php` بعد از اجرای موفق خودش را حذف می‌کند؛ در غیر این صورت
   دستی حذفش کنید.

### روش B — phpMyAdmin (اجرای SQL دستی)

1. cPanel → phpMyAdmin → دیتابیس سامانه.
2. تب **Import** → فایل `deploy/cpanel/sql/2025_01_01_upgrade_v2_0_0.sql` را انتخاب کنید.
3. گزینه *Allow the interruption of an import in case the script detects it is close
   to the PHP timeout* را فعال کنید و **Go** بزنید.
4. در انتهای اجرا یک `SELECT` گزارش می‌دهد؛ همه ستون‌ها باید مقدار `1` داشته باشند:

| بررسی | مقدار مورد انتظار |
|---|---|
| `users_data_scope` | 1 |
| `customers_created_by` | 1 |
| `parts_stock_quantity` | 1 |
| `customer_parts_quantity` | 1 |
| `inventory_logs_table` | 1 |
| `customer_access_grants_table` | 1 |

این اسکریپت **Idempotent** است: اجرای دوباره آن خطا نمی‌دهد و موجودی واقعی را
بازنویسی نمی‌کند.

### روش C — SSH / Terminal (اگر دارید)

```bash
cd /home/CPANEL_USER/private_pro/project1/myc
php artisan migrate --force
php artisan optimize:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

> اگر `php` در PATH نیست، از مسیر کامل استفاده کنید، مثلاً
> `/opt/cpanel/ea-php84/root/usr/bin/php artisan migrate --force`.

### بعد از هر سه روش

```bash
php artisan optimize:clear   # یا حذف فایل‌های bootstrap/cache/*.php از File Manager
```

سپس یک‌بار از حساب مدیر ارشد خارج و دوباره وارد شوید تا مجوزهای جدید در توکن
کاربر بارگذاری شوند.

---

## ۴) بررسی صحت ارتقا (Smoke Test)

- [ ] ورود با حساب مدیر ارشد انجام می‌شود و فرم ورود خالی است (بدون مقدار پیش‌فرض).
- [ ] منو شامل «کاتالوگ و تخصیص دستگاه‌ها» و «انبار و تاریخچه ورود/خروج» است.
- [ ] صفحه مشتریان، ستون «دستگاه‌های تخصیص‌یافته» را با تعداد صحیح نشان می‌دهد.
- [ ] باز کردن یک دستگاه در پرونده مشتری، دکمه‌های **ویرایش** و **حذف** دارد و
      عملیات با موفقیت انجام و موجودی انبار اصلاح می‌شود.
- [ ] فرم تخصیص دستگاه باز می‌شود، تقویم شمسی روی همه فیلدها باز و انتخاب تاریخ
      ثبت می‌شود (مشکل z-index برطرف شده).
- [ ] ثبت ورود کالا در «انبار» موجودی را افزایش و یک ردیف لاگ ایجاد می‌کند.
- [ ] تلاش برای خروج بیش از موجودی، پیام خطای واضح می‌دهد و موجودی منفی نمی‌شود.
- [ ] در «کاربران»، ساخت کاربر «کارمند فروش» با دامنه «فقط مشتریان خودم» کار
      می‌کند و آن کاربر فقط مشتریان خودش را می‌بیند.
- [ ] اعطای استثنا در ویرایش کاربر (مشتریان کارمند دیگر یا مشتری خاص) باعث دیده
      شدن آن مشتری برای کاربر می‌شود.
- [ ] خروجی اکسل مشتریان شامل نام دستگاه، تعداد، شماره و مبلغ فاکتور است.
- [ ] دانلود CSV در Excel فارسی سالم نمایش داده می‌شود (UTF-8 BOM).
- [ ] فونت کل سامانه وزیرمتن است و اعداد در جدول‌ها و فرم‌ها فارسی نمایش داده می‌شوند.
- [ ] ثبت مشتری حقوقی بدون نام/نام‌خانوادگی و بدون موبایل موفق است؛ برای شخص
      حقیقی، نام و نام‌خانوادگی اجباری است.

جزئیات کامل تست هر تسک در `docs/PHASE3-ACCEPTANCE.fa.md` آمده است.

---

## ۵) بازگردانی (Rollback)

اگر پس از ارتقا مشکلی جدی دیدید:

1. فایل‌های نسخه قبل را از بکاپ ZIP بازگردانید.
2. دیتابیس را از فایل `.sql` بکاپ Import کنید.
   - اگر فقط می‌خواهید ستون‌های جدید را حذف کنید (بدون بازگردانی داده)، **این کار
     لازم نیست**؛ ستون‌های جدید با مقادیر پیش‌فرض، با نسخه ۱ تداخل ندارند و حذف
     آن‌ها باعث از دست رفتن موجودی و لاگ انبار می‌شود.
3. `bootstrap/cache/*.php` را حذف و `php artisan optimize:clear` اجرا کنید.

> مایگریشن‌های نسخه ۲ فقط `ADD COLUMN`/`CREATE TABLE` و شل‌کردن دو ستون
> (`NULL` شدن نام و موبایل) هستند؛ **هیچ ستون یا ردیفی حذف نمی‌شود**. به همین
> دلیل بازگردانی دیتابیس معمولاً فقط برای بازگشت کامل به نسخه قبل لازم است.

---

## ۶) خطاهای رایج و راه‌حل

| نشانه | علت | راه‌حل |
|---|---|---|
| صفحه سفید بعد از آپلود | کش config قدیمی یا مسیر خصوصی اشتباه | `php artisan optimize:clear` یا حذف `bootstrap/cache/*.php`؛ بررسی `private-path.php` |
| خطای ۵۰۰ `Base table or view not found: inventory_logs` | اسکریپت دیتابیس اجرا نشده | بخش ۳ همین سند را انجام دهید |
| خطای ۴۰۳ روی دکمه‌های ویرایش/حذف تخصیص | مجوزهای جدید به کاربر داده نشده | SQL بخش ۹ فایل ارتقا را اجرا کنید یا از فرم «کاربران» مجوز بدهید |
| فونت پیش‌فرض به‌جای وزیرمتن | فایل‌های `fonts/` آپلود نشده‌اند | پوشه `fonts/` و `css/vazirmatn.css` را در `public_html` قرار دهید |
| تقویم شمسی باز نمی‌شود | نسخه قدیمی `assets/` در کش مرورگر | `frontend/dist` جدید را جایگزین و کش مرورگر را پاک کنید (Ctrl+F5) |
| `SQLSTATE[42000]` هنگام `MODIFY first_name` | نوع ستون در نصب قبلی متفاوت است | نوع ستون فعلی را در phpMyAdmin ببینید و `VARCHAR(255)` را با همان نوع جایگزین کنید؛ عملیات فقط `NULL` شدن را تغییر می‌دهد |
| خطای `Index name too long` در MySQL 5.6 | محدودیت ۶۴ کاراکتری نام ایندکس | نام ایندکس‌ها در اسکریپت کوتاه هستند؛ اگر دستی تغییر دادید، کوتاه کنید |
| خروجی CSV در Excel به‌هم‌ریخته است | فایل با BOM ذخیره نشده | از دکمه «CSV» خود سامانه استفاده کنید (BOM دارد) یا فایل را با UTF-8 ذخیره کنید |

---

## ۷) یادآوری امنیتی

- حساب پیش‌فرض `admin@crm.local` فقط برای نصب اولیه است. اگر هنوز رمز پیش‌فرض
  `Admin@123456` را تغییر نداده‌اید، **همین حالا** از صفحه «پروفایل من» عوض کنید.
- `APP_DEBUG` باید در `.env` روی `false` باشد.
- فایل `update.php` و `install.php` بعد از استفاده باید از `public_html` حذف شوند.
- از دیتابیس و پوشه `storage/` به‌صورت زمان‌بندی‌شده بکاپ بگیرید.
