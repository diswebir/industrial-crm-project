<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Spatie\Permission\Models\Permission;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  مدیریت کاربران، نقش‌ها و دسترسی‌ها (تسک ۱ — RBAC & Granular ACL)
 *
 *  علاوه بر مجوزهای مستقیم (Pure ACL)، برای هر کاربر می‌توان تعیین کرد:
 *    - نقش سازمانی (user_type): مدیر ارشد / مدیر / کارمند فروش / نصاب
 *    - دامنه دسترسی به مشتریان (customers_scope): همه مشتریان یا فقط مشتریان خودش
 *    - استثنا ۱: دسترسی به مشتریانِ یک یا چند کارمند خاص (user_staff_access)
 *    - استثنا ۲: دسترسی به یک یا چند مشتری خاصِ تکی (user_customer_access)
 * ─────────────────────────────────────────────────────────────────────────────
 */
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
        'inventory.manage' => 'مدیریت موجودی انبار (ورود/خروج/اصلاح)',
        'inventory.logs' => 'مشاهده تاریخچه ورود و خروج انبار',
        'sms.send' => 'ارسال پیامک الگو',
        'sms.logs' => 'مشاهده سوابق پیامک',
        'users.manage' => 'مدیریت کاربران، نقش‌ها و دسترسی‌ها',
        'settings.manage' => 'مدیریت تنظیمات سیستم',
    ];

    public const PERMISSION_GROUPS = [
        'customers.view' => 'مشتریان',
        'customers.create' => 'مشتریان',
        'customers.edit' => 'مشتریان',
        'customers.delete' => 'مشتریان',
        'customers.import' => 'مشتریان',
        'customers.export' => 'مشتریان',
        'parts.view' => 'دستگاه‌ها',
        'parts.manage' => 'دستگاه‌ها',
        'parts.assign' => 'دستگاه‌ها',
        'parts.history' => 'دستگاه‌ها',
        'inventory.manage' => 'انبار',
        'inventory.logs' => 'انبار',
        'sms.send' => 'پیامک',
        'sms.logs' => 'پیامک',
        'users.manage' => 'سیستم',
        'settings.manage' => 'سیستم',
    ];

    /**
     * فهرست کاربران به‌همراه نقش، دامنه دسترسی و استثناهای اعطاشده.
     */
    public function index(): JsonResponse
    {
        $this->authorizePermission('users.manage');

        $callingUser = $this->currentUser();
        $query = User::query()->withCount('createdCustomers')->latest();

        // مدیران عادی نمی‌توانند کاربران «مدیر ارشد» را در فهرست ببینند
        if ($callingUser && !$callingUser->isAdministrator()) {
            $query->where(function ($q) {
                $q->where('user_type', '!=', 'administrator')
                    ->orWhereNull('user_type');
            });
        }

        $users = $query->get()->map(function (User $u) {
            return $this->presentUser($u, true);
        });

        return response()->json($users);
    }

    public function show(User $user): JsonResponse
    {
        $this->authorizePermission('users.manage');

        $callingUser = $this->currentUser();
        if ($user->isAdministrator() && (!$callingUser || !$callingUser->isAdministrator())) {
            abort(403, 'مدیران عادی دسترسی به اطلاعات حساب مدیر ارشد را ندارند.');
        }

        return response()->json($this->presentUser($user, true));
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizePermission('users.manage');

        $validated = $request->validate($this->userRules(isUpdate: false), $this->userMessages());

        $avatarPath = null;
        if ($request->hasFile('avatar')) {
            $avatarPath = $request->file('avatar')->store('avatars', 'public');
        }

        $callingUser = $this->currentUser();
        $roleKey = $this->resolveRole($request, $callingUser, 'manager');

        $user = DB::transaction(function () use ($validated, $avatarPath, $roleKey, $request, $callingUser) {
            $user = User::create([
                'name' => $validated['name'],
                'email' => $validated['email'],
                'phone' => $validated['phone'] ?? null,
                'avatar' => $avatarPath,
                'password' => Hash::make($validated['password']),
                'is_active' => $request->boolean('is_active', true),
                'user_type' => $roleKey,
                'customers_scope' => $this->resolveScope($request, $callingUser, $roleKey),
            ]);

            $permissions = $this->resolvePermissions($request, $callingUser, $roleKey, $validated['permissions'] ?? null);
            if (!empty($permissions)) {
                $user->syncPermissions($permissions);
            }

            $this->syncAccessGrants($user, $request, $callingUser);

            return $user;
        });

        return response()->json([
            'message' => "کاربر «{$user->name}» با نقش «{$user->role_label}» و دسترسی‌های تعیین‌شده با موفقیت ایجاد شد.",
            'user' => $this->presentUser($user->fresh(), true),
        ], 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $this->authorizePermission('users.manage');

        $callingUser = $this->currentUser();
        if ($user->isAdministrator() && (!$callingUser || !$callingUser->isAdministrator())) {
            abort(403, 'مدیران عادی امکان ویرایش حساب مدیر ارشد را ندارند.');
        }

        $validated = $request->validate($this->userRules(isUpdate: true, userId: $user->id), $this->userMessages());

        DB::transaction(function () use ($request, $user, $validated, $callingUser) {
            $user->name = $validated['name'];
            $user->email = $validated['email'];
            if (array_key_exists('phone', $validated)) {
                $user->phone = $validated['phone'];
            }

            if ($request->has('is_active') && $user->id !== auth()->id()) {
                $user->is_active = $request->boolean('is_active');
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

            // تغییر نقش سازمانی (فقط مدیران ارشد می‌توانند نقش مدیر ارشد بدهند)
            if ($request->has('user_type')) {
                $newRole = $this->resolveRole($request, $callingUser, $user->roleKey());
                if ($user->email === 'admin@crm.local') {
                    $newRole = User::ROLE_ADMINISTRATOR;
                }
                $user->user_type = $newRole;
            }

            // تغییر دامنه دسترسی به مشتریان
            if ($request->has('customers_scope')) {
                $user->customers_scope = $this->resolveScope($request, $callingUser, $user->roleKey(), $user->customers_scope);
            }

            $user->save();

            if ($request->has('permissions') || $request->has('sync_permissions')) {
                $permissions = $this->resolvePermissions($request, $callingUser, $user->roleKey(), $validated['permissions'] ?? [], $user);
                $user->syncPermissions($permissions);
            }

            if ($request->has('accessible_staff_ids') || $request->has('accessible_customer_ids')) {
                $this->syncAccessGrants($user, $request, $callingUser);
            }
        });

        $user->flushAccessCache();

        return response()->json([
            'message' => 'اطلاعات کاربر و سطح دسترسی او با موفقیت ویرایش شد.',
            'user' => $this->presentUser($user->fresh(), true),
        ]);
    }

    public function destroy(User $user): JsonResponse
    {
        $this->authorizePermission('users.manage');

        if ($user->id === auth()->id()) {
            return response()->json(['message' => 'امکان حذف حساب کاربری خودتان وجود ندارد.'], 422);
        }

        if ($user->email === 'admin@crm.local') {
            return response()->json(['message' => 'امکان حذف حساب مدیر اصلی سیستم وجود ندارد.'], 422);
        }

        $callingUser = $this->currentUser();
        if ($user->isAdministrator() && (!$callingUser || !$callingUser->isAdministrator())) {
            return response()->json(['message' => 'مدیران عادی امکان حذف حساب مدیر ارشد را ندارند.'], 403);
        }

        if ($user->avatar && Storage::disk('public')->exists($user->avatar)) {
            Storage::disk('public')->delete($user->avatar);
        }

        $userName = $user->name;

        DB::transaction(function () use ($user) {
            $user->syncPermissions([]);
            $user->accessibleStaff()->detach();
            $user->accessibleCustomers()->detach();
            $user->delete();
        });

        return response()->json(['message' => "کاربر «{$userName}» با موفقیت حذف گردید."]);
    }

    public function updatePermissions(Request $request, User $user): JsonResponse
    {
        $this->authorizePermission('users.manage');

        $callingUser = $this->currentUser();
        if ($user->isAdministrator() && (!$callingUser || !$callingUser->isAdministrator())) {
            abort(403, 'مدیران عادی امکان تغییر دسترسی‌های مدیر ارشد را ندارند.');
        }

        $validated = $request->validate([
            'permissions' => 'present|array',
            'permissions.*' => 'string|exists:permissions,name',
        ], [
            'permissions.present' => 'لیست مجوزها ارسال نشده است.',
            'permissions.*.exists' => 'یکی از مجوزهای ارسال‌شده در سامانه تعریف نشده است.',
        ]);

        $finalPerms = $this->resolvePermissions($request, $callingUser, $user->roleKey(), $validated['permissions'], $user);
        $user->syncPermissions($finalPerms);

        return response()->json([
            'message' => "مجوزهای کاربر «{$user->name}» با موفقیت بروزرسانی شد.",
            'permissions' => $user->getAllPermissions()->pluck('name')->values()->all(),
        ]);
    }

    /**
     * ذخیره دامنه دسترسی و استثناهای اعطاشده به یک کاربر (بدون تغییر سایر اطلاعات).
     */
    public function updateAccessScope(Request $request, User $user): JsonResponse
    {
        $this->authorizePermission('users.manage');

        $callingUser = $this->currentUser();
        if ($user->isAdministrator() && (!$callingUser || !$callingUser->isAdministrator())) {
            abort(403, 'مدیران عادی امکان تغییر دامنه دسترسی مدیر ارشد را ندارند.');
        }

        $request->validate([
            'customers_scope' => 'sometimes|in:all,own',
            'accessible_staff_ids' => 'sometimes|array',
            'accessible_staff_ids.*' => 'integer|exists:users,id',
            'accessible_customer_ids' => 'sometimes|array',
            'accessible_customer_ids.*' => 'integer|exists:customers,id',
        ], [
            'customers_scope.in' => 'دامنه دسترسی باید «همه مشتریان» یا «فقط مشتریان خودش» باشد.',
        ]);

        DB::transaction(function () use ($user, $request, $callingUser) {
            if ($request->has('customers_scope')) {
                $user->customers_scope = $this->resolveScope($request, $callingUser, $user->roleKey(), $user->customers_scope);
                $user->save();
            }

            $this->syncAccessGrants($user, $request, $callingUser);
        });

        $user->flushAccessCache();

        return response()->json([
            'message' => "دامنه دسترسی کاربر «{$user->name}» بروزرسانی شد.",
            'user' => $this->presentUser($user->fresh(), true),
        ]);
    }

    public function toggleActive(User $user): JsonResponse
    {
        $this->authorizePermission('users.manage');

        $callingUser = $this->currentUser();
        if ($user->isAdministrator() && (!$callingUser || !$callingUser->isAdministrator())) {
            return response()->json(['message' => 'مدیران عادی امکان تغییر وضعیت حساب مدیر ارشد را ندارند.'], 403);
        }

        if ($user->id === auth()->id()) {
            return response()->json(['message' => 'امکان تغییر وضعیت حساب کاربری خودتان وجود ندارد.'], 422);
        }

        $user->update(['is_active' => !$user->is_active]);

        return response()->json([
            'message' => $user->is_active ? 'کاربر فعال شد.' : 'کاربر غیرفعال شد.',
            'is_active' => $user->is_active,
        ]);
    }

    /**
     * فهرست مجوزهای قابل اعطا (با برچسب و گروه فارسی).
     */
    public function availablePermissions(): JsonResponse
    {
        $this->authorizePermission('users.manage');

        $callingUser = $this->currentUser();
        $query = Permission::where('guard_name', 'web');

        // غیر از مدیر ارشد، فقط مجوزهایی که خودش دارد قابل مشاهده/اعطا است
        if ($callingUser && !$callingUser->isAdministrator()) {
            $callerPerms = $callingUser->getAllPermissions()->pluck('name')->all();
            $query->whereIn('name', $callerPerms);
        }

        $order = array_keys(self::PERMISSION_LABELS);

        $permissions = $query->get()
            ->sortBy(fn (Permission $p) => array_search($p->name, $order, true) === false ? 999 : array_search($p->name, $order, true))
            ->map(fn (Permission $p) => [
                'name' => $p->name,
                'label' => self::PERMISSION_LABELS[$p->name] ?? $p->name,
                'group' => self::PERMISSION_GROUPS[$p->name] ?? 'سایر',
            ])
            ->values();

        return response()->json($permissions);
    }

    /**
     * فهرست نقش‌های سازمانی و پیش‌فرض‌های هر نقش (برای فرم ساخت/ویرایش کاربر).
     */
    public function roles(): JsonResponse
    {
        $this->authorizePermission('users.manage');

        $callingUser = $this->currentUser();

        $roles = collect(config('acl.roles', []))->map(function (array $role, string $key) use ($callingUser) {
            $permissions = $role['permissions'] === '*'
                ? array_keys(self::PERMISSION_LABELS)
                : (array) $role['permissions'];

            return [
                'key' => $key,
                'label' => $role['label'],
                'description' => $role['description'] ?? '',
                'default_scope' => $role['scope'] ?? 'own',
                'default_permissions' => $permissions,
                'assignable' => $callingUser && $callingUser->isAdministrator() ? true : $key !== User::ROLE_ADMINISTRATOR,
            ];
        })->values();

        return response()->json([
            'roles' => $roles,
            'scopes' => collect(config('acl.scopes', []))->map(fn ($label, $key) => ['key' => $key, 'label' => $label])->values(),
        ]);
    }

    /**
     * فهرست کارکنان قابل انتخاب برای اعطای دسترسی (استثنا ۱).
     */
    public function selectableStaff(): JsonResponse
    {
        $this->authorizePermission('users.manage');

        $callingUser = $this->currentUser();

        $query = User::query()->where('is_active', true)->orderBy('name');

        if ($callingUser && !$callingUser->isAdministrator()) {
            $query->where(function ($q) {
                $q->where('user_type', '!=', 'administrator')->orWhereNull('user_type');
            });
        }

        $staff = $query->get(['id', 'name', 'email', 'user_type', 'customers_scope'])->map(fn (User $u) => [
            'id' => $u->id,
            'name' => $u->name,
            'email' => $u->email,
            'role' => $u->roleKey(),
            'role_label' => $u->role_label,
        ])->values();

        return response()->json($staff);
    }

    /**
     * جستجوی مشتریان برای اعطای دسترسی تکی (استثنا ۲).
     */
    public function selectableCustomers(Request $request): JsonResponse
    {
        $this->authorizePermission('users.manage');

        $query = Customer::query()->visibleTo($this->currentUser())->orderByDesc('id');

        if ($request->filled('q')) {
            $term = trim((string) $request->q);
            $op = $this->likeOp();
            $query->where(function ($q) use ($term, $op) {
                $q->where('first_name', $op, "%{$term}%")
                    ->orWhere('last_name', $op, "%{$term}%")
                    ->orWhere('company_name', $op, "%{$term}%")
                    ->orWhere('mobile', $op, "%{$term}%");
            });
        }

        $customers = $query->limit(60)->get(['id', 'first_name', 'last_name', 'company_name', 'mobile'])
            ->map(fn (Customer $c) => [
                'id' => $c->id,
                'label' => $c->full_name,
                'mobile' => $c->mobile,
            ])->values();

        return response()->json($customers);
    }

    /**
     * ─────────────────────────────────────────────────────────────────────────
     *  هلپرهای داخلی
     * ─────────────────────────────────────────────────────────────────────────
     */

    /**
     * @return array<string, mixed>
     */
    protected function presentUser(?User $user, bool $withGrants = false): array
    {
        if (!$user) {
            return [];
        }

        $data = [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'avatar' => $user->avatar,
            'avatar_url' => $user->avatar_url,
            'is_active' => (bool) $user->is_active,
            'user_type' => $user->roleKey(),
            'role_label' => $user->role_label,
            'customers_scope' => $user->customers_scope ?: 'all',
            'has_global_customer_access' => $user->hasGlobalCustomerAccess(),
            'created_at' => $user->created_at?->format('Y-m-d H:i'),
            'permissions' => $user->getAllPermissions()->pluck('name')->values()->all(),
            'created_customers_count' => (int) ($user->created_customers_count ?? 0),
        ];

        if ($withGrants) {
            $data['accessible_staff_ids'] = $user->accessibleStaffIds();
            $data['accessible_customer_ids'] = $user->accessibleCustomerIds();
            $data['accessible_staff'] = $user->accessibleStaff()->get(['users.id', 'users.name'])->map(fn ($u) => ['id' => $u->id, 'name' => $u->name])->values();
            $data['accessible_customers'] = $user->accessibleCustomers()->get(['customers.id', 'customers.first_name', 'customers.last_name', 'customers.company_name'])
                ->map(fn (Customer $c) => ['id' => $c->id, 'label' => $c->full_name])->values();
        }

        return $data;
    }

    protected function resolveRole(Request $request, ?User $callingUser, string $fallback): string
    {
        $allowed = array_keys(config('acl.roles', []));
        $requested = (string) $request->input('user_type', $fallback);

        if (!in_array($requested, $allowed, true)) {
            $requested = $fallback;
        }

        // فقط مدیر ارشد می‌تواند نقش مدیر ارشد به کسی بدهد
        if ($requested === User::ROLE_ADMINISTRATOR && (!$callingUser || !$callingUser->isAdministrator())) {
            $requested = User::ROLE_MANAGER;
        }

        return $requested;
    }

    protected function resolveScope(Request $request, ?User $callingUser, string $roleKey, ?string $current = null): string
    {
        $requested = $request->has('customers_scope') ? (string) $request->input('customers_scope') : null;

        if ($requested === null || !in_array($requested, ['all', 'own'], true)) {
            if ($current !== null && in_array($current, ['all', 'own'], true)) {
                return $current;
            }

            return (string) (config("acl.roles.{$roleKey}.scope") ?: config('acl.default_scope', 'all'));
        }

        // ارتقای دامنه به «همه مشتریان» فقط توسط مدیر ارشد
        if ($requested === 'all' && $current !== 'all' && (!$callingUser || !$callingUser->isAdministrator())) {
            return $current ?: 'own';
        }

        return $requested;
    }

    /**
     * @param  array<int, string>|null  $requested
     * @return array<int, string>
     */
    protected function resolvePermissions(Request $request, ?User $callingUser, string $roleKey, ?array $requested, ?User $target = null): array
    {
        $isCallerAdmin = $callingUser && $callingUser->isAdministrator();

        // اگر لیستی ارسال نشد، از پیش‌فرض نقش استفاده می‌شود
        if ($requested === null) {
            $preset = config("acl.roles.{$roleKey}.permissions");
            $requested = $preset === '*' ? array_keys(self::PERMISSION_LABELS) : (array) $preset;
        }

        $requested = array_values(array_filter((array) $requested, 'is_string'));

        if (!$isCallerAdmin) {
            $callerPerms = $callingUser ? $callingUser->getAllPermissions()->pluck('name')->all() : [];
            $grantedInScope = array_values(array_intersect($requested, $callerPerms));

            if ($target) {
                $targetExisting = $target->getAllPermissions()->pluck('name')->all();
                $preserved = array_values(array_diff($targetExisting, $callerPerms));

                return array_values(array_unique(array_merge($preserved, $grantedInScope)));
            }

            return $grantedInScope;
        }

        // مدیر ارشد هم نمی‌تواند مجوزی اعطا کند که در سامانه تعریف نشده است
        $existing = Permission::where('guard_name', 'web')->pluck('name')->all();

        return array_values(array_intersect($requested, $existing));
    }

    /**
     * همگام‌سازی استثناهای دسترسی (کارمندان مشخص + مشتریان تکی).
     */
    protected function syncAccessGrants(User $user, Request $request, ?User $callingUser): void
    {
        $isCallerAdmin = $callingUser && $callingUser->isAdministrator();

        if ($request->has('accessible_staff_ids')) {
            $staffIds = collect($request->input('accessible_staff_ids'))
                ->map(fn ($id) => (int) $id)
                ->filter(fn (int $id) => $id > 0 && $id !== (int) $user->id)
                ->unique()
                ->values();

            if (!$isCallerAdmin) {
                // مدیران عادی فقط می‌توانند دسترسی به کارکنان غیر ارشد بدهند
                $allowed = User::query()->whereIn('id', $staffIds)
                    ->where(function ($q) {
                        $q->where('user_type', '!=', 'administrator')->orWhereNull('user_type');
                    })->pluck('id')->all();
                $staffIds = $staffIds->intersect($allowed)->values();
            }

            $existing = User::query()->whereIn('id', $staffIds)->pluck('id')->all();
            $user->accessibleStaff()->sync($existing);
        }

        if ($request->has('accessible_customer_ids')) {
            $customerIds = collect($request->input('accessible_customer_ids'))
                ->map(fn ($id) => (int) $id)
                ->filter(fn (int $id) => $id > 0)
                ->unique()
                ->values();

            // فقط مشتریانی که خودِ فراخوان هم به آن‌ها دسترسی دارد قابل اعطا هستند
            $allowed = Customer::query()->visibleTo($callingUser)->whereIn('id', $customerIds)->pluck('id')->all();
            $user->accessibleCustomers()->sync($allowed);
        }

        $user->flushAccessCache();
    }

    protected function userRules(bool $isUpdate, ?int $userId = null): array
    {
        $emailUnique = 'unique:users,email' . ($isUpdate ? ',' . $userId : '');
        $phoneUnique = 'unique:users,phone' . ($isUpdate ? ',' . $userId : '');

        return [
            'name' => 'required|string|max:100',
            'email' => 'required|email|max:150|' . $emailUnique,
            'phone' => ['nullable', 'string', 'regex:/^09\d{9}$/', $phoneUnique],
            'password' => $isUpdate
                ? ['nullable', 'string', 'min:8', 'regex:/[A-Za-z]/', 'regex:/[0-9]/']
                : ['required', 'string', 'min:8', 'regex:/[A-Za-z]/', 'regex:/[0-9]/'],
            'is_active' => 'nullable|boolean',
            'avatar' => 'nullable|image|max:3072',
            'permissions' => 'nullable|array',
            'permissions.*' => 'string|exists:permissions,name',
            'user_type' => 'nullable|in:' . implode(',', array_keys(config('acl.roles', []))),
            'customers_scope' => 'nullable|in:all,own',
            'accessible_staff_ids' => 'nullable|array',
            'accessible_staff_ids.*' => 'integer|exists:users,id',
            'accessible_customer_ids' => 'nullable|array',
            'accessible_customer_ids.*' => 'integer|exists:customers,id',
        ];
    }

    protected function userMessages(): array
    {
        return [
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
            'user_type.in' => 'نقش انتخاب‌شده معتبر نیست.',
            'customers_scope.in' => 'دامنه دسترسی باید «همه مشتریان» یا «فقط مشتریان خودش» باشد.',
            'permissions.*.exists' => 'یکی از مجوزهای ارسال‌شده در سامانه تعریف نشده است.',
            'accessible_staff_ids.*.exists' => 'یکی از کارکنان انتخاب‌شده وجود ندارد.',
            'accessible_customer_ids.*.exists' => 'یکی از مشتریان انتخاب‌شده وجود ندارد.',
        ];
    }
}
