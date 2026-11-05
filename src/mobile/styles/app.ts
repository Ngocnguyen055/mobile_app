import { accountStyles } from "./app/account.ts";
import { chatStyles } from "./app/chat.ts";
import { commonStyles } from "./app/common.ts";
import { layoutStyles } from "./app/layout.ts";
import { projectDateFilterStyles } from "./app/projectDateFilter.ts";
import { projectsStyles } from "./app/projects.ts";
import { tasksStyles } from "./app/tasks.ts";

// A single registry keeps existing UI imports stable; edit styles in their feature file.
export const styles = {
  ...layoutStyles,
  ...commonStyles,
  ...projectsStyles,
  ...projectDateFilterStyles,
  ...tasksStyles,
  ...chatStyles,
  ...accountStyles,
};
