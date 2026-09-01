import { useEffect, useRef, useState } from "react";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { CHAT_TABS } from "../types";

export function SidePanel() {
  const battles = useGame((s) => s.battles);
  const chat = useGame((s) => s.chat);
  const chatTab = useGame((s) => s.chatTab);
  const setChatTab = useGame((s) => s.setChatTab);
  const screen = useGame((s) => s.screen);
  const [draft, setDraft] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const visible = chat.filter((m) => m.channel === chatTab);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visible.length, chatTab]);

  const inBattle = screen === "battle";

  const sendChat = () => {
    if (draft.trim()) {
      net.chat(draft.trim());
      setDraft("");
    }
  };

  return (
    <>
      {screen === "world" && (
        <div className="xiv-hud-left">
          <div className="xiv-panel xiv-duty">
            <div className="xiv-panel-head">Duties</div>
            {battles.length === 0 && <div className="dim">No engagements.</div>}
            {battles.map((b) => {
              const full = b.participants >= b.max_players;
              return (
                <div key={b.battle_id} className="xiv-duty-line">
                  <span>
                    {b.battle_id}{" "}
                    <span className="dim">
                      {b.participants}/{b.max_players}
                    </span>
                  </span>
                  <button className="xiv-btn" disabled={inBattle || full} onClick={() => net.joinBattle(b.battle_id)}>
                    {full ? "Full" : "Join"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="xiv-chat">
        <div className="xiv-chat-tabs">
          {CHAT_TABS.map((t) => (
            <button
              key={t.id}
              className={`xiv-tab ${chatTab === t.id ? "on" : ""}`}
              onClick={() => setChatTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="xiv-chat-log">
          {visible.map((m, i) => (
            <div key={i} className={`xiv-chat-line ch-${m.channel}`}>
              {m.from_name ? <span className="xiv-chat-name">[{m.from_name}]</span> : null} {m.message}
            </div>
          ))}
          {visible.length === 0 && <div className="dim">No {chatTab} messages.</div>}
          <div ref={chatEndRef} />
        </div>
        {chatTab === "general" && (
          <div className="xiv-chat-input">
            <input
              className="xiv-input"
              value={draft}
              maxLength={300}
              placeholder="Say something…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChat()}
            />
          </div>
        )}
      </div>
    </>
  );
}
