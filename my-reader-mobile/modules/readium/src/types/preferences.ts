/**
 * Reader preferences (REP-009). All 25 EPUB preference keys are exposed;
 * string unions refine the IDE-completion for the common values while the
 * underlying native side accepts the raw strings.
 */
export interface Preferences {
  backgroundColor?: string;
  columnCount?: 'auto' | '1' | '2';
  fontFamily?:
    | 'serif'
    | 'sans-serif'
    | 'cursive'
    | 'fantasy'
    | 'monospace'
    | 'AccessibleDfA'
    | 'IA Writer Duospace'
    | 'OpenDyslexic'
    | (string & {}); // allow any custom font family name
  fontSize?: number;
  fontWeight?: number;
  hyphens?: boolean;
  imageFilter?: 'darken' | 'invert';
  language?: string;
  letterSpacing?: number;
  ligatures?: boolean;
  lineHeight?: number;
  pageMargins?: number;
  paragraphIndent?: number;
  paragraphSpacing?: number;
  publisherStyles?: boolean;
  readingProgression?: 'ltr' | 'rtl';
  scroll?: boolean;
  spread?: 'auto' | 'never' | 'always';
  textAlign?: 'center' | 'justify' | 'start' | 'end' | 'left' | 'right';
  textColor?: string;
  textNormalization?: boolean;
  theme?: 'light' | 'dark' | 'sepia' | (string & {});
  typeScale?: number;
  verticalText?: boolean;
  wordSpacing?: number;
  merging?: boolean;
}
