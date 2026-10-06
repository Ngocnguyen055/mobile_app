import { Project, User } from "./models.ts";

export type Contact = {
  id: string;
  name: string;
  email: string;
};

type ContactRow = {
  _id: unknown;
  name: string;
  email: string;
};

const contactOrder = new Intl.Collator("vi", {
  numeric: true,
  sensitivity: "variant",
});

export async function listContactsForUser(userId: string): Promise<Contact[]> {
  const sharedMemberIds = await Project.distinct("members", { members: userId });
  const contactIds = [
    ...new Set(sharedMemberIds.map((memberId) => String(memberId))),
  ].filter((memberId) => memberId && memberId !== userId);

  if (!contactIds.length) return [];

  const allowedIds = new Set(contactIds);
  const rows = await User.find({
    _id: { $in: contactIds, $ne: userId },
  })
    .select("name email")
    .lean<ContactRow[]>();

  const contacts = new Map<string, Contact>();
  for (const row of rows) {
    const id = String(row._id);
    if (!allowedIds.has(id) || contacts.has(id)) continue;
    contacts.set(id, { id, name: row.name, email: row.email });
  }

  return [...contacts.values()].sort(
    (left, right) =>
      contactOrder.compare(left.name, right.name) ||
      contactOrder.compare(left.email, right.email) ||
      left.id.localeCompare(right.id),
  );
}
