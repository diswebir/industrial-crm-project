<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerPart;
use App\Models\PartServiceHistory;
use App\Models\InventoryLog;
use App\Models\Part;
use App\Services\Customers\CustomerAccessService;
use App\Services\Customers\CustomerService;
use App\Services\Inventory\InventoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PartController extends Controller
{
    public function __construct(
        protected CustomerService $customerService,
        protected CustomerAccessService $access,
        protected InventoryService $inventory
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission('parts.view');

        $query = Part::query()
            ->withCount('customerParts')
            ->withSum('customerParts as customer_parts_sum_quantity', 'quantity')
            ->latest();

        if ($request->filled('q')) {
            $term = trim($request->q);
            $op = $this->likeOp();
            $query->where(function ($q) use ($term, $op) {
                $q->where('name', $op, "%{$term}%")
                    ->orWhere('code', $op, "%{$term}%")
                    ->orWhere('description', $op, "%{$term}%");
            });
        }

        if ($request->boolean('only_in_stock')) {
            $query->where('stock_quantity', '>', 0);
        }

        $parts = $query->get();

        return response()->json($parts);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizePermission('parts.manage');

        $validated = $request->validate([
            'name' => 'required|string|max:150',
            'code' => ['required', 'string', 'max:50', 'regex:/^[A-Za-z0-9\-_]+$/', 'unique:parts,code'],
            'periodic_service_months' => 'required|integer|min:1',
            'description' => 'nullable|string',
            'is_active' => 'boolean',
            'stock_quantity' => 'nullable|integer|min:0',
            'min_stock_quantity' => 'nullable|integer|min:0',
        ], [
            'code.regex' => 'کد دستگاه (SKU) فقط می‌تواند شامل حروف انگلیسی، اعداد و خط تیره باشد.',
            'code.unique' => 'این کد دستگاه قبلاً در سیستم ثبت شده است.',
            'stock_quantity.min' => 'موجودی اولیه نمی‌تواند منفی باشد.',
        ]);

        $initialStock = (int) ($validated['stock_quantity'] ?? 0);
        unset($validated['stock_quantity']);

        $part = DB::transaction(function () use ($validated, $initialStock, $request) {
            $part = Part::create(array_merge($validated, [
                'stock_quantity' => 0,
                'min_stock_quantity' => (int) ($validated['min_stock_quantity'] ?? 0),
            ]));

            if ($initialStock > 0) {
                $this->inventory->record(
                    $part,
                    InventoryLog::TYPE_IN,
                    $initialStock,
                    $request->user()->id,
                    null,
                    null,
                    'موجودی اولیه هنگام ثبت دستگاه در کاتالوگ'
                );
            }

            return $part->refresh();
        });

        return response()->json([
            'message' => 'مدل دستگاه با موفقیت در کاتالوگ ثبت شد.',
            'part' => $part,
        ], 201);
    }

    public function show(Request $request, Part $part): JsonResponse
    {
        $this->authorizePermission('parts.view');

        $user = $request->user();

        $assignments = $part->customerParts()
            ->with(['customer:id,first_name,last_name,company_name,type,mobile,created_by', 'assignedBy:id,name'])
            ->latest()
            ->get()
            ->filter(fn (CustomerPart $cp) => $this->access->canView($user, $cp->customer))
            ->values();

        $part->setRelation('customerParts', $assignments);
        $part->load(['inventoryLogs.user', 'inventoryLogs.customer']);

        return response()->json($part);
    }

    public function update(Request $request, Part $part): JsonResponse
    {
        $this->authorizePermission('parts.manage');

        $validated = $request->validate([
            'name' => 'sometimes|string|max:150',
            'code' => ['sometimes', 'string', 'max:50', 'regex:/^[A-Za-z0-9\-_]+$/', Rule::unique('parts', 'code')->ignore($part->id)],
            'periodic_service_months' => 'sometimes|integer|min:1',
            'description' => 'nullable|string',
            'is_active' => 'boolean',
            'stock_quantity' => 'nullable|integer|min:0',
            'min_stock_quantity' => 'nullable|integer|min:0',
        ], [
            'code.regex' => 'کد دستگاه (SKU) فقط می‌تواند شامل حروف انگلیسی، اعداد و خط تیره باشد.',
            'code.unique' => 'این کد دستگاه قبلاً در سیستم ثبت شده است.',
            'stock_quantity.min' => 'موجودی نمی‌تواند منفی باشد.',
        ]);

        $newStock = array_key_exists('stock_quantity', $validated) ? (int) $validated['stock_quantity'] : null;
        unset($validated['stock_quantity']);

        $stockChanged = $newStock !== null && $newStock !== (int) $part->stock_quantity;

        // تغییر مستقیم موجودی فقط با مجوز انبار و همراه با ثبت لاگ «اصلاح موجودی».
        // اعتبارسنجی مجوز قبل از هر تغییری انجام می‌شود تا ویرایش نیمه‌کاره رخ ندهد.
        if ($stockChanged && ! $request->user()?->hasPermissionTo('inventory.manage')) {
            return response()->json([
                'message' => 'تغییر موجودی انبار نیازمند مجوز «مدیریت انبار» است. از فرم ورود/خروج کالا استفاده کنید.',
            ], 403);
        }

        DB::transaction(function () use ($part, $validated, $stockChanged, $newStock, $request) {
            $part->update($validated);

            if ($stockChanged) {
                $this->inventory->adjustTo(
                    $part,
                    (int) $newStock,
                    $request->user()->id,
                    'اصلاح موجودی از فرم ویرایش کاتالوگ دستگاه'
                );
            }
        });

        return response()->json([
            'message' => 'مشخصات مدل دستگاه بروزرسانی شد.',
            'part' => $part->refresh(),
        ]);
    }

    public function destroy(Part $part): JsonResponse
    {
        $this->authorizePermission('parts.manage');

        if ($part->customerParts()->exists()) {
            return response()->json([
                'message' => 'این دستگاه به مشتریان تخصیص داده شده و امکان حذف مستقیم آن وجود ندارد.',
            ], 422);
        }

        if ((int) $part->stock_quantity > 0) {
            return response()->json([
                'message' => 'موجودی انبار این دستگاه صفر نیست. ابتدا موجودی را در بخش انبار اصلاح یا خارج کنید.',
            ], 422);
        }

        $part->delete();

        return response()->json([
            'message' => 'مدل دستگاه با موفقیت حذف شد.',
        ]);
    }

    /**
     * تخصیص دستگاه (با تعداد، شماره و مبلغ فاکتور) به مشتری.
     * موجودی انبار به صورت خودکار و اتمیک کسر می‌شود.
     */
    public function assign(Request $request, Customer $customer): JsonResponse
    {
        $this->authorizePermission('parts.assign');
        $this->access->authorizeEdit($request->user(), $customer);

        $this->normalizeAssignmentInput($request);

        $validated = $request->validate([
            'part_id' => 'required|exists:parts,id',
            'quantity' => 'required|integer|min:1|max:100000',
            'serial_number' => ['nullable', 'string', 'max:100', 'regex:/^[A-Za-z0-9\-_\/]+$/', 'unique:customer_parts,serial_number'],
            'invoice_number' => 'nullable|string|max:100',
            'invoice_amount' => 'nullable|numeric|min:0',
            'installation_date' => 'nullable|date',
            'warranty_expire_date' => 'nullable|date',
            'status' => 'nullable|in:active,under_repair,replaced,retired',
            'notes' => 'nullable|string',
        ], [
            'quantity.required' => 'تعداد دستگاه را وارد کنید.',
            'quantity.min' => 'تعداد دستگاه باید حداقل ۱ عدد باشد.',
            'serial_number.regex' => 'شماره سریال فقط می‌تواند شامل حروف انگلیسی، اعداد، خط تیره و اسلش باشد.',
            'serial_number.unique' => 'این شماره سریال قبلاً برای دستگاه دیگری ثبت شده است.',
            'invoice_amount.numeric' => 'مبلغ فاکتور باید عددی باشد.',
        ]);

        $part = Part::findOrFail($validated['part_id']);

        $customerPart = $this->customerService->assignDevice(
            $customer,
            $part,
            $validated,
            $request->user()->id
        );

        return response()->json([
            'message' => "دستگاه «{$part->name}» به تعداد {$customerPart->quantity} عدد به مشتری تخصیص داده شد.",
            'customer_part' => $customerPart,
            'customer_type' => $customer->fresh()->customer_type,
            'stock_quantity' => $part->fresh()->stock_quantity,
        ], 201);
    }

    /**
     * ویرایش رکورد تخصیص‌یافته (تعداد، فاکتور، مدل، تاریخ‌ها، وضعیت، یادداشت).
     */
    public function updateAssignment(Request $request, CustomerPart $customerPart): JsonResponse
    {
        $this->authorizePermission('parts.assign.edit');

        $customer = $customerPart->customer;
        if (! $customer) {
            abort(404, 'مشتری این تخصیص یافت نشد.');
        }

        $this->access->authorizeEdit($request->user(), $customer);

        $this->normalizeAssignmentInput($request);

        $validated = $request->validate([
            'part_id' => 'sometimes|exists:parts,id',
            'quantity' => 'sometimes|integer|min:1|max:100000',
            'serial_number' => [
                'nullable', 'string', 'max:100', 'regex:/^[A-Za-z0-9\-_\/]+$/',
                Rule::unique('customer_parts', 'serial_number')->ignore($customerPart->id),
            ],
            'invoice_number' => 'nullable|string|max:100',
            'invoice_amount' => 'nullable|numeric|min:0',
            'installation_date' => 'nullable|date',
            'warranty_expire_date' => 'nullable|date',
            'status' => 'nullable|in:active,under_repair,replaced,retired',
            'notes' => 'nullable|string',
        ], [
            'quantity.min' => 'تعداد دستگاه باید حداقل ۱ عدد باشد.',
            'serial_number.regex' => 'شماره سریال فقط می‌تواند شامل حروف انگلیسی، اعداد، خط تیره و اسلش باشد.',
            'serial_number.unique' => 'این شماره سریال قبلاً برای دستگاه دیگری ثبت شده است.',
        ]);

        $customerPart = $this->customerService->updateDevice($customerPart, $validated, $request->user()->id);

        return response()->json([
            'message' => 'رکورد دستگاه تخصیص‌یافته با موفقیت ویرایش شد.',
            'customer_part' => $customerPart,
        ]);
    }

    /**
     * حذف رکورد تخصیص و برگشت خودکار موجودی به انبار.
     */
    public function destroyAssignment(Request $request, CustomerPart $customerPart): JsonResponse
    {
        $this->authorizePermission('parts.assign.delete');

        $customer = $customerPart->customer;
        if (! $customer) {
            abort(404, 'مشتری این تخصیص یافت نشد.');
        }

        $this->access->authorizeEdit($request->user(), $customer);

        $partName = $customerPart->part?->name ?? 'دستگاه';
        $quantity = (int) $customerPart->quantity;

        $this->customerService->deleteDevice($customerPart, $request->user()->id);

        return response()->json([
            'message' => "تخصیص دستگاه «{$partName}» ({$quantity} عدد) حذف و موجودی آن به انبار برگشت داده شد.",
        ]);
    }

    /**
     * ثبت سابقه سرویس یا تعمیر برای دستگاه تخصیص‌یافته.
     */
    public function addServiceHistory(Request $request, CustomerPart $customerPart): JsonResponse
    {
        $this->authorizePermission('parts.history');

        $customer = $customerPart->customer;
        if (! $customer) {
            abort(404, 'مشتری این تخصیص یافت نشد.');
        }

        $this->access->authorizeView($request->user(), $customer);

        $validated = $request->validate([
            'service_date' => 'required|date',
            'service_type' => 'required|in:periodic,repair,overhaul',
            'description' => 'required|string',
            'cost' => 'nullable|numeric|min:0',
        ], [
            'service_date.required' => 'تاریخ انجام سرویس را انتخاب کنید.',
            'description.required' => 'شرح خدمات انجام‌شده الزامی است.',
        ]);

        $history = $this->customerService->recordServiceHistory(
            $customerPart,
            $validated,
            $request->user()->id
        );

        return response()->json([
            'message' => 'سابقه سرویس/تعمیر با موفقیت ثبت شد.',
            'history' => $history->load('performedBy'),
        ], 201);
    }

    /**
     * نرمال‌سازی ورودی‌های تخصیص (ارقام فارسی، جداکننده هزارگان، سریال خالی).
     */
    /**
     * حذف یک سابقه سرویس/تعمیر ثبت‌شده برای دستگاه تخصیص‌یافته.
     */
    public function destroyServiceHistory(
        Request $request,
        CustomerPart $customerPart,
        PartServiceHistory $history
    ): JsonResponse {
        $this->authorizePermission('parts.history');

        $customer = $customerPart->customer;
        if (! $customer) {
            abort(404, 'مشتری این تخصیص یافت نشد.');
        }

        $this->access->authorizeEdit($request->user(), $customer);

        if ((int) $history->customer_part_id !== (int) $customerPart->id) {
            abort(404, 'سابقه سرویس موردنظر برای این دستگاه یافت نشد.');
        }

        $description = $history->description;

        DB::transaction(function () use ($customer, $customerPart, $history, $request, $description) {
            $customer->histories()->create([
                'user_id' => $request->user()->id,
                'action' => 'service_deleted',
                'description' => "یک سابقه سرویس/تعمیر دستگاه «{$customerPart->part?->name}» حذف شد: {$description}",
                'metadata' => [
                    'service_history_id' => $history->id,
                    'customer_part_id' => $customerPart->id,
                ],
            ]);

            $history->delete();
        });

        return response()->json([
            'message' => 'سابقه سرویس/تعمیر با موفقیت حذف شد.',
        ]);
    }

    protected function normalizeAssignmentInput(Request $request): void
    {
        $normalized = [];

        if ($request->has('invoice_amount')) {
            $raw = $request->input('invoice_amount');
            if ($raw === null || trim((string) $raw) === '') {
                $normalized['invoice_amount'] = null;
            } else {
                $clean = preg_replace('/[^\d.]/', '', $this->toLatinDigits($raw)) ?? '';
                $normalized['invoice_amount'] = $clean === '' ? null : (float) $clean;
            }
        }

        if ($request->has('invoice_number')) {
            $value = trim((string) $request->input('invoice_number'));
            $normalized['invoice_number'] = $value === '' ? null : $value;
        }

        if ($request->has('serial_number')) {
            $value = trim((string) $request->input('serial_number'));
            $normalized['serial_number'] = $value === '' ? null : $value;
        }

        if ($request->has('quantity')) {
            $rawQuantity = preg_replace('/\D/', '', $this->toLatinDigits($request->input('quantity'))) ?? '';
            $normalized['quantity'] = $rawQuantity === '' ? 1 : (int) $rawQuantity;
        }

        $request->merge($normalized);
    }

    protected function authorizePermission(string $permission): void
    {
        $user = auth()->user();
        if (!$user || !$user->hasPermissionTo($permission)) {
            abort(403, "شما دسترسی لازم ({$permission}) برای این عملیات را ندارید.");
        }
    }
}
