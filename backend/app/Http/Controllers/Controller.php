<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\DB;

abstract class Controller
{
    /**
     * Returns the case-insensitive LIKE operator for the active database driver.
     *
     * PostgreSQL uses ILIKE for case-insensitive matching, while MySQL/MariaDB
     * use plain LIKE (which is case-insensitive by default with *_ci collations).
     * This keeps search behavior identical across both drivers (e.g. local
     * PostgreSQL via Docker and MySQL on shared cPanel hosting).
     */
    protected function likeOp(): string
    {
        return DB::connection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';
    }

    /** Do not reveal whether an out-of-scope customer ID exists. */
    protected function authorizeCustomer(\App\Models\Customer $customer): void
    {
        abort_unless(\App\Models\Customer::visibleTo(auth()->user())->whereKey($customer->id)->exists(), 404);
    }
}
