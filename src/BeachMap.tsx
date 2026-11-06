import { useEffect, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from 'react-leaflet'
import { LatLngBounds } from 'leaflet'
import { supabase } from './supabase'
import { beachLocations } from './beaches'
import { parkingLocations } from './parkings'
import 'leaflet/dist/leaflet.css'

type ParkingStatus = 'available' | 'full' | 'unknown'

type BeachReport = {
  id: string
  status: ParkingStatus
  updatedAt: string | null
}

type BeachMapProps = {
  beaches: BeachReport[]
  now: number
}

type ParkingVerification =
  | 'verified'
  | 'to_confirm'
  | 'provisional'

type ParkingRow = {
  id: string
  name: string
  parking_type: string
  latitude: number | null
  longitude: number | null
  estimated_latitude: number | null
  estimated_longitude: number | null
  verification_status: ParkingVerification
  field_check_notes: string | null
}

type BeachParkingRow = {
  beach_id: string
  parking_id: string
}

type MapParking = {
  id: string
  name: string
  position: [number, number]
  beachIds: string[]
  parkingType: string
  verificationStatus: ParkingVerification
  isEstimated: boolean
  fieldCheckNotes: string | null
}

const EXPIRED_MINUTES = 20

// Les signalements sont actuellement disponibles
// uniquement pour ces quatre plages.
const REPORTABLE_BEACH_IDS = [
  'sa-riera',
  'sa-tuna',
  'aiguablava',
  'fornells',
]

// Solution de secours : le parking Sa Riera
// déjà présent dans src/parkings.ts.
const fallbackParkings: MapParking[] = parkingLocations.map(
  (parking) => ({
    id: parking.id,
    name: parking.name,
    position: parking.position,
    beachIds: parking.beachIds,
    parkingType: 'unknown',
    verificationStatus: 'to_confirm',
    isEstimated: false,
    fieldCheckNotes: null,
  })
)

function getParkingStatus(
  parking: MapParking,
  beaches: BeachReport[],
  now: number
): ParkingStatus {
  // Les signalements actuels concernent une plage,
  // et non un parking précis.
  //
  // On ne les affiche donc que si un seul identifiant
  // de plage autorisé correspond à ce parking.
  const reportableBeachIds = parking.beachIds.filter(
    (beachId) => REPORTABLE_BEACH_IDS.includes(beachId)
  )

  if (reportableBeachIds.length !== 1) {
    return 'unknown'
  }

  const beach = beaches.find(
    (item) => item.id === reportableBeachIds[0]
  )

  if (!beach || !beach.updatedAt) {
    return 'unknown'
  }

  const reportTime = new Date(beach.updatedAt).getTime()

  if (!Number.isFinite(reportTime)) {
    return 'unknown'
  }

  const ageMinutes = (now - reportTime) / 60_000

  if (ageMinutes < 0 || ageMinutes >= EXPIRED_MINUTES) {
    return 'unknown'
  }

  return beach.status
}

function getStatusColor(status: ParkingStatus): string {
  if (status === 'available') return '#287c52'
  if (status === 'full') return '#b94339'
  return '#858c8b'
}

function getStatusLabel(status: ParkingStatus): string {
  if (status === 'available') {
    return '🟢 Places disponibles signalées'
  }

  if (status === 'full') {
    return '🔴 Parking signalé complet'
  }

  return '⚪ Disponibilité inconnue'
}

function getParkingTypeLabel(type: string): string {
  switch (type) {
    case 'public':
      return 'Parking public'
    case 'free':
      return 'Stationnement gratuit'
    case 'private_paid':
      return 'Parking privé payant'
    default:
      return 'Type de stationnement à confirmer'
  }
}

function getVerificationLabel(
  parking: MapParking
): string {
  if (parking.isEstimated) {
    return '📍 Position estimée — à vérifier sur place'
  }

  if (parking.verificationStatus === 'verified') {
    return '✅ Emplacement vérifié'
  }

  if (parking.verificationStatus === 'to_confirm') {
    return '🟠 Emplacement à confirmer'
  }

  return '⚪ Emplacement provisoire'
}

function getBeachNames(beachIds: string[]): string {
  const names = beachIds.map((id) => {
    const beach = beachLocations.find(
      (item) => item.id === id
    )

    return beach?.name ?? id
  })

  return names.join(', ')
}

function FitMapBounds({
  parkings,
}: {
  parkings: MapParking[]
}) {
  const map = useMap()

  useEffect(() => {
    const positions: [number, number][] = [
      ...beachLocations.map((beach) => beach.position),
      ...parkings.map((parking) => parking.position),
    ]

    if (positions.length === 0) {
      return
    }

    const bounds = new LatLngBounds(positions)

    map.fitBounds(bounds, {
      padding: [25, 25],
    })
  }, [map, parkings])

  return null
}

export default function BeachMap({
  beaches,
  now,
}: BeachMapProps) {
  const [parkings, setParkings] = useState<MapParking[]>(
    fallbackParkings
  )

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let isActive = true

    async function loadParkings() {
      try {
        // 1. Charger les parkings actifs.
        const { data: parkingData, error: parkingError } =
          await supabase
            .from('parkings')
            .select(
              `
              id,
              name,
              parking_type,
              latitude,
              longitude,
              estimated_latitude,
              estimated_longitude,
              verification_status,
              field_check_notes
              `
            )
            .eq('is_active', true)

        if (parkingError) {
          throw parkingError
        }

        // 2. Charger les associations avec les plages.
        const { data: linkData, error: linkError } =
          await supabase
            .from('beach_parkings')
            .select('beach_id, parking_id')

        if (linkError) {
          throw linkError
        }

        if (!isActive) {
          return
        }

        const rows = (parkingData ?? []) as ParkingRow[]
        const links = (linkData ?? []) as BeachParkingRow[]

        // 3. Transformer les données Supabase
        // en marqueurs utilisables par Leaflet.
        const mappedParkings: MapParking[] = rows
          .map((parking) => {
            const hasActualCoordinates =
              parking.latitude !== null &&
              parking.longitude !== null

            const hasEstimatedCoordinates =
              parking.estimated_latitude !== null &&
              parking.estimated_longitude !== null

            // Priorité aux coordonnées existantes.
            // Sinon, utiliser le point de repérage.
            if (
              !hasActualCoordinates &&
              !hasEstimatedCoordinates
            ) {
              return null
            }

            const latitude = hasActualCoordinates
              ? parking.latitude!
              : parking.estimated_latitude!

            const longitude = hasActualCoordinates
              ? parking.longitude!
              : parking.estimated_longitude!

            const beachIds = links
              .filter(
                (link) => link.parking_id === parking.id
              )
              .map((link) => link.beach_id)

            return {
              id: parking.id,
              name: parking.name,
              position: [latitude, longitude] as [
                number,
                number,
              ],
              beachIds,
              parkingType: parking.parking_type,
              verificationStatus:
                parking.verification_status,
              isEstimated: !hasActualCoordinates,
              fieldCheckNotes: parking.field_check_notes,
            }
          })
          .filter(
            (parking): parking is MapParking =>
              parking !== null
          )

        setParkings(mappedParkings)
        setLoadError(false)
      } catch (error) {
        console.error(
          'Erreur de chargement des parkings :',
          error
        )

        if (isActive) {
          setLoadError(true)
          setParkings(fallbackParkings)
        }
      } finally {
        if (isActive) {
          setLoading(false)
        }
      }
    }

    loadParkings()

    return () => {
      isActive = false
    }
  }, [])

  const mapBounds = new LatLngBounds([
    ...beachLocations.map((beach) => beach.position),
    ...parkings.map((parking) => parking.position),
  ])

  return (
    <div>
      <div
        style={{
          marginBottom: '12px',
          padding: '12px',
          backgroundColor: '#f2f6f5',
          borderRadius: '10px',
          fontSize: '14px',
          lineHeight: 1.6,
        }}
      >
        <strong>🚗 Carte des stationnements</strong>

        <div>
          🟢 Places signalées disponibles · 🔴 Complet
        </div>

        <div>
          🟠 Position à confirmer · ⚪ Point provisoire
        </div>

        <div>
          Les points estimés servent au repérage :
          ils ne correspondent pas nécessairement
          aux entrées des parkings.
        </div>
      </div>

      {loading && (
        <p>Chargement des parkings…</p>
      )}

      {loadError && (
        <p
          role="alert"
          style={{
            color: '#a33b32',
            fontSize: '14px',
          }}
        >
          Impossible de charger les parkings depuis
          Supabase. Affichage du parking local de
          secours.
        </p>
      )}

      {!loading && !loadError && (
        <p style={{ fontSize: '14px' }}>
          <strong>{parkings.length}</strong> emplacement
          {parkings.length > 1 ? 's' : ''} affiché
          {parkings.length > 1 ? 's' : ''}.
        </p>
      )}

      <div
        style={{
          width: '100%',
          height: '480px',
        }}
      >
        <MapContainer
          bounds={mapBounds}
          boundsOptions={{
            padding: [25, 25],
          }}
          scrollWheelZoom={false}
          style={{
            height: '100%',
            width: '100%',
            borderRadius: '12px',
          }}
        >
          <FitMapBounds parkings={parkings} />

          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Marqueurs des 18 plages */}
          {beachLocations.map((beach) => (
            <CircleMarker
              key={`beach-${beach.id}`}
              center={beach.position}
              radius={7}
              pathOptions={{
                color: '#10535e',
                fillColor: '#d97956',
                fillOpacity: 0.9,
                weight: 2,
              }}
            >
              <Popup>
                <div>
                  <strong>🏖️ {beach.name}</strong>
                  <br />
                  📍 {beach.sector}
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {/* Marqueurs des parkings Supabase */}
          {parkings.map((parking) => {
            const status = getParkingStatus(
              parking,
              beaches,
              now
            )

            const isProvisional =
              parking.verificationStatus ===
                'provisional' ||
              parking.isEstimated

            // La couleur intérieure représente
            // la disponibilité lorsqu'elle est connue.
            //
            // Sinon, elle indique le niveau
            // de vérification de l'emplacement.
            const markerColor =
              status !== 'unknown'
                ? getStatusColor(status)
                : isProvisional
                  ? '#e49b36'
                  : '#858c8b'

            return (
              <CircleMarker
                key={`parking-${parking.id}`}
                center={parking.position}
                radius={11}
                pathOptions={{
                  color: '#ffffff',
                  fillColor: markerColor,
                  fillOpacity: 1,
                  weight: 3,
                }}
              >
                <Popup>
                  <div
                    style={{
                      minWidth: '190px',
                      lineHeight: 1.6,
                    }}
                  >
                    <strong>
                      🚗 {parking.name}
                    </strong>

                    <br />
                    <br />

                    <strong>
                      {getVerificationLabel(parking)}
                    </strong>

                    <br />

                    {getParkingTypeLabel(
                      parking.parkingType
                    )}

                    <br />
                    <br />

                    <strong>
                      Plages associées :
                    </strong>

                    <br />

                    {getBeachNames(parking.beachIds) ||
                      'Association à vérifier'}

                    <br />
                    <br />

                    <strong>
                      {getStatusLabel(status)}
                    </strong>

                    <br />

                    <small>
                      Les signalements actuels
                      concernent les plages associées.
                    </small>

                    {parking.fieldCheckNotes && (
                      <>
                        <br />
                        <br />

                        <strong>
                          📝 Vérification terrain :
                        </strong>

                        <br />

                        <small>
                          {parking.fieldCheckNotes}
                        </small>
                      </>
                    )}

                    <br />
                    <br />

                    <small>
                      GPS :{' '}
                      {parking.position[0].toFixed(6)}
                      ,{' '}
                      {parking.position[1].toFixed(6)}
                    </small>

                    {parking.isEstimated && (
                      <>
                        <br />
                        <small>
                          ⚠️ Point de repérage
                          uniquement, pas une
                          entrée confirmée.
                        </small>
                      </>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            )
          })}
        </MapContainer>
      </div>
    </div>
  )
}