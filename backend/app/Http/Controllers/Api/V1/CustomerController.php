<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\CustomersExport;
use App\Exports\CustomersTemplateExport;
use App\Http\Controllers\Controller;
use App\Imports\CustomersImport;
use App\Models\Customer;
use App\Services\Customers\CustomerAccessService;
use App\Services\Customers\CustomerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Maatwebsite\Excel\Facades\Excel;
use Symfony\Component\HttpFoundation\StreamedResponse;

class CustomerController extends Controller
{
    public function __construct(
        protected CustomerAccessService $access,
        protected CustomerService $customerService
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission('customers.view');

        $query = Customer::query()
            ->withCount('customerParts')
            ->withSum('customerParts as devices_quantity', 'quantity')
            ->with('creator:id,name,user_type')
            ->visibleTo($request->user())
            ->latest();

        if ($request->filled('customer_type') && in_array($request->customer_type, ['potential', 'effective'], true)) {
            $query->where('customer_type', $request->customer_type);
        }

        if ($request->filled('created_by')) {
            $query->where('created_by', (int) $request->created_by);
        }

        if ($request->filled('q')) {
            // جستجو با ارقام فارسی/عربی هم کار کند (فونت FD ارقام را فارسی نشان می‌دهد).
            $term = $this->toLatinDigits(trim((string) $request->q));
            $op = $this->likeOp();
            $query->where(function ($q) use ($term, $op) {
                $q->where('first_name', $op, "%{$term}%")
                    ->orWhere('last_name', $op, "%{$term}%")
                    ->orWhere('company_name', $op, "%{$term}%")
                    ->orWhere('mobile', $op, "%{$term}%")
                    ->orWhere('national_code', $op, "%{$term}%")
                    ->orWhere('city', $op, "%{$term}%")
                    ->orWhere('province', $op, "%{$term}%")
                    ->orWhereRaw("CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')) {$op} ?", ["%{$term}%"]);
            });
        }

        $perPage = max(1, min(100, (int) $request->input('per_page', 15)));
        $customers = $query->paginate($perPage);

        return response()->json($customers);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizePermission('customers.create');

        $this->normalizeCustomerInput($request);

        $isCompany = $request->input('type', 'individual') === 'company';
        $nationalCodeRule = $isCompany
            ? 'nullable|string|regex:/^\d{11}$/'
            : 'nullable|string|regex:/^\d{10}$/';

        $validated = $request->validate([
            'customer_type' => 'required|in:potential,effective',
            'type' => 'required|in:individual,company',
            'first_name' => $isCompany ? 'nullable|string|max:100' : 'required|string|max:100',
            'last_name' => $isCompany ? 'nullable|string|max:100' : 'required|string|max:100',
            'company_name' => $isCompany ? 'required|string|max:150' : 'nullable|string|max:150',
            'national_code' => $nationalCodeRule,
            'mobile' => ['nullable', 'string', 'regex:/^09\d{9}$/'],
            'phone' => ['nullable', 'string', 'regex:/^0\d{10}$/'],
            'email' => 'nullable|email|max:150',
            'province' => 'nullable|string|max:50',
            'city' => 'nullable|string|max:50',
            'address' => 'nullable|string',
            'notes' => 'nullable|string',
        ], [
            'first_name.required' => 'برای شخص حقیقی وارد کردن نام الزامی است.',
            'last_name.required' => 'برای شخص حقیقی وارد کردن نام خانوادگی الزامی است.',
            'company_name.required' => 'برای شخص حقوقی وارد کردن نام شرکت الزامی است.',
            'national_code.regex' => $isCompany
                ? 'شناسه ملی شخص حقوقی باید دقیقاً ۱۱ رقم عددی باشد.'
                : 'کد ملی شخص حقیقی باید دقیقاً ۱۰ رقم عددی باشد.',
            'mobile.regex' => 'شماره همراه باید ۱۱ رقم عددی بوده و با 09 شروع شود.',
            'phone.regex' => 'شماره تلفن ثابت باید ۱۱ رقم عددی بوده و با 0 شروع شود (مانند 02188776655).',
        ]);

        $validated['created_by'] = $request->user()->id;

        $customer = Customer::create($validated);

        $customer->histories()->create([
            'user_id' => $request->user()->id,
            'action' => 'created',
            'description' => "مشتری جدید («{$customer->full_name}») در سامانه ثبت شد.",
        ]);

        return response()->json([
            'message' => 'مشتری با موفقیت ثبت شد.',
            'customer' => $customer->load('creator:id,name'),
        ], 201);
    }

    public function show(Request $request, Customer $customer): JsonResponse
    {
        $this->authorizePermission('customers.view');
        $this->access->authorizeView($request->user(), $customer);

        $customer->load([
            'customerParts.part',
            'customerParts.assignedBy:id,name',
            'customerParts.serviceHistories.performedBy',
            'histories.user',
            'smsLogs',
            'creator:id,name,user_type',
        ]);

        return response()->json($customer);
    }

    public function update(Request $request, Customer $customer): JsonResponse
    {
        $this->authorizePermission('customers.edit');
        $this->access->authorizeEdit($request->user(), $customer);

        $this->normalizeCustomerInput($request);

        $personType = $request->input('type', $customer->type);
        $isCompany = $personType === 'company';
        $nationalCodeRule = $isCompany
            ? 'nullable|string|regex:/^\d{11}$/'
            : 'nullable|string|regex:/^\d{10}$/';

        $validated = $request->validate([
            'customer_type' => 'sometimes|in:potential,effective',
            'type' => 'sometimes|in:individual,company',
            'first_name' => $isCompany ? 'nullable|string|max:100' : 'required|string|max:100',
            'last_name' => $isCompany ? 'nullable|string|max:100' : 'required|string|max:100',
            'company_name' => $isCompany ? 'required|string|max:150' : 'nullable|string|max:150',
            'national_code' => $nationalCodeRule,
            'mobile' => ['nullable', 'string', 'regex:/^09\d{9}$/'],
            'phone' => ['nullable', 'string', 'regex:/^0\d{10}$/'],
            'email' => 'nullable|email|max:150',
            'province' => 'nullable|string|max:50',
            'city' => 'nullable|string|max:50',
            'address' => 'nullable|string',
            'notes' => 'nullable|string',
        ], [
            'first_name.required' => 'برای شخص حقیقی وارد کردن نام الزامی است.',
            'last_name.required' => 'برای شخص حقیقی وارد کردن نام خانوادگی الزامی است.',
            'company_name.required' => 'برای شخص حقوقی وارد کردن نام شرکت الزامی است.',
            'national_code.regex' => $isCompany
                ? 'شناسه ملی شخص حقوقی باید دقیقاً ۱۱ رقم عددی باشد.'
                : 'کد ملی شخص حقیقی باید دقیقاً ۱۰ رقم عددی باشد.',
            'mobile.regex' => 'شماره همراه باید ۱۱ رقم عددی بوده و با 09 شروع شود.',
            'phone.regex' => 'شماره تلفن ثابت باید ۱۱ رقم عددی بوده و با 0 شروع شود (مانند 02188776655).',
        ]);

        if (array_key_exists('mobile', $validated) && $validated['mobile'] === null) {
            // مشتری حقوقی/حقیقی می‌تواند بدون شماره همراه باشد (تسک ۵)
            $validated['mobile'] = null;
        }

        $customer->update($validated);

        $customer->histories()->create([
            'user_id' => $request->user()->id,
            'action' => 'updated',
            'description' => 'مشخصات پرونده مشتری ویرایش شد.',
        ]);

        return response()->json([
            'message' => 'اطلاعات مشتری بروزرسانی شد.',
            'customer' => $customer->load('creator:id,name'),
        ]);
    }

    public function destroy(Request $request, Customer $customer): JsonResponse
    {
        $this->authorizePermission('customers.delete');
        $this->access->authorizeEdit($request->user(), $customer);

        $name = $customer->full_name;

        // حذف امن: موجودی همه دستگاه‌های تخصیص‌یافته قبل از حذف به انبار برگردانده می‌شود.
        $this->customerService->deleteCustomer($customer, $request->user()->id);

        return response()->json([
            'message' => "مشتری «{$name}» با موفقیت حذف شد و موجودی دستگاه‌های آن به انبار برگشت داده شد.",
        ]);
    }

    /**
     * Import customers from Excel (.xlsx, .xls, .csv)
     */
    public function import(Request $request): JsonResponse
    {
        $this->authorizePermission('customers.import');

        $request->validate([
            'file' => 'required|file|mimes:xlsx,xls,csv|max:10240',
        ]);

        $import = new CustomersImport();
        $import->setCreatorUserId($request->user()?->id);
        $import->setCanUpdateAnyCustomer($this->access->hasFullAccess($request->user()));
        Excel::import($import, $request->file('file'));

        return response()->json([
            'message' => "عملیات ورود با موفقیت انجام شد. {$import->getImportedCount()} مشتری ثبت/بروزرسانی شد.",
            'imported_count' => $import->getImportedCount(),
            'errors' => $import->getErrors(),
        ]);
    }

    /**
     * Export customers to Excel (.xlsx) or CSV with UTF-8 BOM.
     *
     * ستون‌ها شامل اطلاعات کامل دستگاه‌های تخصیص‌یافته (نام، کد، سریال، تعداد، شماره و مبلغ فاکتور) است.
     * دامنه دسترسی کاربر (RBAC) روی خروجی هم اعمال می‌شود.
     */
    public function export(Request $request)
    {
        $this->authorizePermission('customers.export');

        $user = $request->user();
        $type = $request->query('customer_type');
        $format = strtolower((string) $request->query('format', 'xlsx'));

        // null = دسترسی کامل، در غیر این صورت فقط شناسه مشتریان مجاز
        $allowedCustomerIds = $this->access->hasFullAccess($user)
            ? null
            : $this->access->visibleCustomerIds($user);

        $export = new CustomersExport($type, $allowedCustomerIds);
        $fileName = 'customers-' . now()->format('Y-m-d');

        if ($format === 'csv') {
            return $this->downloadCsv($export, $fileName . '.csv');
        }

        return Excel::download($export, $fileName . '.xlsx');
    }

    /**
     * Download sample Excel template (.xlsx)
     */
    public function template()
    {
        return Excel::download(new CustomersTemplateExport(), 'customers-sample-template.xlsx');
    }

    /**
     * خروجی CSV با BOM برای باز شدن صحیح فارسی در Excel (تسک ۶).
     */
    protected function downloadCsv(CustomersExport $export, string $fileName): StreamedResponse
    {
        $headings = $export->headings();
        $rows = $export->collection();

        return response()->streamDownload(function () use ($export, $headings, $rows) {
            $handle = fopen('php://output', 'wb');

            // UTF-8 BOM — بدون این سه بایت، Excel کاراکترهای فارسی را به هم می‌ریزد.
            fwrite($handle, "\xEF\xBB\xBF");

            fputcsv($handle, $headings);

            foreach ($rows as $row) {
                fputcsv($handle, $export->map($row));
            }

            fclose($handle);
        }, $fileName, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => "attachment; filename=\"{$fileName}\"",
            'Cache-Control' => 'no-store, no-cache',
        ]);
    }

    /**
     * نرمال‌سازی ورودی‌های عددی مشتری (ارقام فارسی، فاصله، خط تیره، پیش‌شماره ۹۸).
     */
    protected function normalizeCustomerInput(Request $request): void
    {
        $normalized = [];

        if ($request->has('mobile')) {
            $normalized['mobile'] = $this->normalizePhoneNumber($request->input('mobile'));
        }

        if ($request->has('phone')) {
            $normalized['phone'] = $this->normalizePhoneNumber($request->input('phone'));
        }

        if ($request->has('national_code')) {
            $digits = preg_replace('/\D+/', '', $this->toLatinDigits($request->input('national_code'))) ?? '';
            $normalized['national_code'] = $digits === '' ? null : $digits;
        }

        if ($request->has('first_name')) {
            $normalized['first_name'] = trim((string) $request->input('first_name')) ?: null;
        }

        if ($request->has('last_name')) {
            $normalized['last_name'] = trim((string) $request->input('last_name')) ?: null;
        }

        if ($request->has('company_name')) {
            $normalized['company_name'] = trim((string) $request->input('company_name')) ?: null;
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
