<?php

namespace App\Filament\Resources\PartResource\Pages;

use App\Filament\Resources\PartResource;
use Filament\Actions;
use Filament\Resources\Pages\EditRecord;

class EditPart extends EditRecord
{
    protected static string $resource = PartResource::class;

    protected function getHeaderActions(): array
    {
        // حذف از پنل مدیریت غیرفعال است تا موجودی انبار/تاریخچه/سند حسابرسی از این
        // مسیر دور زده نشود؛ حذف فقط از خود سامانه و با کنترل‌های آن انجام می‌شود.
        return [];
    }
}
