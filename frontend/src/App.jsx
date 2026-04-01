import React, { useState } from "react";
import InputForm from "./components/InputForm";
import BestRouteCard from "./components/BestRouteCard";
import RouteComparison from "./components/RouteComparison";
import MapView from "./components/MapView";
import { fetchOptimizedRoute } from "./services/api.js";

const App = () => {
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [priority, setPriority] = useState("Fast");
  const [preferredMode, setPreferredMode] = useState("Any");
  const [excludedModes, setExcludedModes] = useState([]);
  const [showConstraintWarning, setShowConstraintWarning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [hoveredSegmentIndex, setHoveredSegmentIndex] = useState(null);
  
  const handleOptimize = async () => {
    if (!source.trim() || !destination.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchOptimizedRoute(
        source,
        destination,
        priority,
        { preferred_mode: preferredMode === "Any" ? null : preferredMode.toLowerCase() },
        { excluded_modes: excludedModes }
      );
      setResults(data);
      setHoveredSegmentIndex(null);
    } catch (err) {
      setError("Could not fetch route. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <nav className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <i className="fas fa-cubes text-blue-600 text-2xl"></i>
            <span className="font-bold text-2xl tracking-tight text-slate-800">LogiFlow</span>
            <span className="hidden sm:inline-block ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">AI multimodal + map</span>
          </div>
          <div className="text-sm text-slate-400 flex gap-2">
            <i className="fas fa-map"></i>
            <span className="hidden sm:inline">visual route intelligence</span>
          </div>
        </div>
      </nav>
      
      <main className="max-w-7xl mx-auto px-5 py-8 md:py-10">
        <InputForm 
          source={source}
          setSource={setSource}
          destination={destination}
          setDestination={setDestination}
          priority={priority}
          setPriority={setPriority}
          preferredMode={preferredMode}
          setPreferredMode={setPreferredMode}
          excludedModes={excludedModes}
          setExcludedModes={setExcludedModes}
          onSubmit={handleOptimize}
          loading={loading}
          showConstraintWarning={showConstraintWarning}
          setShowConstraintWarning={setShowConstraintWarning}
        />
        
        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-3">
            <i className="fas fa-exclamation-triangle"></i>
            <span>{error}</span>
          </div>
        )}
        
        {loading && (
          <div className="mt-10">
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="loading-spinner"></div>
              <p className="text-slate-500 font-medium text-sm">Optimizing multimodal routes...</p>
            </div>
          </div>
        )}
        
        {!loading && results && (
          <div className="mt-10 space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <BestRouteCard 
                  route={results.best_route} 
                  onSegmentHover={(idx) => setHoveredSegmentIndex(idx)} 
                />
              </div>
              <div className="flex flex-col">
                <div className="bg-white rounded-2xl p-1 shadow-sm border border-slate-100 h-full flex flex-col">
                  <div className="p-3 pb-0 flex justify-between items-center">
                    <h3 className="text-md font-semibold text-slate-700 flex items-center gap-2">
                      <i className="fas fa-map-location-dot text-blue-500"></i> Interactive route map
                    </h3>
                    <span className="text-xs text-slate-400">multimodal visualization</span>
                  </div>
                  <div className="p-3 pt-1 flex-grow">
                    <MapView 
                      segments={results.best_route.segments} 
                      sourceName={source || (results.best_route.segments && results.best_route.segments.length > 0 ? results.best_route.segments[0].from : "Origin")}
                      destName={destination || (results.best_route.segments && results.best_route.segments.length > 0 ? results.best_route.segments[results.best_route.segments.length-1].to : "Destination")}
                    />
                  </div>
                </div>
              </div>
            </div>
            <RouteComparison alternatives={results.alternatives} />
            <div className="text-center text-xs text-slate-400 pt-2 border-t border-slate-200 mt-2">
              <i className="fas fa-charging-station mr-1"></i> AI multimodal optimizer · colored segments = different transport modes
            </div>
          </div>
        )}
        
        {!loading && !results && (
          <div className="mt-16 flex flex-col items-center justify-center text-center p-8 bg-white/40 rounded-2xl border border-dashed border-slate-200">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
              <i className="fas fa-map text-blue-500 text-2xl"></i>
            </div>
            <h3 className="text-slate-600 font-medium text-lg">Optimize your first route</h3>
            <p className="text-slate-400 max-w-md mt-1 text-sm">Enter origin & destination, choose priority and see dynamic map with color-coded multimodal segments.</p>
          </div>
        )}
      </main>
      <footer className="border-t border-slate-200 mt-12 py-6 text-center text-xs text-slate-400 bg-white/40">
        <p>LogiFlow — AI multimodal logistics · map visualization with Leaflet | hackathon demo</p>
      </footer>
    </div>
  );
};

export default App;
