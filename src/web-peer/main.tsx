import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PeerClient, type Group, type StoredMessage } from '@ds01/shared';
import { WebStore } from './store.ts';
import './style.css';

const signalUrl = import.meta.env.VITE_SIGNAL_URL || 'http://localhost:4001';
const relayUrl = import.meta.env.VITE_RELAY_URL || 'http://localhost:4002';
const demoSecret = (() => { const old = localStorage.getItem('ds01-peer-secret'); if (old) return old; const value = crypto.randomUUID() + crypto.randomUUID(); localStorage.setItem('ds01-peer-secret', value); return value; })();
function App() {
  const [peerId, setPeerId] = useState(localStorage.getItem('ds01-peer-id') || '');
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState<string[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [target, setTarget] = useState('');
  const [groupTarget, setGroupTarget] = useState('');
  const [body, setBody] = useState('');
  const [memberText, setMemberText] = useState('');
  const [forceRelay, setForceRelay] = useState(false);
  const [modes, setModes] = useState<Record<string,string>>({});
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState('');
  const client = useRef<PeerClient | null>(null);
  const store = useRef(new WebStore(peerId));
  const refresh = () => void store.current.list().then(setMessages);
  useEffect(() => { refresh(); return () => client.current?.close(); }, []);
  const connect = async () => {
    setError('');
    client.current?.close();
    store.current = new WebStore(peerId);
    refresh();
    const peer = new PeerClient({ peerId, identityProof: demoSecret, signalUrl, relayUrl, rtc: RTCPeerConnection, store: store.current, forceRelay,
      onEvent: event => {
        if (event.kind === 'presence') setOnline(event.peers || []);
        if (event.kind === 'group') setGroups(current => [...current.filter(g => g.id !== event.group?.id), event.group!].filter(g => g.members.includes(peerId)));
        if (event.kind === 'mode' && event.peerId) setModes(current => ({ ...current, [event.peerId!]: event.mode! }));
        if (event.kind === 'message') refresh();
        if (event.kind === 'log') setLogs(current => [`${new Date().toLocaleTimeString()} ${event.text}`, ...current].slice(0, 150));
      } });
    client.current = peer;
    try { await peer.connect(); localStorage.setItem('ds01-peer-id', peerId); setConnected(true); setGroups(peer.getGroups()); }
    catch (e) { setError(String(e)); peer.close(); setConnected(false); }
  };
  const send = async () => {
    setError('');
    try {
      if (!client.current) throw new Error('connect first');
      if (groupTarget) {
        const result = await client.current.sendGroup(groupTarget, body);
        const failed = Object.entries(result).filter(([,status]) => status === 'rejected');
        if (failed.length) setError(`Delivery failed: ${failed.map(([id]) => id).join(', ')}`);
      } else { await client.current.send(target, body); }
      setBody(''); refresh();
    } catch (e) { setError(String(e)); refresh(); }
  };
  const createGroup = async () => { try { await client.current?.createGroup(memberText.split(',').map(s => s.trim()).filter(Boolean)); setMemberText(''); } catch (e) { setError(String(e)); } };
  const changeGroup = async (action: 'add'|'remove') => { try { await client.current?.changeGroup(groupTarget, memberText.trim(), action); setMemberText(''); } catch (e) { setError(String(e)); } };
  const visible = messages.filter(row => groupTarget ? row.message.groupId === groupTarget : !row.message.groupId && (row.message.senderId === target || row.message.receiverId === target));
  return <main>
    <header><h1>DS01 Web Peer</h1><p>WebRTC DataChannel → Socket.IO relay</p></header>
    <section className="card"><label>Peer ID <input value={peerId} onChange={e => setPeerId(e.target.value)} disabled={connected} placeholder="peer-a"/></label><button onClick={connect} disabled={connected}>Đăng ký</button><button onClick={() => { client.current?.close(); setConnected(false); }} disabled={!connected}>Ngắt</button><strong>{connected ? 'Online' : 'Offline'}</strong></section>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="grid"><section className="card"><h2>Peer online</h2>{online.filter(id => id !== peerId).map(id => <button className={target === id && !groupTarget ? 'selected' : ''} key={id} onClick={() => { setTarget(id); setGroupTarget(''); }}>{id} · {modes[id] || 'chưa kết nối'}</button>)}<label><input type="checkbox" checked={forceRelay} onChange={e => { setForceRelay(e.target.checked); if (client.current) client.current.forceRelay = e.target.checked; }}/> Mô phỏng DIRECT thất bại (ép RELAY)</label><h2>Nhóm</h2>{groups.map(group => <button className={groupTarget === group.id ? 'selected' : ''} key={group.id} onClick={() => { setGroupTarget(group.id); setTarget(''); }}>{group.id.slice(0,8)} · {group.members.join(', ')}</button>)}<input value={memberText} onChange={e => setMemberText(e.target.value)} placeholder="Peer ID, ngăn cách bằng dấu phẩy"/><button onClick={createGroup}>Tạo nhóm</button><button disabled={!groupTarget} onClick={() => changeGroup('add')}>Thêm</button><button disabled={!groupTarget} onClick={() => changeGroup('remove')}>Xóa</button></section>
    <section className="card chat"><h2>{groupTarget ? `Nhóm ${groupTarget.slice(0,8)}` : target ? `Chat ${target}` : 'Chọn peer hoặc nhóm'}</h2><div className="messages">{visible.map((row, index) => <article key={`${row.message.messageId}-${row.message.receiverId}-${index}`}><small>{new Date(row.message.timestamp).toLocaleTimeString()} · {row.message.senderId} → {row.message.receiverId} · <b>{row.message.mode}</b> · {row.status}</small><div>{row.message.body}</div></article>)}</div><div className="compose"><input value={body} onChange={e => setBody(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void send(); }} placeholder="Tin nhắn"/><button disabled={!connected || (!target && !groupTarget)} onClick={send}>Gửi</button></div></section></div>
    <section className="card"><h2>Log peer</h2><pre>{logs.join('\n')}</pre></section>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
