#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
#  🏭 Industrial CRM — ساخت پکیج‌های آماده استقرار cPanel
#
#  خروجی پیش‌فرض (ساختار Split — پیشنهادی):
#     cpanel-release/cpanel-public.zip   → محتویات web root (xx.example.com)
#     cpanel-release/cpanel-private.zip  → برنامه Laravel کامل (private)
#
#  با CPANEL_COMBINED=1 پکیج تک‌پوشه‌ای هم ساخته می‌شود:
#     cpanel-release/cpanel-app.zip
#
#  استفاده (از ریشه ریپو):
#     bash deploy/cpanel/build.sh
#
#  متغیرهای محیطی:
#     CPANEL_OUT_DIR      مسیر خروجی (پیش‌فرض: ./cpanel-release)
#     CPANEL_COMBINED=1   ساخت cpanel-app.zip تک‌پوشه‌ای همزمان
#     CPANEL_SKIP_DEPS=1  رد کردن composer install و npm build (مثلاً وقتی
#                         vendor و dist از قبل آماده‌اند — برای تست/CI آفلاین)
#
#  پیش‌نیاز: PHP 8.2+ , Composer , Node 18+ , npm , zip
#  (در GitHub Actions دقیقاً همین اسکریپت اجرا می‌شود)
# ══════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
DEPLOY="$ROOT/deploy/cpanel"
OUT_DIR="${CPANEL_OUT_DIR:-$ROOT/cpanel-release}"
COMBINED="${CPANEL_COMBINED:-0}"
SKIP_DEPS="${CPANEL_SKIP_DEPS:-0}"

err()  { echo "❌ $*" >&2; }
die()  { err "$*"; exit 1; }
info() { echo "==> $*"; }

# ─────────── 0/7 Pre-flight checks ───────────
info "0/7 Pre-flight checks"
[ -d "$BACKEND" ]  || die "پوشه backend یافت نشد: $BACKEND (اسکریپت را از ریشه ریپو اجرا کنید)"
[ -d "$FRONTEND" ] || die "پوشه frontend یافت نشد: $FRONTEND"
[ -f "$BACKEND/composer.json" ] || die "composer.json بک‌اند یافت نشد"
[ -f "$FRONTEND/package.json" ]  || die "package.json فرانت‌اند یافت نشد"
command -v zip >/dev/null 2>&1 || die "ابزار zip نصب نیست (apt install zip / yum install zip)"

if [ "$SKIP_DEPS" != "1" ]; then
  command -v php >/dev/null 2>&1 || die "PHP نصب نیست — نسخه 8.2+ لازم است"
  php -r 'exit(version_compare(PHP_VERSION, "8.2.0", ">=") ? 0 : 1);' \
    || die "PHP >= 8.2 لازم است؛ نسخه فعلی: $(php -r 'echo PHP_VERSION;')"
  command -v composer >/dev/null 2>&1 || die "Composer نصب نیست"
  command -v node >/dev/null 2>&1 || die "Node نصب نیست"
  node -e 'process.exit(parseInt(process.versions.node) >= 18 ? 0 : 1)' \
    || die "Node >= 18 لازم است؛ نسخه فعلی: $(node -v)"
  command -v npm >/dev/null 2>&1 || die "npm نصب نیست"
else
  info "   CPANEL_SKIP_DEPS=1 → رد کردن composer/npm (assumes vendor/ و dist/ آماده‌اند)"
fi

STAGE="$(mktemp -d)"
cleanup() {
  rm -rf "$STAGE"
  if [ "${TMP_ENV:-0}" = "1" ] && [ -f "$BACKEND/.env" ]; then rm -f "$BACKEND/.env"; fi
}
trap cleanup EXIT

# composer scripts (package:discover) به .env نیاز دارند؛ اگر نبود موقتاً می‌سازیم
TMP_ENV=0
if [ "$SKIP_DEPS" != "1" ] && [ ! -f "$BACKEND/.env" ]; then
  cp "$BACKEND/.env.example" "$BACKEND/.env"
  TMP_ENV=1
fi

# ─────────── 1/7 Backend dependencies ───────────
if [ "$SKIP_DEPS" != "1" ]; then
  info "1/7 composer validate"
  composer validate --no-check-publish --working-dir="$BACKEND"
  info "2/7 Installing backend dependencies (composer install --no-dev)"
  composer install --no-dev --optimize-autoloader --no-interaction --no-progress --working-dir="$BACKEND"
fi
[ -f "$BACKEND/vendor/autoload.php" ] || die "بعد از composer install هنوز vendor/autoload.php ساخته نشده — build ناموفق بود"

# ─────────── 2/7 Frontend build ───────────
if [ "$SKIP_DEPS" != "1" ]; then
  info "3/7 Building frontend (npm ci + vite build)"
  (cd "$FRONTEND" && npm ci --no-audit --no-fund --loglevel=error && npm run build)
fi
[ -f "$FRONTEND/dist/index.html" ] || die "بعد از build فرانت‌اند، dist/index.html ساخته نشده"

# ─────────── 3/7 Stage PRIVATE files ───────────
info "4/7 Staging PRIVATE app files → cpanel-private.zip"
PRIV="$STAGE/private"
mkdir -p "$PRIV"
(cd "$BACKEND" && cp -a . "$PRIV/")
rm -rf "$PRIV/public" \
       "$PRIV/.env" \
       "$PRIV/.git" \
       "$PRIV/node_modules" \
       "$PRIV/tests" \
       "$PRIV/database/database.sqlite" \
       "$PRIV/Dockerfile" \
       "$PRIV/docker-entrypoint.sh"
rm -f "$PRIV/storage/logs/"*.log 2>/dev/null || true
find "$PRIV/storage/framework/sessions" "$PRIV/storage/framework/cache/data" "$PRIV/storage/framework/views" \
     -type f ! -name '.gitignore' -delete 2>/dev/null || true
# اسکلت پوشه‌های storage (برای نوشتن در زمان نصب)
mkdir -p "$PRIV/storage/app/public" \
         "$PRIV/storage/framework/sessions" \
         "$PRIV/storage/framework/cache/data" \
         "$PRIV/storage/framework/views" \
         "$PRIV/storage/logs" \
         "$PRIV/bootstrap/cache"
# قالب .env با APP_KEY یکتا
if command -v php >/dev/null 2>&1; then
  APP_KEY="base64:$(php -r 'echo base64_encode(random_bytes(32));')"
else
  APP_KEY="base64:$(head -c 32 /dev/urandom | base64)"
fi
sed "s|__GENERATED_AT_BUILD__|$APP_KEY|" "$DEPLOY/env.cpanel.example" > "$PRIV/.env.cpanel.example"
cp "$DEPLOY/README.md" "$PRIV/README-FIRST-cpanel.txt"

# ─────────── 4/7 Stage PUBLIC web-root files ───────────
info "5/7 Staging PUBLIC web-root files → cpanel-public.zip"
PUB="$STAGE/public"
mkdir -p "$PUB"
# everything that lives in backend/public (index.php, filament assets, fonts, favicon)
(cd "$BACKEND/public" && cp -a . "$PUB/")
# SPA build replaces the placeholder index.html / assets
rm -rf "$PUB/assets" "$PUB/index.html" "$PUB/favicon.svg" "$PUB/icons.svg"
cp -r "$FRONTEND/dist/." "$PUB/"
# htaccess پوشه web root — مسیریابی SPA + API + مسدودسازی فایل‌های حساس
cp "$DEPLOY/htaccess/public.htaccess" "$PUB/.htaccess"
# htaccess ریشه (برای حالت تک‌پوشه‌ای داخل public_html) — با پسوند غیرفعال
cp "$DEPLOY/htaccess/root.htaccess" "$PUB/_cpanel-root-htaccess.txt"
# نصب‌کننده وب + به‌روزرسان + بررسی سلامت
cp "$DEPLOY/install.php" "$DEPLOY/update.php" "$DEPLOY/setup-check.php" "$PUB/"
# نمونه اشاره‌گر مسیر خصوصی
cp "$BACKEND/public/app-path.example.txt" "$PUB/app-path.example.txt"
# پوشه آپلودها (بدون نیاز به symlink)
mkdir -p "$PUB/storage"
touch "$PUB/storage/.gitkeep"

# ─────────── 5/7 Zip ───────────
info "6/7 Zipping packages"
mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR/cpanel-public.zip" "$OUT_DIR/cpanel-private.zip" "$OUT_DIR/cpanel-app.zip"
(cd "$PRIV" && zip -qr "$OUT_DIR/cpanel-private.zip" .)
(cd "$PUB"  && zip -qr "$OUT_DIR/cpanel-public.zip" .)

if [ "$COMBINED" = "1" ]; then
  COMB="$STAGE/combined"
  cp -a "$PRIV" "$COMB"
  mkdir -p "$COMB/public"
  cp -a "$PUB/." "$COMB/public/"
  (cd "$COMB" && zip -qr "$OUT_DIR/cpanel-app.zip" .)
fi

# ─────────── 6/7 Verify outputs ───────────
info "7/7 Verifying outputs"
for z in "$OUT_DIR/cpanel-public.zip" "$OUT_DIR/cpanel-private.zip"; do
  [ -s "$z" ] || die "زیپ ساخته نشد یا خالی است: $z"
done
[ "$COMBINED" = "1" ] && { [ -s "$OUT_DIR/cpanel-app.zip" ] || die "cpanel-app.zip خالی است"; }
# NOTE: capture listings in variables — with `set -o pipefail`, `unzip | grep -q`
# would fail on SIGPIPE because grep -q closes the pipe on first match.
PUB_LIST="$(unzip -l "$OUT_DIR/cpanel-public.zip")"
PRIV_LIST="$(unzip -l "$OUT_DIR/cpanel-private.zip")"
# The public zip must contain the front controller + installer + htaccess
[[ "$PUB_LIST" == *"index.php"* ]]   || die "cpanel-public.zip: index.php وجود ندارد"
[[ "$PUB_LIST" == *"install.php"* ]] || die "cpanel-public.zip: install.php وجود ندارد"
[[ "$PUB_LIST" == *".htaccess"* ]]   || die "cpanel-public.zip: .htaccess وجود ندارد"
[[ "$PUB_LIST" == *"index.html"* ]]  || die "cpanel-public.zip: index.html وجود ندارد"
# The private zip must contain the app core and must NOT contain public/
[[ "$PRIV_LIST" == *"vendor/autoload.php"* ]] || die "cpanel-private.zip: vendor/autoload.php وجود ندارد"
[[ "$PRIV_LIST" == *"bootstrap/app.php"* ]]   || die "cpanel-private.zip: bootstrap/app.php وجود ندارد"
if [[ "$PRIV_LIST" == *" public/"* ]]; then die "cpanel-private.zip نباید پوشه public/ داشته باشد"; fi

echo ""
echo "✅ Build با موفقیت انجام شد — خروجی در $OUT_DIR:"
for z in "$OUT_DIR"/*.zip; do
  [ -e "$z" ] || continue
  printf "   %-28s %8s  (%s فایل)\n" "$(basename "$z")" "$(du -h "$z" | cut -f1)" "$(unzip -l "$z" | tail -1 | awk '{print $2}')"
  command -v sha256sum >/dev/null 2>&1 && sha256sum "$z" | sed 's/^/     sha256: /'
done
echo ""
echo "📂 cpanel-public.zip  → داخل web root (مثلاً /home/USER/public_html/xx.example.com) extract شود"
echo "🔒 cpanel-private.zip → داخل مسیر خصوصی (مثلاً /home/USER/private_pro/project1/myc) extract شود"
echo "ℹ️  سپس https://دامنه/install.php را باز کنید و ویزارد نصب را کامل کنید."
