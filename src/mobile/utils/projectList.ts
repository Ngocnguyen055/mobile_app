import type { Project, User } from "../services/api.ts";

export const PROJECTS_PER_PAGE = 10;
export type ProjectOwnershipFilter = "all" | "owned" | "other";
export type ProjectDateFilter = "all" | "day" | "week" | "month" | "year";
export type ProjectDateGranularity = Exclude<ProjectDateFilter, "all">;

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi")
    .trim();
}

export function filterProjects(
  projects: Project[],
  query: string,
  ownership: ProjectOwnershipFilter = "all",
  currentUserId = "",
  dateFilter: ProjectDateFilter = "all",
  dateAnchor = new Date(),
) {
  const keyword = normalizeSearch(query);
  const dateRange = projectDateRange(dateFilter, dateAnchor);
  return projects.filter((project) => {
    const matchesName =
      !keyword || normalizeSearch(project.name).includes(keyword);
    const ownedByCurrentUser = project.owner === currentUserId;
    const matchesOwnership =
      ownership === "all" ||
      (ownership === "owned" && ownedByCurrentUser) ||
      (ownership === "other" && !ownedByCurrentUser);
    const timestamp = createdTime(project);
    const matchesDate =
      !dateRange ||
      (timestamp >= dateRange.start && timestamp < dateRange.end);
    return matchesName && matchesOwnership && matchesDate;
  });
}

export function projectOwnerDetails(project: Project): User | undefined {
  return project.members.find(
    (member): member is User =>
      typeof member !== "string" && member._id === project.owner,
  );
}

function createdTime(project: Project) {
  const timestamp = project.createdAt ? Date.parse(project.createdAt) : NaN;
  if (Number.isFinite(timestamp)) return timestamp;
  const objectIdTime = Number.parseInt(project._id.slice(0, 8), 16) * 1000;
  return Number.isFinite(objectIdTime) ? objectIdTime : 0;
}

export function projectDateRange(filter: ProjectDateFilter, anchor: Date) {
  if (filter === "all") return null;
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  if (filter === "week") {
    const daysSinceMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - daysSinceMonday);
  } else if (filter === "month") {
    start.setDate(1);
  } else if (filter === "year") {
    start.setMonth(0, 1);
  }
  const end = new Date(start);
  if (filter === "day") end.setDate(end.getDate() + 1);
  else if (filter === "week") end.setDate(end.getDate() + 7);
  else if (filter === "month") end.setMonth(end.getMonth() + 1);
  else end.setFullYear(end.getFullYear() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function shortDate(value: Date, includeYear = true) {
  const date = `${padDatePart(value.getDate())}/${padDatePart(value.getMonth() + 1)}`;
  return includeYear ? `${date}/${value.getFullYear()}` : date;
}

export function formatProjectDatePeriod(
  filter: ProjectDateGranularity,
  anchor: Date,
  now = new Date(),
) {
  const range = projectDateRange(filter, anchor)!;
  const currentRange = projectDateRange(filter, now)!;
  const current = range.start === currentRange.start;
  const start = new Date(range.start);
  const end = new Date(range.end - 1);
  if (filter === "day")
    return current ? `Hôm nay · ${shortDate(start)}` : shortDate(start);
  if (filter === "week")
    return `${current ? "Tuần hiện tại · " : ""}${shortDate(start, start.getFullYear() !== end.getFullYear())} – ${shortDate(end)}`;
  if (filter === "month")
    return `${current ? "Tháng hiện tại · " : "Tháng "}${padDatePart(start.getMonth() + 1)}/${start.getFullYear()}`;
  return `${current ? "Năm hiện tại · " : "Năm "}${start.getFullYear()}`;
}

export function moveProjectDatePeriod(
  filter: ProjectDateGranularity,
  anchor: Date,
  direction: -1 | 1,
) {
  const range = projectDateRange(filter, anchor)!;
  const result = new Date(range.start);
  if (filter === "day") result.setDate(result.getDate() + direction);
  else if (filter === "week") result.setDate(result.getDate() + direction * 7);
  else if (filter === "month")
    result.setMonth(result.getMonth() + direction);
  else result.setFullYear(result.getFullYear() + direction);
  return result;
}

export function orderProjectsNewestFirst(projects: Project[]) {
  return [...projects].sort(
    (left, right) =>
      createdTime(right) - createdTime(left) ||
      right._id.localeCompare(left._id),
  );
}

export function projectPageCount(projects: Project[]) {
  return Math.max(1, Math.ceil(projects.length / PROJECTS_PER_PAGE));
}

export function projectsForPage(projects: Project[], page: number) {
  const pages = projectPageCount(projects);
  const safePage = Math.min(Math.max(0, page), pages - 1);
  return {
    page: safePage,
    pageCount: pages,
    items: projects.slice(
      safePage * PROJECTS_PER_PAGE,
      safePage * PROJECTS_PER_PAGE + PROJECTS_PER_PAGE,
    ),
  };
}
