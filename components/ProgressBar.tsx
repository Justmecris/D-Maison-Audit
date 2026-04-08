'use client';

import { motion } from 'framer-motion';

interface ProgressBarProps {
  progress: number;
  status: string;
  error?: string | null;
  onCancel?: () => void;
}

export default function ProgressBar({ progress, status, error, onCancel }: ProgressBarProps) {
  const isComplete = progress === 100;
  const isError = !!error;

  return (
    <div className="w-full space-y-2 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <p className={`text-[10px] font-black lowercase tracking-[0.2em] transition-colors ${isError ? 'text-rose-500' : 'text-[#947a46]'}`}>
            {isError ? 'upload failed. please try again.' : status}
          </p>
          {error && <p className="text-[9px] font-bold text-rose-400 lowercase">{error}</p>}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-[10px] font-black tabular-nums ${isError ? 'text-rose-500' : 'text-slate-400'}`}>
            {isError ? 'err' : `${Math.round(progress)}%`}
          </span>
          {!isComplete && onCancel && (
            <button 
              onClick={onCancel}
              className="p-1 hover:bg-slate-100 rounded-full transition-colors group"
              title="cancel upload"
            >
              <svg className="w-3 h-3 text-slate-300 group-hover:text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
      
      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ 
            width: isError ? '100%' : `${progress}%`,
            backgroundColor: isError ? '#f43f5e' : '#947a46' 
          }}
          transition={{ type: 'spring', damping: 20, stiffness: 100 }}
          className="h-full rounded-full"
        />
      </div>
    </div>
  );
}
