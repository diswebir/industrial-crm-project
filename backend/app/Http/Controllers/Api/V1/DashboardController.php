<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerHistory;
use App\Models\CustomerPart;
use App\Models\Part;
use App\Models\SmsLog;
use App\Services\Customers\CustomerAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __construct(protected CustomerAccessService $access)
    {
    }

    public function stats(Request $request): JsonResponse
    {
        $user = $request->user();

        // آمار داشبورد هم باید دامنه دسترسی کاربر را رعایت کند (تسک ۱).
        $visibleCustomers = Customer::query()->visibleTo($user);
        $visibleCustomerIds = (clone $visibleCustomers)->pluck('id');
        $hasFullAccess = $this->access->hasFullAccess($user);

        $totalCustomers = (clone $visibleCustomers)->count();
        $effectiveCustomers = (clone $visibleCustomers)->where('customer_type', 'effective')->count();
        $potentialCustomers = (clone $visibleCustomers)->where('customer_type', 'potential')->count();

        $assignedQuery = CustomerPart::query();
        if (! $hasFullAccess) {
            $assignedQuery->whereIn('customer_id', $visibleCustomerIds);
        }

        $totalParts = Part::count();
        $assignedParts = (clone $assignedQuery)->count();
        $assignedDevices = (int) (clone $assignedQuery)->sum('quantity');
        $totalStock = (int) Part::sum('stock_quantity');

        $smsQuery = SmsLog::where('status', 'sent');
        if (! $hasFullAccess) {
            $smsQuery->whereIn('customer_id', $visibleCustomerIds);
        }
        $totalSmsSent = (clone $smsQuery)->count();

        $activityQuery = CustomerHistory::with(['customer:id,first_name,last_name,company_name,type', 'user:id,name']);
        if (! $hasFullAccess) {
            $activityQuery->whereIn('customer_id', $visibleCustomerIds);
        }
        $recentActivities = $activityQuery->latest()->take(8)->get();

        $recentSmsQuery = SmsLog::with('customer:id,first_name,last_name,company_name,type');
        if (! $hasFullAccess) {
            $recentSmsQuery->whereIn('customer_id', $visibleCustomerIds);
        }
        $recentSms = $recentSmsQuery->latest()->take(6)->get();

        return response()->json([
            'stats' => [
                'total_customers' => $totalCustomers,
                'effective_customers' => $effectiveCustomers,
                'potential_customers' => $potentialCustomers,
                'total_parts' => $totalParts,
                'assigned_parts' => $assignedParts,
                'assigned_devices' => $assignedDevices,
                'total_stock' => $totalStock,
                'total_sms_sent' => $totalSmsSent,
            ],
            'recent_activities' => $recentActivities,
            'recent_sms' => $recentSms,
        ]);
    }
}
