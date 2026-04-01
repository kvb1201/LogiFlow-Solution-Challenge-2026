import React from "react";
import { modeColor } from "../utils/constants.js";

const SegmentList = ({ segments, onHoverSegment }) => {
  if (!segments || segments.length === 0) return null;
  return (
    <div className="mt-5 pt-3 border-t border-slate-100">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
        <i className="fas fa-route text-slate-400 text-xs"></i> Route breakdown (click segment to highlight on map)
      </h4>
      <div className="space-y-2.5">
        {segments.map((seg, idx) => (
          <div 
            key={idx} 
            className="flex items-start gap-3 text-sm segment-highlight p-1 rounded-lg"
            onMouseEnter={() => onHoverSegment && onHoverSegment(idx)}
            onMouseLeave={() => onHoverSegment && onHoverSegment(null)}
          >
            <div className="min-w-[70px] font-semibold text-slate-600 bg-slate-50 px-2 py-0.5 rounded-full text-center text-xs" style={{ borderLeft: `3px solid ${modeColor[seg.mode] || '#6b7280'}` }}>
              {seg.mode}
            </div>
            <div className="text-slate-700">
              <span className="font-medium">{seg.from}</span>
              <i className="fas fa-arrow-right mx-2 text-slate-400 text-xs"></i>
              <span className="font-medium">{seg.to}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SegmentList;
