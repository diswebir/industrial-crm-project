# 🏭 سامانه یکپارچه مدیریت مشتریان و قطعات صنعتی (Industrial Parts CRM)

سامانه مدیریت ارتباط با مشتریان (CRM) طراحی‌شده برای شرکت‌های تولیدکننده قطعات فیزیکی و صنعتی به همراه گارانتی و سرویس‌های دوره‌ای اختیاری، احراز هویت مبتنی بر مجوزهای مستقیم (Pure ACL)، یکپارچگی با وب‌سرویس ملی‌پیامک و ورود/خروج اکسل.

---

## 🟢 استقرار روی هاست cPanel (بدون SSH) — روش اصلی

این پروژه یک **مسیر استقرار کامل روی cPanel** دارد که کاملاً بدون SSH، Composer و Node کار می‌کند و از **ساختار split (public/private)** پشتیبانی می‌کند:

- فایل‌های **public** (SPA + `index.php` + `.htaccess`) را در web root ساب‌دامنه (مثلاً `/home/USER/public_html/xx.example.com`) قرار بده — `cpanel-public.zip`
- فایل‌های **private** (کل برنامه Laravel + `vendor` + `.env`) را در یک مسیر قابل تنظیم خارج از web root (مثلاً `/home/USER/private_pro/project1/myc`) قرار بده — `cpanel-private.zip`
- نصب‌کننده تحت وب `install.php` مسیر خصوصی را به‌صورت خودکار در `app-path.txt` ثبت می‌کند: اتصال دیتابیس + ساخت `.env` + مایگریشن‌ها + داده اولیه
- **به‌روزرسانی:** زیپ‌های جدید را روی مسیرهای قبلی استخراج کن و `update.php` را با `APP_KEY` اجرا کن.
- راهنمای کامل فارسی: [`deploy/cpanel/README.md`](deploy/cpanel/README.md)

### ساخت پکیج (توسعه‌دهنده)
با push کردن تگ نسخه، GitHub Actions خودش پکیج‌ها را می‌سازد و به Release پیوست می‌کند:
```bash
git tag v1.0.1 && git push origin v1.0.1
```
بیلد لوکال: `bash deploy/cpanel/build.sh` (خروجی: `cpanel-release/cpanel-public.zip` + `cpanel-private.zip`)

---


## 🚀 دسترسی سریع به سامانه و مستندات

| سرویس | آدرس دسترسی | توضیحات |
| :--- | :--- | :--- |
| **پنل وب کاربری (React Frontend)** | [http://localhost:3001](http://localhost:3001) | رابط کاربری مدرن با React 19، Tailwind CSS v4، DaisyUI و فونت وزیرمتن |
| **پنل مدیریت بک‌اند (Filament Admin Panel)** | [http://localhost:3001/admin](http://localhost:3001/admin) یا [http://localhost:8000/admin](http://localhost:8000/admin) | پنل مدیریت پیشرفته Filament v3 جهت مدیریت مستقیم جداول، مشتریان، قطعات، سوابق پیامک و کاربران |
| **مستندات تعاملی API (OpenAPI/Scramble)** | [http://localhost:3001/docs/api](http://localhost:3001/docs/api) یا [http://localhost:8000/docs/api](http://localhost:8000/docs/api) | مستندات کامل تمامی اندپوینت‌های بکند به همراه پارامترها و نمونه خروجی‌ها |
| **بکند API (Laravel 11)** | [http://localhost:8000/api/v1](http://localhost:8000/api/v1) | هسته سرویس‌های RESTful با توکن Sanctum |

### 🔐 اطلاعات ورود پیش‌فرض (مدیر ارشد سامانه)
- **نام کاربری / ایمیل:** `admin@crm.local` (یا شماره موبایل: `09120000000`)
- **رمز عبور:** `Admin@123456`
- **نوع دسترسی:** دارای تمامی ۱۴ مجوز مستقیم سیستمی (Pure ACL بدون نقش واسط - قابل ورود هم به فرانت‌اند و هم به پنل ادمین Filament)

---

## ⚙️ معماری سیستم و پشته فناوری

### فرانت‌اند (`/frontend`)
- **React 19 + TypeScript + Vite**
- **Tailwind CSS v4 + DaisyUI**: استایل‌دهی مدرن با تم‌های تیره و روشن (Dark/Light Mode) و سازگاری کامل با راست‌به‌چپ (RTL)
- **TanStack React Query v5**: مدیریت کش و درخواست‌های بهینه‌سازی‌شده
- **Zustand**: مدیریت استیت احراز هویت و دسترسی‌های کاربر
- **Lucide React**: آیکون‌های باکیفیت و هماهنگ

### بکند (`/backend`)
- **Laravel 11 (PHP 8.4)**
- **Filament v3**: پنل مدیریت کامل و فارسی برای مدیریت دیتابیس در `/admin`
- **PostgreSQL 15**: دیتابیس رابطه‌ای امن با ایندکس‌های بهینه
- **Laravel Sanctum**: احراز هویت توکن‌محور (آماده اتصال ورود پیامکی OTP)
- **Spatie Laravel Permission**: پیاده‌سازی مدل مجوز مستقیم (Direct ACL Permissions) بدون تعریف نقش (Role)
- **Dedoc Scramble**: تولید خودکار و زنده مستندات OpenAPI در `/docs/api`
- **Maatwebsite Excel**: برون‌بری و درون‌ریزی فایل‌های `.xlsx` مشتریان
- **وب‌سرویس ملی‌پیامک (Melipayamak Service)**: ارسال پیامک‌های خدماتی و الگو (`BaseServiceNumber`) با حالت سندباکس و لاگ کامل در دیتابیس

---

## 📦 ویژگی‌های کلیدی کسب‌وکار

1. **مدیریت قطعات فیزیکی و شماره سریال یکتا:**
   - ثبت قطعات در کاتالوگ با فیلدهای `name`، `code`، `periodic_service_months` و توضیحات.
   - تخصیص قطعه فیزیکی به مشتری به همراه **شماره سریال یکتا** (`serial_number`)، تاریخ نصب و محاسبه خودکار تاریخ پایان گارانتی.

2. **تبدیل خودکار مشتری بالقوه به بالفعل:**
   - مشتریان ابتدا می‌توانند به عنوان **«بالقوه» (potential)** تعریف شوند.
   - به محض تخصیص اولین قطعه فیزیکی به مشتری، سیستم وضعیت او را به صورت خودکار به **«بالفعل» (effective)** ارتقا داده و در تاریخچه اقدامات مشتری لاگ می‌زند.

3. **سوابق سرویس و تعمیرات (گارانتی اختیاری):**
   - سرویس دوره‌ای به صورت اجباری یا یادآور خودکار نیست؛ بلکه یک پوشش گارانتی اختیاری از سمت شرکت است.
   - امکان ثبت سوابق تعمیر یا سرویس هر قطعه تخصیص‌داده‌شده با فیلدهای نوع سرویس، تاریخ، هزینه، نام تکنسین و توضیحات کامل.

4. **سیستم مجوزهای مستقیم (Pure ACL):**
   - بدون استفاده از نقش‌ها (Roles).
   - ۱۴ مجوز مستقیم تفکیک‌شده:
     `customers.view`, `customers.create`, `customers.edit`, `customers.delete`, `customers.import`, `customers.export`, `parts.view`, `parts.manage`, `parts.assign`, `parts.history`, `sms.send`, `sms.logs`, `users.manage`, `settings.manage`
   - امکان فعال/غیرفعال کردن هر کاربر و تخصیص مستقیم چک‌باکسی دسترسی‌ها.

5. **مرکز پیامک و اتصال به ملی‌پیامک:**
   - پشتیبانی از وب‌سرویس الگوی خدماتی (`BaseServiceNumber`).
   - تنظیم نام کاربری، رمز عبور، شماره خط و وضعیت آزمایشی (Sandbox) در تب تنظیمات بدون نیاز به کدنویسی.
   - لاگ تمام پیامک‌های ارسالی با وضعیت تحویل، شناسه پیامک و ارتباط با مشتری.

6. **اکسل مشتریان:**
   - امکان دانلود فایل نمونه اکسل جهت پر کردن داده‌ها (`/api/v1/customers/template`).
   - آپلود و ورود دسته‌ای مشتریان با گزارش خطاهای ردیف به ردیف.
   - خروجی‌گیری زنده و دانلود اکسل کلیه مشتریان (`/api/v1/customers/export`).

---

## 🐳 دستورات راه‌اندازی با داکر (Docker Compose)

### اجرای پروژه
```bash
docker compose up -d
```

### بررسی وضعیت کانتینرها
```bash
docker compose ps
```

### مشاهده لاگ‌های بکند
```bash
docker logs -f crm_backend
```

### توقف کانتینرها
```bash
docker compose down
```

### اجرای مجدد مایگریشن‌ها و سیدرها در صورت نیاز
```bash
docker exec -it crm_backend php artisan migrate:fresh --seed
```

---

## 🛠 ساختار مخزن پروژه

```
├── docker-compose.yml           # کانفیگ چندکانتینری (بکند، فرانت، پستگرس، ردیس)
├── backend/                     # پروژه بکند لاراول ۱۱
│   ├── app/
│   │   ├── Http/Controllers/Api/V1/ # کنترلرهای RESTful
│   │   ├── Models/             # مدل‌های Customer, Part, CustomerPart, ServiceHistory, SmsLog, User
│   │   ├── Services/           # سرویس مشتریان و سرویس ملی‌پیامک
│   │   └── Exports/ & Imports/ # فایل‌های پردازش اکسل
│   ├── config/scramble.php     # تنظیمات مستندات OpenAPI
│   ├── database/migrations/    # مایگریشن‌های پایگاه‌داده و سیدر اولیه
│   └── routes/api.php          # اندپوینت‌های نسخه ۱ API
└── frontend/                    # پروژه فرانت‌اند ری‌اکت ۱۹
    ├── src/
    │   ├── components/         # کامپوننت‌های فرم، تخصیص قطعه، سابقه سرویس و اکسل
    │   ├── layouts/            # سایدبار و لایوت اصلی با کنترل ACL
    │   ├── pages/              # داشبورد، مشتریان، قطعات، پیامک، تنظیمات، لاگین
    │   ├── services/api.ts     # اینترفیس تایپ‌شده Axios
    │   ├── store/useAuthStore.ts # مدیریت دسترسی‌ها و توکن Sanctum
    │   └── types/index.ts      # تایپ‌های کامل TypeScript
    ├── nginx.conf              # وب‌سرور Nginx فرانت‌اند و Reverse Proxy به بکند
    └── Dockerfile              # داکرفایل فرانت‌اند
```
