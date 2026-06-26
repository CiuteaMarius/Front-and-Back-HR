import type { LucideIcon } from 'lucide-react';

type AeroIconVariant = 'cyan' | 'emerald' | 'amber' | 'rose' | 'violet';

type AeroIconProps = {
  icon: LucideIcon;
  size?: 'small' | 'normal' | 'large';
  variant?: AeroIconVariant;
  className?: string;
};

const variantClasses: Record<AeroIconVariant, string> = {
  cyan: 'from-cyan-200 via-sky-400 to-blue-700 shadow-cyan-500/35',
  emerald: 'from-emerald-200 via-teal-400 to-cyan-700 shadow-emerald-500/35',
  amber: 'from-amber-100 via-orange-300 to-sky-600 shadow-amber-500/35',
  rose: 'from-rose-200 via-pink-400 to-sky-700 shadow-rose-500/35',
  violet: 'from-indigo-200 via-violet-400 to-cyan-700 shadow-violet-500/35',
};

const sizeClasses = {
  small: {
    shell: 'h-10 w-10 rounded-xl shadow-[0_4px_0_rgba(8,47,73,0.38),0_8px_14px_rgba(8,47,73,0.18)]',
    icon: 'h-5 w-5',
  },
  normal: {
    shell: 'h-12 w-12 rounded-2xl shadow-[0_6px_0_rgba(8,47,73,0.42),0_12px_18px_rgba(8,47,73,0.22)]',
    icon: 'h-6 w-6',
  },
  large: {
    shell: 'h-14 w-14 rounded-[1.25rem] shadow-[0_7px_0_rgba(8,47,73,0.44),0_14px_22px_rgba(8,47,73,0.24)]',
    icon: 'h-7 w-7',
  },
};

export function AeroIcon({ icon: Icon, size = 'normal', variant = 'cyan', className = '' }: AeroIconProps) {
  const sizing = sizeClasses[size];

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden border-2 border-white/70 bg-gradient-to-br ${variantClasses[variant]} ${sizing.shell} ${className}`}
    >
      <span className="absolute inset-x-1 top-1 h-1/2 rounded-full bg-gradient-to-b from-white/70 to-transparent" />
      <span className="absolute -bottom-4 -right-4 h-9 w-9 rounded-full bg-white/20 blur-md" />
      <Icon className={`relative z-10 ${sizing.icon} text-white drop-shadow-md`} strokeWidth={2.35} />
    </span>
  );
}
