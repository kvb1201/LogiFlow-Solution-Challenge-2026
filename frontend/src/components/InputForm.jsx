// src/components/InputForm.jsx
import React from 'react';

const InputForm = ({
  source,
  setSource,
  destination,
  setDestination,
  priority,
  setPriority,
  preferredMode,
  setPreferredMode,
  excludedModes,
  setExcludedModes,
  onSubmit,
  loading,
  showConstraintWarning = false,
  setShowConstraintWarning = () => {},
}) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!source.trim() || !destination.trim()) {
      alert('Please enter both source and destination locations');
      return;
    }
    onSubmit();
  };

  const handleExcludeToggle = (mode) => {
    if (excludedModes.includes(mode)) {
      setExcludedModes(excludedModes.filter((m) => m !== mode));
    } else {
      setExcludedModes([...excludedModes, mode]);
    }
  };

  // Warn if preferred mode is excluded
  React.useEffect(() => {
    if (preferredMode !== 'Any' && excludedModes.includes(preferredMode.toLowerCase())) {
      setShowConstraintWarning(true);
    } else {
      setShowConstraintWarning(false);
    }
  }, [preferredMode, excludedModes, setShowConstraintWarning]);

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 card-transition">
      <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2 mb-5">
        <i className="fas fa-map-marked-alt text-blue-500"></i>
        Route Parameters
      </h2>
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Source</label>
            <div className="relative">
              <i className="fas fa-location-dot absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all bg-slate-50/50"
                placeholder="e.g., Surat, Chennai, Delhi"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Destination</label>
            <div className="relative">
              <i className="fas fa-flag-checkered absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all bg-slate-50/50"
                placeholder="e.g., Mumbai, Bangalore, Kolkata"
              />
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Optimization priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50/50 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 cursor-pointer"
            >
              <option value="Fast">⚡ Fastest</option>
              <option value="Cheap">💰 Cheapest</option>
              <option value="Safe">🛡️ Safest</option>
            </select>
          </div>

          {/* Strict Mode (hard constraint as single choice) */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Mode (strict - optional)</label>
            <select
              onChange={(e) => {
                const val = e.target.value;
                if (val === "Any") {
                  // clear hard constraints
                  setExcludedModes([]);
                } else {
                  // exclude all other modes except selected
                  const all = ["road", "rail", "hybrid"];
                  const keep = val.toLowerCase();
                  const exclude = all.filter((m) => m !== keep);
                  setExcludedModes(exclude);
                  // also align preference to selected mode
                  setPreferredMode(val);
                }
              }}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50/50 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 cursor-pointer"
              defaultValue="Any"
            >
              <option value="Any">Any</option>
              <option value="Road">Road</option>
              <option value="Rail">Rail</option>
              <option value="Hybrid">Hybrid</option>
            </select>
            <p className="text-xs text-slate-400 mt-2">
              Selecting a mode will restrict routing to that mode.
            </p>
          </div>

          {/* Preferred Mode Dropdown */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Preferred Mode (optional)</label>
            <select
              value={preferredMode}
              onChange={(e) => setPreferredMode(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50/50 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 cursor-pointer"
            >
              <option value="Any">Any</option>
              <option value="Road">Road</option>
              <option value="Rail">Rail</option>
              <option value="Hybrid">Hybrid</option>
            </select>
          </div>
        </div>

        {/* Excluded Modes (Multi-select checkboxes) */}
        <div className="mt-5">
          <label className="block text-sm font-medium text-slate-600 mb-2">Exclude Modes (hard constraints)</label>
          <div className="flex flex-wrap gap-4">
            {['Road', 'Rail', 'Hybrid'].map((mode) => (
              <label key={mode} className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={excludedModes.includes(mode.toLowerCase())}
                  onChange={() => handleExcludeToggle(mode.toLowerCase())}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                {mode}
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            <i className="fas fa-info-circle mr-1"></i>
            Preferences influence selection, constraints restrict options.
          </p>
          {showConstraintWarning && (
            <p className="text-xs text-amber-600 mt-2 bg-amber-50 p-2 rounded-lg">
              ⚠️ Your preferred mode is excluded. Preference will be ignored.
            </p>
          )}
          {excludedModes.length > 0 && !showConstraintWarning && (
            <p className="text-xs text-blue-600 mt-2">
              🚫 {excludedModes.map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(', ')} routes will not be considered.
            </p>
          )}
        </div>

        <div className="mt-6">
          <button
            type="submit"
            disabled={loading}
            className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 px-8 rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
          >
            {loading ? (
              <><i className="fas fa-spinner fa-spin"></i> Optimizing...</>
            ) : (
              <><i className="fas fa-chart-line"></i> Optimize Route</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default InputForm;