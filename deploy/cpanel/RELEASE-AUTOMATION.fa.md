# 🤖 ساخت و انتشار خودکار بسته‌های cPanel

این سند توضیح می‌دهد GitHub Actions چگونه `cpanel-public.zip` و `cpanel-private.zip` را
**خودکار** می‌سازد، می‌آزماید و در یک Release قرار می‌دهد؛ و شما چگونه آن‌ها را
داخل پوشه `cpanel-release/` تحویل می‌گیرید.

فایل workflow: [`.github/workflows/cpanel.yml`](../../.github/workflows/cpanel.yml)

---

## ۱) چه زمانی اجرا می‌شود؟

| رویداد | بیلد و آزمون | انتشار Release | توضیح |
| :-- | :-: | :-: | :-- |
| `push` به شاخه **main** | ✅ | ✅ تگ `latest-build` به‌روز می‌شود | بعد از هر مرج، بسته تازه آماده است |
| `push` تگ **`v*`** (مثل `v2.0.1`) | ✅ | ✅ Release نسخه‌دار با نشان **Latest** | انتشار رسمی |
| **pull request** (تغییر در `backend/`, `frontend/`, `deploy/cpanel/`, workflow, `VERSION`) | ✅ | ❌ | فقط artifact برای بازبینی؛ هرگز Release نمی‌سازد |
| **Run workflow** دستی (`workflow_dispatch`) | ✅ | ✅ فقط اگر روی `main` اجرا شود | بازسازی بدون کامیت جدید |

دو اجرای هم‌زمان روی یک ref با `concurrency` پشت‌سرهم می‌شوند تا روی یک تگ Release
رقابت نکنند؛ اجرای قدیمی‌ترِ یک PR لغو می‌شود تا دقیقه‌های CI هدر نرود.

---

## ۲) ساختار workflow

```
job: package  (permissions: contents: read)
  ├─ checkout + PHP 8.4 + Node 22
  ├─ Resolve build identity      → نسخه، ref و کامیت برای build-info.txt
  ├─ php -l روی همه فایل‌های PHP
  ├─ آزمون رگرسیون بسته‌بندی     → deploy/cpanel/tests
  ├─ build.sh                    → cpanel-public.zip + cpanel-private.zip + SHA256SUMS
  ├─ smoke test روی SQLite
  ├─ smoke test روی MySQL 8      → نصب تازه + ارتقای تکرارپذیر
  ├─ آزمون HTTP ویزارد نصب
  ├─ Collect release extras      → UPGRADE-GUIDE.fa.md + COMMIT.txt + REF.txt
  └─ upload-artifact: cpanel-package

job: release  (needs: package, permissions: contents: write)
  ├─ download-artifact
  ├─ Verify downloaded archives  → sha256sum -c + verify-package.sh
  ├─ Resolve release target      → latest-build یا تگ نسخه
  ├─ Write release notes         → متن فارسی با اثر انگشت و راهنمای نصب
  ├─ Move the rolling tag        → فقط برای latest-build
  └─ Publish release assets      → ساخت یا به‌روزرسانی Release
```

**چرا دو job؟** اصل کمترین دسترسی: job سازنده فقط `contents: read` دارد و تنها
job منتشرکننده `contents: write` می‌گیرد. اگر روزی یک PR مخرب بتواند `build.sh` را
تغییر دهد، همان job هیچ اجازه نوشتن روی مخزن ندارد.

**چرا artifact دوباره راستی‌آزمایی می‌شود؟** چون انتشار باید از همان بایت‌هایی انجام
شود که آزمون‌ها روی آن‌ها اجرا شده؛ `sha256sum -c` و `verify-package.sh` قبل از
آپلود، سلامت و ساختار بسته را دوباره تأیید می‌کنند.

---

## ۳) دو Release و آدرس ثابت دانلود

### الف) `latest-build` — چرخشی، همیشه آخرین `main`
با هر push به `main` تگ به کامیت جدید منتقل و فایل‌ها با `--clobber` جایگزین می‌شوند.
این Release عمداً `--latest=false` است تا نشان **Latest** گیت‌هاب همیشه روی نسخه رسمی بماند.

آدرس‌های ثابت (همیشه همین دو لینک، بدون جست‌وجو در Actions):

```
https://github.com/diswebir/industrial-crm-project/releases/download/latest-build/cpanel-public.zip
https://github.com/diswebir/industrial-crm-project/releases/download/latest-build/cpanel-private.zip
```

صفحه Release: <https://github.com/diswebir/industrial-crm-project/releases/tag/latest-build>

### ب) تگ نسخه (`v2.0.1`, `v2.0.2`, …) — انتشار رسمی
وقتی تگ بزنید، یک Release مستقل با همان نام تگ ساخته می‌شود و برای همیشه ثابت می‌ماند.
آدرس‌ها به‌همان شکل با جایگزینی نام تگ:

```
https://github.com/diswebir/industrial-crm-project/releases/download/v2.0.1/cpanel-public.zip
```

### فایل‌های هر Release

| فایل | محتوا |
| :-- | :-- |
| `cpanel-public.zip` | محتوای `public_html`: اسپای React، `index.php`، `install.php`، `update.php`، `setup-check.php`، `.htaccess`، فونت‌های Vazirmatn FD و `css/vazirmatn.css` |
| `cpanel-private.zip` | هسته لاراول، `vendor/`، مایگریشن‌ها، `config/`، `database/` — **بیرون از دسترس وب** آپلود شود |
| `SHA256SUMS` | اثر انگشت دو ZIP |
| `build-info.txt` | `App version`، `Source: <ref> @ <commit>`، زمان بیلد (UTC)، نسخه PHP/Node و hash فایل‌های lock |
| `UPGRADE-GUIDE.fa.md` | جدیدترین راهنمای ارتقا (با نام ثابت، تا همیشه یک فایل واحد باشد) |
| `COMMIT.txt` / `REF.txt` | کامیت و ref مبدأ (در artifact موجود است) |

---

## ۴) دانلود داخل پوشه `cpanel-release/`

خروجی همیشه در همان پوشه‌ای قرار می‌گیرد که `build.sh` استفاده می‌کند
(`cpanel-release/` در ریشه مخزن) — این پوشه در `.gitignore` است، پس چیزی در Git کامیت نمی‌شود.

### لینوکس / macOS / WSL

```bash
# جدیدترین بیلد main
bash deploy/cpanel/download-release.sh

# یک نسخه مشخص
bash deploy/cpanel/download-release.sh v2.0.1

# پوشه مقصد دلخواه
CPANEL_OUT_DIR="/d/releases" bash deploy/cpanel/download-release.sh
```

### ویندوز (PowerShell)

```powershell
powershell -ExecutionPolicy Bypass -File deploy\cpanel\download-release.ps1
powershell -ExecutionPolicy Bypass -File deploy\cpanel\download-release.ps1 -Tag v2.0.1
```

### GitHub CLI

```bash
gh release download latest-build -p '*.zip' -p 'SHA256SUMS' -p 'build-info.txt' -D cpanel-release
gh release list
```

### مرورگر

صفحه [Releases](https://github.com/diswebir/industrial-crm-project/releases) → روی
`latest-build` یا نسخه موردنظر کلیک کنید و دو ZIP را بگیرید.

### فقط artifact (برای بازبینی PR)

صفحه اجرای workflow در تب **Actions** → بخش **Artifacts** → `cpanel-package`.
artifactها ۹۰ روز نگه داشته می‌شوند و نیاز به ورود به گیت‌هاب دارند؛ Releaseها دائمی‌اند.

---

## ۵) راستی‌آزمایی پس از دانلود

اسکریپت‌های دانلود خودشان اثر انگشت را می‌سنجند. برای کنترل دستی:

```bash
cd cpanel-release && sha256sum -c SHA256SUMS
bash deploy/cpanel/verify-package.sh cpanel-release
```

در PowerShell:

```powershell
Get-FileHash .\cpanel-release\cpanel-public.zip -Algorithm SHA256
```

---

## ۶) انتشار نسخه رسمی (گام‌به‌گام)

۱. شماره نسخه را در **هر سه منبع** به‌روز کنید (طبق قرارداد `CHANGELOG.md`):

| فایل | مقدار |
| :-- | :-- |
| `VERSION` | `2.0.1` |
| `backend/config/crm.php` | `'version' => '2.0.1'` |
| `CHANGELOG.md` | بخش `## [2.0.1]` |

۲. تغییرات را روی `main` مرج کنید (همین کار `latest-build` را تازه می‌کند).

۳. تگ بزنید و بفرستید:

```bash
git tag -a v2.0.1 -m "نسخه ۲٫۰٫۱"
git push origin v2.0.1
```

۴. workflow به‌صورت خودکار می‌سازد، می‌آزماید و Release `v2.0.1` را با نشان **Latest**
منتشر می‌کند. اگر نسخه راهنمای ارتقای جدیدی دارید (`deploy/cpanel/UPGRADE-v2.0.1.fa.md`)،
به‌جای فایل قبلی با نام `UPGRADE-GUIDE.fa.md` ضمیمه می‌شود (بالاترین شماره نسخه انتخاب می‌شود).

---

## ۷) عیب‌یابی

| نشانه | علت | راه‌حل |
| :-- | :-- | :-- |
| job «Publish GitHub Release» اجرا نشده (`skipped`) | رویداد از نوع PR بوده، یا `workflow_dispatch` روی شاخه‌ای غیر از `main` | روی `main` اجرا کنید یا تگ بزنید؛ شرط در `if:` job `release` تعریف شده است |
| خطای `403` / `Resource not accessible by integration` هنگام push تگ | job انتشار `contents: write` ندارد یا تنظیمات مخزن Actions را محدود کرده است | `permissions: contents: write` روی job `release` باید بماند؛ در Settings → Actions → Workflow permissions گزینه «Read and write» را بررسی کنید |
| `latest-build` به کامیت جدید اشاره نمی‌کند | گام «Move the rolling tag» شکست خورده | لاگ همان گام را ببینید؛ `git push -f origin refs/tags/latest-build` نیاز به دسترسی نوشتن دارد |
| `! [rejected]` در `gh release upload` | دو اجرای هم‌زمان روی یک تگ | `concurrency` این را پیش‌گیری می‌کند؛ اگر دستی دو اجرا هم‌زمان شروع کرده‌اید، یکی را cancel کنید |
| Release ساخته شد ولی `UPGRADE-GUIDE.fa.md` ندارد | هیچ فایل `deploy/cpanel/UPGRADE-v*.fa.md` در مخزن نیست | گام «Collect release extras» این حالت را با پیام ثبت می‌کند و بدون راهنما منتشر می‌کند |
| ۴ آزمون در `test_release_workflow.py` با پیام «PyYAML is not installed» رد شدند | مفسر Python محلی `yaml` ندارد | روی رانر گیت‌هاب موجود است؛ برای اجرای محلی: `pip install pyyaml`. بقیه آزمون‌ها بدون وابستگی اجرا می‌شوند |
| دانلود با `curl: (22) ... 404` | تگ اشتباه است یا Release هنوز ساخته نشده | `gh release list` یا صفحه Releases را ببینید؛ پس از اولین push به `main` ساخته می‌شود |
| `App version: unknown` در `build-info.txt` | بیلد محلی بدون فایل `VERSION` و بدون `CPANEL_BUILD_VERSION` | در CI اتفاق نمی‌افتد؛ برای بیلد دستی: `CPANEL_BUILD_VERSION=2.0.1 bash deploy/cpanel/build.sh` |

---

## ۸) آزمون‌های محافظ این اتوماسیون

`deploy/cpanel/tests/test_release_workflow.py` قرارداد بالا را قفل می‌کند تا یک ویرایش
بی‌دقت، انتشار را خراب نکند. این آزمون‌ها در همان گام «Offline packaging regression tests»
اجرا می‌شوند، یعنی **پیش از** ساخت بسته:

- تریگرها: `push` به `main` + تگ‌های `v*` + `pull_request` + `workflow_dispatch`
- کمترین دسترسی: پیش‌فرض سراسری `contents: read` و **دقیقاً یک** `contents: write`
- job انتشار به `package` وابسته است و شرط آن PR را راه نمی‌دهد
- تگ چرخشی `latest-build`، آپلود با `--clobber`، `--latest=false` و `--verify-tag`
- راستی‌آزمایی `sha256sum -c` و `verify-package.sh` پیش از انتشار
- artifact شامل هر دو ZIP به‌همراه `SHA256SUMS` و `build-info.txt` و `if-no-files-found: error`
- انتقال `CPANEL_BUILD_VERSION/BRANCH/COMMIT` از workflow به `build.sh`
- هم‌خوانی تگ پیش‌فرض در `download-release.sh` و `download-release.ps1` با workflow
- ثبت نسخه و ref در `build-info.txt` (در `test_build.py`)

اجرای محلی:

```bash
python3 -m unittest discover -s deploy/cpanel/tests -v
```

---

## ۹) چرا ZIPها در Git کامیت نمی‌شوند؟

`cpanel-release/` در [`.gitignore`](../../.gitignore) است و باید بماند:

- هر بیلد ده‌ها مگابایت است و تاریخچه Git برای همیشه آن را نگه می‌دارد ⇒ `clone`
  برای همه (و هر بار CI) سنگین‌تر می‌شود و قابل بازپس‌گیری نیست.
- Release گیت‌هاب دقیقاً برای همین ساخته شده: آدرس ثابت، دانلود بدون ورود،
  اثر انگشت جداگانه و نگهداری بدون محدودیت تاریخچه.
- برای تحویل گرفتن فایل‌ها در یک پوشه محلی، همان `download-release.sh` /
  `download-release.ps1` کافی است.
