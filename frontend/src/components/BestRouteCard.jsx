import React from "react";
import SegmentList from "./SegmentList.jsx";
import { getRiskDetails, formatCurrency, formatTime } from "../utils/helpers.js";

const BestRouteCard = ({ route, onSegmentHover }) => {
  if (!route) return null;
  const riskDetail = getRiskDetails(route.risk);
  return (
    <div className="bg-gradient-to-br from-white to-blue-50/40 rounded-2xl shadow-xl border border-blue-200/60 p-6 transition-all card-transition h-full">
      <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-blue-600 bg-blue-100 px-3 py-1 rounded-full">
            <i className="fas fa-crown mr-1 text-xs"></i> Recommended Route
          </span>
          <h3 className="text-2xl font-bold text-slate-800 mt-2 flex items-center gap-2">
            {route.type}
            <span className="text-sm font-normal text-slate-400 bg-white/70 px-2 py-0.5 rounded-full">best match</span>
          </h3>
        </div>
        <div className={`${riskDetail.color} px-3 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5`}>
          <span className={`w-2 h-2 rounded-full ${riskDetail.dot}`}></span>
          {riskDetail.label} Risk
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 py-3">
        <div className="bg-white/70 rounded-xl p-3">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Total Time</p>
          <p className="text-2xl font-bold text-slate-800">{formatTime(route.total_time)}</p>
        </div>
        <div className="bg-white/70 rounded-xl p-3">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Total Cost</p>
          <p className="text-2xl font-bold text-slate-800">{formatCurrency(route.total_cost)}</p>
        </div>
        <div className="bg-white/70 rounded-xl p-3">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Risk Score</p>
          <p className="text-xl font-bold text-slate-800">{(route.risk * 100).toFixed(0)}%</p>
        </div>
      </div>
      <SegmentList segments={route.segments} onHoverSegment={onSegmentHover} />
    </div>
  );
};

export default BestRouteCard;
