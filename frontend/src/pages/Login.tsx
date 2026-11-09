import { zodResolver } from "@hookform/resolvers/zod";
import {
  Cpu,
  Eye,
  EyeOff,
  Lock,
  MessageSquare,
  Moon,
  RotateCcw,
  Smartphone,
  Sun,
  User,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Field } from "../components/ui/Field";
import { Logo } from "../layouts/Sidebar";
import { authApi } from "../services/api";
import { useAuthStore } from "../store/useAuthStore";
import { useThemeStore } from "../store/useThemeStore";
import { cx, digits } from "../utils/format";

const schema = z.object({
  login: z.string().min(3, "ایمیل یا شماره همراه را وارد کنید"),
  password: z.string().min(6, "گذرواژه حداقل ۶ کاراکتر است"),
});
type FormValues = z.infer<typeof schema>;

const features = [
  {
    icon: Cpu,
    title: "شناسه یکتای سریال برای هر دستگاه",
    text: "تخصیص دستگاه‌ها تولیدی به مشتریان با بارکد و شماره سریال اختصاصی و گارانتی.",
  },
  {
    icon: Wrench,
    title: "سوابق سرویس دوره‌ای و تعمیرات",
    text: "پوشش اختیاری گارانتی و پیگیری تاریخچه کامل خدمات انجام‌شده برای هر دستگاه.",
  },
  {
    icon: MessageSquare,
    title: "سامانه پیامک خدماتی ملی‌پیامک",
    text: "ارسال پیامک با الگو و تحویل سریع به مشتریان حتی با خطوط مسدود تبلیغاتی.",
  },
];

export default function Login() {
  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);
  const loginWithOtp = useAuthStore((s) => s.loginWithOtp);
  const { theme, toggle } = useThemeStore();
  const nav = useNavigate();
  const location = useLocation();

  const [authMode, setAuthMode] = useState<"password" | "otp">("password");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");

  // OTP state
  const [otpPhone, setOtpPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpStep, setOtpStep] = useState<"request" | "verify">("request");
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [sandboxCode, setSandboxCode] = useState<string | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);

  // Countdown timer for OTP
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setInterval(() => {
      setOtpCooldown((c) => c - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { login: "", password: "" },
  });

  const isInitialized = useAuthStore((s) => s.isInitialized);
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (isInitialized && user) return <Navigate to={from} replace />;

  const onSubmit = async (v: FormValues) => {
    setError("");
    const res: any = await login(v.login, v.password);
    if (res.ok) {
      toast.success("خوش آمدید 👋");
      nav(from, { replace: true });
    } else {
      setError(res.error);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!/^09\d{9}$/.test(otpPhone)) {
      setError("شماره همراه باید ۱۱ رقم عددی بوده و با 09 شروع شود.");
      return;
    }
    setOtpLoading(true);
    try {
      const res = await authApi.sendOtp(otpPhone);
      toast.success(res.message);
      setOtpStep("verify");
      setOtpCooldown(res.expires_in || 120);
      if (res.sandbox_code) {
        setSandboxCode(res.sandbox_code);
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.errors?.phone?.[0] ||
          "خطا در ارسال کد پیامک",
      );
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (otpCode.length < 5) {
      setError("لطفاً کد تایید ۵ رقمی را وارد کنید.");
      return;
    }
    setOtpLoading(true);
    try {
      const res: any = await loginWithOtp(otpPhone, otpCode);
      if (res.ok) {
        toast.success("ورود موفقیت‌آمیز بود 👋");
        nav(from, { replace: true });
      } else {
        setError(res.error);
      }
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <div className="grid min-h-dvh bg-base-100 lg:grid-cols-2">
      {/* Form side */}
      <div className="relative flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-20">
        <button
          onClick={toggle}
          className="btn btn-ghost btn-circle absolute start-4 top-4"
          aria-label="تغییر پوسته"
        >
          {theme === "nikan-dark" ? (
            <Sun className="size-5" />
          ) : (
            <Moon className="size-5" />
          )}
        </button>

        <div className="mx-auto w-full max-w-md">
          <Logo size="lg" />
          <h1 className="mt-8 text-2xl font-black">ورود به سامانه CRM دستگاه‌ها</h1>
          <p className="mt-1.5 text-xs text-base-content/60">
            برای مدیریت مشتریان، کاتالوگ دستگاه‌ها و سامانه پیامک وارد شوید.
          </p>

          {/* Auth Method Switcher Tabs */}
          <div role="tablist" className="tabs tabs-box w-full mt-6">
            <button
              type="button"
              role="tab"
              onClick={() => {
                setAuthMode("password");
                setError("");
              }}
              className={cx(
                "tab flex-1 text-xs font-bold transition-all",
                authMode === "password" && "tab-active",
              )}
            >
              <Lock className="size-3.5 inline-block me-1.5" />
              ورود با گذرواژه
            </button>
            <button
              type="button"
              role="tab"
              onClick={() => {
                setAuthMode("otp");
                setError("");
              }}
              className={cx(
                "tab flex-1 text-xs font-bold transition-all",
                authMode === "otp" && "tab-active",
              )}
            >
              <MessageSquare className="size-3.5 inline-block me-1.5" />
              ورود با پیامک (OTP)
            </button>
          </div>

          {/* Mode 1: Password Form */}
          {authMode === "password" && (
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="mt-5 space-y-4"
              noValidate
            >
              <Field
                label="نام کاربری (ایمیل یا شماره همراه)"
                error={errors.login?.message}
              >
                <label className="input input-bordered flex items-center gap-2 w-full">
                  <User className="size-4 text-base-content/40" />
                  <input
                    type="text"
                    dir="ltr"
                    className="grow text-start font-mono text-sm"
                    autoComplete="username"
                    placeholder="ایمیل یا شماره همراه"
                    {...register("login")}
                  />
                </label>
              </Field>

              <Field label="گذرواژه" error={errors.password?.message}>
                <label className="input input-bordered flex items-center gap-2 w-full">
                  <Lock className="size-4 text-base-content/40" />
                  <input
                    type={show ? "text" : "password"}
                    dir="ltr"
                    className="grow text-start font-mono text-sm"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="text-base-content/40 hover:text-base-content"
                  >
                    {show ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </label>
              </Field>

              {error && (
                <div className="rounded-xl border border-error/30 bg-error/10 p-3 text-xs text-error font-medium">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn btn-primary w-full"
              >
                {isSubmitting && (
                  <span className="loading loading-spinner loading-xs" />
                )}
                ورود به سامانه
              </button>

            </form>
          )}

          {/* Mode 2: SMS OTP Form */}
          {authMode === "otp" && (
            <div className="mt-5 space-y-4">
              {otpStep === "request" ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <Field label="شماره تلفن همراه ثبت‌شده در سیستم">
                    <label className="input input-bordered flex items-center gap-2 w-full">
                      <Smartphone className="size-4 text-base-content/40" />
                      <input
                        type="tel"
                        dir="ltr"
                        maxLength={11}
                        className="grow text-start font-mono text-sm"
                        placeholder="09121234567"
                        value={otpPhone}
                        onChange={(e) =>
                          setOtpPhone(e.target.value.replace(/\D/g, ""))
                        }
                        required
                        autoFocus
                      />
                    </label>
                  </Field>

                  {error && (
                    <div className="rounded-xl border border-error/30 bg-error/10 p-3 text-xs text-error font-medium">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={otpLoading || otpPhone.length !== 11}
                    className="btn btn-primary w-full gap-2"
                  >
                    {otpLoading ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      <MessageSquare className="size-4" />
                    )}
                    دریافت کد ورود با پیامک
                  </button>

                  <p className="text-[11px] text-base-content/60 leading-relaxed text-center">
                    کد یکبار مصرف ۵ رقمی از طریق پیامک به شماره همراه شما ارسال
                    خواهد شد.
                  </p>
                </form>
              ) : (
                <form
                  onSubmit={handleVerifyOtp}
                  className="space-y-4 animate-in fade-in duration-200"
                >
                  <div className="flex items-center justify-between bg-base-200 p-2.5 rounded-xl text-xs">
                    <span className="text-base-content/70">
                      ارسال‌شده به:{" "}
                      <span className="font-mono font-bold text-base-content">
                        {otpPhone}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setOtpStep("request");
                        setOtpCode("");
                        setError("");
                      }}
                      className="text-primary text-[11px] font-bold hover:underline"
                    >
                      تغییر شماره
                    </button>
                  </div>

                  {sandboxCode && (
                    <div className="rounded-xl border border-primary/30 bg-primary/10 p-2.5 text-xs text-primary font-bold flex items-center justify-between">
                      <span>حالت شبیه‌ساز فعال است</span>
                      <span className="font-mono text-sm">
                        کد تست: {sandboxCode}
                      </span>
                    </div>
                  )}

                  <Field label="کد تأیید ۵ رقمی پیامک‌شده">
                    <input
                      type="text"
                      dir="ltr"
                      maxLength={5}
                      className="input input-bordered w-full text-center font-mono text-lg tracking-widest font-bold"
                      placeholder="• • • • •"
                      value={otpCode}
                      onChange={(e) =>
                        setOtpCode(e.target.value.replace(/\D/g, ""))
                      }
                      required
                      autoFocus
                    />
                  </Field>

                  {error && (
                    <div className="rounded-xl border border-error/30 bg-error/10 p-3 text-xs text-error font-medium">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={otpLoading || otpCode.length !== 5}
                    className="btn btn-primary w-full"
                  >
                    {otpLoading && (
                      <span className="loading loading-spinner loading-xs" />
                    )}
                    تأیید و ورود به سامانه
                  </button>

                  {/* Resend Timer / Button */}
                  <div className="text-center pt-1 text-xs">
                    {otpCooldown > 0 ? (
                      <span className="text-base-content/50">
                        امکان ارسال مجدد کد پس از{" "}
                        <span className="font-mono font-bold text-primary">
                          {digits(String(otpCooldown))}
                        </span>{" "}
                        ثانیه
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSendOtp}
                        className="btn btn-ghost btn-xs text-primary font-bold gap-1"
                      >
                        <RotateCcw className="size-3" />
                        ارسال مجدد کد پیامک
                      </button>
                    )}
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Decorative / Features side */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-tr from-slate-900 via-indigo-950 to-blue-950 p-12 text-white lg:flex">
        <div className="space-y-3">
          <span className="badge badge-primary font-mono text-xs">
            نسخه ۱.۰ MVP
          </span>
          <h2 className="text-3xl font-black leading-tight">
            سامانه تخصصی مدیریت دستگاه‌ها صنعتی، سوابق سرویس و ارتباط با مشتریان
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed max-w-lg">
            پوشش کامل چرخه از سرنخ بالقوه تا تحویل دستگاه، صدور شماره سریال یکتا،
            ثبت سوابق گارانتی و ارسال پیامک با وب‌سرویس ملی‌پیامک.
          </p>
        </div>

        <div className="space-y-4">
          {features.map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className="flex items-start gap-4 rounded-2xl bg-white/5 p-4 backdrop-blur-sm border border-white/10"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400">
                <Icon className="size-5" />
              </span>
              <div>
                <p className="font-bold text-sm text-white">{title}</p>
                <p className="mt-0.5 text-xs text-slate-300">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
