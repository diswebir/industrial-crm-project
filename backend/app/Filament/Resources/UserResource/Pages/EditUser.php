<?php

namespace App\Filament\Resources\UserResource\Pages;

use App\Filament\Resources\UserResource;
use Filament\Actions;
use Filament\Resources\Pages\EditRecord;

class EditUser extends EditRecord
{
    protected static string $resource = UserResource::class;

    protected function getHeaderActions(): array
    {
        // حذف از پنل مدیریت غیرفعال است تا موجودی انبار/تاریخچه/سند حسابرسی از این
        // مسیر دور زده نشود؛ حذف فقط از خود سامانه و با کنترل‌های آن انجام می‌شود.
        return [];
    }
}
