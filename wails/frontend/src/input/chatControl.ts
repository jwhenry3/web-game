export interface ChatControl {
  focus: () => void;
  blur: () => void;
  send: () => void;
  getDraft: () => string;
  isFocused: () => boolean;
}

let chat: ChatControl | null = null;

export function registerChatControl(control: ChatControl | null) {
  chat = control;
}

export function getChatControl() {
  return chat;
}
