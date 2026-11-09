<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerHistory;
use App\Models\CustomerPart;
use App\Models\InventoryLog;
use App\Models\Part;
use App\Models\SmsLog;
use Illuminate\Http\JsonResponse;

class DashboardController extends Controller
{
    /**
     * آمار داشبورد — محدود به دامنه دسترسی کاربر جاری (تسک ۱) به‌همراه آمار انبار (تسک ۴).
     */
    public function stats(): JsonResponse
    {
        $user = $this->currentUser();

        $visibleCustomers = Customer::query()->visibleTo($user);

        $totalCustomers = (clone $visibleCustomers)->count();
        $effectiveCustomers = (clone $visibleCustomers)->where('customer_type', 'effective')->count();
        $potentialCustomers = (clone $visibleCustomers)->where('customer_type', 'potential')->count();
        $myCustomers = (clone $visibleCustomers)->where('created_by_user_id', $user?->id)->count();

        $totalParts = Part::count();
        $assignedParts = CustomerPart::query()->visibleTo($user)->count();
        $assignedQuantity = (int) CustomerPart::query()->visibleTo($user)->sum('quantity');

        $totalStock = (int) Part::sum('stock_quantity');
        $lowStockCount = Part::where('min_stock_quantity', '>', 0)
            ->whereColumn('stock_quantity', '<=', 'min_stock_quantity')
            ->count();

        $totalSmsSent = SmsLog::where('status', 'sent')->count();

        $recentActivities = CustomerHistory::query()
            ->with(['customer', 'user'])
            ->whereIn('customer_id', Customer::query()->visibleTo($user)->select('customers.id'))
            ->latest()
            ->take(8)
            ->get();

        $recentSms = SmsLog::with('customer')->latest()->take(6)->get();

        $recentInventory = InventoryLog::query()
            ->with(['part:id,name,code,unit_label', 'user:id,name', 'customer:id,first_name,last_name,company_name'])
            ->latest('logged_at')
            ->latest('id')
            ->take(6)
            ->get();

        return response()->json([
            'stats' => [
                'total_customers' => $totalCustomers,
                'effective_customers' => $effectiveCustomers,
                'potential_customers' => $potentialCustomers,
                'my_customers' => $myCustomers,
                'total_parts' => $totalParts,
                'assigned_parts' => $assignedParts,
                'assigned_quantity' => $assignedQuantity,
                'total_stock' => $totalStock,
                'low_stock_count' => $lowStockCount,
                'total_sms_sent' => $totalSmsSent,
                'has_global_customer_access' => (bool) $user?->hasGlobalCustomerAccess(),
            ],
            'recent_activities' => $recentActivities,
            'recent_sms' => $recentSms,
            'recent_inventory' => $recentInventory,
        ]);
    }
}
