import type { Project } from "../services/api.ts";

export const PROJECTS_PER_PAGE = 5;

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi")
    .trim();
}

export function filterProjects(projects: Project[], query: string) {
  const keyword = normalizeSearch(query);
  if (!keyword) return projects;
  return projects.filter((project) =>
    normalizeSearch(project.name).includes(keyword),
  );
}

function createdTime(project: Project) {
  const timestamp = project.createdAt ? Date.parse(project.createdAt) : NaN;
  if (Number.isFinite(timestamp)) return timestamp;
  const objectIdTime = Number.parseInt(project._id.slice(0, 8), 16) * 1000;
  return Number.isFinite(objectIdTime) ? objectIdTime : 0;
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
