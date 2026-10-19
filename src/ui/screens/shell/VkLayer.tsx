// A dialog (Modal) of a Valvekaart screen goes on document.body, so no panel clips it, inside a box-less wrapper
// that carries the frame's tokens (vk.css) and the shared components' skin (.vk-ui) there.
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function VkLayer({ children }: { children: ReactNode }) {
  return createPortal(<div className="vk vk-ui vk-layer">{children}</div>, document.body);
}
