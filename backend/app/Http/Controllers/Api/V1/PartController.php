<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerPart;
use App\Models\Part;
use App\Models\PartServiceHistory;
use App\Services\Customers\CustomerService;
use App\Services\Inventory\InventoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  کنترلر «دستگاه‌ها» — تسک ۲، ۳ و ۴
 *
 *  نکته معماری: کلیدهای مجوز و نام جدول/ستون‌های دیتابیس (parts.*) عمداً
 *  بدون تغییر باقی مانده‌اند تا داده‌ها و دسترسی‌های کاربران فعلی از بین نرود؛
 *  فقط مفاهیم و برچسب‌های کاربری به «دستگاه» تغییر یافته‌اند.
 * ─────────────────────────────────────────────────────────────────────────────
 */
class PartController extends Controller
{
    public function __construct(
        protected CustomerService $customerService,
        protected InventoryService $inventoryService,
    ) {
    }

    /**
     * فهرست دستگاه‌های کاتالوگ همراه با موجودی انبار و آمار تخصیص.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission('parts.view');

        $query = Part::query()
            ->withCount('customerParts')
            ->withSum('customerParts as assigned_quantity', 'quantity')
            ->latest();

        if ($request->filled('q')) {
            $term = trim((string) $request->q);
            $op = $this->likeOp();
            $query->where(function ($q) use ($term, $op) {
                $q->where('name', $op, "%{$term}%")
                    ->orWhere('code', $op, "%{$term}%")
                    ->orWhere('description', $op, "%{$term}%");
            });
        }

        if ($request->boolean('low_stock')) {
            $query->whereColumn('stock_quantity', '<=', 'min_stock_quantity')->where('min_stock_quantity', '>', 0);
        }

        if ($request->filled('active')) {
            $query->where('is_active', $request->boolean('active'));
        }

        $parts = $query->get()->map(function (Part $part) {
            $part->setAttribute('is_low_stock', $part->isLowStock());

            return $part;
        });

        return response()->json($parts);
    }

    /**
     * ثبت دستگاه جدید در کاتالوگ (با موجودی اولیه انبار).
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorizePermission('parts.manage');

        $validated = $request->validate($this->deviceRules(isUpdate: false), $this->deviceMessages());

        $initialStock = max(0, (int) ($validated['stock_quantity'] ?? 0));

        $part = DB::transaction(function () use ($validated, $initialStock) {
            $part = Part::create([
                'name' => $validated['name'],
                'code' => $validated['code'],
                'periodic_service_months' => $validated['periodic_service_months'],
                'description' => $validated['description'] ?? null,
                'is_active' => $validated['is_active'] ?? true,
                'stock_quantity' => 0,
                'min_stock_quantity' => max(0, (int) ($validated['min_stock_quantity'] ?? 0)),
                'unit_label' => $validated['unit_label'] ?? 'عدد',
            ]);

            // موجودی اولیه از طریق سرویس انبار ثبت می‌شود تا لاگ آن هم ساخته شود
            if ($initialStock > 0) {
                $this->inventoryService->receive(
                    part: $part,
                    quantity: $initialStock,
                    userId: $this->currentUserId(),
                    notes: "ثبت موجودی اولیه هنگام تعریف دستگاه «{$part->name}» در کاتالوگ",
                );
            }

            return $part;
        });

        return response()->json([
            'message' => "دستگاه «{$part->name}» با موفقیت در کاتالوگ ثبت شد.",
            'part' => $part->fresh(),
        ], 201);
    }

    /**
     * جزییات دستگاه + تخصیص‌های آن (فقط مشتریانِ مجاز برای کاربر جاری).
     */
    public function show(Request $request, Part $part): JsonResponse
    {
        $this->authorizePermission('parts.view');

        $user = $this->currentUser();

        $part->load([
            'customerParts' => function ($query) use ($user) {
                $query->visibleTo($user)->with(['customer:id,first_name,last_name,company_name,mobile', 'assignedBy:id,name'])->latest();
            },
        ]);

        $part->setAttribute('is_low_stock', $part->isLowStock());
        $part->setAttribute('assigned_quantity', (int) $part->customerParts->sum('quantity'));

        return response()->json($part);
    }

    /**
     * ویرایش مشخصات دستگاه — تغییر موجودی از اینجا لاگ «اصلاح دستی» می‌سازد.
     */
    public function update(Request $request, Part $part): JsonResponse
    {
        $this->authorizePermission('parts.manage');

        $validated = $request->validate($this->deviceRules(isUpdate: true, partId: $part->id), $this->deviceMessages());

        DB::transaction(function () use ($part, $validated) {
            $part->fill([
                'name' => $validated['name'] ?? $part->name,
                'code' => $validated['code'] ?? $part->code,
                'periodic_service_months' => $validated['periodic_service_months'] ?? $part->periodic_service_months,
                'description' => array_key_exists('description', $validated) ? $validated['description'] : $part->description,
                'is_active' => array_key_exists('is_active', $validated) ? $validated['is_active'] : $part->is_active,
                'min_stock_quantity' => isset($validated['min_stock_quantity']) ? max(0, (int) $validated['min_stock_quantity']) : $part->min_stock_quantity,
                'unit_label' => array_key_exists('unit_label', $validated) && $validated['unit_label'] !== null ? $validated['unit_label'] : $part->unit_label,
            ])->save();

            if (array_key_exists('stock_quantity', $validated)) {
                $target = max(0, (int) $validated['stock_quantity']);
                if ($target !== (int) $part->stock_quantity) {
                    $this->inventoryService->adjustTo(
                        part: $part,
                        newStock: $target,
                        userId: $this->currentUserId(),
                        notes: "اصلاح دستی موجودی انبار از طریق فرم ویرایش دستگاه «{$part->name}»",
                    );
                }
            }
        });

        return response()->json([
            'message' => 'مشخصات دستگاه بروزرسانی شد.',
            'part' => $part->fresh(),
        ]);
    }

    /**
     * حذف دستگاه از کاتالوگ (با حفاظت از داده‌های تخصیص و تاریخچه انبار).
     */
    public function destroy(Part $part): JsonResponse
    {
        $this->authorizePermission('parts.manage');

        if ($part->customerParts()->exists()) {
            return response()->json([
                'message' => 'این دستگاه به مشتریان تخصیص داده شده و امکان حذف مستقیم آن وجود ندارد. می‌توانید آن را «غیرفعال» کنید.',
            ], 422);
        }

        if ($part->inventoryLogs()->exists()) {
            return response()->json([
                'message' => 'برای این دستگاه تراکنش انبار ثبت شده است؛ جهت حفظ تاریخچه انبار امکان حذف وجود ندارد. دستگاه را «غیرفعال» کنید.',
            ], 422);
        }

        $name = $part->name;
        $part->delete();

        return response()->json([
            'message' => "دستگاه «{$name}» با موفقیت از کاتالوگ حذف شد.",
        ]);
    }

    /**
     * ─────────────────────────────────────────────────────────────────────────
     *  تخصیص دستگاه به مشتری (تسک ۳ و ۴)
     * ─────────────────────────────────────────────────────────────────────────
     */
    public function assign(Request $request, Customer $customer): JsonResponse
    {
        $this->authorizeCustomerAccess($customer, 'parts.assign');

        $validated = $request->validate([
            'part_id' => 'required|exists:parts,id',
            'serial_number' => ['required', 'string', 'max:100', 'regex:/^[a-zA-Z0-9\-\/]+$/', 'unique:customer_parts,serial_number'],
            'quantity' => 'nullable|integer|min:1|max:100000',
            'invoice_number' => 'nullable|string|max:50',
            'invoice_amount' => 'nullable|numeric|min:0|max:999999999999',
            'installation_date' => 'nullable|date',
            'status' => 'nullable|in:active,under_repair,replaced,retired',
            'notes' => 'nullable|string',
        ], [
            'part_id.required' => 'انتخاب دستگاه از کاتالوگ الزامی است.',
            'part_id.exists' => 'دستگاه انتخاب‌شده در کاتالوگ وجود ندارد.',
            'serial_number.required' => 'وارد کردن شماره سریال دستگاه الزامی است.',
            'serial_number.regex' => 'شماره سریال فقط می‌تواند شامل حروف انگلیسی، اعداد و خط تیره باشد.',
            'serial_number.unique' => 'این شماره سریال قبلاً به مشتری دیگری تخصیص داده شده است.',
            'quantity.integer' => 'تعداد باید یک عدد صحیح باشد.',
            'quantity.min' => 'تعداد باید حداقل ۱ باشد.',
            'invoice_number.max' => 'شماره فاکتور حداکثر ۵۰ کاراکتر است.',
            'invoice_amount.numeric' => 'مبلغ فاکتور باید عددی باشد.',
            'invoice_amount.min' => 'مبلغ فاکتور نمی‌تواند منفی باشد.',
            'installation_date.date' => 'تاریخ نصب/تحویل معتبر نیست.',
        ]);

        $part = Part::findOrFail((int) $validated['part_id']);

        $customerPart = $this->customerService->assignPart(
            $customer,
            $part,
            $validated,
            $this->currentUserId()
        );

        $quantity = $customerPart->safeQuantity();

        return response()->json([
            'message' => "دستگاه «{$part->name}» به تعداد {$quantity} عدد با شماره سریال {$customerPart->serial_number} به مشتری تخصیص داده شد و از موجودی انبار کسر گردید.",
            'customer_part' => $customerPart,
            'customer_type' => $customer->fresh()->customer_type,
            'stock_quantity' => (int) $part->fresh()->stock_quantity,
        ], 201);
    }

    /**
     * ویرایش تخصیص دستگاه (تعداد، مبلغ/شماره فاکتور، سریال، تاریخ، وضعیت).
     */
    public function updateAssignment(Request $request, CustomerPart $customerPart): JsonResponse
    {
        $this->authorizePermission('parts.assign');

        $customerPart->loadMissing('customer');
        $this->authorizeCustomerAccess($customerPart->customer, null);

        $validated = $request->validate([
            'serial_number' => ['sometimes', 'string', 'max:100', 'regex:/^[a-zA-Z0-9\-\/]+$/'],
            'quantity' => 'sometimes|integer|min:1|max:100000',
            'invoice_number' => 'nullable|string|max:50',
            'invoice_amount' => 'nullable|numeric|min:0|max:999999999999',
            'installation_date' => 'nullable|date',
            'status' => 'sometimes|in:active,under_repair,replaced,retired',
            'notes' => 'nullable|string',
        ], [
            'serial_number.regex' => 'شماره سریال فقط می‌تواند شامل حروف انگلیسی، اعداد و خط تیره باشد.',
            'quantity.min' => 'تعداد باید حداقل ۱ باشد.',
            'invoice_amount.numeric' => 'مبلغ فاکتور باید عددی باشد.',
            'installation_date.date' => 'تاریخ نصب/تحویل معتبر نیست.',
        ]);

        $updated = $this->customerService->updateAssignment($customerPart, $validated, $this->currentUserId());

        return response()->json([
            'message' => 'اطلاعات دستگاه تخصیص‌یافته بروزرسانی شد و موجودی انبار اصلاح گردید.',
            'customer_part' => $updated,
            'stock_quantity' => (int) ($updated->part?->fresh()->stock_quantity ?? 0),
        ]);
    }

    /**
     * حذف تخصیص دستگاه + بازگشت خودکار موجودی به انبار.
     */
    public function destroyAssignment(Request $request, CustomerPart $customerPart): JsonResponse
    {
        $permission = $this->currentUser()?->hasPermissionTo('parts.manage') ? 'parts.manage' : 'parts.assign';
        $this->authorizePermission($permission);

        $customerPart->loadMissing(['customer', 'part']);
        $this->authorizeCustomerAccess($customerPart->customer, null);

        $quantity = $customerPart->safeQuantity();
        $deviceName = $customerPart->part?->name ?? 'دستگاه';

        $this->customerService->deleteAssignment($customerPart, $this->currentUserId());

        return response()->json([
            'message' => "تخصیص دستگاه «{$deviceName}» حذف شد و {$quantity} عدد به موجودی انبار بازگشت.",
        ]);
    }

    /**
     * ثبت سابقه سرویس/تعمیر برای یک دستگاه تخصیص‌یافته.
     */
    public function addServiceHistory(Request $request, CustomerPart $customerPart): JsonResponse
    {
        $this->authorizePermission('parts.history');

        $customerPart->loadMissing('customer');
        $this->authorizeCustomerAccess($customerPart->customer, null);

        $validated = $request->validate([
            'service_date' => 'required|date',
            'service_type' => 'required|in:periodic,repair,overhaul',
            'description' => 'required|string|min:5',
            'cost' => 'nullable|numeric|min:0',
        ], [
            'service_date.required' => 'تاریخ انجام سرویس الزامی است.',
            'service_type.required' => 'نوع اقدام را انتخاب کنید.',
            'description.required' => 'شرح اقدامات انجام‌شده الزامی است.',
            'description.min' => 'شرح اقدامات باید حداقل ۵ کاراکتر باشد.',
            'cost.numeric' => 'هزینه باید عددی باشد.',
        ]);

        $history = $this->customerService->recordServiceHistory($customerPart, $validated, $this->currentUserId());

        return response()->json([
            'message' => 'سابقه سرویس/تعمیر با موفقیت ثبت شد.',
            'history' => $history->load('performedBy'),
        ], 201);
    }

    /**
     * ویرایش سابقه سرویس/تعمیر.
     */
    public function updateServiceHistory(Request $request, PartServiceHistory $serviceHistory): JsonResponse
    {
        $this->authorizePermission('parts.history');

        $serviceHistory->loadMissing('customerPart.customer');
        $this->authorizeCustomerAccess($serviceHistory->customerPart?->customer, null);

        $validated = $request->validate([
            'service_date' => 'sometimes|date',
            'service_type' => 'sometimes|in:periodic,repair,overhaul',
            'description' => 'sometimes|string|min:5',
            'cost' => 'nullable|numeric|min:0',
        ], [
            'description.min' => 'شرح اقدامات باید حداقل ۵ کاراکتر باشد.',
            'cost.numeric' => 'هزینه باید عددی باشد.',
        ]);

        $history = $this->customerService->updateServiceHistory($serviceHistory, $validated, $this->currentUserId());

        return response()->json([
            'message' => 'سابقه سرویس/تعمیر بروزرسانی شد.',
            'history' => $history,
        ]);
    }

    /**
     * حذف سابقه سرویس/تعمیر.
     */
    public function destroyServiceHistory(Request $request, PartServiceHistory $serviceHistory): JsonResponse
    {
        $this->authorizePermission('parts.history');

        $serviceHistory->loadMissing('customerPart.customer');
        $this->authorizeCustomerAccess($serviceHistory->customerPart?->customer, null);

        $this->customerService->deleteServiceHistory($serviceHistory, $this->currentUserId());

        return response()->json([
            'message' => 'سابقه سرویس/تعمیر حذف شد.',
        ]);
    }

    /**
     * ─────────────────────────────────────────────────────────────────────────
     *  قواعد و پیام‌های اعتبارسنجی دستگاه
     * ─────────────────────────────────────────────────────────────────────────
     */
    protected function deviceRules(bool $isUpdate, ?int $partId = null): array
    {
        $codeUnique = $isUpdate
            ? 'unique:parts,code,' . $partId
            : 'unique:parts,code';

        return [
            'name' => $isUpdate ? 'sometimes|string|max:150' : 'required|string|max:150',
            'code' => ['required', 'string', 'max:50', 'regex:/^[a-zA-Z0-9\-_]+$/', $codeUnique],
            'periodic_service_months' => $isUpdate ? 'sometimes|integer|min:1' : 'required|integer|min:1',
            'description' => 'nullable|string',
            'is_active' => 'boolean',
            'stock_quantity' => 'nullable|integer|min:0|max:10000000',
            'min_stock_quantity' => 'nullable|integer|min:0|max:10000000',
            'unit_label' => 'nullable|string|max:30',
        ];
    }

    protected function deviceMessages(): array
    {
        return [
            'name.required' => 'نام دستگاه الزامی است.',
            'code.required' => 'کد فنی دستگاه (SKU) الزامی است.',
            'code.regex' => 'کد دستگاه (SKU) فقط می‌تواند شامل حروف انگلیسی، اعداد، خط تیره و زیرخط باشد.',
            'code.unique' => 'این کد دستگاه قبلاً در سامانه ثبت شده است.',
            'periodic_service_months.required' => 'دوره پوشش گارانتی/سرویس الزامی است.',
            'periodic_service_months.min' => 'دوره پوشش باید حداقل ۱ ماه باشد.',
            'stock_quantity.integer' => 'موجودی انبار باید یک عدد صحیح باشد.',
            'stock_quantity.min' => 'موجودی انبار نمی‌تواند منفی باشد.',
            'min_stock_quantity.min' => 'حد هشدار موجودی نمی‌تواند منفی باشد.',
        ];
    }
}
