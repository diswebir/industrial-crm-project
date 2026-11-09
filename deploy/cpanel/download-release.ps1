<#
.SYNOPSIS
    دانلود بسته‌های آماده cPanel از GitHub Releases در پوشه cpanel-release (نسخه ویندوز/PowerShell).

.DESCRIPTION
    معادل PowerShell اسکریپت download-release.sh. چیزی نمی‌سازد؛ فقط بسته‌ای را
    می‌گیرد که GitHub Actions ساخته و آزمون کرده است، سپس اثر انگشت SHA256 را
    راستی‌آزمایی می‌کند.

.PARAMETER Tag
    نام تگ Release. پیش‌فرض «latest-build» = جدیدترین بیلد شاخه main.
    برای نسخه‌های رسمی: v2.0.0 , v2.0.1 , ...

.PARAMETER OutDir
    پوشه مقصد. پیش‌فرض: <ریشه مخزن>\cpanel-release

.PARAMETER Repo
    صاحب/نام مخزن. پیش‌فرض از git remote origin خوانده می‌شود.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File deploy\cpanel\download-release.ps1
    powershell -ExecutionPolicy Bypass -File deploy\cpanel\download-release.ps1 -Tag v2.0.1
#>
[CmdletBinding()]
param(
    [string]$Tag = 'latest-build',
    [string]$OutDir,
    [string]$Repo
)

$ErrorActionPreference = 'Stop'
# ویندوز قدیمی به‌صورت پیش‌فرض TLS 1.2 را فعال نمی‌کند؛ GitHub آن را الزامی می‌داند.
try {
    [Net.ServicePointManager]::SecurityProtocol =
        [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

if ($Tag -eq '-h' -or $Tag -eq '--help') {
    Get-Help $MyInvocation.MyCommand.Path -Detailed
    return
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root      = (Resolve-Path (Join-Path $scriptDir '..\..')).Path

if (-not $OutDir) { $OutDir = Join-Path $root 'cpanel-release' }

if (-not $Repo) {
    try {
        $remote = (git -C $root remote get-url origin 2>$null)
        if ($remote) {
            $Repo = $remote -replace '^(git@github\.com:|https://github\.com/)', '' -replace '\.git$', ''
        }
    } catch { }
}
if (-not $Repo) { $Repo = 'diswebir/industrial-crm-project' }
if ($Repo -notmatch '/') {
    throw "مخزن به شکل «owner/name» قابل تشخیص نیست؛ پارامتر Repo را مشخص کنید."
}

$base     = "https://github.com/$Repo/releases/download/$Tag"
$required = @('cpanel-public.zip', 'cpanel-private.zip')
$optional = @('SHA256SUMS', 'build-info.txt', 'UPGRADE-GUIDE.fa.md', 'COMMIT.txt', 'REF.txt')

Write-Host "مخزن:  $Repo"
Write-Host "تگ:    $Tag"
Write-Host "مقصد:  $OutDir`n"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$OutDir = (Resolve-Path $OutDir).Path

function Get-ReleaseFile {
    param([string]$Name, [switch]$Optional)
    $target = Join-Path $OutDir $Name
    $temp   = "$target.download.tmp"
    try {
        # در فایل موقت دانلود و سپس جابه‌جا می‌شود تا بسته سالم قبلی نیمه‌کاره نماند.
        Invoke-WebRequest -Uri "$base/$Name" -OutFile $temp -UseBasicParsing
        Move-Item -Force $temp $target
        $size = '{0:N1} MB' -f ((Get-Item $target).Length / 1MB)
        Write-Host "  [OK] $Name ($size)"
        return $true
    } catch {
        if (Test-Path $temp) { Remove-Item -Force $temp }
        if ($Optional) {
            Write-Host "  [--] $Name در این Release موجود نیست"
        } else {
            Write-Host "  [FAIL] $Name" -ForegroundColor Red
        }
        return $false
    }
}

Write-Host 'در حال دانلود:'
$failed = @()
foreach ($name in $required) {
    if (-not (Get-ReleaseFile -Name $name)) { $failed += $name }
}
foreach ($name in $optional) {
    Get-ReleaseFile -Name $name -Optional | Out-Null
}

if ($failed.Count -gt 0) {
    Write-Host ''
    Write-Host "ERROR: دانلود ناموفق بود: $($failed -join ', ')" -ForegroundColor Red
    Write-Host "احتمالاً Release با تگ «$Tag» وجود ندارد یا مخزن خصوصی است."
    Write-Host "فهرست Releaseها: https://github.com/$Repo/releases"
    exit 1
}

$sums = Join-Path $OutDir 'SHA256SUMS'
Write-Host ''
if (Test-Path $sums) {
    Write-Host 'راستی‌آزمایی اثر انگشت:'
    $mismatch = $false
    Get-Content $sums | ForEach-Object {
        if ($_ -match '^\s*([0-9a-fA-F]{64})\s+(\S+)\s*$') {
            $expected = $Matches[1].ToLowerInvariant()
            $file     = Join-Path $OutDir $Matches[2]
            if (-not (Test-Path $file)) {
                Write-Host "  [FAIL] $($Matches[2]) — فایل موجود نیست" -ForegroundColor Red
                $mismatch = $true
                return
            }
            $actual = (Get-FileHash -Algorithm SHA256 -Path $file).Hash.ToLowerInvariant()
            if ($actual -eq $expected) {
                Write-Host "  [OK] $($Matches[2]): $actual"
            } else {
                Write-Host "  [FAIL] $($Matches[2])" -ForegroundColor Red
                Write-Host "         انتظار: $expected"
                Write-Host "         واقعی:  $actual"
                $mismatch = $true
            }
        }
    }
    if ($mismatch) {
        Write-Host "`nERROR: اثر انگشت مطابقت نکرد؛ فایل‌ها را دوباره دانلود کنید." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host 'هشدار: SHA256SUMS دانلود نشد؛ بسته راستی‌آزمایی نشد.' -ForegroundColor Yellow
}

Write-Host "`nSUCCESS: $OutDir"
Get-ChildItem $OutDir | Select-Object Name, @{n = 'Size'; e = { '{0:N1} MB' -f ($_.Length / 1MB) }} | Format-Table -AutoSize

Write-Host @'

گام بعدی (استقرار):
  1) cpanel-public.zip  -> در پوشه وب هاست (public_html یا زیردامنه) باز شود
  2) cpanel-private.zip -> بیرون از دسترس وب باز شود (مثلا private_pro/project1/myc)
  3) آدرس پوشه خصوصی در public_html\private-path.php نوشته شود
  4) نصب تازه: https://دامنه/install.php   |   ارتقا: https://دامنه/update.php
'@
