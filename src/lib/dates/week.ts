export type WeekOption = {
  year: number;
  month: number;
  weekOfMonth: number;
  weekStartDate: string;
  weekEndDate: string;
  label: string;
};

const SEOUL_OFFSET_MINUTES = 9 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function utcDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toSeoulDate(date: Date) {
  return new Date(date.getTime() + SEOUL_OFFSET_MINUTES * 60 * 1000);
}

function isoDate(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function displayDate(date: string) {
  return date.replaceAll("-", ".");
}

export function getMonday(date = new Date()) {
  const seoul = utcDateOnly(toSeoulDate(date));
  const day = seoul.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(seoul.getTime() + diff * DAY_MS);
}

export function getWeekEndDate(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00.000Z`);
  return isoDate(new Date(start.getTime() + 6 * DAY_MS));
}

export function getReportMonthByThursday(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00.000Z`);
  const thursday = new Date(start.getTime() + 3 * DAY_MS);
  return {
    year: thursday.getUTCFullYear(),
    month: thursday.getUTCMonth() + 1
  };
}

export function getWeekOfMonth(weekStart: string) {
  const { year, month } = getReportMonthByThursday(weekStart);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const firstDayWeekday = firstDay.getUTCDay();
  const firstMondayDiff = firstDayWeekday === 0 ? -6 : 1 - firstDayWeekday;
  let firstMonday = new Date(firstDay.getTime() + firstMondayDiff * DAY_MS);

  const firstThursday = new Date(firstMonday.getTime() + 3 * DAY_MS);
  if (firstThursday.getUTCMonth() + 1 !== month) {
    firstMonday = new Date(firstMonday.getTime() + 7 * DAY_MS);
  }

  const start = new Date(`${weekStart}T00:00:00.000Z`);
  return Math.floor((start.getTime() - firstMonday.getTime()) / (7 * DAY_MS)) + 1;
}

export function getCurrentWeekOption(date = new Date()): WeekOption {
  const monday = getMonday(date);
  const weekStartDate = isoDate(monday);
  const weekEndDate = getWeekEndDate(weekStartDate);
  const { year, month } = getReportMonthByThursday(weekStartDate);
  const weekOfMonth = getWeekOfMonth(weekStartDate);
  return {
    year,
    month,
    weekOfMonth,
    weekStartDate,
    weekEndDate,
    label: `${year}년 ${month}월 ${weekOfMonth}주차 · ${displayDate(weekStartDate)} ~ ${displayDate(weekEndDate)}`
  };
}

export function getWeekOptions(year: number, month: number): WeekOption[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const cursor = new Date(first.getTime() - 14 * DAY_MS);
  const result: WeekOption[] = [];

  for (let i = 0; i < 10; i += 1) {
    const monday = getMonday(cursor);
    const weekStartDate = isoDate(monday);
    const report = getReportMonthByThursday(weekStartDate);
    if (report.year === year && report.month === month) {
      const weekEndDate = getWeekEndDate(weekStartDate);
      const weekOfMonth = getWeekOfMonth(weekStartDate);
      result.push({
        year,
        month,
        weekOfMonth,
        weekStartDate,
        weekEndDate,
        label: `${year}년 ${month}월 ${weekOfMonth}주차 · ${displayDate(weekStartDate)} ~ ${displayDate(weekEndDate)}`
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  return Array.from(new Map(result.map((week) => [week.weekStartDate, week])).values());
}

export function resolveWeekFromSelection(year: number, month: number, weekOfMonth: number) {
  const option = getWeekOptions(year, month).find((week) => week.weekOfMonth === weekOfMonth);
  if (!option) {
    throw new Error("선택한 년월의 유효한 주차가 아닙니다.");
  }
  return option;
}
