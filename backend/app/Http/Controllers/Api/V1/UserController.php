<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CustomerAccessGrant;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Spatie\Permission\Models\Permission;

class UserController extends Controller
{
    public const PERMISSION_LABELS = [
        'customers.view' => 'مشاهده مشتریان',
        'customers.create' => 'ایجاد مشتری',
        'customers.edit' => 'ویرایش مشتری',
        'customers.delete' => 'حذف مشتری',
        'customers.import' => 'ورود گروهی با اکسل',
        'customers.export' => 'خروجی اکسل مشتریان',
        'parts.view' => 'مشاهده دستگاه‌ها',
        'parts.manage' => 'مدیریت و ثبت کاتالوگ دستگاه‌ها',
        'parts.assign' => 'تخصیص دستگاه به مشتری',
        'parts.assign.edit' => 'ویرایش دستگاه تخصیص‌یافته',
        'parts.assign.delete' => 'حذف دستگاه تخصیص‌یافته',
        'parts.history' => 'ثبت سوابق خدمات دستگاه‌ها',
        'inventory.view' => 'مشاهده موجودی و تاریخچه انبار',
        'inventory.manage' => 'ثبت ورود/خروج و اصلاح موجودی انبار',
        'sms.send' => 'ارسال پیامک الگو',
        'sms.logs' => 'مشاهده سوابق پیامک',
        'users.manage' => 'مدیریت کاربران و دسترسی‌ها',
        'settings.manage' => 'مدیریت تنظیمات سیستم',
    ];

    /**
     * مجوزهای پیشنهادی هر نقش سازمانی (Pure ACL باقی می‌ماند؛ فقط انتخاب اولیه آسان‌تر می‌شود).
     */
    public const ROLE_PRESETS = [
        'salesperson' => [
            'customers.view',
            'customers.create',
            'customers.edit',
            'parts.view',
            'parts.assign',
            'parts.assign.edit',
            'parts.assign.delete',
            'parts.history',
            'inventory.view',
            'sms.send',
        ],
        'installer' => [
            'customers.view',
            'parts.view',
            'parts.history',
            'inventory.view',
        ],
    ];

    public function index(): JsonResponse
    {
        $this->authorizePermission('users.manage');

        $callingUser = auth()->user();
        $query = User::latest();

        // Managers cannot view administrator users in the users list
        if ($callingUser && !$callingUser->isAdministrator()) {
            $query->where(function ($q) {
                $q->where('user_type', '!=', 'administrator')
                  ->orWhereNull('user_type');
            });
        }

        $users = $query->get()->map(function ($u) {
            return [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'phone' => $u->phone,
                'avatar' => $u->avatar,
                'avatar_url' => $u->avatar_url,
                'is_active' => $u->is_active,
                'user_type' => $u->user_type,
                'user_type_label' => $u->userTypeLabel(),
                'data_scope' => $u->data_scope ?? 'all',
                'created_at' => $u->created_at?->format('Y-m-d H:i'),
                'permissions' => $u->getAllPermissions()->pluck('name')->values()->all(),
            ];
        });

        return response()->json($users);
    }

    /**
     * فهرست کارمندان برای انتخاب در بخش «دسترسی به مشتریان یک کارمند دیگر».
     */
    public function staffOptions(): JsonResponse
    {
        $this->authorizePermission('users.manage');

        $callingUser = auth()->user();

        $users = User::query()
            ->where('is_active', true)
            ->when($callingUser, fn ($q) => $q->where('id', '!=', $callingUser->id))
            ->orderBy('name')
            ->get(['id', 'name', 'user_type', 'email'])
            ->map(fn (User $u) => [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'user_type' => $u->user_type,
                'user_type_label' => $u->userTypeLabel(),
            ]);

        return response()->json($users);
    }

    public function show(User $user): JsonResponse
    {
        $this->authorizePermission('users.manage');

        $callingUser = auth()->user();
        if ($user->isAdministrator() && (!$callingUser || !$callingUser->isAdministrator())) {
            abort(403, 'مدیران عادی دسترسی به اطلاعات حساب مدیر ارشد را ندارند.');
        }

        $grants = CustomerAccessGrant::query()
            ->where('user_id', $user->id)
            ->get(['scope_type', 'target_user_id', 'customer_id']);

        return response()->json([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'avatar' => $user->avatar,
            'avatar_url' => $user->avatar_url,
            'is_active' => $user->is_active,
            'user_type' => $user->user_type,
            'user_type_label' => $user->userTypeLabel(),
            'data_scope' => $user->data_scope ?? 'all',
            'created_at' => $user->created_at?->format('Y-m-d H:i'),
            'permissions' => $user->getAllPermissions()->pluck('name')->values()->all(),
            'customer_access' => [
                'scope' => $user->data_scope ?? 'all',
                'staff_ids' => $grants->where('scope_type', CustomerAccessGrant::SCOPE_STAFF)->pluck('target_user_id')->filter()->values()->all(),
                'customer_ids' => $grants->where('scope_type', CustomerAccessGrant::SCOPE_CUSTOMER)->pluck('customer_id')->filter()->values()->all(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizePermission('users.manage');

        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'email' => 'required|email|unique:users,email',
            'phone' => 'nullable|string|regex:/^09\d{9}$/|unique:users,phone',
            'password' => ['required', 'string', 'min:8', 'regex:/[A-Za-z]/', 'regex:/[0-9]/'],
            'is_active' => 'nullable|boolean',
            'avatar' => 'nullable|image|max:3072',
            'permissions' => 'nullable|array',
            'permissions.*' => 'string|exists:permissions,name',
            'user_type' => 'nullable|in:administrator,manager,salesperson,installer',
            'data_scope' => 'nullable|in:all,own,custom',
        ], [
            'name.required' => 'نام و نام خانوادگی کاربر الزامی است.',
            'email.required' => 'آدرس ایمیل الزامی است.',
            'email.email' => 'فرمت آدرس ایمیل معتبر نیست.',
            'email.unique' => 'این ایمیل قبلاً در سیستم ثبت شده است.',
            'phone.regex' => 'شماره موبایل باید با 09 شروع شده و ۱۱ رقم عددی باشد.',
            'phone.unique' => 'این شماره موبایل قبلاً برای کاربر دیگری ثبت شده است.',
            'password.required' => 'کلمه عبور الزامی است.',
            'password.min' => 'کلمه عبور باید حداقل ۸ کاراکتر باشد.',
            'password.regex' => 'کلمه عبور باید حداقل شامل یک حرف انگلیسی و یک عدد باشد.',
            'avatar.image' => 'فایل آواتار باید یک تصویر معتبر باشد.',
            'avatar.max' => 'حداکثر حجم تصویر ۳ مگابایت است.',
        ]);

        $callingUser = auth()->user();

        $avatarPath = null;
        if ($request->hasFile('avatar')) {
            $avatarPath = $request->file('avatar')->store('avatars', 'public');
        }

        // Determine user_type: only administrators can create other administrators
        $resolvedType = $validated['user_type'] ?? 'manager';
        if ($resolvedType === 'administrator' && ! $callingUser?->isAdministrator()) {
            $resolvedType = 'manager';
        }
        if (! in_array($resolvedType, User::USER_TYPES, true)) {
            $resolvedType = 'manager';
        }

        // دامنه دسترسی: نقش‌های عملیاتی به صورت پیش‌فرض فقط مشتریان خودشان را می‌بینند.
        $defaultScope = in_array($resolvedType, ['salesperson', 'installer'], true) ? 'own' : 'all';
        $resolvedScope = $validated['data_scope'] ?? $defaultScope;
        if ($resolvedScope === 'all' && ! $callingUser?->isAdministrator()) {
            $resolvedScope = $defaultScope;
        }

        $user = DB::transaction(function () use ($validated, $avatarPath, $resolvedType, $resolvedScope, $request) {
            $user = User::create([
                'name' => $validated['name'],
                'email' => $validated['email'],
                'phone' => $validated['phone'] ?? null,
                'avatar' => $avatarPath,
                'password' => Hash::make($validated['password']),
                'is_active' => $request->boolean('is_active', true),
                'user_type' => $resolvedType,
                'data_scope' => $resolvedScope,
            ]);

            return $user;
        });

        // Permissions: either explicit list or role preset
        $requestedPerms = $validated['permissions'] ?? null;

        if ($requestedPerms === null && isset(self::ROLE_PRESETS[$resolvedType])) {
            $requestedPerms = self::ROLE_PRESETS[$resolvedType];
        }

        $requestedPerms = $requestedPerms ?? [];

        if (! $callingUser?->isAdministrator()) {
            $callerPerms = $callingUser ? $callingUser->getAllPermissions()->pluck('name')->all() : [];
            $requestedPerms = array_values(array_intersect($requestedPerms, $callerPerms));
        }

        $user->syncPermissions(array_values(array_unique($requestedPerms)));

        return response()->json([
            'message' => 'کاربر جدید با دسترسی‌های تعیین‌شده با موفقیت ایجاد شد.',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'avatar' => $user->avatar,
                'avatar_url' => $user->avatar_url,
                'is_active' => $user->is_active,
                'user_type' => $user->user_type,
                'user_type_label' => $user->userTypeLabel(),
                'data_scope' => $user->data_scope,
                'permissions' => $user->getAllPermissions()->pluck('name')->values()->all(),
            ],
        ], 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $this->authorizePermission('users.manage');

        $callingUser = auth()->user();
        if ($user->isAdministrator() && (!$callingUser || !$callingUser->isAdministrator())) {
            abort(403, 'مدیران عادی امکان ویرایش حساب مدیر ارشد را ندارند.');
        }

        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'email' => 'required|email|unique:users,email,' . $user->id,
            'phone' => 'nullable|string|regex:/^09\d{9}$/|unique:users,phone,' . $user->id,
            'password' => ['nullable', 'string', 'min:8', 'regex:/[A-Za-z]/', 'regex:/[0-9]/'],
            'is_active' => 'nullable|boolean',
            'avatar' => 'nullable|image|max:3072',
            'permissions' => 'nullable|array',
            'permissions.*' => 'string|exists:permissions,name',
            'user_type' => 'nullable|in:administrator,manager,salesperson,installer',
            'data_scope' => 'nullable|in:all,own,custom',
        ], [
            'name.required' => 'نام و نام خانوادگی کاربر الزامی است.',
            'email.required' => 'آدرس ایمیل الزامی است.',
            'email.email' => 'فرمت آدرس ایمیل معتبر نیست.',
            'email.unique' => 'این ایمیل قبلاً در سیستم ثبت شده است.',
            'phone.regex' => 'شماره موبایل باید با 09 شروع شده و ۱۱ رقم عددی باشد.',
            'phone.unique' => 'این شماره موبایل قبلاً برای کاربر دیگری ثبت شده است.',
            'password.min' => 'کلمه عبور باید حداقل ۸ کاراکتر باشد.',
            'password.regex' => 'کلمه عبور باید حداقل شامل یک حرف انگلیسی و یک عدد باشد.',
            'avatar.image' => 'فایل آواتار باید یک تصویر معتبر باشد.',
            'avatar.max' => 'حداکثر حجم تصویر ۳ مگابایت است.',
        ]);

        $user->name = $validated['name'];
        $user->email = $validated['email'];
        if (array_key_exists('phone', $validated)) {
            $user->phone = $validated['phone'];
        }

        if ($request->has('is_active')) {
            // Prevent self-deactivation
            if ($user->id !== auth()->id()) {
                $user->is_active = $request->boolean('is_active');
            }
        }

        if (!empty($validated['password'])) {
            $user->password = Hash::make($validated['password']);
        }

        if ($request->boolean('remove_avatar') || $request->input('remove_avatar') === '1') {
            if ($user->avatar && Storage::disk('public')->exists($user->avatar)) {
                Storage::disk('public')->delete($user->avatar);
            }
            $user->avatar = null;
        } elseif ($request->hasFile('avatar')) {
            if ($user->avatar && Storage::disk('public')->exists($user->avatar)) {
                Storage::disk('public')->delete($user->avatar);
            }
            $user->avatar = $request->file('avatar')->store('avatars', 'public');
        }

        // Handle user_type update: only administrators can change user_type
        if ($request->has('user_type') && $callingUser && $callingUser->isAdministrator()) {
            $newType = $validated['user_type'] ?? null;
            if ($newType && in_array($newType, User::USER_TYPES, true)) {
                // Ensure the root admin user remains administrator
                if ($user->email === 'admin@crm.local') {
                    $user->user_type = 'administrator';
                } else {
                    $user->user_type = $newType;
                }
            }
        }

        // دامنه دسترسی فقط توسط مدیر ارشد قابل تغییر است.
        if ($request->has('data_scope') && $callingUser?->isAdministrator() && $user->email !== 'admin@crm.local') {
            $newScope = $validated['data_scope'] ?? null;
            if ($newScope && in_array($newScope, User::DATA_SCOPES, true)) {
                $user->data_scope = $newScope;
            }
        }

        // نقش‌های عملیاتی نباید بدون تصمیم مدیر، دسترسی «همه مشتریان» داشته باشند.
        if (in_array($user->user_type, ['salesperson', 'installer'], true) && $user->data_scope === 'all' && ! $request->has('data_scope')) {
            $user->data_scope = 'own';
        }

        $user->save();

        if ($request->has('permissions') || $request->has('sync_permissions')) {
            $requestedPerms = $validated['permissions'] ?? [];
            if ($callingUser && !$callingUser->isAdministrator()) {
                // Caller can only grant or revoke permissions within their own scope
                $callerPerms = $callingUser->getAllPermissions()->pluck('name')->all();
                $targetExistingPerms = $user->getAllPermissions()->pluck('name')->all();

                $preservedPerms = array_diff($targetExistingPerms, $callerPerms);
                $grantedInScope = array_intersect($requestedPerms, $callerPerms);

                $finalPerms = array_values(array_unique(array_merge($preservedPerms, $grantedInScope)));
                $user->syncPermissions($finalPerms);
            } else {
                $user->syncPermissions($requestedPerms);
            }
        }

        return response()->json([
            'message' => 'اطلاعات کاربر با موفقیت ویرایش شد.',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'avatar' => $user->avatar,
                'avatar_url' => $user->avatar_url,
                'is_active' => $user->is_active,
                'user_type' => $user->user_type,
                'user_type_label' => $user->userTypeLabel(),
                'data_scope' => $user->data_scope,
                'permissions' => $user->getAllPermissions()->pluck('name')->values()->all(),
            ],
        ]);
    }

    public function destroy(User $user): JsonResponse
    {
        $this->authorizePermission('users.manage');

        if ($user->id === auth()->id()) {
            return response()->json([
                'message' => 'امکان حذف حساب کاربری خودتان وجود ندارد.',
            ], 422);
        }

        // Prevent deleting the original admin@crm.local account
        if ($user->email === 'admin@crm.local') {
            return response()->json([
                'message' => 'امکان حذف حساب مدیر اصلی سیستم وجود ندارد.',
            ], 422);
        }

        // Only administrators can delete administrator accounts
        $callingUser = auth()->user();
        if ($user->isAdministrator() && (!$callingUser || !$callingUser->isAdministrator())) {
            return response()->json([
                'message' => 'مدیران عادی امکان حذف حساب مدیر ارشد را ندارند.',
            ], 403);
        }

        if ($user->avatar && Storage::disk('public')->exists($user->avatar)) {
            Storage::disk('public')->delete($user->avatar);
        }

        $userName = $user->name;

        DB::transaction(function () use ($user) {
            // دسترسی‌های استثنا و مجوزها باید قبل از حذف پاک شوند.
            CustomerAccessGrant::where('user_id', $user->id)->delete();
            CustomerAccessGrant::where('target_user_id', $user->id)->delete();
            $user->syncPermissions([]);
            $user->delete();
        });

        return response()->json([
            'message' => "کاربر «{$userName}» با موفقیت حذف گردید.",
        ]);
    }

    public function updatePermissions(Request $request, User $user): JsonResponse
    {
        $this->authorizePermission('users.manage');

        $callingUser = auth()->user();
        if ($user->isAdministrator() && (!$callingUser || !$callingUser->isAdministrator())) {
            abort(403, 'مدیران عادی امکان تغییر دسترسی‌های مدیر ارشد را ندارند.');
        }

        $validated = $request->validate([
            'permissions' => 'present|array',
            'permissions.*' => 'string|exists:permissions,name',
        ]);

        $requestedPerms = $validated['permissions'];

        if ($callingUser && !$callingUser->isAdministrator()) {
            $callerPerms = $callingUser->getAllPermissions()->pluck('name')->all();
            $targetExistingPerms = $user->getAllPermissions()->pluck('name')->all();

            $preservedPerms = array_diff($targetExistingPerms, $callerPerms);
            $grantedInScope = array_intersect($requestedPerms, $callerPerms);

            $finalPerms = array_values(array_unique(array_merge($preservedPerms, $grantedInScope)));
            $user->syncPermissions($finalPerms);
        } else {
            $user->syncPermissions($requestedPerms);
        }

        return response()->json([
            'message' => "مجوزهای کاربر «{$user->name}» با موفقیت بروزرسانی شد.",
            'permissions' => $user->getAllPermissions()->pluck('name')->values()->all(),
        ]);
    }

    /**
     * دامنه دسترسی مشتریان یک کارمند + استثناها (تسک ۱).
     */
    public function showCustomerAccess(User $user): JsonResponse
    {
        $this->authorizePermission('users.manage');

        $grants = CustomerAccessGrant::query()
            ->where('user_id', $user->id)
            ->get(['scope_type', 'target_user_id', 'customer_id']);

        return response()->json([
            'scope' => $user->data_scope ?? 'all',
            'staff_ids' => $grants->where('scope_type', CustomerAccessGrant::SCOPE_STAFF)->pluck('target_user_id')->filter()->values()->all(),
            'customer_ids' => $grants->where('scope_type', CustomerAccessGrant::SCOPE_CUSTOMER)->pluck('customer_id')->filter()->values()->all(),
        ]);
    }

    /**
     * ذخیره دامنه دسترسی مشتریان و استثناهای کارمند (فقط مدیر ارشد).
     */
    public function updateCustomerAccess(Request $request, User $user): JsonResponse
    {
        $this->authorizePermission('users.manage');

        $callingUser = auth()->user();

        if (! $callingUser?->isAdministrator()) {
            abort(403, 'تعریف دامنه دسترسی مشتریان فقط توسط مدیر ارشد سامانه امکان‌پذیر است.');
        }

        if ($user->email === 'admin@crm.local') {
            return response()->json([
                'message' => 'دامنه دسترسی حساب مدیر اصلی سیستم قابل تغییر نیست و همیشه «همه مشتریان» است.',
            ], 422);
        }

        $validated = $request->validate([
            'scope' => 'required|in:all,own,custom',
            'staff_ids' => 'nullable|array',
            'staff_ids.*' => 'integer|exists:users,id',
            'customer_ids' => 'nullable|array',
            'customer_ids.*' => 'integer|exists:customers,id',
        ], [
            'scope.required' => 'دامنه دسترسی را انتخاب کنید.',
            'scope.in' => 'دامنه دسترسی انتخاب‌شده معتبر نیست.',
        ]);

        $scope = $validated['scope'];
        $staffIds = array_values(array_unique(array_map('intval', $validated['staff_ids'] ?? [])));
        $customerIds = array_values(array_unique(array_map('intval', $validated['customer_ids'] ?? [])));

        // خود کارمند و مدیران ارشد نباید به عنوان «مشتریان یک کارمند دیگر» انتخاب شوند.
        $staffIds = array_values(array_filter($staffIds, fn ($id) => $id !== (int) $user->id));

        DB::transaction(function () use ($user, $scope, $staffIds, $customerIds, $callingUser) {
            CustomerAccessGrant::where('user_id', $user->id)->delete();

            $user->data_scope = $scope;
            $user->save();

            if ($scope !== 'custom') {
                return;
            }

            foreach ($staffIds as $staffId) {
                CustomerAccessGrant::create([
                    'user_id' => $user->id,
                    'scope_type' => CustomerAccessGrant::SCOPE_STAFF,
                    'target_user_id' => $staffId,
                    'created_by' => $callingUser?->id,
                ]);
            }

            foreach ($customerIds as $customerId) {
                CustomerAccessGrant::create([
                    'user_id' => $user->id,
                    'scope_type' => CustomerAccessGrant::SCOPE_CUSTOMER,
                    'customer_id' => $customerId,
                    'created_by' => $callingUser?->id,
                ]);
            }
        });

        return response()->json([
            'message' => 'دامنه دسترسی مشتریان با موفقیت ذخیره شد.',
            'access' => [
                'scope' => $scope,
                'staff_ids' => $staffIds,
                'customer_ids' => $customerIds,
            ],
        ]);
    }

    public function toggleActive(User $user): JsonResponse
    {
        $this->authorizePermission('users.manage');

        $callingUser = auth()->user();
        if ($user->isAdministrator() && (!$callingUser || !$callingUser->isAdministrator())) {
            return response()->json([
                'message' => 'مدیران عادی امکان تغییر وضعیت حساب مدیر ارشد را ندارند.',
            ], 403);
        }

        if ($user->id === auth()->id()) {
            return response()->json([
                'message' => 'امکان تغییر وضعیت حساب کاربری خودتان وجود ندارد.',
            ], 422);
        }

        $user->update(['is_active' => !$user->is_active]);

        return response()->json([
            'message' => $user->is_active ? 'کاربر فعال شد.' : 'کاربر غیرفعال شد.',
            'is_active' => $user->is_active,
        ]);
    }

    public function availablePermissions(): JsonResponse
    {
        $this->authorizePermission('users.manage');

        $callingUser = auth()->user();
        $query = Permission::where('guard_name', 'web');

        // Non-administrators can only see and grant permissions they already possess
        if ($callingUser && !$callingUser->isAdministrator()) {
            $callerPerms = $callingUser->getAllPermissions()->pluck('name')->all();
            $query->whereIn('name', $callerPerms);
        }

        $permissions = $query
            ->get()
            ->map(function ($p) {
                return [
                    'name' => $p->name,
                    'label' => self::PERMISSION_LABELS[$p->name] ?? $p->name,
                ];
            });

        return response()->json($permissions);
    }

    protected function authorizePermission(string $permission): void
    {
        $user = auth()->user();
        if (!$user || !$user->hasPermissionTo($permission)) {
            abort(403, "شما دسترسی لازم ({$permission}) برای این عملیات را ندارید.");
        }
    }
}
