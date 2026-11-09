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
     * Send pattern-based SMS to a customer or direct mobile number.
     */
    public function sendPattern(Request $request): JsonResponse
    {
        $this->authorizePermission('sms.send');

        $validated = $request->validate([
            'mobile' => 'required|string|regex:/^09\d{9}$/',
            'pattern_code' => 'required|string',
            'tokens' => 'required|array',
            'customer_id' => 'nullable|exists:customers,id',
        ]);

        $customer = isset($validated['customer_id'])
            ? Customer::visibleTo($request->user())->findOrFail($validated['customer_id'])
            : null;

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
     * View history of dispatched SMS messages.
     */
    public function logs(Request $request): JsonResponse
    {
        $this->authorizePermission('sms.logs');

        $query = SmsLog::with('customer')->latest();
        $user = $request->user();
        if ($user->hasRestrictedCustomers() && !$user->customer_access_all) {
            $query->whereHas('customer', fn ($customers) => $customers->visibleTo($user));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('q')) {
            $term = trim($request->q);
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

        $perPage = (int) $request->input('per_page', 20);
        $logs = $query->paginate($perPage);

        return response()->json($logs);
    }

    protected function authorizePermission(string $permission): void
    {
        $user = auth()->user();
        if (!$user || !$user->hasPermissionTo($permission)) {
            abort(403, "شما دسترسی لازم ({$permission}) برای این عملیات را ندارید.");
        }
    }
}
