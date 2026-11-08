import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import BeachMap from './BeachMap'
import GoogleLogin from './GoogleLogin'
import EmailLogin from './EmailLogin'
import { beachLocations } from './beaches'
import ReferralTracker from './ReferralTracker'
import './App.css'

type Status = 'available' | 'full' | 'unknown'
type ReportStatus = 'available' | 'full'
type Freshness = 'recent' | 'old' | 'expired'

type Beach = {
  id: string
  name: string
  sector: string
  status: Status
  updatedAt: string | null
  bus: string
  canReport: boolean
}

type BeachUnlock = {
  beach_id: string
  expires_at: string
}

const REPORTABLE_BEACH_IDS = [
  // BEGUR — NORD
  'platja-del-raco',
  'illa-roja',
  'sa-riera',

  // BEGUR — EST
  'aiguafreda',
  'sa-tuna',

  // BEGUR — SUD
  'platja-fonda',
  'fornells',
  'aiguablava',

  // TAMARIU
  'aigua-xelida',
  'tamariu',
  'els-liris',
  'aiguadolca',
  'cala-pedrosa',

  // LLAFRANC
  'llafranc',

  // CALELLA DE PALAFRUGELL
  'port-bo',
  'malaespina',
  'sant-roc',
  'cala-del-golfet',
]

const BUS_INFO: Record<string, string> = {
  'sa-riera': 'Bus Platges – ligne Sa Riera',
  'sa-tuna': 'Bus Platges – ligne Sa Tuna',
  aiguablava: 'Bus Platges – ligne Fornells / Aiguablava',
  fornells: 'Bus Platges – ligne Fornells / Aiguablava',
}

const initialBeaches: Beach[] = beachLocations.map(
  (beach) => ({
    id: beach.id,
    name: beach.name,
    sector: beach.sector,
    status: 'unknown',
    updatedAt: null,
    bus: BUS_INFO[beach.id] ?? '',
    canReport: REPORTABLE_BEACH_IDS.includes(beach.id),
  })
)

const RECENT_MINUTES = 10
const EXPIRED_MINUTES = 20
const REFRESH_INTERVAL = 10_000

function statusLabel(status: Status): string {
  switch (status) {
    case 'available':
      return 'PLACES DISPONIBLES'
    case 'full':
      return 'PARKING COMPLET'
    default:
      return 'INFORMATION INCONNUE'
  }
}

function getFreshness(
  updatedAt: string | null,
  now: number
): Freshness {
  if (!updatedAt) return 'expired'

  const timestamp = new Date(updatedAt).getTime()

  if (!Number.isFinite(timestamp)) return 'expired'

  const ageMinutes = (now - timestamp) / 60_000

  if (ageMinutes < RECENT_MINUTES) return 'recent'
  if (ageMinutes < EXPIRED_MINUTES) return 'old'

  return 'expired'
}

function getDisplayStatus(
  beach: Beach,
  now: number
): Status {
  if (getFreshness(beach.updatedAt, now) === 'expired') {
    return 'unknown'
  }

  return beach.status
}

function formatTime(date: string | null): string {
  if (!date) return 'Aucun signalement récent'

  return `Signalé le ${new Date(date).toLocaleString(
    'fr-FR',
    {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }
  )}`
}

function formatExpiration(date: string): string {
  return new Date(date).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function App() {
  const [beaches, setBeaches] =
    useState<Beach[]>(initialBeaches)

  const [selectedBeach, setSelectedBeach] =
    useState<string | null>(null)

  const [activeTab, setActiveTab] =
    useState<'list' | 'map'>('list')

  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // Déblocage des plages
  const [userId, setUserId] = useState<string | null>(null)
  const [pointsBalance, setPointsBalance] = useState<number | null>(null)
  const [freeBeachUnlockUsed, setFreeBeachUnlockUsed] = useState(false)
    

  const [unlocks, setUnlocks] = useState<BeachUnlock[]>([])
  const [unlockingBeachId, setUnlockingBeachId] =
    useState<string | null>(null)

  const [loadingAccount, setLoadingAccount] = useState(true)

  // --------------------------------------------------
  // 1. Charger les signalements existants
  // --------------------------------------------------

  useEffect(() => {
    let isActive = true

    async function loadReports() {
      const { data, error } = await supabase
        .from('parking_reports')
        .select('beach_id, status, created_at')
        .order('created_at', { ascending: false })
        .limit(100)

      if (!isActive) return

      if (error) {
        console.error('Erreur Supabase :', error.message)
        return
      }

      setBeaches((previous) =>
        previous.map((beach) => {
          if (!beach.canReport) return beach

          const latestReport = data?.find(
            (report) => report.beach_id === beach.id
          )

          if (!latestReport) return beach

          if (
            latestReport.status !== 'available' &&
            latestReport.status !== 'full'
          ) {
            return beach
          }

          const previousTime = beach.updatedAt
            ? new Date(beach.updatedAt).getTime()
            : 0

          const reportTime = new Date(
            latestReport.created_at
          ).getTime()

          if (reportTime < previousTime) return beach

          return {
            ...beach,
            status: latestReport.status,
            updatedAt: latestReport.created_at,
          }
        })
      )
    }

    void loadReports()

    const refreshTimer = window.setInterval(
      () => void loadReports(),
      REFRESH_INTERVAL
    )

    return () => {
      isActive = false
      window.clearInterval(refreshTimer)
    }
  }, [])

  // --------------------------------------------------
  // 2. Actualiser les durées
  // --------------------------------------------------

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 30_000)

    return () => window.clearInterval(timer)
  }, [])

  // --------------------------------------------------
  // 3. Charger le compte et les déblocages
  // --------------------------------------------------

  useEffect(() => {
    let isActive = true
    let requestNumber = 0

    async function loadAccount(nextUserId: string | null) {
      const currentRequest = ++requestNumber

      if (!isActive) return

      setUserId(nextUserId)
      setPointsBalance(null)
      setUnlocks([])

      if (!nextUserId) {
        setLoadingAccount(false)
        return
      }

      setLoadingAccount(true)

      const [profileResult, unlocksResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('points_balance, free_beach_unlock_used')
          .eq('id', nextUserId)
          .single(),

        supabase
          .from('beach_unlocks')
          .select('beach_id, expires_at')
          .eq('user_id', nextUserId),
      ])

      if (!isActive || currentRequest !== requestNumber) {
        return
      }

      if (profileResult.error) {
        console.error(
          'Erreur de chargement des points :',
          profileResult.error.message
        )
      } else {
        setPointsBalance(profileResult.data.points_balance)
        setFreeBeachUnlockUsed(profileResult.data.free_beach_unlock_used)
      }

      if (unlocksResult.error) {
        console.error(
          'Erreur de chargement des déblocages :',
          unlocksResult.error.message
        )
      } else {
        setUnlocks(unlocksResult.data ?? [])
      }

      setLoadingAccount(false)
    }

    // Détecter la connexion existante.
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!isActive) return

      if (error) {
        console.error(
          'Erreur de vérification du compte :',
          error.message
        )
      }

      void loadAccount(data.user?.id ?? null)
    })

    // Réagir à la connexion et à la déconnexion Google.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // Le chargement est lancé hors du callback
      // pour éviter de bloquer le traitement Auth.
      window.setTimeout(() => {
        if (isActive) {
          void loadAccount(session?.user.id ?? null)
        }
      }, 0)
    })

    return () => {
      isActive = false
      subscription.unsubscribe()
    }
  }, [])

  // --------------------------------------------------
  // 4. Actualiser le solde et les déblocages
  // --------------------------------------------------

  async function refreshUnlocks(currentUserId: string) {
    const [profileResult, unlocksResult] = await Promise.all([
      supabase
        .from('profiles')
       .select('points_balance, free_beach_unlock_used')
        .eq('id', currentUserId)
        .single(),

      supabase
        .from('beach_unlocks')
        .select('beach_id, expires_at')
        .eq('user_id', currentUserId),
    ])

    if (profileResult.error) {
      console.error(
        'Erreur de mise à jour du solde :',
        profileResult.error.message
      )
    } else {
      setPointsBalance(profileResult.data.points_balance)
      setFreeBeachUnlockUsed(profileResult.data.free_beach_unlock_used)
    }

    if (unlocksResult.error) {
      console.error(
        'Erreur de mise à jour des plages :',
        unlocksResult.error.message
      )
    } else {
      setUnlocks(unlocksResult.data ?? [])
    }
  }

  // --------------------------------------------------
  // 5. Débloquer une plage pour 10 points
  // --------------------------------------------------
function unlockGuestBeach(beachId: string) {
  if (userId) return

  const storageKey = 'begur_guest_unlock'

  const existing = localStorage.getItem(storageKey)

  if (existing) {
    try {
      const saved = JSON.parse(existing)

      if (
        typeof saved.beachId === 'string' &&
        typeof saved.expiresAt === 'number'
      ) {
        if (saved.expiresAt > Date.now()) {
          setMessage(
            'Vous avez déjà une plage gratuite en cours.'
          )
          return
        }

        setMessage(
          'Votre découverte gratuite est terminée. Inscrivez-vous pour continuer.'
        )
        return
      }
    } catch {
      setMessage(
        'Impossible de vérifier votre accès gratuit.'
      )
      return
    }
  }

  const expiresAt = Date.now() + 24 * 60 * 60 * 1000

  localStorage.setItem(
    storageKey,
    JSON.stringify({
      beachId,
      expiresAt,
    })
  )

  setNow(Date.now())

  setMessage(
    '🎁 Plage débloquée gratuitement pendant 24 heures !'
  )
}

  async function unlockBeach(beachId: string) {
  if (!userId || unlockingBeachId !== null) return

  const existingUnlock = unlocks.find(
    (unlock) =>
      unlock.beach_id === beachId &&
      new Date(unlock.expires_at).getTime() > Date.now()
  )

  if (existingUnlock) {
    setMessage('Cette plage est déjà débloquée.')
    return
  }

  if (pointsBalance === null) {
    setMessage('Solde indisponible. Veuillez réessayer.')
    return
  }

  const isFreeUnlock = !freeBeachUnlockUsed

  if (!isFreeUnlock && pointsBalance < 10) {
    setMessage(
      'Vous devez avoir au moins 10 points pour débloquer cette plage.'
    )
    return
  }

  // Demander confirmation uniquement pour les déblocages payants.
  if (!isFreeUnlock) {
    const confirmed = window.confirm(
      'Débloquer cette plage pendant 7 jours pour 10 points ?'
    )

    if (!confirmed) return
  }

  setUnlockingBeachId(beachId)
  setMessage('Déblocage en cours…')

  try {
    // Supabase décide si le déblocage est gratuit ou payant.
    const { error } = await supabase.rpc('unlock_beach', {
      p_beach_id: beachId,
    })

    if (error) {
      console.error('Erreur de déblocage :', error.message)
      setMessage(`Déblocage impossible : ${error.message}`)
      return
    }

    // Actualiser les plages débloquées.
    await refreshUnlocks(userId)

    // Relire le profil pour récupérer les valeurs réelles.
    const { data: updatedProfile, error: profileError } =
      await supabase
        .from('profiles')
        .select('points_balance, free_beach_unlock_used')
        .eq('id', userId)
        .single()

    if (profileError) {
      console.error(
        'Erreur actualisation profil :',
        profileError.message
      )
    }

    if (updatedProfile) {
      setPointsBalance(updatedProfile.points_balance)
      setFreeBeachUnlockUsed(
        updatedProfile.free_beach_unlock_used
      )
    }

    setNow(Date.now())

    if (isFreeUnlock) {
      setMessage(
        '🎁 Votre première plage est offerte pendant 7 jours ! Aucun point utilisé.'
      )
    } else {
      setMessage(
        '🎉 Plage débloquée pendant 7 jours ! 10 points ont été utilisés.'
      )
    }
  } catch (error) {
    console.error('Erreur inattendue :', error)

    setMessage(
      'Une erreur est survenue pendant le déblocage.'
    )
  } finally {
    setUnlockingBeachId(null)
  }
}
  // --------------------------------------------------
  // 6. Signaler un parking
  // --------------------------------------------------

  async function reportStatus(
    beachId: string,
    status: ReportStatus
  ) {
    if (isSubmitting) return

    if (!REPORTABLE_BEACH_IDS.includes(beachId)) {
      setMessage(
        'Les signalements ne sont pas encore disponibles pour cette plage.'
      )
      return
    }

    setIsSubmitting(true)
    setMessage('Enregistrement du signalement...')

    try {
      const { error } = await supabase.functions.invoke(
        'submit-parking-report',
        {
          body: {
            beach_id: beachId,
            status,
          },
        }
      )

      if (error) {
        console.error('Erreur de signalement :', error)

        setMessage(
          'Impossible d’enregistrer le signalement. Réessayez dans quelques instants.'
        )

        return
      }

      setBeaches((previous) =>
        previous.map((beach) =>
          beach.id === beachId
            ? {
                ...beach,
                status,
                updatedAt: new Date().toISOString(),
              }
            : beach
        )
      )

      // Actualiser le solde si l'utilisateur est connecté.
      if (userId) {
        await refreshUnlocks(userId)
      }

      setNow(Date.now())
      setSelectedBeach(null)

      setMessage(
        'Merci ! Votre signalement a été partagé avec les autres visiteurs.'
      )

      window.setTimeout(() => {
        setMessage('')
      }, 4000)
    } catch (error) {
      console.error('Erreur inattendue :', error)

      setMessage(
        'Une erreur est survenue. Veuillez réessayer.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  // --------------------------------------------------
  // 7. Regrouper les plages par secteur
  // --------------------------------------------------

  const sectors = Array.from(
    new Set(beaches.map((beach) => beach.sector))
  )

  // --------------------------------------------------
  // 8. Affichage
  // --------------------------------------------------

    return (
    <div className="app">
      <ReferralTracker />

      <header className="site-header">
        <div className="header-inner">
          <h1>🏖️ Begur Plages</h1>
          <p>
            Les parkings des plages de Begur, Tamariu,
            Llafranc et Calella, en un coup d'œil.
          </p>
        </div>
      </header>

      <main className="main-content">
        <div className="intro">
          <h2>État des parkings</h2>

          <p>
            Consultez les informations disponibles
            et partagez ce que vous observez sur place.
          </p>
        </div>

        {/* CONNEXION GOOGLE ET E-MAIL */}
<div
  style={{
    marginBottom: '24px',
  }}
>
  <GoogleLogin />
  <EmailLogin />
</div>

        {/* SOLDE ET INFORMATIONS DE DÉBLOCAGE */}
        <div
          style={{
            padding: '16px',
            marginBottom: '24px',
            borderRadius: '12px',
            backgroundColor: '#eef5f2',
            border: '1px solid #d3e5db',
          }}
        >
          <h3 style={{ marginTop: 0 }}>
            🔓 Déblocage des plages
          </h3>

          {loadingAccount ? (
            <p>Chargement de votre compte…</p>
          ) : userId ? (
            <>
              <p>
                <strong>Votre solde :</strong>{' '}
                {pointsBalance === null
                  ? 'Indisponible'
                  : `${pointsBalance} points`}
              </p>

              <p>
                Débloquez une plage pendant{' '}
                <strong>7 jours pour 10 points</strong>.
              </p>

              <p style={{ fontSize: '13px' }}>
                Le déblocage est enregistré dans votre
                compte Supabase.
              </p>

              <button
                type="button"
                onClick={() => {
                  void refreshUnlocks(userId)
                }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                }}
              >
                🔄 Actualiser mon solde
              </button>
            </>
          ) : (
            <p>
              Connectez-vous avec Google pour utiliser
              vos points et débloquer des plages.
            </p>
          )}
        </div>

        <nav className="tabs" aria-label="Affichage">
          <button
            type="button"
            className={
              activeTab === 'list'
                ? 'tab active'
                : 'tab'
            }
            onClick={() => setActiveTab('list')}
          >
            ☰ Liste
          </button>

          <button
            type="button"
            className={
              activeTab === 'map'
                ? 'tab active'
                : 'tab'
            }
            onClick={() => setActiveTab('map')}
          >
            🗺️ Carte
          </button>
        </nav>

        {message && (
          <div
            className="success-message"
            role="status"
          >
            {message}
          </div>
        )}

        {activeTab === 'list' ? (
          <div className="beach-list">
            {sectors.map((sector) => {
              const sectorBeaches = beaches.filter(
                (beach) => beach.sector === sector
              )

              return (
                <div key={sector}>
                  <h2
                    style={{
                      marginTop: '28px',
                      marginBottom: '16px',
                      color: '#10535e',
                    }}
                  >
                    📍 {sector}
                  </h2>

                  {sectorBeaches.map((beach) => {
                    const freshness = getFreshness(
                      beach.updatedAt,
                      now
                    )

                    const displayStatus = getDisplayStatus(
                      beach,
                      now
                    )

                    const activeUnlock = unlocks.find(
                      (unlock) =>
                        unlock.beach_id === beach.id &&
                        new Date(
                          unlock.expires_at
                        ).getTime() > now
                    )

                    const guestUnlock = (() => {
  if (userId) return null

  try {
    const saved = localStorage.getItem('begur_guest_unlock')
    if (!saved) return null

    const data = JSON.parse(saved)

    if (
      data.beachId === beach.id &&
      typeof data.expiresAt === 'number' &&
      data.expiresAt > now
    ) {
      return {
        beach_id: beach.id,
        expires_at: new Date(data.expiresAt).toISOString(),
      }
    }
  } catch {
    return null
  }

  return null
})()

const effectiveUnlock = activeUnlock ?? guestUnlock
const guestFreeOfferUsed = (() => {
  if (userId) return false

  try {
    const saved = localStorage.getItem('begur_guest_unlock')
    if (!saved) return false

    const data = JSON.parse(saved)

    return (
      typeof data.beachId === 'string' &&
      typeof data.expiresAt === 'number'
    )
  } catch {
    return false
  }
})()

                    const isUnlocking =
                      unlockingBeachId === beach.id

                    return (
                      <section
                        className="beach-card"
                        key={beach.id}
                      >
                        <div className="beach-top">
                          <h3>{beach.name}</h3>

                          <span
  className={`status status-${
    effectiveUnlock ? displayStatus : 'unknown'
  }`}
>
  {effectiveUnlock
    ? statusLabel(displayStatus)
    : '🔒 STATUT RÉSERVÉ'}
</span>
                        </div>

                        {/* DÉBLOCAGE DE LA PLAGE */}
                        <div
                          style={{
                            padding: '12px',
                            marginTop: '12px',
                            marginBottom: '14px',
                            borderRadius: '8px',
                            backgroundColor: effectiveUnlock
                              ? '#e6f4eb'
                              : '#f3f5f5',
                            fontSize: '14px',
                          }}
                        >
                          {effectiveUnlock ? (
                            <>
                              <strong>
                                ✅ Plage débloquée
                              </strong>

                              <p
                                style={{
                                  marginBottom: 0,
                                }}
                              >
                                Accessible jusqu'au{' '}
                                {formatExpiration(
                                  effectiveUnlock.expires_at
                                )}
                              </p>
                            </>
                          ) : userId ? (
                            <>
                              <p
                                style={{
                                  marginTop: 0,
                                }}
                              >
                                🔒 Plage non débloquée
                              </p>

                              <button
                                type="button"
                                disabled={
  isUnlocking ||
  unlockingBeachId !== null ||
  pointsBalance === null ||
  (freeBeachUnlockUsed && pointsBalance < 10)
}
                                onClick={() => {
                                  void unlockBeach(beach.id)
                                }}
                                style={{
                                  padding: '10px 14px',
                                  border: 'none',
                                  borderRadius: '8px',
                                  backgroundColor: '#10535e',
                                  color: '#ffffff',
                                  cursor:
                                    isUnlocking
                                      ? 'wait'
                                      : 'pointer',
                                }}
                              >
                                {isUnlocking
  ? '⏳ Déblocage…'
  : freeBeachUnlockUsed
    ? '🔓 Débloquer — 10 points / 7 jours'
    : '🎁 Première plage offerte — 7 jours'}
                              </button>

                              {pointsBalance !== null &&
                                pointsBalance < 10 && (
                                  <p
                                    style={{
                                      marginBottom: 0,
                                      fontSize: '13px',
                                    }}
                                  >
                                    Il vous manque{' '}
                                    {10 - pointsBalance}{' '}
                                    point(s).
                                  </p>
                                )}
                                        </>
                          ) : (
                            <div>
                              {guestFreeOfferUsed ? (
                                <p>
                                  🔒 Cette plage est réservée aux membres.
                                  Inscrivez-vous gratuitement pour recevoir
                                  30 points de bienvenue et débloquer
                                  d'autres plages.
                                </p>
                              ) : (
                                <>
                                  <p>
                                    🎁 Découvrez gratuitement une plage
                                    pendant 24 heures.
                                  </p>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      unlockGuestBeach(beach.id)
                                    }
                                    style={{
                                      padding: '10px 14px',
                                      border: 'none',
                                      borderRadius: '8px',
                                      backgroundColor: '#10535e',
                                      color: '#ffffff',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    🎁 Débloquer gratuitement — 24 h
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        {/* SIGNALEMENTS EXISTANTS */}
                        {beach.canReport ? (
                          <>
                            <p className="updated-at">
                              {formatTime(
                                beach.updatedAt
                              )}
                            </p>

                            {freshness === 'old' && (
                              <p className="updated-at">
                                ⚠️ Information ancienne :
                                à confirmer sur place.
                              </p>
                            )}

                            {freshness === 'expired' &&
                              beach.updatedAt && (
                                <p className="updated-at">
                                  ⏳ Dernier signalement
                                  trop ancien pour être
                                  fiable.
                                </p>
                              )}

                            {displayStatus === 'full' &&
                              beach.bus && (
                                <p className="bus-info">
                                  🚌 Alternative :{' '}
                                  {beach.bus}
                                </p>
                              )}

                            {selectedBeach === beach.id ? (
                              <div className="report-panel">
                                <p>
                                  Que constatez-vous
                                  sur place ?
                                </p>

                                <div className="report-buttons">
                                  <button
                                    type="button"
                                    className="report-available"
                                    disabled={isSubmitting}
                                    onClick={() =>
                                      void reportStatus(
                                        beach.id,
                                        'available'
                                      )
                                    }
                                  >
                                    {isSubmitting
                                      ? '⏳ Envoi en cours…'
                                      : '🟢 Il reste des places'}
                                  </button>

                                  <button
                                    type="button"
                                    className="report-full"
                                    disabled={isSubmitting}
                                    onClick={() =>
                                      void reportStatus(
                                        beach.id,
                                        'full'
                                      )
                                    }
                                  >
                                    {isSubmitting
                                      ? '⏳ Envoi en cours…'
                                      : '🔴 Parking complet'}
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  className="cancel-button"
                                  disabled={isSubmitting}
                                  onClick={() =>
                                    setSelectedBeach(null)
                                  }
                                >
                                  Annuler
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="report-link"
                                onClick={() =>
                                  setSelectedBeach(beach.id)
                                }
                              >
                                Signaler l'état
                                de ce parking
                              </button>
                            )}
                          </>
                        ) : (
                          <div
                            style={{
                              marginTop: '12px',
                              padding: '12px',
                              borderRadius: '8px',
                              backgroundColor: '#f2f6f5',
                              color: '#52615f',
                              fontSize: '14px',
                            }}
                          >
                            🚧 Signalement bientôt
                            disponible pour cette plage.
                          </div>
                        )}
                      </section>
                    )
                  })}
                </div>
              )
            })}
          </div>
        ) : (
          <BeachMap
  beaches={beaches.map((beach) => {
    const activeUnlock = unlocks.some(
      (unlock) =>
        unlock.beach_id === beach.id &&
        new Date(unlock.expires_at).getTime() > now
    )

    let guestUnlocked = false

    if (!userId) {
      try {
        const saved = localStorage.getItem('begur_guest_unlock')

        if (saved) {
          const data = JSON.parse(saved)

          guestUnlocked =
            data.beachId === beach.id &&
            typeof data.expiresAt === 'number' &&
            data.expiresAt > now
        }
      } catch {
        guestUnlocked = false
      }
    }

    if (activeUnlock || guestUnlocked) {
      return beach
    }

    return {
      ...beach,
      status: 'unknown' as const,
      updatedAt: null,
    }
  })}
  now={now}
/>
        )}

        <aside className="notice">
          <strong>
            ℹ️ Informations participatives
          </strong>

          <p>
            Les informations sont partagées par les
            visiteurs et peuvent évoluer rapidement.
            Elles sont données à titre indicatif :
            vérifiez toujours la situation sur place
            avant de vous déplacer.
          </p>
        </aside>
      </main>

      <footer className="site-footer">
        <p>
          Begur Plages — Un petit site pour éviter
          les trajets inutiles.
        </p>
      </footer>
    </div>
  )
}

export default App