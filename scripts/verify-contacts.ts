import "dotenv/config";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import mongoose from "mongoose";
import { createApi } from "../src/api/index.ts";
import { Project } from "../src/api/models.ts";

const mongoUrl = process.env.MONGO_URL;
if (!mongoUrl) throw new Error("Thiếu MONGO_URL trong .env");
const email = process.env.CONTACTS_TEST_EMAIL || "binh@example.test";
const password = process.env.CONTACTS_TEST_PASSWORD || "StudentDemo123!";

await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 10_000 });
const server = createApi().listen(0, "127.0.0.1");
try {
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const unauthenticated = await fetch(`${url}/contacts`);
  assert.equal(unauthenticated.status, 401);
  const loginResponse = await fetch(`${url}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert(loginResponse.ok, "Đăng nhập kiểm thử thất bại; seed hoặc đặt CONTACTS_TEST_EMAIL/CONTACTS_TEST_PASSWORD");
  const login = await loginResponse.json() as { token: string; user: { id: string } };
  const response = await fetch(`${url}/contacts`, {
    headers: { Authorization: `Bearer ${login.token}` },
  });
  assert.equal(response.status, 200);
  const contacts = await response.json() as { id: string; name: string; email: string }[];
  const projects = await Project.find({ members: login.user.id }).populate("members", "name email").lean();
  const expectedIds = new Set<string>();
  for (const project of projects) {
    for (const member of project.members as unknown as { _id: unknown }[]) {
      if (member && String(member._id) !== login.user.id) expectedIds.add(String(member._id));
    }
  }
  assert.deepEqual(contacts.map(contact => contact.id).sort(), [...expectedIds].sort());
  for (const contact of contacts) {
    assert.deepEqual(Object.keys(contact).sort(), ["email", "id", "name"]);
    assert.equal(typeof contact.name, "string");
    assert.equal(typeof contact.email, "string");
  }
  console.log(`Contacts API integration passed: JWT, shared-project directory, no self/duplicates/private fields (${contacts.length} contacts). No database writes.`);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await mongoose.disconnect();
}
