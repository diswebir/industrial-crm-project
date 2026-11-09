<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SettingController extends Controller
{
    public function getSmsSettings(): JsonResponse
    {
        $this->authorizePermission('settings.manage');

        $username = Setting::get('melipayamak_username') ?: env('MELIPAYAMAK_USERNAME', '');
        $password = Setting::get('melipayamak_password') ?: env('MELIPAYAMAK_PASSWORD', '');
        $fromNumber = Setting::get('melipayamak_from') ?: env('MELIPAYAMAK_FROM', '');
        // پیش‌فرض «خاموش» است؛ روشن‌بودن ناخواسته sandbox باعث می‌شود پیامک‌ها
        // واقعاً ارسال نشوند و در گذشته کد ورود در پاسخ HTTP برگردانده می‌شد.
        $sandboxValue = Setting::get('melipayamak_sandbox', env('MELIPAYAMAK_SANDBOX', 'false'));
        $sandbox = filter_var($sandboxValue, FILTER_VALIDATE_BOOLEAN);

        return response()->json([
            'melipayamak_username' => $username,
            'melipayamak_has_password' => !empty($password),
            'melipayamak_from' => $fromNumber,
            'melipayamak_sandbox' => $sandbox,
        ]);
    }

    public function updateSmsSettings(Request $request): JsonResponse
    {
        $this->authorizePermission('settings.manage');

        $validated = $request->validate([
            'melipayamak_username' => 'nullable|string|max:100',
            'melipayamak_password' => 'nullable|string|max:100',
            'melipayamak_from' => 'nullable|string|max:50',
            'melipayamak_sandbox' => 'required|boolean',
        ]);

        if (isset($validated['melipayamak_username'])) {
            Setting::set('melipayamak_username', $validated['melipayamak_username']);
        }

        if (!empty($validated['melipayamak_password'])) {
            Setting::set('melipayamak_password', $validated['melipayamak_password'], true);
        }

        if (isset($validated['melipayamak_from'])) {
            Setting::set('melipayamak_from', $validated['melipayamak_from']);
        }

        Setting::set('melipayamak_sandbox', $validated['melipayamak_sandbox'] ? 'true' : 'false');

        return response()->json([
            'message' => 'تنظیمات سامانه ملی‌پیامک با موفقیت ذخیره شد.',
        ]);
    }

    public function getCompanySettings(): JsonResponse
    {
        // Accessible by any authenticated user (sidebar always visible when logged in)
        $companyName = Setting::get('company_name');
        $companyLogoPath = Setting::get('company_logo');
        $companyLogoUrl = null;

        if ($companyLogoPath && Storage::disk('public')->exists($companyLogoPath)) {
            $companyLogoUrl = '/storage/' . ltrim($companyLogoPath, '/');
        }

        return response()->json([
            'company_name' => $companyName ?: null,
            'company_logo_url' => $companyLogoUrl,
        ]);
    }

    public function updateCompanySettings(Request $request): JsonResponse
    {
        $this->authorizePermission('settings.manage');

        $callingUser = auth()->user();
        if (!$callingUser || !$callingUser->isAdministrator()) {
            abort(403, 'فقط مدیران ارشد می‌توانند تنظیمات شرکت را ویرایش کنند.');
        }

        $validated = $request->validate([
            'company_name' => 'nullable|string|max:100',
            'company_logo' => 'nullable|image|max:2048',
        ]);

        if (array_key_exists('company_name', $validated)) {
            Setting::set('company_name', $validated['company_name'] ?? '');
        }

        // Remove existing logo if requested
        if ($request->input('remove_logo') === '1') {
            $existingLogo = Setting::get('company_logo');
            if ($existingLogo && Storage::disk('public')->exists($existingLogo)) {
                Storage::disk('public')->delete($existingLogo);
            }
            Setting::set('company_logo', '');
        } elseif ($request->hasFile('company_logo')) {
            // Delete old logo before storing new one
            $existingLogo = Setting::get('company_logo');
            if ($existingLogo && Storage::disk('public')->exists($existingLogo)) {
                Storage::disk('public')->delete($existingLogo);
            }
            $logoPath = $request->file('company_logo')->store('logos', 'public');
            Setting::set('company_logo', $logoPath);
        }

        // Build updated logo URL for response
        $companyLogoPath = Setting::get('company_logo');
        $companyLogoUrl = null;
        if ($companyLogoPath && Storage::disk('public')->exists($companyLogoPath)) {
            $companyLogoUrl = '/storage/' . ltrim($companyLogoPath, '/');
        }

        return response()->json([
            'message' => 'تنظیمات برندینگ شرکت با موفقیت ذخیره شد.',
            'company_name' => Setting::get('company_name') ?: null,
            'company_logo_url' => $companyLogoUrl,
        ]);
    }

    protected function authorizePermission(string $permission): void
    {
        $user = auth()->user();
        if (!$user || !$user->hasPermissionTo($permission)) {
            abort(403, "شما دسترسی لازم ({$permission}) برای این عملیات را ندارید.");
        }
    }
}

