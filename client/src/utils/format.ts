import dayjs from 'dayjs';

export function formatDateTime(value?: string) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-';
}

export function money(value?: number) {
  return typeof value === 'number' ? `¥${value.toLocaleString()}` : '-';
}
