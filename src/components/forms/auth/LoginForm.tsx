import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { User, AlertCircle, Loader2 } from "lucide-react";
import { useLoginMutation } from "../../../hooks/useAuthQuery";
import { LoginCredentials, loginSchema } from "../../../types/auth/schemas";
import { PasswordInput } from "../../ui/PasswordInput";
import { cn } from "../../../lib/utils/utils";
import { tokens } from "../../../lib/tokens";

export const LoginForm: React.FC = () => {
  const navigate = useNavigate();
  const loginMutation = useLoginMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginCredentials>({
    resolver: zodResolver(loginSchema),
    defaultValues: { login: "", password: "" },
  });

  const onSubmit = (data: LoginCredentials) => {
    loginMutation.mutate(data, {
      onSuccess: () => navigate("/", { replace: true }),
    });
  };

  const loginErrorData = loginMutation.error?.response?.data as
    | { message?: string; code?: string; retry_after?: number }
    | undefined;
  const errorMessage =
    (loginErrorData?.code === "LOGIN_THROTTLED"
      ? `محاولات دخول فاشلة كثيرة — أعد المحاولة بعد ${loginErrorData.retry_after ?? 60} ثانية.`
      : null) ||
    loginMutation.error?.response?.data?.message ||
    (loginMutation.isError ? "تعذّر الاتصال بالخادم." : null);

  return (
    <>
      {errorMessage && (
        <div
          className={cn(
            tokens.typography.webUI.c1Regular,
            "mb-4 flex items-start gap-2 rounded-app-lg border border-app-status-danger/30 bg-app-status-danger/10 p-3 text-app-status-danger",
          )}
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="leading-relaxed">{errorMessage}</div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label
            htmlFor="login"
            className={cn(
              tokens.typography.webUI.b2Emphasized,
              "block mb-1.5 text-app-label-primary",
            )}
          >
            البريد الإلكتروني أو رقم الهاتف
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-app-label-tertiary">
              <User className="w-4 h-4" />
            </div>
            <input
              id="login"
              type="text"
              placeholder="0912345678 أو operator@company.com"
              autoComplete="username"
              disabled={loginMutation.isPending}
              dir="ltr"
              {...register("login")}
              className={cn(
                tokens.typography.webUI.b2Regular,
                "w-full pl-9 pr-3 py-2.5 border text-left bg-app-bg-primary text-app-label-primary",
                errors.login
                  ? "border-app-status-danger/80 focus:border-app-status-danger focus:ring-1 focus:ring-app-status-danger"
                  : "border-app-separator focus:border-app-accent focus:ring-1 focus:ring-app-accent",
                "rounded-app-lg placeholder-app-label-tertiary outline-none transition-colors disabled:opacity-50",
              )}
            />
          </div>
          {errors.login && (
            <p
              className={cn(
                tokens.typography.webUI.c1Regular,
                "text-app-status-danger mt-1",
              )}
            >
              {errors.login.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="password"
            className={cn(
              tokens.typography.webUI.b2Emphasized,
              "block mb-1.5 text-app-label-primary",
            )}
          >
            كلمة المرور
          </label>
          <PasswordInput
            id="password"
            placeholder="••••••••"
            autoComplete="current-password"
            disabled={loginMutation.isPending}
            error={errors.password?.message}
            {...register("password")}
          />
        </div>

        <button
          type="submit"
          disabled={loginMutation.isPending}
          className={cn(
            tokens.typography.webUI.b2Emphasized,
            "w-full py-2.5 px-4 bg-app-accent hover:bg-app-accent-hover active:bg-app-accent-hover text-white rounded-app-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-2",
          )}
        >
          {loginMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>جارٍ تسجيل الدخول...</span>
            </>
          ) : (
            <span>تسجيل الدخول</span>
          )}
        </button>
      </form>
    </>
  );
};
