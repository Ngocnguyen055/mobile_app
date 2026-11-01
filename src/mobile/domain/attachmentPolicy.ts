export const MAX_ATTACHMENT_COUNT = 3;
export const MAX_ATTACHMENT_BYTES = 512 * 1024;

type AttachmentCandidate = {
  name?: string | null;
  size?: number | null;
};

export function attachmentValidationError(
  existingCount: number,
  selected: AttachmentCandidate[],
) {
  if (existingCount + selected.length > MAX_ATTACHMENT_COUNT)
    return `Mỗi lần chỉ được chọn tối đa ${MAX_ATTACHMENT_COUNT} tệp.`;
  const oversized = selected.find(
    (file) => typeof file.size === "number" && file.size > MAX_ATTACHMENT_BYTES,
  );
  if (oversized)
    return `Tệp “${oversized.name || "đã chọn"}” vượt quá 512 KiB.`;
  return null;
}
