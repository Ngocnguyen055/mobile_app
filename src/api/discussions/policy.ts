export function canEditDiscussion(authorId: string, userId: string) {
  return authorId === userId;
}
export function canRemoveDiscussion(
  authorId: string,
  userId: string,
  moderate: boolean,
) {
  return authorId === userId || moderate;
}
export function canReadDiscussion(
  hidden: boolean,
  authorId: string,
  userId: string,
  moderate: boolean,
) {
  return !hidden || authorId === userId || moderate;
}
