import type { ProfileInfo } from "../types";
import { useGame } from "../state/store";

export type NpcDialogueKind = "job_master";

export interface NpcDialogueTarget {
  kind: NpcDialogueKind;
  id: string;
  name: string;
}

export interface NpcDialogueAction {
  id: string;
  label: string;
  disabled?: boolean;
  hint?: string;
}

export interface NpcDialogueContent {
  greeting: string;
  actions: NpcDialogueAction[];
}

export function npcDialogueContent(target: NpcDialogueTarget, profile?: ProfileInfo | null): NpcDialogueContent {
  switch (target.kind) {
    case "job_master": {
      const canSub = !!profile && profile.level >= profile.subjob_unlock_level;
      return {
        greeting: `Welcome, adventurer. I am ${target.name}. Many roads lie before you — which vocation calls to you today?`,
        actions: [
          { id: "change_main", label: "Change Main Job" },
          {
            id: "change_sub",
            label: "Change Sub Job",
            disabled: !canSub,
            hint: canSub ? undefined : `Sub job unlocks at main job level ${profile?.subjob_unlock_level ?? 0}.`,
          },
          { id: "goodbye", label: "Good bye" },
        ],
      };
    }
  }
}

export function openJobMasterDialog(target: { id: string; name: string }) {
  useGame.getState().openNpcDialog({
    kind: "job_master",
    id: target.id,
    name: target.name,
  });
}
