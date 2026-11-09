<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\CustomersExport;
use App\Exports\CustomersTemplateExport;
use App\Http\Controllers\Controller;
use App\Imports\CustomersImport;
use App\Models\Customer;
use App\Services\Customers\CustomerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Maatwebsite\Excel\Facades\Excel;

class CustomerController extends Controller
{
    public function __construct(private CustomerService $customerService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission('customers.view');
        $query = Customer::visibleTo($request->user())->withCount('customerParts')->latest();
        if ($request->filled('customer_type') && in_array($request->customer_type, ['potential', 'effective'], true)) {
            $query->where('customer_type', $request->customer_type);
        }
        if ($request->filled('q')) {
            $term = trim($request->q);
            $op = $this->likeOp();
            $fullName = DB::connection()->getDriverName() === 'sqlite'
                ? "COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')"
                : "CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))";
            $query->where(function ($q) use ($term, $op, $fullName): void {
                $q->where('first_name', $op, "%{$term}%")
                    ->orWhere('last_name', $op, "%{$term}%")
                    ->orWhere('company_name', $op, "%{$term}%")
                    ->orWhere('mobile', $op, "%{$term}%")
                    ->orWhere('national_code', $op, "%{$term}%")
                    ->orWhere('city', $op, "%{$term}%")
                    ->orWhere('province', $op, "%{$term}%")
                    ->orWhereRaw("{$fullName} {$op} ?", ["%{$term}%"]);
            });
        }
        return response()->json($query->paginate(min(max((int) $request->input('per_page', 15), 1), 100)));
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizePermission('customers.create');
        $validated = $this->validateCustomer($request->all());
        $customer = DB::transaction(function () use ($validated, $request): Customer {
            $customer = Customer::create($validated + ['created_by_user_id' => $request->user()->id]);
            $customer->histories()->create([
                'user_id' => $request->user()->id,
                'action' => 'created',
                'description' => "مشتری جدید («{$customer->full_name}») در سامانه ثبت شد.",
            ]);
            return $customer;
        }, 3);
        return response()->json(['message' => 'مشتری با موفقیت ثبت شد.', 'customer' => $customer], 201);
    }

    public function show(Customer $customer): JsonResponse
    {
        $this->authorizePermission('customers.view');
        $this->authorizeCustomer($customer);
        $customer->load(['customerParts.part', 'customerParts.serviceHistories.performedBy', 'histories.user', 'smsLogs', 'creator']);
        return response()->json($customer);
    }

    public function update(Request $request, Customer $customer): JsonResponse
    {
        $this->authorizePermission('customers.edit');
        $this->authorizeCustomer($customer);
        $fields = ['customer_type', 'type', 'first_name', 'last_name', 'company_name', 'national_code', 'mobile', 'phone', 'email', 'province', 'city', 'address', 'notes'];
        $validated = $this->validateCustomer(array_replace($customer->only($fields), $request->only($fields)));
        DB::transaction(function () use ($customer, $validated, $request): void {
            $customer->update($validated);
            $customer->histories()->create([
                'user_id' => $request->user()->id,
                'action' => 'updated',
                'description' => 'مشخصات پرونده مشتری ویرایش شد.',
            ]);
        }, 3);
        return response()->json(['message' => 'اطلاعات مشتری بروزرسانی شد.', 'customer' => $customer]);
    }

    public function destroy(Request $request, Customer $customer): JsonResponse
    {
        $this->authorizePermission('customers.delete');
        $this->authorizeCustomer($customer);
        $name = $customer->full_name;
        $this->customerService->deleteCustomer($customer, $request->user());
        return response()->json(['message' => "مشتری «{$name}» بایگانی شد."]);
    }

    public function import(Request $request): JsonResponse
    {
        $this->authorizePermission('customers.import');
        $request->validate(['file' => 'required|file|mimes:xlsx,xls,csv|max:10240']);
        $import = new CustomersImport($request->user());
        Excel::import($import, $request->file('file'));
        return response()->json([
            'message' => "عملیات ورود انجام شد. {$import->getImportedCount()} مشتری ثبت/بروزرسانی شد.",
            'imported_count' => $import->getImportedCount(),
            'errors' => $import->getErrors(),
        ]);
    }

    public function export(Request $request)
    {
        $this->authorizePermission('customers.export');
        $type = $request->query('customer_type');
        $format = $request->query('format') === 'csv' ? 'csv' : 'xlsx';
        return Excel::download(new CustomersExport($type, $request->user()), 'customers-' . now()->format('Y-m-d') . '.' . $format);
    }

    public function template()
    {
        return Excel::download(new CustomersTemplateExport(), 'customers-sample-template.xlsx');
    }

    private function validateCustomer(array $input): array
    {
        foreach (['mobile', 'phone', 'national_code'] as $field) {
            if (isset($input[$field]) && is_string($input[$field])) {
                $input[$field] = str_replace(['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹','٠','١','٢','٣','٤','٥','٦','٧','٨','٩'], ['0','1','2','3','4','5','6','7','8','9','0','1','2','3','4','5','6','7','8','9'], $input[$field]);
            }
        }
        $personType = $input['type'] ?? 'individual';
        $nationalCodeRule = $personType === 'company' ? 'nullable|string|regex:/^\\d{11}$/' : 'nullable|string|regex:/^\\d{10}$/';
        return Validator::make($input, [
            'customer_type' => 'required|in:potential,effective',
            'type' => 'required|in:individual,company',
            'first_name' => [Rule::requiredIf($personType === 'individual'), 'nullable', 'string', 'max:100'],
            'last_name' => [Rule::requiredIf($personType === 'individual'), 'nullable', 'string', 'max:100'],
            'company_name' => [Rule::requiredIf($personType === 'company'), 'nullable', 'string', 'max:150'],
            'national_code' => $nationalCodeRule,
            'mobile' => ['nullable', 'string', 'regex:/^09\\d{9}$/'],
            'phone' => ['nullable', 'string', 'regex:/^0\\d{10}$/'],
            'email' => 'nullable|email|max:150',
            'province' => 'nullable|string|max:50',
            'city' => 'nullable|string|max:50',
            'address' => 'nullable|string',
            'notes' => 'nullable|string',
        ], [
            'first_name.required' => 'نام شخص حقیقی الزامی است.',
            'last_name.required' => 'نام خانوادگی شخص حقیقی الزامی است.',
            'company_name.required' => 'نام شرکت برای شخص حقوقی الزامی است.',
            'national_code.regex' => $personType === 'company' ? 'شناسه ملی شخص حقوقی باید ۱۱ رقم باشد.' : 'کد ملی شخص حقیقی باید ۱۰ رقم باشد.',
            'mobile.regex' => 'شماره همراه باید ۱۱ رقم و با 09 شروع شود.',
            'phone.regex' => 'شماره تلفن ثابت باید ۱۱ رقم و با 0 شروع شود.',
        ])->validate();
    }

    protected function authorizePermission(string $permission): void
    {
        $user = auth()->user();
        if (!$user || !$user->hasPermissionTo($permission)) {
            abort(403, "شما دسترسی لازم ({$permission}) برای این عملیات را ندارید.");
        }
    }
}
