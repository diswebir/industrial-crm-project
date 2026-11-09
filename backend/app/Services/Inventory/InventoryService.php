<?php

namespace App\Services\Inventory;

use App\Models\Customer;
use App\Models\CustomerPart;
use App\Models\InventoryLog;
use App\Models\Part;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  سرویس انبار (تسک ۴) — تنها نقطه مجاز تغییر موجودی دستگاه‌ها
 *
 *  تضمین‌ها:
 *   ۱) همه تغییرات موجودی داخل Transaction و با قفل ردیف (lockForUpdate) انجام
 *      می‌شود تا در دسترسی همزمان، موجودی خراب نشود.
 *   ۲) موجودی هرگز منفی نمی‌شود؛ در صورت کمبود، خطای اعتبارسنجی فارسی برمی‌گردد
 *      و کل عملیات Rollback می‌شود.
 *   ۳) برای هر حرکت، یک ردیف در inventory_logs با ثبت‌کننده (کاربر)، مشتری،
 *      تعداد، موجودی قبل/بعد و زمان دقیق ثبت می‌شود.
 * ─────────────────────────────────────────────────────────────────────────────
 */
class InventoryService
{
    /**
     * ورود کالا به انبار (افزایش موجودی).
     */
    public function receive(
        Part $part,
        int $quantity,
        ?int $userId = null,
        ?string $notes = null,
        ?string $reference = null,
        ?Customer $customer = null,
    ): InventoryLog {
        return $this->move($part, abs($quantity), InventoryLog::TYPE_IN, [
            'user_id' => $userId,
            'notes' => $notes,
            'reference' => $reference,
            'customer' => $customer,
        ]);
    }

    /**
     * خروج کالا از انبار جهت تخصیص به مشتری (کاهش موجودی).
     *
     * @throws ValidationException اگر موجودی کافی نباشد
     */
    public function issue(
        Part $part,
        int $quantity,
        ?int $userId = null,
        ?Customer $customer = null,
        ?CustomerPart $customerPart = null,
        ?string $notes = null,
        ?string $reference = null,
    ): InventoryLog {
        return $this->move($part, abs($quantity), InventoryLog::TYPE_OUT, [
            'user_id' => $userId,
            'customer' => $customer,
            'customer_part' => $customerPart,
            'notes' => $notes,
            'reference' => $reference,
        ]);
    }

    /**
     * برگشت کالا به انبار (حذف تخصیص یا کاهش تعداد تخصیص).
     */
    public function returnToStock(
        Part $part,
        int $quantity,
        ?int $userId = null,
        ?Customer $customer = null,
        ?CustomerPart $customerPart = null,
        ?string $notes = null,
        ?string $reference = null,
    ): InventoryLog {
        return $this->move($part, abs($quantity), InventoryLog::TYPE_RETURN, [
            'user_id' => $userId,
            'customer' => $customer,
            'customer_part' => $customerPart,
            'notes' => $notes,
            'reference' => $reference,
        ]);
    }

    /**
     * اصلاح دستی موجودی به یک عدد مشخص (توسط مدیر انبار).
     */
    public function adjustTo(
        Part $part,
        int $newStock,
        ?int $userId = null,
        ?string $notes = null,
    ): InventoryLog {
        $newStock = max(0, $newStock);
        $current = (int) $part->fresh()?->stock_quantity;

        if ($newStock === $current) {
            throw ValidationException::withMessages([
                'stock_quantity' => ['موجودی جدید با موجودی فعلی تفاوتی ندارد؛ تغییری ثبت نشد.'],
            ]);
        }

        $delta = $newStock - $current;

        if ($delta > 0) {
            return $this->move($part, $delta, InventoryLog::TYPE_ADJUSTMENT, [
                'user_id' => $userId,
                'notes' => $notes ?: "اصلاح دستی موجودی از {$current} به {$newStock}",
                'direction' => 1,
            ]);
        }

        return $this->move($part, abs($delta), InventoryLog::TYPE_ADJUSTMENT, [
            'user_id' => $userId,
            'notes' => $notes ?: "اصلاح دستی موجودی از {$current} به {$newStock}",
            'direction' => -1,
            'allow_negative' => false,
        ]);
    }

    /**
     * ─────────────────────────────────────────────────────────────────────────
     *  هسته مرکزی: اعمال یک حرکت انبار به‌صورت اتمیک + ثبت لاگ
     *
     *  اگر فراخوانی از قبل داخل یک Transaction باشد (مثل تخصیص دستگاه)،
     *  همین Transaction ادامه پیدا می‌کند تا کل عملیات با هم Rollback شود.
     * ─────────────────────────────────────────────────────────────────────────
     */
    public function move(Part $part, int $quantity, string $type, array $context = []): InventoryLog
    {
        $quantity = abs((int) $quantity);

        if ($quantity < 1) {
            throw ValidationException::withMessages([
                'quantity' => ['تعداد وارد شده باید عددی بزرگ‌تر از صفر باشد.'],
            ]);
        }

        if (!in_array($type, InventoryLog::TYPES, true)) {
            throw ValidationException::withMessages([
                'type' => ['نوع عملیات انبار نامعتبر است.'],
            ]);
        }

        return DB::transaction(function () use ($part, $quantity, $type, $context) {
            /** @var Part|null $locked */
            $locked = Part::query()->whereKey($part->getKey())->lockForUpdate()->first();

            if (!$locked) {
                throw ValidationException::withMessages([
                    'part_id' => ['دستگاه مورد نظر در کاتالوگ یافت نشد.'],
                ]);
            }

            $before = (int) $locked->stock_quantity;

            // جهت حرکت: افزایش یا کاهش
            $direction = (int) ($context['direction'] ?? match ($type) {
                InventoryLog::TYPE_IN, InventoryLog::TYPE_RETURN => 1,
                InventoryLog::TYPE_OUT => -1,
                default => -1,
            });

            $after = $before + ($direction * $quantity);

            if ($after < 0 && !($context['allow_negative'] ?? false)) {
                $label = $type === InventoryLog::TYPE_OUT
                    ? "موجودی انبار دستگاه «{$locked->name}» کافی نیست (موجودی فعلی: {$before} عدد، تعداد درخواستی: {$quantity} عدد). ابتدا «ورود کالا» را ثبت کنید."
                    : "این عملیات باعث منفی شدن موجودی دستگاه «{$locked->name}» می‌شود (موجودی فعلی: {$before} عدد).";

                throw ValidationException::withMessages([
                    'quantity' => [$label],
                ]);
            }

            // به‌روزرسانی مشروط: فقط اگر موجودی از زمان خواندن تغییر نکرده باشد.
            $affected = DB::table('parts')
                ->where('id', $locked->getKey())
                ->where('stock_quantity', $before)
                ->update([
                    'stock_quantity' => $after,
                    'updated_at' => Carbon::now(),
                ]);

            if ($affected !== 1) {
                throw ValidationException::withMessages([
                    'quantity' => ['موجودی انبار همزمان توسط کاربر دیگری تغییر کرد. لطفاً عملیات را تکرار کنید.'],
                ]);
            }

            $locked->stock_quantity = $after;
            $part->stock_quantity = $after;

            /** @var Customer|null $customer */
            $customer = $context['customer'] ?? null;
            /** @var CustomerPart|null $customerPart */
            $customerPart = $context['customer_part'] ?? null;

            $log = InventoryLog::create([
                'part_id' => $locked->getKey(),
                'customer_id' => $customer?->getKey() ?? $customerPart?->customer_id,
                'customer_part_id' => $customerPart?->getKey(),
                'user_id' => $context['user_id'] ?? null,
                'type' => $type,
                'quantity' => $quantity,
                'stock_before' => $before,
                'stock_after' => $after,
                'reference' => $context['reference'] ?? $customerPart?->invoice_number ?? $customerPart?->serial_number,
                'notes' => $context['notes'] ?? null,
                'logged_at' => Carbon::now(),
            ]);

            return $log->load(['part', 'user', 'customer']);
        });
    }

    /**
     * کوئری پایه تاریخچه انبار با eager-load کردن روابط لازم برای نمایش
     * نام ثبت‌کننده و لینک پروفایل مشتری.
     */
    public function logsQuery(array $filters = [])
    {
        $query = InventoryLog::query()->with(['part:id,name,code,unit_label', 'user:id,name,email,avatar', 'customer:id,first_name,last_name,company_name,mobile']);

        if (!empty($filters['part_id'])) {
            $query->where('part_id', (int) $filters['part_id']);
        }

        if (!empty($filters['customer_id'])) {
            $query->where('customer_id', (int) $filters['customer_id']);
        }

        if (!empty($filters['user_id'])) {
            $query->where('user_id', (int) $filters['user_id']);
        }

        if (!empty($filters['type']) && in_array($filters['type'], InventoryLog::TYPES, true)) {
            $query->where('type', $filters['type']);
        }

        if (!empty($filters['from'])) {
            $query->whereDate('logged_at', '>=', $filters['from']);
        }

        if (!empty($filters['to'])) {
            $query->whereDate('logged_at', '<=', $filters['to']);
        }

        if (!empty($filters['q'])) {
            $term = trim((string) $filters['q']);
            $query->where(function ($q) use ($term) {
                $q->where('reference', 'like', "%{$term}%")
                    ->orWhere('notes', 'like', "%{$term}%")
                    ->orWhereHas('part', function ($pq) use ($term) {
                        $pq->where('name', 'like', "%{$term}%")->orWhere('code', 'like', "%{$term}%");
                    })
                    ->orWhereHas('user', function ($uq) use ($term) {
                        $uq->where('name', 'like', "%{$term}%");
                    });
            });
        }

        // محدودسازی به مشتریانِ قابل مشاهده توسط کاربر جاری (تسک ۱ — RBAC)
        // لاگ‌های بدون مشتری (ورود مستقیم به انبار) برای همه دارندگان مجوز قابل مشاهده است.
        if (isset($filters['visibility_user']) && $filters['visibility_user'] instanceof User) {
            $user = $filters['visibility_user'];
            if (!$user->hasGlobalCustomerAccess()) {
                $query->where(function ($q) use ($user) {
                    $q->whereNull('customer_id')
                        ->orWhereIn('customer_id', Customer::query()->visibleTo($user)->select('customers.id'));
                });
            }
        }

        return $query->latest('logged_at')->latest('id');
    }
}
