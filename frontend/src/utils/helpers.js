import { cityCoordinates } from "./constants.js";

// Helper to get coordinates safely
export const getCoords = (placeName) => {
  if (cityCoordinates[placeName]) return cityCoordinates[placeName];
  // fallback: default to Delhi if unknown
  console.warn(`Coordinates not found for ${placeName}, using default`);
  return [28.6139, 77.2090];
};

// Helper: risk level
export const getRiskDetails = (riskValue) => {
  if (riskValue < 0.3) return { label: "Low", color: "text-green-700 bg-green-100", dot: "bg-green-500" };
  if (riskValue < 0.7) return { label: "Medium", color: "text-yellow-800 bg-yellow-100", dot: "bg-yellow-500" };
  return { label: "High", color: "text-red-700 bg-red-100", dot: "bg-red-500" };
};

export const formatCurrency = (amount) => `₹${amount.toLocaleString('en-IN')}`;
export const formatTime = (hours) => `${hours} hrs`;
