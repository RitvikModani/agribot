import { useState, type FormEvent } from 'react'
import { Sprout } from 'lucide-react'
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
    <main className="min-h-dvh">
      <div className="soil-band rounded-b-[2.5rem] px-6 pb-12 pt-16 shadow-[0_5px_0_rgb(51_36_26/0.2)]">
        <div className="mx-auto max-w-md">
          <span className="grid size-14 place-items-center rounded-full bg-sprout text-soil">
            <Sprout className="size-8" aria-hidden="true" />
          </span>
          <h1 className="display mt-5 text-7xl font-bold italic leading-[0.9]">AgriBot</h1>
          <p className="mt-3 text-lg text-cream/80">A field journal for your rover. It walks the rows, reads every tomato leaf, and writes down what it finds.</p>
        </div>
      </div>
      <form onSubmit={submit} className="mx-auto -mt-6 max-w-md space-y-4 px-5" noValidate>
        <div className="paper space-y-4 p-5">
          <label className="block">
            <Label>Email</Label>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 h-12 w-full rounded-xl border-[1.5px] border-line bg-paper px-4 text-base focus:border-moss focus:outline-none"
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
              className="mt-2 h-12 w-full rounded-xl border-[1.5px] border-line bg-paper px-4 text-base focus:border-moss focus:outline-none"
            />
          </label>
          {error && (
            <p role="alert" className="rounded-xl bg-terracotta/10 px-4 py-2 text-sm font-semibold text-terracotta ring-1 ring-terracotta/40">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy || !email || !password} className="clay h-14 w-full cursor-pointer rounded-xl bg-moss text-cream disabled:opacity-50">
            <span className="display text-2xl font-bold">{busy ? 'Opening the journal…' : 'Sign in'}</span>
          </button>
        </div>
        <p className="px-1 text-[13px] text-bark">Accounts are created in Supabase by the owner. There's no public sign-up.</p>
      </form>
    </main>
  )
}
