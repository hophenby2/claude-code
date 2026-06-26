export type FeedbackSurveyType = string
export type FeedbackSurveyResponse = any

export function getFeedbackSurveyType(..._args: unknown[]): FeedbackSurveyType {
  return 'feedback'
}

export function shouldShowFeedbackSurvey(..._args: unknown[]): boolean {
  return false
}
