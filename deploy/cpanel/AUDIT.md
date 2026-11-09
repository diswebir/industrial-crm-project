# گزارش بررسی آمادگی cPanel

تاریخ: ۲۰۲۶-۱۱-۰۴

## دامنه بررسی

ساختار Laravel 11 / React، ورودی HTTP، bootstrap، مسیرهای API و SPA، احراز هویت، مهاجرت‌های دیتابیس و ساخت مدیر، filesystem، ابزار نصب/ارتقا/تشخیص، اسکریپت بسته‌بندی و مستندات استقرار بررسی شد. این بررسی، گواهی نبود تمام باگ‌ها یا ممیزی امنیتی جامع تمام قابلیت‌ها نیست.

## اصلاحات

- حذف فرض مجاورت public و Laravel: فایل تنظیم مسیر خصوصی مشترک برای index و تمام ابزارهای نصب.
- تنظیم public_path پیش از بارگذاری config در وب؛ برای CLI نیز APP_PUBLIC_PATH از محیط/.env خوانده می‌شود (در صورت config cache باید مسیر محیط واقعی درست باشد).
- تولید آرشیوهای جداگانه عمومی و خصوصی؛ جلوگیری از انتشار .env، کش تنظیمات ماشین ساخت، لاگ، session، marker نصب و hot marker.
- مسدودسازی مشاهده فایل تنظیم مسیر، فایل‌های مخفی، directory listing و اجرای PHP آپلودشده از طریق قواعد Apache.
- مسیر سلامت `/up` دیگر به SPA fallback نمی‌رود.
- ویزارد فارسی با CSRF، بررسی سمت سرور پیش‌نیازها، mutex نصب، قفل دائمی و جلوگیری از نصب جدید روی دیتابیس غیرخالی.
- ورودی مدیر اختصاصی؛ در نصب cPanel، حساب موقت migration رمز تصادفی دارد و سپس با اطلاعات انتخابی جایگزین می‌شود. seed نمایشی اجرا نمی‌شود.
- quote/escape مقادیر .env، رد newline/control characters، نوشتن اولیه اتمیک و حفظ APP_KEY در تلاش مجدد.
- تشخیص خطای exit code مایگریشن؛ حذف کش‌های تنظیمات قبل از bootstrap نصب.
- ابزار تشخیص پس از وجود .env/قفل غیرفعال است؛ کلید ارتقا فقط از POST پذیرفته می‌شود، نه query string.
- افزودن throttle به ورود و OTP؛ استفاده از random_int برای کد OTP.
- افزودن workflow برای ساخت بسته و smoke test مایگریشن MySQL؛ مستندات قبلی درباره پیوست خودکار Release اصلاح شد.

## آزمون‌های انجام‌شده پس از اصلاح بیلد

اجرای واقعی CI در [GitHub Actions، شماره 41890513016](https://github.com/diswebir/industrial-crm-project/actions/runs/41890513016) موفق بود:

| بررسی | نتیجه |
|---|---|
| نصب واقعی Composer production با PHP 8.4 و platform check | موفق در CI |
| npm ci و TypeScript/Vite production build | موفق محلی و CI |
| PHP syntax با php -l | موفق در CI |
| ۱۰ تست رگرسیون بسته‌بندی با dependency doubles | موفق محلی و CI |
| ساخت هر دو ZIP، unzip integrity، layout و sensitive-file checks | موفق در CI |
| استخراج بسته در دو مسیر مستقل و bootstrap واقعی Laravel | موفق در CI |
| migrate دوبار، مدیر، ۱۴ مجوز و مسیر آپلود با SQLite | موفق در CI |
| همان تست‌ها با MySQL 8 | موفق در CI |
| bash syntax و git diff --check | موفق محلی |

تست‌های doubles به تنهایی آزمون Laravel نیستند؛ workflow جداگانه بسته واقعی را با PHP و دیتابیس اجرا کرده است. تست ZIP شامل مسیر نسبی و دارای فاصله، حفظ سورس و .env، شکست Composer/npm/lint، قفل هم‌زمان، رد symlink، فایل حساس، zip-slip و ZIP خراب است.

## تغییرات آزمون‌ها در نسخه ۲٫۰٫۰

ردیف «۱۴ مجوز» در جدول بالا، نتیجه واقعی CI در همان نسخه است و به‌عنوان سند تاریخی دست‌نخورده باقی مانده است. از نسخه `v2.0.0` شمار مجوزها **۱۶** است (`inventory.manage` و `inventory.logs` افزوده شدند) و آزمون‌ها به این شکل به‌روز شدند:

| آزمون | تغییر |
|---|---|
| `tests/smoke-package.php` | راستی‌آزمایی ۱۶ مجوز، جدول‌های `inventory_logs` / `user_staff_access` / `user_customer_access`، ستون‌های موجودی و تخصیص، و اجرای دوباره مایگریشن‌ها (Idempotent) |
| `tests/test_installer_http.py` | ادعای پیشین «دقیقاً ۱۴ مجوز» به «مدیر نصب‌شده باید **همه** مجوزهای ثبت‌شده را داشته باشد و شمار آن‌ها کمتر از ۱۶ نباشد» تغییر کرد تا در نسخه‌های بعدی با افزودن مجوز جدید نشکند |
| `tests/test_build.py` | fixture بسته، فایل‌های `public/css/vazirmatn.css` و پنج فونت `public/fonts/vazirmatn-fd-*.woff2` را هم می‌سازد و حضور `css/vazirmatn.css` و `fonts/vazirmatn-fd-Regular.woff2` در ZIP عمومی را بررسی می‌کند |
| `build.sh` | کپی `backend/public/css` و `backend/public/fonts` در بسته + دو بررسی اجباری پیش از بسته‌بندی (رفع باگ B13) |

اسکریپت خام `database/v2.0.0-mysql.sql` عمداً داخل بسته‌ها قرار نمی‌گیرد؛ `verify-package.sh` هر فایل `.sql` را به‌عنوان ریسک نشتی داده رد می‌کند.

## موارد اجرا نشده و ریسک‌های باقی‌مانده

- PHP و Composer در sandbox نصب نیستند؛ اجرای واقعی Composer، Laravel، ساخت ZIP و مایگریشن‌ها در GitHub Actions انجام و موفق شد. PHPUnit و composer audit اجرا نشده‌اند. نصب مستقیم ویندوز/WSL روی رایانه کاربر هنوز آزمایش نشده است.
- بازنویسی Apache/LiteSpeed، مجوز فایل‌ها، open_basedir و پشتیبانی واقعی نسخه MySQL/MariaDB باید روی هاست مقصد تست شود.
- تمام CRUDها، ورود Filament، import/export اکسل و آپلودها نیازمند آزمون انتهابه‌انتها با دیتابیس واقعی‌اند. فایل‌های تست اولیه مخزن پوشش جامعی ندارند.
- اتصال واقعی ملی‌پیامک آزمایش نشده است. Sandbox کد ورود را نمایش می‌دهد؛ آن را پیش از بهره‌برداری واقعی خاموش کنید.
- Middleware API از کوکی توکن استفاده می‌کند و API از CSRF استاندارد مستثناست؛ بررسی جامع CSRF/CORS و سیاست same-site پیش از گسترش استفاده بین دامنه‌ای لازم است. rate limiting اضافه‌شده جای ممیزی امنیتی کامل نیست.
- نصب‌کننده اولیه و ابزار ارتقا را فقط در بازه کوتاه و با محدودیت دسترسی/HTTPS در دسترس بگذارید؛ قفل نصب، حفاظت از نصب راه‌اندازی‌نشده را جایگزین نمی‌کند.
- عملیات DDL در MySQL rollback خودکار ندارد؛ قبل از ارتقا بکاپ اجباری است. در خطای نصب، APP_KEY را نگه دارید و علت خطا را از لاگ خصوصی برطرف کنید؛ جداول محیط عملیاتی را حذف نکنید.
- رمز ثابت demo در مسیر قدیمی seed توسعه باقی مانده است؛ برای production فقط از ویزارد مستندشده استفاده کنید، نه db:seed.

## تکمیل آزمون ویزارد

در اجرای https://github.com/diswebir/industrial-crm-project/actions/runs/41902437021 تست GET/POST واقعی نصب و سناریوهای bootstrap failure، migration failure/retry و fatal autoload موفق شدند. این تست از PHP built-in server استفاده می‌کند، نه Apache/cPanel واقعی. جزئیات در BUILD-TEST-REPORT.md است.

## انتشار خودکار Release (افزوده شد)

workflow `cpanel.yml` حالا دو job دارد: `package` (ساخت و همه آزمون‌ها، `contents: read`) و
`release` (انتشار، `contents: write`). با هر push به `main` تگ چرخشی `latest-build` به کامیت
جدید منتقل و فایل‌ها با `--clobber` جایگزین می‌شوند؛ با هر تگ `v*` یک Release نسخه‌دار با
`--verify-tag` ساخته می‌شود. PRها فقط artifact می‌سازند.

راستی‌آزمایی‌های انجام‌شده:

| مورد | روش | نتیجه |
| :-- | :-- | :-- |
| ساختار YAML و شکل تریگرها/jobها/دسترسی‌ها | `tests/test_release_workflow.py` (۱۵ آزمون) | موفق |
| سینتکس همه بلوک‌های `run:` | `bash -n` روی هر بلوک با جایگزینی عبارت‌های `${{ }}` | موفق، صفر خطا |
| تولید متن Release (هر دو شاخه: تگ نسخه و `latest-build`) | اجرای واقعی گام‌های `Resolve release target` و `Write release notes` با ورودی ساختگی | موفق، شامل حالت نبود راهنمای ارتقا |
| ثبت نسخه/ref در `build-info.txt` | دو آزمون جدید در `tests/test_build.py` (مقدار CI و fallback به فایل `VERSION` و `unknown`) | موفق |
| اسکریپت دانلود | اجرای واقعی روی سرور HTTP محلی (فایل‌های ساختگی) + مسیر خطای ۴۰۴ | موفق؛ اثر انگشت تأیید شد، کد خروج ۱ در حالت خطا، بدون فایل نیمه‌کاره |

مواردی که هنوز با اجرای واقعی آزموده نشده‌اند:

- `gh release create/edit/upload` و `git push -f origin refs/tags/latest-build` روی رانر واقعی؛
  این مسیر برای نخستین بار با اولین push به `main` اجرا می‌شود. اگر `Workflow permissions`
  مخزن روی «Read only» قفل باشد، گام «Move the rolling tag» با خطای ۴۰۳ شکست می‌خورد
  (در جدول عیب‌یابی `RELEASE-AUTOMATION.fa.md` آمده است).
- دانلود واقعی از `github.com/releases/download/...` از sandbox ممکن نبود (محدودیت شبکه)،
  بنابراین مسیر موفق اسکریپت دانلود با سرور HTTP محلی و همان نام فایل‌ها آزموده شد.
- `download-release.ps1` روی PowerShell واقعی ویندوز اجرا نشده است؛ فقط بازبینی ایستا.
- چهار آزمون ساختاری `test_release_workflow.py` به PyYAML نیاز دارند و در صورت نبود آن skip
  می‌شوند؛ بقیه آزمون‌ها بدون وابستگی اجرا می‌شوند.

## نسخه اکشن‌های GitHub عمداً روی v4 نگه داشته شد

رانر هشدار می‌دهد که `actions/checkout@v4`، `actions/setup-node@v4` و `actions/upload-artifact@v4`
هدف Node.js 20 هستند و به‌اجبار روی Node 24 اجرا می‌شوند. این **هشدار است نه خطا** و اجرای
`42650848780` با همین نسخه‌ها سبز شد.

دلیل ارتقا ندادن در این مرحله:

| اکشن | آخرین نسخه | ریسک ارتقا |
| :-- | :-- | :-- |
| `actions/upload-artifact` | v7.0.2 | v5.0.0 «BREAKING CHANGE: supports Node v24» — کم‌خطر، ولی مستندات اکشن می‌گوید upload و download **باید هم‌نسخه باشند** |
| `actions/download-artifact` | v8.0.2 | v8.0.0 رفتار unzip را عوض کرده («no longer attempt to unzip all downloaded files» + «Enforced checks (breaking)») ⇒ ممکن است در job انتشار، ZIPها به‌جای استخراج، به‌صورت کانتینر خام دانلود شوند |
| `actions/checkout` | v7.0.1 | کم‌خطر |
| `actions/setup-node` | v7.1.0 | کم‌خطر |

مسیر `download-artifact` **فقط در job `release` اجرا می‌شود که روی PRها skip است**؛ بنابراین
ارتقای آن در این PR قابل راستی‌آزمایی نبود و ارتقای کور می‌توانست اولین انتشار واقعی را بشکند.
ارتقا باید در یک تغییر جداگانه و همراه با یک push واقعی به `main` (یا یک تگ آزمایشی) انجام و
لاگ گام «Verify downloaded archives» بررسی شود.
