// Static business configuration. Locations & providers are seeded once into
// Firestore on first run (see seed.js) and are editable afterwards from the
// Locations / Providers views — these arrays are only the initial seed data.

export const WATTAGES = [48, 60, 72];

export const BATTERY_COUNTS = [3, 5, 8];

export const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Finance / Loan'];

export const SPARE_PART_CATEGORIES = [
  'Brakes', 'Tyres & Tubes', 'Electricals', 'Body Parts', 'Motor & Controller',
  'Suspension', 'Lights & Indicators', 'Fasteners', 'Other'
];

export const SEED_PROVIDERS = [
  { id: 'zelio', name: 'Zelio' },
  { id: 'ekotejas', name: 'EKO Tejas' },
  { id: 'mac', name: 'MAC' },
  { id: 'goeen', name: 'Goeen' },
  { id: 'vedmotors', name: 'VED Motors' }
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
