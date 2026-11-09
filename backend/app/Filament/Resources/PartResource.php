<?php

namespace App\Filament\Resources;

use App\Filament\Resources\PartResource\Pages;
use App\Models\Part;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

class PartResource extends Resource
{
    protected static ?string $model = Part::class;

    protected static ?string $navigationIcon = 'heroicon-o-cog-6-tooth';

    protected static ?string $navigationLabel = 'دستگاه‌ها';

    protected static ?string $modelLabel = 'دستگاه';

    protected static ?string $pluralModelLabel = 'دستگاه‌ها';

    public static function form(Form $form): Form
    {
        return $form
            ->schema([
                Forms\Components\TextInput::make('name')
                    ->label('نام دستگاه')
                    ->required()
                    ->maxLength(255),
                Forms\Components\TextInput::make('code')
                    ->label('کد فنی دستگاه')
                    ->required()
                    ->maxLength(255),
                Forms\Components\TextInput::make('periodic_service_months')
                    ->label('دوره گارانتی/سرویس (ماه)')
                    ->required()
                    ->numeric()
                    ->default(12),
                // موجودی فقط از طریق ماژول انبار (با ثبت لاگ و کاربر) تغییر می‌کند؛
                // ویرایش مستقیم در پنل مدیریت، ردیابی انبار را نقض می‌کند.
                Forms\Components\TextInput::make('stock_quantity')
                    ->label('موجودی انبار (عدد)')
                    ->helperText('فقط خواندنی — برای ورود/خروج یا اصلاح موجودی از صفحه «انبار و تاریخچه ورود/خروج» در سامانه استفاده کنید.')
                    ->numeric()
                    ->disabled()
                    ->dehydrated(false)
                    ->default(0),
                Forms\Components\TextInput::make('min_stock_quantity')
                    ->label('حد هشدار موجودی')
                    ->numeric()
                    ->default(0),
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
            // جلوگیری از N+1 در ستون «تخصیص‌یافته» (یک کوئری جمع برای همه ردیف‌ها).
            ->modifyQueryUsing(fn (Builder $query) => $query->withSum('customerParts as allocated_quantity', 'quantity'))
            ->columns([
                Tables\Columns\TextColumn::make('id')->label('شناسه')->sortable(),
                Tables\Columns\TextColumn::make('name')
                    ->label('نام دستگاه')
                    ->searchable(),
                Tables\Columns\TextColumn::make('code')
                    ->label('کد فنی')
                    ->searchable(),
                Tables\Columns\TextColumn::make('stock_quantity')
                    ->label('موجودی انبار')
                    ->numeric()
                    ->sortable()
                    ->badge()
                    ->color(fn ($state, Part $record): string => $record->is_low_stock ? 'danger' : 'success'),
                Tables\Columns\TextColumn::make('allocated_quantity')
                    ->label('تخصیص‌یافته')
                    ->numeric(),
                Tables\Columns\TextColumn::make('periodic_service_months')
                    ->label('دوره سرویس (ماه)')
                    ->numeric()
                    ->sortable(),
                Tables\Columns\IconColumn::make('is_active')
                    ->label('وضعیت')
                    ->boolean(),
                Tables\Columns\TextColumn::make('created_at')
                    ->label('تاریخ ایجاد')
                    ->dateTime()
                    ->sortable(),
                Tables\Columns\TextColumn::make('updated_at')
                    ->label('آخرین بروزرسانی')
                    ->dateTime()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
            ])
            ->filters([
                //
            ])
            ->actions([
                Tables\Actions\EditAction::make(),
            ])
            // حذف گروهی از پنل مدیریت غیرفعال است: حذف مشتری/دستگاه باید از
            // مسیر اصلی سامانه انجام شود تا موجودی انبار و تاریخچه حفظ شود.
            ;
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
