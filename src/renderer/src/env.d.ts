import type { SonoBridge } from '@shared/types'

declare global {
  interface Window {
    sono: SonoBridge
  }
}
