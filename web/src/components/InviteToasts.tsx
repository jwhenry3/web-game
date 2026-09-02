import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { focusPrimaryDialogButton } from "../ui/dialogFocus";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import type { FriendRequestPayload } from "../types";

function toastKey(kind: "party" | "battle" | "friend", id: string) {
  return `${kind}:${id}`;
}

function ActionToast({
  title,
  message,
  hint,
  acceptLabel,
  onAccept,
  onDecline,
  onDismiss,
}: {
  title: string;
  message: string;
  hint?: string;
  acceptLabel: string;
  onAccept: () => void;
  onDecline: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="xiv-toast xiv-panel">
      <div className="xiv-panel-head">{title}</div>
      <p className="xiv-toast-message">{message}</p>
      {hint && <p className="hint">{hint}</p>}
      <div className="xiv-toast-actions">
        <button type="button" className="xiv-btn gold" onClick={onAccept}>
          {acceptLabel}
        </button>
        <button type="button" className="xiv-btn" onClick={onDecline}>
          Decline
        </button>
        <button type="button" className="xiv-btn" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

function friendRequestKey(req: FriendRequestPayload) {
  return toastKey("friend", req.from_id || req.from_name.toLowerCase());
}

export function InviteToasts() {
  const profile = useGame((s) => s.profile);
  const selfId = useGame((s) => s.selfId);
  const players = useGame((s) => s.players);
  const partyInvite = useGame((s) => s.partyInvite);
  const battleInvite = useGame((s) => s.battleInvite);
  const friendRequests = useGame((s) => s.friendRequests);
  const [dismissedParty, setDismissedParty] = useState<string | null>(null);
  const [dismissedBattle, setDismissedBattle] = useState<string | null>(null);
  const [dismissedFriends, setDismissedFriends] = useState<Set<string>>(() => new Set());

  const self = selfId ? players[selfId] : undefined;
  const inBattle = self?.in_battle ?? false;

  const partyKey = partyInvite ? toastKey("party", partyInvite.from_id) : null;
  const battleKey = battleInvite ? toastKey("battle", battleInvite.battle_id) : null;

  const visibleFriendRequests = useMemo(
    () => friendRequests.filter((req) => !dismissedFriends.has(friendRequestKey(req))),
    [friendRequests, dismissedFriends],
  );

  const showParty = !!profile && !!selfId && !!partyInvite && partyKey !== dismissedParty;
  const showBattle =
    !!profile && !!selfId && !!battleInvite && battleKey !== dismissedBattle && !inBattle;
  const hasToast = showParty || showBattle || visibleFriendRequests.length > 0;

  useEffect(() => {
    if (!hasToast) return;
    const t = window.setTimeout(() => focusPrimaryDialogButton(), 0);
    return () => window.clearTimeout(t);
  }, [hasToast, showParty, showBattle, visibleFriendRequests.length]);

  if (!profile || !selfId) return null;
  if (!hasToast) return null;

  const dismissFriend = (key: string) => {
    setDismissedFriends((prev) => new Set(prev).add(key));
  };

  return createPortal(
    <div className="xiv-toast-stack">
      {visibleFriendRequests.map((req) => {
        const key = friendRequestKey(req);
        return (
          <ActionToast
            key={key}
            title="Friend Request"
            message={`${req.from_name} wants to be friends.`}
            acceptLabel="Accept"
            onAccept={() => net.acceptFriend(req.from_name)}
            onDecline={() => net.declineFriend(req.from_name)}
            onDismiss={() => dismissFriend(key)}
          />
        );
      })}
      {showParty && partyInvite && partyKey && (
        <ActionToast
          title="Party Invite"
          message={`${partyInvite.from_name} invited you to their party.`}
          acceptLabel="Accept"
          onAccept={() => net.partyAccept()}
          onDecline={() => net.partyDecline()}
          onDismiss={() => setDismissedParty(partyKey)}
        />
      )}
      {showBattle && battleInvite && battleKey && (
        <ActionToast
          title="Battle Nearby"
          message={`${battleInvite.from_name} engaged a foe nearby.`}
          hint="Declining still earns passive EXP if your party wins."
          acceptLabel="Join"
          onAccept={() => net.joinBattle(battleInvite.battle_id)}
          onDecline={() => net.declineBattleInvite()}
          onDismiss={() => setDismissedBattle(battleKey)}
        />
      )}
    </div>,
    document.body,
  );
}
