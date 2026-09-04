import { useMemo, useState, type ReactNode } from "react";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import type { FriendInfo, PartyMember, WorldPlayer } from "../types";

type SocialTab = "search" | "friends" | "party";

function PlayerRow({
  p,
  selfId,
  actions,
}: {
  p: Pick<WorldPlayer, "id" | "name" | "level" | "weapon" | "in_battle">;
  selfId: string | null;
  actions?: ReactNode;
}) {
  const isSelf = p.id === selfId;
  return (
    <div className={`cm-social-row ${isSelf ? "self" : ""}`}>
      <div className="cm-social-row-main">
        <span className="cm-party-name">{p.name}</span>
        <span className="dim">
          Lv{p.level} {p.weapon || "—"}
        </span>
        {p.in_battle && <span className="cm-tag">In Combat</span>}
      </div>
      {actions && <div className="cm-social-row-actions">{actions}</div>}
    </div>
  );
}

function FriendRow({ f, actions }: { f: FriendInfo; actions?: React.ReactNode }) {
  return (
    <div className="cm-social-row">
      <div className="cm-social-row-main">
        <span className="cm-party-name">{f.name}</span>
        <span className="dim">
          {f.online ? `Lv${f.level} ${f.weapon || "—"}` : "Offline"}
        </span>
        {f.online && f.in_battle && <span className="cm-tag">In Combat</span>}
      </div>
      {actions && <div className="cm-social-row-actions">{actions}</div>}
    </div>
  );
}

export function SocialPane() {
  const selfId = useGame((s) => s.selfId);
  const players = useGame((s) => s.players);
  const friends = useGame((s) => s.friends);
  const outgoingFriendRequests = useGame((s) => s.outgoingFriendRequests);
  const party = useGame((s) => s.party);
  const [tab, setTab] = useState<SocialTab>("search");
  const [query, setQuery] = useState("");

  const online = useMemo(
    () => Object.values(players).sort((a, b) => a.name.localeCompare(b.name)),
    [players],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return online;
    return online.filter((p) => p.name.toLowerCase().includes(q));
  }, [online, query]);

  const friendNames = useMemo(() => new Set(friends.map((f) => f.name.toLowerCase())), [friends]);
  const pendingOutgoing = useMemo(
    () => new Set(outgoingFriendRequests.map((n) => n.toLowerCase())),
    [outgoingFriendRequests],
  );
  const inParty = useMemo(() => new Set(party?.members.map((m) => m.id) ?? []), [party]);
  const isLeader = party?.leader_id === selfId;

  const inviteDisabled = (targetId: string) => inParty.has(targetId) || targetId === selfId;

  return (
    <div className="cm-social">
      <div className="cm-social-tabs">
        {(
          [
            ["search", "Search"],
            ["friends", "Friends"],
            ["party", "Party"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={`cm-tab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "search" && (
        <div className="cm-social-pane">
          <input
            className="cm-input"
            value={query}
            maxLength={40}
            placeholder="Search online heroes…"
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="cm-search-meta dim">
            {query.trim()
              ? `${matches.length} match${matches.length === 1 ? "" : "es"}`
              : `${matches.length} online`}
          </div>
          <div className="cm-social-list">
            {matches.length === 0 && <div className="dim">No heroes found.</div>}
            {matches.map((p) => (
              <PlayerRow
                key={p.id}
                p={p}
                selfId={selfId}
                actions={
                  p.id !== selfId && (
                    <>
                      {!friendNames.has(p.name.toLowerCase()) &&
                        (pendingOutgoing.has(p.name.toLowerCase()) ? (
                          <button className="cm-btn" disabled>
                            Pending
                          </button>
                        ) : (
                          <button className="cm-btn" onClick={() => net.addFriend(p.name)}>
                            Friend
                          </button>
                        ))}
                      <button
                        className="cm-btn"
                        disabled={inviteDisabled(p.id) || (!!party && !isLeader)}
                        onClick={() => net.partyInvite(p.name)}
                      >
                        Invite
                      </button>
                    </>
                  )
                }
              />
            ))}
          </div>
        </div>
      )}

      {tab === "friends" && (
        <div className="cm-social-pane">
          <div className="cm-search-meta dim">{friends.length} friend{friends.length === 1 ? "" : "s"}</div>
          <div className="cm-social-list">
            {friends.length === 0 && <div className="dim">Use Search to add friends.</div>}
            {friends.map((f) => {
              const wp = online.find((p) => p.name.toLowerCase() === f.name.toLowerCase());
              return (
                <FriendRow
                  key={f.name}
                  f={f}
                  actions={
                    <>
                      {wp && (
                        <button
                          className="cm-btn"
                          disabled={inviteDisabled(wp.id) || (!!party && !isLeader)}
                          onClick={() => net.partyInvite(wp.name)}
                        >
                          Invite
                        </button>
                      )}
                      <button className="cm-btn" onClick={() => net.removeFriend(f.name)}>
                        Remove
                      </button>
                    </>
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      {tab === "party" && (
        <div className="cm-social-pane">
          {!party ? (
            <div className="dim">No party. Invite a friend from Search or Friends.</div>
          ) : (
            <>
              <div className="cm-search-meta dim">
                {party.members.length}/{4} members · {isLeader ? "You lead" : "Party"}
              </div>
              <div className="cm-social-list">
                {party.members.map((m: PartyMember) => (
                  <div key={m.id} className={`cm-social-row ${m.id === selfId ? "self" : ""}`}>
                    <div className="cm-social-row-main">
                      <span className="cm-party-name">
                        {m.name}
                        {m.leader ? " ★" : ""}
                      </span>
                      <span className="dim">
                        Lv{m.level} {m.weapon || "—"}
                      </span>
                      {m.in_battle && <span className="cm-tag">In Combat</span>}
                    </div>
                    {isLeader && m.id !== selfId && (
                      <button className="cm-btn" onClick={() => net.partyKick(m.id)}>
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button className="cm-btn wide" onClick={() => net.partyLeave()}>
                Leave Party
              </button>
              <p className="hint">Any party member can start fights. Nearby allies are prompted to join.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
