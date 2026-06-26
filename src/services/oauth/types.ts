export type SubscriptionType = string | null
export type RateLimitTier = string | null
export type BillingType = string | null

export type OAuthTokenExchangeResponse = {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope?: string
  token_type?: string
  [key: string]: any
}

export type OAuthProfileResponse = {
  uuid?: string
  email?: string
  organization_uuid?: string
  organization_name?: string
  subscription_type?: SubscriptionType
  subscriptionType?: SubscriptionType
  rate_limit_tier?: RateLimitTier
  rateLimitTier?: RateLimitTier
  billing_type?: BillingType
  billingType?: BillingType
  [key: string]: any
}

export type OAuthTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scopes?: string[]
  subscriptionType?: SubscriptionType
  rateLimitTier?: RateLimitTier
  rawProfile?: OAuthProfileResponse
  [key: string]: any
}

export type UserRolesResponse = {
  roles?: string[]
  [key: string]: any
}

export type ReferrerRewardInfo = {
  amount?: number
  currency?: string
  credit_amount?: number
  credit_currency?: string
  [key: string]: any
}

export type ReferralEligibilityResponse = {
  eligible?: boolean
  referral_code_details?: {
    referral_link?: string
    campaign?: string
    [key: string]: any
  }
  referrer_reward?: ReferrerRewardInfo | null
  [key: string]: any
}

export type ReferralCampaign = any
export type ReferralRedemptionsResponse = {
  redemptions?: unknown[]
  limit?: number
  [key: string]: any
}
