import { useEffect, useRef, useState } from "react";
import {
  PeerClient,
  isDirectMessageBetween,
  type Group,
  type StoredMessage,
} from "@ds01/shared";
import { WebStore } from "./store.ts";

const signalUrl = import.meta.env.VITE_SIGNAL_URL || "http://localhost:4001";
const relayUrl = import.meta.env.VITE_RELAY_URL || "http://localhost:4002";

function getDemoSecret() {
  const old = localStorage.getItem("ds01-peer-secret");
  if (old) return old;
  const value = crypto.randomUUID() + crypto.randomUUID();
  localStorage.setItem("ds01-peer-secret", value);
  return value;
}

/** Owns peer lifecycle and exposes view state to the web demo. */
export function useWebPeer() {
  const [peerId, setPeerId] = useState(
    localStorage.getItem("ds01-peer-id") || "",
  );
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState<string[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [target, setTarget] = useState("");
  const [groupTarget, setGroupTarget] = useState("");
  const [body, setBody] = useState("");
  const [memberText, setMemberText] = useState("");
  const [forceRelay, setForceRelay] = useState(false);
  const [modes, setModes] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState("");
  const client = useRef<PeerClient | null>(null);
  const store = useRef(new WebStore(peerId));
  const refresh = () => void store.current.list().then(setMessages);

  useEffect(() => {
    refresh();
    return () => client.current?.close();
  }, []);

  const connect = async () => {
    setError("");
    client.current?.close();
    store.current = new WebStore(peerId);
    refresh();
    const peer = new PeerClient({
      peerId,
      identityProof: getDemoSecret(),
      signalUrl,
      relayUrl,
      rtc: RTCPeerConnection,
      store: store.current,
      forceRelay,
      onEvent: (event) => {
        if (event.kind === "presence") setOnline(event.peers || []);
        if (event.kind === "group")
          setGroups((current) =>
            [
              ...current.filter((group) => group.id !== event.group?.id),
              event.group!,
            ].filter((group) => group.members.includes(peerId)),
          );
        if (event.kind === "mode" && event.peerId)
          setModes((current) => ({
            ...current,
            [event.peerId!]: event.mode!,
          }));
        if (event.kind === "message") refresh();
        if (event.kind === "log")
          setLogs((current) =>
            [
              `${new Date().toLocaleTimeString()} ${event.text}`,
              ...current,
            ].slice(0, 150),
          );
      },
    });
    client.current = peer;
    try {
      await peer.connect();
      localStorage.setItem("ds01-peer-id", peerId);
      setConnected(true);
      setGroups(peer.getGroups());
    } catch (caught) {
      setError(String(caught));
      peer.close();
      setConnected(false);
    }
  };

  const disconnect = () => {
    client.current?.close();
    setConnected(false);
  };

  const send = async () => {
    setError("");
    try {
      if (!client.current) throw new Error("connect first");
      if (groupTarget) {
        const result = await client.current.sendGroup(groupTarget, body);
        const failed = Object.entries(result).filter(
          ([, status]) => status === "rejected",
        );
        if (failed.length)
          setError(`Delivery failed: ${failed.map(([id]) => id).join(", ")}`);
      } else {
        await client.current.sendDirect(target, body);
      }
      setBody("");
      refresh();
    } catch (caught) {
      setError(String(caught));
      refresh();
    }
  };

  const createGroup = async () => {
    try {
      await client.current?.createGroup(
        memberText
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      );
      setMemberText("");
    } catch (caught) {
      setError(String(caught));
    }
  };

  const changeGroup = async (action: "add" | "remove") => {
    try {
      await client.current?.changeGroup(groupTarget, memberText.trim(), action);
      setMemberText("");
    } catch (caught) {
      setError(String(caught));
    }
  };

  const toggleForceRelay = (value: boolean) => {
    setForceRelay(value);
    if (client.current) client.current.forceRelay = value;
  };

  const visible = messages.filter((row) =>
    groupTarget
      ? row.message.groupId === groupTarget
      : isDirectMessageBetween(row.message, peerId, target),
  );

  return {
    peerId,
    setPeerId,
    connected,
    online,
    groups,
    target,
    setTarget,
    groupTarget,
    setGroupTarget,
    body,
    setBody,
    memberText,
    setMemberText,
    forceRelay,
    modes,
    visible,
    logs,
    error,
    connect,
    disconnect,
    send,
    createGroup,
    changeGroup,
    toggleForceRelay,
  };
}
