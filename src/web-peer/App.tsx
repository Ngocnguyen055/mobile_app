import { useWebPeer } from "./useWebPeer.ts";

export function App() {
  const peer = useWebPeer();

  return (
    <main>
      <header>
        <h1>DS01 Web Peer</h1>
        <p>WebRTC DataChannel → Socket.IO relay</p>
      </header>
      <section className="card">
        <label>
          Peer ID{" "}
          <input
            value={peer.peerId}
            onChange={(event) => peer.setPeerId(event.target.value)}
            disabled={peer.connected}
            placeholder="peer-a"
          />
        </label>
        <button onClick={() => void peer.connect()} disabled={peer.connected}>
          Đăng ký
        </button>
        <button onClick={peer.disconnect} disabled={!peer.connected}>
          Ngắt
        </button>
        <strong>{peer.connected ? "Online" : "Offline"}</strong>
      </section>

      {peer.error && (
        <p className="error" role="alert">
          {peer.error}
        </p>
      )}

      <div className="grid">
        <section className="card">
          <h2>Peer online</h2>
          {peer.online
            .filter((peerId) => peerId !== peer.peerId)
            .map((peerId) => (
              <button
                className={
                  peer.target === peerId && !peer.groupTarget ? "selected" : ""
                }
                key={peerId}
                onClick={() => {
                  peer.setTarget(peerId);
                  peer.setGroupTarget("");
                }}
              >
                {peerId} · {peer.modes[peerId] || "chưa kết nối"}
              </button>
            ))}
          <label>
            <input
              type="checkbox"
              checked={peer.forceRelay}
              onChange={(event) => peer.toggleForceRelay(event.target.checked)}
            />{" "}
            Mô phỏng DIRECT thất bại (ép RELAY)
          </label>

          <h2>Nhóm</h2>
          {peer.groups.map((group) => (
            <button
              className={peer.groupTarget === group.id ? "selected" : ""}
              key={group.id}
              onClick={() => {
                peer.setGroupTarget(group.id);
                peer.setTarget("");
              }}
            >
              {group.id.slice(0, 8)} · {group.members.join(", ")}
            </button>
          ))}
          <input
            value={peer.memberText}
            onChange={(event) => peer.setMemberText(event.target.value)}
            placeholder="Peer ID, ngăn cách bằng dấu phẩy"
          />
          <button onClick={() => void peer.createGroup()}>Tạo nhóm</button>
          <button
            disabled={!peer.groupTarget}
            onClick={() => void peer.changeGroup("add")}
          >
            Thêm
          </button>
          <button
            disabled={!peer.groupTarget}
            onClick={() => void peer.changeGroup("remove")}
          >
            Xóa
          </button>
        </section>

        <section className="card chat">
          <h2>
            {peer.groupTarget
              ? `Nhóm ${peer.groupTarget.slice(0, 8)}`
              : peer.target
                ? `Chat ${peer.target}`
                : "Chọn peer hoặc nhóm"}
          </h2>
          <div className="messages">
            {peer.visible.map((row, index) => (
              <article
                key={`${row.message.messageId}-${row.message.receiverId}-${index}`}
              >
                <small>
                  {new Date(row.message.timestamp).toLocaleTimeString()} ·{" "}
                  {row.message.senderId} → {row.message.receiverId} ·{" "}
                  <b>{row.message.mode}</b> · {row.status}
                </small>
                <div>{row.message.body}</div>
                <small title={row.message.messageId}>
                  Message ID: {row.message.messageId}
                </small>
              </article>
            ))}
          </div>
          <div className="compose">
            <input
              value={peer.body}
              onChange={(event) => peer.setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void peer.send();
              }}
              placeholder="Tin nhắn"
            />
            <button
              disabled={!peer.connected || (!peer.target && !peer.groupTarget)}
              onClick={() => void peer.send()}
            >
              Gửi
            </button>
          </div>
        </section>
      </div>

      <section className="card">
        <h2>Log peer</h2>
        <pre>{peer.logs.join("\n")}</pre>
      </section>
    </main>
  );
}
