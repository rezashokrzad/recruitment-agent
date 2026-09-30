import { LoginForm } from "./login-form";

/** Admin login. `?next=` holds the page to return to after signing in. */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  // Only allow same-site relative paths (no "//evil.com" open redirects).
  const target = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/admin";

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h1 className="text-lg font-bold">ورود به پنل مدیریت</h1>
        <p className="mt-1 text-sm text-muted">برای مشاهده متقاضیان، رمز عبور مدیر را وارد کنید.</p>
        <LoginForm next={target} />
      </div>
    </main>
  );
}
