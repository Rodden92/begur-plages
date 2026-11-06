export type ParkingLocation = {
  id: string
  name: string
  position: [number, number]
  beachIds: string[]
}

export const parkingLocations: ParkingLocation[] = [
  {
    id: 'sa-riera-carrer',
    name: 'Sa Riera — Carrer de la Riera',
    position: [41.969045, 3.209856],
    beachIds: ['sa-riera'],
  },
]