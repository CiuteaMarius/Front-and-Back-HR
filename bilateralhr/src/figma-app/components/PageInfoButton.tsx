import { Info } from 'lucide-react';

type PageInfoButtonProps = {
  title: string;
  description: string;
};

export function PageInfoButton({ title, description }: PageInfoButtonProps) {
  return (
    <div className="group absolute right-0 top-0 z-30">
      <button
        type="button"
        className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-2 border-white/70 bg-gradient-to-b from-cyan-200/95 via-sky-300/90 to-blue-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_10px_24px_rgba(14,165,233,0.35)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:scale-105 dark:border-cyan-200/35 dark:from-cyan-300/80 dark:via-blue-500/75 dark:to-cyan-900"
        aria-label={title}
      >
        <Info className="h-5 w-5 drop-shadow" />
      </button>
      <div className="pointer-events-none absolute right-0 top-14 w-96 max-w-[calc(100vw-2rem)] origin-top-right scale-95 rounded-3xl border-2 border-white/70 bg-white/90 p-5 opacity-0 shadow-2xl shadow-cyan-900/20 backdrop-blur-2xl transition duration-200 group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100 dark:border-cyan-300/25 dark:bg-cyan-950/92">
        <div className="pointer-events-none absolute right-4 top-0 h-8 w-8 -translate-y-1/2 rotate-45 border-l-2 border-t-2 border-white/70 bg-white/90 dark:border-cyan-300/25 dark:bg-cyan-950/92" />
        <p className="relative text-xs font-black uppercase tracking-[0.16em] text-cyan-600 dark:text-cyan-300">{title}</p>
        <p className="relative mt-2 text-sm font-bold leading-relaxed text-cyan-900 dark:text-cyan-100">{description}</p>
      </div>
    </div>
  );
}
