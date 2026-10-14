/**
 * /account (حساب کاربری) — the signed-in customer's profile (STEP 6).
 *
 * • Read view: name, phone, email, account age. Nothing is invented — with no
 *   profile row the page says the profile is incomplete instead of showing a
 *   blank where a name should be.
 * • Inline edit: name (required), phone and email (optional). The profile row is
 *   written through RLS (`auth.uid() = id`); an email change also updates the
 *   Auth account, which is reported honestly when it needs confirmation.
 * • Signed out → the login page is offered (no auto-redirect loop, no fake user).
 * • Not configured → the shared "connect the database" notice.
 */

import { createFileRoute, Link, type LinkProps } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { Card } from "~/components/Card";
import { Container } from "~/components/Container";
import { Input } from "~/components/Input";
import {
  AccountField,
  AccountNav,
  AccountSkeleton,
  AuthConfigNotice,
} from "~/components/account";
import { useAuth } from "~/lib/auth";
import { isEmailValid, isPhoneValid, toLatinDigits } from "~/lib/account-rules";
import { formatJalaliDate } from "~/lib/format";

export const Route = createFileRoute("/account")({
  component: AccountPage,
  head: () => ({
    meta: [{ title: "حساب کاربری | فروشگاه پوشاک" }],
  }),
});

interface ProfileErrors {
  name?: string;
  phone?: string;
  email?: string;
}

function AccountPage() {
  const { status, user, profile, profileLoading, updateProfile } = useAuth();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // Start editing from whatever the profile says (also after a refresh).
  useEffect(() => {
    if (!editing) return;
    setName(profile?.name ?? "");
    setPhone(profile?.phone ?? "");
    setEmail(profile?.email ?? user?.email ?? "");
  }, [editing, profile, user]);

  const save = async () => {
    if (busy) return;
    const found: ProfileErrors = {};
    if (name.trim() === "") found.name = "نام خود را وارد کنید";
    if (phone.trim() !== "" && !isPhoneValid(phone)) found.phone = "شماره تماس معتبر نیست";
    if (email.trim() !== "" && !isEmailValid(email)) found.email = "ایمیل معتبر نیست";
    setErrors(found);
    setFormError(null);
    setSaved(false);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      const result = await updateProfile({ name, phone, email });
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      setEditing(false);
      setSaved(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="py-10 sm:py-16" data-account-page>
      <Container className="max-w-3xl">
        <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl">حساب کاربری</h1>
        <p className="mt-2 text-sm text-stone-500">اطلاعات حساب و سابقه سفارش‌های شما.</p>

        {status === "loading" ? (
          <AccountSkeleton />
        ) : status === "unconfigured" ? (
          <AuthConfigNotice title="حساب کاربری در حال حاضر فعال نیست" />
        ) : status === "signedOut" ? (
          <div
            className="mt-8 rounded-card border border-dashed border-stone-300 bg-white px-6 py-14 text-center shadow-soft"
            data-account-signed-out="true"
          >
            <h2 className="text-lg font-bold text-stone-800">وارد حساب خود نشده‌اید</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-stone-500">
              برای دیدن اطلاعات حساب و سفارش‌ها ابتدا وارد شوید.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button to="/login">ورود به حساب</Button>
              <Button to="/register" variant="secondary">
                ساخت حساب
              </Button>
            </div>
          </div>
        ) : (
          <>
            <AccountNav active="profile" />

            <Card className="mt-6 p-5 sm:p-6" data-account-profile>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-bold text-stone-900">
                  {profile ? profile.name : "پروفایل شما"}
                </h2>
                {profileLoading ? (
                  <Badge variant="outline" data-account-profile-loading="true">
                    در حال بارگذاری…
                  </Badge>
                ) : null}
              </div>

              {!editing ? (
                <>
                  <dl className="mt-5 space-y-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <dt className="text-stone-500">نام و نام خانوادگی</dt>
                      <dd className="font-medium text-stone-800" data-account-name>
                        {profile?.name ?? "—"}
                      </dd>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <dt className="text-stone-500">شماره تماس</dt>
                      <dd
                        className="font-medium text-stone-800"
                        dir="ltr"
                        data-account-phone
                      >
                        {profile?.phone ? toLatinDigits(profile.phone) : "—"}
                      </dd>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <dt className="text-stone-500">ایمیل</dt>
                      <dd className="font-medium text-stone-800" dir="ltr" data-account-email>
                        {profile?.email ?? user?.email ?? "—"}
                      </dd>
                    </div>
                    {profile?.createdAt ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <dt className="text-stone-500">تاریخ عضویت</dt>
                        <dd className="text-stone-700">
                          {formatJalaliDate(profile.createdAt) ?? "—"}
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  {saved ? (
                    <p
                      className="mt-4 text-sm font-medium text-accent-800"
                      data-account-saved="true"
                      aria-live="polite"
                    >
                      اطلاعات حساب ذخیره شد.
                    </p>
                  ) : null}

                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSaved(false);
                        setEditing(true);
                      }}
                      data-account-edit
                    >
                      ویرایش اطلاعات
                    </Button>
                    <Link
                      to={"/account/orders" as LinkProps["to"]}
                      className="inline-flex items-center rounded-pill px-4 py-2.5 text-sm font-medium text-accent-800 transition-colors hover:bg-accent-700/10"
                    >
                      مشاهده سفارش‌های من
                    </Link>
                  </div>
                </>
              ) : (
                <div className="mt-5">
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
                        className={errors.name ? "border-red-400" : ""}
                      />
                    </AccountField>

                    <AccountField id="phone" label="شماره تماس" error={errors.phone}>
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

                    <AccountField
                      id="email"
                      label="ایمیل"
                      error={errors.email}
                      hint="تغییر ایمیل ممکن است نیاز به تأیید از صندوق ایمیل داشته باشد."
                    >
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
                        className={`text-start ${errors.email ? "border-red-400" : ""}`}
                      />
                    </AccountField>
                  </div>

                  <p
                    role="alert"
                    aria-live="polite"
                    data-account-error={formError ? "true" : "false"}
                    className={`mt-4 text-sm font-medium text-red-600 ${formError ? "" : "hidden"}`}
                  >
                    {formError ?? ""}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button
                      onClick={save}
                      disabled={busy}
                      data-account-save
                      data-busy={busy ? "true" : "false"}
                    >
                      {busy ? "در حال ذخیره…" : "ذخیره تغییرات"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setEditing(false);
                        setErrors({});
                        setFormError(null);
                      }}
                      data-account-cancel
                    >
                      انصراف
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            <p className="mt-6 text-xs text-stone-400">
              رمز عبور و ایمیل حساب توسط سرویس احراز هویت مدیریت می‌شود؛ اطلاعات پروفایل در
              دیتابیس فروشگاه نگه داشته می‌شود و فقط برای خود شما قابل مشاهده است.
            </p>
          </>
        )}
      </Container>
    </section>
  );
}
