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
        $sandbox = $this->sandboxEnabled();

        // فقط حالت سندباکسِ صریح، ارسال را شبیه‌سازی می‌کند. نبودِ اعتبارنامه در
        // محیط واقعی باید خطا بدهد، نه اینکه پیامک «موفق» تلقی شود.
        if ($sandbox) {
            $fakeMessageId = 'SANDBOX-' . rand(10000000, 99999999);
            Log::info('Melipayamak sandbox pattern SMS', [
                'mobile' => $this->maskMobile($mobile),
                'body_id' => $bodyId,
            ]);

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

        if (empty($username) || empty($password)) {
            Log::warning('Melipayamak pattern SMS skipped: credentials are not configured.');

            return [
                'success' => false,
                'message_id' => null,
                'status' => 'اعتبارنامه ملی‌پیامک در تنظیمات سامانه وارد نشده است.',
                'is_sandbox' => false,
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
        $sandbox = $this->sandboxEnabled();

        // متن پیامک شامل کد یکبارمصرف است؛ هرگز نباید در لاگ برنامه یا لاگ پیامک
        // به صورت خام ذخیره شود.
        if ($sandbox) {
            $fakeMessageId = 'SANDBOX-OTP-' . rand(10000000, 99999999);
            $safeText = $this->maskOtp($text);
            Log::info('Melipayamak sandbox normal SMS', [
                'mobile' => $this->maskMobile($mobile),
                'text' => $safeText,
            ]);

            SmsLog::create([
                'recipient_mobile' => $mobile,
                'pattern_code' => 'NORMAL-OTP',
                'tokens' => ['text' => $safeText],
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

        if (empty($username) || empty($password)) {
            Log::warning('Melipayamak normal SMS skipped: credentials are not configured.');

            return [
                'success' => false,
                'message_id' => null,
                'status' => 'اعتبارنامه ملی‌پیامک در تنظیمات سامانه وارد نشده است.',
                'is_sandbox' => false,
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
                'tokens' => ['text' => $this->maskOtp($text)],
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
                'tokens' => ['text' => $this->maskOtp($text)],
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

    /**
     * حالت شبیه‌ساز باید صریحاً روشن شود. مقدار پیش‌فرض «خاموش» است تا در نصب
     * تازه، پیامک واقعی ارسال شود و کد ورود هرگز در پاسخ HTTP افشا نشود.
     */
    private function sandboxEnabled(): bool
    {
        $setting = Setting::get('melipayamak_sandbox');

        if ($setting !== null && $setting !== '') {
            return filter_var($setting, FILTER_VALIDATE_BOOLEAN);
        }

        return filter_var(env('MELIPAYAMAK_SANDBOX', false), FILTER_VALIDATE_BOOLEAN);
    }

    /** پنهان‌سازی کد یکبارمصرف در لاگ‌ها (حداقل چهار رقم متوالی). */
    private function maskOtp(string $text): string
    {
        return (string) preg_replace('/\d{4,}/u', '••••', $text);
    }

    /** پنهان‌سازی بخش میانی شماره همراه در لاگ برنامه. */
    private function maskMobile(string $mobile): string
    {
        if (strlen($mobile) < 8) {
            return '••••';
        }

        return substr($mobile, 0, 4) . '•••' . substr($mobile, -3);
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
