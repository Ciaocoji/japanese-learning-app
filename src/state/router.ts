import { useSyncExternalStore } from 'react'

export type Route = 'home' | 'learn' | 'levels' | 'review' | 'progress' | 'settings' | 'session'

const ROUTES: Route[] = ['home', 'learn', 'levels', 'review', 'progress', 'settings', 'session']

// Plain "#name" hashes (no "#/path"), and "settings" is exposed as "prefs" in the URL.
const toHash = (r: Route) => (r === 'home' ? '' : r === 'settings' ? 'prefs' : r)

function parse(): Route {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace(/^#\/?/, '').split('?')[0]
  if (h === 'prefs' || h === 'settings') return 'settings'
  return (ROUTES as string[]).includes(h) ? (h as Route) : 'home'
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, parse, () => 'home' as Route)
}

export function navigate(route: Route) {
  const target = `#${toHash(route)}`
  if (location.hash !== target && !(target === '#' && location.hash === '')) location.hash = target
  window.scrollTo({ top: 0 })
}
