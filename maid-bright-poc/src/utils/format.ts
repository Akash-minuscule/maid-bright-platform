/** Maid Bright serves Dallas, so every time is shown in Dallas local time (America/Chicago). */
const timeZone = 'America/Chicago';
export const LOCAL_TIME_LABEL = 'Dallas time';
export const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
export const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone,
  }).format(new Date(value));
export const fullDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  }).format(new Date(value));
export const timeLabel = (value: string) =>
  new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(
    new Date(value),
  );
export const timeRange = (start: string, end: string) =>
  dateLabel(start) === dateLabel(end)
    ? `${timeLabel(start)} – ${timeLabel(end)} ${LOCAL_TIME_LABEL}`
    : `Between ${dateLabel(start)} and ${dateLabel(end)}`;
/** Date and time range on one line, e.g. "Tue, Oct 21 · 8:00 AM – 10:00 AM Dallas time". */
export const dateTimeRange = (start: string, end: string) =>
  dateLabel(start) === dateLabel(end)
    ? `${dateLabel(start)} · ${timeRange(start, end)}`
    : `${dateLabel(start)}, ${timeLabel(start)} – ${dateLabel(end)}, ${timeLabel(end)} ${LOCAL_TIME_LABEL}`;
export const durationLabel = ({ value, unit }: { value: number; unit: 'hours' | 'minutes' }) =>
  `${value} ${value === 1 ? unit.slice(0, -1) : unit}`;
export const addressLabel = (a: {
  line1: string;
  city: string;
  state: string;
  postalCode: string;
}) => `${a.line1}, ${a.city}, ${a.state} ${a.postalCode}`;
export const upcoming = <T extends { scheduledStart: string; status: string }>(rows: T[]) =>
  rows
    .filter((a) => a.status === 'Confirmed' || a.status === 'Requested')
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
