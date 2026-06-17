import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { findNodeHandle, StyleSheet, View } from 'react-native';
import { requireNativeView } from 'expo';

import type {
  Dimensions,
  Locator,
  Preferences,
  ReadiumFile,
  DecorationGroup,
  SelectionAction,
  PublicationReadyEvent,
  DecorationActivatedEvent,
  SelectionEvent,
  SelectionActionEvent,
  TapEvent,
} from './types';
import { buildLinkTree } from './utils/buildLinkTree';
import { ReadiumModule } from './ReadiumModule';
import type { ReadiumViewRef, ReadiumProps } from './ReadiumView.types';

export type { ReadiumViewRef, ReadiumProps } from './ReadiumView.types';

/** Props the native Expo View accepts (props + onXxx event handlers). */
type NativeReadiumViewProps = {
  file: ReadiumFile;
  preferences?: Preferences;
  decorations?: DecorationGroup[];
  selectionActions?: SelectionAction[];
  style?: any;
  onLocationChange?: (e: { nativeEvent: { locator: Locator } }) => void;
  onPublicationReady?: (e: { nativeEvent: PublicationReadyEvent }) => void;
  onDecorationActivated?: (e: { nativeEvent: DecorationActivatedEvent }) => void;
  onSelectionChange?: (e: { nativeEvent: SelectionEvent }) => void;
  onSelectionAction?: (e: { nativeEvent: SelectionActionEvent }) => void;
  onTap?: (e: { nativeEvent: TapEvent }) => void;
};

// `requireNativeView` returns a forwardRef host component at runtime, but its
// declared type omits `ref`. Re-declare it so we can grab the native tag via
// `findNodeHandle` for imperative navigation (matches ReadiumView.registry[id]).
const NativeReadiumView = requireNativeView<NativeReadiumViewProps>('Readium') as React.ForwardRefExoticComponent<
  NativeReadiumViewProps & React.RefAttributes<unknown>
>;

export const ReadiumView = forwardRef<ReadiumViewRef, ReadiumProps>(
  (
    {
      onLocationChange,
      onPublicationReady,
      onDecorationActivated,
      onSelectionChange,
      onSelectionAction,
      onTap,
      preferences,
      decorations,
      selectionActions,
      ...props
    },
    forwardedRef
  ) => {
    const nativeRef = useRef<any>(null);
    const [{ height, width }, setDimensions] = useState<Dimensions>({
      width: 0,
      height: 0,
    });

    const onLayout = useCallback(
      ({
        nativeEvent: {
          layout: { width: layoutWidth, height: layoutHeight },
        },
      }: any) => {
        setDimensions({ width: layoutWidth, height: layoutHeight });
      },
      []
    );

    const handlePublicationReady = useCallback(
      (e: { nativeEvent: PublicationReadyEvent }) => {
        if (!onPublicationReady) return;
        const ev = e.nativeEvent;
        onPublicationReady({
          ...ev,
          tableOfContents: buildLinkTree(ev.tableOfContents),
        });
      },
      [onPublicationReady]
    );

    const tagOf = () => findNodeHandle(nativeRef.current);

    useImperativeHandle(
      forwardedRef,
      () => ({
        goTo: (locator) => {
          const tag = tagOf();
          if (tag != null) ReadiumModule.goTo(tag, locator);
        },
        goForward: () => {
          const tag = tagOf();
          if (tag != null) ReadiumModule.goForward(tag);
        },
        goBackward: () => {
          const tag = tagOf();
          if (tag != null) ReadiumModule.goBackward(tag);
        },
      }),
      []
    );

    // Native side cleans up the navigator on view removal; no JS destroy call needed.
    useEffect(() => () => {}, []);

    const isReady = width > 0 && height > 0;

    return (
      <View style={styles.container} onLayout={onLayout}>
        {isReady && (
          <NativeReadiumView
            ref={nativeRef}
            style={{ width, height }}
            {...props}
            preferences={preferences}
            decorations={decorations}
            selectionActions={selectionActions ?? []}
            onLocationChange={
              onLocationChange
                ? (e) => onLocationChange(e.nativeEvent.locator)
                : undefined
            }
            onPublicationReady={
              onPublicationReady ? handlePublicationReady : undefined
            }
            onDecorationActivated={
              onDecorationActivated
                ? (e) => onDecorationActivated(e.nativeEvent)
                : undefined
            }
            onSelectionChange={
              onSelectionChange
                ? (e) => onSelectionChange(e.nativeEvent)
                : undefined
            }
            onSelectionAction={
              onSelectionAction
                ? (e) => onSelectionAction(e.nativeEvent)
                : undefined
            }
            onTap={onTap ? (e) => onTap(e.nativeEvent) : undefined}
          />
        )}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: { width: '100%', height: '100%' },
});
