import {
  Blocks,
  CircuitBoard,
  CloudCog,
  Cog,
  Compass,
  Factory,
  FlaskConical,
  GraduationCap,
  HeartPulse,
  KeyRound,
  Leaf,
  LifeBuoy,
  Map as MapIcon,
  Microscope,
  PackageSearch,
  Palette,
  PenTool,
  PiggyBank,
  RadioTower,
  Route,
  Scale,
  ShieldCheck,
  Sprout,
  Telescope,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type DepartmentIconDefinition = {
  key: string;
  label: string;
  recommendedFor: string;
  Icon: LucideIcon;
  tileClass: string;
  shadowClass: string;
};

export const DEFAULT_DEPARTMENT_ICON_KEY = 'community-garden';

export const departmentIconCatalog: DepartmentIconDefinition[] = [
  { key: 'community-garden', label: 'Community Garden', recommendedFor: 'HR / People & Culture', Icon: Sprout, tileClass: 'from-lime-300 via-emerald-400 to-teal-700', shadowClass: 'shadow-emerald-700/45' },
  { key: 'circuit-workshop', label: 'Circuit Workshop', recommendedFor: 'Engineering / Development', Icon: CircuitBoard, tileClass: 'from-cyan-300 via-sky-500 to-blue-800', shadowClass: 'shadow-blue-800/45' },
  { key: 'treasure-ledger', label: 'Treasure Ledger', recommendedFor: 'Finance / Accounting', Icon: PiggyBank, tileClass: 'from-amber-200 via-yellow-400 to-orange-600', shadowClass: 'shadow-orange-700/45' },
  { key: 'color-studio', label: 'Color Studio', recommendedFor: 'Marketing / Brand', Icon: Palette, tileClass: 'from-rose-300 via-pink-500 to-fuchsia-700', shadowClass: 'shadow-pink-800/45' },
  { key: 'growth-compass', label: 'Growth Compass', recommendedFor: 'Sales / Business Development', Icon: Compass, tileClass: 'from-orange-300 via-amber-500 to-red-700', shadowClass: 'shadow-orange-800/45' },
  { key: 'balanced-seal', label: 'Balanced Seal', recommendedFor: 'Legal / Compliance', Icon: Scale, tileClass: 'from-slate-300 via-slate-500 to-slate-800', shadowClass: 'shadow-slate-900/45' },
  { key: 'clockwork-deck', label: 'Clockwork Deck', recommendedFor: 'Operations', Icon: Cog, tileClass: 'from-sky-200 via-cyan-500 to-teal-800', shadowClass: 'shadow-teal-900/45' },
  { key: 'rescue-ring', label: 'Rescue Ring', recommendedFor: 'Customer Support / Service', Icon: LifeBuoy, tileClass: 'from-red-300 via-orange-400 to-rose-700', shadowClass: 'shadow-rose-800/45' },
  { key: 'building-blocks', label: 'Building Blocks', recommendedFor: 'Product Management', Icon: Blocks, tileClass: 'from-indigo-300 via-blue-500 to-indigo-800', shadowClass: 'shadow-indigo-900/45' },
  { key: 'drafting-table', label: 'Drafting Table', recommendedFor: 'Design / UX', Icon: PenTool, tileClass: 'from-violet-300 via-purple-500 to-fuchsia-800', shadowClass: 'shadow-purple-900/45' },
  { key: 'star-observatory', label: 'Star Observatory', recommendedFor: 'Data / Analytics / BI', Icon: Telescope, tileClass: 'from-blue-300 via-indigo-500 to-slate-900', shadowClass: 'shadow-indigo-950/45' },
  { key: 'secure-vault', label: 'Secure Vault', recommendedFor: 'Security / Risk', Icon: ShieldCheck, tileClass: 'from-emerald-300 via-teal-500 to-cyan-900', shadowClass: 'shadow-cyan-950/45' },
  { key: 'delivery-route', label: 'Delivery Route', recommendedFor: 'Logistics / Supply Chain', Icon: Route, tileClass: 'from-green-300 via-lime-500 to-emerald-800', shadowClass: 'shadow-green-900/45' },
  { key: 'supply-crate', label: 'Supply Crate', recommendedFor: 'Procurement / Purchasing', Icon: PackageSearch, tileClass: 'from-yellow-200 via-amber-500 to-stone-700', shadowClass: 'shadow-stone-800/45' },
  { key: 'quality-microscope', label: 'Quality Microscope', recommendedFor: 'Quality Assurance / Testing', Icon: Microscope, tileClass: 'from-cyan-200 via-teal-400 to-emerald-800', shadowClass: 'shadow-emerald-900/45' },
  { key: 'learning-academy', label: 'Learning Academy', recommendedFor: 'Training / Learning & Development', Icon: GraduationCap, tileClass: 'from-blue-300 via-violet-500 to-purple-800', shadowClass: 'shadow-purple-900/45' },
  { key: 'wellbeing-pulse', label: 'Wellbeing Pulse', recommendedFor: 'Medical / Occupational Health', Icon: HeartPulse, tileClass: 'from-pink-300 via-rose-500 to-red-800', shadowClass: 'shadow-red-900/45' },
  { key: 'facility-key', label: 'Facility Key', recommendedFor: 'Administration / Facilities', Icon: KeyRound, tileClass: 'from-stone-200 via-slate-400 to-slate-700', shadowClass: 'shadow-slate-800/45' },
  { key: 'signal-tower', label: 'Signal Tower', recommendedFor: 'Communications / PR', Icon: RadioTower, tileClass: 'from-sky-300 via-blue-500 to-cyan-800', shadowClass: 'shadow-blue-900/45' },
  { key: 'strategy-map', label: 'Strategy Map', recommendedFor: 'Strategy / Leadership', Icon: MapIcon, tileClass: 'from-teal-300 via-cyan-500 to-blue-800', shadowClass: 'shadow-blue-900/45' },
  { key: 'production-floor', label: 'Production Floor', recommendedFor: 'Manufacturing / Production', Icon: Factory, tileClass: 'from-orange-200 via-orange-500 to-stone-800', shadowClass: 'shadow-stone-900/45' },
  { key: 'green-canopy', label: 'Green Canopy', recommendedFor: 'Sustainability / ESG', Icon: Leaf, tileClass: 'from-green-200 via-lime-500 to-green-800', shadowClass: 'shadow-green-900/45' },
  { key: 'discovery-flask', label: 'Discovery Flask', recommendedFor: 'Research / Innovation', Icon: FlaskConical, tileClass: 'from-fuchsia-200 via-violet-500 to-indigo-800', shadowClass: 'shadow-indigo-900/45' },
  { key: 'cloud-engine-room', label: 'Cloud Engine Room', recommendedFor: 'IT / Infrastructure', Icon: CloudCog, tileClass: 'from-cyan-200 via-blue-500 to-slate-800', shadowClass: 'shadow-slate-900/45' },
];

export function getDepartmentIcon(iconKey?: string) {
  return departmentIconCatalog.find((item) => item.key === iconKey) ?? departmentIconCatalog[0];
}
