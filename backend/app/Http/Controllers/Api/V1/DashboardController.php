<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerHistory;
use App\Models\CustomerPart;
use App\Models\Part;
use App\Models\SmsLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function stats(Request $request): JsonResponse
    {
        $user = $request->user();
        $customers = Customer::visibleTo($user);
        $customerFilter = fn ($query) => $query->visibleTo($user);
        $sms = SmsLog::query();
        if ($user->hasRestrictedCustomers() && !$user->customer_access_all) {
            $sms->whereHas('customer', $customerFilter);
        }
        return response()->json([
            'stats' => [
                'total_customers' => (clone $customers)->count(),
                'effective_customers' => (clone $customers)->where('customer_type', 'effective')->count(),
                'potential_customers' => (clone $customers)->where('customer_type', 'potential')->count(),
                'total_parts' => Part::count(),
                'assigned_parts' => CustomerPart::whereHas('customer', $customerFilter)->count(),
                'total_sms_sent' => (clone $sms)->where('status', 'sent')->count(),
            ],
            'recent_activities' => CustomerHistory::whereHas('customer', $customerFilter)->with(['customer', 'user'])->latest()->take(8)->get(),
            'recent_sms' => (clone $sms)->with('customer')->latest()->take(6)->get(),
        ]);
    }
}
