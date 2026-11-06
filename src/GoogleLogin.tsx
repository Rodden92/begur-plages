import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

type ProfilePoints = {
  points_balance: number
  points_earned_total: number
}

export default function GoogleLogin() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [pointsLoading, setPointsLoading] = useState(false)
  const [points, setPoints] = useState<ProfilePoints | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [pointsError, setPointsError] = useState('')

  // Lire les points de l'utilisateur dans Supabase
  async function loadPoints(userId: string) {
    setPointsLoading(true)
    setPointsError('')

    const { data, error } = await supabase
      .from('profiles')
      .select('points_balance, points_earned_total')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Erreur de lecture des points :', error.message)

      setPointsError(
        'Impossible de charger vos points pour le moment.'
      )
    } else {
      setPoints(data)
    }

    setPointsLoading(false)
  }

  // Vérifier la connexion au démarrage
  useEffect(() => {
    let isActive = true

    async function checkSession() {
      const { data, error } = await supabase.auth.getSession()

      if (!isActive) return

      if (error) {
        console.error('Erreur de session :', error.message)
      }

      setSession(data.session)
      setLoading(false)
    }

    checkSession()

    // Suivre les connexions et déconnexions
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!isActive) return

      setSession(newSession)
      setLoading(false)
    })

    return () => {
      isActive = false
      subscription.unsubscribe()
    }
  }, [])

  // Charger les points lorsque l'utilisateur change
  useEffect(() => {
    if (!session?.user.id) {
      setPoints(null)
      setPointsError('')
      return
    }

    const userId = session.user.id

    // Charger les points dès la connexion
    void loadPoints(userId)
  }, [session?.user.id])

  // Connexion avec Google
  async function signInWithGoogle() {
    setLoading(true)
    setErrorMessage('')

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      })

      if (error) {
        console.error('Erreur Google :', error.message)

        setErrorMessage(
          'Impossible de se connecter avec Google. Veuillez réessayer.'
        )

        setLoading(false)
      }
    } catch {
      setErrorMessage(
        'Une erreur est survenue. Veuillez réessayer.'
      )

      setLoading(false)
    }
  }

  // Déconnexion
  async function signOut() {
    setLoading(true)
    setErrorMessage('')

    try {
      const { error } = await supabase.auth.signOut()

      if (error) {
        console.error('Erreur de déconnexion :', error.message)

        setErrorMessage(
          'Impossible de se déconnecter. Veuillez réessayer.'
        )
      }
    } catch {
      setErrorMessage(
        'Une erreur est survenue pendant la déconnexion.'
      )
    } finally {
      setLoading(false)
    }
  }

  // Chargement initial
  if (loading) {
    return (
      <div
        style={{
          padding: '12px',
          textAlign: 'center',
          color: '#10535e',
        }}
      >
        Chargement...
      </div>
    )
  }

  // Utilisateur connecté
  if (session) {
    return (
      <div
        style={{
          backgroundColor: '#fffdf7',
          border: '1px solid #e8d8bc',
          borderRadius: '10px',
          padding: '16px',
        }}
      >
        <p
          style={{
            margin: '0 0 8px',
            color: '#10535e',
            fontSize: '14px',
            fontWeight: 700,
          }}
        >
          ✅ Vous êtes connecté
        </p>

        <p
          style={{
            margin: '0 0 16px',
            color: '#10535e',
            fontSize: '13px',
            overflowWrap: 'anywhere',
          }}
        >
          {session.user.email}
        </p>

        {/* AFFICHAGE DES POINTS */}
        <div
          style={{
            backgroundColor: '#f4f8f3',
            border: '1px solid #d7e7d7',
            borderRadius: '8px',
            padding: '14px',
            marginBottom: '16px',
          }}
        >
          {pointsLoading ? (
            <p
              style={{
                margin: 0,
                color: '#10535e',
                fontSize: '13px',
              }}
            >
              Chargement de vos points...
            </p>
          ) : pointsError ? (
            <div>
              <p
                role="alert"
                style={{
                  color: '#b94339',
                  fontSize: '13px',
                  margin: '0 0 10px',
                }}
              >
                {pointsError}
              </p>

              <button
                type="button"
                onClick={() => void loadPoints(session.user.id)}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e8d8bc',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                }}
              >
                Réessayer
              </button>
            </div>
          ) : points ? (
            <>
              <p
                style={{
                  margin: '0 0 8px',
                  color: '#10535e',
                  fontSize: '18px',
                  fontWeight: 700,
                }}
              >
                🪙 {points.points_balance} points disponibles
              </p>

              <p
                style={{
                  margin: 0,
                  color: '#52716d',
                  fontSize: '13px',
                }}
              >
                ⭐ {points.points_earned_total} points gagnés au total
              </p>
            </>
          ) : (
            <p
              style={{
                margin: 0,
                color: '#10535e',
                fontSize: '13px',
              }}
            >
              Aucun profil trouvé.
            </p>
          )}
        </div>

        {/* ACTUALISATION DES POINTS */}
        <button
          type="button"
          onClick={() => void loadPoints(session.user.id)}
          disabled={pointsLoading}
          style={{
            backgroundColor: '#fffdf7',
            color: '#10535e',
            border: '1px solid #e8d8bc',
            borderRadius: '8px',
            padding: '10px 16px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: pointsLoading ? 'wait' : 'pointer',
            width: '100%',
            marginBottom: '10px',
          }}
        >
          🔄 Actualiser mes points
        </button>

        {/* DÉCONNEXION */}
        <button
          type="button"
          onClick={signOut}
          disabled={loading}
          style={{
            backgroundColor: '#10535e',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            padding: '10px 16px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            width: '100%',
          }}
        >
          Se déconnecter
        </button>

        {errorMessage && (
          <p
            role="alert"
            style={{
              color: '#b94339',
              fontSize: '12px',
              marginTop: '10px',
            }}
          >
            {errorMessage}
          </p>
        )}
      </div>
    )
  }

  // Utilisateur non connecté
  return (
    <div>
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={loading}
        style={{
          backgroundColor: '#fffdf7',
          color: '#10535e',
          border: '1px solid #e8d8bc',
          borderRadius: '8px',
          padding: '12px 18px',
          fontSize: '14px',
          fontWeight: 700,
          cursor: loading ? 'wait' : 'pointer',
          width: '100%',
        }}
      >
        🔵 Continuer avec Google
      </button>

      {errorMessage && (
        <p
          role="alert"
          style={{
            color: '#b94339',
            fontSize: '12px',
            marginTop: '10px',
          }}
        >
          {errorMessage}
        </p>
      )}
    </div>
  )
}