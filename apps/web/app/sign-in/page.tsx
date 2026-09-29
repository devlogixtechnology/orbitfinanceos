import { LockKey } from "@phosphor-icons/react/dist/ssr";

import { signIn } from "./actions";

const errorMessages: Readonly<Record<string, string>> = {
  invalid: "The email address or password is incorrect. Please try again.",
  unavailable: "Sign-in is temporarily unavailable. Please try again shortly.",
};

export default async function SignInPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ error?: string }> }>) {
  const error = (await searchParams).error;
  return (
    <main className="sign-in-page">
      <section className="sign-in-panel">
        <LockKey
          aria-hidden="true"
          color="var(--color-accent)"
          size={24}
          weight="regular"
        />
        <p className="eyebrow">Secure workspace</p>
        <h1>Sign in to OrbitOS</h1>
        <p>
          Use your approved OrbitOS account. Access is scoped to your authorized tenant on the server.
        </p>
        {error !== undefined && errorMessages[error] !== undefined ? (
          <p className="form-error" role="alert">{errorMessages[error]}</p>
        ) : null}
        <form action={signIn} className="auth-form">
          <label htmlFor="email">Email address</label>
          <input autoComplete="username" defaultValue="orbitos@devlogix.com.pk" id="email" name="email" required type="email" />
          <label htmlFor="password">Password</label>
          <input autoComplete="current-password" id="password" minLength={12} name="password" required type="password" />
          <button className="primary-button" type="submit">Sign in</button>
        </form>
      </section>
    </main>
  );
}
