<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\Part;
use App\Models\User;
use App\Services\Customers\CustomerService;
use App\Services\Inventory\InventoryService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Permission;

/**
 * داده نمایشی — فقط برای محیط توسعه/Docker.
 *
 * ⚠️ در بسته cPanel و در ارتقای سامانه هرگز Seeder اجرا نمی‌شود
 *    (مسیر ارتقا فقط `php artisan migrate --force` است).
 */
class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $inventory = app(InventoryService::class);
        $customerService = app(CustomerService::class);

        // ۱) مدیر ارشد سامانه
        $admin = User::firstOrCreate(
            ['email' => 'admin@crm.local'],
            [
                'name' => 'مدیر ارشد سامانه',
                'phone' => '09120000000',
                'password' => Hash::make('Admin@123456'),
                'is_active' => true,
                'user_type' => 'administrator',
                'customers_scope' => 'all',
            ]
        );

        $admin->user_type = 'administrator';
        $admin->customers_scope = 'all';
        $admin->save();
        $admin->syncPermissions(Permission::all());

        // ۲) کارمند فروش نمونه (نقش جدید v2.0.0) — فقط مشتریان خودش را می‌بیند
        $salesperson = $this->makeStaff(
            name: 'مریم فروش',
            email: 'sales@crm.local',
            phone: '09121000001',
            password: 'Sales@123456',
            role: User::ROLE_SALESPERSON,
        );

        // ۳) نصاب نمونه (نقش جدید v2.0.0)
        $installer = $this->makeStaff(
            name: 'علی نصاب',
            email: 'installer@crm.local',
            phone: '09121000002',
            password: 'Install@123456',
            role: User::ROLE_INSTALLER,
        );

        // ۴) کاتالوگ دستگاه‌ها + موجودی اولیه انبار
        $partsData = [
            [
                'name' => 'پمپ پیستونی هیدرولیک فشار قوی',
                'code' => 'PUMP-HYD-500',
                'periodic_service_months' => 6,
                'description' => 'پمپ هیدرولیک دبی متغیر ۵۰۰ بار مناسب خطوط اکستروژن و پرس',
                'stock' => 12,
                'min_stock' => 3,
            ],
            [
                'name' => 'شیر برقی پروپورشنال کنترل جهت و جریان',
                'code' => 'VALVE-PROP-24V',
                'periodic_service_months' => 12,
                'description' => 'شیر هیدرولیکی سرو با فیدبک موقعیت LVDT ولتاژ ۲۴ ولت',
                'stock' => 25,
                'min_stock' => 5,
            ],
            [
                'name' => 'سیلندر هیدرولیک دوطرفه صنعتی سنگین',
                'code' => 'CYL-IND-160',
                'periodic_service_months' => 12,
                'description' => 'سیلندر کورس ۱۰۰۰ میلیمتر با پیستون کروم سخت',
                'stock' => 8,
                'min_stock' => 2,
            ],
            [
                'name' => 'الکتروموتور سه‌فاز صنعتی ۱۵ کیلووات',
                'code' => 'MOT-3PH-15KW',
                'periodic_service_months' => 24,
                'description' => 'الکتروموتور پوسته چدنی کلاس عایقی F با بیرینگ‌های تقویت‌شده',
                'stock' => 4,
                'min_stock' => 2,
            ],
        ];

        $parts = [];
        foreach ($partsData as $item) {
            $stock = (int) ($item['stock'] ?? 0);
            $minStock = (int) ($item['min_stock'] ?? 0);
            unset($item['stock'], $item['min_stock']);

            $part = Part::firstOrCreate(['code' => $item['code']], $item + ['min_stock_quantity' => $minStock]);

            if ((int) $part->stock_quantity === 0 && $stock > 0) {
                $inventory->receive(
                    part: $part,
                    quantity: $stock,
                    userId: $admin->id,
                    notes: 'ثبت موجودی اولیه انبار (داده نمایشی توسعه)',
                );
            }

            $parts[$part->code] = $part->fresh();
        }

        // ۵) مشتریان نمونه
        $c1 = $this->makeCustomer([
            'mobile' => '09121112233',
            'customer_type' => 'potential', // با تخصیص دستگاه به‌صورت خودکار «بالفعل» می‌شود
            'type' => 'company',
            'first_name' => 'سارا',
            'last_name' => 'افشار',
            'company_name' => 'شرکت فولاد فرایند اصفهان',
            'national_code' => '10103456789',
            'phone' => '03133221100',
            'email' => 'info@foulad-process.ir',
            'province' => 'اصفهان',
            'city' => 'اصفهان',
            'address' => 'شهرک صنعتی جی، خیابان چهارم، پلاک ۲۴',
            'notes' => 'دارای ۴ خط تولید فعال - خرید عمده دستگاه‌های صنعتی',
        ], $admin->id);

        $c2 = $this->makeCustomer([
            'mobile' => '09359876543',
            'customer_type' => 'potential',
            'type' => 'company',
            'first_name' => 'کامران',
            'last_name' => 'نادری',
            'company_name' => 'کارگاه قالب‌سازی دقیق نادری',
            'national_code' => '1289988776',
            'phone' => '03134445566',
            'email' => 'naderi.precision@gmail.com',
            'province' => 'اصفهان',
            'city' => 'نجف‌آباد',
            'address' => 'بلوار صنعت، کوی کارآفرینان ۳',
            'notes' => 'مشتری بالقوه در حال مذاکره برای خرید دستگاه پرس هیدرولیک',
        ], $admin->id);

        $c3 = $this->makeCustomer([
            'mobile' => '09191234567',
            'customer_type' => 'potential',
            'type' => 'individual',
            'first_name' => 'حامد',
            'last_name' => 'کریمی',
            'national_code' => '0019876543',
            'phone' => '02188779900',
            'email' => 'hamed.karimi@yahoo.com',
            'province' => 'تهران',
            'city' => 'تهران',
            'address' => 'خیابان جمهوری، پاساژ حافظ',
            'notes' => 'پرسش درباره دوره گارانتی و سرویس دوره‌ای دستگاه‌ها',
        ], $admin->id);

        // مشتری حقوقی بدون نام شخص و بدون شماره همراه (سناریوی تسک ۵)
        $c4 = $this->makeCustomer([
            'mobile' => null,
            'customer_type' => 'potential',
            'type' => 'company',
            'first_name' => null,
            'last_name' => null,
            'company_name' => 'شرکت مهندسی پارس تراش البرز',
            'national_code' => null,
            'phone' => '02633445566',
            'email' => 'info@parstrash.ir',
            'province' => 'البرز',
            'city' => 'کرج',
            'address' => 'شهرک صنعتی سیمین دشت، خیابان دوم',
            'notes' => 'ثبت‌شده توسط کارمند فروش — فقط با نام شرکت و بدون موبایل',
        ], $salesperson->id);

        // ۶) تخصیص دستگاه به مشتری ۱ (تبدیل خودکار بالقوه ← بالفعل + کسر از انبار)
        if ($c1->customerParts()->count() === 0) {
            $customerPart = $customerService->assignPart($c1, $parts['PUMP-HYD-500'], [
                'serial_number' => 'SN2026HYD00189',
                'quantity' => 2,
                'invoice_number' => 'INV-1404-0091',
                'invoice_amount' => 486000000,
                'notes' => 'تحویل حضوری با برگه ضمانت ۶ ماهه',
            ], $admin->id);

            $customerService->recordServiceHistory($customerPart, [
                'service_date' => now()->subDays(10)->toDateString(),
                'service_type' => 'periodic',
                'description' => 'سرویس اولیه، روانکاری سیل‌ها و تعویض اورینگ‌های آب‌بندی',
                'cost' => 1500000,
            ], $installer->id);
        }

        // ۷) تخصیص دستگاه توسط کارمند فروش به مشتری خودش
        if ($c4->customerParts()->count() === 0) {
            $customerService->assignPart($c4, $parts['VALVE-PROP-24V'], [
                'serial_number' => 'SN2026VAL00471',
                'quantity' => 3,
                'invoice_number' => 'INV-1404-0102',
                'invoice_amount' => 214500000,
                'notes' => 'فروش توسط کارمند فروش — نصب توسط تیم نصاب',
            ], $salesperson->id);
        }

        // ۸) دسترسی استثنای نمونه: مدیر، مشتریان «کارمند فروش» را به «نصاب» داده است
        $installer->accessibleStaff()->syncWithoutDetaching([$salesperson->id]);
    }

    /**
     * ساخت کاربر کارمند با نقش و دامنه دسترسی و مجوزهای پیش‌فرض همان نقش.
     */
    private function makeStaff(string $name, string $email, string $phone, string $password, string $role): User
    {
        $user = User::firstOrCreate(
            ['email' => $email],
            [
                'name' => $name,
                'phone' => $phone,
                'password' => Hash::make($password),
                'is_active' => true,
                'user_type' => $role,
                'customers_scope' => config("acl.roles.{$role}.scope", 'own'),
            ]
        );

        $user->user_type = $role;
        $user->customers_scope = config("acl.roles.{$role}.scope", 'own');
        $user->save();

        $preset = config("acl.roles.{$role}.permissions", []);
        $names = $preset === '*' ? Permission::pluck('name')->all() : (array) $preset;
        $existing = Permission::whereIn('name', $names)->pluck('name')->all();
        $user->syncPermissions($existing);

        return $user;
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function makeCustomer(array $attributes, int $ownerId): Customer
    {
        $mobile = $attributes['mobile'] ?? null;
        $match = $mobile
            ? ['mobile' => $mobile]
            : ['company_name' => $attributes['company_name'] ?? null];

        $customer = Customer::firstOrCreate($match, $attributes + ['created_by_user_id' => $ownerId]);

        if (!$customer->created_by_user_id) {
            $customer->created_by_user_id = $ownerId;
            $customer->save();
        }

        return $customer;
    }
}
