<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerPart;
use App\Models\InventoryLog;
use App\Models\Part;
use App\Services\Customers\CustomerService;
use App\Services\Inventory\InventoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PartController extends Controller
{
    public function __construct(protected CustomerService $customerService, protected InventoryService $inventory)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission('parts.view');
        $user = $request->user();
        $query = Part::withCount(['customerParts' => fn ($query) => $query->whereHas('customer', fn ($customers) => $customers->visibleTo($user))])->latest();

        if ($request->filled('q')) {
            $term = trim($request->q);
            $op = $this->likeOp();
            $query->where(function ($q) use ($term, $op): void {
                $q->where('name', $op, "%{$term}%")
                    ->orWhere('code', $op, "%{$term}%")
                    ->orWhere('description', $op, "%{$term}%");
            });
        }
        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizePermission('parts.manage');
        $validated = $request->validate([
            'name' => 'required|string|max:150',
            'code' => ['required', 'string', 'max:50', 'regex:/^[a-zA-Z0-9]+$/', 'unique:parts,code'],
            'periodic_service_months' => 'required|integer|min:1',
            'description' => 'nullable|string',
            'is_active' => 'boolean',
        ], [
            'code.regex' => 'کد دستگاه فقط می‌تواند شامل حروف انگلیسی و اعداد باشد.',
            'code.unique' => 'این کد دستگاه قبلاً در سیستم ثبت شده است.',
        ]);
        $part = Part::create($validated);
        return response()->json(['message' => 'مدل دستگاه در کاتالوگ ثبت شد.', 'part' => $part], 201);
    }

    public function show(Request $request, Part $part): JsonResponse
    {
        $this->authorizePermission('parts.view');
        $user = $request->user();
        $part->load([
            'customerParts' => fn ($query) => $query->whereHas('customer', fn ($customers) => $customers->visibleTo($user)),
            'customerParts.customer',
        ]);
        return response()->json($part);
    }

    public function update(Request $request, Part $part): JsonResponse
    {
        $this->authorizePermission('parts.manage');
        $validated = $request->validate([
            'name' => 'sometimes|string|max:150',
            'code' => ['sometimes', 'string', 'max:50', 'regex:/^[a-zA-Z0-9]+$/', Rule::unique('parts', 'code')->ignore($part->id)],
            'periodic_service_months' => 'sometimes|integer|min:1',
            'description' => 'nullable|string',
            'is_active' => 'boolean',
        ], [
            'code.regex' => 'کد دستگاه فقط می‌تواند شامل حروف انگلیسی و اعداد باشد.',
            'code.unique' => 'این کد دستگاه قبلاً در سیستم ثبت شده است.',
        ]);
        $part->update($validated);
        return response()->json(['message' => 'مشخصات دستگاه بروزرسانی شد.', 'part' => $part]);
    }

    public function destroy(Part $part): JsonResponse
    {
        $this->authorizePermission('parts.manage');
        return DB::transaction(function () use ($part): JsonResponse {
            // The same device lock is held by stock and assignment operations.
            $part = Part::query()->whereKey($part->id)->lockForUpdate()->firstOrFail();
            if (CustomerPart::withTrashed()->where('part_id', $part->id)->exists() || $part->inventoryLogs()->exists() || $part->stock_quantity > 0) {
                return response()->json(['message' => 'دستگاهی که موجودی، تخصیص یا سابقه انبار دارد حذف نمی‌شود؛ آن را غیرفعال کنید.'], 422);
            }
            $part->delete();
            return response()->json(['message' => 'مدل دستگاه از کاتالوگ حذف شد.']);
        }, 3);
    }

    public function assign(Request $request, Customer $customer): JsonResponse
    {
        $this->authorizePermission('parts.assign');
        $this->authorizeCustomer($customer);
        $validated = $request->validate([
            'part_id' => 'required|integer|exists:parts,id',
            'serial_number' => ['required', 'string', 'max:100', 'regex:/^[a-zA-Z0-9]+$/', 'unique:customer_parts,serial_number'],
            'quantity' => 'required|integer|min:1|max:2147483647',
            'invoice_amount' => 'nullable|numeric|min:0|max:999999999999.99|decimal:0,2',
            'invoice_number' => 'nullable|string|max:100',
            'installation_date' => 'nullable|date',
            'notes' => 'nullable|string',
        ], [
            'serial_number.regex' => 'شناسه دستگاه فقط می‌تواند شامل حروف انگلیسی و اعداد باشد.',
            'serial_number.unique' => 'این شناسه قبلاً ثبت شده است.',
        ]);
        $part = Part::findOrFail($validated['part_id']);
        $customerPart = $this->customerService->assignPart($customer, $part, $validated['serial_number'], $validated, $request->user());
        return response()->json([
            'message' => "دستگاه «{$part->name}» به مشتری تخصیص داده شد.",
            'customer_part' => $customerPart,
            'customer_type' => $customer->fresh()->customer_type,
        ], 201);
    }

    public function updateAssignment(Request $request, CustomerPart $customerPart): JsonResponse
    {
        $this->authorizePermission('parts.assign');
        $this->authorizeCustomer($customerPart->customer);
        $validated = $request->validate([
            'serial_number' => ['required', 'string', 'max:100', 'regex:/^[a-zA-Z0-9]+$/', Rule::unique('customer_parts', 'serial_number')->ignore($customerPart->id)],
            'quantity' => 'required|integer|min:1|max:2147483647',
            'invoice_amount' => 'nullable|numeric|min:0|max:999999999999.99|decimal:0,2',
            'invoice_number' => 'nullable|string|max:100',
            'installation_date' => 'nullable|date',
            'status' => 'sometimes|in:active,under_repair,replaced,retired',
            'notes' => 'nullable|string',
        ]);
        $assignment = $this->customerService->updateAssignment($customerPart, $validated, $request->user());
        return response()->json(['message' => 'تخصیص دستگاه بروزرسانی شد.', 'customer_part' => $assignment]);
    }

    public function deleteAssignment(Request $request, CustomerPart $customerPart): JsonResponse
    {
        $this->authorizePermission('parts.assign');
        $this->authorizeCustomer($customerPart->customer);
        $this->customerService->deleteAssignment($customerPart, $request->user());
        return response()->json(['message' => 'تخصیص حذف و موجودی به انبار بازگردانده شد.']);
    }

    public function addServiceHistory(Request $request, CustomerPart $customerPart): JsonResponse
    {
        $this->authorizePermission('parts.history');
        $this->authorizeCustomer($customerPart->customer);
        $validated = $request->validate([
            'service_date' => 'required|date',
            'service_type' => 'required|in:periodic,repair,overhaul',
            'description' => 'required|string',
            'cost' => 'nullable|numeric|min:0',
        ]);
        $history = $this->customerService->recordServiceHistory($customerPart, $validated, $request->user());
        return response()->json(['message' => 'سابقه سرویس/تعمیر ثبت شد.', 'history' => $history->load('performedBy')], 201);
    }

    public function adjustStock(Request $request, Part $part): JsonResponse
    {
        $this->authorizePermission('parts.manage');
        $validated = $request->validate([
            'type' => 'required|in:in,out',
            'quantity' => 'required|integer|min:1|max:2147483647',
            'note' => 'nullable|string|max:2000',
        ]);
        $log = $this->inventory->adjust($part, $validated['type'], (int) $validated['quantity'], $request->user(), $validated['note'] ?? null);
        return response()->json(['message' => 'تغییر موجودی ثبت شد.', 'part' => $part->fresh(), 'log' => $log], 201);
    }

    public function inventoryLogs(Request $request): JsonResponse
    {
        $this->authorizePermission('parts.view');
        $user = $request->user();
        $query = InventoryLog::with(['part', 'customer', 'user'])->latest('id');
        if ($user->hasRestrictedCustomers() && !$user->customer_access_all) {
            $query->where(function ($query) use ($user): void {
                $query->whereNull('customer_id')->orWhereHas('customer', fn ($customers) => $customers->visibleTo($user));
            });
        }
        if ($request->filled('part_id')) {
            $query->where('part_id', $request->input('part_id'));
        }
        return response()->json($query->paginate(min(max((int) $request->input('per_page', 25), 1), 100)));
    }

    protected function authorizePermission(string $permission): void
    {
        $user = auth()->user();
        if (!$user || !$user->hasPermissionTo($permission)) {
            abort(403, "شما دسترسی لازم ({$permission}) برای این عملیات را ندارید.");
        }
    }
}
