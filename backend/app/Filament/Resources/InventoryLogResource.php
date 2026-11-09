<?php

namespace App\Filament\Resources;

use App\Filament\Resources\InventoryLogResource\Pages;
use App\Models\InventoryLog;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;

/**
 * تاریخچه ورود/خروج انبار در پنل مدیریت Filament (فقط خواندنی).
 *
 * لاگ‌های انبار سند حسابرسی هستند و نباید دستی ویرایش یا حذف شوند؛
 * تغییر موجودی فقط از طریق فرم دستگاه‌ها یا API انبار انجام می‌شود.
 */
class InventoryLogResource extends Resource
{
    protected static ?string $model = InventoryLog::class;

    protected static ?string $navigationIcon = 'heroicon-o-arrow-path-rounded-square';

    protected static ?string $navigationLabel = 'تاریخچه انبار';

    protected static ?string $modelLabel = 'تراکنش انبار';

    protected static ?string $pluralModelLabel = 'تراکنش‌های انبار';

    protected static ?int $navigationSort = 30;

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('id')->label('شناسه')->sortable(),
                Tables\Columns\TextColumn::make('part.name')->label('دستگاه')->searchable()->sortable(),
                Tables\Columns\TextColumn::make('part.code')->label('کد فنی')->searchable()->toggleable(),
                Tables\Columns\TextColumn::make('type')
                    ->label('نوع عملیات')
                    ->badge()
                    ->formatStateUsing(fn (string $state): string => config("acl.inventory.types.{$state}", $state))
                    ->color(fn (string $state): string => match ($state) {
                        InventoryLog::TYPE_IN => 'success',
                        InventoryLog::TYPE_RETURN => 'info',
                        InventoryLog::TYPE_OUT => 'warning',
                        default => 'gray',
                    }),
                Tables\Columns\TextColumn::make('quantity')->label('تعداد')->numeric()->sortable(),
                Tables\Columns\TextColumn::make('stock_before')->label('موجودی قبل')->numeric()->toggleable(),
                Tables\Columns\TextColumn::make('stock_after')->label('موجودی بعد')->numeric(),
                Tables\Columns\TextColumn::make('user.name')->label('ثبت‌کننده')->searchable()->sortable(),
                Tables\Columns\TextColumn::make('customer.full_name')
                    ->label('مشتری')
                    ->url(fn (?InventoryLog $record): ?string => $record && $record->customer_id
                        ? CustomerResource::getUrl('edit', ['record' => $record->customer_id])
                        : null),
                Tables\Columns\TextColumn::make('reference')->label('شماره فاکتور/سریال')->searchable()->toggleable(),
                Tables\Columns\TextColumn::make('logged_at')->label('تاریخ و ساعت')->dateTime('Y/m/d H:i')->sortable(),
                Tables\Columns\TextColumn::make('notes')->label('توضیحات')->limit(40)->toggleable(isToggledHiddenByDefault: true),
            ])
            ->defaultSort('logged_at', 'desc')
            ->filters([
                Tables\Filters\SelectFilter::make('type')
                    ->label('نوع عملیات')
                    ->options(config('acl.inventory.types')),
                Tables\Filters\SelectFilter::make('part')
                    ->label('دستگاه')
                    ->relationship('part', 'name')
                    ->searchable()
                    ->preload(),
                Tables\Filters\SelectFilter::make('user')
                    ->label('ثبت‌کننده')
                    ->relationship('user', 'name')
                    ->searchable()
                    ->preload(),
            ])
            ->actions([])
            ->bulkActions([]);
    }

    public static function getRelations(): array
    {
        return [];
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListInventoryLogs::route('/'),
        ];
    }
}
