import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  async function login(formData: FormData) {
    'use server'
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    const supabase = await createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      redirect('/login?error=' + encodeURIComponent(authError.message))
    }

    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="bg-surface border border-hairline rounded-md w-full max-w-md p-10">
        <div className="mb-8">
          <div className="font-serif text-[32px] leading-[1.1] text-ink">
            HOUZS
            <br />
            <span className="italic text-accent">Venture</span>
          </div>
          <p className="text-[11px] text-muted mt-2 tracking-wider">
            INTERNAL LEDGER · 内部账册
          </p>
          <p className="font-serif italic text-graphite text-base mt-6">
            Sign in to continue.
          </p>
        </div>

        {error ? (
          <div className="bg-danger-bg border border-danger text-danger px-4 py-3 rounded-md mb-6 text-sm font-sans">
            {decodeURIComponent(error)}
          </div>
        ) : null}

        <form action={login} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-sans font-medium text-graphite mb-1.5"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
              placeholder="you@venture.my"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-sans font-medium text-graphite mb-1.5"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-accent hover:bg-accent-hover text-white font-serif italic text-base py-2.5 px-4 rounded-md transition-colors mt-2"
          >
            Sign in
          </button>
        </form>

        <p className="text-[11px] text-muted text-center mt-8 font-sans">
          Authorised users only · HOUZS Venture Sdn Bhd
        </p>
      </div>
    </div>
  )
}
