export type CalendarScope = 'all' | 'personal' | 'projects';

export const CALENDAR_SCOPE_OPTIONS: ReadonlyArray<readonly [CalendarScope, string]> = [
  ['all', 'Tất cả'],
  ['personal', 'Cá nhân'],
  ['projects', 'Dự án'],
];

type ProjectReference = string | { _id?: string | null } | null | undefined;

export function calendarProjectId(value: ProjectReference) {
  return typeof value === 'string' ? value : value?._id || '';
}

export function matchesCalendarScope(scope: CalendarScope, project: ProjectReference) {
  if (scope === 'all') return true;
  const belongsToProject = !!calendarProjectId(project);
  return scope === 'projects' ? belongsToProject : !belongsToProject;
}

export function calendarCreatePermissions(scope: CalendarScope, fixedProjectId?: string) {
  return {
    canCreateEvent: !fixedProjectId && scope !== 'projects',
    canCreateTask: false,
  } as const;
}
