<?php

namespace App\Exports;

use App\Models\User;
use Maatwebsite\Excel\Concerns\WithMultipleSheets;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  v2.0.0 — تسک ۶: خروجی اکسل کامل مشتریان
 *
 *  فایل خروجی شامل دو شیت است:
 *    ۱) «مشتریان»                 → اطلاعات پایه + خلاصه دستگاه‌های تخصیص‌یافته
 *    ۲) «دستگاه‌های تخصیص‌یافته»  → یک ردیف برای هر تخصیص (سریال، تعداد، فاکتور)
 *
 *  خروجی دقیقاً به همان دامنه دسترسی کاربر محدود می‌شود (تسک ۱).
 *  قالب xlsx ذاتاً UTF-8 است و کاراکترهای فارسی در Excel به‌هم نمی‌ریزد.
 * ─────────────────────────────────────────────────────────────────────────────
 */
class CustomersExport implements WithMultipleSheets
{
    public function __construct(protected ?string $type = null, protected ?User $user = null)
    {
    }

    /**
     * @return array<int|string, \Maatwebsite\Excel\Concerns\Exportable>
     */
    public function sheets(): array
    {
        return [
            'مشتریان' => new CustomersSheet($this->type, $this->user),
            'دستگاه‌های تخصیص‌یافته' => new CustomerDevicesSheet($this->type, $this->user),
        ];
    }
}
