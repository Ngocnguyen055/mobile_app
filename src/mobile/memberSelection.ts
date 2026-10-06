import type { User } from "./api.ts";

export function filterMembersByEmail<T extends Pick<User, "_id" | "name" | "email">>(
  users: readonly T[],
  query: string,
): T[] {
  const search = query.trim().toLowerCase();
  return users.filter((user) => user.email.toLowerCase().includes(search));
}
