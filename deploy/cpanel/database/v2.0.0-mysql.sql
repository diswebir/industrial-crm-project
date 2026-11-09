-- ══════════════════════════════════════════════════════════════════════════════════
--  سامانه مدیریت ارتباط با مشتری (CRM صنعتی) — اسکریپت ارتقای پایگاه داده
--  نسخه: v2.0.0
--  پایگاه داده: MySQL 5.7+ / MariaDB 10.2+ (cPanel + phpMyAdmin)
-- ══════════════════════════════════════════════════════════════════════════════════
--
--  ✅ این فایل «فقط افزودنی» است: هیچ جدولی DROP نمی‌شود، هیچ رکوردی DELETE یا
--     TRUNCATE نمی‌شود و هیچ داده‌ای بازنویسی نمی‌گردد. تنها تبدیل NOT NULL به NULL
--     انجام می‌شود که همیشه امن است.
--
--  ✅ کاملاً Idempotent است: اجرای دوباره (یا چندباره) هیچ خطایی ایجاد نمی‌کند،
--     زیرا پیش از هر تغییر، وجود ستون/ایندکس/جدول از information_schema بررسی می‌شود.
--
--  ✅ هم‌ارز با مایگریشن‌های لاراول است:
--       2024_01_01_000014 … 000019
--     اگر بعداً «php artisan migrate --force» (از طریق deploy/cpanel/update.php)
--     اجرا شود، این مایگریشن‌ها به‌عنوان اجراشده ثبت شده‌اند و دوباره اجرا نمی‌شوند.
--
--  ── روش اجرا در phpMyAdmin ───────────────────────────────────────────────────────
--    1) در cPanel یک پشتیبان کامل (Backup) از پایگاه داده بگیرید.
--    2) phpMyAdmin → پایگاه داده سامانه → تب Import → انتخاب این فایل → Go.
--       (یا تب SQL و چسباندن کامل متن فایل → Go)
--    3) در پایان، خروجی بخش «گزارش پایانی» را بررسی کنید؛ باید همه ردیف‌ها OK باشند.
--
--  ── روش اجرا با خط فرمان (در صورت دسترسی SSH) ────────────────────────────────────
--    mysql -u DB_USER -p DB_NAME < v2.0.0-mysql.sql
-- ══════════════════════════════════════════════════════════════════════════════════

SET NAMES utf8mb4;
SET @OLD_SQL_MODE = @@SQL_MODE;
SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION';

-- ══════════════════════════════════════════════════════════════════════════════════
--  بخش ۱ — جدول customers: مالکیت مشتری + اختیاری شدن نام/موبایل (تسک ۱ و ۵)
-- ══════════════════════════════════════════════════════════════════════════════════

-- ۱٫۱) ستون created_by_user_id (کارمندی که مشتری را ثبت کرده است)
SET @stmt = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'created_by_user_id') = 0,
  'ALTER TABLE `customers` ADD COLUMN `created_by_user_id` BIGINT UNSIGNED NULL DEFAULT NULL AFTER `notes`',
  'SELECT ''customers.created_by_user_id already exists'' AS info');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ۱٫۲) ایندکس ستون مالکیت
SET @stmt = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND INDEX_NAME = 'customers_created_by_user_id_index') = 0
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'created_by_user_id') = 1,
  'ALTER TABLE `customers` ADD INDEX `customers_created_by_user_id_index` (`created_by_user_id`)',
  'SELECT ''index customers_created_by_user_id_index skipped'' AS info');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ۱٫۳) کلید خارجی created_by_user_id → users.id (حذف کاربر ⇒ NULL شدن ستون)
SET @stmt = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers'
      AND CONSTRAINT_NAME = 'customers_created_by_user_id_foreign' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'created_by_user_id') = 1,
  'ALTER TABLE `customers` ADD CONSTRAINT `customers_created_by_user_id_foreign`
     FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL',
  'SELECT ''FK customers_created_by_user_id_foreign skipped'' AS info');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ۱٫۴) اختیاری (NULL) کردن first_name / last_name / mobile
--      طول و مجموعه‌کاراکتر فعلی هر ستون از information_schema خوانده می‌شود تا
--      ساختار موجود دقیقاً حفظ شود (فقط NOT NULL برداشته می‌شود).
SET @type_first_name = (SELECT CONCAT(
      'VARCHAR(', COALESCE(`CHARACTER_MAXIMUM_LENGTH`, 255), ')',
      IF(`CHARACTER_SET_NAME` IS NULL, '', CONCAT(' CHARACTER SET ', `CHARACTER_SET_NAME`)),
      IF(`COLLATION_NAME`   IS NULL, '', CONCAT(' COLLATE ', `COLLATION_NAME`)))
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'first_name');

SET @stmt = IF(@type_first_name IS NOT NULL AND
  (SELECT IS_NULLABLE FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'first_name') = 'NO',
  CONCAT('ALTER TABLE `customers` MODIFY COLUMN `first_name` ', @type_first_name, ' NULL DEFAULT NULL'),
  'SELECT ''customers.first_name already nullable'' AS info');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @type_last_name = (SELECT CONCAT(
      'VARCHAR(', COALESCE(`CHARACTER_MAXIMUM_LENGTH`, 255), ')',
      IF(`CHARACTER_SET_NAME` IS NULL, '', CONCAT(' CHARACTER SET ', `CHARACTER_SET_NAME`)),
      IF(`COLLATION_NAME`   IS NULL, '', CONCAT(' COLLATE ', `COLLATION_NAME`)))
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'last_name');

SET @stmt = IF(@type_last_name IS NOT NULL AND
  (SELECT IS_NULLABLE FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'last_name') = 'NO',
  CONCAT('ALTER TABLE `customers` MODIFY COLUMN `last_name` ', @type_last_name, ' NULL DEFAULT NULL'),
  'SELECT ''customers.last_name already nullable'' AS info');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @type_mobile = (SELECT CONCAT(
      'VARCHAR(', COALESCE(`CHARACTER_MAXIMUM_LENGTH`, 255), ')',
      IF(`CHARACTER_SET_NAME` IS NULL, '', CONCAT(' CHARACTER SET ', `CHARACTER_SET_NAME`)),
      IF(`COLLATION_NAME`   IS NULL, '', CONCAT(' COLLATE ', `COLLATION_NAME`)))
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'mobile');

SET @stmt = IF(@type_mobile IS NOT NULL AND
  (SELECT IS_NULLABLE FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'mobile') = 'NO',
  CONCAT('ALTER TABLE `customers` MODIFY COLUMN `mobile` ', @type_mobile, ' NULL DEFAULT NULL'),
  'SELECT ''customers.mobile already nullable'' AS info');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ۱٫۵) اطمینان از وجود ستون company_name (برای نصب‌های بسیار قدیمی)
SET @stmt = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'company_name') = 0,
  'ALTER TABLE `customers` ADD COLUMN `company_name` VARCHAR(255) NULL DEFAULT NULL AFTER `last_name`',
  'SELECT ''customers.company_name already exists'' AS info');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ══════════════════════════════════════════════════════════════════════════════════
--  بخش ۲ — جدول users: دامنه دسترسی به مشتریان (تسک ۱)
--  مقدار پیش‌فرض عمداً 'all' است تا کاربران فعلی بعد از ارتقا قفل نشوند.
-- ══════════════════════════════════════════════════════════════════════════════════

SET @stmt = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'user_type') = 0,
  'ALTER TABLE `users` ADD COLUMN `user_type` VARCHAR(255) NOT NULL DEFAULT ''manager'' AFTER `is_active`',
  'SELECT ''users.user_type already exists'' AS info');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'customers_scope') = 0,
  'ALTER TABLE `users` ADD COLUMN `customers_scope` VARCHAR(20) NOT NULL DEFAULT ''all'' AFTER `user_type`',
  'SELECT ''users.customers_scope already exists'' AS info');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'users_customers_scope_index') = 0
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'customers_scope') = 1,
  'ALTER TABLE `users` ADD INDEX `users_customers_scope_index` (`customers_scope`)',
  'SELECT ''index users_customers_scope_index skipped'' AS info');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ══════════════════════════════════════════════════════════════════════════════════
--  بخش ۳ — جدول parts: موجودی انبار و حد هشدار (تسک ۴)
--  ⚠️ موجودی دستگاه‌های قبلی «صفر» ثبت می‌شود چون سامانه پیش از این نسخه اطلاعاتی
--     از انبار واقعی نداشته است. بعد از ارتقا باید «ورود کالا» ثبت شود.
-- ══════════════════════════════════════════════════════════════════════════════════

SET @stmt = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parts' AND COLUMN_NAME = 'stock_quantity') = 0,
  'ALTER TABLE `parts` ADD COLUMN `stock_quantity` INT NOT NULL DEFAULT 0 AFTER `periodic_service_months`',
  'SELECT ''parts.stock_quantity already exists'' AS info');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parts' AND COLUMN_NAME = 'min_stock_quantity') = 0,
  'ALTER TABLE `parts` ADD COLUMN `min_stock_quantity` INT NOT NULL DEFAULT 0 AFTER `stock_quantity`',
  'SELECT ''parts.min_stock_quantity already exists'' AS info');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parts' AND COLUMN_NAME = 'unit_label') = 0,
  'ALTER TABLE `parts` ADD COLUMN `unit_label` VARCHAR(30) NOT NULL DEFAULT ''عدد'' AFTER `min_stock_quantity`',
  'SELECT ''parts.unit_label already exists'' AS info');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ══════════════════════════════════════════════════════════════════════════════════
--  بخش ۴ — جدول customer_parts: تعداد، فاکتور و تخصیص‌دهنده (تسک ۳ و ۴)
--  رکوردهای موجود دست‌نخورده می‌مانند؛ فقط quantity = 1 می‌گیرند
--  (چون پیش از این نسخه هر ردیف دقیقاً یک دستگاه فیزیکی بود).
-- ══════════════════════════════════════════════════════════════════════════════════

SET @stmt = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_parts' AND COLUMN_NAME = 'quantity') = 0,
  'ALTER TABLE `customer_parts` ADD COLUMN `quantity` INT UNSIGNED NOT NULL DEFAULT 1 AFTER `serial_number`',
  'SELECT ''customer_parts.quantity already exists'' AS info');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_parts' AND COLUMN_NAME = 'invoice_number') = 0,
  'ALTER TABLE `customer_parts` ADD COLUMN `invoice_number` VARCHAR(50) NULL DEFAULT NULL AFTER `quantity`',
  'SELECT ''customer_parts.invoice_number already exists'' AS info');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_parts' AND INDEX_NAME = 'customer_parts_invoice_number_index') = 0
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_parts' AND COLUMN_NAME = 'invoice_number') = 1,
  'ALTER TABLE `customer_parts` ADD INDEX `customer_parts_invoice_number_index` (`invoice_number`)',
  'SELECT ''index customer_parts_invoice_number_index skipped'' AS info');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_parts' AND COLUMN_NAME = 'invoice_amount') = 0,
  'ALTER TABLE `customer_parts` ADD COLUMN `invoice_amount` DECIMAL(14,2) NULL DEFAULT NULL AFTER `invoice_number`',
  'SELECT ''customer_parts.invoice_amount already exists'' AS info');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_parts' AND COLUMN_NAME = 'assigned_by_user_id') = 0,
  'ALTER TABLE `customer_parts` ADD COLUMN `assigned_by_user_id` BIGINT UNSIGNED NULL DEFAULT NULL AFTER `notes`',
  'SELECT ''customer_parts.assigned_by_user_id already exists'' AS info');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_parts' AND INDEX_NAME = 'customer_parts_assigned_by_user_id_index') = 0
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_parts' AND COLUMN_NAME = 'assigned_by_user_id') = 1,
  'ALTER TABLE `customer_parts` ADD INDEX `customer_parts_assigned_by_user_id_index` (`assigned_by_user_id`)',
  'SELECT ''index customer_parts_assigned_by_user_id_index skipped'' AS info');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_parts'
      AND CONSTRAINT_NAME = 'customer_parts_assigned_by_user_id_foreign' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_parts' AND COLUMN_NAME = 'assigned_by_user_id') = 1,
  'ALTER TABLE `customer_parts` ADD CONSTRAINT `customer_parts_assigned_by_user_id_foreign`
     FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL',
  'SELECT ''FK customer_parts_assigned_by_user_id_foreign skipped'' AS info');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- اطمینان از اینکه هیچ ردیف قدیمی با quantity نامعتبر باقی نمانده باشد
UPDATE `customer_parts` SET `quantity` = 1 WHERE `quantity` IS NULL OR `quantity` < 1;

-- ══════════════════════════════════════════════════════════════════════════════════
--  بخش ۵ — جدول جدید inventory_logs: تاریخچه کامل ورود/خروج انبار (تسک ۴)
--  type: in (ورود به انبار) | out (خروج جهت تخصیص) | return (برگشت به انبار)
--        | adjustment (اصلاح دستی موجودی)
-- ══════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `inventory_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `part_id` BIGINT UNSIGNED NOT NULL,
  `customer_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `customer_part_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `user_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `type` VARCHAR(20) NOT NULL,
  `quantity` INT UNSIGNED NOT NULL DEFAULT 1,
  `stock_before` INT NOT NULL DEFAULT 0,
  `stock_after` INT NOT NULL DEFAULT 0,
  `reference` VARCHAR(100) NULL DEFAULT NULL,
  `notes` TEXT NULL DEFAULT NULL,
  `logged_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `inventory_logs_customer_id_index` (`customer_id`),
  KEY `inventory_logs_customer_part_id_index` (`customer_part_id`),
  KEY `inventory_logs_user_id_index` (`user_id`),
  KEY `inventory_logs_type_index` (`type`),
  KEY `inventory_logs_logged_at_index` (`logged_at`),
  CONSTRAINT `inventory_logs_part_id_foreign`
    FOREIGN KEY (`part_id`) REFERENCES `parts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `inventory_logs_customer_id_foreign`
    FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `inventory_logs_customer_part_id_foreign`
    FOREIGN KEY (`customer_part_id`) REFERENCES `customer_parts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `inventory_logs_user_id_foreign`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ══════════════════════════════════════════════════════════════════════════════════
--  بخش ۶ — جدول‌های استثنای دسترسی کاربران (تسک ۱)
--  user_staff_access    : دسترسی به مشتریانِ یک یا چند کارمند مشخص
--  user_customer_access : دسترسی به یک یا چند مشتری تکی
-- ══════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `user_staff_access` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `staff_id` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_staff_access_unique` (`user_id`, `staff_id`),
  KEY `user_staff_access_staff_id_index` (`staff_id`),
  CONSTRAINT `user_staff_access_user_id_foreign`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_staff_access_staff_id_foreign`
    FOREIGN KEY (`staff_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_customer_access` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `customer_id` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_customer_access_unique` (`user_id`, `customer_id`),
  KEY `user_customer_access_customer_id_index` (`customer_id`),
  CONSTRAINT `user_customer_access_user_id_foreign`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_customer_access_customer_id_foreign`
    FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ══════════════════════════════════════════════════════════════════════════════════
--  بخش ۷ — مجوزهای جدید ACL و اعطای خودکار آن‌ها (تسک ۱ و ۴)
--  ⚠️ نام مجوزهای قبلی (parts.*) عمداً تغییر نمی‌کند تا رکوردهای موجود در
--     model_has_permissions بی‌اثر نشوند؛ فقط برچسب نمایشی آن‌ها «دستگاه» شده است.
-- ══════════════════════════════════════════════════════════════════════════════════

INSERT INTO `permissions` (`name`, `guard_name`, `created_at`, `updated_at`)
SELECT 'inventory.manage', 'web', NOW(), NOW() FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `permissions` WHERE `name` = 'inventory.manage' AND `guard_name` = 'web'
);

INSERT INTO `permissions` (`name`, `guard_name`, `created_at`, `updated_at`)
SELECT 'inventory.logs', 'web', NOW(), NOW() FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `permissions` WHERE `name` = 'inventory.logs' AND `guard_name` = 'web'
);

-- ۷٫۱) هر کاربری که parts.manage دارد ⇒ inventory.manage هم می‌گیرد
INSERT INTO `model_has_permissions` (`permission_id`, `model_type`, `model_id`)
SELECT np.`id`, mhp.`model_type`, mhp.`model_id`
FROM `permissions` np
JOIN `permissions` sp ON sp.`name` = 'parts.manage' AND sp.`guard_name` = 'web'
JOIN `model_has_permissions` mhp ON mhp.`permission_id` = sp.`id`
WHERE np.`name` = 'inventory.manage' AND np.`guard_name` = 'web'
  AND NOT EXISTS (
    SELECT 1 FROM `model_has_permissions` x
    WHERE x.`permission_id` = np.`id` AND x.`model_type` = mhp.`model_type` AND x.`model_id` = mhp.`model_id`
  );

-- ۷٫۲) هر کاربری که parts.view دارد ⇒ inventory.logs هم می‌گیرد
INSERT INTO `model_has_permissions` (`permission_id`, `model_type`, `model_id`)
SELECT np.`id`, mhp.`model_type`, mhp.`model_id`
FROM `permissions` np
JOIN `permissions` sp ON sp.`name` = 'parts.view' AND sp.`guard_name` = 'web'
JOIN `model_has_permissions` mhp ON mhp.`permission_id` = sp.`id`
WHERE np.`name` = 'inventory.logs' AND np.`guard_name` = 'web'
  AND NOT EXISTS (
    SELECT 1 FROM `model_has_permissions` x
    WHERE x.`permission_id` = np.`id` AND x.`model_type` = mhp.`model_type` AND x.`model_id` = mhp.`model_id`
  );

-- ۷٫۳) همه کاربران «مدیر ارشد» ⇒ هر دو مجوز انبار
INSERT INTO `model_has_permissions` (`permission_id`, `model_type`, `model_id`)
SELECT p.`id`, 'App\\Models\\User', u.`id`
FROM `permissions` p
CROSS JOIN `users` u
WHERE p.`name` IN ('inventory.manage', 'inventory.logs') AND p.`guard_name` = 'web'
  AND u.`user_type` = 'administrator'
  AND NOT EXISTS (
    SELECT 1 FROM `model_has_permissions` x
    WHERE x.`permission_id` = p.`id` AND x.`model_type` = 'App\\Models\\User' AND x.`model_id` = u.`id`
  );

-- ══════════════════════════════════════════════════════════════════════════════════
--  بخش ۸ — ثبت مایگریشن‌ها در جدول migrations
--  تا اجرای بعدی «php artisan migrate --force» (deploy/cpanel/update.php)
--  این تغییرات را دوباره اعمال نکند و وضعیت مایگریشن‌ها پاک بماند.
-- ══════════════════════════════════════════════════════════════════════════════════

SET @batch = (SELECT COALESCE(MAX(`batch`), 0) + 1 FROM `migrations`);

INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2024_01_01_000014_add_ownership_and_nullable_fields_to_customers_table', @batch FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM (SELECT `migration` FROM `migrations`) m
  WHERE m.`migration` = '2024_01_01_000014_add_ownership_and_nullable_fields_to_customers_table');

INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2024_01_01_000015_add_customers_scope_and_access_tables_to_users', @batch FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM (SELECT `migration` FROM `migrations`) m
  WHERE m.`migration` = '2024_01_01_000015_add_customers_scope_and_access_tables_to_users');

INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2024_01_01_000016_add_inventory_fields_to_parts_table', @batch FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM (SELECT `migration` FROM `migrations`) m
  WHERE m.`migration` = '2024_01_01_000016_add_inventory_fields_to_parts_table');

INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2024_01_01_000017_add_device_fields_to_customer_parts_table', @batch FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM (SELECT `migration` FROM `migrations`) m
  WHERE m.`migration` = '2024_01_01_000017_add_device_fields_to_customer_parts_table');

INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2024_01_01_000018_create_inventory_logs_table', @batch FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM (SELECT `migration` FROM `migrations`) m
  WHERE m.`migration` = '2024_01_01_000018_create_inventory_logs_table');

INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2024_01_01_000019_add_inventory_permissions', @batch FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM (SELECT `migration` FROM `migrations`) m
  WHERE m.`migration` = '2024_01_01_000019_add_inventory_permissions');

-- ══════════════════════════════════════════════════════════════════════════════════
--  بخش ۹ — گزارش پایانی (صحت ارتقا را بررسی کنید؛ همه ردیف‌ها باید OK باشند)
-- ══════════════════════════════════════════════════════════════════════════════════

SELECT 'customers.created_by_user_id' AS item,
       IF((SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'created_by_user_id') = 1,
          'OK', 'MISSING') AS status
UNION ALL SELECT 'customers.first_name nullable',
       IF((SELECT IS_NULLABLE FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'first_name') = 'YES', 'OK', 'NOT NULLABLE')
UNION ALL SELECT 'customers.last_name nullable',
       IF((SELECT IS_NULLABLE FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'last_name') = 'YES', 'OK', 'NOT NULLABLE')
UNION ALL SELECT 'customers.mobile nullable',
       IF((SELECT IS_NULLABLE FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'mobile') = 'YES', 'OK', 'NOT NULLABLE')
UNION ALL SELECT 'users.customers_scope',
       IF((SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'customers_scope') = 1, 'OK', 'MISSING')
UNION ALL SELECT 'table user_staff_access',
       IF((SELECT COUNT(*) FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_staff_access') = 1, 'OK', 'MISSING')
UNION ALL SELECT 'table user_customer_access',
       IF((SELECT COUNT(*) FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_customer_access') = 1, 'OK', 'MISSING')
UNION ALL SELECT 'parts.stock_quantity',
       IF((SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parts' AND COLUMN_NAME = 'stock_quantity') = 1, 'OK', 'MISSING')
UNION ALL SELECT 'parts.min_stock_quantity',
       IF((SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parts' AND COLUMN_NAME = 'min_stock_quantity') = 1, 'OK', 'MISSING')
UNION ALL SELECT 'parts.unit_label',
       IF((SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parts' AND COLUMN_NAME = 'unit_label') = 1, 'OK', 'MISSING')
UNION ALL SELECT 'customer_parts.quantity',
       IF((SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_parts' AND COLUMN_NAME = 'quantity') = 1, 'OK', 'MISSING')
UNION ALL SELECT 'customer_parts.invoice_number',
       IF((SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_parts' AND COLUMN_NAME = 'invoice_number') = 1, 'OK', 'MISSING')
UNION ALL SELECT 'customer_parts.invoice_amount',
       IF((SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_parts' AND COLUMN_NAME = 'invoice_amount') = 1, 'OK', 'MISSING')
UNION ALL SELECT 'customer_parts.assigned_by_user_id',
       IF((SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_parts' AND COLUMN_NAME = 'assigned_by_user_id') = 1, 'OK', 'MISSING')
UNION ALL SELECT 'table inventory_logs',
       IF((SELECT COUNT(*) FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_logs') = 1, 'OK', 'MISSING')
UNION ALL SELECT 'permission inventory.manage',
       IF((SELECT COUNT(*) FROM `permissions` WHERE `name` = 'inventory.manage' AND `guard_name` = 'web') = 1, 'OK', 'MISSING')
UNION ALL SELECT 'permission inventory.logs',
       IF((SELECT COUNT(*) FROM `permissions` WHERE `name` = 'inventory.logs' AND `guard_name` = 'web') = 1, 'OK', 'MISSING');

-- شمارش داده‌های موجود (برای اطمینان از اینکه هیچ رکوردی از بین نرفته است)
SELECT
  (SELECT COUNT(*) FROM `customers`)      AS customers_rows,
  (SELECT COUNT(*) FROM `parts`)          AS devices_rows,
  (SELECT COUNT(*) FROM `customer_parts`) AS assignments_rows,
  (SELECT COUNT(*) FROM `part_service_histories`) AS service_histories_rows,
  (SELECT COUNT(*) FROM `users`)          AS users_rows,
  (SELECT COUNT(*) FROM `inventory_logs`) AS inventory_logs_rows;

SET SESSION sql_mode = @OLD_SQL_MODE;

-- ══════════════════════════════════════════════════════════════════════════════════
--  پایان اسکریپت ارتقای v2.0.0
--  گام‌های بعدی:
--   1) در پنل مدیریت، برای هر دستگاه «ورود کالا» ثبت کنید تا موجودی واقعی انبار
--      مقداردهی شود (موجودی اولیه همه دستگاه‌ها صفر است).
--   2) نقش کاربران را در «تنظیمات ← کاربران، نقش‌ها و دسترسی‌ها» بررسی کنید؛
--      دامنه دسترسی همه کاربران فعلی روی «همه مشتریان» باقی مانده است.
--   3) کش سامانه را پاک کنید: فایل‌های bootstrap/cache/*.php را حذف کنید یا از
--      طریق deploy/cpanel/update.php اقدام نمایید.
-- ══════════════════════════════════════════════════════════════════════════════════
