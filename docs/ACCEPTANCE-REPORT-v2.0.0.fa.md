# ✅ گزارش پذیرش نسخه `v2.0.0` (Acceptance Report)

**مخزن:** `diswebir/industrial-crm-project` — شاخه `arena/9853e259-industrial-crm-project`
**نسخه:** `2.0.0` (فایل `VERSION` و `backend/config/crm.php`)
**تاریخ گزارش:** ۲۰۲۶-۱۱-۰۹
**اسناد مرجع:** [`docs/UPGRADE-PLAN-v2.0.0.fa.md`](UPGRADE-PLAN-v2.0.0.fa.md) (فاز ۱) ·
[`CHANGELOG.md`](../CHANGELOG.md) ·
[`deploy/cpanel/UPGRADE-v2.0.0.fa.md`](../deploy/cpanel/UPGRADE-v2.0.0.fa.md)

---

## ۱) روش راستی‌آزمایی و محدودیت‌های آن (صريح و بدون اغراق)

| لایه | روش راستی‌آزمایی | نتیجه |
| :-- | :-- | :-- |
| فرانت‌اند (React/TS) | `npx tsc -b` (بررسی انواع، حالت سخت‌گیرانه) و `npm run build` (Vite) | ✅ هر دو بدون خطا |
| بسته‌بندی cPanel | `python3 -m unittest discover -s tests -v` در `deploy/cpanel` | ✅ ۱۷ آزمون: ۱۰ موفق، ۷ skip |
| بک‌اند (Laravel) | بازبینی ایستای کد (خواندن مسیر کامل درخواست → کنترلر → سرویس → مدل → مایگریشن) | ⚠️ اجرا نشد |
| پایگاه داده | بازبینی مایگریشن‌ها + اسکریپت SQL خام + تطبیق با `INFORMATION_SCHEMA` | ⚠️ اجرا نشد |
| رابط کاربری در مرورگر | تحلیل کد و کلاس‌های CSS؛ آزمون دستی انجام نشد | ⚠️ نیازمند آزمون دستی |

> 🔴 **محدودیت اصلی:** در محیط توسعه این نسخه هیچ `php` یا `composer` نصب نبود
> (و PostgreSQL/MySQL در دسترس نبود). بنابراین **`php -l`، `artisan migrate`،
> PHPUnit/Pest و آزمون واقعی endpointها اجرا نشده‌اند.** همه ادعاهای سمت بک‌اند در این
> گزارش بر پایه «بازبینی ایستای کد» است و در ستون «وضعیت» با نشان
> ⚠️ (نیازمند تأیید در زمان اجرا) از ✅ (راستی‌آزمایی‌شده با اجرای ابزار) تفکیک شده است.
>
> برای پوشش همین شکاف، دو سازوکار در بسته قرار داده شده است:
> 1. `deploy/cpanel/update.php` پس از اجرا، **گزارش راستی‌آزمایی ساختار پایگاه داده**
>    (ستون‌ها، جدول‌ها، دو مجوز جدید و شمارش رکوردها) را نمایش می‌دهد.
> 2. `deploy/cpanel/database/v2.0.0-mysql.sql` در پایان، **جدول گزارش ۱۷ ردیفی** تولید می‌کند.
>
> پیشنهاد می‌شود سناریوهای بخش ۵ (آزمون دستی) پیش از تحویل نهایی روی یک کپی از
> پایگاه داده پروداکشن اجرا و صورت‌جلسه شود.

---

## ۲) خلاصه وضعیت ده گام اجرایی

| گام | تسک | موضوع | وضعیت |
| :- | :- | :-- | :- |
| ۱ | — | زیرساخت دیتابیس (مایگریشن‌های `000014`…`000019`) | ✅ کد / ⚠️ اجرا |
| ۲ | تسک ۱ | RBAC و دسترسی دانه‌ای مشتریان | ✅ کد / ⚠️ اجرا |
| ۳ | تسک ۴ | سرویس انبار، کسر/بازگشت موجودی و لاگ | ✅ کد / ⚠️ اجرا |
| ۴ | تسک ۳ | مدیریت کامل دستگاه‌های تخصیص‌یافته | ✅ کد / ⚠️ اجرا |
| ۵ | تسک ۵ | اعتبارسنجی مشتری حقیقی/حقوقی | ✅ کد / ⚠️ اجرا |
| ۶ | تسک ۶ | خروجی اکسل کامل (دو شیت) | ✅ کد / ⚠️ اجرا |
| ۷ | تسک ۲ | تغییر سراسری «قطعه» → «دستگاه» | ✅ **راستی‌آزمایی‌شده با grep** |
| ۸ | تسک ۷ | رفع باگ تقویم شمسی (Portal) | ✅ کد / ⚠️ مرورگر |
| ۹ | تسک ۸ | پاکسازی فرم لاگین | ✅ **راستی‌آزمایی‌شده با grep** |
| ۱۰ | تسک ۹ | فونت وزیرمتن FD و ارقام فارسی | ✅ کد و build / ⚠️ مرورگر |

---

## ۳) بررسی تفصیلی معیارهای پذیرش (AC)

### گام ۱ — زیرساخت دیتابیس

**AC:** اجرای `migrate --force` روی دیتابیس دارای داده بدون از دست رفتن رکورد؛ اجرای مجدد بدون خطا؛ `migrate:status` همه را Ran نشان دهد.

| بررسی | شواهد | وضعیت |
| :-- | :-- | :- |
| گارد Idempotent در همه شش مایگریشن | شمار `Schema::hasColumn`/`hasTable`: `000014`=۷، `000015`=۶، `000016`=۶، `000017`=۸، `000018`=۵، `000019`=۵ | ✅ |
| هیچ `DROP COLUMN`/`DROP TABLE` در `up()` | `down()`ها فقط برای محیط توسعه‌اند و با `try/catch` در برابر FK غایب محافظت شده‌اند (`000014`, `000017`) | ✅ |
| کلید خارجی فقط وقتی ستون در همان اجرا ساخته شود | `000017`: پرچم `$createdAssignedBy` — اجرای مجدد، خطای «کلید خارجی تکراری» نمی‌دهد | ✅ |
| تبدیل امن `NOT NULL → NULL` | `000014`: `first_name`, `last_name`, `mobile` با `->nullable()->change()` | ✅ |
| مقادیر پیش‌فرض امن | `customers_scope='all'`، `quantity=1` (+`UPDATE` اصلاحی برای ردیف‌های `<1`)، `stock_quantity=0`، `created_by_user_id=NULL` | ✅ |
| سازگاری دو درایور (MySQL/PostgreSQL) | استفاده نکردن از `ADD COLUMN IF NOT EXISTS`؛ معادل‌سازی با `hasColumn` | ✅ |
| هم‌ارزی با اسکریپت SQL خام | `INFORMATION_SCHEMA` + `PREPARE/EXECUTE`؛ ۲۰ بلوک شرطی؛ ثبت شش مایگریشن در جدول `migrations` با `batch` جدید | ✅ |
| اجرای واقعی روی داده | — | ⚠️ |

**نکته اجرایی:** چون محیط اجرا در دسترس نبود، در اسکریپت SQL خام طول و
مجموعه‌کاراکتر فعلی هر ستون از `INFORMATION_SCHEMA` خوانده می‌شود و فقط `NULL`-پذیری
تغییر می‌کند؛ بنابراین حتی در نصب‌هایی با `VARCHAR(191)` ساختار دست‌نخورده می‌ماند.

---

### گام ۲ — تسک ۱: RBAC و دسترسی دانه‌ای مشتریان

**AC-۱:** کاربر «کارمند فروش» با دامنه `own` در `GET /customers` فقط مشتریان خودش (+ استثناها) را بگیرد.

- `Customer::scopeVisibleTo()` (`app/Models/Customer.php:127`) پنج شاخه را `orWhere` می‌کند:
  ثبت‌شده توسط خود کاربر · در `user_customer_access` · ثبت‌شده توسط کارمندِ مجازشده
  (`user_staff_access`) · کاربر دستگاهی به او تخصیص داده (`customer_parts.assigned_by_user_id`)
  · کاربر سابقه سرویس او را ثبت کرده (`part_service_histories.performed_by_user_id`).
- شمار فراخوانی‌های `visibleTo(` در کنترلرها/اکسپورت‌ها/منابع Filament: **۱۳ مورد**
  (`CustomerController` فهرست و خروجی، `PartController` تخصیص و سوابق، `SmsController`,
  `DashboardController`, `InventoryController`, `CustomersSheet`, `CustomerDevicesSheet`,
  `CustomerResource`, `InventoryLogResource`).
- وضعیت: ✅ کد / ⚠️ اجرا

**AC-۲:** `GET /customers/{id}` روی مشتری دیگران ⇒ `403` (نه فقط پنهان‌سازی در UI).

- `Controller::authorizeCustomerAccess()` (`app/Http/Controllers/Controller.php:62`)
  ابتدا مجوز عملیاتی را می‌سنجد (`:49` → `abort(403, …)` با نام مجوز در پیام) و سپس
  `User::canAccessCustomer()`؛ در صورت شکست `:75` → `abort(403, 'شما به پرونده این مشتری دسترسی ندارید…')`.
- فراخوانی‌شده در: `CustomerController.php:111` (show)، `:130` (update)، `:163` (destroy)؛
  `PartController.php:208` (تخصیص)، `:260/:295/:315` (نمایش/ویرایش/حذف تخصیص)،
  `:346/:374` (ویرایش/حذف سابقه سرویس).
- وضعیت: ✅ کد / ⚠️ اجرا

**AC-۳:** اعطا/لغو هر سه حالت استثنا از فرم ویرایش کاربر با اثر فوری.

- بک‌اند: `PUT /users/{u}/access-scope` و کلیدهای FormData
  `customers_scope`, `accessible_staff_ids[]`, `accessible_customer_ids[]` در `store`/`update`.
- گارد ارتقای دسترسی: نقش بالاتر از `manager` برای فراخوانِ غیر مدیر ارشد ممنوع؛
  ارتقای دامنه به `all` فقط توسط مدیر ارشد (`UserController.php:527`)؛ اعطای کارمندِ
  مدیر ارشد فیلتر می‌شود؛ مشتریان اعطاشده با `Customer::visibleTo($caller)` اشتراک گرفته می‌شود.
- فرانت‌اند: `components/settings/RoleAccessFields.tsx` (نقش + دامنه + دو SearchableSelect
  با اعمال پیش‌فرض نقش)، استفاده در `CreateUserPage`, `EditUserPage`, `UsersAclPage`
  (مودال «دسترسی مشتریان» با `usersApi.updateAccessScope`).
- وضعیت: ✅ کد / ⚠️ اجرا

**AC-۴:** همان محدودیت روی `update`, `destroy`, `export`, تخصیص، سابقه سرویس و آمار داشبورد.

| عملیات | محل اعمال دامنه |
| :-- | :-- |
| فهرست/جستجوی مشتریان | `CustomerController::index` → `visibleTo` |
| نمایش/ویرایش/حذف مشتری | `authorizeCustomerAccess` (سه مورد) |
| خروجی اکسل (هر دو شیت) | `CustomersSheet` و `CustomerDevicesSheet` با `visibleTo` |
| تخصیص/ویرایش/حذف دستگاه | `PartController` (پنج مورد) |
| سابقه سرویس | `PartController` (ویرایش/حذف) + `CustomerService` |
| گردش انبار | `InventoryController::logs` با `visibility_user` در `InventoryService::logsQuery` |
| پیامک‌ها | `SmsController` |
| آمار داشبورد | `DashboardController::stats` → `my_customers`, `has_global_customer_access` |
| پنل Filament | `CustomerResource` و `InventoryLogResource` با `visibleTo` |

- وضعیت: ✅ کد / ⚠️ اجرا

**AC تکمیلی — کاتالوگ مجوزها:** ۱۶ مجوز با برچسب فارسی و گروه‌بندی
(`UserController::PERMISSION_LABELS` و `PERMISSION_GROUPS`): ۶ × `customers.*`،
۴ × `parts.*`، ۲ × `inventory.*`، ۲ × `sms.*`، `users.manage`، `settings.manage`.
کلیدهای `parts.*` عمداً تغییر نام نداده‌اند تا رکوردهای `model_has_permissions` موجود
بی‌اثر نشوند؛ فقط برچسب فارسی آن‌ها «دستگاه» است.

---

### گام ۳ — تسک ۴: سرویس انبار

**AC-۱:** تخصیص ۲ عدد دستگاه X به مشتری Y توسط کارمند Z در یک Transaction؛ کاهش دقیق موجودی؛ لاگ `out` با `quantity=2`, `user_id=Z`, `customer_id=Y` و `stock_before/after` درست.

- `InventoryService::move()` → `DB::transaction(...)` (`:152`) +
  `Part::query()->whereKey(...)->lockForUpdate()->first()` (`:154`) +
  ثبت `stock_before`, `stock_after` (`:214`), `user_id`, `customer_id`, `customer_part_id`,
  `reference`, `notes`, `logged_at`.
- مسیر فراخوانی: `CustomerService::assignPart()` (داخل Transaction) ← `PartController::assignPart()`.
- وضعیت: ✅ کد / ⚠️ اجرا

**AC-۲:** موجودی ناکافی ⇒ `422` فارسی و **بدون هیچ تغییر** در دیتابیس.

- پیام (`:176`): «این عملیات باعث منفی شدن موجودی دستگاه «…» می‌شود (موجودی فعلی: N عدد)»
  و در مسیر تخصیص، پیام شامل موجودی فعلی و مقدار درخواستی.
- چون همه‌چیز داخل `DB::transaction` است، `ValidationException` ⇒ Rollback کامل
  (بدون لاگ، بدون تغییر تعداد، بدون تغییر وضعیت مشتری).
- در فرم تخصیص، کنترل پیش‌دستی سمت کلاینت هم وجود دارد
  (`AssignPartModal.tsx:104-111`: `availableStock`, `effectiveStock`, `notEnoughStock`).
- وضعیت: ✅ کد / ⚠️ اجرا

**AC-۳ و ۴:** حذف تخصیص ⇒ `return`؛ ویرایش تعداد ۳←۱ ⇒ بازگشت ۲ (`return`)؛ ۱←۴ ⇒ کسر ۳ (`out`).

- `CustomerService::updateAssignment()` اختلاف تعداد را محاسبه و یک حرکت ثبت می‌کند؛
  `destroyAssignment()` کل `quantity` را با `type=return` برمی‌گرداند.
- وضعیت: ✅ کد / ⚠️ اجرا

**AC-۵:** موجودی هیچ‌گاه منفی نشود (Check در سرویس + گارد به‌روزرسانی).

- بررسی پیش از نوشتن + به‌روزرسانی شرطی
  (`WHERE stock_quantity = <مقدار خوانده‌شده>`)؛ در صورت صفر بودن ردیف تغییریافته:
  «موجودی انبار همزمان توسط کاربر دیگری تغییر شد. لطفاً عملیات را تکرار کنید.» (`:194`).
- وضعیت: ✅ کد / ⚠️ اجرا

**AC-۶:** `GET /inventory/logs` با فیلترها و صفحه‌بندی + نام کاربر و مشتری.

- `InventoryService::logsQuery()` فیلترهای `part_id`, `customer_id`, `user_id`,
  `type (in|out|return|adjustment)`, `from`/`to` (`whereDate` روی `logged_at`)،
  `q` (مرجع/توضیحات/نام و کد دستگاه/نام کاربر) و `visibility_user` را پشتیبانی می‌کند.
- `InventoryController::logs()` صفحه‌بند لاراول با `part`, `customer` (شناسه + عنوان)،
  `user` و بقیه فیلدها را برمی‌گرداند.
- UI: `pages/Inventory.tsx` با کارت‌های خلاصه (`/inventory/summary`)، جدول گردش،
  فیلترها و `StockMovementModal`؛ مسیر `/inventory` پشت
  `PermissionRoute permission="inventory.logs"` در `App.tsx`.
- وضعیت: ✅ کد / ⚠️ اجرا

**AC تکمیلی — گزارش مغایرت:** `GET /inventory/reconciliation` موجودی ثبت‌شده را با
جمع تخصیص‌ها مقایسه و موارد مغایر را برمی‌گرداند.

---

### گام ۴ — تسک ۳: مدیریت دستگاه‌های تخصیص‌یافته

| AC | شواهد | وضعیت |
| :-- | :-- | :- |
| `POST /customers/{id}/parts` با `quantity` (پیش‌فرض ۱)، `invoice_amount`، `invoice_number` اختیاری | قوانین: `quantity` ۱…۱۰۰۰۰۰، `invoice_number` ≤۵۰، `invoice_amount` ۰…۹۹۹۹۹۹۹۹۹۹۹۹؛ پاسخ `{message, customer_part, customer_type, stock_quantity}` با کد ۲۰۱ | ✅ کد |
| `PUT\|POST /customer-parts/{id}` و `DELETE /customer-parts/{id}` با authorization | `routes/api.php:41,42` + `authorizeCustomerAccess` در `:260,:295,:315` | ✅ کد |
| `PUT\|POST /service-histories/{id}` و `DELETE /service-histories/{id}` | `routes/api.php:46,47` + authorization در `:346,:374` | ✅ کد |
| دکمه‌های ویرایش/حذف در تب «دستگاه‌های فیزیکی و سوابق خدمات» | `pages/CustomerDetail.tsx:408-424` (تخصیص) و `:517-526` (سابقه سرویس) + مودال تأیید حذف | ✅ کد |
| به‌روزرسانی جدول بدون رفرش صفحه | React Query `invalidateQueries` در `onSuccess` همه جهش‌ها | ✅ کد |
| مبلغ فاکتور با فرمت پولی فارسی | `toman()`/`num()` در `utils/format.ts` ⇒ «۱٬۲۵۰٬۰۰۰ تومان» | ✅ کد |
| سریال یکتا و رد شدن تغییر `part_id` روی تخصیص موجود | `serial_number` ≤۱۰۰ با `^[a-zA-Z0-9\-\/]+$` و unique؛ تغییر دستگاه در ویرایش ⇒ `422` | ✅ کد |
| گارانتی خودکار | `installation_date + periodic_service_months` (پیش‌فرض ۱۲ ماه) | ✅ کد |
| حذف دستگاه دارای تخصیص/لاگ | `422` با پیشنهاد «غیرفعال کردن دستگاه» | ✅ کد |

---

### گام ۵ — تسک ۵: اعتبارسنجی حقیقی/حقوقی

| AC | شواهد | وضعیت |
| :-- | :-- | :- |
| ثبت مشتری حقوقی فقط با `company_name` ⇒ `201` بدون خطا | `CustomerController.php:83` (`$isCompany`)، `:246` (`company_name` = `required` فقط در حالت حقوقی)، `:254` (`national_code`: ۱۱ رقم برای حقوقی، ۱۰ رقم برای حقیقی)، ستون‌های `NULL`-پذیر در مایگریشن `000014` | ✅ کد |
| جابه‌جایی ستاره الزامی در فرم | `CustomerFormModal.tsx:17-19` (مستند رفتار)، `:47-67` (superRefine شرطی)، `:105` (شناسه ملی)، `:275` (تب شخصیت)، `:283-292` (راهنمای فیلدهای الزامی) | ✅ کد |
| عنوان نمایشی حقوقی = نام شرکت | بک‌اند `Customer::getFullNameAttribute()` (نام شخص ← نام شرکت ← «مشتری #id»)؛ فرانت‌اند `customerLabel()` در `utils/format.ts` و استفاده در `Customers.tsx`, `CustomerDetail.tsx`, `GlobalSearch.tsx`, `SmsCenter.tsx`, `Dashboard.tsx`, `AssignPartModal.tsx` | ✅ کد |
| جستجو با `NULL` کار کند (B4) | `CustomerController.php:60,63` — شاخه‌های `orWhere` روی `company_name` و `national_code` و `COALESCE` برای نام | ✅ کد |
| ورودی اکسل با `NULL` کار کند و رکورد تکراری نسازد (B5) | `CustomersImport`: کلید یکتایی = موبایل نرمال‌شده → کد ملی → شناسه ملی شرکت؛ در نبود همه، ساخت رکورد جدید + «هشدار» (نه خطا) | ✅ کد |
| موبایل اختیاری ولی در صورت ورود معتبر | نرمال‌سازی `0912…`/`98912…`/`+98912…` و حذف `\u{00A0}` | ✅ کد |

---

### گام ۶ — تسک ۶: خروجی اکسل کامل

| AC | شواهد | وضعیت |
| :-- | :-- | :- |
| دو شیت با نام فارسی | `CustomersExport implements WithMultipleSheets` → `sheets(): ['مشتریان' => CustomersSheet, 'دستگاه‌های تخصیص‌یافته' => CustomerDevicesSheet]` | ✅ کد |
| ستون‌های شیت «مشتریان» | `CustomersSheet implements FromQuery, WithEvents, WithHeadings, WithMapping, ShouldAutoSize, WithStyles` — **۲۳ ستون** (شمارش خودکار از `headings()`) شامل خلاصه دستگاه‌ها، جمع تعداد و جمع مبلغ فاکتور | ✅ کد |
| ستون‌های شیت «دستگاه‌های تخصیص‌یافته» | `CustomerDevicesSheet` — **۲۱ ستون**: نام مشتری، نام/کد دستگاه، سریال، تعداد، شماره و مبلغ فاکتور، تاریخ نصب، پایان گارانتی، وضعیت | ✅ کد |
| محدود به دامنه دسترسی کاربر | هر دو شیت `FromQuery` با `visibleTo($user)` | ✅ کد |
| فارسی سالم در Excel + RTL | `setRightToLeft(true)` در `AfterSheet` هر دو شیت (`CustomersSheet.php:118`, `CustomerDevicesSheet.php:121`) | ✅ کد |
| عرض خودکار، سرستون فارسی، اعداد عددی | `ShouldAutoSize` + `WithHeadings` فارسی + `WithMapping` با `int`/`float` (بدون `digits()` فارسی‌سازی) | ✅ کد |
| `UTF-8 BOM` برای CSV سمت کلاینت | `frontend/src/utils/csv.ts`: `downloadCsv()` خروجی را با `\uFEFF` (BOM) و `text/csv;charset=utf-8` می‌نویسد و `parseCsv()` هنگام خواندن، BOM را از سرستون‌ها پاک می‌کند؛ ورودی اکسل هم `csv` را می‌پذیرد (`CustomerController.php:186`) | ✅ کد |
| فایل نمونه ورودی با ستون‌های جدید | `CustomersTemplateExport` با برگه راهنما و سه ردیف نمونه (حقیقی/حقوقی) | ✅ کد |

---

### گام ۷ — تسک ۲: تغییر سراسری واژگان ✅ **راستی‌آزمایی‌شده**

**AC:** `grep -rn 'قطع' frontend/src backend/app backend/database backend/config` هیچ برچسب کاربری برنگرداند.

دستور اجراشده و نتیجه:

```bash
$ grep -rn "قطع" -I . | grep -v "^./.git/" | grep -v node_modules | grep -v "^./docs/" \
      | grep -v "^./contracts/" | grep -v "قطعی" | grep -v "^./frontend/dist/"
./README.md:116:   - واژگان سراسری سامانه از «قطعه/قطعات» به «دستگاه/دستگاه‌ها» تغییر یافته است.
```

- **تنها باقی‌مانده، همان جمله مستندسازی درباره خودِ تغییر واژگان است** (عمدی).
- `frontend/src`: **صفر** مورد. `backend/app`, `backend/database`, `backend/config`: **صفر** مورد.
- `frontend/dist` (خروجی build تازه): صفر مورد — یعنی هیچ رشته «قطعه» به بسته نهایی راه نیافته.
- واژه «قطعی» به معنای «definitive» ربطی به «قطعه» ندارد و حفظ شده است
  (مثلاً در `WINDOWS-BUILD-GUIDE`).
- اسناد حقوقی `contracts/` عمداً دست‌نخورده‌اند (متن قرارداد، نه رابط سامانه).
- نام پنل Filament: `brandName('مدیریت دستگاه‌های صنعتی')` در `AdminPanelProvider.php`.
- عنوان مستندات API: «سامانه مدیریت مشتریان و دستگاه‌های صنعتی» در `config/scramble.php`.
- کلیدهای مجوز `parts.*`، نام جدول‌ها و ستون‌ها عمداً تغییر نکردند (AC صریح طرح).

---

### گام ۸ — تسک ۷: تقویم شمسی

| AC | شواهد | وضعیت |
| :-- | :-- | :- |
| رندر با Portal روی `document.body` و موقعیت `fixed` | `components/ui/DatePicker.tsx:2` (`import { createPortal } from 'react-dom'`)، `:35-36` (مستند رفتار)، `:202` (`createPortal(...)`) + محاسبه از `getBoundingClientRect()` | ✅ کد |
| دیده‌شدن کامل در مودال تخصیص (۳۶۰px تا ۱۹۲۰px) | خارج از کانتینر `overflow-y-auto` و `<dialog>` رندر می‌شود ⇒ `z-index` و برش از بین می‌رود؛ عرض پنل با `max-w-[calc(100vw-…)]` محدود شده | ⚠️ مرورگر |
| به‌روز ماندن مکان هنگام اسکرول/تغییر اندازه | گوش‌دادن به `scroll` (با `capture`) و `resize` + محاسبه دوباره | ✅ کد |
| بستن با `Esc` و کلیک بیرون | هندلر `keydown` و `mousedown` بیرون از پنل | ✅ کد |
| همه روزها/ماه‌ها کلیک‌پذیر | جابه‌جایی ماه/سال بدون محدودیت + حالت `dayOnly` برای فیلدهای بدون نیاز به زمان | ✅ کد |

> برای اطمینان نهایی، آزمون دستی ردیف ۱۱ در چک‌لیست بخش ۵ انجام شود.

---

### گام ۹ — تسک ۸: پاکسازی فرم لاگین ✅ **راستی‌آزمایی‌شده**

```bash
$ grep -n "defaultValues" -A 2 frontend/src/pages/Login.tsx
93:    defaultValues: { login: "", password: "" },

$ grep -c "Admin@123456" frontend/src/pages/Login.tsx
0
$ grep -rn "admin@crm.local" frontend/src
components/settings/RoleAccessFields.tsx:21   # توضیح کد درباره قفل بودن نقش حساب مدیر
pages/settings/EditUserPage.tsx:365           # گارد lockRole (امنیتی، نه مقدار پیش‌فرض)
pages/settings/UsersAclPage.tsx:517           # گارد lockRole (امنیتی، نه مقدار پیش‌فرض)
```

- هر دو فیلد `login` و `password` با مقدار خالی مقداردهی اولیه می‌شوند؛
  هیچ `value` از پیش پرشده‌ای در DOM نیست.
- باکس نمایش «نام کاربری/رمز» از صفحه ورود حذف شده است؛ فقط `placeholder` باقی است.
- تنها موارد باقی‌مانده `admin@crm.local` **گارد امنیتی** هستند تا نقش حساب مدیر ارشد
  توسط کاربر غیرمدیر قفل/تغییر پیدا نکند — نه اطلاعات ورود.
- `grep -rn "Admin@123456" frontend/src` ⇒ صفر مورد.

---

### گام ۱۰ — تسک ۹: فونت وزیرمتن FD و ارقام فارسی

| AC | شواهد | وضعیت |
| :-- | :-- | :- |
| خانواده `Vazirmatn FD` روی `html, body, input, button, select, textarea, table` | `frontend/src/index.css:86-124` شش `@font-face` لوکال؛ `:139` و `:150` اعمال به عناصر پایه | ✅ کد |
| اعمال بر `--font-sans` **و `--font-mono`** | `index.css:130` و `:132` (+`--default-font-family`, `--default-mono-font-family`)؛ `:152` برای `code, kbd, samp, pre, .font-mono` | ✅ کد |
| بدون CDN و به‌صورت فایل لوکال | `frontend/src/assets/fonts/vazirmatn-fd/` (۶ وزن + `LICENSE-OFL.txt`)؛ در خروجی build: `dist/assets/Vazirmatn-FD-{Regular,Medium,SemiBold,Bold,ExtraBold,Black}-*.woff2` | ✅ build |
| پنل Filament هم FD لوکال بگیرد | `backend/public/css/vazirmatn.css` (پنج `@font-face` با مسیر `/fonts/vazirmatn-fd-*.woff2`) + `AdminPanelProvider->font('Vazirmatn FD', url:'/css/vazirmatn.css')` + `preload` در `panels::head.done` | ✅ کد |
| فونت‌ها در بسته cPanel باشند (B13) | `build.sh:157` و `:158` بررسی اجباری `css/vazirmatn.css` و `fonts/vazirmatn-fd-Regular.woff2`؛ پوشش در `tests/test_build.py` | ✅ آزمون |
| مقدار ذخیره‌شده ASCII بماند | `toEnDigits()` پیش از ارسال به سرور (فرم‌های تعداد، سریال، موبایل، کد ملی)؛ نمایش فارسی فقط با `digits()`/`num()`/`Intl('fa-IR')` | ✅ کد |
| ارقام فارسی در جدول‌ها، قیمت‌ها، تاریخ‌ها، صفحه‌بندی | همه با `num()`, `toman()`, `compact()`, `dateShort()`, `Intl.NumberFormat('fa-IR')` | ✅ کد |
| جداسازی LTR برای سریال/کد/ایمیل | `index.css` + `vazirmatn.css`: `direction: ltr` و `unicode-bidi: isolate` برای `code/kbd/samp/pre/[dir=ltr]/input[type=email\|tel\|url]` | ✅ کد |
| رندر واقعی در مرورگر | — | ⚠️ مرورگر |

---

## ۴) وضعیت ۱۴ باگ شناسایی‌شده در فاز تحلیل

| # | باگ | رفع | محل | وضعیت |
| :- | :-- | :-- | :-- | :- |
| B1 | صفحه‌بندی خراب (ارسال `last_page` به‌جای `total`) | ارسال `total` واقعی از پاسخ صفحه‌بند | `pages/Customers.tsx:350-353` | ✅ |
| B2 | `mobile/first_name/last_name` در DB برابر `NOT NULL` | مایگریشن `000014` + معادل در SQL خام | `database/migrations/…000014` | ✅ کد |
| B3 | عنوان خالی برای مشتری حقوقی | `getFullNameAttribute()` + `customerLabel()` | بک‌اند و فرانت‌اند | ✅ |
| B4 | جستجو با `CONCAT` روی `NULL` | `COALESCE` + `orWhere` روی نام شرکت/کد ملی | `CustomerController.php:55-70` | ✅ کد |
| B5 | ورودی اکسل ⇒ رکورد تکراری بدون موبایل | کلید تکراری سه‌گانه + `updated_count` | `app/Imports/CustomersImport.php` | ✅ کد |
| B6 | نبودِ «چه کسی مشتری را ثبت کرد» | `customers.created_by_user_id` + ثبت خودکار | مایگریشن `000014` + `CustomerService` | ✅ کد |
| B7 | نبود موجودی و تعداد | مایگریشن‌های `000016`, `000017`, `000018` | — | ✅ کد |
| B8 | تخصیص بدون Transaction | `DB::transaction` + `lockForUpdate` | `InventoryService.php:152,154` | ✅ کد |
| B9 | نبود endpoint/UI برای ویرایش و حذف تخصیص و سابقه | ۴ endpoint + دکمه‌ها در پروفایل مشتری | `routes/api.php:41-47`, `CustomerDetail.tsx:408-526` | ✅ کد |
| B10 | بریده‌شدن پاپ‌آپ تقویم | `createPortal` + `fixed` + اسکرول/ریسایز | `ui/DatePicker.tsx:2,202` | ✅ کد / ⚠️ مرورگر |
| B11 | نشتی اطلاعات ورود در فرم لاگین | `defaultValues` خالی + حذف باکس رمز | `pages/Login.tsx:93` | ✅ grep |
| B12 | دور زده شدن فونت توسط `font-mono` | `--font-mono` = `Vazirmatn FD` | `index.css:132,152` | ✅ |
| B13 | نبود CSS/فونت پنل در بسته cPanel | کپی `public/css` + `public/fonts` و دو بررسی اجباری | `build.sh:157,158` | ✅ آزمون |
| B14 | نبود ستون دستگاه/سریال/فاکتور در اکسل | شیت دوم + ستون‌های خلاصه | `CustomerDevicesSheet.php` (۲۱ ستون) | ✅ کد |

---

## ۵) سناریوهای آزمون دستی (پیش از تحویل نهایی اجرا شود)

> محیط پیشنهادی: کپی پایگاه داده پروداکشن + بسته `v2.0.0` روی ساب‌دامین آزمایشی.

### ۵٫۱ سناریوی ارتقا و Zero Data Loss
1. شمارش رکوردها پیش از ارتقا: `customers`, `parts`, `customer_parts`, `part_service_histories`, `users`, `sms_logs`.
2. اجرای `update.php` (یا Import فایل SQL) و ثبت کامل خروجی/گزارش.
3. مقایسه شمارش‌ها پس از ارتقا — **باید دقیقاً برابر باشند**.
4. اجرای دوباره همان اسکریپت (SQL یا `migrate --force`) — **باید بدون خطا باشد**.
5. ورود با حساب مدیر قدیمی بدون تغییر رمز.

### ۵٫۲ سناریوی RBAC
1. کاربر «کارمند فروش» با دامنه `own` بسازید و سه مشتری توسط او ثبت کنید.
2. با همان کاربر وارد شوید: فقط آن سه مشتری دیده شوند.
3. URL یک مشتری متعلق به مدیر را مستقیماً باز کنید ⇒ **۴۰۳**.
4. `GET /api/v1/customers/{id}` با توکن همان کاربر ⇒ **۴۰۳**.
5. به‌عنوان مدیر، یک مشتری تکی و یک کارمند دیگر را به او اعطا کنید ⇒ بلافاصله دیده شوند.
6. اعطا را لغو کنید ⇒ بلافاصله پنهان شود.
7. خروجی اکسل با همان کاربر ⇒ فقط مشتریان مجاز.

### ۵٫۳ سناریوی انبار
1. دستگاه «X» با موجودی ۵ ثبت کنید (یا «ورود کالا» ۵ عدد).
2. تخصیص ۲ عدد به مشتری Y با سریال و فاکتور ⇒ موجودی ۳، لاگ `out` با `stock_before=5`, `stock_after=3`.
3. ویرایش تعداد به ۴ ⇒ موجودی ۱ و لاگ `out` با `quantity=2`.
4. ویرایش تعداد به ۱ ⇒ موجودی ۴ و لاگ `return` با `quantity=3`.
5. تخصیص ۱۰ عدد ⇒ **۴۲۲** با پیام فارسی و **بدون تغییر** موجودی/لاگ.
6. حذف تخصیص ⇒ بازگشت کل تعداد با لاگ `return`.
7. دو تب همزمان روی یک دستگاه با اصلاح موجودی ⇒ یکی از آن‌ها پیام «همزمان توسط کاربر دیگری تغییر کرد».
8. صفحه «انبار و موجودی»: فیلتر نوع عملیات، بازه تاریخ، جستجو و صفحه‌بندی.
9. `GET /api/v1/inventory/reconciliation` پس از چند عملیات ⇒ بدون مغایرت.

### ۵٫۴ سناریوی مشتری حقوقی
1. ثبت مشتری حقوقی فقط با «نام شرکت» و بدون نام/موبایل ⇒ ۲۰۱.
2. در فهرست، عنوان = نام شرکت؛ در پروفایل، «نام شخص» = «ثبت نشده (شخصیت حقوقی)».
3. جستجوی نام شرکت ⇒ یافت شود.
4. ورودی اکسل با ردیف حقوقی بدون موبایل ⇒ ساخته شود و در ورود مجدد، **به‌روز** شود نه تکراری.
5. ثبت مشتری حقیقی بدون نام ⇒ خطای فارسی فرم؛ با کد ملی ۱۱ رقمی ⇒ خطا.

### ۵٫۵ سناریوی اکسل
1. دانلود خروجی مشتریان ⇒ دو شیت با نام‌های فارسی.
2. بازکردن در Excel: سرستون پررنگ، راست‌به‌چپ، عرض خودکار، اعداد عددی، تاریخ‌های شمسی/میلادی خوانا.
3. شیت «دستگاه‌های تخصیص‌یافته» ⇒ یک ردیف برای هر تخصیص با سریال، تعداد و مبلغ فاکتور.
4. دانلود فایل نمونه و پر کردن سه ردیف (حقیقی/حقوقی) ⇒ ورود موفق با گزارش خطا/هشدار.

### ۵٫۶ سناریوی UI و فونت
1. در رزولوشن ۳۶۰px و ۱۹۲۰px، مودال تخصیص دستگاه را باز کنید و تقویم را بگردانید ⇒
   پاپ‌آپ کامل دیده شود، با اسکرول مودال جابه‌جا شود و با `Esc` بسته شود.
2. همه جدول‌ها: اعداد فارسی؛ سریال/کد/ایمیل/موبایل چپ‌به‌راست.
3. پنل `/admin`: فونت وزیرمتن، نام «مدیریت دستگاه‌های صنعتی»، منبع «گردش انبار».
4. صفحه لاگین: هیچ مقدار پیش‌فرض و هیچ باکس نمایش رمز.
5. `Ctrl+F5` برای اطمینان از نبود کش فونت قدیمی.

---

## ۶) موارد خارج از دامنه و شناخته‌شده

| مورد | توضیح |
| :-- | :-- |
| منابع داده نمایشی قدیمی (`Sales`, `Tasks`, `Tickets`, `Reports`, `notifications`) | این صفحات از لایه عمومی `useList/getAll` قدیمی استفاده می‌کنند که endpoint متناظر در `routes/api.php` ندارد؛ در این نسخه **دست‌نخورده** باقی مانده‌اند (فقط سازگاری تایپ‌ها با فیلدهای اختیاری مشتری اصلاح شد). زنده‌سازی آن‌ها نیازمند دامنه جداگانه است. |
| جهت (RTL) پنل Filament | فقط فونت و جداسازی LTR برای کد/ایمیل/سریال اعمال شد؛ بلوک `direction: rtl` سراسری به‌دلیل ریسک به‌هم‌ریختگی چیدمان و نبود امکان آزمون بصری، **عمداً افزوده نشد**. |
| آزمون بار و کارایی | انجام نشد. کوئری‌های فهرست با `with()` و ایندکس‌های جدید بهینه شده‌اند، اما عدد رسمی ظرفیت ارائه نمی‌شود. |
| `migrate:rollback` | فقط برای محیط توسعه اعتبار دارد؛ در راهنمای ارتقا صریحاً توصیه نشده و Rollback با بازیابی بکاپ تعریف شده است. |
| ارسال پیامک و اتصال ملی‌پیامک | بدون تغییر در این نسخه؛ نیازمند خط و شارژ واقعی برای آزمون. |

---

## ۷) اجراهای راستی‌آزمایی ثبت‌شده

```bash
# ۱) بررسی انواع و build فرانت‌اند
$ cd frontend && npx tsc -b --pretty false      # بدون خروجی = بدون خطا
$ npm run build                                  # ✓ built in 959ms
$ ls frontend/dist/assets | wc -l                # 62 فایل: 50 × .js، 3 × .css، 9 × .woff2
$ ls frontend/dist/assets | grep -c woff2        # 9 (شش وزن Vazirmatn FD + سه زیرمجموعه نسخه متغیر)

# ۲) آزمون بسته‌بندی cPanel
$ cd deploy/cpanel && python3 -m unittest discover -s tests -v
Ran 17 tests in 3.194s — OK (skipped=7)
#   ۱۰ آزمون موفق: ساخت بسته، عدم تغییر سورس، رد symlink، رد .env،
#   حفظ نسخه قبلی در خطا، مسیر خروجی با فاصله، رد zip-slip و secrets،
#   رد آرشیو ناقص، قفل PHP قدیمی، پاک‌سازی workspace
#   ۷ آزمون skip: آزمون‌های HTTP نصب‌کننده (نیازمند opt-in صریح + MySQL یک‌بارمصرف)

# ۳) راستی‌آزمایی واژگان (تسک ۲)
$ grep -rn "قطع" -I . | grep -v "^./.git/" | grep -v node_modules | grep -v "^./docs/" \
    | grep -v "^./contracts/" | grep -v "قطعی" | grep -v "^./frontend/dist/"
./README.md:116:  - واژگان سراسری سامانه از «قطعه/قطعات» به «دستگاه/دستگاه‌ها» تغییر یافته است.

# ۴) راستی‌آزمایی لاگین (تسک ۸)
$ grep -c "Admin@123456" frontend/src/pages/Login.tsx   # 0
```

---

## ۸) جمع‌بندی و امضا

- هر ۹ تسک خواسته‌شده و هر ۱۴ باگ شناسایی‌شده در فاز تحلیل، در کد پیاده‌سازی شده‌اند.
- **دو گام با ابزار راستی‌آزمایی قطعی شده‌اند:** تغییر واژگان (grep) و پاکسازی فرم لاگین (grep).
- **سه گام با اجرای ابزار راستی‌آزمایی شده‌اند:** تایپ‌فرانت‌اند، build و آزمون بسته‌بندی.
- **باقی موارد با بازبینی ایستای کد تأیید شده‌اند** و برای قطعیت نهایی به اجرای
  سناریوهای بخش ۵ روی محیط آزمایشی نیاز دارند؛ این محدودیت ناشی از نبود
  PHP/Composer/پایگاه داده در محیط توسعه این نسخه است و در بخش ۱ به‌صراحت اعلام شده.
- هیچ تغییر مخربی در پایگاه داده طراحی نشده است: ارتقا افزودنی، Idempotent و با
  دو مسیر اجرایی (Artisan و SQL خام) به‌همراه گزارش راستی‌آزمایی در پایان هر دو مسیر.

| نقش | نام | نتیجه | امضا |
| :-- | :-- | :-- | :-- |
| توسعه‌دهنده | — | تحویل شد | ………… |
| نماینده کارفرما | — | ☐ پذیرش ☐ پذیرش مشروط ☐ رد | ………… |
| تاریخ پذیرش نهایی | — | …… / …… / ………… | — |

> در صورت «پذیرش مشروط»، فهرست ایرادهای باز و مهلت رفع آن باید در همین صفحه اضافه و پاراف شود.
