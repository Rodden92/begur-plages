import { useEffect } from 'react'
import { supabase } from './supabase'

const REFERRAL_STORAGE_KEY = 'begur_plages_referral_code'
const REFERRAL_TOKEN_KEY = 'begur_plages_referral_token'
const REFERRAL_EXPIRY_KEY = 'begur_plages_referral_expiry'

function clearReferral() {
  localStorage.removeItem(REFERRAL_STORAGE_KEY)
  localStorage.removeItem(REFERRAL_TOKEN_KEY)
  localStorage.removeItem(REFERRAL_EXPIRY_KEY)
}

function getStoredToken(): string | null {
  const token = localStorage.getItem(REFERRAL_TOKEN_KEY)
  const expiry = localStorage.getItem(REFERRAL_EXPIRY_KEY)

  if (!token || !expiry) return null

  const expiryTime = Date.parse(expiry)

  if (
    !Number.isFinite(expiryTime) ||
    expiryTime <= Date.now()
  ) {
    clearReferral()
    return null
  }

  return /^[a-f0-9]{64}$/.test(token) ? token : null
}

export default function ReferralTracker() {
  useEffect(() => {
    let cancelled = false
    let processing = false

    async function claimReferral() {
      if (processing || cancelled) return

      const token = getStoredToken()
      if (!token) return

      processing = true

      try {
        const { data, error } = await supabase.auth.getUser()

        if (cancelled || error || !data.user) return

        const { data: result, error: claimError } =
          await supabase.functions.invoke(
            'claim-referral-signup',
            {
              body: { token },
            }
          )

        if (cancelled) return

        if (claimError) {
          console.error(
            'Erreur de validation du parrainage :',
            claimError
          )
          return
        }

        if (result?.success === true) {
          if (result.rewarded === true) {
            console.info(
              'Parrainage validé : 5 points attribués au parrain.'
            )
          }

          // Supprimer le jeton après une réponse valide,
          // même si le compte n'est pas éligible.
          clearReferral()
        }
      } catch (error) {
        console.error(
          'Erreur inattendue de parrainage :',
          error
        )
      } finally {
        processing = false
      }
    }

    async function prepareReferral() {
      try {
        const { data, error } = await supabase.auth.getSession()

        if (cancelled || error) return

        if (data.session) {
          await claimReferral()
          return
        }

        const params = new URLSearchParams(window.location.search)
        const codeFromUrl = params.get('ref')

        const existingCode = localStorage.getItem(
          REFERRAL_STORAGE_KEY
        )

        const existingToken = getStoredToken()

        if (existingToken) return

        const referralCode = existingCode
          ? existingCode
          : codeFromUrl?.trim().toUpperCase()

        if (
          !referralCode ||
          !/^[A-F0-9]{12}$/.test(referralCode)
        ) {
          return
        }

        const { data: intent, error: intentError } =
          await supabase.functions.invoke(
            'create-referral-intent',
            {
              body: {
                referral_code: referralCode,
              },
            }
          )

        if (cancelled) return

        if (
          intentError ||
          typeof intent?.token !== 'string' ||
          typeof intent?.expires_at !== 'string'
        ) {
          console.error(
            'Impossible de préparer le parrainage :',
            intentError ?? intent
          )
          return
        }

        localStorage.setItem(
          REFERRAL_STORAGE_KEY,
          referralCode
        )

        localStorage.setItem(
          REFERRAL_TOKEN_KEY,
          intent.token
        )

        localStorage.setItem(
          REFERRAL_EXPIRY_KEY,
          intent.expires_at
        )
      } catch (error) {
        console.error(
          'Erreur de préparation du parrainage :',
          error
        )
      }
    }

    void prepareReferral()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (
          event === 'SIGNED_IN' &&
          session &&
          !cancelled
        ) {
          // Laisser Supabase terminer le changement
          // de session avant l'appel réseau.
          setTimeout(() => {
            void claimReferral()
          }, 0)
        }
      }
    )

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  return null
}