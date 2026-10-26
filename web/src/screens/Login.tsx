import { useState, type FormEvent } from 'react'
import { Sprout } from 'lucide-react'
import { Label } from '../components/ui'
import { Sprig } from '../components/verdeo'

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
      <div className="relative mx-auto max-w-md overflow-hidden px-6 pb-8 pt-14">
        <Sprig className="absolute -right-4 top-6 h-44" />
        <span className="grid size-14 place-items-center rounded-full text-moss ring-1 ring-moss/50">
          <Sprout className="size-7" aria-hidden="true" />
        </span>
        <h1 className="display mt-5 text-6xl font-semibold leading-[0.95]">AgriBot</h1>
        <p className="display mt-2 text-3xl leading-tight text-loam">
          Your field, <span className="accent">read leaf by leaf.</span>
        </p>
        <p className="mt-3 text-[17px] text-bark">The rover walks the rows, reads every tomato leaf, and writes down what it finds.</p>
      </div>
      <form onSubmit={submit} className="mx-auto max-w-md space-y-4 px-5" noValidate>
        <div className="paper space-y-4 p-5">
          <label className="block">
            <Label>Email</Label>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 h-12 w-full rounded-full border-[1.5px] border-line bg-paper px-5 text-base focus:border-moss focus:outline-none"
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
              className="mt-2 h-12 w-full rounded-full border-[1.5px] border-line bg-paper px-5 text-base focus:border-moss focus:outline-none"
            />
          </label>
          {error && (
            <p role="alert" className="rounded-2xl bg-terracotta/10 px-4 py-2 text-sm font-semibold text-terracotta-ink ring-1 ring-terracotta/40">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy || !email || !password} className="clay h-14 w-full cursor-pointer rounded-full bg-moss text-cream disabled:opacity-50">
            <span className="display text-2xl font-semibold">{busy ? 'Opening the journal…' : 'Sign in'}</span>
          </button>
        </div>
        <p className="px-1 text-[13px] text-bark">Accounts are created in Supabase by the owner. There's no public sign-up.</p>
      </form>
    </main>
  )
}
