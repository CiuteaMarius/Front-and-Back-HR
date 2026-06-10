export function greetingKeyForCurrentTime(date = new Date()) {
  const hour = date.getHours();

  if (hour < 5) return 'goodNight';
  if (hour < 11) return 'goodMorning';
  if (hour < 18) return 'goodAfternoon';
  return 'goodEvening';
}
