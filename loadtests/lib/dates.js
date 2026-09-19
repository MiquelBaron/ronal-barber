/** Return the next open weekday (Mon–Sat) at least `minDaysAhead` days from today (YYYY-MM-DD). */
export function nextWeekday(minDaysAhead = 7) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + minDaysAhead);

  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }

  return date.toISOString().slice(0, 10);
}
