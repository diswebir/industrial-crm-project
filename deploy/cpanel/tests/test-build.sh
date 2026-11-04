#!/usr/bin/env bash
# Packaging regression test. PHP and Composer are stubbed; npm/Vite run for real.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/source" "$TMP/work"
(cd "$ROOT" && tar --exclude=node_modules --exclude=dist --exclude=vendor -cf - backend frontend deploy) | (cd "$TMP/source" && tar -xf -)
cat > "$TMP/bin/php" <<'PHP'
#!/usr/bin/env bash
exit 0
PHP
cat > "$TMP/bin/composer" <<'COMPOSER'
#!/usr/bin/env bash
if [[ "${FAIL_COMPOSER:-0}" == 1 ]]; then exit 42; fi
for arg in "$@"; do case "$arg" in --working-dir=*) dir="${arg#*=}";; esac; done
if [[ "$1" == install ]]; then
    test -f "$dir/.env"
    mkdir -p "$dir/vendor"
    echo '<?php' > "$dir/vendor/autoload.php"
fi
COMPOSER
chmod +x "$TMP/bin/php" "$TMP/bin/composer"
export PATH="$TMP/bin:$PATH"
echo 'DO-NOT-INCLUDE' > "$TMP/source/backend/.env"
echo 'DO-NOT-INCLUDE' > "$TMP/source/backend/database/database.sqlite"
mkdir -p "$TMP/source/backend/storage/logs"
echo 'DO-NOT-INCLUDE' > "$TMP/source/backend/storage/logs/private.log"
echo 'DO-NOT-INCLUDE' > "$TMP/source/backend/public/secret.txt"
cd "$TMP/work"
CPANEL_OUT_DIR='relative output' bash "$TMP/source/deploy/cpanel/build.sh"
PUBLIC="$TMP/work/relative output/cpanel-public.zip"
PRIVATE="$TMP/work/relative output/cpanel-private.zip"
test -f "$PUBLIC" && test -f "$PRIVATE"
unzip -tq "$PUBLIC" >/dev/null
unzip -tq "$PRIVATE" >/dev/null
unzip -Z1 "$PUBLIC" > "$TMP/public-list"
unzip -Z1 "$PRIVATE" > "$TMP/private-list"
for f in index.php index.html install.php paths.php .htaccess storage/.htaccess; do grep -Fxq "$f" "$TMP/public-list"; done
for f in artisan vendor/autoload.php bootstrap/app.php; do grep -Fxq "$f" "$TMP/private-list"; done
if grep -Eq '(^|/)(\.env[^/]*|database\.sqlite|private\.log)$|^public/' "$TMP/private-list"; then echo 'Private archive contains unwanted files' >&2; exit 1; fi
if grep -Eq '(^|/)(secret\.txt|vendor|\.env)$' "$TMP/public-list"; then echo 'Public archive contains unwanted files' >&2; exit 1; fi
test "$(cat "$TMP/source/backend/.env")" = 'DO-NOT-INCLUDE'
sha256sum "$PUBLIC" "$PRIVATE" > "$TMP/before"
if FAIL_COMPOSER=1 CPANEL_OUT_DIR='relative output' bash "$TMP/source/deploy/cpanel/build.sh"; then echo 'Expected failure' >&2; exit 1; fi
sha256sum -c "$TMP/before"
echo 'Packaging regression test passed (Composer/PHP mocked; frontend build real).'
