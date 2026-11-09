<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\SmsLog;
use App\Services\Sms\MelipayamakService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SmsController extends Controller
{
    public function __construct(protected MelipayamakService $melipayamakService)
    {
    }

    /**
     * ارسال پیامک الگودار به یک مشتری یا شماره مستقیم.
     */
    public function sendPattern(Request $request): JsonResponse
    {
        $this->authorizePermission('sms.send');

        $validated = $request->validate([
            'mobile' => ['required', 'string', 'regex:/^09\d{9}$/'],
            'pattern_code' => 'required|string|max:50',
            'tokens' => 'required|array',
            'customer_id' => 'nullable|exists:customers,id',
        ], [
            'mobile.required' => 'شماره گیرنده الزامی است.',
            'mobile.regex' => 'شماره همراه باید ۱۱ رقم عددی بوده و با 09 شروع شود.',
            'pattern_code.required' => 'کد الگوی پیامک الزامی است.',
            'tokens.required' => 'متغیرهای الگوی پیامک الزامی است.',
            'customer_id.exists' => 'مشتری انتخاب‌شده در سامانه وجود ندارد.',
        ]);

        $customer = null;
        if (!empty($validated['customer_id'])) {
            $customer = Customer::find((int) $validated['customer_id']);
            // کنترل دامنه دسترسی: کارمند فروش نمی‌تواند به مشتریِ دیگران پیامک بفرستد
            $this->authorizeCustomerAccess($customer, null);
        }

        $result = $this->melipayamakService->sendPattern(
            $validated['mobile'],
            $validated['pattern_code'],
            $validated['tokens'],
            $customer
        );

        return response()->json([
            'message' => $result['status'],
            'success' => $result['success'],
            'message_id' => $result['message_id'],
            'is_sandbox' => $result['is_sandbox'] ?? false,
        ], $result['success'] ? 200 : 422);
    }

    /**
     * مشاهده تاریخچه پیامک‌های ارسال‌شده (محدود به مشتریانِ مجاز).
     */
    public function logs(Request $request): JsonResponse
    {
        $this->authorizePermission('sms.logs');

        $user = $this->currentUser();

        $query = SmsLog::with('customer')->latest();

        if ($user && !$user->hasGlobalCustomerAccess()) {
            $query->where(function ($q) use ($user) {
                $q->whereNull('customer_id')
                    ->orWhereIn('customer_id', Customer::query()->visibleTo($user)->select('customers.id'));
            });
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('q')) {
            $term = trim((string) $request->q);
            $op = $this->likeOp();
            $query->where(function ($q) use ($term, $op) {
                $q->where('recipient_mobile', $op, "%{$term}%")
                    ->orWhere('pattern_code', $op, "%{$term}%")
                    ->orWhere('provider_message_id', $op, "%{$term}%")
                    ->orWhereHas('customer', function ($cq) use ($term, $op) {
                        $cq->where('first_name', $op, "%{$term}%")
                            ->orWhere('last_name', $op, "%{$term}%")
                            ->orWhere('company_name', $op, "%{$term}%");
                    });
            });
        }

        $perPage = max(1, min(100, (int) $request->input('per_page', 20)));
        $logs = $query->paginate($perPage)->withQueryString();

        return response()->json($logs);
    }
}
