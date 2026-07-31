import { useState, type ReactNode } from 'react';
import { HelpCircle, ChevronUp, ChevronDown } from 'lucide-react';

interface Step {
  title: string;
  content: ReactNode;
}

interface TutorialBannerProps {
  title: string;
  steps: Step[];
  prerequisites?: ReactNode;
  tips?: ReactNode;
  defaultOpen?: boolean;
}

export function TutorialBanner({ title, steps, prerequisites, tips, defaultOpen = false }: TutorialBannerProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={open ? 'w-full flex flex-col gap-2' : 'contents'}>
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-lg bg-glass border border-brd text-xs text-tx2 hover:text-tx1 hover:border-accent/30 transition-all flex-shrink-0 self-end">
        <HelpCircle size={14} /> <span className="hidden sm:inline">Guide</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="glass-card p-3 md:p-5 space-y-3 md:space-y-4 border border-accent/20 w-full">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-accent">
            <HelpCircle size={16} /> {title}
          </h3>
          {prerequisites && (
            <div className="p-2.5 md:p-3 rounded-lg bg-warning/5 border border-warning/20 text-xs text-tx2">
              {prerequisites}
            </div>
          )}
          <div className="space-y-2.5 md:space-y-3 text-xs md:text-sm text-tx2">
            {steps.map((step, i) => (
              <div key={i} className="flex gap-2 md:gap-3">
                <span className="flex-shrink-0 w-5 h-5 md:w-6 md:h-6 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[10px] md:text-xs font-bold">{i + 1}</span>
                <div className="min-w-0">
                  <strong className="text-tx1">{step.title}</strong>
                  {step.content}
                </div>
              </div>
            ))}
          </div>
          {tips && (
            <div className="p-2.5 md:p-3 rounded-lg bg-glass border border-brd text-xs text-tx3">
              {tips}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
