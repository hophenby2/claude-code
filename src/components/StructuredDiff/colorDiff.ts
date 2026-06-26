export type ColorModuleUnavailableReason = 'env' | 'unavailable'

export function getColorModuleUnavailableReason(): ColorModuleUnavailableReason | null {
  return 'unavailable'
}

export function expectColorDiff(): null {
  return null
}

export function expectColorFile(): null {
  return null
}

export function getSyntaxTheme(_themeName: string): null {
  return null
}
