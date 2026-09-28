import { NavLink, Outlet } from 'react-router-dom'
import { Home, LogOut, SlidersHorizontal, Zap, type LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'

const links: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/metodo', label: 'Il mio metodo', icon: SlidersHorizontal },
]

function signOut() {
  void supabase.auth.signOut()
}

export function AppLayout() {
  return (
    <div className="min-h-dvh">
      {/* Top bar: app name everywhere, navigation only on desktop */}
      <header className="sticky top-0 z-10 border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Zap className="size-6 text-accent" aria-hidden />
            Preventivi
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end
                className={({ isActive }) =>
                  `flex h-12 items-center gap-2 rounded-lg px-4 font-medium ${
                    isActive ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-gray-100'
                  }`
                }
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={signOut}
              className="flex h-12 items-center gap-2 rounded-lg px-4 font-medium text-muted hover:bg-gray-100"
            >
              <LogOut className="size-5" aria-hidden />
              Esci
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-6 pb-28 md:pb-12">
        <Outlet />
      </main>

      {/* Bottom tab bar on phone */}
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="grid grid-cols-3">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                `flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium ${
                  isActive ? 'text-accent' : 'text-muted'
                }`
              }
            >
              <Icon className="size-6" aria-hidden />
              {label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={signOut}
            className="flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium text-muted"
          >
            <LogOut className="size-6" aria-hidden />
            Esci
          </button>
        </div>
      </nav>
    </div>
  )
}
