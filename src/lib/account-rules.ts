/**
 * Account form rules (STEP 6) — the Persian validation shared by /login,
 * /register and /account. Kept in one place so the three screens can never
 * disagree about what an acceptable email or password is.
 */

/** Persian/Arabic digits → ASCII, so a phone typed in Persian validates. */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/** Minimum password length. Supabase's own default is 6. */
export const MIN_PASSWORD_LENGTH = 6;

export function isEmailValid(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Phone is optional everywhere, but must be plausible when filled. */
export function isPhoneValid(value: string): boolean {
  const digits = toLatinDigits(value).replace(/[^0-9]/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

export interface CredentialsErrors {
  email?: string;
  password?: string;
}

/** Email + password rules for /login. */
export function validateCredentials(email: string, password: string): CredentialsErrors {
  const errors: CredentialsErrors = {};
  if (email.trim() === "") errors.email = "ایمیل را وارد کنید";
  else if (!isEmailValid(email)) errors.email = "ایمیل معتبر نیست";
  if (password === "") errors.password = "گذرواژه را وارد کنید";
  return errors;
}

export interface RegisterErrors extends CredentialsErrors {
  name?: string;
  phone?: string;
}

/** Email + password + name (+ optional phone) rules for /register. */
export function validateRegistration(
  name: string,
  email: string,
  password: string,
  phone: string
): RegisterErrors {
  const errors: RegisterErrors = validateCredentials(email, password);
  if (name.trim() === "") errors.name = "نام خود را وارد کنید";
  if (phone.trim() !== "" && !isPhoneValid(phone)) errors.phone = "شماره تماس معتبر نیست";
  if (password !== "" && password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `گذرواژه باید حداقل ${MIN_PASSWORD_LENGTH} نویسه باشد`;
  }
  return errors;
}
