<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
        'parts.manage' => 'مدیریت و ثبت دستگاه‌ها',
        'parts.assign' => 'تخصیص دستگاه به مشتری',
        'parts.history' => 'ثبت سوابق خدمات دستگاه‌ها',
        'sms.send' => 'ارسال پیامک الگو',
        'sms.logs' => 'مشاهده سوابق پیامک',
        'users.manage' => 'مدیریت کاربران و دسترسی‌ها',
        'settings.manage' => 'مدیریت تنظیمات سیستم',
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
                'created_at' => $u->created_at?->format('Y-m-d H:i'),
                'permissions' => $u->getAllPermissions()->pluck('name')->values()->all(),
            ];
        });

        return response()->json($users);
    }

    public function show(User $user): JsonResponse
    {
        $this->authorizePermission('users.manage');

        $callingUser = auth()->user();
        if ($user->isAdministrator() && (!$callingUser || !$callingUser->isAdministrator())) {
            abort(403, 'مدیران عادی دسترسی به اطلاعات حساب مدیر ارشد را ندارند.');
        }

        return response()->json([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'avatar' => $user->avatar,
            'avatar_url' => $user->avatar_url,
            'is_active' => $user->is_active,
            'user_type' => $user->user_type,
            'created_at' => $user->created_at?->format('Y-m-d H:i'),
            'permissions' => $user->getAllPermissions()->pluck('name')->values()->all(),
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

        $avatarPath = null;
        if ($request->hasFile('avatar')) {
            $avatarPath = $request->file('avatar')->store('avatars', 'public');
        }

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'phone' => $validated['phone'] ?? null,
            'avatar' => $avatarPath,
            'password' => Hash::make($validated['password']),
            'is_active' => $request->boolean('is_active', true),
        ]);

        // Determine user_type: only administrators can create other administrators
        $callingUser = auth()->user();
        if ($callingUser && $callingUser->isAdministrator()) {
            $resolvedType = $validated['user_type'] ?? 'manager';
        } else {
            $resolvedType = 'manager';
        }
        $user->user_type = $resolvedType;
        $user->save();

        // New roles get a least-privilege preset when no explicit ACL was sent.
        $roleDefaults = [
            'salesperson' => ['customers.view', 'customers.create', 'customers.edit', 'parts.view', 'parts.assign'],
            'installer' => ['customers.view', 'parts.view', 'parts.history'],
        ];
        $requestedPerms = $validated['permissions'] ?? ($request->boolean('sync_permissions') ? [] : ($roleDefaults[$resolvedType] ?? []));
        if ($callingUser && !$callingUser->isAdministrator()) {
            $callerPerms = $callingUser->getAllPermissions()->pluck('name')->all();
            $requestedPerms = array_values(array_intersect($requestedPerms, $callerPerms));
        }
        $user->syncPermissions($requestedPerms);

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

        // Only administrators can change another user's credentials or identity.
        if (!$callingUser->isAdministrator() && $user->id !== $callingUser->id) {
            abort(403, 'ویرایش حساب کاربران دیگر فقط برای مدیر ارشد مجاز است.');
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

        $user->save();
        if (!empty($validated['password']) || !$user->is_active) {
            $user->tokens()->delete();
        }

        // Handle user_type update: only administrators can change user_type
        $callingUser = auth()->user();
        if ($request->has('user_type') && $callingUser && $callingUser->isAdministrator()) {
            $newType = $validated['user_type'] ?? null;
            if ($newType) {
                // Ensure the root admin user remains administrator
                if ($user->email === 'admin@crm.local') {
                    $user->user_type = 'administrator';
                } else {
                    $user->user_type = $newType;
                }
                $user->save();
            }
        }

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

        if (Customer::withTrashed()->where('created_by_user_id', $user->id)->exists()) {
            return response()->json([
                'message' => 'ابتدا مالکیت پرونده‌های این کاربر را به کاربر دیگری منتقل کنید.',
            ], 422);
        }

        if ($user->avatar && Storage::disk('public')->exists($user->avatar)) {
            Storage::disk('public')->delete($user->avatar);
        }

        $userName = $user->name;
        $user->syncPermissions([]);
        $user->delete();

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
        $callingUser = auth()->user();

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
        if (!$user->is_active) {
            $user->tokens()->delete();
        }

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
        if (!$user || !$user->hasPermissionTo($permission) || ($permission === 'users.manage' && $user->hasRestrictedCustomers())) {
            abort(403, "شما دسترسی لازم ({$permission}) برای این عملیات را ندارید.");
        }
    }
}
