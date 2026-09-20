import { SpineGameObject, SpinePlugin } from "@esotericsoftware/spine-phaser-v4";
import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { CharacterSprite, PLAYER_RIG } from "../phaser/CharacterSprite";
import { H99_DISPLAY_SCALE, type CharacterAppearance } from "./heroes99";

/**
 * Live character preview — hosts a mini Phaser game running the same Spine
 * paperdoll rig the world uses, so creation/equipment previews match the
 * in-game render exactly (attachments, shape morphs, idle animation).
 */
export function CharacterPreviewAnimated({
  appearance,
  className = "",
  hideWeapon = false,
  hideCloth = false,
  scale = 2,
  animation = "idle",
  playing = true,
}: {
  appearance: CharacterAppearance;
  className?: string;
  hideWeapon?: boolean;
  hideCloth?: boolean;
  scale?: number;
  animation?: string;
  playing?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const charRef = useRef<CharacterSprite | null>(null);
  const playback = useRef({ animation, playing });
  playback.current = { animation, playing };

  const effective = (a: CharacterAppearance): CharacterAppearance => ({
    ...a,
    weapon: hideWeapon ? "" : a.weapon,
    subWeapon: hideWeapon ? "" : a.subWeapon,
    cloth: hideCloth ? "" : a.cloth,
  });
  // The scene reads the latest appearance through this ref — React props
  // change outside Phaser's lifecycle.
  const effectiveRef = useRef(effective(appearance));
  effectiveRef.current = effective(appearance);

  // Same sizing as the old sheet preview so surrounding layouts don't move:
  // the 100x40 rig cell at display scale, plus a small margin.
  const margin = 8;
  const w = Math.ceil(100 * H99_DISPLAY_SCALE * scale + margin * 2);
  const h = Math.ceil(40 * H99_DISPLAY_SCALE * scale + margin * 2);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    class PreviewScene extends Phaser.Scene {
      create() {
        const char = new CharacterSprite(
          this,
          0,
          0,
          effectiveRef.current,
          PLAYER_RIG,
        );
        charRef.current = char;
        // Foot anchor at bottom-center of the frame.
        char.container.setScale(scale);
        char.container.setPosition(w / 2, h - margin);
        this.add.existing(char.container);
      }

      update(_time: number, delta: number) {
        const char = charRef.current;
        if (!char) return;
        char.setAppearance(effectiveRef.current);
        const spine = char.container.list.find((child) => child instanceof SpineGameObject) as SpineGameObject | undefined;
        if (spine) {
          const name = playback.current.animation;
          if (spine.animationState.getTrack(0)?.animation?.name !== name && spine.skeleton.data.findAnimation(name)) {
            spine.animationState.setAnimation(0, name, true);
          }
          spine.animationState.timeScale = playback.current.playing ? 1 : 0;
        }
        char.update(delta);
      }
    }

    const game = new Phaser.Game({
      type: Phaser.WEBGL,
      parent: host,
      width: w,
      height: h,
      transparent: true,
      pixelArt: true,
      audio: { noAudio: true },
      banner: false,
      scene: PreviewScene,
      plugins: {
        scene: [{ key: "spine", plugin: SpinePlugin, mapping: "spine" }],
      },
    });

    return () => {
      charRef.current = null;
      game.destroy(true);
    };
  }, [w, h, scale, margin]);

  return (
    <div
      ref={hostRef}
      className={`character-preview character-preview--animated ${className}`.trim()}
      style={{ width: w, height: h }}
    />
  );
}
