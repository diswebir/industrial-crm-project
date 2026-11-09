import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  CheckCircle2,
  Clock,
  Cpu,
  MessageSquare,
  Send,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  Warehouse,
  Wrench,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Can } from "../components/common/Can";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { dashboardApi } from "../services/api";
import { useAuthStore } from "../store/useAuthStore";
import { cx, dateFa, num, relativeFa, weekdayFa } from "../utils/format";

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
    total_parts: 0,
    assigned_parts: 0,
    assigned_devices: 0,
    total_stock: 0,
    total_sms_sent: 0,
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
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
          hint="دارای دستگاه فیزیکی"
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
        <StatCard
          title="مدل‌های دستگاه‌ها"
          value={num(stats.total_parts)}
          icon={Cpu}
          tone="secondary"
          hint="کاتالوگ محصولات"
          loading={isLoading}
          to="/parts"
        />
        <StatCard
          title="دستگاه‌های تخصیص‌یافته"
          value={num(stats.assigned_devices ?? stats.assigned_parts)}
          icon={Boxes}
          tone="primary"
          hint={`${num(stats.assigned_parts)} پرونده تخصیص`}
          loading={isLoading}
          to="/customers"
        />
        <Can permission="inventory.view">
          <StatCard
            title="موجودی انبار"
            value={num(stats.total_stock ?? 0)}
            icon={Warehouse}
            tone="warning"
            hint="ورود / خروج و تاریخچه انبار"
            loading={isLoading}
            to="/inventory"
          />
        </Can>
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
                      <span>
                        {act.customer
                          ? `${act.customer.first_name} ${act.customer.last_name}`
                          : "—"}
                      </span>
                      <span>•</span>
                      <span>{relativeFa(act.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Melipayamak Dispatched Logs & Quick Status */}
        <div className="lg:col-span-5 space-y-6">
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
                      <p className="text-base-content/60 truncate max-w-[200px]">
                        {sms.customer
                          ? `${sms.customer.first_name} ${sms.customer.last_name}`
                          : "ارسال مستقیم"}
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
              کد رهگیری ثبت می‌گردد و در صورت تعویض، تعداد انبار به‌صورت
              خودکار به‌روزرسانی می‌شود.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
