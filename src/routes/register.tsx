/**
 * /register (ساخت حساب) — email + password sign-up (STEP 6).
 *
 * Name and phone are collected here because the checkout form needs them later;
 * the name is required and goes into the Auth metadata, where the database
 * trigger reads it to create `customer_profiles` (see the client-side
 * `ensureProfile()` fallback in ~/lib/auth).
 *
 * Honest outcomes: with email confirmation enabled in the Supabase project,
 * sign-up returns no session — the page then says so («برای فعالسازی حساب، ایمیل
 * خود را تأیید کنید») instead of pretending the customer is now signed in.
 */

import { Link, createFileRoute, useNavigate, type LinkProps } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button } from "~/components/Button";
import { Card } from "~/components/Card";
import { Container } from "~/components/Container";
import { Input } from "~/components/Input";
import { AccountField, AccountSkeleton, AuthConfigNotice } from "~/components/account";
import { useAuth } from "~/lib/auth";
import {
  validateRegistration,
  type RegisterErrors,
} from "~/lib/account-rules";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
  head: () => ({
    meta: [{ title: "ساخت حساب | فروشگاه پوشاک" }],
  }),
});

function RegisterPage() {
  const { status, signUp } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "signedIn") void navigate({ to: "/account" });
  }, [status, navigate]);

  const submit = async () => {
    if (busy) return;
    const found = validateRegistration(name, email, password, phone);
    setErrors(found);
    setFormError(null);
    setNotice(null);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      const result = await signUp({ name, email, password, phone });
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      if (result.message) {
        // Confirmation e-mail needed: stay on the page and explain.
        setNotice(result.message);
        return;
      }
      await navigate({ to: "/account" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="py-10 sm:py-16" data-register-page>
      <Container className="max-w-lg">
        <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl">ساخت حساب</h1>
        <p className="mt-2 text-sm text-stone-500">
          با ساخت حساب، سفارش‌های خود را در هر دستگاهی پیگیری کنید.
        </p>

        {status === "loading" ? (
          <AccountSkeleton />
        ) : status === "unconfigured" ? (
          <AuthConfigNotice title="ساخت حساب در حال حاضر فعال نیست" />
        ) : (
          <Card className="mt-8 p-5 sm:p-6" data-register-form>
            <div className="space-y-3">
              <AccountField id="name" label="نام و نام خانوادگی" required error={errors.name}>
                <Input
                  id="name"
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  aria-invalid={errors.name ? true : undefined}
                  placeholder="نام و نام خانوادگی"
                  className={errors.name ? "border-red-400" : ""}
                />
              </AccountField>

              <AccountField
                id="phone"
                label="شماره تماس"
                error={errors.phone}
                hint="برای هماهنگی ارسال سفارش استفاده می‌شود."
              >
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                  aria-invalid={errors.phone ? true : undefined}
                  placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                  className={`text-start ${errors.phone ? "border-red-400" : ""}`}
                />
              </AccountField>

              <AccountField id="email" label="ایمیل" required error={errors.email}>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  aria-invalid={errors.email ? true : undefined}
                  placeholder="name@example.com"
                  className={`text-start ${errors.email ? "border-red-400" : ""}`}
                />
              </AccountField>

              <AccountField
                id="password"
                label="گذرواژه"
                required
                error={errors.password}
                hint="حداقل ۶ نویسه."
              >
                <Input
                  id="password"
                  name="password"
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  aria-invalid={errors.password ? true : undefined}
                  placeholder="••••••"
                  className={`text-start ${errors.password ? "border-red-400" : ""}`}
                />
              </AccountField>
            </div>

            <p
              role="alert"
              aria-live="polite"
              data-register-error={formError ? "true" : "false"}
              className={`mt-4 text-sm font-medium text-red-600 ${formError ? "" : "hidden"}`}
            >
              {formError ?? ""}
            </p>
            <p
              aria-live="polite"
              data-register-notice={notice ? "true" : "false"}
              className={`mt-4 text-sm font-medium text-accent-800 ${notice ? "" : "hidden"}`}
            >
              {notice ?? ""}
            </p>

            <Button
              onClick={submit}
              disabled={busy}
              size="lg"
              className="mt-5 w-full"
              data-register-submit
              data-busy={busy ? "true" : "false"}
            >
              {busy ? "در حال ساخت حساب…" : "ساخت حساب"}
            </Button>

            <p className="mt-4 text-center text-sm text-stone-500">
              حساب دارید؟{" "}
              <Link
                to={"/login" as LinkProps["to"]}
                className="font-medium text-accent-800 hover:underline"
              >
                ورود
              </Link>
            </p>
          </Card>
        )}
      </Container>
    </section>
  );
}
