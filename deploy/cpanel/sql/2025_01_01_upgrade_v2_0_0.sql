-- ═══════════════════════════════════════════════════════════════════════════
--  Industrial CRM — ارتقای دیتابیس از v1.x به v2.0.0
--  اجرای دستی در phpMyAdmin (وقتی به update.php دسترسی ندارید)
--
--  ⚠️  قبل از اجرا از دیتابیس Export کامل بگیرید (phpMyAdmin → Export).
--  ⚠️  این فایل idempotent است؛ اجرای دوباره آن خطا نمی‌دهد و داده را عوض نمی‌کند.
--  ⚠️  فقط برای MySQL 5.7+/8 و MariaDB 10.3+ — دیتابیس را خالی نکنید.
--
--  ترتیب کار:
--    1) فایل‌های نسخه ۲ را روی هاست جایگزین کنید.
--    2) این فایل را در phpMyAdmin دیتابیس همان سایت اجرا کنید.
--    3) وارد سامانه شوید و بخش «انبار» و «کاربران» را بررسی کنید.
--
--  نکته: برای اجرا نیازی به مجوز CREATE PROCEDURE نیست؛ همه تغییرات با
--  کوئری‌های آماده (PREPARE) و بررسی information_schema انجام می‌شوند تا روی
--  هاست‌های اشتراکی محدود هم اجرا شوند.
-- ═══════════════════════════════════════════════════════════════════════════

SET NAMES utf8mb4;
SET @OLD_SQL_MODE = @@SQL_MODE;
SET @OLD_FOREIGN_KEY_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. users.data_scope — دامنه دسترسی مشتریان (all | own | custom)
-- ─────────────────────────────────────────────────────────────────────────────

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'data_scope'
);
SET @ddl := IF(
    @col_exists = 0,
    'ALTER TABLE `users` ADD COLUMN `data_scope` VARCHAR(20) NOT NULL DEFAULT ''all'' AFTER `user_type`',
    'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'users_data_scope_index'
);
SET @ddl := IF(
    @idx_exists = 0,
    'ALTER TABLE `users` ADD INDEX `users_data_scope_index` (`data_scope`)',
    'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- همه کاربران فعلی «همه مشتریان» را می‌بینند تا بعد از آپدیت دسترسی‌شان تغییر نکند.
UPDATE `users` SET `data_scope` = 'all' WHERE `data_scope` IS NULL OR `data_scope` = '';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. customers.created_by — مالکیت پرونده مشتری
-- ─────────────────────────────────────────────────────────────────────────────

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'created_by'
);
SET @ddl := IF(
    @col_exists = 0,
    'ALTER TABLE `customers` ADD COLUMN `created_by` BIGINT UNSIGNED NULL',
    'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND INDEX_NAME = 'customers_created_by_index'
);
SET @ddl := IF(
    @idx_exists = 0,
    'ALTER TABLE `customers` ADD INDEX `customers_created_by_index` (`created_by`)',
    'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. customer_access_grants — دسترسی استثنای کارمندان به مشتریان دیگران
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `customer_access_grants` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `scope_type` VARCHAR(20) NOT NULL DEFAULT 'customer',
    `target_user_id` BIGINT UNSIGNED NULL,
    `customer_id` BIGINT UNSIGNED NULL,
    `created_by` BIGINT UNSIGNED NULL,
    `created_at` TIMESTAMP NULL DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `cag_user_scope_index` (`user_id`, `scope_type`),
    KEY `cag_target_user_index` (`target_user_id`),
    KEY `cag_customer_index` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. parts — موجودی انبار و حد هشدار
-- ─────────────────────────────────────────────────────────────────────────────

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parts' AND COLUMN_NAME = 'stock_quantity'
);
SET @ddl := IF(
    @col_exists = 0,
    'ALTER TABLE `parts` ADD COLUMN `stock_quantity` INT NOT NULL DEFAULT 0',
    'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parts' AND COLUMN_NAME = 'min_stock_quantity'
);
SET @ddl := IF(
    @col_exists = 0,
    'ALTER TABLE `parts` ADD COLUMN `min_stock_quantity` INT NOT NULL DEFAULT 0',
    'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. customer_parts — تعداد، شماره فاکتور، مبلغ فاکتور، ثبت‌کننده
-- ─────────────────────────────────────────────────────────────────────────────

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_parts' AND COLUMN_NAME = 'quantity'
);
SET @ddl := IF(
    @col_exists = 0,
    'ALTER TABLE `customer_parts` ADD COLUMN `quantity` INT NOT NULL DEFAULT 1',
    'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_parts' AND COLUMN_NAME = 'invoice_number'
);
SET @ddl := IF(
    @col_exists = 0,
    'ALTER TABLE `customer_parts` ADD COLUMN `invoice_number` VARCHAR(100) NULL',
    'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_parts' AND COLUMN_NAME = 'invoice_amount'
);
SET @ddl := IF(
    @col_exists = 0,
    'ALTER TABLE `customer_parts` ADD COLUMN `invoice_amount` DECIMAL(15,2) NULL',
    'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_parts' AND COLUMN_NAME = 'assigned_by_user_id'
);
SET @ddl := IF(
    @col_exists = 0,
    'ALTER TABLE `customer_parts` ADD COLUMN `assigned_by_user_id` BIGINT UNSIGNED NULL',
    'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_parts' AND INDEX_NAME = 'cp_assigned_by_index'
);
SET @ddl := IF(
    @idx_exists = 0,
    'ALTER TABLE `customer_parts` ADD INDEX `cp_assigned_by_index` (`assigned_by_user_id`)',
    'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- شماره سریال اختیاری می‌شود (تخصیص چندعددی شماره سریال تکی ندارد).
-- یکتایی سریال حفظ می‌شود؛ در MySQL چند مقدار NULL در یک UNIQUE مجاز است.
ALTER TABLE `customer_parts` MODIFY `serial_number` VARCHAR(255) NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. customers — اختیاری شدن نام/نام‌خانوادگی و شماره همراه (تسک ۵)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE `customers` MODIFY `first_name` VARCHAR(255) NULL;
ALTER TABLE `customers` MODIFY `last_name` VARCHAR(255) NULL;
ALTER TABLE `customers` MODIFY `mobile` VARCHAR(255) NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. inventory_logs — تاریخچه کامل ورود/خروج انبار
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `inventory_logs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `part_id` BIGINT UNSIGNED NOT NULL,
    `user_id` BIGINT UNSIGNED NULL,
    `customer_id` BIGINT UNSIGNED NULL,
    `customer_part_id` BIGINT UNSIGNED NULL,
    `type` VARCHAR(20) NOT NULL DEFAULT 'in',
    `quantity` INT NOT NULL DEFAULT 0,
    `stock_after` INT NOT NULL DEFAULT 0,
    `note` TEXT NULL,
    `created_at` TIMESTAMP NULL DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `inv_log_part_index` (`part_id`),
    KEY `inv_log_user_index` (`user_id`),
    KEY `inv_log_customer_index` (`customer_id`),
    KEY `inv_log_customer_part_index` (`customer_part_id`),
    KEY `inv_log_type_date_index` (`type`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. مجوزهای جدید (Pure ACL) و اعطای آن‌ها به مدیران ارشد
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO `permissions` (`name`, `guard_name`, `created_at`, `updated_at`)
SELECT p.name, 'web', NOW(), NOW()
FROM (
    SELECT 'parts.assign.edit' AS name
    UNION ALL SELECT 'parts.assign.delete'
    UNION ALL SELECT 'inventory.view'
    UNION ALL SELECT 'inventory.manage'
) AS p
WHERE NOT EXISTS (
    SELECT 1 FROM `permissions` x WHERE x.name = p.name AND x.guard_name = 'web'
);

INSERT INTO `model_has_permissions` (`permission_id`, `model_type`, `model_id`)
SELECT perm.id, 'App\\Models\\User', u.id
FROM `permissions` perm
JOIN `users` u ON u.user_type = 'administrator'
WHERE perm.name IN ('parts.assign.edit', 'parts.assign.delete', 'inventory.view', 'inventory.manage')
  AND perm.guard_name = 'web'
  AND NOT EXISTS (
      SELECT 1 FROM `model_has_permissions` mhp
      WHERE mhp.permission_id = perm.id
        AND mhp.model_id = u.id
        AND mhp.model_type = 'App\\Models\\User'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. موجودی اولیه انبار = مجموع تعدادهای تخصیص‌یافته فعلی (بدون موجودی منفی کاذب)
-- ─────────────────────────────────────────────────────────────────────────────

-- فقط دستگاه‌هایی که هنوز هیچ تراکنش انباری ندارند مقدار اولیه می‌گیرند؛
-- بنابراین اجرای دوباره این فایل، موجودی واقعیِ استفاده‌شده را بازنویسی نمی‌کند.
UPDATE `parts` p
SET p.stock_quantity = COALESCE(
    (SELECT SUM(cp.quantity) FROM `customer_parts` cp WHERE cp.part_id = p.id),
    0
)
WHERE p.stock_quantity = 0
  AND NOT EXISTS (SELECT 1 FROM `inventory_logs` l WHERE l.part_id = p.id);

INSERT INTO `inventory_logs`
    (`part_id`, `user_id`, `customer_id`, `customer_part_id`, `type`, `quantity`, `stock_after`, `note`, `created_at`, `updated_at`)
SELECT p.id, NULL, NULL, NULL, 'in', p.stock_quantity, p.stock_quantity,
       'موجودی اولیه در زمان ارتقا به نسخه ۲', NOW(), NOW()
FROM `parts` p
WHERE p.stock_quantity > 0
  AND NOT EXISTS (
      SELECT 1 FROM `inventory_logs` l
      WHERE l.part_id = p.id AND l.note = 'موجودی اولیه در زمان ارتقا به نسخه ۲'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. ثبت مایگریشن‌ها در جدول migrations تا update.php مجدداً اجرا نکند
-- ─────────────────────────────────────────────────────────────────────────────

SET @crm_batch = (SELECT COALESCE(MAX(`batch`), 0) + 1 FROM `migrations`);

INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2025_01_01_000001_add_customer_ownership_and_access_grants', @crm_batch
WHERE NOT EXISTS (SELECT 1 FROM `migrations` WHERE `migration` = '2025_01_01_000001_add_customer_ownership_and_access_grants');

INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2025_01_01_000002_add_device_quantity_invoice_and_inventory', @crm_batch
WHERE NOT EXISTS (SELECT 1 FROM `migrations` WHERE `migration` = '2025_01_01_000002_add_device_quantity_invoice_and_inventory');

INSERT INTO `migrations` (`migration`, `batch`)
SELECT '2025_01_01_000003_seed_inventory_permissions_and_backfill', @crm_batch
WHERE NOT EXISTS (SELECT 1 FROM `migrations` WHERE `migration` = '2025_01_01_000003_seed_inventory_permissions_and_backfill');

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. بازگردانی تنظیمات جلسه + گزارش نهایی
-- ─────────────────────────────────────────────────────────────────────────────

SET FOREIGN_KEY_CHECKS = @OLD_FOREIGN_KEY_CHECKS;
SET SQL_MODE = @OLD_SQL_MODE;

SELECT
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'data_scope') AS users_data_scope,
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'created_by') AS customers_created_by,
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parts' AND COLUMN_NAME = 'stock_quantity') AS parts_stock_quantity,
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_parts' AND COLUMN_NAME = 'quantity') AS customer_parts_quantity,
    (SELECT COUNT(*) FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_logs') AS inventory_logs_table,
    (SELECT COUNT(*) FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_access_grants') AS customer_access_grants_table;

-- اگر تمام ستون‌های بالا مقدار 1 برگردانند، ارتقای دیتابیس با موفقیت انجام شده است.
