import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { HelpCircle, ChevronUp, ChevronDown, BookOpen, Lightbulb, AlertTriangle } from 'lucide-react';
import { getGuideById } from '../data/guides';

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
  guideId?: string;
}

function renderRichText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\n)/g);
  return parts.map((part, i) => {
    if (part === '\n') return <br key={i} />;
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-tx1 font-semibold">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export function TutorialBanner({ title, steps, prerequisites, tips, defaultOpen = false, guideId }: TutorialBannerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const guide = guideId ? getGuideById(guideId) : undefined;

  const renderedSteps = guide
    ? guide.steps.map(s => ({ title: s.title, content: <>{renderRichText(s.content)}</> }))
    : steps;
  const renderedPrereqs = guide?.prerequisites?.length
    ? <ul className="ml-4 space-y-0.5 list-disc">{guide.prerequisites.map((p, i) => <li key={i}>{renderRichText(p)}</li>)}</ul>
    : prerequisites;
  const renderedTips = guide?.tips?.length
    ? <><strong className="text-tx2">Tips:</strong><ul className="mt-1 ml-4 space-y-0.5 list-disc">{guide.tips.map((t, i) => <li key={i}>{renderRichText(t)}</li>)}</ul></>
    : tips;

  return (
    <div className={open ? 'w-full flex flex-col gap-2' : 'contents'}>
      <div className="flex items-center gap-1.5 self-end">
        {guideId && (
          <Link
            to="/dashboard/guide"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-xs text-accent hover:bg-accent/20 transition-all flex-shrink-0"
            title="Lihat semua panduan"
          >
            <BookOpen size={14} /> <span className="hidden sm:inline">Panduan</span>
          </Link>
        )}
        <button onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-lg bg-glass border border-brd text-xs text-tx2 hover:text-tx1 hover:border-accent/30 transition-all flex-shrink-0">
          <HelpCircle size={14} /> <span className="hidden sm:inline">Guide</span>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      {open && (
        <div className="glass-card p-3 md:p-5 space-y-3 md:space-y-4 border border-accent/20 w-full">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-accent">
            <HelpCircle size={16} /> {guide?.title || title}
          </h3>
          {renderedPrereqs && (
            <div className="p-2.5 md:p-3 rounded-lg bg-warning/5 border border-warning/20 text-xs text-tx2">
              <div className="flex items-center gap-1.5 mb-1 font-semibold text-warning">
                <AlertTriangle size={12} /> Prasyarat
              </div>
              {renderedPrereqs}
            </div>
          )}
          <div className="space-y-2.5 md:space-y-3 text-xs md:text-sm text-tx2">
            {renderedSteps.map((step, i) => (
              <div key={i} className="flex gap-2 md:gap-3">
                <span className="flex-shrink-0 w-5 h-5 md:w-6 md:h-6 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[10px] md:text-xs font-bold">{i + 1}</span>
                <div className="min-w-0">
                  <strong className="text-tx1">{step.title}</strong>
                  {step.content}
                </div>
              </div>
            ))}
          </div>
          {renderedTips && (
            <div className="p-2.5 md:p-3 rounded-lg bg-glass border border-brd text-xs text-tx3">
              <div className="flex items-center gap-1.5 mb-1 font-semibold text-tx2">
                <Lightbulb size={12} className="text-accent" /> Tips
              </div>
              {renderedTips}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
