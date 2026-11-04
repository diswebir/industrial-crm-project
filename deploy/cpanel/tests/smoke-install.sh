#!/usr/bin/env bash
# End-to-end smoke test with real PHP, Composer output and an EMPTY MySQL database.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
: "${TEST_DB_HOST:?}" "${TEST_DB_PORT:?}" "${TEST_DB_NAME:?}" "${TEST_DB_USER:?}" "${TEST_DB_PASS:?}"
TMP="$(mktemp -d)"
server_pid=''
cleanup() { if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi; rm -rf "$TMP"; }
trap cleanup EXIT
mkdir -p "$TMP/private" "$TMP/public"
unzip -q "$ROOT/cpanel-release/cpanel-private.zip" -d "$TMP/private"
unzip -q "$ROOT/cpanel-release/cpanel-public.zip" -d "$TMP/public"
printf "<?php return '%s';\n" "$TMP/private" > "$TMP/public/paths.php"
printf '%064d' 1 > "$TMP/private/.install-token"
php -S 127.0.0.1:18983 -t "$TMP/public" > "$TMP/server.log" 2>&1 &
server_pid=$!
for i in {1..30}; do
    if curl -s -o /dev/null http://127.0.0.1:18983/install.php; then break; fi
    if ! kill -0 "$server_pid" 2>/dev/null; then cat "$TMP/server.log"; exit 1; fi
    sleep 1
done
BASE=http://127.0.0.1:18983
TOKEN=$(cat "$TMP/private/.install-token")
status=$(curl -s -o "$TMP/token-response" -w '%{http_code}' -c "$TMP/cookies" --data-urlencode "install_token=$TOKEN" "$BASE/install.php")
if [[ "$status" != 303 ]]; then cat "$TMP/token-response" "$TMP/server.log"; echo "Token authorization returned $status" >&2; exit 1; fi
curl -fsS -b "$TMP/cookies" "$BASE/install.php" > "$TMP/form"
grep -q 'name="admin_password"' "$TMP/form"
curl -fsS -b "$TMP/cookies" --data-urlencode 'app_url=http://127.0.0.1:18983' \
    --data-urlencode "db_host=$TEST_DB_HOST" --data-urlencode "db_port=$TEST_DB_PORT" \
    --data-urlencode "db_name=$TEST_DB_NAME" --data-urlencode "db_user=$TEST_DB_USER" \
    --data-urlencode "db_pass=$TEST_DB_PASS" --data-urlencode 'admin_password=VeryStrong!Password123' \
    "$BASE/install.php" > "$TMP/result"
if ! grep -q 'نصب کامل شد' "$TMP/result"; then cat "$TMP/result" "$TMP/server.log"; exit 1; fi
test -f "$TMP/private/.env"
test ! -f "$TMP/private/.install-token"
test ! -f "$TMP/public/install.php"
# Check the deployed Laravel code can bootstrap, authenticate the chosen password and run migrations.
(cd "$TMP/private" && php artisan migrate:status --no-ansi > "$TMP/status")
grep -q 'create_initial_admin_and_permissions' "$TMP/status"
(cd "$TMP/private" && php artisan tinker --execute='if (!Illuminate\Support\Facades\Hash::check("VeryStrong!Password123", App\Models\User::where("email", "admin@crm.local")->firstOrFail()->password)) { throw new Exception("Password mismatch"); }')
echo 'Real PHP/MySQL installer smoke test passed.'
