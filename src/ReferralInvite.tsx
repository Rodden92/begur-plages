import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import EmailInvitations from './EmailInvitations'

type ReferralInviteProps = {
  userId: string
}

const APP_URL = 'https://begur-plages.vercel.app'

export default function ReferralInvite({
  userId,
}: ReferralInviteProps) {
  const [referralCode, setReferralCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadReferralCode() {
      setLoading(true)
      setReferralCode('')
      setError('')

      const { data, error: queryError } = await supabase
        .from('profiles')
        .select('referral_code')
        .eq('id', userId)
        .single()

      if (!active) return

      if (queryError || !data?.referral_code) {
        console.error(
          'Erreur de chargement du parrainage :',
          queryError
        )

        setError(
          'Impossible de charger votre lien de parrainage.'
        )
      } else {
        setReferralCode(data.referral_code)
      }

      setLoading(false)
    }

    void loadReferralCode()

    return () => {
      active = false
    }
  }, [userId])

  const referralLink = referralCode
    ? `${APP_URL}/?ref=${encodeURIComponent(referralCode)}`
    : ''

  const invitationText = referralLink
    ? `🌊 Découvre Begur Plages ! Consulte les plages et les parkings de la Costa Brava. Inscris-toi et reçois 30 points de bienvenue ! 🎁 ${referralLink}`
    : ''

  async function copyReferralLink() {
    if (!referralLink) return

    setMessage('')
    setError('')

    try {
      await navigator.clipboard.writeText(referralLink)

      setMessage('✅ Votre lien a été copié !')
    } catch {
      setError(
        'Impossible de copier automatiquement le lien. Vous pouvez le sélectionner ci-dessous.'
      )
    }
  }

  function inviteBySms() {
    if (!invitationText) return

    const encodedMessage = encodeURIComponent(invitationText)

    // Ouvre l'application SMS du téléphone.
    // Le séparateur ?body= est largement pris en charge.
    window.location.href = `sms:?body=${encodedMessage}`
  }

  async function shareReferralLink() {
    if (!referralLink) return

    setMessage('')
    setError('')

    if (!navigator.share) {
      await copyReferralLink()
      return
    }

    try {
      await navigator.share({
        title: 'Begur Plages',
        text: '🌊 Découvre Begur Plages et reçois 30 points de bienvenue !',
        url: referralLink,
      })
    } catch (shareError) {
      if (
        shareError instanceof DOMException &&
        shareError.name === 'AbortError'
      ) {
        return
      }

      setError(
        'Le partage a échoué. Essayez de copier votre lien.'
      )
    }
  }

  if (loading) {
    return (
      <p style={{ color: '#10535e', fontSize: '13px' }}>
        Chargement de votre lien de parrainage...
      </p>
    )
  }

  return (
    <section
      style={{
        backgroundColor: '#eef7f4',
        border: '1px solid #c8e4da',
        borderRadius: '10px',
        padding: '16px',
        marginTop: '16px',
      }}
    >
      <h3
        style={{
          color: '#10535e',
          margin: '0 0 8px',
          fontSize: '18px',
        }}
      >
        🎁 Invitez vos amis
      </h3>

      <p
        style={{
          color: '#52716d',
          fontSize: '13px',
          lineHeight: 1.5,
          margin: '0 0 14px',
        }}
      >
        Partagez Begur Plages avec vos amis.
        Chaque nouvel inscrit reçoit 30 points de bienvenue !
      </p>

      {error && (
        <p
          role="alert"
          style={{
            color: '#b94339',
            fontSize: '13px',
          }}
        >
          {error}
        </p>
      )}

      {referralLink && (
        <>
          <label
            htmlFor="referral-link"
            style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 700,
              color: '#10535e',
              marginBottom: '8px',
            }}
          >
            🔗 Votre lien personnel
          </label>

          <input
            id="referral-link"
            type="text"
            value={referralLink}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid #c8e4da',
              backgroundColor: '#ffffff',
              color: '#10535e',
              fontSize: '13px',
              marginBottom: '12px',
            }}
          />

          <button
            type="button"
            onClick={() => void copyReferralLink()}
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '10px',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: '#10535e',
              color: '#ffffff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            🔗 Copier mon lien
          </button>

          <button
            type="button"
            onClick={inviteBySms}
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '10px',
              border: '1px solid #10535e',
              borderRadius: '8px',
              backgroundColor: '#ffffff',
              color: '#10535e',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            📱 Inviter par SMS
          </button>

          <button
            type="button"
            onClick={() => void shareReferralLink()}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #c8e4da',
              borderRadius: '8px',
              backgroundColor: '#ffffff',
              color: '#10535e',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            📤 Partager avec mes amis
          </button>

          <EmailInvitations referralCode={referralCode} />

          {message && (
            <p
              role="status"
              style={{
                color: '#287c52',
                fontSize: '13px',
                marginBottom: 0,
              }}
            >
              {message}
            </p>
          )}

          <p
            style={{
              color: '#52716d',
              fontSize: '12px',
              margin: '14px 0 0',
              lineHeight: 1.5,
            }}
          >
            Les récompenses de parrainage seront activées
            lors de la prochaine étape.
          </p>
        </>
      )}
    </section>
  )
}