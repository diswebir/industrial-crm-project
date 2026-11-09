<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\InventoryLog;
use App\Models\Part;
use App\Services\Inventory\InventoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InventoryController extends Controller
{
    public function __construct(protected InventoryService $inventory)
    {
    }

    /**
     * تاریخچه کامل تراکنش‌های انبار (ورود، خروج جهت تخصیص، برگشت، اصلاح)
     * همراه با نام ثبت‌کننده و مشتریِ مرتبط (لینک‌دار در UI).
     */
    public function logs(Request $request): JsonResponse
    {
        $this->authorizePermission('inventory.view');

        $query = InventoryLog::query()
            ->with([
                'part:id,name,code,stock_quantity',
                'user:id,name,user_type',
                'customer:id,first_name,last_name,company_name,type',
            ])
            ->latest();

        if ($request->filled('part_id')) {
            $query->where('part_id', (int) $request->part_id);
        }

        if ($request->filled('type') && array_key_exists($request->type, InventoryLog::TYPE_LABELS)) {
            $query->where('type', $request->type);
        }

        if ($request->filled('customer_id')) {
            $query->where('customer_id', (int) $request->customer_id);
        }

        if ($request->filled('user_id')) {
            $query->where('user_id', (int) $request->user_id);
        }

        if ($request->filled('from')) {
            $query->whereDate('created_at', '>=', $request->from);
        }

        if ($request->filled('to')) {
            $query->whereDate('created_at', '<=', $request->to);
        }

        if ($request->filled('q')) {
            $term = trim($request->q);
            $op = $this->likeOp();
            $query->where(function ($q) use ($term, $op) {
                $q->whereHas('part', function ($p) use ($term, $op) {
                    $p->where('name', $op, "%{$term}%")
                        ->orWhere('code', $op, "%{$term}%");
                })->orWhereHas('customer', function ($c) use ($term, $op) {
                    $c->where('first_name', $op, "%{$term}%")
                        ->orWhere('last_name', $op, "%{$term}%")
                        ->orWhere('company_name', $op, "%{$term}%")
                        ->orWhere('mobile', $op, "%{$term}%");
                })->orWhere('note', $op, "%{$term}%");
            });
        }

        $perPage = max(1, min(200, (int) $request->input('per_page', 25)));

        return response()->json($query->paginate($perPage));
    }

    /**
     * خلاصه موجودی دستگاه‌ها برای کارت‌های بالای صفحه انبار.
     */
    public function summary(): JsonResponse
    {
        $this->authorizePermission('inventory.view');

        $parts = Part::query()
            ->withSum('customerParts as allocated_quantity', 'quantity')
            ->get(['id', 'name', 'code', 'stock_quantity', 'min_stock_quantity']);

        $totalStock = (int) $parts->sum('stock_quantity');
        $totalAllocated = (int) $parts->sum(fn (Part $p) => (int) ($p->allocated_quantity ?? 0));
        $lowStock = $parts->filter(fn (Part $p) => (int) $p->min_stock_quantity > 0 && (int) $p->stock_quantity <= (int) $p->min_stock_quantity)->count();

        $todayMoves = InventoryLog::query()
            ->whereDate('created_at', now()->toDateString())
            ->count();

        return response()->json([
            'total_parts' => $parts->count(),
            'total_stock' => $totalStock,
            'total_allocated' => $totalAllocated,
            'low_stock_parts' => $lowStock,
            'today_movements' => $todayMoves,
        ]);
    }

    /**
     * ثبت ورود/خروج/اصلاح موجودی. کل عملیات در Transaction با قفل ردیف انجام می‌شود.
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorizePermission('inventory.manage');

        $validated = $request->validate([
            'part_id' => 'required|exists:parts,id',
            'type' => 'required|in:in,out,adjust',
            'quantity' => 'required|integer|min:0',
            'note' => 'nullable|string|max:1000',
        ], [
            'part_id.required' => 'دستگاه موردنظر را انتخاب کنید.',
            'type.required' => 'نوع تراکنش انبار را انتخاب کنید.',
            'quantity.required' => 'تعداد را وارد کنید.',
            'quantity.integer' => 'تعداد باید عدد صحیح باشد.',
            'quantity.min' => 'تعداد نمی‌تواند منفی باشد.',
        ]);

        $part = Part::findOrFail($validated['part_id']);
        $userId = $request->user()->id;
        $quantity = (int) $validated['quantity'];
        $note = $validated['note'] ?? null;

        $log = match ($validated['type']) {
            'in' => $this->inventory->stockIn($part, $quantity, $userId, $note),
            'out' => $this->inventory->stockOut($part, $quantity, $userId, $note),
            'adjust' => $this->inventory->adjustTo($part, $quantity, $userId, $note),
        };

        return response()->json([
            'message' => 'تراکنش انبار با موفقیت ثبت شد.',
            'log' => $log->load(['part', 'user:id,name', 'customer:id,first_name,last_name,company_name,type']),
            'stock_quantity' => $part->fresh()->stock_quantity,
        ], 201);
    }

    /**
     * فهرست دستگاه‌های دارای موجودی برای انتخاب سریع در فرم انبار.
     */
    public function parts(Request $request): JsonResponse
    {
        $this->authorizePermission('inventory.view');

        $parts = Part::query()
            ->orderBy('name')
            ->get(['id', 'name', 'code', 'stock_quantity', 'min_stock_quantity', 'is_active']);

        return response()->json($parts);
    }

    /**
     * لیست مشتریان برای فیلتر لاگ (فقط جهت انتخاب؛ لاگ‌ها با مجوز انبار دیده می‌شوند).
     */
    public function customers(Request $request): JsonResponse
    {
        $this->authorizePermission('inventory.view');

        $customers = Customer::query()
            ->visibleTo($request->user())
            ->orderBy('company_name')
            ->limit(500)
            ->get(['id', 'first_name', 'last_name', 'company_name', 'type', 'mobile']);

        return response()->json($customers);
    }

    protected function authorizePermission(string $permission): void
    {
        $user = auth()->user();
        if (!$user || !$user->hasPermissionTo($permission)) {
            abort(403, "شما دسترسی لازم ({$permission}) برای این عملیات را ندارید.");
        }
    }
}
