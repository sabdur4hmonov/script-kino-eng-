import { CF_ANALYTICS_TOKEN } from '../config'

export function loadAnalytics(production = import.meta.env.PROD, token = CF_ANALYTICS_TOKEN) {
  if (!production || !token.trim() || document.getElementById('cloudflare-web-analytics')) return
  const script = document.createElement('script')
  script.id = 'cloudflare-web-analytics'
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js'
  script.type = 'module'
  script.referrerPolicy = 'origin'
  script.dataset.cfBeacon = JSON.stringify({ token: token.trim(), spa: false })
  document.head.append(script)
}
