<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithEvents;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithStyles;
use Maatwebsite\Excel\Events\AfterSheet;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/**
 * فایل نمونه (Template) ورود گروهی مشتریان.
 *
 * v2.0.0 — تسک ۵: شماره همراه دیگر اجباری نیست و برای شخصیت حقوقی،
 * «نام شرکت» اجباری و «نام/نام خانوادگی» اختیاری است.
 */
class CustomersTemplateExport implements FromArray, WithHeadings, ShouldAutoSize, WithStyles, WithEvents
{
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
            'راهنما',
        ];
    }

    public function array(): array
    {
        return [
            [
                'بالفعل',
                'حقوقی',
                'سارا',
                'افشار',
                'شرکت فولاد فرایند',
                '10103456789',
                '09121112233',
                '02188776655',
                'info@foulad.ir',
                'تهران',
                'تهران',
                'خیابان مطهری، پلاک ۱۲',
                'مشتری فعال خط تولید دستگاه‌های صنعتی',
                'در شخصیت حقوقی: «نام شرکت» اجباری و «نام/نام خانوادگی/موبایل» اختیاری است.',
            ],
            [
                'بالقوه',
                'حقیقی',
                'رضا',
                'محمودی',
                '',
                '0012345678',
                '09359876543',
                '03133221100',
                'reza@gmail.com',
                'اصفهان',
                'نجف‌آباد',
                'بلوار صنعت، کوچه امید',
                'علاقه‌مند به تهیه دستگاه پرس هیدرولیک',
                'در شخصیت حقیقی: «نام» و «نام خانوادگی» اجباری است.',
            ],
            [
                'بالقوه',
                'حقوقی',
                '',
                '',
                'شرکت مهندسی پارس تراش',
                '',
                '',
                '02633445566',
                '',
                'البرز',
                'کرج',
                'شهرک صنعتی سیمین دشت',
                'فقط با نام شرکت و بدون شماره همراه ثبت شده است',
                'نمونه مشتری حقوقی بدون نام شخص و بدون شماره همراه (کاملاً معتبر است).',
            ],
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
