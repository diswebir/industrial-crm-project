<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Additive upgrade for existing installations. Historical quantities and
     * ownership are never guessed. MySQL DDL requires a backup before running.
     */
    public function up(): void
    {
        if (!Schema::hasColumn('users', 'customer_access_all')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->boolean('customer_access_all')->default(false);
            });
        }

        if (!Schema::hasColumn('customers', 'created_by_user_id')) {
            Schema::table('customers', function (Blueprint $table): void {
                $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            });
        }

        if (!Schema::hasColumn('customers', 'deleted_at')) {
            Schema::table('customers', function (Blueprint $table): void {
                $table->softDeletes();
            });
        }

        // These columns were NOT NULL in the original schema. Existing values
        // remain untouched; nullable permits company-only and mobile-free forms.
        Schema::table('customers', function (Blueprint $table): void {
            $table->string('first_name')->nullable()->change();
            $table->string('last_name')->nullable()->change();
            $table->string('mobile')->nullable()->change();
        });

        if (!Schema::hasColumn('parts', 'stock_quantity')) {
            Schema::table('parts', function (Blueprint $table): void {
                $table->unsignedBigInteger('stock_quantity')->default(0);
            });
        }

        if (!Schema::hasColumn('customer_parts', 'quantity')) {
            Schema::table('customer_parts', function (Blueprint $table): void {
                $table->unsignedInteger('quantity')->default(1);
            });
        }
        if (!Schema::hasColumn('customer_parts', 'invoice_amount')) {
            Schema::table('customer_parts', function (Blueprint $table): void {
                $table->decimal('invoice_amount', 14, 2)->nullable();
            });
        }
        if (!Schema::hasColumn('customer_parts', 'invoice_number')) {
            Schema::table('customer_parts', function (Blueprint $table): void {
                $table->string('invoice_number', 100)->nullable();
            });
        }
        if (!Schema::hasColumn('customer_parts', 'deleted_at')) {
            Schema::table('customer_parts', function (Blueprint $table): void {
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('user_customer_owner_access')) {
            Schema::create('user_customer_owner_access', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('owner_user_id')->constrained('users')->cascadeOnDelete();
                $table->unique(['user_id', 'owner_user_id'], 'user_customer_owner_unique');
            });
        }

        if (!Schema::hasTable('user_customer_access')) {
            Schema::create('user_customer_access', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
                $table->unique(['user_id', 'customer_id'], 'user_customer_unique');
            });
        }

        if (!Schema::hasTable('inventory_logs')) {
            Schema::create('inventory_logs', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('part_id')->constrained('parts')->restrictOnDelete();
                $table->foreignId('customer_part_id')->nullable()->constrained('customer_parts')->nullOnDelete();
                $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('type', 32);
                $table->unsignedInteger('quantity');
                $table->unsignedBigInteger('balance_before');
                $table->unsignedBigInteger('balance_after');
                $table->string('user_name')->nullable();
                $table->string('customer_name')->nullable();
                $table->text('note')->nullable();
                $table->timestamps();
                $table->index(['part_id', 'created_at']);
            });
        }

        // Recover only an explicitly recorded creator that still exists.
        // Imported/old rows without a reliable creation event stay unowned.
        if (Schema::hasTable('customer_histories')) {
            DB::table('customers')->whereNull('created_by_user_id')->orderBy('id')->chunkById(250, function ($customers): void {
                foreach ($customers as $customer) {
                    $creator = DB::table('customer_histories')
                        ->join('users', 'users.id', '=', 'customer_histories.user_id')
                        ->where('customer_histories.customer_id', $customer->id)
                        ->where('customer_histories.action', 'created')
                        ->orderBy('customer_histories.id')
                        ->value('customer_histories.user_id');
                    if ($creator !== null) {
                        DB::table('customers')->where('id', $customer->id)
                            ->whereNull('created_by_user_id')->update(['created_by_user_id' => $creator]);
                    }
                }
            });
        }
    }

    /**
     * Dropping these columns/tables would destroy live data and audit trails.
     * Restore a tested backup to roll back the release instead.
     */
    public function down(): void
    {
    }
};
