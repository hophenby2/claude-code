import type { ReactNode } from 'react'

export type WizardContextValue<T = any> = {
  data: T
  setData: (data: T | ((previous: T) => T)) => void
  updateData: (patch: Partial<T>) => void
  updateWizardData: (patch: Partial<T>) => void
  currentStep: number
  currentStepIndex: number
  step: number
  goNext: () => void
  goBack: () => void
  nextStep: () => void
  previousStep: () => void
  setStep: (step: number) => void
  [key: string]: unknown
}

export type WizardStepComponent<T = any> = (props: { wizardData: T; updateWizardData: (patch: Partial<T>) => void; [key: string]: any }) => ReactNode

export type WizardProviderProps<T = Record<string, unknown>> = {
  children: ReactNode
  initialData?: T
  steps?: unknown[]
  onComplete?: (data: T) => void
  [key: string]: unknown
}
