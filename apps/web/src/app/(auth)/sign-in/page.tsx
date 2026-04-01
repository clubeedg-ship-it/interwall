'use client';

import { useFormState, useFormStatus } from 'react-dom';

import { signInWithPassword, type SignInFormState } from './actions';

const initialState: SignInFormState = {
    error: null,
};

function SubmitButton(): JSX.Element {
    const { pending } = useFormStatus();

    return (
        <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--accent-amber)] px-5 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={pending}
        >
            {pending ? 'Signing in...' : 'Sign in'}
        </button>
    );
}

export default function SignInPage(): JSX.Element {
    const [state, formAction] = useFormState(signInWithPassword, initialState);

    return (
        <section className="mx-auto flex min-h-[70vh] w-full max-w-5xl items-center justify-center px-6 py-16">
            <div className="grid w-full gap-8 rounded-[2rem] border border-white/10 bg-[var(--surface-panel)] p-8 shadow-[var(--shadow-shell)] lg:grid-cols-[1.1fr,0.9fr]">
                <div className="space-y-6">
                    <p className="text-sm uppercase tracking-[0.32em] text-[var(--accent-amber)]">
                        Secure tenant access
                    </p>
                    <h1 className="font-serif text-4xl text-white sm:text-5xl">
                        Sign in before choosing the organization context.
                    </h1>
                    <p className="max-w-xl text-base leading-8 text-[var(--text-secondary)]">
                        Phase 1 only opens the authentication and organization
                        handoff flow. Inventory and order screens stay behind the
                        validated tenant context.
                    </p>
                </div>

                <form action={formAction} className="space-y-5 rounded-[1.5rem] border border-white/10 bg-black/20 p-6">
                    <div className="space-y-2">
                        <label
                            className="text-sm font-medium text-white"
                            htmlFor="email"
                        >
                            Email
                        </label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            className="min-h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-white outline-none transition focus:border-[var(--accent-teal)]"
                            placeholder="owner@company.com"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label
                            className="text-sm font-medium text-white"
                            htmlFor="password"
                        >
                            Password
                        </label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            className="min-h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-white outline-none transition focus:border-[var(--accent-teal)]"
                            placeholder="Enter your password"
                            required
                        />
                    </div>

                    {state.error ? (
                        <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                            {state.error}
                        </p>
                    ) : null}

                    <SubmitButton />
                </form>
            </div>
        </section>
    );
}
