const APP_TIMEZONE_OFFSET_MINUTES = 8 * 60;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnly(value: string, boundary: 'start' | 'end') {
  const [year, month, day] = value.split('-').map(Number);
  const hours = boundary === 'start' ? 0 : 23;
  const minutes = boundary === 'start' ? 0 : 59;
  const seconds = boundary === 'start' ? 0 : 59;
  const milliseconds = boundary === 'start' ? 0 : 999;
  const utcTime = Date.UTC(year, month - 1, day, hours, minutes, seconds, milliseconds)
    - APP_TIMEZONE_OFFSET_MINUTES * 60 * 1000;

  return new Date(utcTime);
}

export function parseBorrowDate(value: string, boundary: 'start' | 'end') {
  if (DATE_ONLY_PATTERN.test(value)) {
    return parseDateOnly(value, boundary);
  }
  return new Date(value);
}

export function appDateKey(date: Date) {
  return new Date(date.getTime() + APP_TIMEZONE_OFFSET_MINUTES * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}
