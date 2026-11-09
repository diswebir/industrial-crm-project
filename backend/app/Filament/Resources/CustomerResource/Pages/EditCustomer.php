<?php

namespace App\Filament\Resources\CustomerResource\Pages;

use App\Filament\Resources\CustomerResource;
use Filament\Actions;
use Filament\Resources\Pages\EditRecord;

class EditCustomer extends EditRecord
{
    protected static string $resource = CustomerResource::class;

    protected function getHeaderActions(): array
    {
        // حذف از پنل مدیریت غیرفعال است تا موجودی انبار/تاریخچه/سند حسابرسی از این
        // مسیر دور زده نشود؛ حذف فقط از خود سامانه و با کنترل‌های آن انجام می‌شود.
        return [];
    }
}
