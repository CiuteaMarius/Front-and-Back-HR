export const mondayFirstWeekdayKeys = [
  'monShort',
  'tueShort',
  'wedShort',
  'thuShort',
  'friShort',
  'satShort',
  'sunShort',
] as const;

export function mondayFirstLeadingDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  return Array.from({ length: (firstDay + 6) % 7 });
}
