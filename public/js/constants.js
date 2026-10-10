// Static business configuration. Locations & providers are seeded once into
// Firestore on first run (see seed.js) and are editable afterwards from the
// Locations / Providers views — these arrays are only the initial seed data.

export const CHARGER_WATTAGES = [48, 60, 72];
export const WATTAGES = CHARGER_WATTAGES; // alias for charger wattages

export const CHARGER_TYPES = ['Lead Charger', 'Lithium Ion Charger'];
export const DEFAULT_CHARGER_TYPE = 'Lead Charger'; // chargers added before types existed are Lead chargers
export const chargerTypeOf = (u) => u?.chargerType || DEFAULT_CHARGER_TYPE;

export const BATTERY_TYPES = ['Lead Battery', 'Lithium Battery'];
export const BATTERY_UNIT_WATTAGE = 12; // Each battery is of 12W

export const BATTERY_COUNTS = [4, 5, 6, 8];

export const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Finance / Loan'];

export const EXPENSE_CATEGORIES = [
  'Shop Rent',
  'Electricity & Utilities',
  'Staff Salaries & Wages',
  'Staff Food & Refreshments',
  'Logistics & Transport',
  'Shop Maintenance & Repairs',
  'Advertising & Marketing',
  'Office & Cleaning Supplies',
  'Customer Hospitality / Tea',
  'Government Fees & Taxes',
  'Misc / Other'
];

export const EXPENSE_PAYMENT_METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque'];

export const SPARE_PART_CATEGORIES = [
  'Brakes', 'Tyres & Tubes', 'Electricals', 'Body Parts', 'Motor & Controller',
  'Suspension', 'Lights & Indicators', 'Fasteners', 'Other'
];

export const DEFAULT_BRAND_MODELS = {
  mac: [
    'WARRIOR',
    'SPARK',
    'IMPACT'
  ],
  goeen: [
    'CHALO NEO',
    'CHALO SMART PRO',
    'CHALO SMART PLUS',
    'CHALO SMART ECO FBG',
    'CHALO 100',
    'NJA7',
    'NJA8',
    'CHALO WAVE',
    'GO-2',
    'CHALO 1000 V2N',
    'CHALO NEU'
  ],
  vedmotors: [
    'SUNNY',
    'NAMO',
    'LIAM',
    'CUTE',
    'RUSH',
    'SMILE'
  ],
  ekotejas: [
    'ASTRA',
    'JATAYU',
    'PRIVE MINI',
    'LEO',
    'SHERO NEO',
    'SHERO',
    'PRIVE',
    'AXEL PRO',
    'EVXTRO',
    'AXEL',
    'MAX',
    'RUGD 13',
    'RUGD 100',
    'RUGD 120',
    'RUGD 121',
    'RUGD 122',
    'RUGD 123',
    'RUGD 124',
    'RUGD 150',
    'RUGD 151',
    'RUGD 152'
  ],
  zelio: [
    'EEVA ECO',
    'EEVA',
    'EEVA ECO ZX',
    'EEVA ZX+',
    'EEVA ECO LX',
    'LITTLE GRACY',
    'GRACY I',
    'GRACY+',
    'GRACY PRO',
    'GRACY',
    'XMEN+',
    'XMEN 2.0',
    'MYSTERY',
    'LEGENDER +',
    'LEGENDER+ PREMIUM',
    'LOGIX',
    'LOGIX LOADER',
    'TANGA'
  ]
};

export const SEED_PROVIDERS = [
  { id: 'zelio', name: 'Zelio', models: DEFAULT_BRAND_MODELS.zelio },
  { id: 'ekotejas', name: 'EKO Tejas', models: DEFAULT_BRAND_MODELS.ekotejas },
  { id: 'mac', name: 'MAC', models: DEFAULT_BRAND_MODELS.mac },
  { id: 'goeen', name: 'Goeen', models: DEFAULT_BRAND_MODELS.goeen },
  { id: 'vedmotors', name: 'VED Motors', models: DEFAULT_BRAND_MODELS.vedmotors }
];

export const SEED_LOCATIONS = [
  { id: 'jadcherla', name: 'Jadcherla', address: 'Jadcherla', brandIds: ['zelio', 'ekotejas'] },
  { id: 'mahabubnagar', name: 'Mahabubnagar', address: 'Mahabubnagar', brandIds: ['zelio', 'ekotejas'] },
  { id: 'mac-padmavathi', name: 'MAC Showroom', address: 'Padmavathi Colony', brandIds: ['mac'] },
  { id: 'goeen-bhageeratha', name: 'Goeen Showroom', address: 'Bhageeratha Colony', brandIds: ['goeen'] },
  { id: 'ved-bhageeratha', name: 'VED Motors Showroom', address: 'Bhageeratha Colony', brandIds: ['vedmotors'] }
];

export const MAIN_LOCATION_ID = 'jadcherla'; // where spare parts are centrally held

export const LOW_STOCK_THRESHOLDS = {
  battery: 3,   // per wattage per location
  charger: 3,   // per wattage per location
  ev: 2         // per brand per location
};

export const STATUS = {
  IN_STOCK: 'in-stock',
  SOLD: 'sold',
  TRANSFERRED: 'transferred'
};

export const CURRENCY = '₹';
