import { useSyncExternalStore } from 'react'

export type Route = 'home' | 'learn' | 'levels' | 'review' | 'progress' | 'settings' | 'session'

const ROUTES: Route[] = ['home', 'learn', 'levels', 'review', 'progress', 'settings', 'session']

function parse(): Route {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace(/^#\/?/, '').split('?')[0]
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
  const target = route === 'home' ? '#/' : `#/${route}`
  if (location.hash !== target) location.hash = target
  window.scrollTo({ top: 0 })
}
