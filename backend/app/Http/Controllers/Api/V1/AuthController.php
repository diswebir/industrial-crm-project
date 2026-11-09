<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(protected \App\Services\Sms\MelipayamakService $melipayamakService)
    {
    }

    /**
     * Send OTP SMS for phone-based login.
     */
    public function sendOtp(Request $request): JsonResponse
    {
        $request->merge(['phone' => $this->normalizePhoneNumber($request->input('phone'))]);

        $validated = $request->validate([
            'phone' => ['required', 'string', 'regex:/^09\d{9}$/'],
        ], [
            'phone.required' => 'وارد کردن شماره همراه الزامی است.',
            'phone.regex' => 'شماره همراه باید ۱۱ رقم عددی بوده و با 09 شروع شود.',
        ]);

        $phone = $validated['phone'];
        $user = User::where('phone', $phone)->first();

        if (!$user) {
            throw ValidationException::withMessages([
                'phone' => ['کاربری با این شماره همراه در سیستم ثبت نشده است.'],
            ]);
        }

        if (!$user->is_active) {
            return response()->json([
                'message' => 'حساب کاربری شما غیرفعال شده است. لطفاً با مدیر سیستم تماس بگیرید.',
            ], 403);
        }

        // Rate limit: 60 seconds cooldown
        $cooldownKey = 'otp_cooldown_' . $phone;
        if (\Illuminate\Support\Facades\Cache::has($cooldownKey)) {
            return response()->json([
                'message' => 'کد تایید اخیراً ارسال شده است. لطفاً ۶۰ ثانیه صبر نمایید.',
            ], 429);
        }

        // Generate 5-digit OTP
        $otpCode = strval(random_int(10000, 99999));
        \Illuminate\Support\Facades\Cache::put('otp_' . $phone, $otpCode, now()->addMinutes(2));
        \Illuminate\Support\Facades\Cache::put('otp_attempts_' . $phone, 0, now()->addMinutes(2));
        \Illuminate\Support\Facades\Cache::put($cooldownKey, true, now()->addSeconds(60));

        // Send normal SMS via Melipayamak
        $smsText = "کد تأیید ورود شما به سامانه مدیریت ارتباط با مشتری: {$otpCode}\nاعتبار: ۲ دقیقه";
        $smsResult = $this->melipayamakService->sendNormalSms($phone, $smsText);

        if (empty($smsResult['success'])) {
            // کد ذخیره‌شده بدون ارسال پیامک بی‌فایده است و نباید معتبر بماند.
            \Illuminate\Support\Facades\Cache::forget('otp_' . $phone);
            \Illuminate\Support\Facades\Cache::forget('otp_attempts_' . $phone);
            \Illuminate\Support\Facades\Cache::forget($cooldownKey);

            return response()->json([
                'message' => 'ارسال پیامک تأیید ناموفق بود. لطفاً دوباره تلاش کنید یا با مدیر سیستم تماس بگیرید.',
            ], 503);
        }

        $response = [
            'message' => 'کد تأیید ورود با موفقیت به شماره شما پیامک شد.',
            'expires_in' => 120,
        ];

        if (!empty($smsResult['is_sandbox'])) {
            // هرگز کد یکبارمصرف را در پاسخ HTTP برنگردان؛ در غیر این صورت هر کسی
            // که شماره همراه یک کاربر را بداند می‌تواند بدون دسترسی به پیامک وارد شود.
            $response['sandbox'] = true;
            $response['message'] = 'درگاه پیامک در حالت شبیه‌ساز است و پیامکی ارسال نشد. برای دریافت کد با مدیر سیستم تماس بگیرید.';
        }

        return response()->json($response);
    }

    /**
     * Verify OTP code and login.
     */
    public function verifyOtp(Request $request): JsonResponse
    {
        $request->merge(['phone' => $this->normalizePhoneNumber($request->input('phone'))]);

        $validated = $request->validate([
            'phone' => ['required', 'string', 'regex:/^09\d{9}$/'],
            'code' => ['required', 'string'],
        ], [
            'phone.required' => 'شماره همراه الزامی است.',
            'code.required' => 'کد تأیید پیامک‌شده را وارد کنید.',
        ]);

        $phone = $validated['phone'];
        $code = trim($validated['code']);

        $attemptKey = 'otp_attempts_' . $phone;
        $attempts = (int) \Illuminate\Support\Facades\Cache::get($attemptKey, 0);

        if ($attempts >= 5) {
            \Illuminate\Support\Facades\Cache::forget('otp_' . $phone);
            throw ValidationException::withMessages([
                'code' => ['تعداد تلاش‌های ناموفق بیش از حد مجاز است. لطفاً کد جدید دریافت کنید.'],
            ]);
        }

        $cachedCode = \Illuminate\Support\Facades\Cache::get('otp_' . $phone);

        if (!$cachedCode || !hash_equals((string) $cachedCode, $code)) {
            \Illuminate\Support\Facades\Cache::put($attemptKey, $attempts + 1, now()->addMinutes(2));

            throw ValidationException::withMessages([
                'code' => ['کد تأیید وارد شده نامعتبر است یا منقضی گردیده است.'],
            ]);
        }

        \Illuminate\Support\Facades\Cache::forget('otp_' . $phone);
        \Illuminate\Support\Facades\Cache::forget($attemptKey);

        $user = User::where('phone', $phone)->firstOrFail();

        if (!$user->is_active) {
            return response()->json([
                'message' => 'حساب کاربری شما غیرفعال شده است.',
            ], 403);
        }

        // توکن‌های قدیمیِ این کاربر را پاک‌سازی کن تا جدول personal_access_tokens
        // به‌طور نامحدود رشد نکند.
        $user->tokens()->where('created_at', '<', now()->subDays(30))->delete();

        $token = $user->createToken('api-token')->plainTextToken;
        $permissions = $user->getAllPermissions()->pluck('name')->values()->all();
        $cookie = $this->createAuthCookie($token);

        return response()->json([
            'message' => 'ورود با موفقیت انجام شد.',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'avatar' => $user->avatar,
                'avatar_url' => $user->avatar_url,
                'permissions' => $permissions,
                'user_type' => $user->user_type,
                'user_type_label' => $user->userTypeLabel(),
                'data_scope' => $user->data_scope ?? 'all',
            ],
            'token' => $token,
        ])->withCookie($cookie);
    }

    /**
     * Login using email or phone and password.
     */
    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'login' => 'required|string',
            'password' => 'required|string',
        ]);

        $login = trim((string) $validated['login']);
        $loginField = filter_var($login, FILTER_VALIDATE_EMAIL) ? 'email' : 'phone';
        $loginValue = $loginField === 'email'
            ? mb_strtolower($login)
            : ($this->normalizePhoneNumber($login) ?? $login);

        $user = User::where($loginField, $loginValue)->first();

        if (!$user || !Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'login' => ['اطلاعات ورود (نام کاربری/رمز عبور) نادرست است.'],
            ]);
        }

        if (!$user->is_active) {
            return response()->json([
                'message' => 'حساب کاربری شما غیرفعال شده است. لطفاً با مدیر سیستم تماس بگیرید.',
            ], 403);
        }

        // توکن‌های قدیمیِ این کاربر را پاک‌سازی کن تا جدول personal_access_tokens
        // به‌طور نامحدود رشد نکند.
        $user->tokens()->where('created_at', '<', now()->subDays(30))->delete();

        $token = $user->createToken('api-token')->plainTextToken;
        $permissions = $user->getAllPermissions()->pluck('name')->values()->all();
        $cookie = $this->createAuthCookie($token);

        return response()->json([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'avatar' => $user->avatar,
                'avatar_url' => $user->avatar_url,
                'permissions' => $permissions,
                'user_type' => $user->user_type,
                'user_type_label' => $user->userTypeLabel(),
                'data_scope' => $user->data_scope ?? 'all',
            ],
            'token' => $token,
        ])->withCookie($cookie);
    }

    /**
     * Get the authenticated user with direct permissions.
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        $permissions = $user->getAllPermissions()->pluck('name')->values()->all();

        return response()->json([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'avatar' => $user->avatar,
                'avatar_url' => $user->avatar_url,
                'permissions' => $permissions,
                'user_type' => $user->user_type,
                'user_type_label' => $user->userTypeLabel(),
                'data_scope' => $user->data_scope ?? 'all',
            ],
        ]);
    }

    /**
     * Update authenticated user profile.
     */
    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'phone' => 'nullable|string|regex:/^09\d{9}$/|unique:users,phone,' . $user->id,
            'password' => ['nullable', 'string', 'min:8', 'regex:/[A-Za-z]/', 'regex:/[0-9]/'],
            'avatar' => 'nullable|image|max:3072',
        ], [
            'name.required' => 'وارد کردن نام و نام خانوادگی الزامی است.',
            'phone.regex' => 'فرمت شماره موبایل نامعتبر است (باید ۱۱ رقم عددی بوده و با 09 شروع شود).',
            'phone.unique' => 'این شماره موبایل قبلاً برای کاربر دیگری ثبت شده است.',
            'password.min' => 'کلمه عبور باید حداقل ۸ کاراکتر باشد.',
            'password.regex' => 'کلمه عبور باید حداقل شامل یک حرف انگلیسی و یک عدد باشد.',
            'avatar.image' => 'فایل انتخابی باید تصویر باشد.',
            'avatar.max' => 'حداکثر حجم تصویر مجاز ۳ مگابایت است.',
        ]);

        $user->name = $validated['name'];
        if (array_key_exists('phone', $validated)) {
            $user->phone = $validated['phone'];
        }

        if (!empty($validated['password'])) {
            $user->password = Hash::make($validated['password']);
        }

        if ($request->boolean('remove_avatar') || $request->input('remove_avatar') === '1') {
            if ($user->avatar && \Illuminate\Support\Facades\Storage::disk('public')->exists($user->avatar)) {
                \Illuminate\Support\Facades\Storage::disk('public')->delete($user->avatar);
            }
            $user->avatar = null;
        } elseif ($request->hasFile('avatar')) {
            if ($user->avatar && \Illuminate\Support\Facades\Storage::disk('public')->exists($user->avatar)) {
                \Illuminate\Support\Facades\Storage::disk('public')->delete($user->avatar);
            }
            $user->avatar = $request->file('avatar')->store('avatars', 'public');
        }

        $user->save();

        // تغییر رمز باید نشست‌های دیگر را باطل کند؛ توکن همین درخواست باقی می‌ماند.
        if (! empty($validated['password'])) {
            $token = $request->user()?->currentAccessToken();
            $currentTokenId = $token instanceof \Laravel\Sanctum\PersonalAccessToken ? $token->getKey() : null;
            $user->tokens()
                ->when($currentTokenId, fn ($query) => $query->whereKeyNot($currentTokenId))
                ->delete();
        }

        $permissions = $user->getAllPermissions()->pluck('name')->values()->all();

        return response()->json([
            'message' => 'پروفایل شما با موفقیت بروزرسانی شد.',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'avatar' => $user->avatar,
                'avatar_url' => $user->avatar_url,
                'permissions' => $permissions,
                'user_type' => $user->user_type,
                'user_type_label' => $user->userTypeLabel(),
                'data_scope' => $user->data_scope ?? 'all',
            ],
        ]);
    }

    /**
     * Logout and revoke API token, and clear httpOnly cookie.
     */
    public function logout(Request $request): JsonResponse
    {
        $request->user()?->currentAccessToken()?->delete();
        $cookie = cookie()->forget('crm_token', '/');

        return response()->json([
            'message' => 'خروج با موفقیت انجام شد.',
        ])->withCookie($cookie);
    }

    /**
     * Create an httpOnly cookie for the authentication token.
     */
    protected function createAuthCookie(string $token)
    {
        return cookie(
            name: 'crm_token',
            value: $token,
            minutes: 60 * 24 * 7, // 7 days
            path: '/',
            domain: null,
            // روی HTTPS (تولید) کوکی حتماً Secure باشد؛ در localhost/HTTP خاموش می‌ماند.
            secure: request()->isSecure() || str_starts_with((string) config('app.url'), 'https://'),
            httpOnly: true,
            raw: false,
            sameSite: 'Lax'
        );
    }
}
