export type BeachLocation = {
  id: string
  name: string
  sector: string
  position: [number, number]
}

export const beachLocations: BeachLocation[] = [
  // ==================================
  // BEGUR — NORD
  // ==================================

  {
    id: 'platja-del-raco',
    name: 'Platja del Racó',
    sector: 'Begur',
    position: [41.9804, 3.2077],
  },
  {
    id: 'illa-roja',
    name: 'Illa Roja',
    sector: 'Begur',
    position: [41.9770, 3.21066],
  },
  {
    id: 'sa-riera',
    name: 'Sa Riera',
    sector: 'Begur',
    position: [41.9718, 3.2108],
  },

  // ==================================
  // BEGUR — EST
  // ==================================

  {
    id: 'aiguafreda',
    name: 'Aiguafreda',
    sector: 'Begur',
    position: [41.9638, 3.2265],
  },
  {
    id: 'sa-tuna',
    name: 'Sa Tuna',
    sector: 'Begur',
    position: [41.9607, 3.2303],
  },

  // ==================================
  // BEGUR — SUD
  // ==================================

  {
    id: 'platja-fonda',
    name: 'Platja Fonda',
    sector: 'Begur',
    position: [41.9415, 3.2195],
  },
  {
    id: 'fornells',
    name: 'Fornells',
    sector: 'Begur',
    position: [41.9365, 3.2145],
  },
  {
    id: 'aiguablava',
    name: 'Aiguablava',
    sector: 'Begur',
    position: [41.9335, 3.2167],
  },

  // ==================================
  // PALAFRUGELL — TAMARIU
  // ==================================

  {
    id: 'aigua-xelida',
    name: 'Aigua Xelida',
    sector: 'Tamariu',
    position: [41.9228, 3.2119],
  },
  {
    id: 'tamariu',
    name: 'Tamariu',
    sector: 'Tamariu',
    position: [41.9177, 3.2077],
  },
  {
    id: 'els-liris',
    name: 'Els Liris',
    sector: 'Tamariu',
    position: [41.9167, 3.2088],
  },
  {
    id: 'aiguadolca',
    name: 'Aiguadolça',
    sector: 'Tamariu',
    position: [41.9161, 3.2083],
  },
  {
    id: 'cala-pedrosa',
    name: 'Cala Pedrosa',
    sector: 'Tamariu',
    position: [41.9097, 3.2025],
  },

  // ==================================
  // PALAFRUGELL — LLAFRANC
  // ==================================

  {
    id: 'llafranc',
    name: 'Platja de Llafranc',
    sector: 'Llafranc',
    position: [41.8939, 3.1945],
  },

  // ==================================
  // PALAFRUGELL — CALELLA
  // ==================================

  {
    id: 'port-bo',
    name: 'Port Bo',
    sector: 'Calella de Palafrugell',
    position: [41.8888, 3.1850],
  },
  {
    id: 'malaespina',
    name: 'Port de la Malaespina',
    sector: 'Calella de Palafrugell',
    position: [41.8891, 3.1858],
  },
  {
    id: 'sant-roc',
    name: 'Sant Roc',
    sector: 'Calella de Palafrugell',
    position: [41.8868, 3.1864],
  },
  {
    id: 'cala-del-golfet',
    name: 'Cala del Golfet',
    sector: 'Calella de Palafrugell',
    position: [41.8793, 3.1816],
  },
]