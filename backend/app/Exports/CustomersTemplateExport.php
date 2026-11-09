<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;

class CustomersTemplateExport implements FromArray, WithHeadings, ShouldAutoSize
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
                'مشتری فعال خط تولید قطعات صنعتی',
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
                'علاقه‌مند به تهیه دستگاه پمپ هیدرولیک',
            ],
        ];
    }
}
