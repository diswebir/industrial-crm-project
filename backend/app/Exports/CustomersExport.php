<?php

namespace App\Exports;

use App\Models\Customer;
use App\Models\User;
use Maatwebsite\Excel\Concerns\FromCollection;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithCustomCsvSettings;
use Maatwebsite\Excel\Concerns\WithCustomValueBinder;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;
use PhpOffice\PhpSpreadsheet\Cell\Cell;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Cell\DefaultValueBinder;

class CustomersExport extends DefaultValueBinder implements FromCollection, WithHeadings, WithMapping, ShouldAutoSize, WithCustomCsvSettings, WithCustomValueBinder
{
    public function __construct(private ?string $type, private User $user)
    {
    }

    public function collection()
    {
        $query = Customer::visibleTo($this->user)->with('customerParts.part')->latest();
        if (in_array($this->type, ['potential', 'effective'], true)) {
            $query->where('customer_type', $this->type);
        }
        return $query->get();
    }

    public function headings(): array
    {
        return [
            'نوع مشتری', 'نوع شخص', 'نام', 'نام خانوادگی', 'نام شرکت',
            'کد ملی / شناسه ملی', 'شماره همراه', 'تلفن ثابت', 'ایمیل',
            'استان', 'شهر', 'آدرس', 'یادداشت', 'تاریخ ثبت',
            'نام دستگاه', 'کد دستگاه', 'شماره سریال / شناسه', 'تعداد',
            'شماره فاکتور', 'مبلغ فاکتور',
        ];
    }

    /** One row per allocation; customers without devices still get one row. */
    public function map($customer): array
    {
        $base = [
            $customer->customer_type === 'effective' ? 'بالفعل' : 'بالقوه',
            $customer->type === 'company' ? 'حقوقی' : 'حقیقی',
            $customer->first_name ?? '', $customer->last_name ?? '', $customer->company_name ?? '',
            $customer->national_code ?? '', $customer->mobile ?? '', $customer->phone ?? '', $customer->email ?? '',
            $customer->province ?? '', $customer->city ?? '', $customer->address ?? '', $customer->notes ?? '',
            $customer->created_at?->format('Y/m/d H:i') ?? '',
        ];
        $base = array_map(fn ($value) => $this->safeText($value), $base);
        if ($customer->customerParts->isEmpty()) {
            return [array_merge($base, ['', '', '', '', '', ''])];
        }
        return $customer->customerParts->map(fn ($assignment) => array_merge($base, [
            $this->safeText($assignment->part?->name ?? ''),
            $this->safeText($assignment->part?->code ?? ''),
            $this->safeText($assignment->serial_number),
            $assignment->quantity,
            $this->safeText($assignment->invoice_number ?? ''),
            $assignment->invoice_amount ?? '',
        ]))->all();
    }

    /** XLSX identifiers remain text, including leading zeroes and formula-like strings. */
    public function bindValue(Cell $cell, $value): bool
    {
        if (is_string($value)) {
            $cell->setValueExplicit($value, DataType::TYPE_STRING);
            return true;
        }
        return parent::bindValue($cell, $value);
    }

    public function getCsvSettings(): array
    {
        return ['use_bom' => true, 'output_encoding' => 'UTF-8'];
    }

    private function safeText($value): string
    {
        $value = (string) $value;
        // CSV opened in spreadsheet programs must not execute cell formulas.
        return preg_match('/^[\\x00-\\x20]*[=+\\-@]/u', $value) ? "'" . $value : $value;
    }
}
