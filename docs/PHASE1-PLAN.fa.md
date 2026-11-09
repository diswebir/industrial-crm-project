# 📋 فاز اول — تحلیل کدبیس، طراحی دیتابیس و برنامه اجرایی نسخه v2.0.0

> این سند خروجی **فاز اول** پروژه ارتقای سامانه است. مبنای تحلیل، آخرین وضعیت مخزن روی شاخه
> `arena/92772230-industrial-crm-project` (کامیت `3434896`) است.
>
> **وضعیت:** فاز دوم (پیاده‌سازی) و فاز سوم (آزمون پذیرش) انجام شده است. گزارش پذیرش در
> [`PHASE3-ACCEPTANCE.fa.md`](PHASE3-ACCEPTANCE.fa.md) و راهنمای ارتقای هاست در
> [`upgrade-v2-cpanel.fa.md`](upgrade-v2-cpanel.fa.md) قرار دارد.

---

## ۱. شناسنامه فنی فعلی سامانه

| لایه | فناوری | مسیر | نکات کلیدی |
| :--- | :--- | :--- | :--- |
| بک‌اند | Laravel 11 / PHP 8.4 | `backend/` | REST API در `routes/api.php` با پیشوند `/api/v1` |
| پنل ادمین | Filament v3 | `backend/app/Filament/` | مدیریت مستقیم مشتریان، قطعات، کاربران، لاگ پیامک |
| احراز هویت | Sanctum (کوکی HttpOnly) + Pure ACL (Spatie Permission) | `AuthController`, `UserController` | بدون Role؛ ۱۴ مجوز مستقیم |
| فرانت‌اند | React 19 + TS + Vite + Tailwind v4 + DaisyUI | `frontend/` | Zustand برای Auth، TanStack Query برای داده |
| دیتابیس تولید | MySQL/MariaDB روی cPanel | `backend/database/migrations` | ۱۳ مایگریشن تا `2024_01_01_000013` |
| بسته استقرار | ZIP دوگانه `cpanel-public` + `cpanel-private` + `install.php` / `update.php` | `deploy/cpanel/` | آپدیت بدون SSH با اجرای `update.php` |

### جداول موجود و نقش آن‌ها

| جدول | ستون‌های مهم | استفاده فعلی |
| :--- | :--- | :--- |
| `users` | `name, email, phone, password, is_active, user_type, avatar` | `user_type` فقط `administrator` و `manager` |
| `permissions` / `model_has_permissions` | مجوزهای مستقیم Spatie | ۱۴ مجوز ثابت |
| `customers` | `customer_type, type, first_name, last_name, company_name, national_code, mobile, phone, email, province, city, address, notes` | مالکیت/کارشناس فروش ندارد؛ `mobile` اجباری |
| `parts` | `name, code, periodic_service_months, description, is_active` | موجودی انبار ندارد |
| `customer_parts` | `customer_id, part_id, serial_number(unique), installation_date, warranty_expire_date, status, notes` | تک‌سریال، بدون تعداد/فاکتور |
| `part_service_histories` | `customer_part_id, performed_by_user_id, service_date, service_type, description, cost` | سوابق سرویس |
| `customer_histories` | `customer_id, user_id, action, description, metadata` | Audit Trail مشتری |
| `sms_logs`, `settings` | — | پیامک و تنظیمات |

### نقاط ضعف/باگ‌هایی که در بررسی کد پیدا شد

1. **بدون مالکیت مشتری:** هیچ ستونی مشخص نمی‌کند مشتری را چه کارمندی ثبت کرده؛ بنابراین اعمال محدودیت «فقط مشتریان خودم» در بک‌اند ممکن نیست.
2. **اعتبارسنجی ناسازگار:** `CustomerController@store` فیلدهای `first_name`، `last_name` و `mobile` را همیشه اجباری می‌داند؛ ثبت مشتری حقوقی فقط با نام شرکت ممکن نیست. فرانت‌اند هم ستاره اجباری روی نام و موبایل دارد.
3. **تخصیص دستگاه بدون تعداد/فاکتور:** `customer_parts` فیلد `quantity`، `invoice_number` و `invoice_amount` ندارد و API تخصیص هم آن‌ها را نمی‌پذیرد.
4. **نبود ویرایش/حذف تخصیص:** مسیر API برای `PUT/DELETE /customer-parts/{id}` وجود ندارد و در `CustomerDetail` فقط «ثبت اقدام/تعمیر» نمایش داده می‌شود.
5. **انبار واقعی وجود ندارد:** صفحه `Inventory.tsx` کاملاً دمو با داده‌های ساختگی است و به API متصل نیست؛ `parts` موجودی ندارد.
6. **خروجی اکسل ناقص:** `CustomersExport` فقط ۱۴ ستون مشتری دارد، بدون هیچ اطلاعاتی از دستگاه‌ها/فاکتورها؛ حالت CSV با BOM هم ندارد.
7. **باگ Datepicker:** پاپ‌آپ تقویم با `absolute` داخل `modal-box` با `overflow-y-auto` رندر می‌شود و در بعضی رزولوشن‌ها بریده/زیر لایه‌ها می‌رود. `z-index` تنها کافی نیست.
8. **مقادیر پیش‌فرض لاگین:** `defaultValues: DEFAULT_ADMIN` باعث پر شدن خودکار `admin@crm.local` و `Admin@123456` می‌شود.
9. **فونت/ارقام:** فونت وزیرمتن معمولی لود می‌شود و ارقام لاتین در جدول‌ها/اینپوت‌ها نمایش داده می‌شوند؛ نسخه `Vazirmatn-FD` (ارقام فارسی) استفاده نشده است.
10. **نشت داده در جستجوی سراسری:** `GlobalSearch` بدون توجه به دامنه دسترسی، از `customers` API استفاده می‌کند (پس از اعمال Scope در بک‌اند خودبه‌خود اصلاح می‌شود).
11. **Dashboard بدون Scope:** آمار داشبورد کل مشتریان را به همه کاربران نشان می‌دهد.
12. **برچسب‌های «قطعه»:** ۴۴ مورد در فرانت‌اند و چند مورد در بک‌اند/Filament.

---

## ۲. ترتیب فنی اجرای تسک‌ها (اولویت‌بندی)

ترتیب زیر بر اساس «وابستگی داده‌ای» چیده شده است؛ هیچ تسکی بدون پیش‌نیازش اجرا نمی‌شود.

| # | تسک | چرا این جایگاه؟ | وابستگی |
| :--- | :--- | :--- | :--- |
| **۰** | **زیرساخت دیتابیس + مایگریشن ایمن** | همه تسک‌ها به ستون‌های جدید نیاز دارند؛ اول باید بدون از دست رفتن داده اضافه شوند. | — |
| **۱** | **RBAC/ACL و دامنه دسترسی مشتریان** (تسک ۱) | Scope باید در همه کوئری‌ها (لیست، جزئیات، ویرایش، خروجی اکسل، داشبورد، تخصیص) اعمال شود؛ اگر بعد از بقیه تسک‌ها انجام شود، باید همه آن‌ها بازنویسی شوند. | ۰ |
| **۲** | **اعتبارسنجی مشتری حقیقی/حقوقی** (تسک ۵) | پیش‌نیاز ثبت مشتری توسط کارمند فروش با داده‌های واقعی (حقوقی بدون موبایل) و صحت خروجی اکسل. | ۰ |
| **۳** | **تخصیص دستگاه با تعداد/فاکتور + ویرایش و حذف** (تسک ۳) | قلب تغییرات؛ انبار و لاگ و اکسل به آن وابسته‌اند. | ۱،۲ |
| **۴** | **انبار، کسر/برگشت خودکار و لاگ تراکنش‌ها** (تسک ۴) | روی مدل تخصیص سوار می‌شود؛ تراکنش و قفل ردیف برای جلوگیری از موجودی منفی. | ۳ |
| **۵** | **تغییر مفهومی قطعه → دستگاه** (تسک ۲) | پس از تثبیت نام‌گذاری جدید در بک‌اند (پیام‌ها/مجوزها) کل UI یک‌جا تغییر می‌کند. | ۳،۴ |
| **۶** | **خروجی اکسل جامع + CSV با BOM** (تسک ۶) | نیازمند ستون‌های فاکتور و موجودی و داده دستگاه‌ها. | ۳ |
| **۷** | **رفع باگ Datepicker (Portal)** (تسک ۷) | مستقل از بک‌اند؛ بعد از تغییر فرم تخصیص انجام می‌شود تا یک‌بار برای همیشه حل شود. | ۳ |
| **۸** | **پاکسازی فرم لاگین** (تسک ۸) | مستقل و کم‌ریسک. | — |
| **۹** | **فونت وزیرمتن FD و ارقام فارسی** (تسک ۹) | آخرین لایه ظاهری؛ روی همه صفحات اثر می‌گذارد. | ۵ |
| **۱۰** | **نسخه‌بندی، CHANGELOG، SQL دستی و راهنمای cPanel** | خروجی نهایی و بسته آپدیت. | همه |

---

## ۳. طراحی دیتابیس جدید (Zero Data Loss)

اصل کار: **هیچ ستونی حذف یا تغییر نام داده نمی‌شود.** فقط `ADD COLUMN`، `CREATE TABLE` و در دو مورد
تغییر «nullable» (که داده موجود را دست نمی‌زند).

### ۳-۱. جدول `users` (ALTER)

| ستون | نوع | پیش‌فرض | توضیح |
| :--- | :--- | :--- | :--- |
| `data_scope` | `string(20)` + index | `'all'` | دامنه دسترسی مشتری: `all` (همه) / `own` (فقط خودم) / `custom` (خودم + استثناها) |

> مقدار پیش‌فرض `all` تضمین می‌کند کاربران فعلی (مدیران) بعد از آپدیت هیچ تغییری در دسترسی نبینند.
> مقادیر مجاز `user_type` بدون تغییر در ساختار ستون توسعه می‌یابد: `administrator`, `manager`,
> `salesperson` (کارمند فروش), `installer` (نصاب).

### ۳-۲. جدول `customers` (ALTER)

| ستون | نوع | توضیح |
| :--- | :--- | :--- |
| `created_by` | `unsignedBigInteger nullable` + index | مالک پرونده (کارمند ثبت‌کننده). برای داده‌های فعلی `NULL` می‌ماند = «میراثی» و فقط برای دارندگان `data_scope=all` قابل مشاهده است (بدون نشت داده). |
| `first_name`, `last_name` | `nullable` (change) | برای مشتری حقوقی اجباری نیستند. |
| `mobile` | `nullable` (change) | طبق تسک ۵ در هر دو نوع شخصیت اختیاری می‌شود. |

### ۳-۳. جدول جدید `customer_access_grants` (دسترسی استثنا)

| ستون | نوع | توضیح |
| :--- | :--- | :--- |
| `id` | bigint PK | |
| `user_id` | bigint + index | کارمندی که استثنا می‌گیرد |
| `scope_type` | `string(20)` | `staff` = مشتریان یک کارمند دیگر، `customer` = یک مشتری خاص |
| `target_user_id` | bigint nullable + index | کارمند هدف (وقتی `scope_type=staff`) |
| `customer_id` | bigint nullable + index | مشتری هدف (وقتی `scope_type=customer`) |
| `created_by` | bigint nullable | ادمین اعطاکننده |
| `created_at/updated_at` | timestamps | |

قاعده نهایی مشاهده برای یک کاربر:

```
IF user.data_scope = 'all'  → همه مشتریان
ELSE
   customers.created_by = user.id
   OR customers.created_by IN (target_user_id های grants با scope_type='staff')
   OR customers.id IN (customer_id های grants با scope_type='customer')
```

### ۳-۴. جدول `parts` (ALTER)

| ستون | نوع | پیش‌فرض | توضیح |
| :--- | :--- | :--- | :--- |
| `stock_quantity` | `integer` | `0` | موجودی کل انبار |
| `min_stock_quantity` | `integer` | `0` | حد هشدار موجودی (برای نمایش «کمبود موجودی») |

> **Backfill ایمن:** در مایگریشن، موجودی اولیه هر دستگاه برابر مجموع تعدادهای تخصیص‌یافته فعلی
> (`SUM(customer_parts.quantity)`) تنظیم می‌شود تا موجودی منفی کاذب ایجاد نشود.

### ۳-۵. جدول `customer_parts` (ALTER)

| ستون | نوع | پیش‌فرض | توضیح |
| :--- | :--- | :--- | :--- |
| `quantity` | `integer` | `1` | تعداد دستگاه تخصیص‌یافته در این رکورد |
| `invoice_number` | `string(100) nullable` | `NULL` | شماره فاکتور (اختیاری، دستی) |
| `invoice_amount` | `decimal(15,2) nullable` | `NULL` | مبلغ فاکتور (دستی) |
| `assigned_by_user_id` | `bigint nullable` + index | `NULL` | کارمند ثبت‌کننده تخصیص (برای Audit) |
| `serial_number` | `nullable` (change) | — | یکتایی حفظ می‌شود؛ چون تخصیص چندعددی شماره سریال تکی ندارد (در MySQL چند NULL مجاز است) |

### ۳-۶. جدول جدید `inventory_logs` (تاریخچه انبار)

| ستون | نوع | توضیح |
| :--- | :--- | :--- |
| `id` | bigint PK | |
| `part_id` | bigint + index | دستگاه |
| `user_id` | bigint nullable + index | ثبت‌کننده (کارمند انبار/فروش/نصاب) |
| `customer_id` | bigint nullable + index | مشتری مرتبط (لینک کلیک‌پذیر در UI) |
| `customer_part_id` | bigint nullable + index | رکورد تخصیص مرتبط |
| `type` | `string(20)` + index | `in` ورود / `out` خروج جهت تخصیص / `return` برگشت به انبار / `adjust` اصلاح موجودی |
| `quantity` | `integer` | مقدار مطلق جابه‌جایی |
| `stock_after` | `integer` | موجودی بعد از تراکنش (برای Audit دقیق) |
| `note` | `text nullable` | توضیح |
| `created_at/updated_at` | timestamps + index روی `created_at` | تاریخ و ساعت دقیق |

### ۳-۷. مجوزهای جدید (Spatie، بدون Role)

| مجوز | برچسب |
| :--- | :--- |
| `parts.assign.edit` | ویرایش تخصیص دستگاه |
| `parts.assign.delete` | حذف تخصیص دستگاه |
| `inventory.view` | مشاهده موجودی و تاریخچه انبار |
| `inventory.manage` | ثبت ورود/خروج و اصلاح موجودی |

مجوزهای جدید در همان مایگریشن به همه کاربران `administrator` داده می‌شوند تا بعد از آپدیت قطع نشوند.

### ۳-۸. نقش‌های پیش‌فرض (Preset در UI — همچنان Pure ACL)

| نقش | مجوزهای پیشنهادی | data_scope پیش‌فرض |
| :--- | :--- | :--- |
| کارمند فروش (Salesperson) | `customers.view/create/edit`, `parts.view/assign/history`, `inventory.view`, `sms.send` | `own` |
| نصاب (Installer) | `customers.view`, `parts.view`, `parts.history`, `inventory.view` | `own` |

---

## ۴. فایل‌های درگیر به تفکیک تسک

### تسک ۰ — زیرساخت دیتابیس
- جدید: `backend/database/migrations/2025_01_01_000001_add_customer_ownership_and_access_grants.php`
- جدید: `backend/database/migrations/2025_01_01_000002_add_device_quantity_invoice_and_inventory.php`
- جدید: `backend/database/migrations/2025_01_01_000003_seed_inventory_permissions_and_backfill.php`
- جدید: `deploy/cpanel/sql/2025_01_01_upgrade_v2_0_0.sql`

### تسک ۱ — RBAC/ACL
- جدید: `backend/app/Services/Customers/CustomerAccessService.php`
- تغییر: `app/Models/User.php`، `app/Models/Customer.php`
- تغییر: `CustomerController` (index/show/update/destroy/export)، `DashboardController`، `PartController` (تخصیص/تاریخچه)
- تغییر: `UserController` (`user_type`, `data_scope`, grants) و `routes/api.php`
- تغییر فرانت: `types/index.ts`، `services/api.ts`، `pages/settings/CreateUserPage.tsx`، `EditUserPage.tsx`، `UsersAclPage.tsx`، `store/useAuthStore.ts`، `utils/meta.ts`
- جدید: `components/settings/CustomerAccessEditor.tsx`

### تسک ۲ — قطعه → دستگاه
- تغییر: `frontend/src/layouts/nav.ts`, `Sidebar.tsx`, `GlobalSearch.tsx`, `pages/Dashboard.tsx`, `pages/Parts.tsx`, `pages/Customers.tsx`, `pages/CustomerDetail.tsx`, `pages/Inventory.tsx`, `pages/Login.tsx`, `components/parts/*`, `components/customers/CustomerFormModal.tsx`
- تغییر: پیام‌های `PartController`, `CustomerService`, `UserController` (برچسب‌ها), `Exports/CustomersTemplateExport.php`, `Filament/Resources/PartResource.php`, `AdminPanelProvider` (brand)

### تسک ۳ — مدیریت دستگاه‌های تخصیص‌یافته
- تغییر: `CustomerService` (assign/update/delete + warranty + audit)
- تغییر: `PartController` (assign/updateAssignment/destroyAssignment)
- تغییر: `routes/api.php` (`PUT/DELETE /customer-parts/{id}`)
- تغییر: `components/parts/AssignPartModal.tsx` (تعداد/فاکتور/حالت ویرایش) — نام جدید `AssignDeviceModal.tsx`
- تغییر: `pages/CustomerDetail.tsx` (نمایش تعداد/فاکتور + دکمه ویرایش/حذف + Confirm)

### تسک ۴ — انبار و لاگ
- جدید: `backend/app/Models/InventoryLog.php`، `app/Services/Inventory/InventoryService.php`، `app/Http/Controllers/Api/V1/InventoryController.php`
- تغییر: `Part` (stock + accessors)، `CustomerPart`، `PartController`، `routes/api.php`
- جدید فرانت: بازنویسی `pages/Inventory.tsx` (لاگ واقعی + لینک مشتری + ثبت ورود/خروج)
- تغییر: `pages/Parts.tsx` (ستون موجودی + دکمه ورود کالا)، `components/parts/StockMovementModal.tsx` (جدید)

### تسک ۵ — اعتبارسنجی فرم مشتری
- تغییر: `CustomerController` (store/update + پیام‌ها)، `CustomerFormModal.tsx` (Zod + ستاره‌ها)، `CustomersImport`
- تغییر: `Exports/CustomersTemplateExport.php`, `Filament/CustomerResource`

### تسک ۶ — خروجی اکسل
- تغییر: `app/Exports/CustomersExport.php` (ستون‌های دستگاه/فاکتور + visibility)
- تغییر: `CustomerController@export` (xlsx + csv با UTF-8 BOM)، `services/api.ts`، `pages/Customers.tsx`

### تسک ۷ — Datepicker
- تغییر: `components/ui/DatePicker.tsx` (رندر پاپ‌آپ با `createPortal` روی `document.body` + `position: fixed`)
- تغییر: `index.css` (لایه امنیتی برای `.modal-box` و popup)

### تسک ۸ — لاگین
- تغییر: `pages/Login.tsx` (`defaultValues` خالی + حذف بلاک تکمیل خودکار)

### تسک ۹ — فونت و ارقام فارسی
- جدید: `frontend/public/fonts/Vazirmatn-FD-*.woff2` و `backend/public/fonts/Vazirmatn-FD-*.woff2`
- تغییر: `frontend/src/index.css` (`@font-face` + `--font-sans`/`--font-mono` + اعمال روی input/button/select/textarea/table)
- تغییر: `frontend/index.html` (پیش‌بارگذاری فونت)، `backend/public/css/vazirmatn.css`

---

## ۵. معیارهای پذیرش (Acceptance Criteria) — چک‌لیست تست

### تسک ۱
- [ ] کارمند فروش A با `data_scope=own`، فقط مشتریان `created_by = A` را در `GET /customers` می‌بیند.
- [ ] درخواست مستقیم `GET /api/v1/customers/{id_B}` توسط A پاسخ **403** می‌دهد (نه 404 تا رفتار شفاف باشد) و UI هم دکمه ویرایش را نشان نمی‌دهد.
- [ ] با دادن grant نوع `staff` برای B، مشتریان B برای A قابل مشاهده/ویرایش می‌شود.
- [ ] با دادن grant نوع `customer`، فقط همان یک مشتری قابل مشاهده است.
- [ ] مدیر با `data_scope=all` (و همه کاربران قبلی) بدون تغییر همه مشتریان را می‌بیند.
- [ ] خروجی اکسل و آمار داشبورد هم همان Scope را رعایت می‌کنند.
- [ ] در پنل کاربران می‌توان `salesperson`/`installer` ساخت و دامنه + استثناها را ذخیره کرد.

### تسک ۲
- [ ] `grep -ri "قطعه" frontend/src` هیچ برچسب کاربری برنگرداند (به‌جز نام فایل/کامنت فنی مجاز).
- [ ] عناوین منو، دکمه‌ها، جدول‌ها، مودال‌ها و پیام‌های سرور از «دستگاه» استفاده کنند.

### تسک ۳
- [ ] ثبت تخصیص با `quantity=۳`، `invoice_number=INV-1001`، `invoice_amount=15000000` در DB ذخیره شود.
- [ ] دکمه‌های ویرایش و حذف در تب «دستگاه‌ها» کار کنند و جدول بلافاصله رفرش شود.
- [ ] ویرایش تعداد از ۳ به ۵ فقط ۲ عدد از انبار کم کند؛ حذف رکورد ۵ عدد را برگرداند.
- [ ] شماره فاکتور خالی (null) مجاز باشد.

### تسک ۴
- [ ] تخصیص ۲ عدد از دستگاه X به مشتری Y توسط Z: `parts.stock_quantity` دقیقاً ۲ واحد کم شود.
- [ ] یک ردیف `inventory_logs` با `type=out`، `user_id=Z`، `customer_id=Y` و `stock_after` صحیح ثبت شود.
- [ ] در صفحه تاریخچه انبار، نام مشتری **لینک** به `/customers/{id}` باشد.
- [ ] تخصیص بیش از موجودی با پیام فارسی و وضعیت 422 رد شود و هیچ رکوردی ثبت نشود (Transaction).
- [ ] حذف تخصیص، ردیف `return` ثبت و موجودی را برگرداند.

### تسک ۵
- [ ] ثبت مشتری `type=company` تنها با `company_name` (بدون نام/موبایل) موفق باشد (HTTP 201).
- [ ] ثبت مشتری `type=individual` بدون نام با خطای 422 و پیام فارسی رد شود.
- [ ] ستاره اجباری روی موبایل در هر دو حالت حذف شده باشد.

### تسک ۶
- [ ] فایل xlsx شامل ستون‌های دستگاه، کد، سریال، تعداد، شماره فاکتور و مبلغ باشد.
- [ ] خروجی CSV با BOM (`EF BB BF`) شروع شود و فارسی در Excel سالم باشد.

### تسک ۷
- [ ] تقویم در مودال تخصیص، در ارتفاع‌های کم و عرض موبایل کامل دیده شود و همه روزها کلیک‌پذیر باشند.

### تسک ۸
- [ ] `input[name=login]` و `input[name=password]` بدون `value` و خالی رندر شوند.

### تسک ۹
- [ ] ارقام همه جدول‌ها، قیمت‌ها، شماره‌ها و اینپوت‌ها فارسی نمایش داده شوند.
- [ ] `font-family` تمام عناصر `Vazirmatn FD` باشد.

---

## ۶. استراتژی آپدیت روی cPanel (خلاصه اجرایی)

1. **بکاپ کامل**: از دیتابیس (phpMyAdmin → Export) و پوشه خصوصی ZIP بگیرید.
2. فایل‌های `cpanel-public.zip` / `cpanel-private.zip` نسخه `v2.0.0` را بسازید
   (`bash deploy/cpanel/build.sh` یا GitHub Actions → cPanel package).
3. فایل‌های عمومی را جایگزین کنید؛ **`private-path.php` سرور را حفظ کنید**.
4. فایل‌های خصوصی را جایگزین کنید؛ **`.env` و `storage/` سرور را حفظ کنید**.
5. `https://دامنه/update.php` را باز کنید و با `APP_KEY` اجرا کنید (مایگریشن‌های جدید فقط اجرا می‌شوند).
6. اگر `update.php` در دسترس نیست: `deploy/cpanel/sql/2025_01_01_upgrade_v2_0_0.sql` را در phpMyAdmin اجرا کنید (idempotent).
7. `update.php` را حذف کنید و smoke-test بخش ۵ را انجام دهید.

> `down()` همه مایگریشن‌ها فقط ستون‌های جدید را حذف می‌کند و به داده قبلی دست نمی‌زند؛ اما اجرای
> `migrate:rollback` روی محیط تولید توصیه نمی‌شود.

---

## ۷. خارج از محدوده (Out of Scope)

- مهاجرت به SPA/SSR جدید، تغییر احراز هویت به JWT، یا بازطراحی پنل Filament.
- یکپارچه‌سازی واقعی درگاه پرداخت/فاکتور رسمی؛ فقط فیلدهای دستی فاکتور اضافه می‌شوند.
- تبدیل داده‌های قدیمی «سریال‌دار» به تعداد: هر رکورد موجود با `quantity = 1` و همان سریال حفظ می‌شود.
