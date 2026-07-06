"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAction, type FormState } from "@/lib/actions/auth-actions";
import { Button, Input, Label } from "@/components/ui";

export default function SignInPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    signInAction,
    {},
  );
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-brand-700">Augmentic</h1>
          <p className="mt-2 text-sm text-slate-500">
            The AI Workforce OS for your business
          </p>
        </div>
        <form
          action={action}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <Label>Email</Label>
            <Input name="email" type="email" required autoComplete="email" />
          </div>
          <div>
            <Label>Password</Label>
            <Input name="password" type="password" required autoComplete="current-password" />
          </div>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <Button type="submit" disabled={pending} className="w-full justify-center">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-center text-sm text-slate-500">
            New here?{" "}
            <Link href="/sign-up" className="font-medium text-brand-600 hover:underline">
              Create an account
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
