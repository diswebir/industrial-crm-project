<?php

namespace App\Imports;

use App\Models\Customer;
use Illuminate\Support\Facades\DB;
use Maatwebsite\Excel\Concerns\SkipsEmptyRows;
use Maatwebsite\Excel\Concerns\ToArray;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  ورود گروهی مشتریان از اکسل (v2.0.0)
 *
 *  تغییرات نسبت به نسخه قبل:
 *   ۱) شناسایی ستون‌ها بر اساس «متن سرستون فارسی یا انگلیسی» و در نبود سرستون،
 *      بر اساس ترتیب ستون‌های فایل نمونه (پیش از این به slug شدن سرستون‌های
 *      فارسی وابسته بود و عملاً کار نمی‌کرد).
 *   ۲) شماره همراه دیگر اجباری نیست (تسک ۵)؛ کلید یکتاسازی به ترتیب:
 *      موبایل → کد ملی/شناسه ملی → نام شرکت → نام و نام خانوادگی.
 *   ۳) مشتری حقوقی بدون نام شخص و فقط با نام شرکت قابل ورود است.
 *   ۴) ثبت «ثبت‌کننده» (created_by_user_id) فقط برای رکوردهای جدید.
 *   ۵) هر ردیف داخل Transaction مستقل تا یک خطا، کل فایل را خراب نکند.
 * ─────────────────────────────────────────────────────────────────────────────
 */
class CustomersImport implements ToArray, SkipsEmptyRows
{
    private int $importedCount = 0;
    private int $createdCount = 0;
    private int $updatedCount = 0;

    /** @var array<int, string> */
    private array $errors = [];

    /** @var array<int, string> */
    private array $warnings = [];

    /**
     * نگاشت برچسب سرستون (نرمال‌شده) → کلید فیلد.
     *
     * @var array<string, string>
     */
    private const HEADER_MAP = [
        'نوع مشتری' => 'customer_type',
        'وضعیت مشتری' => 'customer_type',
        'customer type' => 'customer_type',
        'customer_type' => 'customer_type',
        'نوع شخص' => 'type',
        'نوع شخصیت' => 'type',
        'person type' => 'type',
        'person_type' => 'type',
        'نام شرکت کارگاه' => 'company_name',
        'نام شرکت' => 'company_name',
        'نام سازمان' => 'company_name',
        'company name' => 'company_name',
        'company_name' => 'company_name',
        'company' => 'company_name',
        'نام خانوادگی' => 'last_name',
        'نام خانوادگي' => 'last_name',
        'last name' => 'last_name',
        'last_name' => 'last_name',
        'family' => 'last_name',
        'نام' => 'first_name',
        'first name' => 'first_name',
        'first_name' => 'first_name',
        'firstname' => 'first_name',
        'کد ملی شناسه ملی' => 'national_code',
        'کد ملی' => 'national_code',
        'شناسه ملی' => 'national_code',
        'national code' => 'national_code',
        'national_code' => 'national_code',
        'شماره همراه' => 'mobile',
        'موبایل' => 'mobile',
        'همراه' => 'mobile',
        'mobile' => 'mobile',
        'cellphone' => 'mobile',
        'تلفن ثابت' => 'phone',
        'تلفن' => 'phone',
        'phone' => 'phone',
        'telephone' => 'phone',
        'ایمیل' => 'email',
        'ايميل' => 'email',
        'email' => 'email',
        'mail' => 'email',
        'استان' => 'province',
        'province' => 'province',
        'شهر' => 'city',
        'city' => 'city',
        'آدرس' => 'address',
        'ادرس' => 'address',
        'address' => 'address',
        'یادداشت' => 'notes',
        'توضیحات' => 'notes',
        'notes' => 'notes',
        'راهنما' => '_ignored',
    ];

    /** ترتیب ستون‌های فایل نمونه، برای فایل‌های بدون سرستون. */
    private const POSITIONAL = [
        'customer_type', 'type', 'first_name', 'last_name', 'company_name',
        'national_code', 'mobile', 'phone', 'email', 'province', 'city', 'address', 'notes',
    ];

    public function __construct(private ?int $userId = null)
    {
    }

    /**
     * @param  array<int, array<int, mixed>>  $rows
     */
    public function array(array $rows): void
    {
        $rows = array_values(array_filter($rows, fn ($row) => $this->rowHasValue($row)));

        if (empty($rows)) {
            $this->errors[] = 'فایل ارسال‌شده هیچ ردیف قابل استفاده‌ای ندارد.';

            return;
        }

        $columnMap = $this->detectColumns($rows[0]);
        $hasHeader = $columnMap['is_header'];
        $map = $columnMap['map'];

        $dataRows = $hasHeader ? array_slice($rows, 1) : $rows;
        $rowNumber = $hasHeader ? 2 : 1;

        foreach ($dataRows as $row) {
            $this->handleRow($row, $map, $rowNumber);
            $rowNumber++;
        }
    }

    public function getImportedCount(): int
    {
        return $this->importedCount;
    }

    public function getCreatedCount(): int
    {
        return $this->createdCount;
    }

    public function getUpdatedCount(): int
    {
        return $this->updatedCount;
    }

    /**
     * @return array<int, string>
     */
    public function getErrors(): array
    {
        return $this->errors;
    }

    /**
     * @return array<int, string>
     */
    public function getWarnings(): array
    {
        return $this->warnings;
    }

    /* ───────────────────────────────── پردازش هر ردیف ───────────────────────────────── */

    /**
     * @param  array<int, mixed>  $row
     * @param  array<int, string>  $map
     */
    private function handleRow(array $row, array $map, int $rowNumber): void
    {
        $data = [];
        foreach ($map as $index => $field) {
            if ($field === '_ignored') {
                continue;
            }
            $data[$field] = trim((string) ($row[$index] ?? ''));
        }

        $personTypeRaw = $this->normalizeText($data['type'] ?? '');
        $companyName = $data['company_name'] ?? '';
        $firstName = $data['first_name'] ?? '';
        $lastName = $data['last_name'] ?? '';

        $isCompany = str_contains($personTypeRaw, 'حقوقی')
            || str_contains($personTypeRaw, 'company')
            || ($companyName !== '' && $firstName === '' && $lastName === '');

        $mobile = $this->normalizeDigits($data['mobile'] ?? '');
        $nationalCode = $this->normalizeDigits($data['national_code'] ?? '');
        $phone = $this->normalizeDigits($data['phone'] ?? '');

        // ── اعتبارسنجی سازگار با فرم ثبت مشتری (تسک ۵) ──
        if ($isCompany) {
            if ($companyName === '') {
                $this->errors[] = "ردیف {$rowNumber}: برای مشتری حقوقی، وارد کردن «نام شرکت» الزامی است.";

                return;
            }
        } elseif ($firstName === '' || $lastName === '') {
            $this->errors[] = "ردیف {$rowNumber}: برای مشتری حقیقی، «نام» و «نام خانوادگی» الزامی است.";

            return;
        }

        if ($mobile !== '' && !preg_match('/^09\d{9}$/', $mobile)) {
            $this->errors[] = "ردیف {$rowNumber}: شماره همراه «{$mobile}» نامعتبر است (باید ۱۱ رقم و با 09 شروع شود).";

            return;
        }

        if ($phone !== '' && !preg_match('/^0\d{10}$/', $phone)) {
            $this->warnings[] = "ردیف {$rowNumber}: تلفن ثابت «{$phone}» با قالب استاندارد مطابقت ندارد؛ همان‌طور ذخیره شد.";
        }

        $expectedNationalLength = $isCompany ? 11 : 10;
        if ($nationalCode !== '' && !preg_match('/^\d{' . $expectedNationalLength . '}$/', $nationalCode)) {
            $this->warnings[] = "ردیف {$rowNumber}: کد ملی/شناسه ملی «{$nationalCode}» باید {$expectedNationalLength} رقم باشد؛ همان‌طور ذخیره شد.";
        }

        $email = strtolower(trim($data['email'] ?? ''));

        $customerType = 'potential';
        $typeRaw = $this->normalizeText($data['customer_type'] ?? '');
        if (str_contains($typeRaw, 'بالفعل') || str_contains($typeRaw, 'effective')) {
            $customerType = 'effective';
        }

        $attributes = [
            'customer_type' => $customerType,
            'type' => $isCompany ? 'company' : 'individual',
            'first_name' => $firstName !== '' ? $firstName : null,
            'last_name' => $lastName !== '' ? $lastName : null,
            'company_name' => $companyName !== '' ? $companyName : null,
            'national_code' => $nationalCode !== '' ? $nationalCode : null,
            'mobile' => $mobile !== '' ? $mobile : null,
            'phone' => $phone !== '' ? $phone : null,
            'email' => filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : null,
            'province' => ($data['province'] ?? '') !== '' ? $data['province'] : null,
            'city' => ($data['city'] ?? '') !== '' ? $data['city'] : null,
            'address' => ($data['address'] ?? '') !== '' ? $data['address'] : null,
            'notes' => ($data['notes'] ?? '') !== '' ? $data['notes'] : null,
        ];

        try {
            DB::transaction(function () use ($attributes, $mobile, $nationalCode, $isCompany, $rowNumber) {
                $existing = $this->findExisting($attributes, $mobile, $nationalCode, $isCompany);

                if ($existing) {
                    $existing->fill($attributes)->save();
                    $this->updatedCount++;
                    $this->importedCount++;

                    return;
                }

                $customer = new Customer($attributes);
                $customer->created_by_user_id = $this->userId;
                $customer->save();

                $customer->histories()->create([
                    'user_id' => $this->userId,
                    'action' => 'created',
                    'description' => "مشتری «{$customer->full_name}» از طریق ورود گروهی اکسل ثبت شد.",
                    'metadata' => ['source' => 'excel_import'],
                ]);

                $this->createdCount++;
                $this->importedCount++;
            });
        } catch (\Throwable $e) {
            $this->errors[] = "ردیف {$rowNumber}: ثبت ناموفق بود — " . $e->getMessage();
        }
    }

    /**
     * یافتن رکورد موجود با کلید یکتای اولویت‌دار (برای جلوگیری از ورود تکراری).
     *
     * @param  array<string, mixed>  $attributes
     */
    private function findExisting(array $attributes, string $mobile, string $nationalCode, bool $isCompany): ?Customer
    {
        if ($mobile !== '') {
            $found = Customer::where('mobile', $mobile)->first();
            if ($found) {
                return $found;
            }
        }

        if ($nationalCode !== '') {
            $found = Customer::where('national_code', $nationalCode)->first();
            if ($found) {
                return $found;
            }
        }

        if ($isCompany && !empty($attributes['company_name'])) {
            return Customer::where('type', 'company')
                ->where('company_name', $attributes['company_name'])
                ->first();
        }

        if (!empty($attributes['first_name']) && !empty($attributes['last_name'])) {
            return Customer::where('first_name', $attributes['first_name'])
                ->where('last_name', $attributes['last_name'])
                ->when($mobile === '', fn ($q) => $q->whereNull('mobile'))
                ->first();
        }

        return null;
    }

    /* ───────────────────────────────── شناسایی ستون‌ها ───────────────────────────────── */

    /**
     * @param  array<int, mixed>  $headerRow
     * @return array{is_header: bool, map: array<int, string>}
     */
    private function detectColumns(array $headerRow): array
    {
        $map = [];
        $matched = 0;

        foreach ($headerRow as $index => $cell) {
            $field = $this->matchHeader((string) $cell);
            if ($field !== null) {
                $map[(int) $index] = $field;
                if ($field !== '_ignored') {
                    $matched++;
                }
            }
        }

        if ($matched >= 3) {
            return ['is_header' => true, 'map' => $map];
        }

        // فایل بدون سرستون → ترتیب ستون‌های فایل نمونه
        $positional = [];
        foreach (self::POSITIONAL as $index => $field) {
            $positional[$index] = $field;
        }

        return ['is_header' => false, 'map' => $positional];
    }

    private function matchHeader(string $cell): ?string
    {
        $normalized = $this->normalizeText($cell);

        if ($normalized === '') {
            return '_ignored';
        }

        if (isset(self::HEADER_MAP[$normalized])) {
            return self::HEADER_MAP[$normalized];
        }

        // تطبیق بر اساس شروع متن با بلندترین برچسب ممکن (مثلاً «نام شرکت / کارگاه»)
        $candidates = array_keys(self::HEADER_MAP);
        usort($candidates, fn ($a, $b) => mb_strlen($b) <=> mb_strlen($a));

        foreach ($candidates as $candidate) {
            if (mb_strpos($normalized, $candidate) === 0) {
                return self::HEADER_MAP[$candidate];
            }
        }

        return '_ignored';
    }

    /* ───────────────────────────────── نرمال‌سازی مقادیر ───────────────────────────────── */

    private function normalizeText(string $value): string
    {
        $value = str_replace(["\u{200C}", "\u{200D}", "\u{200E}", "\u{200F}", "\u{00A0}"], ' ', $value);
        $value = str_replace(['ي', 'ك', 'ة'], ['ی', 'ک', 'ه'], $value);
        $value = str_replace(['/', '\\', '(', ')', '،', ',', '-', '_', '«', '»', '"', "'"], ' ', $value);
        $value = preg_replace('/\s+/u', ' ', $value) ?? $value;

        return mb_strtolower(trim($value));
    }

    private function normalizeDigits(string $value): string
    {
        $persian = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
        $arabic = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
        $latin = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

        $value = str_replace($persian, $latin, $value);
        $value = str_replace($arabic, $latin, $value);
        $value = preg_replace('/[^\d]/', '', $value) ?? '';

        // شماره‌هایی که با کد کشور ذخیره شده‌اند (۹۸۹۱۲۱۲۳۴۵۶۷ → ۰۹۱۲۱۲۳۴۵۶۷)
        if (str_starts_with($value, '0098')) {
            $value = substr($value, 4);
        } elseif (str_starts_with($value, '98') && strlen($value) === 12) {
            $value = substr($value, 2);
        }

        if (str_starts_with($value, '9') && strlen($value) === 10) {
            $value = '0' . $value;
        }

        return $value;
    }

    /**
     * @param  array<int, mixed>  $row
     */
    private function rowHasValue(array $row): bool
    {
        foreach ($row as $cell) {
            if ($cell !== null && trim((string) $cell) !== '') {
                return true;
            }
        }

        return false;
    }
}
