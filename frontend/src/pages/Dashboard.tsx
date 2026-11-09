import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CheckCircle2,
  Clock,
  Cpu,
  MessageSquare,
  PackageCheck,
  RefreshCcw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  UserPlus,
  Users,
  Wrench,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Can } from "../components/common/Can";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { dashboardApi } from "../services/api";
import { useAuthStore } from "../store/useAuthStore";
import { cx, dateFa, num, relativeFa, weekdayFa } from "../utils/format";
import { inventoryTypeMeta } from "../utils/meta";
import type { Customer } from "../types";

/** نام نمایشی مشتری — شخصیت حقوقی ممکن است نام شخص نداشته باشد (تسک ۵) */
function nameOf(c?: Customer | null): string {
  if (!c) return "—";
  const person = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
  const company = (c.company_name ?? "").trim();
  return c.full_name || person || company || "—";
}

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const nav = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: dashboardApi.getStats,
  });

  const stats = data?.stats ?? {
    total_customers: 0,
    effective_customers: 0,
    potential_customers: 0,
    my_customers: 0,
    total_parts: 0,
    assigned_parts: 0,
    assigned_quantity: 0,
    total_stock: 0,
    low_stock_count: 0,
    total_sms_sent: 0,
    has_global_customer_access: true,
  };

  const today = new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`سلام، ${user?.name || "کاربر گرامی"} 👋`}
        subtitle={`${weekdayFa(today)}، ${dateFa(today)} — خلاصه وضعیت مدیریت دستگاه‌ها، انبار و مشتریان`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Can permission="customers.create">
              <button
                className="btn btn-sm"
                onClick={() => nav("/customers?new=1")}
              >
                <UserPlus className="size-4" /> مشتری جدید
              </button>
            </Can>
            <Can permission="sms.send">
              <button
                className="btn btn-sm btn-primary"
                onClick={() => nav("/sms?new=1")}
              >
                <Send className="size-4" /> ارسال پیامک الگو
              </button>
            </Can>
          </div>
        }
      />

      {/* KPI Stats Grid - All linked to their respective pages */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <StatCard
          title="کل مشتریان"
          value={num(stats.total_customers)}
          icon={Users}
          tone="primary"
          hint="مشاهده تمام پرونده‌ها"
          loading={isLoading}
          to="/customers"
        />
        <StatCard
          title="مشتریان بالفعل"
          value={num(stats.effective_customers)}
          icon={UserCheck}
          tone="success"
          hint="دارای دستگاه تخصیص‌یافته"
          loading={isLoading}
          to="/customers?type=effective"
        />
        <StatCard
          title="مشتریان بالقوه"
          value={num(stats.potential_customers)}
          icon={UserPlus}
          tone="warning"
          hint="مشتریان در انتظار خرید"
          loading={isLoading}
          to="/customers?type=potential"
        />
        {!stats.has_global_customer_access && (
          <StatCard
            title="مشتریان من"
            value={num(stats.my_customers)}
            icon={ShieldCheck}
            tone="secondary"
            hint="مشتریانی که دسترسی مشاهده آن‌ها را دارید"
            loading={isLoading}
            to="/customers"
          />
        )}
        <StatCard
          title="مدل‌های دستگاه"
          value={num(stats.total_parts)}
          icon={Cpu}
          tone="secondary"
          hint="کاتالوگ دستگاه‌ها"
          loading={isLoading}
          to="/parts"
        />
        <StatCard
          title="دستگاه‌های تخصیص‌یافته"
          value={`${num(stats.assigned_quantity)} عدد`}
          icon={Boxes}
          tone="primary"
          hint={`${num(stats.assigned_parts)} ردیف تخصیص با سریال یکتا`}
          loading={isLoading}
          to="/parts"
        />
        <StatCard
          title="موجودی انبار"
          value={`${num(stats.total_stock)} عدد`}
          icon={PackageCheck}
          tone="success"
          hint="مجموع موجودی همه دستگاه‌ها"
          loading={isLoading}
          to="/inventory"
        />
        <StatCard
          title="کمبود موجودی"
          value={num(stats.low_stock_count)}
          icon={AlertTriangle}
          tone={stats.low_stock_count > 0 ? "error" : "success"}
          hint="دستگاه‌های رسیده به حد هشدار"
          loading={isLoading}
          to="/inventory"
        />
        <StatCard
          title="پیامک‌های ارسالی"
          value={num(stats.total_sms_sent)}
          icon={MessageSquare}
          tone="success"
          hint="مشاهده لاگ ملی‌پیامک"
          loading={isLoading}
          to="/sms"
        />
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left/Main Column: Recent Customer Activities & Audit Trail */}
        <div className="lg:col-span-7 bg-base-100 rounded-2xl border border-base-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-base-200">
            <div>
              <h3 className="font-bold text-base">
                تاریخچه اقدامات و سوابق مشتریان
              </h3>
              <p className="text-xs text-base-content/60">
                رویدادهای ثبت‌شده اخیر در سیستم
              </p>
            </div>
            <Link
              to="/customers"
              className="text-xs font-semibold text-primary hover:underline"
            >
              مشاهده همه مشتریان
            </Link>
          </div>

          {!data?.recent_activities?.length ? (
            <div className="py-12 text-center text-sm text-base-content/50">
              هنوز رویدادی ثبت نشده است.
            </div>
          ) : (
            <div className="divide-y divide-base-200/60">
              {data.recent_activities.map((act) => (
                <div
                  key={act.id}
                  className="py-3 flex items-start gap-3 text-sm"
                >
                  <span
                    className={cx(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold border",
                      act.action === "part_assigned"
                        ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"
                        : act.action === "type_converted"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                          : act.action === "service_performed"
                            ? "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                            : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
                    )}
                  >
                    {act.action === "part_assigned" ? (
                      <Cpu className="size-4" />
                    ) : act.action === "type_converted" ? (
                      <CheckCircle2 className="size-4" />
                    ) : act.action === "service_performed" ? (
                      <Wrench className="size-4" />
                    ) : (
                      <Clock className="size-4" />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-base-content leading-snug">
                      {act.description}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-base-content/50">
                      <span>{act.customer ? nameOf(act.customer) : "—"}</span>
                      <span>•</span>
                      <span>{relativeFa(act.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Inventory movements, Melipayamak Logs & Quick Status */}
        <div className="lg:col-span-5 space-y-6">
          <Can permission="inventory.logs">
            <div className="bg-base-100 rounded-2xl border border-base-200/80 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-base-200">
                <div>
                  <h3 className="font-bold text-base">آخرین تراکنش‌های انبار</h3>
                  <p className="text-xs text-base-content/60">
                    ورود، خروج و برگشت دستگاه‌ها با نام کاربر ثبت‌کننده
                  </p>
                </div>
                <Link
                  to="/inventory"
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  تاریخچه کامل انبار
                </Link>
              </div>

              {!data?.recent_inventory?.length ? (
                <div className="py-10 text-center text-sm text-base-content/50">
                  هنوز تراکنش انباری ثبت نشده است.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {data.recent_inventory.map((log) => {
                    const meta = inventoryTypeMeta(log.type);
                    return (
                      <div
                        key={log.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/60"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            className={cx(
                              "flex size-8 shrink-0 items-center justify-center rounded-xl border",
                              log.type === "in"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : log.type === "out"
                                  ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                                  : "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
                            )}
                          >
                            {log.type === "in" ? (
                              <ArrowDownToLine className="size-4" />
                            ) : log.type === "out" ? (
                              <ArrowUpFromLine className="size-4" />
                            ) : log.type === "return" ? (
                              <RefreshCcw className="size-4" />
                            ) : (
                              <SlidersHorizontal className="size-4" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-bold">{log.part?.name ?? "—"}</p>
                            <p className="mt-0.5 truncate text-[11px] text-base-content/55">
                              {meta.label} • {num(log.quantity)} عدد • توسط{" "}
                              {log.user?.name ?? "سیستم"}
                            </p>
                            {log.customer_id ? (
                              <Link
                                to={`/customers/${log.customer_id}`}
                                className="text-[11px] font-semibold text-primary hover:underline"
                              >
                                {nameOf(log.customer)}
                              </Link>
                            ) : null}
                          </div>
                        </div>
                        <div className="shrink-0 text-end">
                          <p className="font-mono text-[11px] font-bold">
                            موجودی: {num(log.stock_after)}
                          </p>
                          <p className="mt-0.5 text-[10px] text-base-content/40">
                            {relativeFa(log.logged_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Can>

          <div className="bg-base-100 rounded-2xl border border-base-200/80 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-base-200">
              <div>
                <h3 className="font-bold text-base">
                  پیامک‌های اخیر (ملی‌پیامک)
                </h3>
                <p className="text-xs text-base-content/60">
                  وضعیت ارسال پیامک با الگو
                </p>
              </div>
              <Link
                to="/sms"
                className="text-xs font-semibold text-primary hover:underline"
              >
                مرکز پیامک
              </Link>
            </div>

            {!data?.recent_sms?.length ? (
              <div className="py-10 text-center text-sm text-base-content/50">
                هنوز پیامکی ارسال نشده است.
              </div>
            ) : (
              <div className="space-y-3">
                {data.recent_sms.map((sms) => (
                  <div
                    key={sms.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-xs bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold ltr-text text-start text-xs font-mono">
                          {sms.recipient_mobile}
                        </span>
                        <span className="badge badge-xs bg-slate-200 text-slate-800 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
                          الگوی {sms.pattern_code}
                        </span>
                      </div>
                      <p className="max-w-[200px] truncate text-base-content/60">
                        {sms.customer ? nameOf(sms.customer) : "ارسال مستقیم"}
                      </p>
                    </div>

                    <div className="text-end space-y-1">
                      <span
                        className={cx(
                          "badge badge-xs font-semibold",
                          sms.status === "sent"
                            ? "badge-success badge-soft"
                            : sms.status === "pending"
                              ? "badge-warning badge-soft"
                              : "badge-error badge-soft",
                        )}
                      >
                        {sms.status === "sent"
                          ? "ارسال شد"
                          : sms.status === "pending"
                            ? "در انتظار"
                            : "ناموفق"}
                      </span>
                      <p className="text-[10px] text-base-content/40">
                        {relativeFa(sms.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Info Box on Periodic Service Policy with Solid High Contrast */}
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 dark:border-indigo-900/40 dark:bg-indigo-950/40">
            <h4 className="font-bold text-sm text-indigo-950 dark:text-indigo-200 flex items-center gap-2">
              <ShieldCheck className="size-4 text-indigo-600 dark:text-indigo-400" />
              خط‌مشی گارانتی و سرویس دوره‌ای
            </h4>
            <p className="mt-2 text-xs text-indigo-900 leading-relaxed dark:text-indigo-300">
              سرویس‌های دوره‌ای دستگاه‌ها اجباری نبوده و به عنوان پوشش گارانتی
              اختیاری شرکت برای مشتریان در نظر گرفته می‌شود. هر زمان مشتری
              نیازمند تعمیر یا بررسی دستگاه باشد، سابقه آن در پرونده دستگاه با
              کد رهگیری ثبت می‌گردد. موجودی انبار نیز با هر تخصیص به‌طور خودکار
              کسر و در تاریخچه انبار ثبت می‌شود.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
