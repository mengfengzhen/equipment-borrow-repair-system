import dayjs from 'dayjs';

export function formatDateTime(value?: string) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-';
}

export function formatDate(value?: string) {
  return value ? dayjs(value).format('YYYY-MM-DD') : '-';
}

export function formatDateRange(start?: string, end?: string) {
  return `${formatDate(start)} 至 ${formatDate(end)}`;
}

export function money(value?: number) {
  return typeof value === 'number' ? `¥${value.toLocaleString()}` : '-';
}
