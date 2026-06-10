import { useId } from 'react';

type ProfileAvatarProps = {
  name?: string;
  className?: string;
};

export function ProfileAvatar({ name, className = '' }: ProfileAvatarProps) {
  const id = useId().replace(/:/g, '');
  const ids = {
    bg: `avatar-bg-${id}`,
    head: `avatar-head-${id}`,
    shoulders: `avatar-shoulders-${id}`,
    light: `avatar-light-${id}`,
  };

  return (
    <div
      aria-label={name ? `${name} profile placeholder` : 'Profile placeholder'}
      className={`relative shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-slate-100 via-cyan-50 to-teal-100 ring-2 ring-cyan-300/50 shadow-lg dark:from-slate-800 dark:via-cyan-950 dark:to-teal-950 dark:ring-cyan-500/30 ${className}`}
    >
      <svg
        aria-hidden="true"
        className="h-full w-full"
        viewBox="0 0 160 160"
        role="img"
      >
        <defs>
          <linearGradient id={ids.bg} x1="16" y1="8" x2="146" y2="156" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f3f6f1" />
            <stop offset="0.55" stopColor="#d8eee8" />
            <stop offset="1" stopColor="#a4cfc8" />
          </linearGradient>
          <linearGradient id={ids.head} x1="58" y1="18" x2="108" y2="90" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f1e2cf" />
            <stop offset="1" stopColor="#cdb9a8" />
          </linearGradient>
          <linearGradient id={ids.shoulders} x1="16" y1="93" x2="146" y2="154" gradientUnits="userSpaceOnUse">
            <stop stopColor="#7ea6a1" />
            <stop offset="1" stopColor="#4f6f72" />
          </linearGradient>
          <radialGradient id={ids.light} cx="54" cy="34" r="66" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="160" height="160" rx="22" fill={`url(#${ids.bg})`} />
        <circle cx="47" cy="34" r="58" fill={`url(#${ids.light})`} />
        <path
          d="M15 153c3-41 27-70 65-70 37 0 62 29 65 70-34 13-96 13-130 0Z"
          fill={`url(#${ids.shoulders})`}
        />
        <path
          d="M32 144c8-27 25-42 48-42s40 15 48 42c-24 8-72 8-96 0Z"
          fill="#e8f7f3"
          opacity="0.18"
        />
        <ellipse
          cx="80"
          cy="57"
          rx="37"
          ry="45"
          fill={`url(#${ids.head})`}
          stroke="#6f817f"
          strokeWidth="3"
        />
        <path
          d="M52 43c11-20 43-28 58-3-7-27-48-36-62 1Z"
          fill="#f8f1e8"
          opacity="0.32"
        />
        <path
          d="M30 154c30 9 71 9 101 0"
          fill="none"
          stroke="#314b50"
          strokeOpacity="0.25"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
