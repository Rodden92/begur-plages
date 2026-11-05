import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import './App.css'

type Status = 'available' | 'full' | 'unknown'
type ReportStatus = 'available' | 'full'
type Freshness = 'recent' | 'old' | 'expired'

type Beach = {
  id: string
  name: string
  status: Status
  updatedAt: string | null
  bus: string
}

const initialBeaches: Beach[] = [
  {
    id: 'sa-riera',
    name: 'Sa Riera',
    status: 'unknown',
    updatedAt: null,
    bus: 'Bus Platges – ligne Sa Riera',
  },
  {
    id: 'sa-tuna',
    name: 'Sa Tuna',
    status: 'unknown',
    updatedAt: null,
    bus: 'Bus Platges – ligne Sa Tuna',
  },
  {
    id: 'aiguablava',
    name: 'Aiguablava',
    status: 'unknown',
    updatedAt: null,
    bus: 'Bus Platges – ligne Fornells / Aiguablava',
  },
  {
    id: 'fornells',
    name: 'Fornells',
    status: 'unknown',
    updatedAt: null,
    bus: 'Bus Platges – ligne Fornells / Aiguablava',
  },
]

const RECENT_MINUTES = 10
const EXPIRED_MINUTES = 20
const REFRESH_INTERVAL = 10_000

function statusLabel(status: Status): string {
  switch (status) {
    case 'available':
      return 'PLACES DISPONIBLES'
    case 'full':
      return 'PARKING COMPLET'
    case 'unknown':
      return 'INFORMATION INCONNUE'
  }
}

function getFreshness(
  updatedAt: string | null,
  now: number
): Freshness {
  if (!updatedAt) {
    return 'expired'
  }

  const timestamp = new Date(updatedAt).getTime()

  if (!Number.isFinite(timestamp)) {
    return 'expired'
  }

  const ageMinutes = (now - timestamp) / 60_000

  if (ageMinutes < RECENT_MINUTES) {
    return 'recent'
  }

  if (ageMinutes < EXPIRED_MINUTES) {
    return 'old'
  }

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
  if (!date) {
    return 'Aucun signalement récent'
  }

  return `Signalé le ${new Date(date).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

function App() {
  const [beaches, setBeaches] = useState<Beach[]>(initialBeaches)
  const [selectedBeach, setSelectedBeach] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'list' | 'map'>('list')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // Charger les signalements et les actualiser automatiquement
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
          const latestReport = data?.find(
            (report) => report.beach_id === beach.id
          )

          if (!latestReport) {
            return beach
          }

          if (
            latestReport.status !== 'available' &&
            latestReport.status !== 'full'
          ) {
            return beach
          }

          // Ne pas remplacer un signalement plus récent
          const previousTime = beach.updatedAt
            ? new Date(beach.updatedAt).getTime()
            : 0

          const reportTime = new Date(
            latestReport.created_at
          ).getTime()

          if (reportTime < previousTime) {
            return beach
          }

          return {
            ...beach,
            status: latestReport.status,
            updatedAt: latestReport.created_at,
          }
        })
      )
    }

    loadReports()

    const refreshTimer = window.setInterval(
      loadReports,
      REFRESH_INTERVAL
    )

    return () => {
      isActive = false
      window.clearInterval(refreshTimer)
    }
  }, [])

  // Actualiser l'ancienneté des signalements
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 30_000)

    return () => window.clearInterval(timer)
  }, [])

  // Enregistrer un signalement dans Supabase
  async function reportStatus(
    beachId: string,
    status: ReportStatus
  ) {
    if (isSubmitting) return

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

  return (
    <div className="app">
      <header className="site-header">
        <div className="header-inner">
          <h1>🏖️ Begur Plages</h1>
          <p>
            Les parkings des plages de Begur, en un coup d'œil.
          </p>
        </div>
      </header>

      <main className="main-content">
        <div className="intro">
          <h2>État des parkings</h2>
          <p>
            Consultez les informations disponibles et partagez
            ce que vous observez sur place.
          </p>
        </div>

        <nav className="tabs" aria-label="Affichage">
          <button
            type="button"
            className={activeTab === 'list' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('list')}
          >
            ☰ Liste
          </button>

          <button
            type="button"
            className={activeTab === 'map' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('map')}
          >
            🗺️ Carte
          </button>
        </nav>

        {message && (
          <div className="success-message" role="status">
            {message}
          </div>
        )}

        {activeTab === 'list' ? (
          <div className="beach-list">
            {beaches.map((beach) => {
              const freshness = getFreshness(
                beach.updatedAt,
                now
              )

              const displayStatus = getDisplayStatus(
                beach,
                now
              )

              return (
                <section
                  className="beach-card"
                  key={beach.id}
                >
                  <div className="beach-top">
                    <h3>{beach.name}</h3>

                    <span
                      className={`status status-${displayStatus}`}
                    >
                      {statusLabel(displayStatus)}
                    </span>
                  </div>

                  <p className="updated-at">
                    {formatTime(beach.updatedAt)}
                  </p>

                  {freshness === 'old' && (
                    <p className="updated-at">
                      ⚠️ Information ancienne : à confirmer
                      sur place.
                    </p>
                  )}

                  {freshness === 'expired' &&
                    beach.updatedAt && (
                      <p className="updated-at">
                        ⏳ Dernier signalement trop ancien
                        pour être fiable.
                      </p>
                    )}

                  {displayStatus === 'full' && (
                    <p className="bus-info">
                      🚌 Alternative : {beach.bus}
                    </p>
                  )}

                  {selectedBeach === beach.id ? (
                    <div className="report-panel">
                      <p>
                        Que constatez-vous sur place ?
                      </p>

                      <div className="report-buttons">
                        <button
                          type="button"
                          className="report-available"
                          disabled={isSubmitting}
                          onClick={() =>
                            reportStatus(
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
                            reportStatus(
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
                      Signaler l'état de ce parking
                    </button>
                  )}
                </section>
              )
            })}
          </div>
        ) : (
          <div className="map-placeholder">
            <h3>🗺️ Carte des plages</h3>
            <p>
              La carte interactive arrivera dans une
              prochaine version.
            </p>

            <button
              type="button"
              onClick={() => setActiveTab('list')}
            >
              ← Retour à la liste
            </button>
          </div>
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