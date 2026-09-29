import "dotenv/config";
import { io } from "socket.io-client";
import { randomUUID } from "node:crypto";

const signalUrl = process.env.PUBLIC_SIGNAL_URL || "http://localhost:4001";
const relayUrl = process.env.PUBLIC_RELAY_URL || "http://localhost:4002";
const suffix = randomUUID().slice(0, 8);
const peers = [`bench-a-${suffix}`, `bench-b-${suffix}`];
async function register(peerId: string) {
  const signal = io(signalUrl);
  await new Promise<void>((resolve) => signal.on("connect", resolve));
  const registered = await signal
    .timeout(4000)
    .emitWithAck("peer:register", {
      peerId,
      identityProof: randomUUID() + randomUUID(),
    });
  if (!registered.ok) throw new Error(registered.error);
  const relay = io(relayUrl, { auth: { token: registered.token } });
  await new Promise<void>((resolve) => relay.on("connect", resolve));
  return { signal, relay };
}
const [a, b] = await Promise.all(peers.map(register));
const pending = new Map<string, () => void>();
b.relay.on("relay:receive", (message: { messageId: string }) =>
  pending.get(message.messageId)?.(),
);
const times: number[] = [];
for (let i = 0; i < 100; i++) {
  const messageId = randomUUID();
  const delivered = new Promise<void>((resolve) =>
    pending.set(messageId, resolve),
  );
  const start = performance.now();
  const result = await a.relay
    .timeout(4000)
    .emitWithAck("relay:send", {
      messageId,
      sessionId: randomUUID(),
      senderId: peers[0],
      receiverId: peers[1],
      type: "text",
      timestamp: Date.now(),
      body: `benchmark ${i}`,
      mode: "RELAY",
      attempt: 1,
      sequence: i,
    });
  if (!result.ok) throw new Error(result.error);
  await Promise.race([
    delivered,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("delivery timeout")), 4000),
    ),
  ]);
  times.push(performance.now() - start);
  pending.delete(messageId);
}
times.sort((x, y) => x - y);
console.log(
  JSON.stringify(
    {
      count: times.length,
      p50_ms: times[49],
      p95_ms: times[94],
      max_ms: times[99],
      measuredAt: new Date().toISOString(),
      signalUrl,
      relayUrl,
    },
    null,
    2,
  ),
);
a.signal.disconnect();
a.relay.disconnect();
b.signal.disconnect();
b.relay.disconnect();
