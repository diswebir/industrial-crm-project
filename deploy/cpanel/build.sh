#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
#  🏭 Industrial CRM — ساخت پکیج‌های آماده استقرار cPanel
#
#  خروجی (پیش‌فرض، ساختار Split — پیشنهادی):
#     cpanel-release/cpanel-public.zip   → محتویات web root (xx.example.com)
#     cpanel-release/cpanel-private.zip  → برنامه Laravel کامل (private)
#
#  با CPANEL_COMBINED=1 پکیج تک‌پوشه‌ای قبلی هم ساخته می‌شود:
#     cpanel-release/cpanel-app.zip
#
#  استفاده (از ریشه ریپو):
#     bash deploy/cpanel/build.sh
#
#  پیش‌نیاز: PHP 8.2+ , Composer , Node 18+ , npm , zip
#  (این اسکریپت داخل GitHub Actions هم دقیقاً همین‌طور اجرا می‌شود)
# ══════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
DEPLOY="$ROOT/deploy/cpanel"
OUT_DIR="${CPANEL_OUT_DIR:-$ROOT/cpanel-release}"
COMBINED="${CPANEL_COMBINED:-0}"
STAGE="$(mktemp -d)"
cleanup() { rm -rf "$STAGE"; [ "${TMP_ENV:-0}" = "1" ] && [ -f "$BACKEND/.env" ] && rm -f "$BACKEND/.env" || true; }
trap cleanup EXIT

# composer scripts (package:discover) به .env نیاز دارند؛ اگر نبود موقتاً می‌سازیم
TMP_ENV=0
if [ ! -f "$BACKEND/.env" ]; then
  cp "$BACKEND/.env.example" "$BACKEND/.env"
  TMP_ENV=1
fi

echo "==> 1/6 Installing backend dependencies (composer --no-dev)"
composer install --no-dev --optimize-autoloader --no-interaction --working-dir="$BACKEND" --quiet

echo "==> 2/6 Building frontend (vite)"
(cd "$FRONTEND" && npm ci --no-audit --no-fund --loglevel=error && npm run build)

echo "==> 3/6 Staging PRIVATE app files (cpanel-private.zip)"
PRIV="$STAGE/private"
mkdir -p "$PRIV"
(cd "$BACKEND" && cp -a . "$PRIV/")
# پاکسازی موارد غیرضروری / حساس برای پکیج private
rm -rf "$PRIV/public" \
       "$PRIV/.env" \
       "$PRIV/.git" \
       "$PRIV/node_modules" \
       "$PRIV/tests" \
       "$PRIV/database/database.sqlite" \
       "$PRIV/Dockerfile" \
       "$PRIV/docker-entrypoint.sh"
rm -f  "$PRIV/storage/logs/"*.log 2>/dev/null || true
find "$PRIV/storage/framework/sessions" "$PRIV/storage/framework/cache/data" "$PRIV/storage/framework/views" -type f ! -name '.gitignore' -delete 2>/dev/null || true
# اسکلت پوشه‌های storage (برای  نوشتن در زمان نصب)
mkdir -p "$PRIV/storage/app/public" "$PRIV/storage/framework/sessions" "$PRIV/storage/framework/cache/data" "$PRIV/storage/framework/views" "$PRIV/storage/logs" "$PRIV/bootstrap/cache"
touch "$PRIV/storage/app/.gitignore" "$PRIV/storage/framework/.gitignore" 2>/dev/null || true
# قالب .env با APP_KEY یکتا
APP_KEY="base64:$(php -r 'echo base64_encode(random_bytes(32));')"
sed "s|__GENERATED_AT_BUILD__|$APP_KEY|" "$DEPLOY/env.cpanel.example" > "$PRIV/.env.cpanel.example"
cp "$DEPLOY/README.md" "$PRIV/README-FIRST-cpanel.txt"

echo "==> 4/6 Staging PUBLIC web-root files (cpanel-public.zip)"
PUB="$STAGE/public"
mkdir -p "$PUB"
# everything that currently lives in backend/public (index.php, filament assets, fonts, favicon)
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

echo "==> 5/6 Zipping split packages"
mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR/cpanel-public.zip" "$OUT_DIR/cpanel-private.zip" "$OUT_DIR/cpanel-app.zip"
(cd "$PRIV" && zip -qr "$OUT_DIR/cpanel-private.zip" .)
(cd "$PUB"  && zip -qr "$OUT_DIR/cpanel-public.zip" .)

if [ "$COMBINED" = "1" ]; then
  echo "==> 5b/6 Zipping combined single-folder package (CPANEL_COMBINED=1)"
  COMB="$STAGE/combined"
  cp -a "$PRIV" "$COMB"
  mkdir -p "$COMB/public"
  cp -a "$PUB/." "$COMB/public/"
  (cd "$COMB" && zip -qr "$OUT_DIR/cpanel-app.zip" .)
fi

echo "==> 6/6 Done"
echo ""
echo "✅ Built split packages in $OUT_DIR:"
echo "   📂 cpanel-public.zip  ($(du -h "$OUT_DIR/cpanel-public.zip"  | cut -f1)) → extract into the web root (e.g. /home/USER/public_html/xx.example.com)"
echo "   🔒 cpanel-private.zip ($(du -h "$OUT_DIR/cpanel-private.zip" | cut -f1)) → extract into the private path (e.g. /home/USER/private_pro/project1/myc)"
[ "$COMBINED" = "1" ] && echo "   📦 cpanel-app.zip     ($(du -h "$OUT_DIR/cpanel-app.zip"     | cut -f1)) → single-folder install into public_html"
echo "   ℹ️  Next step: open https://your-domain/install.php and follow the wizard."
