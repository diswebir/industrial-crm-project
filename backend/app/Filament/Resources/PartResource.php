<?php

namespace App\Filament\Resources;

use App\Filament\Resources\PartResource\Pages;
use App\Models\Part;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;

class PartResource extends Resource
{
    protected static ?string $model = Part::class;

    protected static ?string $navigationIcon = 'heroicon-o-cpu-chip';

    protected static ?string $navigationLabel = 'دستگاه‌ها';

    protected static ?string $modelLabel = 'دستگاه';

    protected static ?string $pluralModelLabel = 'دستگاه‌ها';

    protected static ?int $navigationSort = 20;

    public static function form(Form $form): Form
    {
        return $form
            ->schema([
                Forms\Components\TextInput::make('name')
                    ->label('نام دستگاه')
                    ->required()
                    ->maxLength(255),
                Forms\Components\TextInput::make('code')
                    ->label('کد فنی دستگاه (SKU)')
                    ->required()
                    ->maxLength(255),
                Forms\Components\TextInput::make('periodic_service_months')
                    ->label('دوره گارانتی/سرویس (ماه)')
                    ->required()
                    ->numeric()
                    ->default(12),
                Forms\Components\TextInput::make('stock_quantity')
                    ->label('موجودی انبار (عدد)')
                    ->numeric()
                    ->default(0)
                    ->helperText('تغییر این مقدار، یک رکورد «اصلاح دستی موجودی» در تاریخچه انبار ثبت می‌کند.'),
                Forms\Components\TextInput::make('min_stock_quantity')
                    ->label('حد هشدار کمبود موجودی')
                    ->numeric()
                    ->default(0),
                Forms\Components\TextInput::make('unit_label')
                    ->label('واحد شمارش')
                    ->default('عدد')
                    ->maxLength(30),
                Forms\Components\Toggle::make('is_active')
                    ->label('فعال در کاتالوگ')
                    ->default(true)
                    ->required(),
                Forms\Components\Textarea::make('description')
                    ->label('توضیحات و مشخصات فنی')
                    ->columnSpanFull(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('id')->label('شناسه')->sortable(),
                Tables\Columns\TextColumn::make('name')
                    ->label('نام دستگاه')
                    ->searchable(),
                Tables\Columns\TextColumn::make('code')
                    ->label('کد فنی')
                    ->searchable(),
                Tables\Columns\TextColumn::make('periodic_service_months')
                    ->label('دوره سرویس (ماه)')
                    ->numeric()
                    ->sortable(),
                Tables\Columns\TextColumn::make('stock_quantity')
                    ->label('موجودی انبار')
                    ->numeric()
                    ->sortable()
                    ->color(fn (Part $record): string => $record->isLowStock() ? 'danger' : 'success'),
                Tables\Columns\TextColumn::make('min_stock_quantity')
                    ->label('حد هشدار')
                    ->numeric()
                    ->toggleable(isToggledHiddenByDefault: true),
                Tables\Columns\TextColumn::make('customer_parts_count')
                    ->label('ردیف‌های تخصیص')
                    ->counts('customerParts')
                    ->sortable(),
                Tables\Columns\IconColumn::make('is_active')
                    ->label('وضعیت')
                    ->boolean(),
                Tables\Columns\TextColumn::make('created_at')
                    ->label('تاریخ ایجاد')
                    ->dateTime()
                    ->sortable(),
                Tables\Columns\TextColumn::make('updated_at')
                    ->dateTime()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
            ])
            ->filters([
                Tables\Filters\TernaryFilter::make('is_active')->label('دستگاه فعال'),
                Tables\Filters\Filter::make('low_stock')
                    ->label('فقط دستگاه‌های با کمبود موجودی')
                    ->query(fn ($query) => $query->where('min_stock_quantity', '>', 0)->whereColumn('stock_quantity', '<=', 'min_stock_quantity')),
            ])
            ->actions([
                Tables\Actions\EditAction::make(),
            ])
            ->bulkActions([
                Tables\Actions\BulkActionGroup::make([
                    Tables\Actions\DeleteBulkAction::make(),
                ]),
            ]);
    }

    public static function getRelations(): array
    {
        return [
            //
        ];
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListParts::route('/'),
            'create' => Pages\CreatePart::route('/create'),
            'edit' => Pages\EditPart::route('/{record}/edit'),
        ];
    }
}
