import { LanguageProvider, useLanguage } from './i18n'
import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import BeachMap from './BeachMap'
import GoogleLogin from './GoogleLogin'
import EmailLogin from './EmailLogin'
import { beachLocations } from './beaches'
import ReferralTracker from './ReferralTracker'
import './App.css'
import { Analytics } from "@vercel/analytics/next"

type Status = 'available' | 'full' | 'unknown'
type ReportStatus = 'available' | 'full'
type Freshness = 'recent' | 'old' | 'expired'

type Beach = {
  id: string
  name: string
  sector: string
  status: Status
  updatedAt: string | null
  reportId: number | null
  reporterUsername: string | null
  confirmedAt: string | null
  confirmerUsername: string | null
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

// Photographies Wikimedia Commons : une image distincte pour chaque plage.
// Certaines petites criques utilisent une vue illustrative du littoral voisin.
const BEACH_PHOTOS: Record<string, { file: string; description: string }> = {
  'platja-del-raco': { file: 'Platja de Pals - panoramio.jpg', description: 'Vue du littoral de Pals, secteur du Racó' },
  'illa-roja': { file: 'Illa Roja.jpg', description: 'Illa Roja' },
  'sa-riera': { file: 'Sa Riera beach.JPG', description: 'Sa Riera' },
  'aiguafreda': { file: 'Begur Sa Tuna 01 JMM.JPG', description: 'Littoral de Begur, près d’Aiguafreda' },
  'sa-tuna': { file: 'Platja de sa Tuna 1.JPG', description: 'Sa Tuna' },
  'platja-fonda': { file: 'Platja Fonda de Begur.jpg', description: 'Platja Fonda' },
  'fornells': { file: "Cala d'Aiguablava, Begur.jpg", description: 'Côte de Fornells et Aiguablava' },
  'aiguablava': { file: 'Playa aiguablava 1.jpg', description: 'Aiguablava' },
  'aigua-xelida': { file: 'Platja de Tamariu des del Portilló.jpg', description: 'Littoral de Tamariu, près d’Aigua Xelida' },
  'tamariu': { file: 'Tamariu beach.jpg', description: 'Tamariu' },
  'els-liris': { file: 'Beach in Tamariu 01.jpg', description: 'Plage de Tamariu, secteur Els Liris' },
  'aiguadolca': { file: 'Platja de Tamariu, Aiguadolça.jpg', description: 'Aiguadolça à Tamariu' },
  'cala-pedrosa': { file: "Vista d ' una petita platja.jpeg", description: 'Crique du littoral de Palafrugell' },
  'llafranc': { file: 'Vista de Calella de Palafrugell - panoramio.jpg', description: 'Littoral de Calella et Llafranc' },
  'port-bo': { file: 'Port Bo de Calella de Palafrugell.JPG', description: 'Port Bo' },
  'malaespina': { file: 'Calella de Palafrugell-.jpg', description: 'Calella de Palafrugell, secteur Malaespina' },
  'sant-roc': { file: 'Platja de Sant Roc (Calella de Palafrugell) - 1.jpg', description: 'Sant Roc' },
  'cala-del-golfet': { file: 'Detall camí de ronda Calella de Palafrugell al Golfet - panoramio (1).jpg', description: 'Littoral vers le Golfet' },
}

function commonsFileUrl(file: string): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=960`
}

function commonsPageUrl(file: string): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`
}

const BUS_INFO: Record<string, string> = {
  'sa-riera': "Bus Platges – ligne Sa Riera",
  'sa-tuna': "Bus Platges – ligne Sa Tuna",
  aiguablava: "Bus Platges – ligne Fornells / Aiguablava",
  fornells: "Bus Platges – ligne Fornells / Aiguablava",
}

const initialBeaches: Beach[] = beachLocations.map(
  (beach) => ({
    id: beach.id,
    name: beach.name,
    sector: beach.sector,
    status: 'unknown',
    updatedAt: null,
    reportId: null,
    reporterUsername: null,
    confirmedAt: null,
    confirmerUsername: null,
    bus: BUS_INFO[beach.id] ?? '',
    canReport: REPORTABLE_BEACH_IDS.includes(beach.id),
  })
)

const RECENT_MINUTES = 10
const REFRESH_INTERVAL = 10_000

function statusLabel(status: Status, t: (key: string) => string): string {
  switch (status) {
    case 'available':
      return t("PLACES DISPONIBLES")
    case 'full':
      return t("PARKING COMPLET")
    default:
      return t("INFORMATION INCONNUE")
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
  return 'old'
}

function getDisplayStatus(
  beach: Beach,
  now: number
): Status {
  void now
  return beach.status
}

function formatTime(date: string | null, t: (key: string) => string, locale: string): string {
  if (!date) return t("Aucun signalement enregistré")

  return `${t('Signalé le')} ${new Date(date).toLocaleString(
    locale,
    {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }
  )}`
}

function formatExpiration(date: string, locale: string): string {
  return new Date(date).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function App() {
  const { t, language, setLanguage, locale } = useLanguage()
  const [beaches, setBeaches] =
    useState<Beach[]>(initialBeaches)

  const [selectedBeach, setSelectedBeach] =
    useState<string | null>(null)

  const [activeTab, setActiveTab] =
    useState<'mine' | 'list' | 'map'>('list')

  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [emailLoginOpen, setEmailLoginOpen] = useState(false)
  const [accountReady, setAccountReady] = useState(false)
  const initialTabChosen = useRef(false)
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // Déblocage des plages
  const [userId, setUserId] = useState<string | null>(null)
  const [pointsBalance, setPointsBalance] = useState<number | null>(null)
  const [community, setCommunity] = useState({ username: '', reports: 0, confirmations: 0 })
  const [editingUsername, setEditingUsername] = useState(false)
  const [usernameDraft, setUsernameDraft] = useState('')
  const [savingUsername, setSavingUsername] = useState(false)
  const [confirmingBeachId, setConfirmingBeachId] = useState<string | null>(null)
  const [onSiteAction, setOnSiteAction] = useState<null | { beachId: string; action: 'confirm' | 'report' }>(null)
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
      // Conserver le canal de lecture des statuts déjà utilisé par le site.
      // La nouvelle vue ne contient aucune donnée de statut.
      const [reportsResult, communityResult] = await Promise.all([
        supabase.from('parking_reports')
          .select('id, beach_id, status, created_at')
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase.rpc('community_visible_reports'),
      ])

      if (!isActive) return
      if (reportsResult.error) {
        console.error('Erreur de chargement des signalements :', reportsResult.error.message)
        return
      }
      if (communityResult.error) {
        console.error('Erreur de chargement communautaire :', communityResult.error.message)
      }
      const latestByBeach = new Map<string, { id: number; beach_id: string; status: string; created_at: string }>()
      for (const report of reportsResult.data ?? []) {
        if (!latestByBeach.has(report.beach_id)) latestByBeach.set(report.beach_id, report)
      }
      setBeaches((previous) => previous.map((beach) => {
        const report = latestByBeach.get(beach.id)
        if (!report || (report.status !== 'available' && report.status !== 'full')) return beach
        const communityInfo = communityResult.data?.find(
  (row: { beach_id: string; report_id: number }) =>
    row.beach_id === beach.id && row.report_id === report.id
)
        return {
          ...beach,
          status: report.status as ReportStatus,
          updatedAt: report.created_at,
          reportId: report.id,
          reporterUsername: communityInfo?.reporter_username ?? null,
          confirmedAt: communityInfo?.confirmed_at ?? null,
          confirmerUsername: communityInfo?.confirmer_username ?? null,
        }
      }))
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
      setCommunity({ username: '', reports: 0, confirmations: 0 })
      setUnlocks([])

      if (!nextUserId) {
        setLoadingAccount(false)
        setAccountReady(true)
        return
      }

      setLoadingAccount(true)

      const [profileResult, unlocksResult, communityResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('points_balance, free_beach_unlock_used')
          .eq('id', nextUserId)
          .single(),

        supabase
          .from('beach_unlocks')
          .select('beach_id, expires_at')
          .eq('user_id', nextUserId),
        supabase.rpc('community_my_stats'),
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

      if (!communityResult.error && communityResult.data?.[0]) {
        const stats = communityResult.data[0]
        setCommunity({ username: stats.username ?? '', reports: Number(stats.report_count), confirmations: Number(stats.confirmation_count) })
      }

      setLoadingAccount(false)
      setAccountReady(true)
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
    const [profileResult, unlocksResult, communityResult] = await Promise.all([
      supabase
        .from('profiles')
       .select('points_balance, free_beach_unlock_used')
        .eq('id', currentUserId)
        .single(),

      supabase
        .from('beach_unlocks')
        .select('beach_id, expires_at')
        .eq('user_id', currentUserId),
      supabase.rpc('community_my_stats'),
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

    if (!communityResult.error && communityResult.data?.[0]) {
      const stats = communityResult.data[0]
      setCommunity({ username: stats.username ?? '', reports: Number(stats.report_count), confirmations: Number(stats.confirmation_count) })
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
            t("Vous avez déjà une plage gratuite en cours.")
          )
          return
        }

        setMessage(
          t("Votre découverte gratuite est terminée. Inscrivez-vous pour continuer.")
        )
        return
      }
    } catch {
      setMessage(
        t("Impossible de vérifier votre accès gratuit.")
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

  setActiveTab('mine')
  setMessage(
    t("🎁 Plage débloquée gratuitement pendant 24 heures !")
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
    setMessage(t("Cette plage est déjà débloquée."))
    return
  }

  if (pointsBalance === null) {
    setMessage(t("Solde indisponible. Veuillez réessayer."))
    return
  }

  const isFreeUnlock = !freeBeachUnlockUsed

  if (!isFreeUnlock && pointsBalance < 10) {
    setMessage(
      t("Vous devez avoir au moins 10 points pour débloquer cette plage.")
    )
    return
  }

  // Demander confirmation uniquement pour les déblocages payants.
  if (!isFreeUnlock) {
    const confirmed = window.confirm(
      t("Débloquer cette plage pendant 7 jours pour 10 points ?")
    )

    if (!confirmed) return
  }

  setUnlockingBeachId(beachId)
  setMessage(t("Déblocage en cours…"))

  try {
    // Supabase décide si le déblocage est gratuit ou payant.
    const { error } = await supabase.rpc('unlock_beach', {
      p_beach_id: beachId,
    })

    if (error) {
      console.error('Erreur de déblocage :', error.message)
      setMessage(`${t('Déblocage impossible :')} ${error.message}`)
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
    setActiveTab('mine')

    if (isFreeUnlock) {
      setMessage(
        t("🎁 Votre première plage est offerte pendant 7 jours ! Aucun point utilisé.")
      )
    } else {
      setMessage(
        t("🎉 Plage débloquée pendant 7 jours ! 10 points ont été utilisés.")
      )
    }
  } catch (error) {
    console.error('Erreur inattendue :', error)

    setMessage(
      t("Une erreur est survenue pendant le déblocage.")
    )
  } finally {
    setUnlockingBeachId(null)
  }
}
  // --------------------------------------------------
  // 6. Signaler un parking
  // --------------------------------------------------

  async function saveUsername() {
    if (savingUsername || !userId) return
    setSavingUsername(true)
    const { data, error } = await supabase.rpc('community_set_username', { p_username: usernameDraft })
    setSavingUsername(false)
    if (error) { setMessage(error.message); return }
    setCommunity((previous) => ({ ...previous, username: String(data) }))
    setEditingUsername(false)
    setMessage(t('Pseudonyme enregistré.'))
  }

  async function confirmReport(beach: Beach) {
    if (confirmingBeachId || !beach.reportId) return
    setConfirmingBeachId(beach.id)
    const { data, error } = await supabase.functions.invoke('confirm-parking-report', {
      body: { report_id: beach.reportId },
    })
    setConfirmingBeachId(null)
    if (error || !data?.success) {
      setMessage(t('Impossible de confirmer. Actualisez et réessayez.'))
      return
    }
    setBeaches((previous) => previous.map((item) => item.id === beach.id ? {
      ...item, confirmedAt: new Date().toISOString(),
      confirmerUsername: community.username || null,
    } : item))
    if (userId) await refreshUnlocks(userId)
    setNow(Date.now())
    setMessage(data.points_earned === 2 ? t('Merci ! Confirmation enregistrée (+2 points).') : t('Merci ! Confirmation enregistrée.'))
  }

  function askOnSite(beachId: string, action: 'confirm' | 'report') {
    setOnSiteAction({ beachId, action })
  }

  function acceptOnSite() {
    if (!onSiteAction) return
    const { beachId, action } = onSiteAction
    setOnSiteAction(null)
    if (action === 'report') setSelectedBeach(beachId)
    else {
      const beach = beaches.find((item) => item.id === beachId)
      if (beach) void confirmReport(beach)
    }
  }

  const contributionTotal = community.reports + community.confirmations
  const badge = contributionTotal >= 50 ? 'Ambassadeur' : contributionTotal >= 20 ? 'Éclaireur' : contributionTotal >= 5 ? 'Explorateur' : 'Nouveau'
  const nextBadge = contributionTotal >= 50 ? null : contributionTotal >= 20 ? 'Ambassadeur' : contributionTotal >= 5 ? 'Éclaireur' : 'Explorateur'
  const nextThreshold = contributionTotal >= 20 ? 50 : contributionTotal >= 5 ? 20 : 5

  async function reportStatus(
    beachId: string,
    status: ReportStatus
  ) {
    if (isSubmitting) return

    if (!REPORTABLE_BEACH_IDS.includes(beachId)) {
      setMessage(
        t("Les signalements ne sont pas encore disponibles pour cette plage.")
      )
      return
    }

    setIsSubmitting(true)
    setMessage(t("Enregistrement du signalement..."))

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
          t("Impossible d’enregistrer le signalement. Réessayez dans quelques instants.")
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
                reportId: null,
                reporterUsername: community.username || null,
                confirmedAt: null,
                confirmerUsername: null,
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
        t("Merci ! Votre signalement a été partagé avec les autres visiteurs.")
      )

      window.setTimeout(() => {
        setMessage('')
      }, 4000)
    } catch (error) {
      console.error('Erreur inattendue :', error)

      setMessage(
        t("Une erreur est survenue. Veuillez réessayer.")
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  // --------------------------------------------------
  // 7. Regrouper les plages par secteur
  // --------------------------------------------------

  // Accès actifs : compte Supabase ou découverte gratuite du visiteur.
  const guestAccess = (() => {
    if (userId) return null
    try {
      const raw = localStorage.getItem('begur_guest_unlock')
      if (!raw) return null
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return null
      const value = parsed as { beachId?: unknown; expiresAt?: unknown }
      if (typeof value.beachId !== 'string' || typeof value.expiresAt !== 'number') return null
      return { beachId: value.beachId, expiresAt: value.expiresAt }
    } catch {
      return null
    }
  })()

  function hasAccess(beachId: string): boolean {
    if (userId) {
      return unlocks.some(
        (unlock) => unlock.beach_id === beachId &&
          new Date(unlock.expires_at).getTime() > now
      )
    }
    return guestAccess !== null && guestAccess.beachId === beachId && guestAccess.expiresAt > now
  }

  const unlockedCount = beaches.filter((beach) => hasAccess(beach.id)).length

  // Choisir l'onglet de départ une seule fois, sans interrompre la navigation.
  useEffect(() => {
    if (!accountReady || initialTabChosen.current) return
    initialTabChosen.current = true
    if (unlockedCount > 0) setActiveTab('mine')
  }, [accountReady, unlockedCount])

  // Fermer la fenêtre par la touche Échap.
  useEffect(() => {
    if (!authModalOpen) return
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setAuthModalOpen(false)
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [authModalOpen])

  const visibleBeaches = activeTab === 'mine'
    ? beaches.filter((beach) => hasAccess(beach.id))
    : [...beaches].sort((a, b) => Number(hasAccess(b.id)) - Number(hasAccess(a.id)))

  const visibleSectors = Array.from(new Set(visibleBeaches.map((beach) => beach.sector))).sort(
    (a, b) => Number(visibleBeaches.some((beach) => beach.sector === b && hasAccess(beach.id))) -
      Number(visibleBeaches.some((beach) => beach.sector === a && hasAccess(beach.id)))
  )

  // --------------------------------------------------
  // 8. Affichage
  // --------------------------------------------------

    return (
    <div className="app">
      <ReferralTracker />

      <header className="site-header">
        <div className="header-inner">
          <div className="header-title-row">
            <h1>🏖️ Begur Plages</h1>
            <div className="header-actions"><label className="language-picker"><span aria-hidden="true">🌐</span><select aria-label="Language / Idioma / Llengua" value={language} onChange={(event) => setLanguage(event.target.value as 'fr' | 'en' | 'es' | 'ca')}><option value="fr">FR</option><option value="en">EN</option><option value="es">ES</option><option value="ca">CA</option></select></label><button type="button" className="header-login" onClick={() => setAuthModalOpen(true)}>
              {userId ? t("👤 Mon compte") : t('Connexion')}
            </button></div>
          </div>
          <p>
            {t("Les parkings des plages de Begur, Tamariu, Llafranc et Calella, en un coup d'œil.")}
          </p>
        </div>
      </header>

      <main className="main-content">
        <div className="intro">
          <h2>{t("État des parkings des plages")}</h2>

          <p>
            {t("Consultez les informations disponibles et partagez ce que vous observez sur place.")}
          </p>
        </div>

        {/* Solde discret, sans pavé de déblocage. */}
        {!loadingAccount && userId && (
          <div className="account-balance">
            <span>
              <strong>{t("Votre solde :")}</strong>{' '}
              {pointsBalance === null
                ? t('Indisponible')
                : `${pointsBalance} points`}
            </span>
            <button
              type="button"
              onClick={() => void refreshUnlocks(userId)}
            >
              {t("🔄 Actualiser")}
            </button>
          </div>
        )}

        <nav className="tabs" aria-label="Affichage">
          <button type="button" className={activeTab === 'mine' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('mine')}>
            {t('⭐ Mes plages')}{unlockedCount > 0 ? ` (${unlockedCount})` : ''}
          </button>
          <button
            type="button"
            className={
              activeTab === 'list'
                ? 'tab active'
                : 'tab'
            }
            onClick={() => setActiveTab('list')}
          >
            {t("☰ Liste")}
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
            {t("🗺️ Carte")}
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

        {activeTab !== 'map' ? (
          <div className="beach-list">
            {activeTab === 'mine' && visibleBeaches.length === 0 && (
              <div className="empty-beaches">
                <h3>{t("⭐ Aucune plage débloquée pour le moment")}</h3>
                <p>{t("Découvrez une plage gratuitement depuis la liste générale.")}</p>
                <button type="button" className="report-link" onClick={() => setActiveTab('list')}>
                  {t("☰ Voir toutes les plages")}
                </button>
              </div>
            )}
            {visibleSectors.map((sector) => {
              const sectorBeaches = visibleBeaches.filter(
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
                      beach.confirmedAt ?? beach.updatedAt,
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
                        className="beach-card beach-card--photo"
                        key={beach.id}
                      >
                        <figure className="beach-photo">
                            <img
                              src={commonsFileUrl(BEACH_PHOTOS[beach.id].file)}
                              alt={BEACH_PHOTOS[beach.id].description}
                              loading="lazy"
                            />
                            <figcaption>
                              <a href={commonsPageUrl(BEACH_PHOTOS[beach.id].file)} target="_blank" rel="noopener noreferrer">
                                {t("Photo : Wikimedia Commons · auteur et licence")}
                              </a>
                            </figcaption>
                          </figure>
                        <div className="beach-top">
                          <h3>{beach.name}</h3>

                          <span
  className={`status status-${
    effectiveUnlock ? displayStatus : 'unknown'
  }`}
>
  {effectiveUnlock
    ? statusLabel(displayStatus, t)
    : t("🔒 STATUT CACHÉ")}
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
                                {t("✅ Plage débloquée")}
                              </strong>

                              <p
                                style={{
                                  marginBottom: 0,
                                }}
                              >
                                {t("Accessible jusqu'au")}{' '}
                                {formatExpiration(
                                  effectiveUnlock.expires_at, locale
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
                                {t("🔒 Plage non débloquée")}
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
  ? t("⏳ Déblocage…")
  : freeBeachUnlockUsed
    ? t("🔓 Débloquer — 10 points / 7 jours")
    : t("🎁 Première plage offerte — 7 jours")}
                              </button>

                              {freeBeachUnlockUsed &&
                                pointsBalance !== null &&
                                pointsBalance < 10 && (
                                  <p
                                    style={{
                                      marginBottom: 0,
                                      fontSize: '13px',
                                    }}
                                  >
                                    {t('Il vous manque')}{' '}
                                    {10 - pointsBalance}{' '}
                                    {t('point(s).')}
                                  </p>
                                )}
                                        </>
                          ) : (
                            <div>
                              {guestFreeOfferUsed ? (
                                <p>
                                  {t("🔒 Cette plage est réservée aux membres. Inscrivez-vous gratuitement.")}
                                </p>
                              ) : (
                                <>
                                  <p>
                                    {t("🎁 Découvrez gratuitement une plage pendant 24 heures.")}
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
                                    {t("🎁 Débloquer gratuitement — 24 h")}
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
                                beach.updatedAt, t, locale
                              )}
                            </p>

                            {effectiveUnlock && beach.reportId && (
                              <div className="community-report-details">
                                <span>{t('Signalé par')} {beach.reporterUsername ?? t('Visiteur anonyme')}</span>
                                {beach.confirmedAt && <span>{t('Confirmé le')} {new Date(beach.confirmedAt).toLocaleString(locale)} · {beach.confirmerUsername ?? t('Visiteur anonyme')}</span>}
                              </div>
                            )}

                            {freshness === 'old' && (
                              <p className="updated-at">
                                {t("⚠️ Information ancienne : à confirmer sur place.")}
                              </p>
                            )}

                            {effectiveUnlock &&
                              displayStatus === 'full' &&
                              beach.bus && (
                                <p className="bus-info">
                                  {t('🚌 Alternative :')}{' '}
                                  {t(beach.bus)}
                                </p>
                              )}

                            {effectiveUnlock && beach.reportId && (
                              <div className="community-actions">
                                <button type="button" disabled={Boolean(confirmingBeachId)} onClick={() => askOnSite(beach.id, 'confirm')}>
                                  {confirmingBeachId === beach.id ? t('Confirmation en cours…') : t('👍 Je confirme')}
                                </button>
                                <button type="button" onClick={() => askOnSite(beach.id, 'report')}>
                                  {t('🔄 La situation a changé')}
                                </button>
                              </div>
                            )}
                            {effectiveUnlock && (selectedBeach === beach.id ? (
                              <div className="report-panel">
                                <p>
                                  {t("Que constatez-vous sur place ?")}
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
                                      ? t("⏳ Envoi en cours…")
                                      : t("🟢 Il reste des places")}
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
                                      ? t("⏳ Envoi en cours…")
                                      : t("🔴 Parking complet")}
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
                                  {t("Annuler")}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="report-link"
                                onClick={() =>
                                  askOnSite(beach.id, 'report')
                                }
                              >
                                {t("Signaler l'état de ce parking")}
                              </button>
                            ))}
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
                            {t("🚧 Signalement bientôt disponible pour cette plage.")}
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
            {t("ℹ️ Informations participatives")}
          </strong>

          <p>
            {t("Les informations sont partagées par les visiteurs et peuvent évoluer rapidement. Elles sont données à titre indicatif : vérifiez toujours la situation sur place avant de vous déplacer.")}
          </p>
        </aside>
      </main>

      {onSiteAction && (
        <div className="auth-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOnSiteAction(null) }}>
          <section className="auth-dialog community-presence" role="dialog" aria-modal="true" aria-labelledby="presence-title">
            <h2 id="presence-title">{t('Êtes-vous actuellement sur place ?')}</h2>
            <div className="community-actions">
              <button type="button" onClick={acceptOnSite}>{t('Oui, je suis sur place')}</button>
              <button type="button" onClick={() => { setOnSiteAction(null); setMessage(t('Merci de contribuer uniquement lorsque vous êtes sur place.')) }}>{t('Non, pas actuellement')}</button>
            </div>
          </section>
        </div>
      )}

      {authModalOpen && (
        <div className="auth-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setAuthModalOpen(false)
        }}>
          <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <div className="auth-dialog-heading">
              <span className="auth-brand">BEGUR PLAGES</span>
              <button type="button" className="auth-close" aria-label="Fermer" onClick={() => setAuthModalOpen(false)}>×</button>
            </div>
            <h2 id="auth-title" className="auth-title">
              {userId ? t('Mon compte') : t('Bienvenue sur Begur Plages')}
            </h2>
            {userId ? (
              <div className="auth-account">
                <div className="community-profile">
                  <div className="community-username">
                    <strong>👤 {community.username || '…'}</strong>
                    <button type="button" onClick={() => { setUsernameDraft(community.username); setEditingUsername(!editingUsername) }}>{t('Modifier mon pseudonyme')}</button>
                  </div>
                  {editingUsername && (
                    <div className="community-edit">
                      <input aria-label={t('Mon pseudonyme')} maxLength={20} value={usernameDraft} onChange={(event) => setUsernameDraft(event.target.value)} />
                      <button type="button" disabled={savingUsername} onClick={() => void saveUsername()}>{t('Enregistrer')}</button>
                    </div>
                  )}
                  <p className="community-badge">🏅 {t(badge)}</p>
                  <h3>{t('Mes contributions')} : {contributionTotal}</h3>
                  <p>🟢 {t('Signalements')} : {community.reports}</p>
                  <p>👍 {t('Confirmations')} : {community.confirmations}</p>
                  <p>💰 {t('Mes points')} : {pointsBalance ?? '…'}</p>
                  {nextBadge && <p>🏆 {t('Prochain badge')} : {t(nextBadge)} ({contributionTotal}/{nextThreshold})</p>}
                </div>
                <GoogleLogin />
              </div>
            ) : (
              <>
                <p className="auth-intro">{t("Connectez-vous pour profiter pleinement des plages de la Costa Brava.")}</p>
                <div className="auth-methods">
                  {!emailLoginOpen ? (
                    <>
                      <div className="auth-google"><GoogleLogin /></div>
                      <button type="button" className="auth-email-choice" onClick={() => setEmailLoginOpen(true)}>
                        <span className="auth-method-icon" aria-hidden="true">✉</span>
                        {t("Continuer avec E-mail")}
                      </button>
                      <div className="auth-divider"><span>{t("Autres options")}</span></div>
                      <button type="button" className="auth-unavailable" disabled>
                        <span><span className="auth-method-icon" aria-hidden="true">●</span> {t("Continuer avec Apple")}</span>
                        <small>{t("Bientôt disponible")}</small>
                      </button>
                      <button type="button" className="auth-unavailable" disabled>
                        <span><span className="auth-method-icon" aria-hidden="true">▯</span> {t("Continuer avec un téléphone")}</span>
                        <small>{t("Bientôt disponible")}</small>
                      </button>
                    </>
                  ) : (
                    <div className="auth-email-step">
                      <button type="button" className="auth-back" onClick={() => setEmailLoginOpen(false)}>{t("← Retour aux options")}</button>
                      <EmailLogin />
                    </div>
                  )}
                </div>
                <p className="auth-footer-note">{t("Connexion sécurisée · Aucun mot de passe nécessaire pour l’e-mail")}</p>
              </>
            )}
          </section>
        </div>
      )}

      <footer className="site-footer">
        <p>
          {t("Begur Plages — Un petit site pour éviter les trajets inutiles.")}
        </p>
      </footer>
    </div>
  )
}

export default function MultilingualApp() {
  return <LanguageProvider><App /></LanguageProvider>
}