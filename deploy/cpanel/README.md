# 🚀 راهنمای استقرار Industrial CRM روی هاست cPanel — بدون SSH

> کل فرآیند فقط با **File Manager** مرورگر انجام می‌شود؛ نه SSH لازم است، نه Composer، نه Node.
> پکیج نصب شامل «نصب‌کننده تحت وب» است — درست مثل نصب وردپرس.

---

## 🗂️ ساختار Split (پیشنهادی) — public جدا از private

سامانه طوری طراحی شده که **فایل‌های عمومی (public)** و **فایل‌های خصوصی (private)** در دو مسیر کاملاً جدا و قابل تنظیم قرار بگیرند:

```
/home/USER/public_html/xx.example.com/        ← web root (DocumentRoot ساب‌دامنه xx.example.com)
│   ├── index.html, assets/, css/, js/, fonts/    ← cpanel-public.zip
│   ├── index.php                                 ← فرانت‌کنترلر Laravel ( app-path.txt را می‌خواند)
│   ├── .htaccess                                 ← مسیریابی SPA + API + مسدودسازی فایل‌های حساس
│   ├── install.php  /  update.php  /  setup-check.php
│   └── storage/                                  ← آپلودها (public/storage)
│
/home/USER/private_pro/project1/myc/          ← مسیر خصوصی (کاملاً خارج از web root — قابل تنظیم)
│   ├── app/  bootstrap/  config/  routes/  resources/  database/
│   ├── vendor/                                   ← کامل، بدون نیاز به composer
│   ├── storage/  .env  artisan  composer.json   ← cpanel-private.zip
```

- مسیر خصوصی **هرجایی** می‌تواند باشد؛ فقط کافی است در زمان نصب در فرم نصب‌کننده وارد شود.
- نصب‌کننده به‌صورت خودکار فایل `app-path.txt` را کنار `index.php` می‌نویسد تا برنامه مسیر خصوصی را پیدا کند.
- چون پوشه private خارج از web root است، کدها، `.env` و `storage` به‌صورت پیش‌فرض از وب **غیرقابل دسترس** هستند.

---

## 📦 پکیج‌های نصب

| فایل | مقصد | محتوا |
|---|---|---|
| `cpanel-public.zip` | web root (DocumentRoot) | SPA build شده، `index.php`، `.htaccess`، `install.php`، `update.php`، `setup-check.php`، `app-path.example.txt`، پوشه `storage/` |
| `cpanel-private.zip` | مسیر خصوصی قابل تنظیم | کل برنامه Laravel + `vendor` کامل + `.env.cpanel.example` |

> برای حالت تک‌پوشه‌ای (قدیمی): با `CPANEL_COMBINED=1 bash deploy/cpanel/build.sh` پکیج `cpanel-app.zip` هم ساخته می‌شود.

---

## ✅ پیش‌نیازهای هاست

1. **PHP نسخه 8.2+** (تست‌شده روی 8.4) — از **MultiPHP Manager**
2. **MySQL + phpMyAdmin**
3. افزونه‌های PHP (از **Select PHP Version → Extensions**):
   ضروری: `pdo_mysql` ، `mbstring` ، `openssl` ، `fileinfo` ، `curl` ، `tokenizer` ، `xml`
   پیشنهادی: `gd` ، `intl` ، `zip`
4. File Manager با قابلیت آپلود/Extract زیپ

---

## 🟢 نصب گام‌به‌گام (روش Split — پیشنهادی)

### گام ۱ — ساخت ساب‌دامنه و مسیرها
1. در cPanel → **Domains → Subdomains** یک ساب‌دامنه بساز؛ مثلاً `xx.example.com`
   - DocumentRoot آن را روی یک پوشه مثل `/home/USER/public_html/xx.example.com` بگذار.
2. با **File Manager** پوشه_private خارج از web root بساز؛ مثلاً:
   `/home/USER/private_pro/project1/myc`

### گام ۲ — آپلود و استخراج
1. `cpanel-private.zip` را در `/home/USER/private_pro/project1/myc` آپلود و **Extract** کن؛ سپس فایل زیپ را حذف کن.
2. `cpanel-public.zip` را در `/home/USER/public_html/xx.example.com` (web root) آپلود و **Extract** کن؛ سپس فایل زیپ را حذف کن.

### گام ۳ — ساخت دیتابیس
cPanel → **MySQL® Database Wizard** → دیتابیس خالی + کاربر + رمز قوی → **ALL PRIVILEGES**.
*(جدول‌ها را خود نصب‌کننده می‌سازد — Import دستی لازم نیست.)*

### گام ۴ — اجرای ویزارد نصب
در مرورگر باز کن:

```
https://xx.example.com/install.php
```

1. جدول «بررسی محیط» را ببین — همه باید ✅ باشند.
2. فرم را پر کن:
   - **آدرس سایت:** `https://xx.example.com`
   - **مسیر خصوصی برنامه:** `/home/USER/private_pro/project1/myc`
   - host/پورت/نام/کاربر/رمز دیتابیس
3. دکمه **«شروع نصب»** را بزن:
   - `app-path.txt` کنار `index.php` نوشته می‌شود ✅
   - `.env` با `APP_KEY` یکتا در مسیر خصوصی ساخته می‌شود ✅
- مایگریشن‌ها + داده اولیه اجرا می‌شوند ✅
   - `install.php` خودش را حذف می‌کند ✅

### گام ۵ — اولین ورود
- `https://xx.example.com` → ورود با `admin@crm.local` / `Admin@123456`
- تست: داشبورد، مشتریان، قطعات، پیامک، `/admin` (Filament)، `/docs/api`
- ⚠️ **فوراً رمز ادمین را عوض کن.**

---

## 🔵 حالت تک‌پوشه‌ای (DocumentRoot قابل تغییر نیست)

اگر فقط بتوانی DocumentRoot را روی `public_html` نگه دارید:

1. `cpanel-app.zip` (ساخته‌شده با `CPANEL_COMBINED=1`) را داخل `public_html` استخراج کن.
2. محتوای `_cpanel-root-htaccess.txt` را جایگزین `public_html/.htaccess` کن
   (این فایل مسیرهای private مثل `vendor/` و `storage/` را با 403 مسدود می‌کند).
3. همان گام‌های ۳ و ۴ بالا را انجام بده؛ در فرم، مسیر خصوصی را همان
   `/home/USER/public_html` وارد کن (یا خالی بگذار تا به‌صورت خودکار parent of public/ تشخیص داده شود).

---

## 🔁 به‌روزرسانی نسخه

1. **بکاپ:** phpMyAdmin → Export + کپی از `.env` و پوشه‌های `storage/` (private) و `public/storage`.
2. زیپ‌های جدید را روی مسیرهای قبلی استخراج کن (overwrite):
   - `cpanel-private.zip` → همان مسیر خصوصی قبلی
   - `cpanel-public.zip` → همان web root قبلی
   - ⚠️ نگران `.env` و `app-path.txt` نباش — در زیپ‌ها نیستند و رونویسی نمی‌شوند.
3. مقدار `APP_KEY` را از `.env` (در مسیر خصوصی) کپی کن و باز کن:
   ```
   https://xx.example.com/update.php?key=APP_KEY
   ```
4. دکمه «اجرای مایگریشن‌ها» را بزن → `update.php` خودش را حذف می‌کند.

---

## 🔐 چک‌لیست امنیتی بعد از نصب

- [ ] رمز `admin@crm.local` تغییر کرد
- [ ] `install.php` حذف شد (خودکار حذف می‌شود — مطمئن شو)
- [ ] `setup-check.php` از web root حذف شد
- [ ] `update.php` بعد از هر استفاده حذف شد
- [ ] SSL رایگان فعال شد (cPanel → SSL/TLS Status → Run AutoSSL)
- [ ] `APP_URL` دقیقاً همان دامنه‌ای است که باز می‌کنی
- [ ] بکاپ اولیه دیتابیس گرفته شد
- [ ] دسترسی پوشه‌های private روی 755 و فایل `.env` روی 640 است

---

## 🩹 عیب‌یابی رایج

| مشکل | علت | راه‌حل |
|---|---|---|
| نصب‌کننده: «vendor یافت نشد» | مسیر خصوصی اشتباه است | مسیر `/home/USER/private_pro/project1/myc` را در فرم درست وارد کن و مطمئن شو `cpanel-private.zip` همان‌جا extract شده |
| صفحه 500 | مسیر خصوصی با app-path.txt پیدا نمی‌شود | فایل `app-path.txt` کنار `index.php` را چک کن؛ یا `APP_BASE_PATH` را در PHP Manager ست کن |
| «could not find driver» | `pdo_mysql` خاموش | Select PHP Version → Extensions |
| صفحه سفید | PHP < 8.2 | MultiPHP Manager → 8.2+ |
| بعد از لاگین بیرون می‌اندازد | `APP_URL` ناهماهنگ | `.env` را اصلاح کن |
| deep-link 404 (مثل /customers) | htaccess قدیمی | محتوای `deploy/cpanel/htaccess/public.htaccess` را در web root کپی کن |
| خطای 419/session | storage غیرقابل‌نوشتن | پوشه‌های `storage` و `bootstrap/cache` در مسیر خصوصی → 775 |
| آپلود آواتار/اکسل خطا | محدودیت PHP | MultiPHP INI Editor → `upload_max_filesize=12M` و `post_max_size=12M` |
| پیامک واقعی ارسال نمی‌شود | Sandbox روشن | تنظیمات → ملی‌پیامک → اطلاعات را وارد کن و Sandbox را خاموش کن |

---

## 🛠️ ساخت پکیج (توسعه‌دهنده)

```bash
bash deploy/cpanel/build.sh
# خروجی در cpanel-release/:
#   cpanel-public.zip + cpanel-private.zip   (پیش‌فرض)
#   cpanel-app.zip                            (با CPANEL_COMBINED=1)
```

پیش‌نیاز: PHP 8.2+ و Composer و Node 18+ و `zip`.

---

## 📁 نقشه فایل‌های استقرار

```
deploy/cpanel/
├── README.md               ← همین راهنما
├── build.sh                ← اسکریپت ساخت پکیج‌های public/private
├── install.php             ← ویزارد نصب تحت وب (به web root کپی می‌شود)
├── update.php              ← اجرای مایگریشن هنگام آپدیت (به web root کپی می‌شود)
├── setup-check.php         ← بررسی سلامت محیط (به web root کپی می‌شود)
├── env.cpanel.example      ← قالب .env (APP_KEY موقع build ساخته می‌شود)
└── htaccess/
    ├── public.htaccess     ← web root (مسیریابی SPA + API + deny فایل‌های حساس)
    └── root.htaccess       ← حالت تک‌پوشه‌ای داخل public_html (404/403 روی مسیرهای private)
```

```
backend/public/
├── index.php               ← فرانت‌کنترلر؛ مسیر private را از app-path.txt / APP_BASE_PATH می‌خواند
└── app-path.example.txt    ← نمونه فایل اشاره‌گر مسیر خصوصی
```
