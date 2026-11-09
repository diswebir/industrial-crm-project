<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\CustomersExport;
use App\Exports\CustomersTemplateExport;
use App\Http\Controllers\Controller;
use App\Imports\CustomersImport;
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Maatwebsite\Excel\Facades\Excel;

class CustomerController extends Controller
{
    public function __construct(protected \App\Services\Customers\CustomerService $customerService)
    {
    }

    /**
     * فهرست مشتریان — همیشه محدود به دامنه دسترسی کاربر جاری (تسک ۱).
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission('customers.view');

        $user = $this->currentUser();

        $query = Customer::query()
            ->visibleTo($user)
            ->with('createdBy:id,name,email,avatar')
            ->withCount('customerParts')
            ->withSum('customerParts as assigned_devices_count', 'quantity')
            ->latest();

        if ($request->filled('customer_type') && in_array($request->customer_type, ['potential', 'effective'], true)) {
            $query->where('customer_type', $request->customer_type);
        }

        // فیلتر «مشتریان من» یا مشتریان یک کارمند خاص (فقط برای مدیران)
        if ($request->filled('owner_id')) {
            $ownerParam = (string) $request->input('owner_id');
            if ($ownerParam === 'me' || $ownerParam === '-1') {
                $query->where('created_by_user_id', $user?->id);
            } elseif ($this->userHasGlobalCustomerAccess()) {
                $query->where('created_by_user_id', (int) $ownerParam);
            }
        }

        if ($request->boolean('unassigned_only')) {
            $query->has('customerParts', '=', 0);
        }

        if ($request->filled('q')) {
            $term = trim((string) $request->q);
            $op = $this->likeOp();
            $query->where(function ($q) use ($term, $op) {
                $q->where('first_name', $op, "%{$term}%")
                    ->orWhere('last_name', $op, "%{$term}%")
                    ->orWhere('company_name', $op, "%{$term}%")
                    ->orWhere('mobile', $op, "%{$term}%")
                    ->orWhere('phone', $op, "%{$term}%")
                    ->orWhere('national_code', $op, "%{$term}%")
                    ->orWhere('city', $op, "%{$term}%")
                    ->orWhere('province', $op, "%{$term}%")
                    ->orWhereRaw("CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')) {$op} ?", ["%{$term}%"]);
            });
        }

        $perPage = max(1, min(100, (int) $request->input('per_page', 15)));
        $customers = $query->paginate($perPage)->withQueryString();

        return response()->json($customers);
    }

    /**
     * ثبت مشتری جدید (تسک ۵ — اعتبارسنجی تفکیکی حقیقی/حقوقی).
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorizePermission('customers.create');

        $isCompany = $request->input('type', 'individual') === 'company';

        $validated = $request->validate($this->customerRules(isCompany: $isCompany, isUpdate: false), $this->customerMessages($isCompany));

        $validated = $this->normalizeNullableStrings($validated);
        $validated['created_by_user_id'] = $this->currentUserId();

        $customer = Customer::create($validated);

        $this->customerService->logCustomerEvent(
            $customer,
            'created',
            "مشتری جدید («{$customer->full_name}») در سامانه ثبت شد.",
            ['created_by' => $this->currentUserId()],
            $this->currentUserId()
        );

        return response()->json([
            'message' => 'مشتری با موفقیت ثبت شد.',
            'customer' => $customer->load('createdBy:id,name'),
        ], 201);
    }

    /**
     * جزییات پرونده مشتری — با کنترل دسترسی سمت سرور.
     */
    public function show(Request $request, Customer $customer): JsonResponse
    {
        $this->authorizeCustomerAccess($customer, 'customers.view');

        $customer->load([
            'createdBy:id,name,email,avatar',
            'customerParts.part',
            'customerParts.assignedBy:id,name',
            'customerParts.serviceHistories.performedBy',
            'histories.user',
            'smsLogs',
        ]);

        return response()->json($customer);
    }

    /**
     * ویرایش پرونده مشتری.
     */
    public function update(Request $request, Customer $customer): JsonResponse
    {
        $this->authorizeCustomerAccess($customer, 'customers.edit');

        $isCompany = ($request->input('type', $customer->type) === 'company');

        $validated = $request->validate($this->customerRules(isCompany: $isCompany, isUpdate: true), $this->customerMessages($isCompany));
        $validated = $this->normalizeNullableStrings($validated);

        // مالک مشتری فقط توسط مدیر و به‌صورت صریح قابل تغییر است
        if ($this->userHasGlobalCustomerAccess() && $request->filled('created_by_user_id')) {
            $validated['created_by_user_id'] = (int) $request->input('created_by_user_id');
        }

        $customer->update($validated);

        $this->customerService->logCustomerEvent(
            $customer,
            'updated',
            'مشخصات پرونده مشتری ویرایش شد.',
            null,
            $this->currentUserId()
        );

        return response()->json([
            'message' => 'اطلاعات مشتری بروزرسانی شد.',
            'customer' => $customer->load('createdBy:id,name'),
        ]);
    }

    /**
     * حذف مشتری — دستگاه‌های تخصیص‌یافته به انبار بازمی‌گردند (تسک ۴).
     */
    public function destroy(Customer $customer): JsonResponse
    {
        $this->authorizeCustomerAccess($customer, 'customers.delete');

        $name = $customer->full_name;
        $returnedDevices = (int) $customer->customerParts()->sum('quantity');

        $this->customerService->deleteCustomer($customer, $this->currentUserId());

        $message = "مشتری «{$name}» با موفقیت حذف شد.";
        if ($returnedDevices > 0) {
            $message .= " {$returnedDevices} عدد دستگاه تخصیص‌یافته نیز به انبار بازگشت.";
        }

        return response()->json(['message' => $message]);
    }

    /**
     * ورود گروهی مشتریان از اکسل (.xlsx, .xls, .csv)
     */
    public function import(Request $request): JsonResponse
    {
        $this->authorizePermission('customers.import');

        $request->validate([
            'file' => 'required|file|mimes:xlsx,xls,csv|max:10240',
        ], [
            'file.required' => 'انتخاب فایل اکسل الزامی است.',
            'file.mimes' => 'فقط فایل‌های xlsx، xls و csv قابل پذیرش هستند.',
            'file.max' => 'حداکثر حجم فایل مجاز ۱۰ مگابایت است.',
        ]);

        $import = new CustomersImport($this->currentUserId());
        Excel::import($import, $request->file('file'));

        $message = "عملیات ورود انجام شد. {$import->getCreatedCount()} مشتری جدید ثبت و {$import->getUpdatedCount()} مشتری بروزرسانی شد.";
        if (!empty($import->getErrors())) {
            $message .= ' ' . count($import->getErrors()) . ' ردیف به دلیل خطا نادیده گرفته شد.';
        }

        return response()->json([
            'message' => $message,
            'imported_count' => $import->getImportedCount(),
            'created_count' => $import->getCreatedCount(),
            'updated_count' => $import->getUpdatedCount(),
            'errors' => $import->getErrors(),
            'warnings' => $import->getWarnings(),
        ]);
    }

    /**
     * خروجی اکسل کامل مشتریان + دستگاه‌های تخصیص‌یافته (تسک ۶).
     */
    public function export(Request $request)
    {
        $this->authorizePermission('customers.export');

        $type = $request->query('customer_type');
        $fileName = 'customers-' . now()->format('Y-m-d') . '.xlsx';

        return Excel::download(new CustomersExport($type, $this->currentUser()), $fileName);
    }

    /**
     * دانلود فایل نمونه اکسل (.xlsx)
     */
    public function template()
    {
        return Excel::download(new CustomersTemplateExport(), 'customers-sample-template.xlsx');
    }

    /**
     * ─────────────────────────────────────────────────────────────────────────
     *  قواعد اعتبارسنجی (تسک ۵)
     *
     *   شخصیت حقوقی  → نام شرکت اجباری؛ نام/نام‌خانوادگی/موبایل اختیاری
     *   شخصیت حقیقی  → نام و نام خانوادگی اجباری؛ موبایل اختیاری
     * ─────────────────────────────────────────────────────────────────────────
     */
    protected function customerRules(bool $isCompany, bool $isUpdate): array
    {
        $req = $isUpdate ? 'sometimes|' : '';

        $firstName = $isCompany ? 'nullable|string|max:100' : $req . 'required|string|max:100';
        $lastName = $isCompany ? 'nullable|string|max:100' : $req . 'required|string|max:100';
        $companyName = $isCompany ? $req . 'required|string|max:150' : 'nullable|string|max:150';

        return [
            'customer_type' => $isUpdate ? 'sometimes|in:potential,effective' : 'required|in:potential,effective',
            'type' => $isUpdate ? 'sometimes|in:individual,company' : 'required|in:individual,company',
            'first_name' => $firstName,
            'last_name' => $lastName,
            'company_name' => $companyName,
            'national_code' => $isCompany ? 'nullable|string|regex:/^\d{11}$/' : 'nullable|string|regex:/^\d{10}$/',
            // شماره موبایل در هر دو حالت «غیراجباری» است (تسک ۵)
            'mobile' => ['nullable', 'string', 'regex:/^09\d{9}$/'],
            'phone' => ['nullable', 'string', 'regex:/^0\d{10}$/'],
            'email' => 'nullable|email|max:150',
            'province' => 'nullable|string|max:50',
            'city' => 'nullable|string|max:50',
            'address' => 'nullable|string',
            'notes' => 'nullable|string',
        ];
    }

    protected function customerMessages(bool $isCompany): array
    {
        return [
            'first_name.required' => 'برای مشتری حقیقی، وارد کردن نام الزامی است.',
            'last_name.required' => 'برای مشتری حقیقی، وارد کردن نام خانوادگی الزامی است.',
            'company_name.required' => 'برای مشتری حقوقی، وارد کردن نام شرکت الزامی است.',
            'national_code.regex' => $isCompany
                ? 'شناسه ملی شخص حقوقی باید دقیقاً ۱۱ رقم عددی باشد.'
                : 'کد ملی شخص حقیقی باید دقیقاً ۱۰ رقم عددی باشد.',
            'mobile.regex' => 'شماره همراه باید ۱۱ رقم عددی بوده و با 09 شروع شود (اختیاری است).',
            'phone.regex' => 'شماره تلفن ثابت باید ۱۱ رقم عددی بوده و با 0 شروع شود (مانند 02188776655).',
            'email.email' => 'فرمت آدرس ایمیل معتبر نیست.',
        ];
    }

    /**
     * تبدیل رشته‌های خالی به null تا ستون‌های اختیاری واقعاً NULL ذخیره شوند.
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    protected function normalizeNullableStrings(array $validated): array
    {
        $nullableFields = [
            'first_name', 'last_name', 'company_name', 'national_code',
            'mobile', 'phone', 'email', 'province', 'city', 'address', 'notes',
        ];

        foreach ($nullableFields as $field) {
            if (array_key_exists($field, $validated) && is_string($validated[$field]) && trim($validated[$field]) === '') {
                $validated[$field] = null;
            }
        }

        return $validated;
    }
}
