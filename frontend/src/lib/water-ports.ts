export type WaterPortRegion = 'India' | 'Middle East' | 'Southeast Asia' | 'East Asia' | 'Europe';

export type WaterPortOption = {
  id: string;
  name: string;
  region: WaterPortRegion;
};

export const WATER_PORTS: WaterPortOption[] = [
  { id: 'mundra', name: 'Mundra Port, Gujarat, India', region: 'India' },
  { id: 'kandla', name: 'Deendayal Port (Kandla), Gujarat, India', region: 'India' },
  { id: 'jnpt', name: 'Jawaharlal Nehru Port (JNPT), Navi Mumbai, India', region: 'India' },
  { id: 'mumbai', name: 'Mumbai Port, Maharashtra, India', region: 'India' },
  { id: 'mormugao', name: 'Mormugao Port, Goa, India', region: 'India' },
  { id: 'new_mangalore', name: 'New Mangalore Port, Karnataka, India', region: 'India' },
  { id: 'kochi', name: 'Cochin Port (Kochi), Kerala, India', region: 'India' },
  { id: 'tuticorin', name: 'V.O. Chidambaranar Port (Thoothukudi), Tamil Nadu, India', region: 'India' },
  { id: 'chennai', name: 'Chennai Port, Tamil Nadu, India', region: 'India' },
  { id: 'kamarajar', name: 'Kamarajar Port (Ennore), Tamil Nadu, India', region: 'India' },
  { id: 'vizag', name: 'Visakhapatnam Port, Andhra Pradesh, India', region: 'India' },
  { id: 'paradip', name: 'Paradip Port, Odisha, India', region: 'India' },
  { id: 'kolkata_haldia', name: 'Kolkata Port (Haldia Dock Complex), West Bengal, India', region: 'India' },
  { id: 'jebel_ali', name: 'Jebel Ali Port (Dubai), UAE', region: 'Middle East' },
  { id: 'jeddah', name: 'Jeddah Islamic Port, Saudi Arabia', region: 'Middle East' },
  { id: 'bandar_abbas', name: 'Bandar Abbas Port, Iran', region: 'Middle East' },
  { id: 'salalah', name: 'Port of Salalah, Oman', region: 'Middle East' },
  { id: 'port_said', name: 'Port Said (Suez Canal), Egypt', region: 'Middle East' },
  { id: 'singapore', name: 'Port of Singapore, Singapore', region: 'Southeast Asia' },
  { id: 'klang', name: 'Port Klang, Malaysia', region: 'Southeast Asia' },
  { id: 'laem_chabang', name: 'Laem Chabang Port, Thailand', region: 'Southeast Asia' },
  { id: 'cat_lai', name: 'Cat Lai Port (Ho Chi Minh City), Vietnam', region: 'Southeast Asia' },
  { id: 'shanghai', name: 'Port of Shanghai, China', region: 'East Asia' },
  { id: 'hong_kong', name: 'Port of Hong Kong, Hong Kong', region: 'East Asia' },
  { id: 'singapore_east', name: 'Singapore Eastern Anchorage, Singapore', region: 'East Asia' },
  { id: 'rotterdam', name: 'Port of Rotterdam, Netherlands', region: 'Europe' },
  { id: 'antwerp', name: 'Port of Antwerp, Belgium', region: 'Europe' },
  { id: 'hamburg', name: 'Port of Hamburg, Germany', region: 'Europe' },
];

export const WATER_PORT_REGION_COUNT = new Set(WATER_PORTS.map((port) => port.region)).size;
