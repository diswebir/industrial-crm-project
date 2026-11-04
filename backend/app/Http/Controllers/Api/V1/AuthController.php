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
        $otpCode = strval(rand(10000, 99999));
        \Illuminate\Support\Facades\Cache::put('otp_' . $phone, $otpCode, now()->addMinutes(2));
        \Illuminate\Support\Facades\Cache::put($cooldownKey, true, now()->addSeconds(60));

        // Send normal SMS via Melipayamak
        $smsText = "کد تأیید ورود شما به سامانه مدیریت ارتباط با مشتری: {$otpCode}\nاعتبار: ۲ دقیقه";
        $smsResult = $this->melipayamakService->sendNormalSms($phone, $smsText);

        $response = [
            'message' => 'کد تأیید ورود با موفقیت به شماره شما پیامک شد.',
            'expires_in' => 120,
        ];

        if (!empty($smsResult['is_sandbox'])) {
            $response['sandbox_code'] = $otpCode;
            $response['message'] = "پیامک در حالت شبیه‌ساز (Sandbox) ثبت شد. کد ورود: {$otpCode}";
        }

        return response()->json($response);
    }

    /**
     * Verify OTP code and login.
     */
    public function verifyOtp(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'phone' => ['required', 'string', 'regex:/^09\d{9}$/'],
            'code' => ['required', 'string'],
        ], [
            'phone.required' => 'شماره همراه الزامی است.',
            'code.required' => 'کد تأیید پیامک‌شده را وارد کنید.',
        ]);

        $phone = $validated['phone'];
        $code = trim($validated['code']);

        $cachedCode = \Illuminate\Support\Facades\Cache::get('otp_' . $phone);

        if (!$cachedCode || $cachedCode !== $code) {
            throw ValidationException::withMessages([
                'code' => ['کد تأیید وارد شده نامعتبر است یا منقضی گردیده است.'],
            ]);
        }

        \Illuminate\Support\Facades\Cache::forget('otp_' . $phone);

        $user = User::where('phone', $phone)->firstOrFail();

        if (!$user->is_active) {
            return response()->json([
                'message' => 'حساب کاربری شما غیرفعال شده است.',
            ], 403);
        }

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

        $loginField = filter_var($validated['login'], FILTER_VALIDATE_EMAIL) ? 'email' : 'phone';

        $user = User::where($loginField, $validated['login'])->first();

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
            secure: request()->isSecure(), // HTTPS on cPanel, plain HTTP on local/docker
            httpOnly: true,
            raw: false,
            sameSite: 'Lax'
        );
    }
}
