#!/usr/bin/env bash
# Build on Linux/WSL. Never install dependencies or write .env in the source tree.
# Output: cpanel-public.zip, cpanel-private.zip, SHA256SUMS, build-info.txt
set -Eeuo pipefail
umask 022

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${CPANEL_OUT_DIR:-$ROOT/cpanel-release}"
WORK=''
LOCK=''
STEP='preflight'
fail() { printf '\nERROR [%s]: %s\n' "$STEP" "$*" >&2; exit 1; }
cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n "$WORK" ]]; then rm -rf -- "$WORK"; fi
  if [[ -n "$LOCK" ]]; then rmdir -- "$LOCK" 2>/dev/null || true; fi
  if (( status != 0 )); then
    printf '\nBuild FAILED at [%s]. No new release was completed. Do not upload old ZIPs as this build.\n' "$STEP" >&2
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'printf "\nCommand failed at line %s (%s).\n" "$LINENO" "$STEP" >&2' ERR
trap 'exit 130' INT
trap 'exit 143' TERM

case "$(uname -s)" in
  Linux*|Darwin*) ;;
  *) fail 'Use Ubuntu/WSL, not Windows Git Bash. See WINDOWS-BUILD-GUIDE.fa.md.' ;;
esac
for tool in php composer node npm tar zip unzip sha256sum mktemp find; do
  command -v "$tool" >/dev/null 2>&1 || fail "Missing tool: $tool. See WINDOWS-BUILD-GUIDE.fa.md."
done
php -r 'if (version_compare(PHP_VERSION, "8.4.1", "<")) {fwrite(STDERR, "Current composer.lock requires PHP >= 8.4.1; got ".PHP_VERSION."\n"); exit(1);} $missing = array_filter(["ctype","curl","dom","fileinfo","filter","gd","iconv","intl","mbstring","openssl","pdo_mysql","session","simplexml","tokenizer","xml","xmlreader","xmlwriter","zip","zlib"], fn($e) => !extension_loaded($e)); if ($missing) {fwrite(STDERR, "Missing PHP extensions: ".implode(", ", $missing)."\n"); exit(1);}'
php -r 'if (extension_loaded("psr") || interface_exists("PsrExt\\Log\\LoggerInterface", false) || interface_exists("Psr\\Log\\LoggerInterface", false)) {fwrite(STDERR, "Disable native psr/PsrExt in the PHP CLI configuration before building; it can conflict with Monolog.\n"); exit(1);}'
node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if(!((major===22 && minor>=12) || major>=24)){console.error("Use Node 22.12+ (22 LTS recommended) or 24+; got "+process.version);process.exit(1)}'
printf 'PHP: %s\nNode: %s\n' "$(php -r 'echo PHP_VERSION;')" "$(node -v)"
composer --version

for file in backend/composer.lock frontend/package-lock.json deploy/cpanel/install.php; do
  [[ -f "$ROOT/$file" ]] || fail "Missing project file: $file"
done
# Resolve relative paths BEFORE changing working directories; paths may contain spaces.
mkdir -p -- "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"
if ! mkdir "$OUT_DIR/.build.lock" 2>/dev/null; then
  fail "Another build owns $OUT_DIR/.build.lock. If a previous process was killed, verify it has stopped before removing this directory."
fi
LOCK="$OUT_DIR/.build.lock"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/crm-build.XXXXXXXX")"
APP="$WORK/private"
FRONT="$WORK/frontend"
PUBLIC="$WORK/public"
RELEASE="$WORK/release"
mkdir -p "$APP" "$FRONT" "$PUBLIC" "$RELEASE"

STEP='copy clean sources'
echo '==> 1/7 Copying application sources into an isolated workspace'
# Explicit source lists: never copy vendor, .env*, auth.json, runtime data or uploads.
(cd "$ROOT/backend" && tar --exclude='bootstrap/cache' --exclude='database/*.sqlite*' -cf - \
  app bootstrap config database resources routes artisan composer.json composer.lock) | (cd "$APP" && tar -xf -)
for dir in lang; do
  if [[ -d "$ROOT/backend/$dir" ]]; then cp -R "$ROOT/backend/$dir" "$APP/"; fi
done
# Public vendor assets are freshly published by filament:upgrade below.
mkdir -p "$APP/public"
for file in index.php private-path.php resolve-private.php; do
  cp "$ROOT/backend/public/$file" "$APP/public/$file"
done
# Custom public assets that Composer/Filament never publish (Persian Vazirmatn font + panel CSS).
# Without this step the admin panel silently falls back to a Latin font on cPanel hosts.
if [[ -d "$ROOT/backend/public/css" ]]; then
  mkdir -p "$APP/public/css"
  find "$ROOT/backend/public/css" -maxdepth 1 -type f -name '*.css' -exec cp {} "$APP/public/css/" \;
fi
if [[ -d "$ROOT/backend/public/fonts" ]]; then
  mkdir -p "$APP/public/fonts"
  find "$ROOT/backend/public/fonts" -maxdepth 1 -type f \( -name '*.woff2' -o -name '*.woff' -o -name '*.ttf' \) -exec cp {} "$APP/public/fonts/" \;
fi
for file in favicon.ico robots.txt; do
  if [[ -f "$ROOT/backend/public/$file" ]]; then cp "$ROOT/backend/public/$file" "$APP/public/$file"; fi
done
(cd "$ROOT/frontend" && tar -cf - src index.html package.json package-lock.json tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts) | (cd "$FRONT" && tar -xf -)
if [[ -d "$ROOT/frontend/public" ]]; then cp -R "$ROOT/frontend/public" "$FRONT/"; fi
if [[ -n "$(find "$APP" "$FRONT" -type l -print -quit)" ]]; then
  fail 'Symlinks in application sources are not supported in release packages.'
fi
mkdir -p "$APP/bootstrap/cache" "$APP/storage/app/private" "$APP/storage/app/public" \
  "$APP/storage/framework/cache/data" "$APP/storage/framework/sessions" \
  "$APP/storage/framework/views" "$APP/storage/logs"

STEP='Composer install'
echo '==> 2/7 Installing locked production PHP dependencies'
# A deterministic local build environment: no production DB, no .env copied from the user.
cat > "$APP/.env" <<'ENV'
APP_NAME="Parts CRM Build"
APP_ENV=local
APP_DEBUG=false
APP_KEY=base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
APP_URL=http://localhost
DB_CONNECTION=sqlite
DB_DATABASE=:memory:
CACHE_STORE=file
SESSION_DRIVER=file
QUEUE_CONNECTION=sync
LOG_CHANNEL=stderr
ENV
# Override inherited production variables for Composer scripts, including public_path.
(
  export APP_ENV=local APP_DEBUG=false APP_URL=http://localhost
  export APP_KEY=base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
  export APP_PUBLIC_PATH="$APP/public" DB_CONNECTION=sqlite DB_DATABASE=:memory:
  export CACHE_STORE=file SESSION_DRIVER=file QUEUE_CONNECTION=sync LOG_CHANNEL=stderr
  export APP_CONFIG_CACHE="$APP/bootstrap/cache/config.php"
  export APP_ROUTES_CACHE="$APP/bootstrap/cache/routes-v7.php"
  composer install --working-dir="$APP" --no-dev --prefer-dist --optimize-autoloader --no-interaction --no-progress
  composer check-platform-reqs --working-dir="$APP" --no-dev
)

STEP='frontend build'
echo '==> 3/7 Compiling frontend in isolation'
(cd "$FRONT" && npm ci --include=dev --no-audit --no-fund && npm run build)
[[ -s "$FRONT/dist/index.html" && -d "$FRONT/dist/assets" ]] || fail 'Frontend build did not generate index.html and assets.'

STEP='prepare release'
echo '==> 4/7 Preparing separated public and private trees'
cp -R "$APP/public/." "$PUBLIC/"
cp -R "$FRONT/dist/." "$PUBLIC/"
rm -rf "$APP/public"
rm -f "$APP/.env" "$APP/bootstrap/cache/"*.php
# Nothing from the build runtime should enter the archive.
find "$APP/storage" -type f -delete
cp "$ROOT/deploy/cpanel/htaccess/public.htaccess" "$PUBLIC/.htaccess"
cp "$ROOT/deploy/cpanel/"{install.php,update.php,setup-check.php} "$PUBLIC/"
printf "<?php\nreturn '/home/CPANEL_USER/private_pro/project1/myc';\n" > "$PUBLIC/private-path.php"
mkdir -p "$PUBLIC/storage"
printf 'Require all denied\n' > "$APP/.htaccess"
cp "$ROOT/deploy/cpanel/README.md" "$APP/README-FIRST-cpanel.txt"
cp "$ROOT/deploy/cpanel/env.cpanel.example" "$APP/.env.cpanel.example"
# The installer generates a unique APP_KEY on the destination, never at build time.
sed -i.bak 's/__GENERATED_AT_BUILD__/__GENERATE_WITH_INSTALLER__/' "$APP/.env.cpanel.example"
rm -f "$APP/.env.cpanel.example.bak"

STEP='validate staged application'
echo '==> 5/7 Checking PHP syntax and required files'
find "$APP" "$PUBLIC" -name '*.php' -not -path "$APP/vendor/*" -print0 | xargs -0 -n1 php -l > "$WORK/php-lint.log"
for file in vendor/autoload.php bootstrap/app.php artisan; do
  [[ -s "$APP/$file" ]] || fail "Missing private release file: $file"
done
for file in index.php index.html .htaccess resolve-private.php private-path.php install.php; do
  [[ -s "$PUBLIC/$file" ]] || fail "Missing public release file: $file"
done
[[ -d "$PUBLIC/css/filament" && -d "$PUBLIC/js/filament" ]] || fail 'Filament assets were not published by Composer scripts.'
# Persian Vazirmatn (Farsi-Digits) assets must ship with the public release, otherwise the
# admin panel and exported pages silently fall back to a Latin font with Latin digits.
[[ -s "$PUBLIC/css/vazirmatn.css" ]] || fail 'Missing public/css/vazirmatn.css in the release.'
[[ -s "$PUBLIC/fonts/vazirmatn-fd-Regular.woff2" ]] || fail 'Missing Vazirmatn FD font files in the release.'
if [[ -n "$(find "$APP" "$PUBLIC" -type l -print -quit)" ]]; then fail 'Release contains a symlink.'; fi

STEP='ZIP verification'
echo '==> 6/7 Creating and testing ZIP archives'
(cd "$PUBLIC" && zip -qr "$RELEASE/cpanel-public.zip" .)
(cd "$APP" && zip -qr "$RELEASE/cpanel-private.zip" .)
unzip -tq "$RELEASE/cpanel-public.zip"
unzip -tq "$RELEASE/cpanel-private.zip"
# Validate the actual archives, not merely the staging directories.
bash "$ROOT/deploy/cpanel/verify-package.sh" "$RELEASE"
{
  printf 'Built at (UTC): %s\n' "$(date -u +%FT%TZ)"
  printf 'PHP: %s\nNode: %s\n' "$(php -r 'echo PHP_VERSION;')" "$(node -v)"
  printf 'Requires hosting PHP >= 8.4.1 with required extensions.\n'
  printf 'Configure private-path.php before installation.\n'
  sha256sum "$ROOT/backend/composer.lock" "$ROOT/frontend/package-lock.json"
} > "$RELEASE/build-info.txt"
(cd "$RELEASE" && sha256sum cpanel-public.zip cpanel-private.zip > SHA256SUMS)

STEP='publish verified artifacts'
echo '==> 7/7 Publishing verified artifacts'
# Keep previous artifacts intact until BOTH new archives pass all checks.
for file in cpanel-public.zip cpanel-private.zip build-info.txt SHA256SUMS; do
  cp "$RELEASE/$file" "$OUT_DIR/.$file.new"
done
for file in cpanel-public.zip cpanel-private.zip build-info.txt SHA256SUMS; do
  mv -f "$OUT_DIR/.$file.new" "$OUT_DIR/$file"
done
printf '\nSUCCESS: %s\n' "$OUT_DIR"
ls -lh "$OUT_DIR/cpanel-public.zip" "$OUT_DIR/cpanel-private.zip"
printf 'Verify: cd "%s" && sha256sum -c SHA256SUMS\n' "$OUT_DIR"
