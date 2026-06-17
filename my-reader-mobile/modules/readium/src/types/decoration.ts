import type { Locator } from './locator';
import type { Point, Rect } from './events';

export interface DecorationStyle {
  type: string;
  tint?: string;
  isActive?: boolean;
  id?: string;
  html?: string;
  css?: string;
  layout?: string;
  width?: string;
}

export interface Decoration {
  id: string;
  locator: Locator;
  style: DecorationStyle;
  extras?: Record<string, string>;
}

export interface DecorationGroup {
  name: string;
  decorations: Decoration[];
}

export interface DecorationActivatedEvent {
  decoration: Decoration;
  group: string;
  rect?: Rect;
  point?: Point;
}
