import { useState, type FormEvent } from 'react'
import { Crosshair } from 'lucide-react'
import { Label } from '../components/ui'

export function Login({ onSignIn }: { onSignIn: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSignIn(email.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-10 px-5 py-10">
      <div>
        <Crosshair className="size-12 text-chlorophyll" aria-hidden="true" />
        <h1 className="condensed mt-4 font-display text-[5.5rem] font-black uppercase leading-[0.82]">
          Agri<span className="text-chlorophyll">bot</span>
        </h1>
        <p className="mt-3 font-mono text-sm uppercase tracking-widest text-stalk">Field console · tomato leaf diagnostics</p>
      </div>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <label className="block">
          <Label>Email</Label>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 h-12 w-full border-2 border-furrow bg-bed px-3 text-base text-bone focus:border-chlorophyll focus:outline-none"
          />
        </label>
        <label className="block">
          <Label>Password</Label>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 h-12 w-full border-2 border-furrow bg-bed px-3 text-base text-bone focus:border-chlorophyll focus:outline-none"
          />
        </label>
        {error && (
          <p role="alert" className="border-2 border-rust px-3 py-2 text-sm text-rust">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !email || !password}
          className="condensed h-14 w-full cursor-pointer border-2 border-chlorophyll bg-chlorophyll font-display text-3xl font-black uppercase text-soil transition-transform duration-150 active:translate-y-[2px] disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-xs text-stalk">Accounts are created in Supabase by the owner. There is no public sign-up.</p>
      </form>
    </main>
  )
}
