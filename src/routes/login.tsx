/**
 * /login (ورود) — email + password sign-in (STEP 6).
 *
 * • No fake success: without a connected database the page renders the shared
 *   "connect the database" notice and the form is not even shown.
 * • Validation is inline and Persian, in the cart/checkout style (nothing is
 *   disabled up front; problems are reported per field on submit).
 * • Errors from Supabase Auth are translated to non-technical Persian messages
 *   (`authErrorMessage` in ~/lib/auth); a wrong password never leaks internals.
 * • An already signed-in visitor is sent to the account area instead of being
 *   asked to log in again.
 */

import { Link, createFileRoute, useNavigate, type LinkProps } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button } from "~/components/Button";
import { Card } from "~/components/Card";
import { Container } from "~/components/Container";
import { Input } from "~/components/Input";
import { AccountField, AccountSkeleton, AuthConfigNotice } from "~/components/account";
import { useAuth } from "~/lib/auth";
import { validateCredentials, type CredentialsErrors } from "~/lib/account-rules";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [{ title: "ورود به حساب | فروشگاه پوشاک" }],
  }),
});

function LoginPage() {
  const { status, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<CredentialsErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in (e.g. a bookmarked link) → straight to the account area.
  useEffect(() => {
    if (status === "signedIn") void navigate({ to: "/account" });
  }, [status, navigate]);

  const submit = async () => {
    if (busy) return;
    const found = validateCredentials(email, password);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      const result = await signIn(email, password);
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      await navigate({ to: "/account" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="py-10 sm:py-16" data-login-page>
      <Container className="max-w-lg">
        <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl">ورود به حساب</h1>
        <p className="mt-2 text-sm text-stone-500">
          برای پیگیری سفارش‌ها و مشاهده سابقه خرید وارد شوید.
        </p>

        {status === "loading" ? (
          <AccountSkeleton />
        ) : status === "unconfigured" ? (
          <AuthConfigNotice title="ورود در حال حاضر فعال نیست" />
        ) : (
          <Card className="mt-8 p-5 sm:p-6" data-login-form>
            <div className="space-y-3">
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

              <AccountField id="password" label="گذرواژه" required error={errors.password}>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  dir="ltr"
                  autoComplete="current-password"
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
              data-login-error={formError ? "true" : "false"}
              className={`mt-4 text-sm font-medium text-red-600 ${formError ? "" : "hidden"}`}
            >
              {formError ?? ""}
            </p>

            <Button
              onClick={submit}
              disabled={busy}
              size="lg"
              className="mt-5 w-full"
              data-login-submit
              data-busy={busy ? "true" : "false"}
            >
              {busy ? "در حال ورود…" : "ورود"}
            </Button>

            <p className="mt-4 text-center text-sm text-stone-500">
              حساب کاربری ندارید؟{" "}
              <Link
                to={"/register" as LinkProps["to"]}
                className="font-medium text-accent-800 hover:underline"
              >
                ساخت حساب
              </Link>
            </p>
          </Card>
        )}
      </Container>
    </section>
  );
}
