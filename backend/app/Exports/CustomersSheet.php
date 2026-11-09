<?php

namespace App\Exports;

use App\Models\Customer;
use App\Models\User;
use Maatwebsite\Excel\Concerns\FromQuery;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithEvents;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;
use Maatwebsite\Excel\Concerns\WithStyles;
use Maatwebsite\Excel\Events\AfterSheet;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/**
 * شیت اول: اطلاعات کامل مشتریان به‌همراه خلاصه دستگاه‌های تخصیص‌یافته.
 */
class CustomersSheet implements FromQuery, WithEvents, WithHeadings, WithMapping, ShouldAutoSize, WithStyles
{
    public function __construct(protected ?string $type = null, protected ?User $user = null)
    {
    }

    public function query()
    {
        return Customer::query()
            ->visibleTo($this->user)
            ->with(['createdBy:id,name', 'customerParts.part:id,name,code'])
            ->when(
                $this->type && in_array($this->type, ['potential', 'effective'], true),
                fn ($q) => $q->where('customer_type', $this->type)
            )
            ->orderBy('id');
    }

    public function headings(): array
    {
        return [
            'شناسه',
            'نوع مشتری',
            'نوع شخصیت',
            'نام',
            'نام خانوادگی',
            'نام شرکت / کارگاه',
            'کد ملی / شناسه ملی',
            'شماره همراه',
            'تلفن ثابت',
            'ایمیل',
            'استان',
            'شهر',
            'آدرس',
            'یادداشت',
            'ثبت‌کننده (کارمند)',
            'تعداد ردیف‌های دستگاه تخصیص‌یافته',
            'مجموع تعداد دستگاه‌ها',
            'نام دستگاه‌ها',
            'کد دستگاه‌ها',
            'شماره‌های سریال',
            'شماره‌های فاکتور',
            'جمع مبلغ فاکتورها (تومان)',
            'تاریخ ثبت',
        ];
    }

    /**
     * @param  Customer  $customer
     */
    public function map($customer): array
    {
        $parts = $customer->customerParts ?? collect();

        $deviceNames = $parts->map(fn ($cp) => $cp->part?->name)->filter()->unique()->implode(' ، ');
        $deviceCodes = $parts->map(fn ($cp) => $cp->part?->code)->filter()->unique()->implode(' ، ');
        $serials = $parts->map(fn ($cp) => $cp->serial_number)->filter()->implode(' ، ');
        $invoices = $parts->map(fn ($cp) => $cp->invoice_number)->filter()->unique()->implode(' ، ');
        $totalAmount = (float) $parts->sum(fn ($cp) => (float) ($cp->invoice_amount ?? 0));
        $totalQuantity = (int) $parts->sum(fn ($cp) => (int) ($cp->quantity ?? 1));

        return [
            (int) $customer->id,
            $customer->customer_type === 'effective' ? 'بالفعل' : 'بالقوه',
            $customer->type === 'company' ? 'حقوقی' : 'حقیقی',
            (string) $customer->first_name,
            (string) $customer->last_name,
            (string) $customer->company_name,
            (string) $customer->national_code,
            (string) $customer->mobile,
            (string) $customer->phone,
            (string) $customer->email,
            (string) $customer->province,
            (string) $customer->city,
            (string) $customer->address,
            (string) $customer->notes,
            (string) ($customer->createdBy?->name ?? ''),
            $parts->count(),
            $totalQuantity,
            $deviceNames,
            $deviceCodes,
            $serials,
            $invoices,
            $totalAmount,
            $customer->created_at?->format('Y/m/d H:i') ?? '',
        ];
    }

    public function styles(Worksheet $sheet)
    {
        return [
            1 => ['font' => ['bold' => true]],
        ];
    }

    public function registerEvents(): array
    {
        return [
            AfterSheet::class => function (AfterSheet $event) {
                $event->sheet->getDelegate()->getSheetView()->setRightToLeft(true);
            },
        ];
    }
}
