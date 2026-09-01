/** Clockwork Raven Studios — Raven Fantasy Icons (user-provided free pack) */
const ICON_BASE = "/assets/raven-fantasy-icons/icons";

function icon(name: string): string {
  return `${ICON_BASE}/${name}.png`;
}

export const ICONS = {
  attack: icon("attack"),
  weapon: icon("weapon"),
  subWeapon: icon("sub-weapon"),
  head: icon("head"),
  chest: icon("chest"),
  hands: icon("hands"),
  legs: icon("legs"),
  feet: icon("feet"),
  back: icon("back"),
  potion: icon("potion"),
  hiPotion: icon("hi-potion"),
  ether: icon("ether"),
  skillLocked: icon("skill-locked"),
  skillUnlocked: icon("skill-unlocked"),
  skillLockedNode: icon("skill-locked"),
  menuCharacter: icon("menu-character"),
  menuEquipment: icon("menu-equipment"),
  menuInventory: icon("menu-inventory"),
  menuSkills: icon("menu-skills"),
  menuSocial: icon("menu-social"),
  default: icon("default"),
} as const;
