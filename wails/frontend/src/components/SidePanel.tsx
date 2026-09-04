import { useEffect, useRef, useState } from "react";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { CHAT_TABS } from "../types";
import { registerChatControl } from "../input/chatControl";

export function SidePanel() {
  const battles = useGame((s) => s.battles);
  const chat = useGame((s) => s.chat);
  const chatTab = useGame((s) => s.chatTab);
  const setChatTab = useGame((s) => s.setChatTab);
  const screen = useGame((s) => s.screen);
  const [draft, setDraft] = useState("");
  const draftRef = useRef(draft);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const visible =
    chatTab === "general" ? chat : chat.filter((m) => m.channel === chatTab);

  draftRef.current = draft;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visible.length, chatTab]);

  const sendChat = () => {
    const text = draftRef.current.trim();
    if (!text) return;
    net.chat(text);
    setDraft("");
  };

  useEffect(() => {
    registerChatControl({
      focus: () => {
        setChatTab("general");
        requestAnimationFrame(() => inputRef.current?.focus());
      },
      blur: () => inputRef.current?.blur(),
      send: sendChat,
      getDraft: () => draftRef.current,
      isFocused: () => document.activeElement === inputRef.current,
    });
    return () => registerChatControl(null);
  }, [setChatTab]);

  const inBattle = screen === "battle";

  const onChatKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (draft.trim()) {
      sendChat();
    } else {
      inputRef.current?.blur();
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
                  <button
                    type="button"
                    className="xiv-btn"
                    tabIndex={-1}
                    disabled={inBattle || full}
                    onClick={() => net.joinBattle(b.battle_id)}
                  >
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
              type="button"
              className={`xiv-tab ${chatTab === t.id ? "on" : ""}`}
              tabIndex={-1}
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
          {visible.length === 0 && (
            <div className="dim">{chatTab === "general" ? "No messages." : `No ${chatTab} messages.`}</div>
          )}
          <div ref={chatEndRef} />
        </div>
        {chatTab === "general" && (
          <div className="xiv-chat-input">
            <input
              ref={inputRef}
              className="xiv-input"
              value={draft}
              maxLength={300}
              placeholder="Say something… (Enter)"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onChatKeyDown}
            />
          </div>
        )}
      </div>
    </>
  );
}
