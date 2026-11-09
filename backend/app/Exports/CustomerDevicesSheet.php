<?php

namespace App\Exports;

use App\Models\CustomerPart;
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
 * شیت دوم: یک ردیف برای هر دستگاه تخصیص‌یافته به هر مشتری (تسک ۳ و ۶).
 */
class CustomerDevicesSheet implements FromQuery, WithEvents, WithHeadings, WithMapping, ShouldAutoSize, WithStyles
{
    public function __construct(protected ?string $type = null, protected ?User $user = null)
    {
    }

    public function query()
    {
        return CustomerPart::query()
            ->visibleTo($this->user)
            ->with([
                'part:id,name,code,periodic_service_months',
                'customer:id,first_name,last_name,company_name,mobile,customer_type,type,created_by_user_id',
                'customer.createdBy:id,name',
                'assignedBy:id,name',
            ])
            ->withCount('serviceHistories')
            ->when(
                $this->type && in_array($this->type, ['potential', 'effective'], true),
                fn ($q) => $q->whereHas('customer', fn ($cq) => $cq->where('customer_type', $this->type))
            )
            ->orderBy('id');
    }

    public function headings(): array
    {
        return [
            'شناسه تخصیص',
            'شناسه مشتری',
            'نام مشتری',
            'نام شرکت / کارگاه',
            'شماره همراه مشتری',
            'وضعیت مشتری',
            'نام دستگاه',
            'کد فنی دستگاه',
            'شماره سریال دستگاه',
            'تعداد',
            'شماره فاکتور',
            'مبلغ فاکتور (تومان)',
            'تاریخ نصب / تحویل',
            'تاریخ پایان گارانتی',
            'دوره پوشش گارانتی (ماه)',
            'وضعیت دستگاه',
            'تخصیص‌دهنده (کارمند)',
            'ثبت‌کننده مشتری',
            'تعداد سوابق سرویس',
            'توضیحات',
            'تاریخ ثبت تخصیص',
        ];
    }

    /**
     * @param  CustomerPart  $customerPart
     */
    public function map($customerPart): array
    {
        $customer = $customerPart->customer;
        $part = $customerPart->part;

        $statusLabels = [
            'active' => 'فعال در محل مشتری',
            'under_repair' => 'در دست تعمیر',
            'replaced' => 'تعویض شده',
            'retired' => 'از رده خارج',
        ];

        return [
            (int) $customerPart->id,
            (int) ($customer?->id ?? 0),
            $customer ? trim("{$customer->first_name} {$customer->last_name}") : '',
            (string) ($customer?->company_name ?? ''),
            (string) ($customer?->mobile ?? ''),
            $customer ? ($customer->customer_type === 'effective' ? 'بالفعل' : 'بالقوه') : '',
            (string) ($part?->name ?? ''),
            (string) ($part?->code ?? ''),
            (string) $customerPart->serial_number,
            (int) ($customerPart->quantity ?? 1),
            (string) ($customerPart->invoice_number ?? ''),
            $customerPart->invoice_amount !== null ? (float) $customerPart->invoice_amount : null,
            $customerPart->installation_date?->format('Y/m/d') ?? '',
            $customerPart->warranty_expire_date?->format('Y/m/d') ?? '',
            (int) ($part?->periodic_service_months ?? 0),
            $statusLabels[$customerPart->status] ?? (string) $customerPart->status,
            (string) ($customerPart->assignedBy?->name ?? ''),
            (string) ($customer?->createdBy?->name ?? ''),
            (int) ($customerPart->service_histories_count ?? 0),
            (string) ($customerPart->notes ?? ''),
            $customerPart->created_at?->format('Y/m/d H:i') ?? '',
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
