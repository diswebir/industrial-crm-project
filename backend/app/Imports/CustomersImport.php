<?php

namespace App\Imports;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Maatwebsite\Excel\Concerns\SkipsEmptyRows;
use Maatwebsite\Excel\Concerns\ToModel;
use Maatwebsite\Excel\Concerns\WithHeadingRow;

class CustomersImport implements ToModel, WithHeadingRow, SkipsEmptyRows
{
    private int $importedCount = 0;
    private array $errors = [];

    public function __construct(private User $user)
    {
    }

    public function model(array $row)
    {
        $customerTypeRaw = $this->getValue($row, ['noaa_mshtry', 'noe_mshtry', 'customer_type', 'type_customer', 'noe_moshtari']);
        $personTypeRaw = $this->getValue($row, ['noaa_shkhs', 'noe_shkhs', 'person_type', 'type', 'noe_shakhs']);
        $firstName = $this->getValue($row, ['nam', 'first_name', 'firstname', 'name']);
        $lastName = $this->getValue($row, ['nam_khanoadgy', 'last_name', 'lastname', 'family']);
        $companyName = $this->getValue($row, ['nam_shrkt', 'company_name', 'company', 'sherkat']);
        $nationalCode = $this->normalizeDigits($this->getValue($row, ['kd_mly_shnash_mly', 'national_code', 'codemelli', 'shenaseh']));
        $mobile = $this->normalizeDigits($this->getValue($row, ['shmarh_hmrah', 'mobile', 'cellphone', 'phone_number']));
        $phone = $this->normalizeDigits($this->getValue($row, ['tlfn_thabt', 'phone', 'telephone']));
        $email = strtolower(trim($this->getValue($row, ['aymyl', 'email', 'mail'])));
        $province = $this->getValue($row, ['astan', 'province', 'ostan']);
        $city = $this->getValue($row, ['shhr', 'city', 'shahr']);
        $address = $this->getValue($row, ['adrs', 'address']);
        $notes = $this->getValue($row, ['yaddasht', 'notes', 'description']);
        $customerType = str_contains($customerTypeRaw, 'بالفعل') || strtolower($customerTypeRaw) === 'effective' ? 'effective' : 'potential';
        $personType = match (true) {
            str_contains($personTypeRaw, 'حقوقی'), strtolower($personTypeRaw) === 'company' => 'company',
            str_contains($personTypeRaw, 'حقیقی'), strtolower($personTypeRaw) === 'individual' => 'individual',
            default => $companyName !== '' ? 'company' : 'individual',
        };

        if (($personType === 'individual' && ($firstName === '' || $lastName === '')) || ($personType === 'company' && $companyName === '')) {
            $this->errors[] = 'سطر فاقد نام شخص حقیقی یا نام شرکت نادیده گرفته شد.';
            return null;
        }
        if ($mobile !== '' && !preg_match('/^09\\d{9}$/', $mobile)) {
            $this->errors[] = "شماره همراه «{$mobile}» نامعتبر است.";
            return null;
        }
        $matches = $mobile !== '' ? Customer::where('mobile', $mobile)->limit(2)->get() : collect();
        if ($matches->count() > 1) {
            $this->errors[] = 'شماره همراه در چند پرونده وجود دارد؛ سطر وارد نشد.';
            return null;
        }
        $existing = $matches->first();
        if ($existing && !Customer::visibleTo($this->user)->whereKey($existing->id)->exists()) {
            $this->errors[] = 'یک سطر به دلیل نداشتن دسترسی به مشتری موجود وارد نشد.';
            return null;
        }

        $values = [
            'customer_type' => $customerType, 'type' => $personType,
            'first_name' => $firstName ?: null, 'last_name' => $lastName ?: null,
            'company_name' => $companyName ?: null, 'national_code' => $nationalCode ?: null,
            'mobile' => $mobile ?: null, 'phone' => $phone ?: null,
            'email' => filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : null,
            'province' => $province ?: null, 'city' => $city ?: null,
            'address' => $address ?: null, 'notes' => $notes ?: null,
        ];
        $customer = DB::transaction(function () use ($existing, $values, $customerTypeRaw, $personTypeRaw): Customer {
            if ($existing) {
                // Recheck access under the customer lock, and never erase existing
                // information merely because an import cell was blank.
                $customer = Customer::visibleTo($this->user)->whereKey($existing->id)->lockForUpdate()->first();
                if (!$customer) {
                    throw ValidationException::withMessages(['file' => ['دسترسی به یکی از مشتریان در هنگام ورود تغییر کرد.']]);
                }
                $updates = array_filter($values, fn ($value) => $value !== null);
                if ($customerTypeRaw === '') unset($updates['customer_type']);
                if ($personTypeRaw === '') unset($updates['type']);
                $customer->update($updates);
                $action = 'updated';
            } else {
                $customer = Customer::create($values + ['created_by_user_id' => $this->user->id]);
                $action = 'created';
            }
            $customer->histories()->create([
                'user_id' => $this->user->id,
                'action' => $action,
                'description' => 'پرونده مشتری از طریق ورود گروهی ثبت یا ویرایش شد.',
            ]);
            return $customer;
        }, 3);
        $this->importedCount++;
        return $customer;
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
        foreach ($row as $k => $v) {
            $cleanedKey = strtolower(preg_replace('/[^a-zA-Z0-9_]/', '', (string) $k));
            foreach ($keys as $candidate) {
                if ($cleanedKey === $candidate) {
                    return trim((string) $v);
                }
            }
        }
        return '';
    }

    private function normalizeDigits(string $str): string
    {
        $persian = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
        $arabic = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
        $latin = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        $num = preg_replace('/[^\\d]/', '', str_replace($arabic, $latin, str_replace($persian, $latin, $str)));
        if (str_starts_with($num, '989')) {
            $num = '0' . substr($num, 2);
        }
        return $num;
    }
}
