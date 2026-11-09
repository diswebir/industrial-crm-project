<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryLog extends Model
{
    use HasFactory;

    public const TYPE_IN = 'in';
    public const TYPE_OUT = 'out';
    public const TYPE_RETURN = 'return';
    public const TYPE_ADJUSTMENT = 'adjustment';

    public const TYPES = [
        self::TYPE_IN,
        self::TYPE_OUT,
        self::TYPE_RETURN,
        self::TYPE_ADJUSTMENT,
    ];

    protected $fillable = [
        'part_id',
        'customer_id',
        'customer_part_id',
        'user_id',
        'type',
        'quantity',
        'stock_before',
        'stock_after',
        'reference',
        'notes',
        'logged_at',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'stock_before' => 'integer',
            'stock_after' => 'integer',
            'logged_at' => 'datetime',
        ];
    }

    /**
     * برچسب فارسی نوع عملیات انبار.
     */
    public function getTypeLabelAttribute(): string
    {
        return config('acl.inventory.types')[$this->type] ?? $this->type;
    }

    /**
     * جهت حرکت موجودی: +۱ برای افزایش، -۱ برای کاهش، ۰ برای اصلاح دستی.
     */
    public function getDirectionAttribute(): int
    {
        return match ($this->type) {
            self::TYPE_IN, self::TYPE_RETURN => 1,
            self::TYPE_OUT => -1,
            default => 0,
        };
    }

    public function part(): BelongsTo
    {
        return $this->belongsTo(Part::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function customerPart(): BelongsTo
    {
        return $this->belongsTo(CustomerPart::class);
    }

    /**
     * کاربر ثبت‌کننده عملیات انبار (کارمند/نیروی وارد یا خارج‌کننده کالا).
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function scopeOfType(Builder $query, ?string $type): Builder
    {
        if ($type && in_array($type, self::TYPES, true)) {
            return $query->where('type', $type);
        }

        return $query;
    }

    public function scopeForPart(Builder $query, int|string|null $partId): Builder
    {
        return $partId ? $query->where('part_id', $partId) : $query;
    }
}
