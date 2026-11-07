import { useState } from 'react'
import type { FormEvent } from 'react'

type EmailInvitationsProps = {
  referralCode: string
}

function extractEmails(input: string): string[] {
  const candidates = input
    .split(/[,;\n\r]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)

  return [...new Set(candidates)]
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export default function EmailInvitations({
  referralCode,
}: EmailInvitationsProps) {
  const [emails, setEmails] = useState('')
  const [message, setMessage] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')

    const normalizedCode = referralCode.trim().toUpperCase()

    if (!/^[A-F0-9]{12}$/.test(normalizedCode)) {
      setMessage(
        'Votre code de parrainage est indisponible.'
      )
      return
    }

    const addresses = extractEmails(emails)

    if (addresses.length === 0) {
      setMessage(
        'Veuillez saisir au moins une adresse e-mail.'
      )
      return
    }

    const invalidEmails = addresses.filter(
      (email) => !isValidEmail(email)
    )

    if (invalidEmails.length > 0) {
      setMessage(
        `Adresse(s) invalide(s) : ${invalidEmails.join(', ')}`
      )
      return
    }

    const referralLink =
      `${window.location.origin}/?ref=${encodeURIComponent(
        normalizedCode
      )}`

    const subject = 'Découvre les plages de Begur ! 🏖️'

    const body = [
      'Bonjour !',
      '',
      'Je te propose de découvrir Begur Plages,',
      'une application pour explorer les plages de Begur',
      'et consulter les informations de stationnement.',
      '',
      'Voici mon lien pour rejoindre Begur Plages :',
      referralLink,
      '',
      'Tu recevras 30 points de bienvenue',
      'lors de la création de ton compte.',
      '',
      'À bientôt sur les plages de Begur ! 🌊',
    ].join('\n')

    // Ouvre la messagerie de l'utilisateur.
    // Les destinataires sont placés en Cci
    // pour ne pas divulguer leurs adresses entre eux.
    const mailtoLink =
      `mailto:?bcc=${encodeURIComponent(
        addresses.join(',')
      )}` +
      `&subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`

    window.location.href = mailtoLink

    setMessage(
      `${addresses.length} destinataire(s) préparé(s). ` +
      "Vérifiez votre messagerie et envoyez l'e-mail."
    )
  }

  return (
    <section
      style={{
        marginTop: '20px',
        padding: '20px',
        borderRadius: '12px',
        backgroundColor: '#f2f6f5',
      }}
    >
      <h3 style={{ marginTop: 0 }}>
        ✉️ Inviter plusieurs amis
      </h3>

      <p>
        Saisissez plusieurs adresses e-mail.
        Séparez-les par une virgule, un point-virgule
        ou un retour à la ligne.
      </p>

      <form onSubmit={handleSubmit}>
        <label
          htmlFor="invitation-emails"
          style={{
            display: 'block',
            marginBottom: '8px',
            fontWeight: 600,
          }}
        >
          Adresses e-mail de vos amis
        </label>

        <textarea
          id="invitation-emails"
          value={emails}
          onChange={(event) =>
            setEmails(event.target.value)
          }
          placeholder={
            'ami1@exemple.com\n' +
            'ami2@exemple.com\n' +
            'ami3@exemple.com'
          }
          rows={5}
          required
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #b9c9c6',
            fontSize: '16px',
            resize: 'vertical',
          }}
        />

        <button
          type="submit"
          style={{
            width: '100%',
            marginTop: '12px',
            padding: '12px',
            border: 'none',
            borderRadius: '8px',
            backgroundColor: '#10535e',
            color: '#ffffff',
            fontSize: '16px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          📩 Préparer les invitations
        </button>
      </form>

      {message && (
        <p
          role="status"
          style={{
            marginTop: '14px',
            color: '#10535e',
          }}
        >
          {message}
        </p>
      )}

      <p
        style={{
          marginTop: '14px',
          fontSize: '13px',
          color: '#596b68',
        }}
      >
        Les invitations s'ouvrent dans votre messagerie.
        Aucun e-mail n'est envoyé automatiquement
        et aucun point n'est attribué à cette étape.
      </p>
    </section>
  )
}