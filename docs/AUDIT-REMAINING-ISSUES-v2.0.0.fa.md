# 🔎 ممیزی باقی‌مانده سامانه پس از `v2.0.0`

**تاریخ:** ۲۰۲۶-۱۱-۰۹ · **شاخه:** `arena/9853e259-industrial-crm-project` · **PR:** #8 (CI سبز ✅)
**دامنه ممیزی:** بک‌اند (API، سرویس‌ها، مدل‌ها، مایگریشن‌ها، پنل Filament)، فرانت‌اند (صفحات، لایه داده، پیکربندی)،
بسته استقرار cPanel، پیکربندی‌ها و مستندات.

> روش: بازبینی ایستای کد + تطبیق مسیرهای API با کلاینت فرانت‌اند + نتایج اجرای واقعی CI.
> در محیط توسعه PHP/Composer/پایگاه داده در دسترس نیست؛ بنابراین موارد سمت بک‌اند «بر پایه کد» گزارش شده‌اند
> و در ستون «راستی‌آزمایی» مشخص شده کدام‌ها نیازمند تأیید اجرایی‌اند.

---

## ۰) خلاصه مدیریتی

| شدت | تعداد | موضوع کلی |
| :- | :- | :-- |
| 🔴 P0 | ۴ | پنل Filament قانون‌های انبار/حفاظت از حساب را دور می‌زند + مستندات API در پروداکشن عمومی است |
| 🟠 P1 | ۷ | باگ‌های کارکردی (۵۰۰ به‌جای ۴۲۲، نبود ErrorBoundary، اعلان‌های مرده، ناسازگاری اعتبارسنجی) |
| 🟡 P2 | ۱۳ | کد مرده، بهداشت پیکربندی، نبود آزمون خودکار بک‌اند، تفاوت اعتبارسنجی پنل و API |

**جمع‌بندی:** هسته API و لایه سرویس (انبار، RBAC، تخصیص، اکسل) سالم و در CI راستی‌آزمایی شده‌اند.
بیشترین ریسک باقی‌مانده در **پنل مدیریت Filament** است که لایه سرویس را دور می‌زند، و در
**عمومی بودن `/docs/api`** روی پروداکشن. هیچ‌کدام از موارد زیر مانع استقرار نیستند،
اما سه مورد اول می‌توانند **داده انبار یا دسترسی سامانه را خراب کنند**.

---

## ۱) 🔴 P0 — یکپارچگی داده، حسابرسی و امنیت

### P0-۱ · پنل Filament موجودی انبار را بدون لاگ تغییر می‌دهد
**شواهد:** `backend/app/Filament/Resources/PartResource.php:44-48`
```php
Forms\Components\TextInput::make('stock_quantity')
    ->label('موجودی انبار (عدد)')->numeric()->default(0)
    ->helperText('تغییر این مقدار، یک رکورد «اصلاح دستی موجودی» در تاریخچه انبار ثبت می‌کند.'),
```
`backend/app/Filament/Resources/PartResource/Pages/EditPart.php` هیچ هوک `afterSave`/`mutateFormDataUsing` ندارد و
`app/Models/Part.php` هیچ `booted()`/رویداد مدلی ندارد.

**اثر:** ویرایش موجودی از `/admin` مقدار را **بدون هیچ ردیف `inventory_logs`** تغییر می‌دهد ⇒
`stock_before`/`stock_after` از بین می‌رود، گزارش «مغایرت انبار» بی‌معنا می‌شود و متن راهنمای خودِ فیلد نادرست است.
(مسیر API درست است: `PartController::update` → `InventoryService::adjustTo()` و `store` → `receive()`.)

**رفع پیشنهادی:** `stock_quantity` در پنل `->disabled()->dehydrated(false)` شود و به‌جایش یک
`Action` در هدر `EditPart` با فرم «نوع حرکت + تعداد + مرجع» که `InventoryService` را صدا می‌زند
(یا هوک `saved` که اختلاف را به `adjustTo` بدهد). **تلاش: ~۱.۵ ساعت** · راستی‌آزمایی: اجرای واقعی پنل.

### P0-۲ · حذف آبشاری از پنل، داده مشتری/دستگاه را نابود می‌کند
**شواهد:**
- `PartResource.php:117-118` → `DeleteBulkAction` و `EditPart.php:16` → `Actions\DeleteAction`
- `CustomerResource.php:151-153` → `DeleteBulkAction`
- هیچ `static::deleting` در `Part.php` / `Customer.php` / `CustomerPart.php` وجود ندارد
  (بازبینی: `grep -n "booted\|static::\|deleting"` ⇒ بدون خروجی).

**اثر:**
| عملیات در پنل | آنچه رخ می‌دهد | آنچه API انجام می‌دهد |
| :-- | :-- | :-- |
| حذف دستگاه دارای تخصیص/لاگ | `customer_parts` و `inventory_logs` به‌صورت آبشاری **حذف** می‌شوند | `422` با پیشنهاد «غیرفعال کنید» (`PartController.php:177-190`) |
| حذف (گروهی) مشتری | تخصیص‌ها آبشاری حذف می‌شوند و **موجودی به انبار بازنمی‌گردد** | `CustomerService::deleteCustomer()` هر تخصیص را با لاگ `return` به انبار برمی‌گرداند (`:298-320`) |

یعنی حذف دسته‌جمعی مشتریان از پنل = **نشتی دائمی موجودی** بدون هیچ ردیف حسابرسی.

**رفع پیشنهادی:** افزودن `static::deleting` به `CustomerPart` (بازگشت به انبار + لاگ) و
`Customer` (پیمایش تخصیص‌ها)، و `Part` (رد حذف در صورت وجود تخصیص/لاگ با `ValidationException` فارسی)
تا **همه** مسیرها (API، پنل، Artisan، Tinker) امن شوند؛ به‌علاوه حذف `DeleteBulkAction` از این سه منبع.
**تلاش: ~۲ ساعت** · راستی‌آزمایی: افزودن سناریو به `smoke-package.php` (حذف از مسیر Eloquent مستقیم).

### P0-۳ · `/docs/api` در پروداکشن عمومی است
**شواهد:** `backend/config/scramble.php` ⇒ `'middleware' => ['web']`؛ `dedoc/scramble ^0.11` در
`require` (نه `require-dev`) `composer.json`؛ و `deploy/cpanel/htaccess/public.htaccess`
مسیر `docs` را صریحاً از fallback اسپا استثنا کرده ⇒ درخواست به لاراول می‌رسد.

**اثر:** هر بازدیدکننده‌ای می‌تواند **کل سطح API** (همه مسیرها، پارامترها، قواعد اعتبارسنجی و نمونه پاسخ‌ها)
را ببیند و از پنل «Try it» درخواست بزند. این کار نفوذ را سخت‌تر می‌کند اما نقشه راه حمله را رایگان می‌دهد.

**رفع پیشنهادی:** `'middleware' => ['web', 'auth:sanctum', 'ability:...']` یا ساده‌تر
`'enabled' => env('SCRAMBLE_DOCS_ENABLED', !app()->isProduction())` + افزودن کلید به
`env.cpanel.example` با مقدار `false`. **تلاش: ~۲۰ دقیقه** · راستی‌آزمایی: `curl -o /dev/null -w "%{http_code}" https://host/docs/api` باید `403/404` شود.

### P0-۴ · پنل می‌تواند سامانه را قفل کند و لاگ پیامک را جعل کند
**شواهد:**
- `UserResource/Pages/EditUser.php:16` → `Actions\DeleteAction::make()` بدون هیچ گارد؛
  `UserResource.php:86` → `Toggle::make('is_active')` بدون حفاظت از خود کاربر؛
  `UserResource.php:45-51` → فیلد رمز بدون قواعد API (`min:8` + حرف + رقم در `AuthController.php:176`).
- گاردهای API موجود ولی در پنل غایب: `UserController.php:221-231`
  (حذف خود ⇒ `422`، حذف `admin@crm.local` ⇒ `422`، حذف مدیر ارشد توسط غیر مدیر ⇒ `403`).
- `SmsLogResource` دارای صفحه `CreateSmsLog`، `EditAction` (`:88`) و `DeleteBulkAction` (`:92`) است.

**اثر:** یک مدیر ارشد می‌تواند از پنل **حساب خودش یا تنها مدیر سامانه را حذف/غیرفعال کند** (قفل‌شدن کامل)،
رمز ضعیف بسازد، و **سوابق پیامک (داده حسابرسی) را جعل، ویرایش یا حذف کند**.
`InventoryLogResource` به‌درستی فقط `ListInventoryLogs` دارد (فقط خواندنی) — همان الگو باید برای `SmsLogResource` اعمال شود.

**رفع پیشنهادی:** در `EditUser`: `DeleteAction->visible(fn() => …)` با همان سه گارد API + غیرفعال‌سازی
`is_active` برای رکورد جاری + افزودن قواعد رمز؛ در `SmsLogResource`: حذف `Create/Edit/Delete`
و `canCreate(): false`. **تلاش: ~۱ ساعت**

---

## ۲) 🟠 P1 — باگ‌های کارکردی

### P1-۱ · ویرایش تخصیص با سریال تکراری ⇒ خطای ۵۰۰ به‌جای پیام فارسی
`PartController.php:212` (ثبت) دارای `unique:customer_parts,serial_number` است، اما
`:263` (ویرایش) فقط `sometimes|string|max:100|regex` دارد — **بدون** `unique:…,serial_number,{id}`.
چون `customer_parts.serial_number` در پایگاه داده یکتا است، ویرایش به سریالِ موجود
⇒ `SQLSTATE[23000]` ⇒ **۵۰۰** (در پروداکشن با `APP_DEBUG=false` پیام بی‌محتوا).
**رفع:** افزودن `Rule::unique('customer_parts','serial_number')->ignore($customerPart->id)` · **۱۰ دقیقه**

### P1-۲ · یک سریال برای چند دستگاه فیزیکی (تصمیم طراحی)
`serial_number` **الزامی و یکتا** است ولی `quantity` تا `100000` مجاز است
(`PartController.php:212-213`) ⇒ تخصیص «۳ دستگاه با یک سریال».
گارانتی، سابقه سرویس و لاگ انبار همه در سطح **ردیف** هستند نه واحد فیزیکی.
**اثر:** ردیابی سریال تک‌تک دستگاه‌ها ممکن نیست؛ اگر مشتری دستگاه‌ها را جداگانه گارانتی/تعمیر می‌کند،
نیاز به جدول فرزندی مثل `customer_part_serials` (هر ردیف = یک واحد فیزیکی) است.
**تصمیم لازم:** آیا «تعداد + یک سریال» پذیرفته است یا ردیابی واحد‌به‌واحد می‌خواهند؟ · **۴ تا ۸ ساعت اگر لازم باشد**

### P1-۳ · تغییر شخصیت مشتری، کد ملی ناسازگار به جا می‌گذارد
`CustomerController::update` (`:128-142`) قواعد را با نوع جدید می‌سنجد
(حقوقی ⇒ ۱۱ رقم، حقیقی ⇒ ۱۰ رقم) ولی مقدار ذخیره‌شده را پاک/تبدیل نمی‌کند.
**اثر:** مشتری حقیقی با کد ملی ۱۰ رقمی که به حقوقی تبدیل شود، از آن پس در **هر ویرایش بعدی**
خطای «شناسه ملی باید ۱۱ رقم باشد» می‌گیرد (حتی اگر فقط آدرس را عوض کند).
**رفع:** در `update` هنگام تغییر `type`، `national_code` ناسازگار `null` شود (با ثبت رویداد در تاریخچه) · **۳۰ دقیقه**

### P1-۴ · نبودِ کنترل تکراری روی موبایل / کد ملی / ایمیل در API
قواعد `store`/`update` (`CustomerController.php:253-258`) هیچ `unique` ندارند؛
فقط `CustomersImport` رکورد تکراری را تشخیص می‌دهد.
**اثر:** ثبت دستی دو مشتری با یک موبایل/کد ملی ⇒ پرونده‌های موازی، آمار گمراه‌کننده و
داده تکراری در خروجی اکسل. (در پایگاه داده فقط ایندکس ساده روی `mobile` است، نه یکتا.)
**رفع پیشنهادی:** `unique` نرم + پیام هشدار («مشتری مشابه با همین موبایل وجود دارد؛ مطمئنید؟»)
یا اجبار یکتایی در سطح DB با مایگریشن افزودنی و `IGNORE` برای داده موجود. **تصمیم کارفرما لازم است** · **۱ تا ۲ ساعت**

### P1-۵ · زنگوله اعلان‌ها مرده است و درخواست ۴۰۴ می‌زند
`layouts/NotificationsMenu.tsx` از `useList('notifications')` استفاده می‌کند ⇒
`GET /api/v1/notifications` که در `routes/api.php` **وجود ندارد**. با `retry: 1`
(`App.tsx:27`) در هر بار سوار شدن، **دو درخواست ۴۰۴** ثبت می‌شود و منو همیشه
«اعلان جدیدی ندارید» می‌گوید.
**رفع (ارزان):** تغذیه از داده‌های واقعی موجود — `low_stock_items` از `/inventory/summary`،
`recent_activities` و `recent_sms` از `/dashboard/stats`، و سررسیدهای گارانتی؛
یا حذف موقت کامپوننت از هدر. **۱ تا ۲ ساعت**

### P1-۶ · نبودِ ErrorBoundary ⇒ صفحه سفید پس از استقرار نسخه جدید
`grep -rn "ErrorBoundary|errorElement" frontend/src` ⇒ **بدون نتیجه**؛
همه صفحات `lazy()` هستند و `main.tsx` فقط `<Suspense fallback={null}>` دارد.
**اثر:** کاربری که `index.html` کش‌شده قدیمی دارد و chunk هش‌دار قدیمی را درخواست می‌کند
(پس از هر استقرار) با شکست `import()` پویا مواجه می‌شود ⇒ **صفحه کاملاً سفید، بدون هیچ پیام یا راه بازگشت**.
**رفع:** یک `ErrorBoundary` سراسری با دکمه «بارگذاری مجدد» + هندلر
`window.addEventListener('vite:preloadError', …)` و `retry` خودکار یک‌باره. **۴۵ دقیقه**

### P1-۷ · «اصلاح موجودی» نمی‌تواند موجودی را صفر کند
`InventoryController.php:64` ⇒ `'quantity' => 'required|integer|min:1|…'` در حالی که برای
`type=adjustment` این عدد «موجودی نهایی» است (`:116-121` → `adjustTo(newStock:)`)؛
فرانت‌اند هم همان `min 1` را دارد (`StockMovementModal.tsx:21`).
اما `PUT /parts/{id}` اجازه `stock_quantity = 0` می‌دهد (`PartController.php:400`).
**اثر:** پس از انبارگردانی، صفرکردن موجودی از صفحه انبار ممکن نیست (کاربر مجبور است از فرم دستگاه اقدام کند).
**رفع:** `min:0` وقتی `type=adjustment` است (یا فیلد مجزای `new_stock`) + هماهنگ‌سازی zod. **۲۰ دقیقه**

---

## ۳) 🟡 P2 — کد مرده، بهداشت و آزمون

| # | مورد | شواهد | اثر / پیشنهاد |
| :- | :-- | :-- | :-- |
| P2-۱ | **۷ صفحه دمو route‌نشده** که ۹ endpoint ناموجود را صدا می‌زنند | `pages/{Sales,Tasks,Tickets,Reports,Pipeline,Chat,Calendar}.tsx` + `hooks/useData.ts` + `utils/{csv,analytics}.ts` + تایپ‌های `Resources` (`types/index.ts:460-475`): `sales, tickets, tasks, rooms, products, notifications, messages, leads, events` | در `App.tsx` route نشده‌اند ⇒ در bundle نیستند، اما در `tsc` بررسی می‌شوند و هر تغییر در تایپ‌های `Customer`/`User` آن‌ها را می‌شکند (همان چیزی که در این نسخه اتفاق افتاد). پیشنهاد: حذف یا انتقال به `src/_legacy/` خارج از `include` |
| P2-۲ | تنظیمات قدیمی Scramble | `config/scramble.php`: `'version' => '1.0.0'` (در برابر `crm.version = 2.0.0`)، `'ui.title' => 'Parts CRM - OpenAPI Documentation'` (واژه **Parts** از تغییر نام جا مانده)، `servers` فقط `http://localhost:8000` ⇒ «Try it» در پروداکشن به لوکال‌هاست می‌زند | نسخه از `config('crm.version')`، عنوان فارسی/«دستگاه‌ها»، و `servers` بر پایه `APP_URL` |
| P2-۳ | `config/crm.php: max_per_page` استفاده نمی‌شود | کنترلرها مقدار را سخت کد کرده‌اند: `CustomerController.php:70` (۱۰۰)، `InventoryController.php:47` (۱۰۰) و `:184` (۵۰)، `SmsController.php:97` (۱۰۰) | یا از config بخوانند یا کلید حذف شود (پیکربندی مرده گمراه‌کننده است) |
| P2-۴ | وابستگی بی‌استفاده | `spatie/laravel-activitylog ^4.8` در `require` ولی `grep -rln "LogsActivity|Activity::" backend/app` ⇒ **بدون نتیجه** | حذف از `composer.json` (کاهش حجم `vendor/` در بسته cPanel) — یا واقعاً استفاده شود |
| P2-۵ | ناسازگاری نسخه PHP | `composer.json` ⇒ `php ^8.2` ولی `composer.lock` به ۸.۴.۱+ نیاز دارد (در `deploy/cpanel/README.md` مستند شده) | `^8.4` در `composer.json` تا پیام خطای محلی گمراه‌کننده نباشد |
| P2-۶ | نسخه بسته فرانت‌اند | `frontend/package.json` ⇒ `"version": "0.0.0"` در برابر `VERSION = 2.0.0` | هم‌ترازسازی (به‌همراه `package-lock.json` تا `npm ci` نشکند) |
| P2-۷ | **نبود آزمون خودکار بک‌اند** | `backend/tests/` فقط `Feature/ExampleTest.php` و `Unit/ExampleTest.php` (قالب پیش‌فرض لاراول)؛ `phpunit ^11` در `require-dev` نصب است | تنها پوشش واقعی، `deploy/cpanel/tests/smoke-package.php` است. پیشنهاد: حداقل آزمون Feature برای ۴۰۳ دامنه دسترسی، ۴۲۲ کمبود موجودی و صفحه‌بندی `/inventory/logs` |
| P2-۸ | اعتبارسنجی پنل ضعیف‌تر از API | `PartResource.php:35-38` ⇒ `code` بدون `unique` (ایندکس یکتا در DB ⇒ **۵۰۰** در پنل) و `name` با `maxLength(255)` در برابر `max:150` در API؛ `CustomerResource.php:63-72` ⇒ `national_code` بدون قواعد ۱۰/۱۱ رقمی و `mobile` بدون نرمال‌سازی `09…` | هم‌ترازسازی قواعد پنل با API تا داده «غیرقابل ویرایش در API» تولید نشود |
| P2-۹ | مجوزها در پنل با کلید خام و بدون پیش‌فرض نقش | `UserResource.php:90-92` ⇒ `CheckboxList::make('permissions')->relationship('permissions','name')` (برچسب فارسی/گروه ندارد) و انتخاب نقش، مجوزهای پیش‌فرض `config/acl.php` را پر نمی‌کند | کاربر ساخته‌شده در پنل می‌تواند **صفر مجوز** داشته باشد (وارد می‌شود ولی چیزی نمی‌بیند). پیشنهاد: `->options(UserController::PERMISSION_LABELS)` + `afterStateUpdated` برای اعمال پیش‌فرض نقش |
| P2-۱۰ | اعتبارنامه نمایشی در Seeder | `DatabaseSeeder.php:32-36` ⇒ `admin@crm.local` / `Admin@123456` (در `README.md` هم منتشر شده) | مسیر نصب cPanel این رمز را رد می‌کند و smoke test تأیید می‌کند مدیرِ نصب‌شده این رمز را ندارد؛ ولی `db:seed` روی سرور = اعتبارنامه شناخته‌شده. پیشنهاد: رمز از `env('SEED_ADMIN_PASSWORD')` با اجبار در محیط غیر local |
| P2-۱۱ | منابع Filament دامنه دسترسی را اعمال نمی‌کنند | `grep -rn "visibleTo" app/Filament/` ⇒ **بدون نتیجه** | با `canAccessPanel` (فقط مدیر ارشد + `users.manage`، `User.php:35-38`) محدود شده، ولی مدیرِ با دامنه `own` در پنل همه را می‌بیند. پیشنهاد: `getEloquentQuery()` با `visibleTo(auth()->user())` |
| P2-۱۲ | بهینه‌سازی بسته فرانت‌اند | `vite.config.ts` بدون `manualChunks`/`chunkSizeWarningLimit`؛ chunk اصلی `444 kB` (gzip `141 kB`) | تفکیک `recharts`/`framer-motion`/`zod` به chunk جدا برای کش بهتر |
| P2-۱۳ | importهای مرده | `CustomerResource.php:6,13-14` ⇒ `RelationManagers` (پوشه‌اش وجود ندارد)، `Builder`، `SoftDeletingScope` | حذف (Pint این‌ها را تمیز می‌کند — `laravel/pint` در `require-dev` هست ولی در CI اجرا نمی‌شود) |

---

## ۴) آنچه سالم است و نیازی به کار ندارد ✅

برای اینکه تصویر یک‌طرفه نباشد، این موارد در همین ممیزی تأیید شدند:

| حوزه | وضعیت |
| :-- | :-- |
| لایه سرویس انبار | `DB::transaction` + `lockForUpdate` + گارد به‌روزرسانی شرطی؛ `InventoryService.php:152-214` — در CI روی MySQL و SQLite اجرا و PASS شد |
| اعمال دامنه دسترسی در API | `Controller::authorizeCustomerAccess()` در ۸ نقطه؛ ۱۳ فراخوانی `visibleTo` در کنترلر/اکسپورت/Filament؛ ۴۰۳ واقعی نه پنهان‌سازی UI |
| RBAC در سطح مدل | smoke test در CI: کارمند فروش مشتری دیگران را نمی‌بیند، اعطای کارمند/مشتری تکی کار می‌کند، دامنه `all` همه را می‌دهد |
| حذف مشتری از API | `CustomerService::deleteCustomer()` همه دستگاه‌ها را با لاگ `return` به انبار برمی‌گرداند (`:298-320`) |
| تغییر موجودی از API | `store` ⇒ `receive()` با لاگ `in`؛ `update` ⇒ `adjustTo()` با لاگ `adjustment` (`PartController.php:81-97,155-158`) |
| اکسل | هر دو شیت `visibleTo` + `with([...])` (بدون N+1)، `ShouldAutoSize`، `setRightToLeft(true)` |
| ورودی اکسل | نرمال‌سازی موبایل/ارقام، تشخیص تکراری سه‌کلیدی، تفکیک `errors`/`warnings`، ثبت مالک برای رکوردهای جدید |
| صفحه‌بندی | `per_page` در همه فهرست‌ها clamp شده (`max(1, min(100|50, …))`) |
| ورود و توکن | `throttle:10,1` روی login و `5,1` روی OTP، کوکی `httpOnly`، حذف مقادیر پیش‌فرض فرم لاگین |
| تقویم شمسی | `toGregorian()` از `jalaali-js` ⇒ مقدار ارسالی به API میلادی `YYYY-MM-DD` است (فیلتر `whereDate` درست کار می‌کند) |
| بسته cPanel | `.htaccess` با `DirectoryIndex index.html index.php`، fallback اسپا با استثناهای `api|admin|docs|livewire|storage|css|fonts|js|up`، رد اجرای اسکریپت در `storage/`، رد symlink/`.env`/`*.sql` در `verify-package.sh` |
| ارتقای پایگاه داده | مایگریشن‌ها و فایل SQL خام Idempotent (در CI دو بار اجرا شد)؛ اسکریپت SQL طول/کاراکترست فعلی ستون‌ها را حفظ می‌کند |
| بهداشت کد | `grep -rn "TODO|FIXME|XXX|HACK" frontend/src backend/app` ⇒ **صفر مورد** |

---

## ۵) ترتیب پیشنهادی رفع

| اولویت | موارد | تلاش برآوردی | چرا اول |
| :- | :-- | :-- | :-- |
| ۱ | P0-۲ + P0-۱ (هوک‌های `deleting` در مدل‌ها + قفل `stock_quantity` در پنل) | ~۳ ساعت | جلوی **خرابی داده انبار** را می‌گیرد و همه مسیرها (API/پنل/Tinker) را امن می‌کند |
| ۲ | P0-۴ (گاردهای `UserResource` + فقط‌خواندنی‌سازی `SmsLogResource`) | ~۱ ساعت | جلوی قفل‌شدن سامانه و جعل داده حسابرسی |
| ۳ | P0-۳ (بستن `/docs/api` در پروداکشن) | ~۲۰ دقیقه | کاهش سطح حمله، بدون اثر بر کارکرد |
| ۴ | P1-۱ + P1-۷ + P1-۳ | ~۱ ساعت | سه باگ کوچک با اثر کاربری ملموس (۵۰۰، صفرکردن موجودی، قفل‌شدن ویرایش مشتری) |
| ۵ | P1-۶ + P1-۵ | ~۲ ساعت | تجربه کاربری پس از هر استقرار + زنده‌کردن اعلان‌ها با داده واقعی |
| ۶ | P1-۲ + P1-۴ | نیازمند تصمیم کارفرما | هر دو تغییر مدل داده/قاعده کسب‌وکارند، نه باگ |
| ۷ | P2-* | ~۴ ساعت (مجزا) | پاک‌سازی، هم‌ترازسازی نسخه‌ها و افزودن آزمون Feature |

**جمع تلاش برای P0 + P1های بدون نیاز به تصمیم: حدود ۷ ساعت کاری.**

---

## ۶) محدودیت‌های همین ممیزی

- بدون PHP/Composer/پایگاه داده در محیط توسعه ⇒ هیچ‌یک از موارد بالا با اجرای واقعی مرورگر/پنل بازتولید نشدند؛
  استنتاج از خواندن کد است (برای P0-۱/P0-۲ با اطمینان بالا، چون «نبودِ هوک» یک واقعیت ایستای کد است).
- رندر بصری (تقویم Portal، فونت FD، RTL پنل) و بازکردن خروجی `.xlsx` در Excel آزمون نشد.
- آزمون بار/کارایی و امنیت خارجی (تست نفوذ، rate limit در مقیاس) انجام نشد.
- اتصال واقعی ملی‌پیامک (خط و شارژ) آزمون نشد؛ حالت Sandbox همچنان فعال است.
