"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpAction, type FormState } from "@/lib/actions/auth-actions";
import { Button, Input, Label } from "@/components/ui";

export default function SignUpPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    signUpAction,
    {},
  );
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-brand-700">Augmentic</h1>
          <p className="mt-2 text-sm text-slate-500">
            Hire AI employees for repetitive business work
          </p>
        </div>
        <form
          action={action}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <Label>Your name</Label>
            <Input name="name" required autoComplete="name" />
          </div>
          <div>
            <Label>Email</Label>
            <Input name="email" type="email" required autoComplete="email" />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <Button type="submit" disabled={pending} className="w-full justify-center">
            {pending ? "Creating account…" : "Create account"}
          </Button>
          <p className="text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link href="/sign-in" className="font-medium text-brand-600 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
