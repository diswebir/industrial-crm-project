<?php

namespace App\Filament\Resources;

use App\Filament\Resources\CustomerResource\Pages;
use App\Filament\Resources\CustomerResource\RelationManagers;
use App\Models\Customer;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\SoftDeletingScope;

class CustomerResource extends Resource
{
    protected static ?string $model = Customer::class;

    protected static ?string $navigationIcon = 'heroicon-o-users';

    protected static ?string $navigationLabel = 'مشتریان';

    protected static ?string $modelLabel = 'مشتری';

    protected static ?string $pluralModelLabel = 'مشتریان';

    public static function form(Form $form): Form
    {
        return $form
            ->schema([
                Forms\Components\Select::make('customer_type')
                    ->label('وضعیت مشتری')
                    ->options([
                        'potential' => 'بالقوه (Potential)',
                        'effective' => 'بالفعل (Effective)',
                    ])
                    ->default('potential')
                    ->required(),
                Forms\Components\Select::make('type')
                    ->label('نوع شخصیت')
                    ->options([
                        'company' => 'حقوقی (شرکت/کارگاه)',
                        'individual' => 'حقیقی (شخصی)',
                    ])
                    ->default('company')
                    ->required(),
                Forms\Components\TextInput::make('first_name')
                    ->label('نام')
                    ->required(fn (Forms\Get $get): bool => $get('type') === 'individual')
                    ->maxLength(255),
                Forms\Components\TextInput::make('last_name')
                    ->label('نام خانوادگی')
                    ->required(fn (Forms\Get $get): bool => $get('type') === 'individual')
                    ->maxLength(255),
                Forms\Components\TextInput::make('company_name')
                    ->label('نام شرکت / سازمان')
                    ->required(fn (Forms\Get $get): bool => $get('type') === 'company')
                    ->maxLength(255),
                Forms\Components\TextInput::make('national_code')
                    ->label('کد ملی / شناسه ملی')
                    ->maxLength(20),
                Forms\Components\TextInput::make('mobile')
                    ->label('شماره همراه (اختیاری)')
                    ->maxLength(20),
                Forms\Components\TextInput::make('phone')
                    ->label('تلفن ثابت')
                    ->tel()
                    ->maxLength(20),
                Forms\Components\TextInput::make('email')
                    ->label('ایمیل')
                    ->email()
                    ->maxLength(255),
                Forms\Components\TextInput::make('province')
                    ->label('استان')
                    ->maxLength(100),
                Forms\Components\TextInput::make('city')
                    ->label('شهر')
                    ->maxLength(100),
                Forms\Components\Textarea::make('address')
                    ->label('آدرس دقیق')
                    ->columnSpanFull(),
                Forms\Components\Textarea::make('notes')
                    ->label('توضیحات و یادداشت‌ها')
                    ->columnSpanFull(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('id')->label('شناسه')->sortable(),
                Tables\Columns\TextColumn::make('customer_type')
                    ->label('وضعیت')
                    ->badge()
                    ->formatStateUsing(fn (?string $state): string => match ($state) {
                        'effective' => 'بالفعل',
                        default => 'بالقوه',
                    })
                    ->colors([
                        'success' => 'effective',
                        'warning' => 'potential',
                    ]),
                Tables\Columns\TextColumn::make('company_name')
                    ->label('نام شرکت')
                    ->searchable(),
                Tables\Columns\TextColumn::make('first_name')
                    ->label('نام')
                    ->searchable(),
                Tables\Columns\TextColumn::make('last_name')
                    ->label('نام خانوادگی')
                    ->searchable(),
                Tables\Columns\TextColumn::make('mobile')
                    ->label('موبایل')
                    ->searchable(),
                Tables\Columns\TextColumn::make('city')
                    ->label('شهر')
                    ->searchable(),
                Tables\Columns\TextColumn::make('created_at')
                    ->label('تاریخ ثبت')
                    ->dateTime()
                    ->sortable(),
            ])
            ->filters([
                //
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
            'index' => Pages\ListCustomers::route('/'),
            'create' => Pages\CreateCustomer::route('/create'),
            'edit' => Pages\EditCustomer::route('/{record}/edit'),
        ];
    }
}
