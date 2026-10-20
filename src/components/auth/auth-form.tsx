"use client";

import { useActionState, useEffect } from "react";
import { notify } from "@/components/ui/notification-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/features/profile/actions";

type AuthFormProps = {
  title: string;
  description: string;
  action: (formData: FormData) => Promise<ActionResult>;
  isSignUp?: boolean;
};

const initialState: ActionResult = { success: false };

export function AuthForm({ title, description, action, isSignUp = false }: AuthFormProps) {
  const [state, formAction] = useActionState(
    async (_state: ActionResult, formData: FormData) => action(formData),
    initialState,
  );

  useEffect(() => {
    if (!state.message) return;

    if (state.success) {
      notify.success(state.message);
      return;
    }

    notify.error(state.message);
  }, [state.message, state.success]);

  return (
    <form action={formAction} className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          required
        />
      </div>

      {isSignUp ? (
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>
      ) : null}

      <SubmitButton
        type="submit"
        className="w-full"
        pendingText={isSignUp ? "Creating..." : "Signing in..."}
      >
        {isSignUp ? "Create account" : "Sign in"}
      </SubmitButton>
    </form>
  );
}
