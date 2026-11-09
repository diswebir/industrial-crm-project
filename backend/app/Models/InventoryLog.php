<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * لاگ کامل تراکنش‌های انبار:
 *   in     = ورود کالا به انبار
 *   out    = خروج کالا جهت تخصیص به مشتری
 *   return = برگشت کالا از مشتری به انبار
 *   adjust = اصلاح موجودی توسط انباردار
 */
class InventoryLog extends Model
{
    use HasFactory;

    public const TYPE_IN = 'in';
    public const TYPE_OUT = 'out';
    public const TYPE_RETURN = 'return';
    public const TYPE_ADJUST = 'adjust';

    public const TYPE_LABELS = [
        self::TYPE_IN => 'ورود به انبار',
        self::TYPE_OUT => 'خروج جهت تخصیص به مشتری',
        self::TYPE_RETURN => 'برگشت به انبار',
        self::TYPE_ADJUST => 'اصلاح موجودی',
    ];

    protected $fillable = [
        'part_id',
        'user_id',
        'customer_id',
        'customer_part_id',
        'type',
        'quantity',
        'stock_after',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'stock_after' => 'integer',
        ];
    }

    protected $appends = ['type_label'];

    public function getTypeLabelAttribute(): string
    {
        return self::TYPE_LABELS[$this->type] ?? (string) $this->type;
    }

    public function part(): BelongsTo
    {
        return $this->belongsTo(Part::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function customerPart(): BelongsTo
    {
        return $this->belongsTo(CustomerPart::class);
    }
}
