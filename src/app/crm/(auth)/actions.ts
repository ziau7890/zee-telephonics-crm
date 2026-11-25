"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import type { FormState } from "@/lib/form-state";
import {
  activationSchema,
  emailOnlySchema,
  fieldErrors,
  newPasswordSchema,
  otpSchema,
  safeNextPath,
  signInSchema,
} from "@/lib/validation";
import {
  LOCKOUT_WINDOW_MINUTES,
  isAllowedCompanyEmail,
  isLockedOut,
  recordLoginEvent,
  writeAudit,
} from "@/lib/auth/security";

const NOT_CONFIGURED: FormState = {
  error: "Sign-in is not connected yet. An administrator needs to add the Supabase settings (see README).",
};
const GENERIC_SIGN_IN_ERROR = "That email and password combination did not work.";
const DOMAIN_ERROR = "Use your Zee Telephonics company email address.";

/** Checks the profile after a successful sign-in; signs out anyone not allowed in. */
async function finishSignIn(email: string, nextPath: string): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: GENERIC_SIGN_IN_ERROR };

  const { data: profile } = await supabase.from("profiles").select("status").eq("id", user.id).single();
  if (!profile || profile.status === "deactivated") {
    await recordLoginEvent(email, "blocked_inactive", user.id);
    await supabase.auth.signOut();
    return { error: "This account is not active. Please contact your administrator." };
  }
  await recordLoginEvent(email, "success", user.id);
  if (profile.status === "invited") redirect("/crm/activate");
  redirect(nextPath);
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const { email, password } = parsed.data;
  const nextPath = safeNextPath(formData.get("next"));

  if (!isAllowedCompanyEmail(email)) {
    await recordLoginEvent(email, "blocked_domain");
    return { fields: { email: DOMAIN_ERROR } };
  }
  if (await isLockedOut(email)) {
    await recordLoginEvent(email, "locked");
    return {
      error: `Too many failed attempts. Try again in ${LOCKOUT_WINDOW_MINUTES} minutes or reset your password.`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    await recordLoginEvent(email, "failed_password");
    return { error: GENERIC_SIGN_IN_ERROR };
  }
  return finishSignIn(email, nextPath);
}

export async function sendCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = emailOnlySchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const { email } = parsed.data;
  if (!isAllowedCompanyEmail(email)) return { fields: { email: DOMAIN_ERROR } };

  const supabase = await createClient();
  // shouldCreateUser: false keeps accounts invite-only.
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error && error.status === 429) {
    return { error: "Too many codes requested. Please wait a few minutes before trying again." };
  }
  if (!error) await recordLoginEvent(email, "otp_sent");
  // Same response whether or not the account exists, so emails cannot be probed.
  redirect(`/crm/login/code?email=${encodeURIComponent(email)}&next=${encodeURIComponent(safeNextPath(formData.get("next")))}`);
}

export async function verifyCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = otpSchema.safeParse({ email: formData.get("email"), code: formData.get("code") });
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const { email, code } = parsed.data;
  if (await isLockedOut(email)) {
    return { error: `Too many failed attempts. Try again in ${LOCKOUT_WINDOW_MINUTES} minutes.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) {
    await recordLoginEvent(email, "failed_password");
    return { fields: { code: "That code is wrong or has expired. Request a new one." } };
  }
  await recordLoginEvent(email, "otp_verified");
  return finishSignIn(email, safeNextPath(formData.get("next")));
}

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = emailOnlySchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const { email } = parsed.data;

  if (isAllowedCompanyEmail(email)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${publicEnv.siteUrl}/crm/auth/callback?next=/crm/reset-password`,
    });
    if (error && error.status === 429) {
      return { error: "Too many requests. Please wait a few minutes before trying again." };
    }
  }
  return {
    message: "If that address belongs to an active account, a reset link is on its way. It expires in 1 hour.",
  };
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = newPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your reset link has expired. Request a new one." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };

  await supabase.auth.signOut({ scope: "others" });
  await recordLoginEvent(user.email ?? "", "password_reset", user.id);
  await writeAudit({ actorId: user.id, action: "auth.password.reset", entityType: "profile", entityId: user.id });
  redirect("/crm?notice=password-updated");
}

export async function activateAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = activationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your invitation link has expired. Ask your administrator for a new one." };
  if (!isAllowedCompanyEmail(user.email ?? "")) return { error: DOMAIN_ERROR };

  const { data: profile } = await supabase.from("profiles").select("status").eq("id", user.id).single();
  if (profile?.status !== "invited") redirect("/crm");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };

  // Status changes are admin-only under RLS, so activation uses the service role.
  const { error: updateError } = await createAdminClient()
    .from("profiles")
    .update({ status: "active", full_name: parsed.data.fullName, activated_at: new Date().toISOString() })
    .eq("id", user.id)
    .eq("status", "invited");
  if (updateError) return { error: "Could not activate your account. Please try again." };

  await writeAudit({ actorId: user.id, action: "auth.account.activated", entityType: "profile", entityId: user.id });
  redirect("/crm");
}

export async function signOutAction() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await recordLoginEvent(user.email ?? "", "logout", user.id);
    await supabase.auth.signOut();
  }
  redirect("/crm/login");
}
