import { createPortal } from "react-dom";
import { useGame } from "../state/store";
import { npcDialogueContent } from "../world/npcDialogue";

export function NpcDialog() {
  const dialog = useGame((s) => s.npcDialog);
  const profile = useGame((s) => s.profile);
  const close = useGame((s) => s.closeNpcDialog);
  const openJobChangeDialog = useGame((s) => s.openJobChangeDialog);

  if (!dialog) return null;

  const content = npcDialogueContent(dialog, profile);

  const onAction = (actionId: string) => {
    if (actionId === "goodbye") {
      close();
      return;
    }
    if (actionId === "change_main") {
      close();
      openJobChangeDialog({ id: dialog.id, name: dialog.name, mode: "main" });
      return;
    }
    if (actionId === "change_sub") {
      close();
      openJobChangeDialog({ id: dialog.id, name: dialog.name, mode: "sub" });
    }
  };

  return createPortal(
    <div className="xiv-skill-dialog-layer" onPointerDown={close}>
      <div className="xiv-panel xiv-skill-dialog xiv-npc-dialog" onPointerDown={(e) => e.stopPropagation()}>
        <div className="xiv-panel-head">{dialog.name}</div>
        <p className="xiv-npc-dialog-text">{content.greeting}</p>
        <div className="xiv-npc-dialog-actions">
          {content.actions.map((action) => (
            <div key={action.id} className="xiv-npc-dialog-action">
              <button
                type="button"
                className={`xiv-btn ${action.id === "goodbye" ? "" : "gold"}`}
                disabled={action.disabled}
                onClick={() => onAction(action.id)}
              >
                {action.label}
              </button>
              {action.hint && <p className="hint">{action.hint}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
