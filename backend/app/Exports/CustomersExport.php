<?php

namespace App\Exports;

use App\Models\Customer;
use Maatwebsite\Excel\Concerns\FromCollection;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithCustomValueBinder;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;
use PhpOffice\PhpSpreadsheet\Cell\Cell;
use PhpOffice\PhpSpreadsheet\Cell\DefaultValueBinder;
use PhpOffice\PhpSpreadsheet\Cell\StringValueBinder;

/**
 * خروجی جامع مشتریان (تسک ۶):
 *  - اطلاعات پایه مشتری
 *  - اطلاعات کامل دستگاه‌های تخصیص‌یافته: نام، کد، سریال، تعداد، شماره فاکتور، مبلغ فاکتور، وضعیت،
 *    تاریخ نصب و پایان گارانتی
 *  - کارشناس ثبت‌کننده (مالک پرونده)
 *
 * هر مشتریِ دارای چند دستگاه، به تعداد دستگاه‌ها ردیف دارد تا هیچ اطلاعاتی از دست نرود.
 * دامنه دسترسی (RBAC) از طریق آرایه allowedCustomerIds اعمال می‌شود.
 */
class CustomersExport implements FromCollection, WithHeadings, WithMapping, ShouldAutoSize, WithCustomValueBinder
{
    protected ?string $type;

    /** @var int[]|null null = دسترسی کامل */
    protected ?array $allowedCustomerIds;

    public function __construct(?string $type = null, ?array $allowedCustomerIds = null)
    {
        $this->type = $type;
        $this->allowedCustomerIds = $allowedCustomerIds;
    }

    /**
     * @return \Illuminate\Support\Collection<int, array{customer: Customer, device: \App\Models\CustomerPart|null}>
     */
    public function collection()
    {
        $query = Customer::query()
            ->with(['customerParts.part', 'creator:id,name'])
            ->latest();

        if ($this->type && in_array($this->type, ['potential', 'effective'], true)) {
            $query->where('customer_type', $this->type);
        }

        if ($this->allowedCustomerIds !== null) {
            if (empty($this->allowedCustomerIds)) {
                return collect();
            }
            $query->whereIn('id', $this->allowedCustomerIds);
        }

        $rows = collect();

        foreach ($query->get() as $customer) {
            $devices = $customer->customerParts;

            if ($devices->isEmpty()) {
                $rows->push(['customer' => $customer, 'device' => null]);
                continue;
            }

            foreach ($devices as $device) {
                $rows->push(['customer' => $customer, 'device' => $device]);
            }
        }

        return $rows;
    }

    public function headings(): array
    {
        return [
            'نوع مشتری',
            'نوع شخص',
            'نام',
            'نام خانوادگی',
            'نام شرکت',
            'کد ملی / شناسه ملی',
            'شماره همراه',
            'تلفن ثابت',
            'ایمیل',
            'استان',
            'شهر',
            'آدرس',
            'یادداشت',
            'کارشناس ثبت‌کننده',
            'تاریخ ثبت',
            'نام دستگاه',
            'کد دستگاه',
            'شماره سریال',
            'تعداد',
            'شماره فاکتور',
            'مبلغ فاکتور (تومان)',
            'وضعیت دستگاه',
            'تاریخ نصب / تحویل',
            'پایان گارانتی',
        ];
    }

    /**
     * @param  array{customer: Customer, device: \App\Models\CustomerPart|null}  $row
     */
    public function map($row): array
    {
        /** @var Customer $customer */
        $customer = $row['customer'];
        $device = $row['device'];

        return [
            $customer->customer_type === 'effective' ? 'بالفعل' : 'بالقوه',
            $customer->type === 'company' ? 'حقوقی' : 'حقیقی',
            (string) ($customer->first_name ?? ''),
            (string) ($customer->last_name ?? ''),
            (string) ($customer->company_name ?? ''),
            (string) ($customer->national_code ?? ''),
            (string) ($customer->mobile ?? ''),
            (string) ($customer->phone ?? ''),
            (string) ($customer->email ?? ''),
            (string) ($customer->province ?? ''),
            (string) ($customer->city ?? ''),
            (string) ($customer->address ?? ''),
            (string) ($customer->notes ?? ''),
            (string) ($customer->creator?->name ?? ''),
            $customer->created_at?->format('Y/m/d H:i') ?? '',

            $device?->part?->name ?? '',
            $device?->part?->code ?? '',
            (string) ($device?->serial_number ?? ''),
            $device ? (int) $device->quantity : '',
            (string) ($device?->invoice_number ?? ''),
            $device && $device->invoice_amount !== null ? (float) $device->invoice_amount : '',
            $device ? $this->deviceStatusLabel((string) $device->status) : '',
            $device?->installation_date?->format('Y/m/d') ?? '',
            $device?->warranty_expire_date?->format('Y/m/d') ?? '',
        ];
    }

    /**
     * فقط ستون‌های «تعداد» (S) و «مبلغ فاکتور» (U) عددی می‌مانند؛ بقیه رشته‌اند تا
     * صفر ابتدایی حذف نشود و متن‌هایی مثل «=...» به فرمول Excel تبدیل نشوند
     * (جلوگیری از Formula Injection در فایل خروجی).
     */
    public function bindValue(Cell $cell, $value)
    {
        if (in_array($cell->getColumn(), ['S', 'U'], true)) {
            return (new DefaultValueBinder())->bindValue($cell, $value);
        }

        return (new StringValueBinder())->bindValue($cell, $value);
    }

    protected function deviceStatusLabel(string $status): string
    {
        return match ($status) {
            'active' => 'فعال در محل مشتری',
            'under_repair' => 'در دست تعمیر',
            'replaced' => 'تعویض‌شده',
            'retired' => 'از رده خارج',
            default => $status,
        };
    }
}
