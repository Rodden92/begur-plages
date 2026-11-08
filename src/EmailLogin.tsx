import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from './supabase'
import { useLanguage } from './i18n'

const REFERRAL_STORAGE_KEY = 'begur_plages_referral_code'

function getStoredReferralCode(): string | null {
  try {
    const storedCode = localStorage.getItem(
      REFERRAL_STORAGE_KEY
    )

    if (!storedCode) return null

    const normalizedCode = storedCode.trim().toUpperCase()

    if (!/^[A-F0-9]{12}$/.test(normalizedCode)) {
      return null
    }

    return normalizedCode
  } catch {
    return null
  }
}

export default function EmailLogin() {
  const { t } = useLanguage()
  const [email, setEmail] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    let active = true

    async function checkSession() {
      const { data } = await supabase.auth.getSession()

      if (active) {
        setIsLoggedIn(Boolean(data.session))
      }
    }

    void checkSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (active) {
          setIsLoggedIn(Boolean(session))
        }
      }
    )

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isSending) return

    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail) {
      setIsError(true)
      setMessage(t("Veuillez saisir votre adresse e-mail."))
      return
    }

    setIsSending(true)
    setIsError(false)
    setMessage(t("Envoi du lien de connexion…"))

    try {
      // Récupérer le code de parrainage mémorisé
      // lorsqu'un visiteur a ouvert un lien ?ref=.
      const referralCode = getStoredReferralCode()

      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: window.location.origin,
          shouldCreateUser: true,

          // Transmettre le code comme métadonnée.
          // Il ne déclenche PAS encore de récompense.
          ...(referralCode
            ? {
                data: {
                  referral_code: referralCode,
                },
              }
            : {}),
        },
      })

      if (error) {
        console.error(
          'Erreur de connexion e-mail :',
          error
        )

        setIsError(true)
        setMessage(
          t("Impossible d'envoyer le lien. Vérifiez votre adresse e-mail et réessayez.")
        )
        return
      }

      setMessage(
        t("📩 Vérifiez votre boîte e-mail. Un lien de connexion vient de vous être envoyé.")
      )
    } catch (error) {
      console.error('Erreur inattendue :', error)

      setIsError(true)
      setMessage(
        t("Une erreur est survenue pendant l'envoi du lien.")
      )
    } finally {
      setIsSending(false)
    }
  }

  // Google et e-mail utilisent la même session Supabase.
  if (isLoggedIn) {
    return null
  }

  return (
    <section
      style={{
        padding: '20px',
        backgroundColor: '#f2f6f5',
        borderRadius: '12px',
        marginBottom: '16px',
      }}
    >
      <h3 style={{ marginTop: 0 }}>
        {t("✉️ Connexion par e-mail")}
      </h3>

      <p>
        {t("Recevez un lien de connexion sécurisé, sans mot de passe.")}
      </p>

      <form onSubmit={handleSubmit}>
        <label
          htmlFor="login-email"
          style={{
            display: 'block',
            marginBottom: '8px',
            fontWeight: 600,
          }}
        >
          {t("Votre adresse e-mail")}
        </label>

        <input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="exemple@email.com"
          disabled={isSending}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '12px',
            marginBottom: '12px',
            borderRadius: '8px',
            border: '1px solid #b9c9c6',
            fontSize: '16px',
          }}
        />

        <button
          type="submit"
          disabled={isSending}
          style={{
            width: '100%',
            padding: '12px',
            border: 'none',
            borderRadius: '8px',
            backgroundColor: '#10535e',
            color: '#ffffff',
            fontSize: '16px',
            fontWeight: 600,
            cursor: isSending ? 'wait' : 'pointer',
            opacity: isSending ? 0.7 : 1,
          }}
        >
          {isSending
            ? t("⏳ Envoi en cours…")
            : t("📩 Recevoir mon lien de connexion")}
        </button>
      </form>

      {message && (
        <p
          role="status"
          style={{
            marginTop: '14px',
            color: isError ? '#a33b32' : '#287c52',
          }}
        >
          {message}
        </p>
      )}
    </section>
  )
}