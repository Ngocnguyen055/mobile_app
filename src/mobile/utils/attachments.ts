import * as FileSystem from "expo-file-system/legacy";

import { attachmentValidationError } from "../domain/attachmentPolicy.ts";

type SelectedAttachment = {
  uri: string;
  name?: string | null;
  size?: number | null;
};

export async function selectedAttachmentValidationError(
  existingCount: number,
  selected: SelectedAttachment[],
) {
  const countError = attachmentValidationError(existingCount, selected);
  if (countError) return countError;
  const resolved = await Promise.all(
    selected.map(async (file) => {
      if (typeof file.size === "number") return file;
      const info = await FileSystem.getInfoAsync(file.uri);
      return { ...file, size: info.exists ? info.size : null };
    }),
  );
  const unknown = resolved.find((file) => typeof file.size !== "number");
  if (unknown)
    return `Không xác định được kích thước tệp “${unknown.name || "đã chọn"}”.`;
  return attachmentValidationError(existingCount, resolved);
}
