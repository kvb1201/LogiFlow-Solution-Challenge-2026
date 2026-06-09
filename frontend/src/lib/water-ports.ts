/**
 * Water pipeline port list — synced from backend/app/pipelines/water/config.py
 * 47 global ports across 9 regions.
 *
 * The backend accepts any port name from this list (direct-match in map_city_to_ports).
 * It also accepts plain city names like "Mumbai", "Dubai", "Rotterdam" via fuzzy match.
 */

export type WaterPortRegion =
  | 'India'
  | 'Middle East'
  | 'Southeast Asia'
  | 'East Asia'
  | 'Europe'
  | 'Africa'
  | 'North America'
  | 'South America'
  | 'South Asia';

export type WaterPortOption = {
  id: string;
  name: string;
  region: WaterPortRegion;
};

export const WATER_PORTS: WaterPortOption[] = [
  // ── India — West Coast ──────────────────────────────────────────────────
  { id: 'port777',  name: 'Mundra Port, Gujarat, India',                              region: 'India' },
  { id: 'port540',  name: 'Deendayal Port (Kandla), Gujarat, India',                  region: 'India' },
  { id: 'port776',  name: 'Jawaharlal Nehru Port (JNPT), Navi Mumbai, India',         region: 'India' },
  { id: 'port2039', name: 'Hazira Port, Gujarat, India',                               region: 'India' },
  { id: 'port271',  name: 'Dahej Port, Gujarat, India',                                region: 'India' },
  { id: 'port907',  name: 'Pipavav Port, Gujarat, India',                              region: 'India' },
  { id: 'port1199', name: 'Sikka / Vadinar Terminal, Gujarat, India',                  region: 'India' },
  { id: 'port511',  name: 'Jaigad Port, Maharashtra, India',                           region: 'India' },
  { id: 'port709',  name: 'Mormugao Port, Goa, India',                                 region: 'India' },
  { id: 'port811',  name: 'New Mangalore Port, Karnataka, India',                      region: 'India' },
  { id: 'port583',  name: 'Cochin Port (Kochi), Kerala, India',                        region: 'India' },
  // ── India — East Coast ──────────────────────────────────────────────────
  { id: 'port1331', name: 'V.O. Chidambaranar Port (Tuticorin), Tamil Nadu, India',   region: 'India' },
  { id: 'port235',  name: 'Chennai Port, Tamil Nadu, India',                           region: 'India' },
  { id: 'port534',  name: 'Kamarajar Port (Ennore), Tamil Nadu, India',                region: 'India' },
  { id: 'port2038', name: 'Kattupalli Port, Tamil Nadu, India',                        region: 'India' },
  { id: 'port599',  name: 'Krishnapatnam Port, Andhra Pradesh, India',                 region: 'India' },
  { id: 'port529',  name: 'Kakinada Port, Andhra Pradesh, India',                      region: 'India' },
  { id: 'port1367', name: 'Visakhapatnam Port, Andhra Pradesh, India',                 region: 'India' },
  { id: 'port883',  name: 'Paradip Port, Odisha, India',                               region: 'India' },
  { id: 'port290',  name: 'Dhamra Port, Odisha, India',                                region: 'India' },
  { id: 'port442',  name: 'Haldia Dock Complex, West Bengal, India',                   region: 'India' },
  { id: 'port207',  name: 'Kolkata Port (Syama Prasad Mookerjee), West Bengal, India', region: 'India' },
  // ── South Asia ──────────────────────────────────────────────────────────
  { id: 'colombo',  name: 'Port of Colombo, Sri Lanka',                                region: 'South Asia' },
  // ── Middle East ─────────────────────────────────────────────────────────
  { id: 'port411',  name: 'Jebel Ali Port (Dubai), UAE',                               region: 'Middle East' },
  { id: 'port566',  name: 'Jeddah Islamic Port, Saudi Arabia',                         region: 'Middle East' },
  { id: 'port1161', name: 'Port of Salalah, Oman',                                     region: 'Middle East' },
  { id: 'port909',  name: 'Port Said (Suez Canal Gateway), Egypt',                     region: 'Middle East' },
  { id: 'port23',   name: 'Alexandria Port, Egypt',                                    region: 'Middle East' },
  { id: 'port504',  name: 'Port of Istanbul (Ambarli), Türkiye',                       region: 'Middle East' },
  // ── Southeast Asia ──────────────────────────────────────────────────────
  { id: 'port1201', name: 'Port of Singapore, Singapore',                              region: 'Southeast Asia' },
  { id: 'port648',  name: 'Port Klang, Malaysia',                                      region: 'Southeast Asia' },
  { id: 'port1074', name: 'Tanjung Pelepas Port, Malaysia',                            region: 'Southeast Asia' },
  { id: 'port572',  name: 'Laem Chabang Port, Thailand',                               region: 'Southeast Asia' },
  { id: 'port171',  name: 'Ho Chi Minh City Port (Cat Lai), Vietnam',                  region: 'Southeast Asia' },
  { id: 'port568',  name: 'Jakarta (Tanjung Priok), Indonesia',                        region: 'Southeast Asia' },
  // ── East Asia ───────────────────────────────────────────────────────────
  { id: 'port1188', name: 'Port of Shanghai, China',                                   region: 'East Asia' },
  { id: 'port824',  name: 'Port of Ningbo, China',                                     region: 'East Asia' },
  { id: 'port474',  name: 'Port of Hong Kong',                                         region: 'East Asia' },
  { id: 'port1065', name: 'Port of Busan, South Korea',                                region: 'East Asia' },
  { id: 'port485',  name: 'Port of Tokyo, Japan',                                      region: 'East Asia' },
  // ── Europe ──────────────────────────────────────────────────────────────
  { id: 'port1114', name: 'Port of Rotterdam, Netherlands',                            region: 'Europe' },
  { id: 'port57',   name: 'Port of Antwerp-Bruges, Belgium',                           region: 'Europe' },
  { id: 'port446',  name: 'Port of Hamburg, Germany',                                  region: 'Europe' },
  // ── Africa ──────────────────────────────────────────────────────────────
  { id: 'port311',  name: 'Port of Durban, South Africa',                              region: 'Africa' },
  { id: 'port1265', name: 'Tanger Med, Morocco',                                       region: 'Africa' },
  // ── Americas ────────────────────────────────────────────────────────────
  { id: 'port481',  name: 'Port of Houston, United States',                            region: 'North America' },
  { id: 'port1160', name: 'Port of Santos, Brazil',                                    region: 'South America' },
];

export const WATER_PORT_REGION_COUNT = new Set(WATER_PORTS.map((p) => p.region)).size;
