import type { Request } from '../types';

type LeaveDateSource = Pick<Request, 'startDate' | 'endDate' | 'approvedDates'>;

export type LeaveOverlap = {
  date: string;
  request: Request;
};

export function isLeaveRequestType(type: Request['type']) {
  return type === 'medical-leave' || type === 'paid-leave';
}

export function getLeaveDateRange(startDate?: string, endDate?: string) {
  if (!startDate) return [];

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate || startDate}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [startDate];
  }

  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, '0');
    const day = String(cursor.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function getLeaveDates(source: LeaveDateSource) {
  return source.approvedDates?.length
    ? Array.from(new Set(source.approvedDates)).sort()
    : getLeaveDateRange(source.startDate, source.endDate);
}

export function findLeaveDateOverlap(
  requests: Request[],
  employeeId: string,
  candidateDates: string[],
  excludeRequestId?: string,
) {
  const candidateDateSet = new Set(candidateDates);
  if (candidateDateSet.size === 0) return undefined;

  return requests
    .filter((request) =>
      request.employeeId === employeeId
      && request.id !== excludeRequestId
      && isLeaveRequestType(request.type)
      && ['pending', 'in_review', 'approved'].includes(request.status),
    )
    .flatMap((request) =>
      getLeaveDates(request).map((date) => ({ date, request })),
    )
    .find((item) => candidateDateSet.has(item.date));
}
