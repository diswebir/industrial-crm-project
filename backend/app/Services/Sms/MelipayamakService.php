<?php

namespace App\Services\Sms;

use App\Models\Customer;
use App\Models\Setting;
use App\Models\SmsLog;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class MelipayamakService
{
    public const BASE_SERVICE_URL = 'https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber';
    public const SEND_SMS_URL = 'https://rest.payamak-panel.com/api/SendSMS/SendSMS';

    /**
     * Send pattern-based SMS via Melipayamak BaseServiceNumber API
     *
     * @param string $mobile Target mobile number (e.g. 09121234567)
     * @param string $bodyId Pattern Code in Melipayamak panel
     * @param array $tokens Array of arguments/tokens for the pattern
     * @param Customer|null $customer Optional Customer model
     * @return array Result array ['success' => bool, 'message_id' => string|null, 'status' => string]
     */
    public function sendPattern(string $mobile, string $bodyId, array $tokens, ?Customer $customer = null): array
    {
        $mobile = $this->normalizeMobile($mobile);

        $username = Setting::get('melipayamak_username') ?: env('MELIPAYAMAK_USERNAME');
        $password = Setting::get('melipayamak_password') ?: env('MELIPAYAMAK_PASSWORD');
        $sandbox = filter_var(Setting::get('melipayamak_sandbox', env('MELIPAYAMAK_SANDBOX', true) ? 'true' : 'false'), FILTER_VALIDATE_BOOLEAN);

        if (!$sandbox && (empty($username) || empty($password))) {
            return ['success' => false, 'message_id' => null, 'status' => 'تنظیمات پیامک کامل نیست.', 'is_sandbox' => false];
        }
        if ($sandbox) {
            $fakeMessageId = 'SANDBOX-' . rand(10000000, 99999999);
            Log::info("Melipayamak Sandbox SMS to {$mobile} with Pattern {$bodyId}:", $tokens);

            SmsLog::create([
                'customer_id' => $customer?->id,
                'recipient_mobile' => $mobile,
                'pattern_code' => $bodyId,
                'tokens' => $tokens,
                'status' => 'sent',
                'provider_message_id' => $fakeMessageId,
                'error_message' => null,
            ]);

            return [
                'success' => true,
                'message_id' => $fakeMessageId,
                'status' => 'پیامک در حالت آزمایشی (سندباکس) ثبت و ارسال فرضی شد',
                'is_sandbox' => true,
            ];
        }

        try {
            // Melipayamak BaseServiceNumber payload
            $response = Http::timeout(10)->post(self::BASE_SERVICE_URL, [
                'userName' => $username,
                'password' => $password,
                'text' => implode(';', array_values($tokens)),
                'to' => $mobile,
                'bodyId' => (int) $bodyId,
            ]);

            $result = $response->json();
            $retStatus = $result['RetStatus'] ?? -1;
            $val = $result['Value'] ?? null;
            $strStatus = $result['StrRetStatus'] ?? 'Unknown';

            $isSuccess = $retStatus == 1 && is_numeric($val) && (int)$val > 0;

            SmsLog::create([
                'customer_id' => $customer?->id,
                'recipient_mobile' => $mobile,
                'pattern_code' => $bodyId,
                'tokens' => $tokens,
                'status' => $isSuccess ? 'sent' : 'failed',
                'provider_message_id' => $isSuccess ? (string)$val : null,
                'error_message' => $isSuccess ? null : ($strStatus . ' (Code: ' . $val . ')'),
            ]);

            return [
                'success' => $isSuccess,
                'message_id' => $isSuccess ? (string)$val : null,
                'status' => $strStatus,
                'is_sandbox' => false,
            ];
        } catch (\Throwable $e) {
            Log::error('Melipayamak dispatch error: ' . $e->getMessage());

            SmsLog::create([
                'customer_id' => $customer?->id,
                'recipient_mobile' => $mobile,
                'pattern_code' => $bodyId,
                'tokens' => $tokens,
                'status' => 'failed',
                'provider_message_id' => null,
                'error_message' => $e->getMessage(),
            ]);

            return [
                'success' => false,
                'message_id' => null,
                'status' => 'خطا در ارتباط با سرور ملی‌پیامک: ' . $e->getMessage(),
                'is_sandbox' => false,
            ];
        }
    }

    /**
     * Send plain text SMS via Melipayamak SendSMS API (ideal for OTP / system notifications)
     */
    public function sendNormalSms(string $mobile, string $text): array
    {
        $mobile = $this->normalizeMobile($mobile);

        $username = Setting::get('melipayamak_username') ?: env('MELIPAYAMAK_USERNAME');
        $password = Setting::get('melipayamak_password') ?: env('MELIPAYAMAK_PASSWORD');
        $fromNumber = Setting::get('melipayamak_from') ?: env('MELIPAYAMAK_FROM', '5000...');
        $sandbox = filter_var(Setting::get('melipayamak_sandbox', env('MELIPAYAMAK_SANDBOX', true) ? 'true' : 'false'), FILTER_VALIDATE_BOOLEAN);

        if (!$sandbox && (empty($username) || empty($password))) {
            return ['success' => false, 'message_id' => null, 'status' => 'تنظیمات پیامک کامل نیست.', 'is_sandbox' => false];
        }
        if ($sandbox) {
            $fakeMessageId = 'SANDBOX-OTP-' . rand(10000000, 99999999);
            Log::info("Melipayamak Sandbox Normal SMS to {$mobile}");

            SmsLog::create([
                'recipient_mobile' => $mobile,
                'pattern_code' => 'NORMAL-OTP',
                'tokens' => ['text' => '[REDACTED]'],
                'status' => 'sent',
                'provider_message_id' => $fakeMessageId,
                'error_message' => null,
            ]);

            return [
                'success' => true,
                'message_id' => $fakeMessageId,
                'status' => 'پیامک در حالت آزمایشی (سندباکس) ثبت و شبیه‌سازی شد',
                'is_sandbox' => true,
            ];
        }

        try {
            $response = Http::timeout(10)->post(self::SEND_SMS_URL, [
                'userName' => $username,
                'password' => $password,
                'to' => $mobile,
                'from' => $fromNumber,
                'text' => $text,
                'isFlash' => false,
            ]);

            $result = $response->json();
            $retStatus = $result['RetStatus'] ?? -1;
            $val = $result['Value'] ?? null;
            $strStatus = $result['StrRetStatus'] ?? 'Unknown';

            $isSuccess = $retStatus == 1 && is_numeric($val) && (int)$val > 0;

            SmsLog::create([
                'recipient_mobile' => $mobile,
                'pattern_code' => 'NORMAL-OTP',
                'tokens' => ['text' => '[REDACTED]'],
                'status' => $isSuccess ? 'sent' : 'failed',
                'provider_message_id' => $isSuccess ? (string)$val : null,
                'error_message' => $isSuccess ? null : ($strStatus . ' (Code: ' . $val . ')'),
            ]);

            return [
                'success' => $isSuccess,
                'message_id' => $isSuccess ? (string)$val : null,
                'status' => $strStatus,
                'is_sandbox' => false,
            ];
        } catch (\Throwable $e) {
            Log::error('Melipayamak normal SMS error: ' . $e->getMessage());

            SmsLog::create([
                'recipient_mobile' => $mobile,
                'pattern_code' => 'NORMAL-OTP',
                'tokens' => ['text' => '[REDACTED]'],
                'status' => 'failed',
                'provider_message_id' => null,
                'error_message' => $e->getMessage(),
            ]);

            return [
                'success' => false,
                'message_id' => null,
                'status' => 'خطا در ارسال پیامک: ' . $e->getMessage(),
                'is_sandbox' => false,
            ];
        }
    }

    private function normalizeMobile(string $mobile): string
    {
        // Convert Persian/Arabic digits to Latin
        $persian = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
        $arabic  = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
        $latin   = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

        $num = str_replace($persian, $latin, $mobile);
        $num = str_replace($arabic, $latin, $num);
        $num = preg_replace('/[^\d]/', '', $num);

        if (str_starts_with($num, '989')) {
            $num = '0' . substr($num, 2);
        }

        return $num;
    }
}
