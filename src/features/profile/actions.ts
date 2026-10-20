"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import {
  authSignInSchema,
  authSignUpSchema,
  onboardingInputSchema,
  onboardingStepSchema,
  reviewStepSchema,
} from "@/features/profile/schemas";
import { upsertFinancialProfile } from "@/features/profile/repository";

export type ActionResult = {
  success: boolean;
  message?: string;
};

function formatError(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "Invalid input";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error";
}

export async function signUpAction(formData: FormData): Promise<ActionResult> {
  try {
    const parsed = authSignUpSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
    });

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signUp({
      email: parsed.email,
      password: parsed.password,
    });

    if (error) {
      return { success: false, message: error.message };
    }

    return { success: true, message: "Account created. Please sign in." };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function signInAction(formData: FormData): Promise<ActionResult> {
  try {
    const parsed = authSignInSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.email,
      password: parsed.password,
    });

    if (error) {
      return { success: false, message: error.message };
    }

    revalidatePath("/dashboard");
    redirect("/dashboard");
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

export type SaveStepInput = {
  step: string;
  payload: Record<string, unknown>;
};

export async function saveOnboardingStepAction(input: SaveStepInput): Promise<ActionResult> {
  try {
    const step = onboardingStepSchema.parse(input.step);
    const payload = onboardingInputSchema.parse(input.payload);

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, message: "You must be signed in" };
    }

    await upsertFinancialProfile(supabase, user, {
      ...payload,
      onboardingStep: step,
      onboardingCompleted: false,
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/onboarding");
    revalidatePath("/dashboard/profile");

    return { success: true, message: "Progress saved" };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

export async function completeOnboardingAction(
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  try {
    reviewStepSchema.parse({ acceptReview: true });
    const parsedPayload = onboardingInputSchema.parse(payload);

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, message: "You must be signed in" };
    }

    await upsertFinancialProfile(supabase, user, {
      ...parsedPayload,
      onboardingStep: "review",
      onboardingCompleted: true,
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/onboarding");
    revalidatePath("/dashboard/profile");

    return { success: true, message: "Onboarding complete" };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
