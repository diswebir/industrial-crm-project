#!/usr/bin/env bash
# Build two independent archives for cPanel. Run on Linux, macOS or WSL.
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY="$ROOT/deploy/cpanel"
OUT_DIR="${CPANEL_OUT_DIR:-$ROOT/cpanel-release}"
STAGE=""
cleanup() { if [[ -n "$STAGE" ]]; then rm -rf -- "$STAGE"; fi; }
on_error() { echo "ERROR: build failed at line $1. If publishing failed, check both output archives before use." >&2; }
trap cleanup EXIT
trap 'on_error "$LINENO"' ERR

for command in php composer node npm zip unzip tar; do
    if ! command -v "$command" >/dev/null 2>&1; then
        echo "ERROR: '$command' is required. See deploy/cpanel/راهنمای-ساخت-بسته-در-ویندوز.md." >&2
        exit 1
    fi
done
# openspout in the production composer.lock requires PHP 8.3, despite composer.json's lower minimum.
php -r 'if (PHP_VERSION_ID < 80300) {fwrite(STDERR, "ERROR: PHP 8.3+ is required by composer.lock.\n"); exit(1);}'
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 20 || (major === 20 && minor < 19) || (major === 22 && minor < 12) || major === 21) { console.error("ERROR: Vite requires Node.js 20.19+ or 22.12+."); process.exit(1); }'

# Resolve relative output paths before changing directories, including paths containing spaces.
mkdir -p -- "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd -P)"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/crm-cpanel.XXXXXXXX")"
BACKEND="$STAGE/backend"
FRONTEND="$STAGE/frontend"
mkdir -p "$BACKEND" "$FRONTEND"

echo '==> 1/6 Copying clean source to temporary workspace'
# Explicit allowlist: never package local .env, databases, uploads, keys or logs.
(cd "$ROOT/backend" && tar -cf - app artisan bootstrap composer.json composer.lock config database/migrations database/seeders database/factories public/css public/fonts public/js public/robots.txt public/favicon.ico resources routes) | (cd "$BACKEND" && tar -xf -)
rm -rf "$BACKEND/bootstrap/cache" "$BACKEND/public/storage"
mkdir -p "$BACKEND/bootstrap/cache" "$BACKEND/storage/app/private" "$BACKEND/storage/app/public" \
    "$BACKEND/storage/framework/cache/data" "$BACKEND/storage/framework/sessions" \
    "$BACKEND/storage/framework/views" "$BACKEND/storage/logs"
# Isolated build configuration: never run Composer scripts against the developer's own .env or DB.
cp "$ROOT/backend/.env.example" "$BACKEND/.env"
(cd "$ROOT/frontend" && tar -cf - package.json package-lock.json index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts src public) | (cd "$FRONTEND" && tar -xf -)

echo '==> 2/6 Installing PHP dependencies and publishing Filament assets'
composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction --working-dir="$BACKEND"
composer check-platform-reqs --no-dev --working-dir="$BACKEND"
test -f "$BACKEND/vendor/autoload.php"

echo '==> 3/6 Building React frontend'
(cd "$FRONTEND" && npm ci --include=dev --no-audit --no-fund && npm run build)
test -f "$FRONTEND/dist/index.html"

echo '==> 4/6 Preparing public and private files'
rm -rf "$BACKEND/public/assets" "$BACKEND/public/index.html" "$BACKEND/public/favicon.svg" "$BACKEND/public/icons.svg"
cp -R "$FRONTEND/dist/." "$BACKEND/public/"
cp "$DEPLOY/htaccess/public.htaccess" "$BACKEND/public/.htaccess"
cp "$DEPLOY/install.php" "$DEPLOY/index.php" "$DEPLOY/paths.php" "$BACKEND/public/"
mkdir -p "$BACKEND/public/storage"
cat > "$BACKEND/public/storage/.htaccess" <<'HTACCESS'
Options -Indexes
<FilesMatch "\.(php[0-9]?|phtml|phar|cgi|pl|py|shtml)$">
    Require all denied
</FilesMatch>
HTACCESS
cp "$DEPLOY/README.md" "$BACKEND/README-FIRST-cpanel.txt"
cp "$DEPLOY/راهنمای-ساخت-بسته-در-ویندوز.md" "$BACKEND/"
rm -f "$BACKEND/.env"
# Rebuild cached package manifests on the target; never ship build machine paths.
find "$BACKEND/bootstrap/cache" -type f -delete

echo '==> 5/6 Creating and testing archives'
# Produce both ZIPs in the staging directory first. Failed builds do not remove previous releases.
(cd "$BACKEND/public" && zip -qr "$STAGE/cpanel-public.zip" .)
rm -rf "$BACKEND/public"
(cd "$BACKEND" && zip -qr "$STAGE/cpanel-private.zip" .)
unzip -tq "$STAGE/cpanel-public.zip" >/dev/null
unzip -tq "$STAGE/cpanel-private.zip" >/dev/null

echo '==> 6/6 Publishing archives'
mv -f -- "$STAGE/cpanel-public.zip" "$OUT_DIR/cpanel-public.zip"
mv -f -- "$STAGE/cpanel-private.zip" "$OUT_DIR/cpanel-private.zip"
echo "Built: $OUT_DIR/cpanel-public.zip"
echo "Built: $OUT_DIR/cpanel-private.zip"
