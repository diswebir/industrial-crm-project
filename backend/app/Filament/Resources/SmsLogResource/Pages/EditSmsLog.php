<?php

namespace App\Filament\Resources\SmsLogResource\Pages;

use App\Filament\Resources\SmsLogResource;
use Filament\Actions;
use Filament\Resources\Pages\EditRecord;

class EditSmsLog extends EditRecord
{
    protected static string $resource = SmsLogResource::class;

    protected function getHeaderActions(): array
    {
        // حذف از پنل مدیریت غیرفعال است تا موجودی انبار/تاریخچه/سند حسابرسی از این
        // مسیر دور زده نشود؛ حذف فقط از خود سامانه و با کنترل‌های آن انجام می‌شود.
        return [];
    }
}
