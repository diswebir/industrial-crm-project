<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * توکن‌های Sanctum پس از غیرفعال‌شدن حساب هم معتبر می‌مانند؛ این میان‌افزار
 * جلوی ادامه استفاده از نشست قبلی را می‌گیرد.
 */
class EnsureUserIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ! $user->is_active) {
            return response()->json([
                'message' => 'حساب کاربری شما غیرفعال شده است. با مدیر سامانه تماس بگیرید.',
            ], 401);
        }

        return $next($request);
    }
}
