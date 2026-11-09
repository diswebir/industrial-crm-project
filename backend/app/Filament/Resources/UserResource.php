<?php

namespace App\Filament\Resources;

use App\Filament\Resources\UserResource\Pages;
use App\Filament\Resources\UserResource\RelationManagers;
use App\Models\User;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\SoftDeletingScope;

class UserResource extends Resource
{
    protected static ?string $model = User::class;

    protected static ?string $navigationIcon = 'heroicon-o-user-group';

    protected static ?string $navigationLabel = 'کاربران و دسترسی‌ها';

    protected static ?string $modelLabel = 'کاربر';

    protected static ?string $pluralModelLabel = 'کاربران';

    public static function form(Form $form): Form
    {
        return $form
            ->schema([
                Forms\Components\TextInput::make('name')
                    ->label('نام و نام خانوادگی')
                    ->required()
                    ->maxLength(255),
                Forms\Components\TextInput::make('email')
                    ->label('ایمیل')
                    ->email()
                    ->required()
                    ->maxLength(255),
                Forms\Components\TextInput::make('phone')
                    ->label('شماره همراه')
                    ->tel()
                    ->maxLength(255),
                Forms\Components\TextInput::make('password')
                    ->label('رمز عبور')
                    ->password()
                    ->dehydrateStateUsing(fn ($state) => filled($state) ? bcrypt($state) : null)
                    ->dehydrated(fn ($state) => filled($state))
                    ->required(fn (string $operation): bool => $operation === 'create')
                    ->maxLength(255),
                Forms\Components\Select::make('user_type')
                    ->label('نقش سازمانی')
                    ->options([
                        'administrator' => 'مدیر ارشد سامانه (Administrator)',
                        'manager' => 'مدیر / سرپرست (Manager)',
                        'salesperson' => 'کارمند فروش (Salesperson)',
                        'installer' => 'نصاب (Installer)',
                    ])
                    ->default('manager')
                    ->required(),
                Forms\Components\Select::make('customers_scope')
                    ->label('دامنه دسترسی به مشتریان')
                    ->options([
                        'all' => 'همه مشتریان سامانه',
                        'own' => 'فقط مشتریان خودش + استثناهای اعطاشده',
                    ])
                    ->default('all')
                    ->required()
                    ->helperText('برای نقش «کارمند فروش» و «نصاب» مقدار پیش‌فرض «فقط مشتریان خودش» است.'),
                Forms\Components\Select::make('accessibleStaff')
                    ->label('دسترسی به مشتریانِ کارمندان مشخص')
                    ->relationship('accessibleStaff', 'name')
                    ->multiple()
                    ->searchable()
                    ->preload()
                    ->visible(fn (Forms\Get $get): bool => $get('customers_scope') === 'own'),
                Forms\Components\Select::make('accessibleCustomers')
                    ->label('دسترسی به مشتریان تکی (استثنا)')
                    ->relationship('accessibleCustomers', 'company_name')
                    ->getOptionLabelFromRecordUsing(fn (\App\Models\Customer $record): string => $record->full_name . ($record->mobile ? ' — ' . $record->mobile : ''))
                    ->multiple()
                    ->searchable()
                    ->preload()
                    ->visible(fn (Forms\Get $get): bool => $get('customers_scope') === 'own'),
                Forms\Components\Toggle::make('is_active')
                    ->label('حساب کاربری فعال است')
                    ->default(true)
                    ->required(),
                Forms\Components\CheckboxList::make('permissions')
                    ->label('مجوزهای مستقیم سیستمی (Pure ACL)')
                    ->relationship('permissions', 'name')
                    ->columns(2)
                    ->columnSpanFull(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('id')->label('شناسه')->sortable(),
                Tables\Columns\TextColumn::make('name')
                    ->label('نام کاربر')
                    ->searchable(),
                Tables\Columns\TextColumn::make('email')
                    ->label('ایمیل')
                    ->searchable(),
                Tables\Columns\TextColumn::make('phone')
                    ->label('شماره موبایل')
                    ->searchable(),
                Tables\Columns\BadgeColumn::make('user_type')
                    ->label('نقش سازمانی')
                    ->formatStateUsing(fn (?string $state): string => config("acl.roles.{$state}.label", $state ?? 'مدیر'))
                    ->colors([
                        'warning' => 'administrator',
                        'secondary' => 'manager',
                        'info' => 'salesperson',
                        'success' => 'installer',
                    ]),
                Tables\Columns\BadgeColumn::make('customers_scope')
                    ->label('دامنه دسترسی')
                    ->formatStateUsing(fn (?string $state): string => $state === 'own' ? 'فقط مشتریان خودش' : 'همه مشتریان')
                    ->colors([
                        'gray' => 'all',
                        'info' => 'own',
                    ]),
                Tables\Columns\IconColumn::make('is_active')
                    ->label('فعال')
                    ->boolean(),
                Tables\Columns\TextColumn::make('created_at')
                    ->label('تاریخ عضویت')
                    ->dateTime()
                    ->sortable(),
                Tables\Columns\TextColumn::make('updated_at')
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
            'index' => Pages\ListUsers::route('/'),
            'create' => Pages\CreateUser::route('/create'),
            'edit' => Pages\EditUser::route('/{record}/edit'),
        ];
    }
}
