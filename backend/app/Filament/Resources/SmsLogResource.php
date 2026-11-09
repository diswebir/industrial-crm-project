<?php

namespace App\Filament\Resources;

use App\Filament\Resources\SmsLogResource\Pages;
use App\Filament\Resources\SmsLogResource\RelationManagers;
use App\Models\SmsLog;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\SoftDeletingScope;

class SmsLogResource extends Resource
{
    protected static ?string $model = SmsLog::class;

    protected static ?string $navigationIcon = 'heroicon-o-chat-bubble-left-right';

    protected static ?string $navigationLabel = 'سوابق پیامک';

    protected static ?string $modelLabel = 'پیامک';

    protected static ?string $pluralModelLabel = 'سوابق پیامک';

    public static function form(Form $form): Form
    {
        return $form
            ->schema([
                Forms\Components\Select::make('customer_id')
                    ->label('مشتری مربوطه')
                    ->relationship('customer', 'first_name'),
                Forms\Components\TextInput::make('recipient_mobile')
                    ->label('شماره همراه گیرنده')
                    ->required()
                    ->maxLength(255),
                Forms\Components\TextInput::make('pattern_code')
                    ->label('کد الگو (Pattern Code)')
                    ->required()
                    ->maxLength(255),
                Forms\Components\TextInput::make('status')
                    ->label('وضعیت ارسال')
                    ->required()
                    ->maxLength(255)
                    ->default('sent'),
                Forms\Components\TextInput::make('provider_message_id')
                    ->label('شناسه پیامک در سامانه پیامکی')
                    ->maxLength(255),
                Forms\Components\Textarea::make('error_message')
                    ->label('خطای گزارش‌شده (در صورت وجود)')
                    ->columnSpanFull(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('id')->label('شناسه')->sortable(),
                Tables\Columns\TextColumn::make('recipient_mobile')
                    ->label('شماره گیرنده')
                    ->searchable(),
                Tables\Columns\TextColumn::make('pattern_code')
                    ->label('کد الگو')
                    ->searchable(),
                Tables\Columns\TextColumn::make('status')
                    ->label('وضعیت')
                    ->badge()
                    ->colors([
                        'success' => 'sent',
                        'danger' => 'failed',
                        'warning' => 'pending',
                    ]),
                Tables\Columns\TextColumn::make('provider_message_id')
                    ->label('کد پیگیری ملی‌پیامک')
                    ->searchable(),
                Tables\Columns\TextColumn::make('created_at')
                    ->label('زمان ارسال')
                    ->dateTime()
                    ->sortable(),
            ])
            ->filters([
                //
            ])
            // لاگ پیامک سند حسابرسی است؛ ویرایش/حذف آن از پنل مدیریت غیرفعال است.
            ->actions([])
            ->bulkActions([]);
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
            // فقط فهرست؛ ایجاد/ویرایش لاگ پیامک مجاز نیست (سند حسابرسی).
            'index' => Pages\ListSmsLogs::route('/'),
        ];
    }
}
