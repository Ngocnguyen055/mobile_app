import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApi } from '../src/api/index.ts';

const mongoUrl = process.env.MONGO_URL;
if (!mongoUrl) throw new Error('Thiếu MONGO_URL trong .env');

await mongoose.connect(mongoUrl);
const server = createApi().listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
let token = '';
let eventId = '';
let ownerToken = '';

async function request(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (response.headers.get('content-type') || '').includes('json') ? await response.json() : await response.text();
  return { response, payload };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

try {
  const login = await request('/auth/login', 'POST', { email: 'binh@example.test', password: 'StudentDemo123!' });
  assert(login.response.ok, `Đăng nhập seed thất bại (${login.response.status}); hãy chạy npm run seed trước`);
  token = String((login.payload as { token?: string }).token || '');
  assert(token, 'API không trả token');
  ownerToken = token;

  const startsAt = new Date(Date.now() + 2 * 86400000);
  const endsAt = new Date(startsAt.getTime() + 3600000);
  const marker = `verify-${randomUUID()}`;
  const draft = {
    projectId: null,
    title: `Kiểm tra lịch ${marker}`,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    note: 'Tạo tạm bởi scripts/verify-calendar.ts',
    allDay: false,
    reminderOffsets: [3600000],
  };

  const created = await request('/events', 'POST', draft);
  assert(created.response.status === 201, `Tạo sự kiện thất bại: ${created.response.status} ${JSON.stringify(created.payload)}`);
  eventId = String((created.payload as { _id?: string })._id || '');
  assert(eventId, 'Sự kiện mới thiếu _id');

  const calendar = await request('/calendar');
  assert(calendar.response.ok, `Đọc lịch thất bại: ${calendar.response.status}`);
  const rows = (calendar.payload as { events?: { _id: string }[] }).events || [];
  assert(rows.some(event => event._id === eventId), 'Lịch tổng hợp không chứa sự kiện cá nhân vừa tạo');

  const secondLogin = await request('/auth/login', 'POST', { email: 'an@example.test', password: 'StudentDemo123!' });
  assert(secondLogin.response.ok, `Đăng nhập user thứ hai thất bại: ${secondLogin.response.status}`);
  token = String((secondLogin.payload as { token?: string }).token || '');
  const otherCalendar = await request('/calendar');
  const otherRows = (otherCalendar.payload as { events?: { _id: string }[] }).events || [];
  assert(!otherRows.some(event => event._id === eventId), 'User khác nhìn thấy sự kiện cá nhân');
  assert((await request(`/events/${eventId}`, 'PATCH', { note: 'không được phép' })).response.status === 404, 'User khác sửa được sự kiện cá nhân');
  assert((await request(`/events/${eventId}`, 'DELETE')).response.status === 404, 'User khác xóa được sự kiện cá nhân');
  token = ownerToken;

  const updated = await request(`/events/${eventId}`, 'PATCH', { ...draft, note: 'Đã sửa và giữ projectId=null' });
  assert(updated.response.ok, `Sửa sự kiện thất bại: ${updated.response.status} ${JSON.stringify(updated.payload)}`);
  assert((updated.payload as { note?: string }).note === 'Đã sửa và giữ projectId=null', 'API không lưu ghi chú đã sửa');

  const projects = await request('/projects');
  const projectId = String(((projects.payload as { _id?: string }[])[0]?._id) || '');
  assert(projectId, 'Tài khoản seed chưa có dự án để kiểm tra quyền sự kiện dự án');
  const movedToProject = await request(`/events/${eventId}`, 'PATCH', { projectId });
  assert(movedToProject.response.ok, `Người tạo không chuyển được event vào dự án: ${movedToProject.response.status}`);

  token = String((secondLogin.payload as { token?: string }).token || '');
  const memberEdit = await request(`/events/${eventId}`, 'PATCH', { note: 'Thành viên dự án đã sửa nội dung' });
  assert(memberEdit.response.ok, `Thành viên dự án không sửa được nội dung event: ${memberEdit.response.status}`);
  const memberMove = await request(`/events/${eventId}`, 'PATCH', { projectId: null });
  assert(memberMove.response.status === 403, `Người không tạo đã chuyển được event khỏi dự án: ${memberMove.response.status}`);
  token = ownerToken;
  assert((await request(`/events/${eventId}`, 'PATCH', { projectId: null })).response.ok, 'Người tạo không chuyển được event về lịch cá nhân');

  const invalid = await request(`/events/${eventId}`, 'PATCH', { startsAt: endsAt.toISOString(), endsAt: startsAt.toISOString() });
  assert(invalid.response.status === 400, `API phải từ chối endsAt <= startsAt, nhận ${invalid.response.status}`);
  const invalidReminder = await request('/events', 'POST', { ...draft, title: `${draft.title} invalid offset`, reminderOffsets: [12345] });
  assert(invalidReminder.response.status === 400, `API phải từ chối reminder offset lạ, nhận ${invalidReminder.response.status}`);
  const spoofCreator = await request('/events', 'POST', { ...draft, title: `${draft.title} spoof`, createdBy: '000000000000000000000000' });
  assert(spoofCreator.response.status === 400, `API phải từ chối createdBy từ client, nhận ${spoofCreator.response.status}`);

  const removed = await request(`/events/${eventId}`, 'DELETE');
  assert(removed.response.ok, `Xóa sự kiện thất bại: ${removed.response.status}`);
  eventId = '';
  console.log('Calendar API integration passed: aggregate, CRUD, two-user ACL, project move, validation, cleanup');
} finally {
  token = ownerToken || token;
  if (eventId && token) await request(`/events/${eventId}`, 'DELETE').catch(() => undefined);
  await new Promise<void>(resolve => server.close(() => resolve()));
  await mongoose.disconnect();
}
