export const generateMockResponse = (source, destination, priority) => {
  const src = source.trim() || "Origin";
  const dst = destination.trim() || "Destination";
  
  if (priority === "Fast") {
    return {
      best_route: {
        type: "Hybrid",
        total_time: 4.8,
        total_cost: 2850,
        risk: 0.45,
        segments: [
          { mode: "Road", from: src, to: "Express Hub" },
          { mode: "Rail", from: "Express Hub", to: dst }
        ]
      },
      alternatives: [
        { mode: "Road (Expressway)", time: 6.2, cost: 3100, risk: 0.62 },
        { mode: "Rail (High-Speed)", time: 5.5, cost: 2300, risk: 0.28 },
        { mode: "Hybrid (Eco)", time: 5.9, cost: 2680, risk: 0.41 }
      ]
    };
  } 
  else if (priority === "Cheap") {
    return {
      best_route: {
        type: "Rail-First Hybrid",
        total_time: 8.2,
        total_cost: 1680,
        risk: 0.58,
        segments: [
          { mode: "Rail", from: src, to: "Central Depot" },
          { mode: "Road", from: "Central Depot", to: dst }
        ]
      },
      alternatives: [
        { mode: "Road", time: 7.1, cost: 2750, risk: 0.65 },
        { mode: "Full Rail", time: 9.5, cost: 1590, risk: 0.32 },
        { mode: "Inland Waterway", time: 12.0, cost: 1450, risk: 0.48 }
      ]
    };
  } 
  else { // "Safe"
    return {
      best_route: {
        type: "Road (Safe Corridor)",
        total_time: 6.5,
        total_cost: 2950,
        risk: 0.19,
        segments: [
          { mode: "Road", from: src, to: dst }
        ]
      },
      alternatives: [
        { mode: "Rail", time: 7.8, cost: 2100, risk: 0.35 },
        { mode: "Hybrid (Night Train)", time: 7.2, cost: 2580, risk: 0.27 },
        { mode: "Intermodal", time: 6.9, cost: 2700, risk: 0.23 }
      ]
    };
  }
};

export const fetchOptimizedRoute = async (
  source,
  destination,
  priority,
  preferences = {},
  constraints = {}
) => {
  try {
    const response = await fetch('/api/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source,
        destination,
        priority,
        preferences,
        constraints,
      }),
    });

    if (!response.ok) {
      throw new Error('API request failed');
    }

    return await response.json();
  } catch (error) {
    console.warn('Falling back to mock response:', error);

    // fallback to mock if backend not available
    return generateMockResponse(source, destination, priority);
  }
};
