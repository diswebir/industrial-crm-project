<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerPart;
use App\Models\InventoryLog;
use App\Models\Part;
use App\Services\Inventory\InventoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  کنترلر انبار (تسک ۴) — ورود/خروج دستی و تاریخچه کامل تراکنش‌های انبار
 *
 *  در هر ردیف تاریخچه: نوع عملیات، تاریخ و ساعت دقیق، تعداد، ثبت‌کننده
 *  (کارمند) و مشتری (به‌همراه شناسه برای ساخت لینک پروفایل) برگردانده می‌شود.
 * ─────────────────────────────────────────────────────────────────────────────
 */
class InventoryController extends Controller
{
    public function __construct(protected InventoryService $inventoryService)
    {
    }

    /**
     * تاریخچه ورود/خروج انبار با فیلتر و صفحه‌بندی.
     */
    public function logs(Request $request): JsonResponse
    {
        $this->authorizePermission('inventory.logs');

        $filters = [
            'part_id' => $request->input('part_id'),
            'customer_id' => $request->input('customer_id'),
            'user_id' => $request->input('user_id'),
            'type' => $request->input('type'),
            'from' => $request->input('from'),
            'to' => $request->input('to'),
            'q' => $request->input('q'),
            'visibility_user' => $this->currentUser(),
        ];

        $perPage = max(1, min(100, (int) $request->input('per_page', 20)));

        $logs = $this->inventoryService->logsQuery($filters)->paginate($perPage)->withQueryString();

        return response()->json($logs);
    }

    /**
     * ثبت حرکت دستی انبار: ورود کالا، خروج کالا یا اصلاح موجودی.
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorizePermission('inventory.manage');

        $validated = $request->validate([
            'part_id' => 'required|exists:parts,id',
            'type' => 'required|in:in,out,adjustment',
            'quantity' => 'required|integer|min:1|max:10000000',
            'notes' => 'nullable|string|max:500',
            'reference' => 'nullable|string|max:100',
            'customer_id' => 'nullable|exists:customers,id',
            'customer_part_id' => 'nullable|exists:customer_parts,id',
        ], [
            'part_id.required' => 'انتخاب دستگاه الزامی است.',
            'part_id.exists' => 'دستگاه انتخاب‌شده در کاتالوگ وجود ندارد.',
            'type.required' => 'نوع عملیات انبار را مشخص کنید.',
            'type.in' => 'نوع عملیات انبار باید یکی از موارد «ورود»، «خروج» یا «اصلاح موجودی» باشد.',
            'quantity.required' => 'تعداد الزامی است.',
            'quantity.integer' => 'تعداد باید یک عدد صحیح باشد.',
            'quantity.min' => 'تعداد باید حداقل ۱ باشد.',
            'customer_id.exists' => 'مشتری انتخاب‌شده وجود ندارد.',
        ]);

        $part = Part::findOrFail((int) $validated['part_id']);

        $customer = null;
        if (!empty($validated['customer_id'])) {
            $customer = Customer::find((int) $validated['customer_id']);
            $this->authorizeCustomerAccess($customer, null);
        }

        $customerPart = null;
        if (!empty($validated['customer_part_id'])) {
            $customerPart = CustomerPart::with('customer')->find((int) $validated['customer_part_id']);
            if ($customerPart) {
                $this->authorizeCustomerAccess($customerPart->customer, null);
            }
        }

        $userId = $this->currentUserId();

        $log = match ($validated['type']) {
            InventoryLog::TYPE_IN => $this->inventoryService->receive(
                part: $part,
                quantity: (int) $validated['quantity'],
                userId: $userId,
                notes: $validated['notes'] ?? 'ورود دستی کالا به انبار',
                reference: $validated['reference'] ?? null,
                customer: $customer,
            ),
            InventoryLog::TYPE_OUT => $this->inventoryService->issue(
                part: $part,
                quantity: (int) $validated['quantity'],
                userId: $userId,
                customer: $customer,
                customerPart: $customerPart,
                notes: $validated['notes'] ?? 'خروج دستی کالا از انبار',
                reference: $validated['reference'] ?? null,
            ),
            default => $this->inventoryService->adjustTo(
                part: $part,
                newStock: (int) $validated['quantity'],
                userId: $userId,
                notes: $validated['notes'] ?? null,
            ),
        };

        $labels = config('acl.inventory.types');

        return response()->json([
            'message' => "{$labels[$log->type]} برای دستگاه «{$part->name}» با موفقیت ثبت شد. موجودی فعلی: {$log->stock_after} عدد",
            'log' => $log,
            'part' => $part->fresh(),
        ], 201);
    }

    /**
     * خلاصه وضعیت انبار برای کارت‌های آماری و داشبورد.
     */
    public function summary(Request $request): JsonResponse
    {
        $this->authorizePermission('parts.view');

        $user = $this->currentUser();

        $totalDevices = Part::count();
        $activeDevices = Part::where('is_active', true)->count();
        $totalStock = (int) Part::sum('stock_quantity');
        $lowStock = Part::where('min_stock_quantity', '>', 0)
            ->whereColumn('stock_quantity', '<=', 'min_stock_quantity')
            ->count();

        $assignedTotal = (int) CustomerPart::visibleTo($user)->sum('quantity');
        $assignmentRows = CustomerPart::visibleTo($user)->count();

        $today = now()->toDateString();
        $receivedToday = (int) InventoryLog::whereIn('type', [InventoryLog::TYPE_IN, InventoryLog::TYPE_RETURN])
            ->whereDate('logged_at', $today)->sum('quantity');
        $issuedToday = (int) InventoryLog::where('type', InventoryLog::TYPE_OUT)
            ->whereDate('logged_at', $today)->sum('quantity');

        $lowStockItems = Part::where('min_stock_quantity', '>', 0)
            ->whereColumn('stock_quantity', '<=', 'min_stock_quantity')
            ->orderBy('stock_quantity')
            ->take(6)
            ->get(['id', 'name', 'code', 'stock_quantity', 'min_stock_quantity', 'unit_label']);

        return response()->json([
            'total_devices' => $totalDevices,
            'active_devices' => $activeDevices,
            'total_stock' => $totalStock,
            'low_stock_count' => $lowStock,
            'low_stock_items' => $lowStockItems,
            'assigned_quantity' => $assignedTotal,
            'assignment_rows' => $assignmentRows,
            'received_today' => $receivedToday,
            'issued_today' => $issuedToday,
        ]);
    }

    /**
     * کارت موجودی یک دستگاه به‌همراه آخرین تراکنش‌های انبار آن.
     */
    public function show(Request $request, Part $part): JsonResponse
    {
        $this->authorizePermission('inventory.logs');

        $perPage = max(1, min(50, (int) $request->input('per_page', 10)));

        $logs = $this->inventoryService->logsQuery([
            'part_id' => $part->id,
            'visibility_user' => $this->currentUser(),
        ])->paginate($perPage);

        return response()->json([
            'part' => $part->loadCount('customerParts'),
            'logs' => $logs,
        ]);
    }

    /**
     * همگام‌سازی موجودی انبار با تخصیص‌های ثبت‌شده (ابزار مدیر، فقط در صورت نیاز).
     *
     * این متد هیچ داده‌ای را حذف نمی‌کند؛ فقط مجموع دستگاه‌های تخصیص‌یافته را
     * گزارش می‌دهد تا مدیر بتواند موجودی واقعی انبار را ثبت کند.
     */
    public function reconciliation(): JsonResponse
    {
        $this->authorizePermission('inventory.manage');

        $rows = DB::table('parts')
            ->selectRaw('parts.id, parts.name, parts.code, parts.stock_quantity, parts.min_stock_quantity')
            ->selectRaw('COALESCE(SUM(customer_parts.quantity), 0) as assigned_quantity')
            ->leftJoin('customer_parts', 'customer_parts.part_id', '=', 'parts.id')
            ->groupBy('parts.id', 'parts.name', 'parts.code', 'parts.stock_quantity', 'parts.min_stock_quantity')
            ->orderBy('parts.id')
            ->get();

        return response()->json([
            'message' => 'گزارش تطبیق موجودی انبار با دستگاه‌های تخصیص‌یافته.',
            'items' => $rows,
        ]);
    }
}
