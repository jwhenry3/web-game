/** House tent-skin picker open state (toolbar ↔ hotkeys). */

type Listener = () => void;

let open = false;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

export function getHouseSkinPickerOpen(): boolean {
  return open;
}

export function subscribeHouseSkinPicker(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setHouseSkinPickerOpen(next: boolean) {
  if (open === next) return;
  open = next;
  emit();
}

export function toggleHouseSkinPicker() {
  open = !open;
  emit();
  return open;
}
