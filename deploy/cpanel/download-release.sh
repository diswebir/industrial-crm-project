#!/usr/bin/env bash
# دانلود بسته‌های آماده cPanel از GitHub Releases و قرار دادن آن‌ها در پوشه cpanel-release.
# این اسکریپت چیزی نمی‌سازد؛ فقط بسته‌ای را می‌گیرد که GitHub Actions ساخته و آزمون کرده است.
#
#   bash deploy/cpanel/download-release.sh                 # جدیدترین بیلد main (تگ latest-build)
#   bash deploy/cpanel/download-release.sh v2.0.1          # یک نسخه مشخص
#   CPANEL_OUT_DIR="/d/releases" bash deploy/cpanel/download-release.sh
#
# جایگزین‌ها اگر curl ندارید:
#   gh release download latest-build -p '*.zip' -p 'SHA256SUMS' -D cpanel-release
set -Eeuo pipefail
umask 022

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/deploy/cpanel/download-release.sh"

usage() {
  cat <<EOF
Usage: bash $(basename "$SCRIPT") [TAG]

  TAG      نام تگ Release؛ پیش‌فرض «latest-build» (جدیدترین بیلد شاخه main).
           برای نسخه‌های رسمی، تگ همان شماره نسخه است: v2.0.0, v2.0.1, ...

Environment:
  CPANEL_OUT_DIR   پوشه مقصد (پیش‌فرض: $ROOT/cpanel-release)
  CPANEL_REPO      صاحب/نام مخزن (پیش‌فرض: از git remote origin خوانده می‌شود)
EOF
}

case "${1:-}" in -h|--help) usage; exit 0 ;; esac

for tool in curl mktemp; do
  command -v "$tool" >/dev/null 2>&1 || { printf 'ERROR: ابزار «%s» پیدا نشد.\n' "$tool" >&2; usage >&2; exit 1; }
done

TAG="${1:-latest-build}"
OUT="${CPANEL_OUT_DIR:-$ROOT/cpanel-release}"

REPO="${CPANEL_REPO:-}"
if [[ -z "$REPO" ]]; then
  REPO="$(git -C "$ROOT" remote get-url origin 2>/dev/null \
          | sed -E 's#^(git@github\.com:|https://github\.com/)##; s#\.git$##' || true)"
fi
REPO="${REPO:-diswebir/industrial-crm-project}"
if [[ "$REPO" != */* ]]; then
  printf 'ERROR: مخزن به شکل «owner/name» قابل تشخیص نیست؛ CPANEL_REPO را تنظیم کنید.\n' >&2
  exit 1
fi

# CPANEL_RELEASE_BASE برای آزمون یا استفاده از یک آینه داخلی؛ پیش‌فرض خودِ GitHub است.
BASE="${CPANEL_RELEASE_BASE:-https://github.com/$REPO/releases/download/$TAG}"
# دو فایل اصلی اجباری‌اند؛ بقیه ممکن است در Releaseهای قدیمی‌تر موجود نباشند.
REQUIRED=(cpanel-public.zip cpanel-private.zip)
OPTIONAL=(SHA256SUMS build-info.txt UPGRADE-GUIDE.fa.md COMMIT.txt REF.txt)

printf 'مخزن:  %s\nتگ:    %s\nمقصد:  %s\n\n' "$REPO" "$TAG" "$OUT"
mkdir -p -- "$OUT"
OUT="$(cd -- "$OUT" && pwd)"
# پاک‌سازی باقی‌مانده اجرای قبلی که نیمه‌کاره متوقف شده است.
rm -f -- "$OUT"/.download.* 2>/dev/null || true

LAST_ERROR=''
fetch() {
  # دانلود در فایل موقت و سپس جابه‌جایی اتمی؛ بسته سالم قبلی هرگز نیمه‌کاره نمی‌شود.
  local name="$1" tmp
  tmp="$(mktemp "$OUT/.download.XXXXXX")"
  LAST_ERROR="$(curl -fsSL --retry 3 --retry-delay 2 --connect-timeout 20 -o "$tmp" "$BASE/$name" 2>&1)" \
    && { chmod 0644 "$tmp"
         mv -f "$tmp" "$OUT/$name"
         printf '  ✔ %s (%s)\n' "$name" "$(du -h "$OUT/$name" | cut -f1)"
         return 0; }
  rm -f -- "$tmp"
  return 1
}

failed=()
echo 'در حال دانلود:'
for name in "${REQUIRED[@]}"; do
  fetch "$name" || failed+=("$name")
done
for name in "${OPTIONAL[@]}"; do
  fetch "$name" || printf '  – %s در این Release موجود نیست\n' "$name"
done

if [[ ${#failed[@]} -gt 0 ]]; then
  printf '\nERROR: دانلود ناموفق بود: %s\n' "${failed[*]}" >&2
  [[ -n "$LAST_ERROR" ]] && printf 'جزئیات: %s\n' "$LAST_ERROR" >&2
  printf 'احتمالاً Release با تگ «%s» وجود ندارد یا خصوصی است.\n' "$TAG" >&2
  printf 'فهرست Releaseها: https://github.com/%s/releases\n' "$REPO" >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1 && [[ -s "$OUT/SHA256SUMS" ]]; then
  echo
  echo 'راستی‌آزمایی اثر انگشت:'
  (cd -- "$OUT" && sha256sum -c SHA256SUMS) || {
    printf '\nERROR: اثر انگشت مطابقت نکرد؛ فایل‌ها را دوباره دانلود کنید.\n' >&2; exit 1; }
else
  printf '\nهشدار: sha256sum در دسترس نیست یا SHA256SUMS دانلود نشد؛ بسته راستی‌آزمایی نشد.\n' >&2
fi

printf '\nSUCCESS: %s\n' "$OUT"
ls -lh "$OUT"
cat <<EOF

گام بعدی (استقرار):
  1) cpanel-public.zip  → در پوشه وب هاست (public_html یا زیردامنه) باز شود
  2) cpanel-private.zip → بیرون از دسترس وب باز شود (مثلاً private_pro/project1/myc)
  3) آدرس پوشه خصوصی در public_html/private-path.php نوشته شود
  4) نصب تازه: https://دامنه/install.php   |   ارتقا: https://دامنه/update.php

بازبینی ساختار بسته (اختیاری):
  bash deploy/cpanel/verify-package.sh "$OUT"
EOF
