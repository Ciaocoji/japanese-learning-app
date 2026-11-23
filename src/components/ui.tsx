import type { ButtonHTMLAttributes, ReactNode } from 'react'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function Card({ children, className, flush = false, ...rest }: { children: ReactNode; className?: string; flush?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900', !flush && 'p-4 sm:p-5', className)} {...rest}>
      {children}
    </div>
  )
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({ variant = 'primary', className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: 'bg-accent-500 text-white hover:bg-accent-600 active:bg-accent-700 disabled:bg-stone-300 dark:disabled:bg-stone-700',
    secondary: 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800',
    ghost: 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  }
  return (
    <button
      type="button"
      className={cx('inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60', styles[variant], className)}
      {...rest}
    >
      {children}
    </button>
  )
}

export function ProgressBar({ value, className, label, tone = 'accent' }: { value: number; className?: string; label?: string; tone?: 'accent' | 'emerald' | 'indigo' }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  const color = { accent: 'bg-accent-500', emerald: 'bg-emerald-500', indigo: 'bg-indigo-500' }[tone]
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800', className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cx('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'warn' | 'accent' | 'good' }) {
  const color = tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : tone === 'accent' ? 'text-accent-600 dark:text-accent-400' : tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : ''
  return (
    <div className="min-w-0">
      <div className={cx('text-2xl font-semibold tabular-nums', color)}>{value}</div>
      <div className="truncate text-xs text-stone-500 dark:text-stone-400">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-stone-400">{hint}</div>}
    </div>
  )
}

/** Japanese text with correct language tagging. */
export function Ja({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span lang="ja" className={className}>
      {children}
    </span>
  )
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300', className)}>{children}</span>
}

export function SectionTitle({ ja, zh, right }: { ja: string; zh?: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-2">
      <h2 className="text-lg font-semibold">
        <Ja>{ja}</Ja>
        {zh && <span className="ml-2 text-sm font-normal text-stone-500">{zh}</span>}
      </h2>
      {right}
    </div>
  )
}

export const pct = (v: number) => `${Math.round(v * 100)}%`
