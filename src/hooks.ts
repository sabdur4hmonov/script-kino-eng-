import { useEffect } from 'react'
export function useVisualViewport() {
  useEffect(() => {
    const viewport = window.visualViewport
    const update = () => {
      document.documentElement.style.setProperty('--viewport-height', `${viewport?.height ?? window.innerHeight}px`)
      document.documentElement.style.setProperty('--keyboard-inset', `${viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0}px`)
      if (viewport && window.innerHeight - viewport.height > 120 && document.activeElement instanceof HTMLTextAreaElement)
        document.activeElement.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    update(); viewport?.addEventListener('resize', update); viewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => { viewport?.removeEventListener('resize', update); viewport?.removeEventListener('scroll', update); window.removeEventListener('resize', update) }
  }, [])
}
