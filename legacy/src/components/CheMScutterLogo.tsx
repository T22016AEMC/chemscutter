import React from 'react';

interface CheMScutterLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export const CheMScutterLogo: React.FC<CheMScutterLogoProps> = ({
  className = '',
  size = 'md',
  showText = false
}) => {
  const iconSizeClass = {
    sm: 'w-8 h-8 rounded-lg',
    md: 'w-9 h-9 rounded-xl',
    lg: 'w-12 h-12 rounded-2xl'
  }[size];

  if (!showText) {
    return (
      <div
        className={`relative overflow-hidden bg-slate-900 shadow-xs border border-slate-200/80 shrink-0 group ${iconSizeClass} ${className}`}
      >
        <img
          src="/chemscutter_icon.jpg"
          alt="CheMScutter Logo"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-cyan-400/20 to-transparent pointer-events-none opacity-60" />
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-3 min-w-0 ${className}`}>
      <div
        className={`relative overflow-hidden bg-slate-900 shadow-xs border border-slate-200/80 shrink-0 group ${iconSizeClass}`}
      >
        <img
          src="/chemscutter_icon.jpg"
          alt="CheMScutter Logo"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-cyan-400/20 to-transparent pointer-events-none opacity-60" />
      </div>

      <div className="min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-lg font-bold tracking-tight text-slate-900 leading-none">
            Che<span className="text-blue-600">MS</span>cutter
          </span>
          <span className="text-xs text-slate-500 font-medium">
            TOF-SIMS · LC-MS/MS · GC-MS
          </span>
        </div>
        <p className="text-xs text-slate-500 truncate mt-0.5">
          多平台質譜候選碎片與反應路徑模擬系統
        </p>
      </div>
    </div>
  );
};

export default CheMScutterLogo;
