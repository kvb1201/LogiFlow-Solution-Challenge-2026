import React from "react";
import { getRiskDetails, formatCurrency, formatTime } from "../utils/helpers.js";

const RouteComparison = ({ alternatives }) => {
  if (!alternatives || alternatives.length === 0) return null;
  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <i className="fas fa-chart-simple text-slate-400"></i>
        <h3 className="text-lg font-semibold text-slate-700">Alternative routes</h3>
        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{alternatives.length} options</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {alternatives.map((alt, idx) => {
          const altRisk = getRiskDetails(alt.risk);
          return (
            <div key={idx} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 alt-card-hover transition-all duration-200 hover:shadow-md">
              <div className="flex justify-between items-start">
                <div>
                  <span className="inline-block px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                    {alt.mode}
                  </span>
                  <p className="mt-3 text-2xl font-bold text-slate-800">{formatTime(alt.time)}</p>
                  <p className="text-sm text-slate-500">{formatCurrency(alt.cost)}</p>
                </div>
                <div className={`${altRisk.color} px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${altRisk.dot}`}></span>
                  {altRisk.label}
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-slate-400 border-t border-slate-100 pt-3">
                <i className="fas fa-chart-line"></i>
                <span>risk factor: {(alt.risk * 100).toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RouteComparison;
