import { cn } from '../../lib/utils';

interface CodeBlockProps {
  children: string;
  className?: string;
  maxHeight?: string;
}

export function CodeBlock({ children, className, maxHeight = 'max-h-64' }: CodeBlockProps) {
  return (
    <div className={cn('code-block', maxHeight, 'overflow-y-auto', className)}>
      <pre>{children}</pre>
    </div>
  );
}
