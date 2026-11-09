# راهنمای کامل ساخت بسته نصب cPanel روی کامپیوتر ویندوزی

این راهنما برای همین پروژه نوشته شده است. تمام مراحل دانلود وابستگی‌ها، ساخت React و تولید ZIP روی **کامپیوتر خودتان** انجام می‌شود؛ روی هاست فقط فایل‌ها را استخراج و ویزارد نصب را اجرا می‌کنید. نیازی به GitHub Actions، Node، Composer یا SSH روی هاست ندارید.

> **نکته بسیار مهم درباره نسخه PHP:** با وجود اینکه `composer.json` حداقل PHP 8.2 را اعلام می‌کند، فایل فعلی `backend/composer.lock` شامل وابستگی‌هایی مثل `symfony/string` و `symfony/translation` با نیاز **PHP >= 8.4.1** است. بنابراین برای ساخت **همین نسخه قفل‌شده** و اجرای آن روی هاست، PHP **8.4.1 یا جدیدتر سازگار** لازم است. پیشنهاد این راهنما PHP 8.4 به‌روز است. اگر هاست فقط 8.2 یا 8.3 دارد، این بسته را روی آن نصب نکنید؛ باید وابستگی‌ها جداگانه برای نسخه هدف بازحل، قفل و آزمون شوند. از `--ignore-platform-reqs` استفاده نکنید.

---

## ۱. روش پیشنهادی و خروجی نهایی

از **WSL 2 + Ubuntu 24.04** استفاده می‌کنیم. WSL محیط لینوکس داخل ویندوز است، نه سرور خارجی. مزیت آن این است که اسکریپت موجود `build.sh` بدون تبدیل به PowerShell اجرا می‌شود و محیط ساخت به هاست لینوکسی نزدیک است.

خروجی:

```text
cpanel-release/
├── cpanel-public.zip
├── cpanel-private.zip
├── SHA256SUMS
└── build-info.txt
```

- `cpanel-public.zip`: فایل‌های عمومی، React ساخته‌شده، assets، ورودی PHP، ویزارد و قواعد Apache.
- `cpanel-private.zip`: هسته Laravel، vendor و فایل‌های خصوصی برنامه؛ بدون `.env` فعال.

**نباید ZIP سورس کل پروژه، پوشه frontend یا node_modules را به جای این دو فایل روی هاست آپلود کنید.**

### پیش‌نیازها

- Windows 11 یا Windows 10 به‌روز و سازگار با WSL 2.
- دسترسی Administrator فقط برای فعال‌سازی WSL.
- اینترنت برای دریافت بسته‌های Ubuntu، PHP، Composer و npm.
- چند گیگابایت فضای آزاد؛ پیشنهاد حداقل ۱۰ گیگابایت برای محیط و وابستگی‌ها.
- هاست Linux cPanel با PHP 8.4.1+، MySQL سازگار و Apache/LiteSpeed با rewrite.

### کدام ترمینال؟

| عنوان کنار دستور | محل اجرا |
|---|---|
| PowerShell مدیر | ویندوز، Run as administrator |
| Ubuntu / WSL | برنامه Ubuntu از منوی Start |
| cPanel | مرورگر، File Manager و تنظیمات هاست |

**دستورهای `sudo`، `bash`، `composer` و `npm` این راهنما را در Ubuntu اجرا کنید، نه PowerShell ویندوز یا Git Bash.** نصب XAMPP یا PHP ویندوز برای این روش لازم نیست.

---

## ۲. نصب WSL و Ubuntu؛ فقط بار اول

در Start عبارت PowerShell را جست‌وجو و **Run as administrator** را انتخاب کنید:

```powershell
wsl --install -d Ubuntu-24.04
```

اگر نصب نیاز به Restart داشت، ویندوز را Restart کنید. سپس Ubuntu 24.04 را از Start باز کنید و نام کاربری و رمز لینوکسی دلخواه بسازید. هنگام وارد کردن رمز در Ubuntu چیزی نمایش داده نمی‌شود؛ طبیعی است.

برای کنترل وضعیت، در PowerShell:

```powershell
wsl --list --verbose
```

باید Ubuntu-24.04 با نسخه 2 دیده شود. در صورت نیاز:

```powershell
wsl --set-version Ubuntu-24.04 2
wsl --update
```

اگر خطای virtualization یا WSL 2 دارید، فعال بودن Virtualization در BIOS/UEFI و قابلیت‌های Virtual Machine Platform و Windows Subsystem for Linux را بررسی کنید. راهنمای رسمی: https://learn.microsoft.com/windows/wsl/install

---

## ۳. نصب ابزارهای پایه و PHP؛ داخل Ubuntu

تمام دستورهای این بخش را در Ubuntu اجرا کنید:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git unzip zip software-properties-common
```

Ubuntu 24.04 به صورت پیش‌فرض PHP 8.3 دارد؛ برای lock فعلی کافی نیست. در این روش از مخزن شناخته‌شده **Ondřej PHP PPA** استفاده می‌کنیم. این مخزن شخص ثالث است؛ افزودن آن یعنی اعتماد به نگه‌دارنده مخزن. اگر سازمان شما اجازه نمی‌دهد، PHP سازگار را با روش تأییدشده سازمان نصب کنید و از ادامه با PHP 8.3 خودداری کنید.

```bash
sudo add-apt-repository ppa:ondrej/php -y
sudo apt update
sudo apt install -y php8.4-cli php8.4-common php8.4-curl php8.4-mbstring php8.4-xml php8.4-zip php8.4-gd php8.4-intl php8.4-bcmath php8.4-mysql php8.4-sqlite3 composer
sudo update-alternatives --set php /usr/bin/php8.4
```

کنترل نسخه‌ها:

```bash
php -v
php --ini
composer --version
php -m
```

نسخه PHP باید 8.4.1 یا بالاترِ سری 8.4 باشد. افزونه‌های مهم شامل `pdo_mysql`، `curl`، `mbstring`، `dom`، `xml`، `xmlreader`، `xmlwriter`، `SimpleXML`، `zip`، `gd`، `intl`، `fileinfo` و `openssl` هستند. افزونه‌های پایه ممکن است از بسته common یا خود PHP تأمین شوند.

برای کارهای ساخت نیازی به نصب سرویس MySQL محلی نیست؛ نصب دیتابیس واقعی بعداً روی cPanel انجام می‌شود. تست عملی قابلیت‌های دیتابیس، جدا از ساخت ZIP است.

---

## ۴. نصب Node.js و npm؛ داخل Ubuntu

برای ساخت از **Node 22 به‌روز (حداقل 22.12)** استفاده کنید. Node 18 یا 20 قدیمی مناسب Vite فعلی نیست.

یکی از روش‌ها استفاده از nvm است. دستور زیر اسکریپت نصب nvm را از مخزن رسمی دریافت و اجرا می‌کند؛ فقط در صورت اعتماد به این منبع اجرا کنید. می‌توانید ابتدا آن را دانلود و بررسی کنید. راهنمای رسمی nvm: https://github.com/nvm-sh/nvm

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh -o /tmp/install-nvm.sh
less /tmp/install-nvm.sh
```

برای خروج از نمایش `less` کلید `q` را بزنید. سپس:

```bash
bash /tmp/install-nvm.sh
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install 22
nvm use 22
nvm alias default 22
node -v
npm -v
```

اگر `nvm` بعداً پیدا نشد، Ubuntu را ببندید و دوباره باز کنید، یا دو خط بارگذاری `NVM_DIR` و `nvm.sh` بالا را اجرا کنید.

> PHP، Composer و Node این محیط مستقل از نسخه‌های نصب‌شده در ویندوز هستند. برای جلوگیری از اختلاط مسیرها خروجی `which php composer node npm` باید به مسیرهای لینوکسی اشاره کند، نه فایل‌های ویندوزی زیر `/mnt/c/`.

---

## ۵. قرار دادن پروژه در محیط ساخت

**پیشنهاد جدی: یک کپی تمیز و مخصوص build داشته باشید**، نه نسخه‌ای که روی آن اطلاعات واقعی مشتری، آپلود شخصی یا تنظیمات محیط عملیاتی دارید. نسخه جدید اسکریپت در پوشه موقت و مستقل کار می‌کند؛ vendor، node_modules، dist و .env سورس شما را تغییر نمی‌دهد. اطلاعات runtime و آپلودهای محلی را کپی نمی‌کند. با این حال سورس مخصوص build را تمیز نگه دارید.

### روش الف: دریافت از Git

داخل Ubuntu:

```bash
mkdir -p ~/projects
cd ~/projects
git clone https://github.com/diswebir/industrial-crm-project.git
cd industrial-crm-project
```

**مهم:** باید نسخه‌ای را دریافت کنید که فایل‌های ساخت جدید این راهنما در آن وجود دارند. کلون شاخه پیش‌فرضی که هنوز تغییرات به آن منتقل نشده کافی نیست. اگر تغییرات فعلاً فقط در فایل‌های محلی شما هستند، از روش ب استفاده کنید. برای مخزن خصوصی از روش ورود استاندارد Git/GitHub استفاده کنید؛ رمز یا توکن را داخل اسکریپت، راهنما یا فایل بسته ذخیره نکنید.

وجود فایل‌های لازم را کنترل کنید:

```bash
ls deploy/cpanel/build.sh
ls backend/public/resolve-private.php
ls backend/public/private-path.php
```

### روش ب: کپی از پوشه ویندوز

فرض کنیم پروژه در این مسیر است:

```text
C:\Users\YourName\Downloads\industrial-crm-project
```

در Ubuntu همان مسیر به شکل زیر دیده می‌شود:

```text
/mnt/c/Users/YourName/Downloads/industrial-crm-project
```

می‌توانید با File Explorer پوشه پروژه را داخل مسیر زیر کپی کنید:

```text
\\wsl.localhost\Ubuntu-24.04\home\LINUX_USER\projects\
```

`LINUX_USER` نام کاربری Ubuntu شماست. پوشه `projects` را قبلاً با `mkdir -p ~/projects` بسازید. فایل‌های سورس، فایل‌های مخفی، `composer.lock` و `package-lock.json` را نگه دارید. انتقال `node_modules` و `vendor` قدیمی لازم نیست؛ روی WSL دوباره نصب می‌شوند.

بعد داخل Ubuntu:

```bash
cd ~/projects/industrial-crm-project
pwd
ls -a
```

باید پوشه‌های `backend`، `frontend` و `deploy` را ببینید. کار کردن مستقیم روی `/mnt/c/` نیز ممکن است، اما معمولاً کندتر است و احتمال مشکلات مجوز/حساسیت حروف بیشتر می‌شود.

---

## ۶. بررسی اولیه قبل از ساخت

از **ریشه پروژه** در Ubuntu:

```bash
php -v
composer --version
node -v
npm -v
zip -v
bash -n deploy/cpanel/build.sh
```

اگر اسکریپت با ویرایشگر ویندوزی به CRLF تبدیل شده و خطای `$'\r'` یا `bad interpreter` می‌گیرید:

```bash
sed -i 's/\r$//' deploy/cpanel/build.sh
```

### نسخه PHP ساخت و هاست را یکسان انتخاب کنید

در cPanel → MultiPHP Manager / Select PHP Version بررسی کنید PHP دامنه هدف نیز **8.4.1 یا جدیدتر سازگار** است. ساخت موفق روی PHP 8.4 به معنی قابل اجرا بودن روی هاست PHP 8.2 نیست.

فایل‌های lock را حذف نکنید و برای رفع خطای ساخت خودسرانه `composer update` یا `npm update` نزنید؛ این کار نسخه وابستگی‌ها را تغییر می‌دهد.

---

## ۷. ساخت دو بسته خروجی روی کامپیوتر خودتان

در Ubuntu و از ریشه پروژه فقط این دستور را اجرا کنید:

```bash
bash deploy/cpanel/build.sh
```

اسکریپت این کارها را انجام می‌دهد:

1. نصب وابستگی‌های PHP از `composer.lock` بدون ابزارهای توسعه.
2. نصب وابستگی‌های فرانت‌اند از `package-lock.json` و اجرای TypeScript و Vite build.
3. آماده کردن نسخه استقرار در یک پوشه موقت.
4. اضافه کردن فرانت‌اند ساخته‌شده، ویزارد و قواعد Apache.
5. حذف `.env` فعال، لاگ‌ها، sessionها و کش‌های محیط ساخت از بسته.
6. ایجاد دو ZIP مستقل عمومی و خصوصی.

اسکریپت دیگر به `backend/.env` شما دست نمی‌زند؛ یک محیط ساخت مستقل داخل پوشه موقت می‌سازد و آن را پس از اتمام حذف می‌کند. نیازی به اطلاعات دیتابیس هاست یا رمزهای واقعی برای build نیست. assetهای Filament هم در محیط موقت دوباره منتشر می‌شوند.

در انتها باید این پیام را ببینید:

```text
SUCCESS: .../cpanel-release
```

کنترل موفقیت و اندازه فایل‌ها:

```bash
ls -lh cpanel-release/*.zip
unzip -t cpanel-release/cpanel-public.zip
unzip -t cpanel-release/cpanel-private.zip
```

هر دو دستور `unzip -t` باید بدون خطا تمام شوند. اگر build متوقف شد، **فایل ZIP قدیمی باقی‌مانده را خروجی موفق نسخه جدید فرض نکنید**؛ ابتدا خطا را برطرف و دوباره build کنید و زمان فایل‌ها را بررسی کنید.

### کنترل بسته، خروجی سفارشی و تست محلی

نسخه جدید ZIPها را قبل از اعلام موفقیت تست و محتویات حساس را بررسی می‌کند. خروجی قبلی تا زمان آماده‌شدن هر دو بسته جدید حفظ می‌شود؛ در خطا آن را نسخه جدید فرض نکنید.

```bash
bash deploy/cpanel/verify-package.sh cpanel-release
(cd cpanel-release && sha256sum -c SHA256SUMS)
CPANEL_OUT_DIR="./my output/packages" bash deploy/cpanel/build.sh
```

برای اجرای تست‌های بسته‌بندی بدون دانلود وابستگی (نیازمند Python 3؛ Composer/PHP در این تست‌ها شبیه‌سازی می‌شوند):

```bash
python3 -m unittest discover -s deploy/cpanel/tests -v
```

برای تست **واقعی** Laravel از ZIPهای ساخته‌شده، با PHP 8.4.1+ و افزونه pdo_sqlite:

```bash
bash deploy/cpanel/tests/smoke-package.sh cpanel-release
```

این دستور بسته‌ها را در دو مسیر جدا استخراج می‌کند، دیتابیس SQLite موقت می‌سازد، migrate را دوبار اجرا می‌کند و مسیر آپلود و مجوزهای مدیر را بررسی می‌کند. به دیتابیس عملیاتی متصلش نکنید.

اگر خطای `.build.lock` گرفتید، بیلد دیگری در همان پوشه خروجی فعال است. فقط بعد از اطمینان از توقف کامل فرآیند قبلی، پوشه `.build.lock` را حذف کنید.

### بررسی وابستگی‌های PHP و امنیت

بعد از ساخت:

```bash
cd backend
composer check-platform-reqs --no-dev
composer audit --no-dev
cd ..
```

دستور اول سازگاری با **PHP محلی** را کنترل می‌کند، نه PHP هاست. نتیجه audit به وضعیت روز آسیب‌پذیری‌ها وابسته است؛ هشدارهای آن را قبل از انتشار بررسی کنید، نه اینکه به صورت خودکار نادیده بگیرید.

### بررسی محتویات بسته‌ها

```bash
unzip -l cpanel-release/cpanel-public.zip
unzip -l cpanel-release/cpanel-private.zip
```

در ZIP عمومی باید مستقیماً `index.php`، `index.html`، `.htaccess`، `assets/`، `install.php`، `private-path.php` و `resolve-private.php` وجود داشته باشد، نه یک پوشه اضافی `public/` دور آن‌ها.

در ZIP خصوصی باید `vendor/autoload.php`، `bootstrap/app.php`، `artisan`، `app/`، `config/`، `routes/` و `storage/` وجود داشته باشد. فایل `.env.cpanel.example` نمونه است و وجودش طبیعی است؛ **فایل فعال با نام دقیق `.env` نباید داخل ZIP باشد.** اطلاعات مشتری، آپلود شخصی، کلید خصوصی و backup واقعی هم نباید در بسته باشند.

ساخت ZIP به معنی آزمون کامل Laravel یا همه قابلیت‌های سامانه نیست. تست ورود، اکسل، آپلود و پیامک پس از نصب روی هاست همچنان لازم است.

---

## ۸. پیدا کردن خروجی در File Explorer و کپی به ویندوز

در Ubuntu، از ریشه پروژه:

```bash
explorer.exe .
```

File Explorer باز می‌شود. پوشه `cpanel-release` را باز و دو ZIP را به Desktop یا Downloads ویندوز کپی کنید. فایل‌ها را **بدون بازکردن و ZIP مجدد** آپلود کنید تا فایل مخفی `.htaccess` از قلم نیفتد.

روش دیگر: در نوار آدرس File Explorer بنویسید:

```text
\\wsl.localhost\Ubuntu-24.04\home\LINUX_USER\projects\industrial-crm-project\cpanel-release
```

نام کاربری و نام پوشه را با مقدار واقعی خودتان جایگزین کنید.

---

## ۹. آپلود مستقیم دو ZIP به cPanel

### مثال مسیرها

فرض کنیم نام کاربری هاست `alice` و دامنه `xx.example.com` است:

```text
/home/alice/xx.example.com/                 ← محتویات cpanel-public.zip
/home/alice/private_pro/project1/myc/        ← محتویات cpanel-private.zip
```

1. در cPanel → Domains، Document Root دامنه را روی `/home/alice/xx.example.com` تنظیم کنید.
2. در File Manager گزینه **Show Hidden Files** را روشن کنید.
3. `cpanel-public.zip` را داخل پوشه دامنه آپلود و همان‌جا Extract کنید.
4. `cpanel-private.zip` را داخل `/home/alice/private_pro/project1/myc` آپلود و همان‌جا Extract کنید.
5. مطمئن شوید پوشه اضافی بین مسیر مقصد و فایل‌ها ساخته نشده است.
6. ZIPها را پس از استخراج از هاست حذف کنید، مخصوصاً ZIP خصوصی را هرگز داخل Document Root نگه ندارید.

مسیر خصوصی نباید زیر پوشه دامنه یا Document Root هیچ سایت دیگری باشد. اگر File Manager شما home حساب را به شکل `/` نمایش می‌دهد، این لزوماً ریشه واقعی سیستم‌عامل نیست؛ مسیر واقعی معمولاً با `/home/USERNAME` شروع می‌شود. از پشتیبانی هاست مسیر مطلق را بپرسید.

### تنظیم مسیر خصوصی؛ مرحله ضروری

فایل زیر را با ویرایشگر File Manager باز کنید:

```text
/home/alice/xx.example.com/private-path.php
```

محتوا را این‌گونه تنظیم کنید:

```php
<?php
return '/home/alice/private_pro/project1/myc';
```

از `/` استفاده کنید، نه `\` ویندوز. نام کاربری `alice` فقط مثال است. در مقدار `return` مسیر وب مثل `https://...` وارد نکنید؛ این مسیر فایل‌سیستم سرور است.

مقدار پیش‌فرض `CPANEL_USER` داخل بسته صرفاً placeholder است و باید تغییر کند. نیازی به جست‌وجو و تغییر مسیر در چند فایل PHP ندارید.

اگر هاست `open_basedir` دارد، باید خواندن هر دو مسیر عمومی و خصوصی را مجاز کند. خطای این محدودیت با تغییر رمز دیتابیس حل نمی‌شود و ممکن است نیازمند پشتیبانی هاست باشد.

---

## ۱۰. دیتابیس و اجرای ویزارد نصب

1. SSL/AutoSSL دامنه را فعال کنید و از HTTPS استفاده کنید.
2. تا پایان نصب، پوشه دامنه را با Directory Privacy یا محدودیت IP محافظت کنید؛ نصب‌کننده راه‌اندازی‌نشده نباید در دسترس دیگران باشد.
3. در MySQL Database Wizard یک دیتابیس **خالی** و کاربر بسازید و کاربر را با ALL PRIVILEGES به همان دیتابیس متصل کنید.
4. نام کامل دیتابیس و کاربر را همراه پیشوند cPanel نگه دارید، مثلاً `alice_crmdb` و `alice_crmuser`.
5. PHP دامنه و افزونه‌های لازم را فعال کنید. نسخه PHP ترمینال/CLI هاست در صورت استفاده نیز باید سازگار باشد.
6. نشانی زیر را باز کنید:

```text
https://xx.example.com/install.php
```

7. مسیرها و پیش‌نیازها را کنترل، سپس APP_URL ریشه دامنه، host/port دیتابیس، نام دیتابیس، کاربر و رمز را وارد کنید.
8. ایمیل، موبایل و رمز اختصاصی مدیر (حداقل ۱۲ کاراکتر) را تعیین کنید.
9. نصب را اجرا کنید و تا دریافت نتیجه صبر کنید. در این روش نیازی به وارد کردن SQL از phpMyAdmin یا اجرای Composer روی هاست نیست.

ویزارد `.env` را در مسیر **خصوصی** می‌سازد، کلید برنامه و جداول را ایجاد می‌کند و اطلاعات مدیر انتخابی شما را ذخیره می‌کند. داده نمایشی وارد نمی‌شود. برای نصب cPanel از رمز نمایشی `Admin@123456` استفاده نمی‌شود.

نصب زیر ریشه URL دامنه پشتیبانی می‌شود؛ APP_URL را مثلاً `https://xx.example.com` بدهید، نه `https://example.com/crm`.

### دسترسی فایل‌ها

- پوشه‌ها معمولاً `755` و فایل‌ها `644`.
- `.env` خصوصی توسط نصب‌کننده با دسترسی محدودتر ساخته می‌شود.
- `storage/` و `bootstrap/cache/` خصوصی و `storage/` عمومی باید توسط کاربر PHP قابل نوشتن باشند.
- برای حل خطاها دسترسی `777` ندهید؛ مالکیت و تنظیمات PHP هاست را بررسی کنید.

---

## ۱۱. چک‌لیست نهایی پس از نصب

- [ ] ورود از `/login` با اطلاعات مدیر انتخابی.
- [ ] بارگذاری داشبورد و refresh مستقیم مسیرهایی مثل `/customers`.
- [ ] باز شدن `/admin` و نمایش صحیح CSS و JS پنل Filament.
- [ ] پاسخ سلامت Laravel در `/up`، نه صفحه React.
- [ ] ایجاد مشتری، دستگاه، تخصیص، ثبت ورود/خروج انبار و ثبت تاریخچه.
- [ ] تست ورود و خروج اکسل.
- [ ] آپلود و مشاهده آواتار/لوگو از `/storage`.
- [ ] غیرقابل مشاهده بودن `/.env`، `/private-path.php` و `/resolve-private.php` از مرورگر.
- [ ] حذف `install.php` و `setup-check.php` در صورت باقی ماندن؛ حذف `update.php` تا زمان نیاز.
- [ ] وجود `storage/installed.lock` در مسیر خصوصی؛ قفل را برای نصب معمول حذف نکنید.
- [ ] حذف ZIPهای آپلودشده از هاست.
- [ ] راه‌اندازی بکاپ دیتابیس، `.env` و آپلودها.
- [ ] خاموش کردن Sandbox پیامک پیش از بهره‌برداری واقعی از ورود پیامکی و تست ارسال با حساب واقعی.

فایل‌های حساس را در دیسک عمومی یا `xx.example.com/storage` قرار ندهید؛ این مسیر برای فایل‌های قابل انتشار است. فایل خصوصی باید خارج Document Root بماند.

---

## ۱۲. ساخت نسخه‌های بعدی و ارتقای هاست

برای هر نسخه جدید، سورس نسخه جدید را به **کپی مخصوص build** بیاورید و از ریشه دوباره اجرا کنید:

```bash
bash deploy/cpanel/build.sh
```

سپس هر دو خروجی را بررسی کنید. برای ارتقای سایت موجود:

1. از دیتابیس و فایل‌ها بکاپ قابل بازیابی بگیرید و تغییرات را ابتدا روی محیط آزمایشی امتحان کنید.
2. `.env`، `storage/` خصوصی، `storage/` عمومی، `storage/installed.lock` و `private-path.php` واقعی هاست را حفظ کنید.
3. ZIP عمومی جدید حاوی `private-path.php` پیش‌فرض است؛ هنگام استخراج **تنظیم واقعی خود را از دست ندهید**. بعد از استخراج و قبل از بازکردن سایت دوباره مسیر صحیح را اعمال کنید.
4. فایل‌های کش محیط قبلی `bootstrap/cache/config.php`، `events.php` و `routes*.php` را در صورت وجود حذف کنید؛ فایل‌های خود framework را پاک نکنید.
5. `update.php` را موقتاً با HTTPS باز کنید و APP_KEY را فقط در فرم وارد کنید، نه در URL.
6. مایگریشن‌های جدید را اجرا و سپس ابزارهای نصب/ارتقا را حذف کنید. وجود دوباره `install.php` در بسته جدید دلیل اجرای دوباره نصب نیست.
7. آزمون‌های عملکرد را تکرار کنید.

**هرگز برای ارتقای سایت واقعی `migrate:fresh`، حذف جدول‌ها یا seed نمایشی اجرا نکنید.** ارتقا rollback خودکار ندارد.

---

## ۱۳. خطاهای رایج

### `Your Composer dependencies require a PHP version >= 8.4.1`

نسخه PHP فعال کافی نیست. در Ubuntu `php -v` و `which php`، و در cPanel نسخه PHP **همان دامنه** را بررسی کنید. خاموش کردن platform check راه‌حل نیست.

### `ext-intl`، `ext-gd`، `ext-zip` یا `ext-dom` missing

افزونه PHP در همان محیطی که Composer اجرا می‌شود نصب نیست. بسته مربوط به PHP 8.4 را نصب و با `php -m` کنترل کنید. افزونه PHP ویندوز اثری روی PHP داخل WSL ندارد؛ افزونه WSL نیز افزونه هاست را فعال نمی‌کند.

### `composer: command not found` یا `zip: command not found`

مراحل نصب ابزارها را داخل Ubuntu انجام دهید. دستور build را در Git Bash اجرا نکنید.

### خطای Node / unsupported engine

داخل Ubuntu:

```bash
nvm use 22
node -v
which node
```

Node باید نسخه به‌روز 22 و متعلق به WSL باشد.

### خطای شبکه npm یا Composer

اتصال اینترنت و دسترسی به registry.npmjs.org، GitHub و Packagist را بررسی کنید. بعد از رفع شبکه، همان build را دوباره اجرا کنید. تأیید TLS را خاموش نکنید و lockها را برای رفع خطای دانلود حذف نکنید.

### `npm ci` می‌گوید package.json و lock هماهنگ نیستند

نسخه هماهنگ فایل‌های پروژه را بازیابی کنید. این خطا با دستکاری تصادفی lock یا نصب نسخه‌های جدید روی هاست حل نمی‌شود. اگر تغییر وابستگی عمدی است، lock باید در محیط توسعه بازتولید و آزمون شود.

### `Private application path is invalid`

مسیر `private-path.php` اشتباه است یا فایل `bootstrap/app.php` خصوصی دقیقاً زیر آن مسیر نیست. مسیر مطلق، پوشه‌های تودرتوی اضافی، بزرگی/کوچکی حروف و open_basedir را کنترل کنید.

### خطای 500 یا صفحه سفید روی هاست

ابتدا Error Log در cPanel و `storage/logs/laravel.log` خصوصی را بخوانید. PHP، افزونه‌ها، وجود `vendor/autoload.php`، دسترسی پوشه‌ها و تنظیم `.htaccess` را بررسی کنید. `APP_DEBUG=true` را روی سایت عمومی روشن نگذارید و لاگ حاوی اطلاعات محرمانه را منتشر نکنید.

### صفحه اصلی باز می‌شود اما refresh روی `/customers` خطا می‌دهد

وجود `.htaccess` عمومی، Document Root صحیح و فعال بودن mod_rewrite/AllowOverride را بررسی کنید. اگر وب‌سرور قواعد Apache را نمی‌پذیرد، از پشتیبانی هاست کمک بگیرید.

### اتصال دیتابیس برقرار نمی‌شود

نام کامل پیشونددار دیتابیس و کاربر، رمز، host و مجوز اتصال کاربر به دیتابیس را کنترل کنید. host اغلب `localhost` یا `127.0.0.1` است ولی مقدار قطعی را از هاست بگیرید. برای رفع خطا جداول سایت موجود را حذف نکنید.

### نصب موفق شده اما تلاش برای نصب دوباره مسدود است

وجود قفل نصب رفتار درست امنیتی است. برای بروزرسانی از روش ارتقا استفاده کنید، نه حذف قفل و اجرای دوباره ویزارد.

---

## ۱۴. خلاصه اجرای روزمره پس از آماده بودن WSL

داخل Ubuntu:

```bash
cd ~/projects/industrial-crm-project
nvm use 22
php -v
bash deploy/cpanel/build.sh
unzip -t cpanel-release/cpanel-public.zip
unzip -t cpanel-release/cpanel-private.zip
explorer.exe .
```

دو ZIP را از `cpanel-release` بردارید، به مسیرهای صحیح روی cPanel منتقل کنید، `private-path.php` را تنظیم کنید و برای نصب جدید ویزارد را اجرا کنید؛ برای سایت موجود فقط مراحل ارتقا را انجام دهید.

## وضعیت اعتبارسنجی این آموزش

این راهنما بر مبنای اسکریپت و lockهای فعلی مخزن نوشته شده است. نیاز PHP 8.4.1 از بررسی `composer.lock` مشخص شده است. ساخت واقعی ZIP و اجرای بسته‌های خروجی با PHP 8.4 و هر دو دیتابیس SQLite و MySQL در [GitHub Actions](https://github.com/diswebir/industrial-crm-project/actions/runs/41890513016) موفق بوده است. نصب WSL و اجرای build روی یک ویندوز واقعی و اجرای وب‌سرور cPanel شما هنوز آزمون نشده‌اند. گزارش بررسی قبلی در [AUDIT.md](AUDIT.md) و راهنمای استقرار در [README.md](README.md) قرار دارد.
