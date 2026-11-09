# 📋 فاز اول — تحلیل کدبیس، طراحی دیتابیس و برنامه اجرایی ارتقا به `v2.0.0`

> تاریخ تحلیل: ۲۰۲۶-11-09 · شاخه: `arena/9853e259-industrial-crm-project` · نسخه فعلی: `v1.x` (بدون شماره نسخه رسمی)
> هدف: ارتقای سامانه CRM صنعتی به `v2.0.0` با **حفظ کامل داده‌های تولیدی (Zero Data Loss)** و قابلیت جایگزینی روی هاست cPanel بدون SSH.

---

## ۱) نقشه فعلی سامانه (As-Is)

### ۱.۱ پشته فناوری

| لایه | فناوری | مسیر |
| :-- | :-- | :-- |
| فرانت‌اند (SPA) | React 19 + TypeScript + Vite 8 + Tailwind v4 + DaisyUI 5 + React Query v5 + Zustand | `frontend/` |
| بک‌اند (API) | Laravel 11 (PHP 8.4) + Sanctum + Spatie Permission (Pure ACL) + Maatwebsite Excel | `backend/` |
| پنل ادمین ثانویه | Filament v3 (`/admin`) | `backend/app/Filament` |
| دیتابیس | MySQL/MariaDB روی cPanel (پروداکشن) · PostgreSQL 15 در Docker (توسعه) | `backend/config/database.php` |
| استقرار | بسته دو تکه `cpanel-public.zip` + `cpanel-private.zip`، ویزارد `install.php`، ارتقا با `update.php` | `deploy/cpanel/` |

### ۱.۲ جداول موجود دیتابیس

`users`, `password_reset_tokens`, `sessions`, `cache`, `cache_locks`, `jobs`, `job_batches`, `failed_jobs`,
`personal_access_tokens`, `permissions`, `roles`, `model_has_permissions`, `model_has_roles`, `role_has_permissions`,
`customers`, `parts`, `customer_parts`, `part_service_histories`, `customer_histories`, `sms_logs`, `settings`, `migrations`

### ۱.۳ نقاط تماس کلیدی کد (برای هر تسک)

| تسک | فایل‌های درگیر |
| :-- | :-- |
| RBAC/ACL | `backend/app/Models/{User,Customer}.php`, `backend/app/Http/Controllers/Api/V1/{CustomerController,PartController,UserController,AuthController,DashboardController,SmsController}.php`, `frontend/src/pages/settings/{UsersAclPage,CreateUserPage,EditUserPage}.tsx`, `frontend/src/store/useAuthStore.ts`, `frontend/src/types/index.ts` |
| قطعه → دستگاه | ۱۰۴ occurrence در ۲۱ فایل (فرانت، بک‌اند، Filament، Seeder، Scramble) |
| مدیریت تخصیص | `backend/app/Services/Customers/CustomerService.php`, `backend/app/Http/Controllers/Api/V1/PartController.php`, `frontend/src/components/parts/AssignPartModal.tsx`, `frontend/src/pages/CustomerDetail.tsx` |
| انبار و لاگ | `backend/app/Models/Part.php`, `backend/app/Services/*` (سرویس جدید), صفحه جدید انبار در فرانت |
| اعتبارسنجی مشتری | `backend/app/Http/Controllers/Api/V1/CustomerController.php`, `backend/app/Imports/CustomersImport.php`, `frontend/src/components/customers/CustomerFormModal.tsx` |
| خروجی اکسل | `backend/app/Exports/CustomersExport.php`, `backend/app/Exports/CustomersTemplateExport.php` |
| تقویم (DatePicker) | `frontend/src/components/ui/DatePicker.tsx`, `frontend/src/components/ui/Modal.tsx` |
| فرم لاگین | `frontend/src/pages/Login.tsx` |
| فونت و ارقام | `frontend/src/index.css`, `frontend/src/main.tsx`, `frontend/package.json`, `backend/public/css/vazirmatn.css`, `backend/app/Providers/Filament/AdminPanelProvider.php`, `deploy/cpanel/build.sh` |

---

## ۲) باگ‌های کشف‌شده حین تحلیل (علاوه بر لیست کارفرما)

| # | باگ | محل | اثر |
| :- | :-- | :-- | :-- |
| B1 | **صفحه‌بندی (Pagination) خراب**: کامپوننت `Pagination` انتظار «تعداد کل رکوردها» را دارد اما `Customers.tsx` مقدار `last_page` را به آن می‌دهد → `pages = ceil(last_page / 10)` و متن «نمایش X تا Y» کاملاً غلط | `frontend/src/components/ui/Pagination.tsx` + `frontend/src/pages/Customers.tsx` | با بیش از ۱۰ صفحه، دسترسی به صفحات بعدی غیرممکن |
| B2 | `customers.mobile`, `first_name`, `last_name` در دیتابیس **NOT NULL** هستند؛ برای مشتری حقوقی بدون نام/موبایل (تسک ۵) حتی در صورت اصلاح ولیدیشن، `INSERT` با خطای SQL شکست می‌خورد | `backend/database/migrations/2024_01_01_000005_create_customers_table.php` | تسک ۵ بدون تغییر schema قابل پاس شدن نیست |
| B3 | `Customer::getFullNameAttribute()` فقط `first_name + last_name` است → برای مشتری حقوقی بدون نام، عنوان خالی می‌شود | `backend/app/Models/Customer.php` + `frontend/src/utils/format.ts` | نمایش «—» یا عنوان خالی در جدول، تاریخچه و اکسل |
| B4 | جستجوی مشتریان از `whereRaw("CONCAT(first_name,' ',last_name) LIKE ?")` استفاده می‌کند؛ در MySQL اگر یکی از دو `NULL` باشد نتیجه `NULL` است → رکورد پیدا نمی‌شود | `backend/app/Http/Controllers/Api/V1/CustomerController.php` | جستجوی مشتری حقوقی پس از تسک ۵ شکست می‌خورد |
| B5 | ورودی اکسل (`CustomersImport`) کلید یکتایی را `mobile` قرار داده → با اختیاری شدن موبایل، مشتریان بدون موبایل هر بار **تکراری** ساخته می‌شوند | `backend/app/Imports/CustomersImport.php` | داده تکراری در پروداکشن |
| B6 | هیچ رکورد «چه کسی مشتری را ثبت کرد» وجود ندارد → پیش‌نیاز تسک ۱ در دیتابیس موجود نیست | `customers` | مالکیت مشتری قابل استعلام نیست |
| B7 | موجودی انبار وجود ندارد؛ `customer_parts` هم `quantity` ندارد → هر ردیف = ۱ عدد با سریال یکتا | `parts`, `customer_parts` | تسک ۳ و ۴ بدون schema جدید ممکن نیست |
| B8 | تخصیص دستگاه **بدون Transaction** انجام می‌شود (`CustomerService::assignPart`) → در خطای میانی، تاریخچه/تغییر وضعیت نیمه‌کاره می‌ماند | `backend/app/Services/Customers/CustomerService.php` | نقض قانون ۳ (تراکنش) |
| B9 | عملیات «ویرایش/حذف تخصیص» و «ویرایش/حذف سابقه سرویس» هیچ endpoint و UI ندارد | `backend/routes/api.php`, `frontend/src/pages/CustomerDetail.tsx` | باگ گزارش‌شده در تسک ۳ |
| B10 | پاپ‌آپ تقویم داخل `<dialog>` و کانتینر `overflow-y-auto` رندر می‌شود → بریده شدن/زیر هدر رفتن | `frontend/src/components/ui/DatePicker.tsx` + `Modal.tsx` | تسک ۷ |
| B11 | مقادیر پیش‌فرض `admin@crm.local` / `Admin@123456` در `defaultValues` فرم لاگین + باکس نمایش رمز در صفحه ورود | `frontend/src/pages/Login.tsx` | تسک ۸ (نشتی اطلاعات ورود) |
| B12 | فونت `font-mono` (Tailwind) برای شماره‌ها/سریال‌ها/مقادیر عددی، فونت وزیرمتن را **دور می‌زند** → ارقام انگلیسی | `frontend/src/index.css` | تسک ۹ |
| B13 | فونت وزیرمتن پنل Filament از `backend/public/css/vazirmatn.css` لود می‌شود اما `deploy/cpanel/build.sh` تنها `index.php`, `private-path.php`, `resolve-private.php` را از `backend/public` کپی می‌کند → در بسته cPanel این CSS و فونت‌ها **وجود ندارند** | `deploy/cpanel/build.sh` | فونت پنل ادمین روی هاست اعمال نمی‌شود |
| B14 | خروجی اکسل مشتریان هیچ ستونی برای دستگاه‌ها/سریال/فاکتور ندارد | `backend/app/Exports/CustomersExport.php` | تسک ۶ |

---

## ۳) طراحی دیتابیس جدید (Schema Design) — همه تغییرات **افزودنی و برگشت‌پذیر**

> اصل حاکم: **هیچ ستون/جدولی DROP نمی‌شود، هیچ داده‌ای بازنویسی مخرب نمی‌شود.** تنها `NOT NULL → NULL` (که همیشه امن است) و افزودن ستون/جدول/ایندکس انجام می‌شود.
> همه مایگریشن‌ها با گارد `Schema::hasTable()` / `Schema::hasColumn()` نوشته می‌شوند تا **Idempotent** باشند (اجرای دوباره روی هاست خطا ندهد) و روی هر دو درایور MySQL و PostgreSQL کار کنند.

### ۳.۱ `customers` (تغییر)

| ستون | نوع | توضیح |
| :-- | :-- | :-- |
| `created_by_user_id` | `BIGINT UNSIGNED NULL` + FK → `users.id` (`ON DELETE SET NULL`) + index | مالک/ثبت‌کننده مشتری (پایه تسک ۱) |
| `first_name` | `VARCHAR(255) NULL` (قبلاً NOT NULL) | تسک ۵ |
| `last_name` | `VARCHAR(255) NULL` (قبلاً NOT NULL) | تسک ۵ |
| `mobile` | `VARCHAR(255) NULL` (قبلاً NOT NULL) | تسک ۵ |

### ۳.۲ `users` (تغییر)

| ستون | نوع | توضیح |
| :-- | :-- | :-- |
| `customers_scope` | `VARCHAR(20) NOT NULL DEFAULT 'all'` | دامنه دسترسی: `all` (همه مشتریان) یا `own` (خود + استثناها). مقدار پیش‌فرض `all` **عمداً** انتخاب شده تا کاربران فعلی پروداکشن قفل نشوند |
| `user_type` | بدون تغییر schema؛ مقادیر مجاز توسعه می‌یابد: `administrator`, `manager`, **`salesperson`**, **`installer`** | نقش سازمانی (RBAC) |

### ۳.۳ جداول جدید دسترسی دانه‌ای (Granular ACL)

```text
user_staff_access       → دسترسی به مشتریانِ یک/چند کارمند خاص
  id BIGINT UNSIGNED PK
  user_id   BIGINT UNSIGNED NOT NULL  FK users(id)    ON DELETE CASCADE
  staff_id  BIGINT UNSIGNED NOT NULL  FK users(id)    ON DELETE CASCADE
  timestamps
  UNIQUE (user_id, staff_id)

user_customer_access    → دسترسی به یک/چند مشتری خاص (تکی)
  id BIGINT PK
  user_id     BIGINT UNSIGNED NOT NULL FK users(id)     ON DELETE CASCADE
  customer_id BIGINT UNSIGNED NOT NULL FK customers(id) ON DELETE CASCADE
  timestamps
  UNIQUE (user_id, customer_id)
```

### ۳.۴ `parts` (تغییر — تبدیل به «دستگاه» با موجودی انبار)

| ستون | نوع | توضیح |
| :-- | :-- | :-- |
| `stock_quantity` | `INT NOT NULL DEFAULT 0` | موجودی کل انبار |
| `min_stock_quantity` | `INT NOT NULL DEFAULT 0` | حد هشدار کمبود موجودی |

### ۳.۵ `customer_parts` (تغییر — رکورد تخصیص دستگاه)

| ستون | نوع | توضیح |
| :-- | :-- | :-- |
| `quantity` | `INT NOT NULL DEFAULT 1` | تعداد (تسک ۳) |
| `invoice_amount` | `DECIMAL(14,2) NULL` | مبلغ فاکتور (تسک ۳) |
| `invoice_number` | `VARCHAR(50) NULL` + index | شماره فاکتور اختیاری (تسک ۳) |
| `assigned_by_user_id` | `BIGINT UNSIGNED NULL` FK → `users` (`SET NULL`) + index | ثبت‌کننده تخصیص (تسک ۴) |

### ۳.۶ `inventory_logs` (جدول جدید — تاریخچه ورود/خروج)

```text
id                BIGINT UNSIGNED PK
part_id           BIGINT UNSIGNED NOT NULL  FK parts(id)          ON DELETE CASCADE
customer_id       BIGINT UNSIGNED NULL      FK customers(id)      ON DELETE SET NULL
customer_part_id  BIGINT UNSIGNED NULL      FK customer_parts(id) ON DELETE SET NULL
user_id           BIGINT UNSIGNED NULL      FK users(id)          ON DELETE SET NULL   ← ثبت‌کننده
type              VARCHAR(20) NOT NULL      -- in | out | return | adjustment
quantity          INT NOT NULL              -- همیشه عدد مثبت؛ جهت از روی type
stock_before      INT NOT NULL DEFAULT 0
stock_after       INT NOT NULL DEFAULT 0
reference         VARCHAR(100) NULL         -- شماره فاکتور/سریال مرتبط
notes             TEXT NULL
created_at / updated_at
INDEX: part_id, customer_id, user_id, type, created_at
```

### ۳.۷ `permissions` (داده جدید — بدون تغییر schema)

| مجوز جدید | برچسب فارسی |
| :-- | :-- |
| `inventory.manage` | مدیریت موجودی انبار (ورود/خروج/اصلاح) |
| `inventory.logs` | مشاهده تاریخچه ورود و خروج انبار |

> ⚠️ **تصمیم معماری مهم:** نام مجوزهای موجود (`parts.view`, `parts.manage`, `parts.assign`, `parts.history`) **تغییر نمی‌کند**؛ فقط «برچسب نمایشی» آن‌ها به «دستگاه» تغییر می‌یابد. تغییر نام کلید مجوزها باعث بی‌اثر شدن `model_has_permissions` کاربران فعلی و نقض Zero Data Loss می‌شد.

### ۳.۸ نقش‌ها و پیش‌فرض دسترسی‌ها (`backend/config/acl.php` — فایل جدید)

| نقش (`user_type`) | برچسب | دامنه پیش‌فرض | مجوزهای پیش‌فرض |
| :-- | :-- | :-- | :-- |
| `administrator` | مدیر ارشد سامانه | `all` | همه مجوزها |
| `manager` | مدیر / سرپرست | `all` | همه به‌جز `users.manage`, `settings.manage` |
| `salesperson` | کارمند فروش | `own` | `customers.view/create/edit`, `parts.view`, `parts.assign`, `parts.history`, `sms.send`, `inventory.logs` |
| `installer` | نصاب | `own` | `customers.view`, `parts.view`, `parts.history`, `inventory.logs` |

**الگوریتم تعیین دامنه (`own`)** — مشتری در یکی از حالات زیر قابل مشاهده است:
1. `customers.created_by_user_id = user.id` (مشتریان خودش)
2. `customer_id ∈ user_customer_access` (دسترسی تکی اعطاشده توسط مدیر)
3. `created_by_user_id ∈ user_staff_access.staff_id` (دسترسی به مشتریان یک/چند کارمند خاص)
4. کاربر روی آن مشتری اقدام فنی ثبت کرده باشد (تخصیص دستگاه با `assigned_by_user_id = user.id` یا سابقه سرویس با `performed_by_user_id = user.id`) — لازم برای کارکرد نقش «نصاب»

---

## ۴) ترتیب اجرایی تسک‌ها (اولویت فنی) و معیار پذیرش

> ترتیب بر اساس «وابستگی داده‌ای» چیده شده: اول schema، بعد لایه سرویس/کنترلر، بعد UI، و در آخر کارهای ظاهریِ بدون وابستگی.

### گام ۱ — زیرساخت دیتابیس (پیش‌نیاز تسک‌های ۱، ۳، ۴، ۵)
**فایل‌ها:** `backend/database/migrations/2024_01_01_000014..000019_*.php`, `backend/config/acl.php`
**AC:** اجرای `php artisan migrate --force` روی دیتابیس پروداکشنِ دارای داده، بدون از دست رفتن حتی یک رکورد؛ اجرای مجدد همان مایگریشن‌ها بدون خطا (Idempotent)؛ `migrate:status` همه را Ran نشان دهد.

### گام ۲ — تسک ۱: RBAC و دسترسی دانه‌ای مشتریان
**فایل‌ها:** `app/Models/{User,Customer}.php`, `app/Services/Acl/CustomerAccessService.php` (جدید), `app/Http/Controllers/Api/V1/{CustomerController,PartController,UserController,AuthController,DashboardController,SmsController}.php`, `routes/api.php`, `frontend/src/{types/index.ts,services/api.ts,store/useAuthStore.ts}`, `frontend/src/pages/settings/{UsersAclPage,CreateUserPage,EditUserPage}.tsx`, `frontend/src/pages/Customers.tsx`
**AC:**
- کاربر با نقش «کارمند فروش» و دامنه `own` در `GET /api/v1/customers` فقط مشتریان خودش (+ استثناهای اعطاشده) را دریافت می‌کند.
- درخواست `GET /api/v1/customers/{id}` روی مشتری متعلق به دیگری → پاسخ `403` (نه فقط پنهان‌سازی در UI).
- مدیر می‌تواند در فرم ویرایش کاربر، هر سه حالت استثنا (همه مشتریان / مشتریان کارمندان مشخص / مشتریان تکی) را اعطا یا لغو کند و نتیجه فوراً در کوئری‌ها اعمال شود.
- همان محدودیت روی `update`, `destroy`, `export`, تخصیص دستگاه، ثبت سابقه سرویس و آمار داشبورد نیز اعمال شود.

### گام ۳ — تسک ۴: سرویس انبار، کسر/بازگشت موجودی و لاگ (پیش‌نیاز تسک ۳)
**فایل‌ها:** `app/Models/{Part,InventoryLog,CustomerPart}.php`, `app/Services/Inventory/InventoryService.php` (جدید), `app/Services/Customers/CustomerService.php`, `app/Http/Controllers/Api/V1/{InventoryController,PartController}.php` (جدید/تغییر), `routes/api.php`
**AC:**
- تخصیص ۲ عدد از دستگاه X به مشتری Y توسط کارمند Z در یک `DB::transaction` انجام شود؛ `parts.stock_quantity` دقیقاً ۲ کاهش یابد؛ یک ردیف `inventory_logs` با `type=out`, `quantity=2`, `user_id=Z`, `customer_id=Y`, `stock_before/stock_after` صحیح ثبت شود.
- اگر موجودی کافی نباشد → خطای `422` با پیام فارسی و **هیچ تغییری** در دیتابیس (Rollback).
- حذف تخصیص → بازگشت همان تعداد به انبار با لاگ `type=return`.
- ویرایش تعداد از ۳ به ۱ → بازگشت ۲ عدد (`return`)؛ از ۱ به ۴ → کسر ۳ عدد (`out`).
- موجودی هیچ‌گاه منفی نشود (Check در سطح سرویس + `DB::raw` guarded update).
- `GET /api/v1/inventory/logs` با فیلترهای دستگاه/نوع/مشتری/کاربر/بازه تاریخ و صفحه‌بندی کار کند و نام کاربر + نام مشتری را برگرداند.

### گام ۴ — تسک ۳: مدیریت کامل دستگاه‌های تخصیص‌یافته
**فایل‌ها:** `app/Http/Controllers/Api/V1/PartController.php`, `app/Services/Customers/CustomerService.php`, `routes/api.php`, `frontend/src/components/parts/AssignPartModal.tsx`, `frontend/src/pages/CustomerDetail.tsx`, `frontend/src/{types/index.ts,services/api.ts}`
**AC:**
- `POST /customers/{id}/parts` فیلدهای `quantity` (پیش‌فرض ۱), `invoice_amount`, `invoice_number` (اختیاری) را بپذیرد.
- `PUT|POST /customer-parts/{id}` و `DELETE /customer-parts/{id}` موجود و دارای authorization باشند.
- `PUT|POST /service-histories/{id}` و `DELETE /service-histories/{id}` برای ویرایش/حذف سابقه خدمات.
- در تب «دستگاه‌های فیزیکی و سوابق خدمات» پروفایل مشتری، دکمه‌های ویرایش/حذف (هم برای تخصیص و هم برای سابقه سرویس) نمایش داده شوند و پس از عملیات، جدول بدون رفرش کل صفحه به‌روز شود.
- مقدار فاکتور با فرمت پولی فارسی (جداکننده هزارگان + «تومان») نمایش داده شود.

### گام ۵ — تسک ۵: اعتبارسنجی فرم مشتری (حقیقی/حقوقی)
**فایل‌ها:** `app/Http/Controllers/Api/V1/CustomerController.php`, `app/Models/Customer.php`, `app/Imports/CustomersImport.php`, `frontend/src/components/customers/CustomerFormModal.tsx`, `frontend/src/utils/format.ts`
**AC:**
- ثبت مشتری **حقوقی** فقط با `company_name` (بدون `first_name`, `last_name`, `mobile`) → `201 Created` بدون هیچ خطای فرم یا سرور.
- در حالت حقوقی، ستاره اجباری از روی «نام/نام خانوادگی/موبایل» حذف و روی «نام شرکت» درج شود؛ در حالت حقیقی «نام و نام خانوادگی» اجباری بماند.
- عنوان نمایشی مشتری حقوقی بدون نام → نام شرکت (رفع B3).
- جستجو و ورودی اکسل با `NULL` بودن این ستون‌ها درست کار کنند (رفع B4 و B5).

### گام ۶ — تسک ۶: خروجی اکسل کامل
**فایل‌ها:** `app/Exports/CustomersExport.php`, `app/Exports/CustomersExportSheets.php` (جدید), `app/Exports/CustomerDevicesExport.php` (جدید), `app/Exports/CustomersTemplateExport.php`, `app/Http/Controllers/Api/V1/CustomerController.php`
**AC:**
- فایل `.xlsx` با دو شیت: «مشتریان» (اطلاعات پایه + خلاصه دستگاه‌ها + جمع مبالغ) و «دستگاه‌های تخصیص‌یافته» (یک ردیف برای هر تخصیص: نام مشتری، نام دستگاه، کد، سریال، تعداد، شماره فاکتور، مبلغ فاکتور، تاریخ نصب، پایان گارانتی، وضعیت).
- خروجی به دامنه دسترسی کاربر (تسک ۱) محدود شود.
- فایل در Excel با کاراکترهای فارسی سالم باز شود (xlsx ذاتاً UTF-8 است) و هر خروجی CSV سمت کلاینت با `UTF-8 BOM` نوشته شود.
- ستون‌ها عرض خودکار، سرستون فارسی، اعداد به‌صورت عددی (نه متن) ثبت شوند.

### گام ۷ — تسک ۲: تغییر سراسری «قطعه/قطعات» به «دستگاه/دستگاه‌ها»
**فایل‌ها:** همه فایل‌های دارای برچسب فارسی (۲۱ فایل) شامل `frontend/src/{pages,components,layouts}`, `backend/app/{Http/Controllers,Services,Filament,Exports}`, `backend/database/seeders/DatabaseSeeder.php`, `backend/config/scramble.php`, `frontend/index.html`
**AC:** `grep -rn 'قطع' frontend/src backend/app backend/database backend/config` هیچ برچسب کاربری باقی‌مانده‌ای برنگرداند (فقط موارد فنی مثل نام متغیر/کلید مجوز `parts.*` که عمدی حفظ شده‌اند). نام منوها، عنوان صفحات، سرستون جدول‌ها، پیام‌های موفقیت/خطا و Placeholderها همه «دستگاه» باشند.

### گام ۸ — تسک ۷: رفع باگ تقویم شمسی
**فایل‌ها:** `frontend/src/components/ui/DatePicker.tsx`, `frontend/src/components/ui/Modal.tsx`, `frontend/src/index.css`
**AC:** پاپ‌آپ تقویم با **Portal روی `document.body`** و موقعیت‌یابی `fixed` رندر شود؛ در مودال تخصیص دستگاه، در رزولوشن‌های `360px` تا `1920px`، تقویم کاملاً روی همه المان‌ها (هدر جدول، فوتر مودال) دیده شود؛ همه روزها و ماه‌ها قابل کلیک باشند؛ با اسکرول مودال/صفحه و تغییر اندازه پنجره موقعیت پاپ‌آپ به‌روز بماند؛ با کلیک بیرون و `Esc` بسته شود.

### گام ۹ — تسک ۸: پاکسازی فرم لاگین
**فایل‌ها:** `frontend/src/pages/Login.tsx`
**AC:** `defaultValues` هر دو فیلد `''` باشد؛ هیچ `value` از پیش پرشده‌ای در DOM وجود نداشته باشد؛ باکس نمایش «نام کاربری/رمز» از صفحه ورود حذف شود؛ فقط `placeholder` مناسب باقی بماند.

### گام ۱۰ — تسک ۹: فونت وزیرمتن و ارقام فارسی سراسری
**فایل‌ها:** `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/index.css`, `frontend/src/main.tsx`, `backend/public/css/vazirmatn.css`, `backend/public/fonts/*`, `backend/app/Providers/Filament/AdminPanelProvider.php`, `deploy/cpanel/build.sh`
**AC:** فونت خانواده `Vazirmatn FD` (نسخه Farsi-Digits) روی `html, body, input, button, select, textarea, table` و متغیرهای `--font-sans` **و `--font-mono`** اعمال شود؛ هیچ رقم انگلیسی در جدول‌ها، قیمت‌ها، تاریخ‌ها، شماره سریال‌ها، اینپوت‌ها و صفحه‌بندی دیده نشود؛ مقدار واقعی ذخیره‌شده در اینپوت‌ها همان ASCII بماند (تا `regex`ها و دیتابیس نشکنند)؛ پنل Filament هم فونت وزیرمتن FD را از فایل لوکال (بدون CDN) بگیرد.

---

## ۵) استراتژی Zero Data Loss و سازگاری cPanel

1. **مایگریشن گارد‌دار:** هر مایگریشن با `Schema::hasColumn()` / `Schema::hasTable()` شروع می‌شود → اجرای مجدد بی‌ضرر است (مناسب هاست‌هایی که `migrations` table ناقص دارند).
2. **بدون `migrate:fresh` و بدون Seeder در ارتقا:** مسیر ارتقا فقط `php artisan migrate --force` است (از طریق `update.php`).
3. **مقادیر پیش‌فرض امن:** `customers_scope` برای کاربران موجود `all` (قفل‌نشدن دسترسی‌های فعلی)، `quantity = 1`، `stock_quantity = 0` و `created_by_user_id = NULL` (مالک نامشخص = فقط مدیران می‌بینند).
4. **سازگاری دو درایور:** از `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` مستقیم استفاده **نمی‌شود** (MySQL 8 پشتیبانی نمی‌کند)؛ معادل امن آن در Laravel (`hasColumn` + `Schema::table`) و در فایل SQL خام، روش `INFORMATION_SCHEMA` + `PREPARE/EXECUTE` به‌کار می‌رود.
5. **فایل SQL مستقل برای phpMyAdmin:** `deploy/cpanel/database/v2.0.0-mysql.sql` — برای کسانی که امکان اجرای `update.php` ندارند؛ کاملاً Idempotent و بدون `DROP`/`TRUNCATE`/`DELETE`.
6. **تراکنش:** همه عملیات حساس (کسر/بازگشت موجودی + لاگ + تاریخچه مشتری) داخل `DB::transaction()` با `lockForUpdate()` روی ردیف دستگاه.
7. **بکاپ اجباری:** در راهنمای ارتقا، پیش از هر اقدام، بکاپ phpMyAdmin از دیتابیس و کپی `.env` و `storage/` الزامی شده است.

---

## ۶) خروجی نهایی (Deliverables)

| # | فایل | توضیح |
| :- | :-- | :-- |
| 1 | `CHANGELOG.md` | تاریخچه تغییرات `v2.0.0` (Semantic Versioning) |
| 2 | `VERSION` | شماره نسخه ماشینی سامانه |
| 3 | `deploy/cpanel/database/v2.0.0-mysql.sql` | اسکریپت خام SQL (phpMyAdmin) برای اعمال تغییرات دیتابیس بدون پاک‌شدن داده |
| 4 | `deploy/cpanel/UPGRADE-v2.0.0.fa.md` | راهنمای گام‌به‌گام ارتقا روی cPanel + لیست دقیق فایل‌های جایگزینی |
| 5 | `docs/UPGRADE-PLAN-v2.0.0.fa.md` | همین سند (فاز اول) |
| 6 | `docs/ACCEPTANCE-REPORT-v2.0.0.fa.md` | گزارش فاز سوم: بررسی کد در برابر هر AC |
