<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\DB;

abstract class Controller
{
    /**
     * Returns the case-insensitive LIKE operator for the active database driver.
     *
     * PostgreSQL uses ILIKE for case-insensitive matching, while MySQL/MariaDB
     * use plain LIKE (which is case-insensitive by default with *_ci collations).
     * This keeps search behavior identical across both drivers (e.g. local
     * PostgreSQL via Docker and MySQL on shared cPanel hosting).
     */
    protected function likeOp(): string
    {
        return DB::connection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';
    }

    /**
     * تبدیل ارقام فارسی/عربی به لاتین و حذف نویسه‌های غیرعددی.
     * برای شماره همراه، تلفن، کد ملی و مبالغ ورودی کاربر استفاده می‌شود.
     */
    protected function toLatinDigits(mixed $value): string
    {
        if ($value === null) {
            return '';
        }

        $map = [
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4',
            '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
            '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        ];

        return strtr((string) $value, $map);
    }

    /**
     * شماره‌های تلفن/همراه را به شکل خالص عددی (بدون فاصله و خط تیره) نرمال می‌کند.
     */
    protected function normalizePhoneNumber(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', $this->toLatinDigits($value)) ?? '';

        if ($digits === '') {
            return null;
        }

        // 00989... / +989... → 09...
        if (str_starts_with($digits, '00989')) {
            $digits = '0' . substr($digits, 4);
        } elseif (str_starts_with($digits, '989')) {
            $digits = '0' . substr($digits, 2);
        }

        return $digits;
    }
}
