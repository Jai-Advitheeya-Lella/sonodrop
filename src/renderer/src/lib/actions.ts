import { pourCurtain } from '@/fluid/curtain'
import { useUi } from '@/stores/ui'
import { themeById } from '@/themes'

/** Switch theme behind a curtain of the new theme's liquid. */
export function changeTheme(id: string): void {
  if (id === useUi.getState().themeId) return
  pourCurtain(themeById(id).accent, () => useUi.getState().patch({ themeId: id }))
}

export function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Late night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}
