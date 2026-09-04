import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { CHAT_TABS } from "../types";
import { registerChatControl } from "../input/chatControl";

const CHAT_SIZE_KEY = "cm.chatSize";
const CHAT_MIN_W = 320;
const CHAT_MIN_H = 220;
const CHAT_MAX_W = 720;
const CHAT_MAX_H = 560;
const CHAT_DEFAULT = { w: 420, h: 300 };

function loadChatSize(): { w: number; h: number } {
  try {
    const raw = localStorage.getItem(CHAT_SIZE_KEY);
    if (!raw) return CHAT_DEFAULT;
    const parsed = JSON.parse(raw) as { w?: number; h?: number };
    const w = typeof parsed.w === "number" ? parsed.w : CHAT_DEFAULT.w;
    const h = typeof parsed.h === "number" ? parsed.h : CHAT_DEFAULT.h;
    return {
      w: Math.min(CHAT_MAX_W, Math.max(CHAT_MIN_W, w)),
      h: Math.min(CHAT_MAX_H, Math.max(CHAT_MIN_H, h)),
    };
  } catch {
    return CHAT_DEFAULT;
  }
}

export function SidePanel() {
  const battles = useGame((s) => s.battles);
  const chat = useGame((s) => s.chat);
  const chatTab = useGame((s) => s.chatTab);
  const setChatTab = useGame((s) => s.setChatTab);
  const screen = useGame((s) => s.screen);
  const [draft, setDraft] = useState("");
  const [size, setSize] = useState(loadChatSize);
  const draftRef = useRef(draft);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    origW: number;
    origH: number;
  } | null>(null);
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

  const onResizePointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origW: size.w,
        origH: size.h,
      };
    },
    [size.w, size.h],
  );

  const onResizePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const d = resizeRef.current;
    if (!d) return;
    // Grow up/right from bottom-left anchored chat.
    const next = {
      w: Math.min(CHAT_MAX_W, Math.max(CHAT_MIN_W, d.origW + (e.clientX - d.startX))),
      h: Math.min(CHAT_MAX_H, Math.max(CHAT_MIN_H, d.origH - (e.clientY - d.startY))),
    };
    setSize(next);
  }, []);

  const endResize = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setSize((cur) => {
      try {
        localStorage.setItem(CHAT_SIZE_KEY, JSON.stringify(cur));
      } catch {
        /* ignore */
      }
      return cur;
    });
  }, []);

  const inBattle = screen === "battle";

  const onChatKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
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
        <div className="cm-hud-left">
          <div className="cm-panel cm-duty">
            <div className="cm-panel-head">Engagements</div>
            {battles.length === 0 && <div className="dim">No engagements.</div>}
            {battles.map((b) => {
              const full = b.participants >= b.max_players;
              return (
                <div key={b.battle_id} className="cm-duty-line">
                  <span>
                    {b.battle_id}{" "}
                    <span className="dim">
                      {b.participants}/{b.max_players}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="cm-btn"
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

      <div className="cm-chat" style={{ width: size.w, height: size.h }}>
        <div className="cm-chat-tabs">
          {CHAT_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`cm-tab ${chatTab === t.id ? "on" : ""}`}
              tabIndex={-1}
              onClick={() => setChatTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="cm-chat-log">
          {visible.map((m, i) => (
            <div
              key={i}
              className={`cm-chat-line ch-${m.channel}${m.tone ? ` tone-${m.tone}` : ""}`}
            >
              {m.from_name ? <span className="cm-chat-name">[{m.from_name}]</span> : null} {m.message}
            </div>
          ))}
          {visible.length === 0 && (
            <div className="dim">{chatTab === "general" ? "No messages." : `No ${chatTab} messages.`}</div>
          )}
          <div ref={chatEndRef} />
        </div>
        {chatTab === "general" && (
          <div className="cm-chat-input">
            <input
              ref={inputRef}
              className="cm-input"
              value={draft}
              maxLength={300}
              placeholder="Say something… (Enter)"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onChatKeyDown}
            />
          </div>
        )}
        <div
          className="cm-chat-resize"
          title="Drag to resize"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
        />
      </div>
    </>
  );
}
