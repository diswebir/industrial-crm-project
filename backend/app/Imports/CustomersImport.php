<?php

namespace App\Imports;

use App\Models\Customer;
use Maatwebsite\Excel\Concerns\SkipsEmptyRows;
use Maatwebsite\Excel\Concerns\ToModel;
use Maatwebsite\Excel\Concerns\WithHeadingRow;

class CustomersImport implements ToModel, WithHeadingRow, SkipsEmptyRows
{
    private int $importedCount = 0;
    private array $errors = [];
    private ?int $creatorUserId = null;

    /** آیا کاربر مجاز است پرونده مشتریان سایر کارشناسان را به‌روزرسانی کند؟ */
    private bool $canUpdateAnyCustomer = true;

    /** شناسه مشتریان قابل مشاهده برای کاربر محدود؛ null = دسترسی کامل. */
    private ?array $visibleCustomerIds = null;

    /** ثبت‌کننده مشتریان واردشده (مالکیت پرونده برای RBAC). */
    public function setCreatorUserId(?int $userId): void
    {
        $this->creatorUserId = $userId;
    }

    /**
     * کاربران با دامنه دسترسی محدود نباید بتوانند از طریق ایمپورت، مشتری
     * کارشناسان دیگر را بازنویسی کنند (تسک ۱).
     */
    public function setCanUpdateAnyCustomer(bool $canUpdateAny): void
    {
        $this->canUpdateAnyCustomer = $canUpdateAny;
    }

    /**
     * @param  int[]|null  $customerIds  null یعنی کاربر دسترسی کامل دارد.
     */
    public function setVisibleCustomerIds(?array $customerIds): void
    {
        $this->visibleCustomerIds = $customerIds;
    }

    public function model(array $row)
    {
        // Find values using multiple possible alias keys
        $customerTypeRaw = $this->getValue($row, ['noe_mshtry', 'customer_type', 'type_customer', 'noe_moshtari']);
        $personTypeRaw   = $this->getValue($row, ['noe_shkhs', 'person_type', 'type', 'noe_shakhs']);
        $firstName       = $this->getValue($row, ['nam', 'first_name', 'firstname', 'name']);
        $lastName        = $this->getValue($row, ['nam_khanoadgy', 'last_name', 'lastname', 'family']);
        $companyName     = $this->getValue($row, ['nam_shrkt', 'company_name', 'company', 'sherkat']);
        $nationalCode    = $this->normalizeDigits($this->getValue($row, ['kd_mly_shnash_mly', 'national_code', 'codemelli', 'shenaseh']));
        $mobile          = $this->normalizeDigits($this->getValue($row, ['shmarh_hmrah', 'mobile', 'cellphone', 'phone_number']));
        $phone           = $this->normalizeDigits($this->getValue($row, ['tlfn_thabt', 'phone', 'telephone']));
        $email           = strtolower(trim($this->getValue($row, ['aymyl', 'email', 'mail'])));
        $province        = $this->getValue($row, ['astan', 'province', 'ostan']);
        $city            = $this->getValue($row, ['shhr', 'city', 'shahr']);
        $address         = $this->getValue($row, ['adrs', 'address']);
        $notes           = $this->getValue($row, ['yaddasht', 'notes', 'description']);

        // Determine person type first (اعتبارسنجی نام به نوع شخصیت وابسته است)
        $personType = 'individual';
        if (str_contains($personTypeRaw, 'حقوقی') || strtolower($personTypeRaw) === 'company' || (! empty($companyName) && empty($firstName) && empty($lastName))) {
            $personType = 'company';
        }

        if ($personType === 'company') {
            if (empty($companyName)) {
                $this->errors[] = "سطر مربوط به شخص حقوقی فاقد «نام شرکت» است (موبایل: {$mobile})";
                return null;
            }
        } elseif (empty($firstName) && empty($lastName)) {
            $this->errors[] = "سطر فاقد نام یا نام‌خانوادگی نادیده گرفته شد (موبایل: {$mobile})";
            return null;
        }

        // شماره همراه اختیاری است (تسک ۵) اما اگر وارد شد باید معتبر باشد.
        if ($mobile !== '' && ! preg_match('/^09\d{9}$/', $mobile)) {
            $this->errors[] = "شماره همراه «{$mobile}» نامعتبر است (نام: {$firstName} {$lastName})";
            return null;
        }

        // تلفن ثابت هم مانند فرم سامانه اعتبارسنجی می‌شود تا داده معیوب وارد نشود.
        if ($phone !== '' && ! preg_match('/^0\d{7,10}$/', $phone)) {
            $this->errors[] = "تلفن ثابت «{$phone}» نامعتبر است (نام: {$firstName} {$lastName})";
            return null;
        }

        // کد ملی حقیقی = ۱۰ رقم، شناسه ملی حقوقی = ۱۱ رقم. برای سازگاری با
        // پرونده‌های قدیمی، هر دو طول پذیرفته می‌شوند اما طول‌های دیگر رد می‌شوند.
        if ($nationalCode !== '' && ! in_array(strlen($nationalCode), [10, 11], true)) {
            $this->errors[] = "کد/شناسه ملی «{$nationalCode}» باید ۱۰ یا ۱۱ رقم باشد (نام: {$firstName} {$lastName})";
            return null;
        }

        $emailIsValid = $email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
        if ($email !== '' && ! $emailIsValid) {
            $this->errors[] = "ایمیل «{$email}» نامعتبر است و خالی ثبت شد (نام: {$firstName} {$lastName})";
        }

        // Determine customer type
        $customerType = 'potential';
        if (str_contains($customerTypeRaw, 'بالفعل') || strtolower($customerTypeRaw) === 'effective') {
            $customerType = 'effective';
        }

        // کلید تطبیق رکورد: موبایل → کد ملی/شناسه ملی → نام شرکت یا نام و نام خانوادگی
        $matchKey = [];
        if ($mobile !== '') {
            $matchKey = ['mobile' => $mobile];
        } elseif ($nationalCode !== '') {
            $matchKey = ['national_code' => $nationalCode];
        } elseif ($personType === 'company') {
            $matchKey = ['company_name' => $companyName];
        } else {
            $matchKey = ['first_name' => $firstName, 'last_name' => $lastName];
        }

        $existing = Customer::where($matchKey)->first();

        if ($existing && ! $this->canUpdateAnyCustomer) {
            $canSeeExisting = $this->visibleCustomerIds !== null
                ? in_array((int) $existing->id, $this->visibleCustomerIds, true)
                : ($existing->created_by !== null
                    && $this->creatorUserId !== null
                    && (int) $existing->created_by === (int) $this->creatorUserId);

            if (! $canSeeExisting) {
                $this->errors[] = "سطر مربوط به مشتری «{$existing->full_name}» خارج از دامنه دسترسی شماست و به‌روزرسانی نشد.";
                return null;
            }
        }

        $this->importedCount++;

        $attributes = [
            'customer_type' => $customerType,
            'type' => $personType,
            'first_name' => $firstName ?: null,
            'last_name' => $lastName ?: null,
            'company_name' => $companyName ?: null,
            'national_code' => $nationalCode ?: null,
            'mobile' => $mobile ?: null,
            'phone' => $phone ?: null,
            'email' => $emailIsValid ? $email : null,
            'province' => $province ?: null,
            'city' => $city ?: null,
            'address' => $address ?: null,
            'notes' => $notes ?: null,
        ];

        // مالکیت پرونده فقط برای رکورد جدید (یا رکورد بدون مالک) تنظیم می‌شود تا مالکیت موجود تغییر نکند.
        if ($this->creatorUserId && (! $existing || $existing->created_by === null)) {
            $attributes['created_by'] = $this->creatorUserId;
        }

        if ($existing) {
            $existing->update($attributes);

            return $existing;
        }

        return Customer::create($attributes);
    }

    public function getImportedCount(): int
    {
        return $this->importedCount;
    }

    public function getErrors(): array
    {
        return $this->errors;
    }

    private function getValue(array $row, array $keys): string
    {
        $cleaned = [];
        foreach ($row as $k => $v) {
            $cleanedKey = strtolower((string) preg_replace('/[^a-zA-Z0-9_]/', '', (string) $k));
            $cleaned[$cleanedKey] = trim((string) $v);
        }

        // ابتدا تطبیق دقیق؛ تطبیق جزئی (contains) فقط در مرحله دوم انجام می‌شود تا
        // ستون «نام شرکت» با ستون «نام» اشتباه گرفته نشود.
        foreach ($keys as $candidate) {
            if (array_key_exists($candidate, $cleaned)) {
                return $cleaned[$candidate];
            }
        }

        foreach ($keys as $candidate) {
            foreach ($cleaned as $cleanedKey => $value) {
                if (str_contains($cleanedKey, $candidate)) {
                    return $value;
                }
            }
        }

        return '';
    }

    private function normalizeDigits(string $str): string
    {
        $persian = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
        $arabic  = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
        $latin   = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

        $num = str_replace($persian, $latin, $str);
        $num = str_replace($arabic, $latin, $num);
        $num = preg_replace('/[^\d]/', '', $num);

        if (str_starts_with($num, '00989')) {
            $num = '0' . substr($num, 4);
        } elseif (str_starts_with($num, '989')) {
            $num = '0' . substr($num, 2);
        }

        return (string) $num;
    }
}
