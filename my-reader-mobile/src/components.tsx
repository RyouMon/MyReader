import { type ReactNode } from "react";
import {
  FlatList,
  Modal,
  Pressable as RNPressable,
  Switch,
  useWindowDimensions,
} from "react-native";

import { useThemePalette } from "@/src/design/tokens";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "@/tw";

import type { BookItem } from "./data/types";

export function Screen({ children }: { children: ReactNode }) {
  const palette = useThemePalette();

  return (
    <ScrollView
      className="flex-1"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="px-4 pt-4 pb-10"
      style={{ backgroundColor: palette.background }}
    >
      <View className="gap-5">{children}</View>
    </ScrollView>
  );
}

export function PageHeader({
  title,
  trailing,
  subtitle,
}: {
  title: string;
  trailing?: ReactNode;
  subtitle?: string;
}) {
  const palette = useThemePalette();

  return (
    <View className="flex-row items-start justify-between gap-3">
      <View className="flex-1 gap-1">
        <Text
          selectable
          className="text-[34px] leading-[40px]"
          style={{ color: palette.text, fontWeight: "700", letterSpacing: -0.4 }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text selectable className="text-sm leading-5" style={{ color: palette.textMuted }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

export function RoundIconButton({
  label,
  onPress,
  icon,
  size = "default",
}: {
  label: string;
  onPress?: () => void;
  icon?: ReactNode;
  size?: "default" | "large";
}) {
  const palette = useThemePalette();
  const isLarge = size === "large";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className={isLarge ? "min-h-14 min-w-14 items-center justify-center rounded-[20px] px-4" : "min-h-12 min-w-12 items-center justify-center rounded-3xl px-3"}
      onPress={onPress}
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.border,
        borderWidth: 1,
      }}
    >
      {icon ?? (
        <Text className="text-sm font-semibold" style={{ color: palette.text }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}


export function HeroCard({ children }: { children: ReactNode }) {
  const palette = useThemePalette();

  return (
    <View
      className="rounded-[28px] p-4"
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.border,
        borderWidth: 1,
        boxShadow: "0 10px 30px rgba(61, 43, 26, 0.08)",
      }}
    >
      {children}
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
}: {
  title: string;
  onPress?: () => void;
}) {
  const palette = useThemePalette();

  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-12 flex-1 items-center justify-center rounded-full px-4"
      onPress={onPress}
      style={{ backgroundColor: palette.primary }}
    >
      <Text className="text-[15px]" style={{ color: palette.primaryForeground, fontWeight: "700" }}>
        {title}
      </Text>
    </Pressable>
  );
}

export function SecondaryButton({
  title,
  onPress,
}: {
  title: string;
  onPress?: () => void;
}) {
  const palette = useThemePalette();

  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-12 flex-1 items-center justify-center rounded-full px-4"
      onPress={onPress}
      style={{
        backgroundColor: palette.surfaceMuted,
        borderColor: palette.border,
        borderWidth: 1,
      }}
    >
      <Text className="text-[15px]" style={{ color: palette.text, fontWeight: "700" }}>
        {title}
      </Text>
    </Pressable>
  );
}

export function ProgressBar({ progress }: { progress: number }) {
  const palette = useThemePalette();

  return (
    <View className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: palette.surfaceMuted }}>
      <View
        className="h-full rounded-full"
        style={{ backgroundColor: palette.primary, width: `${Math.max(0, Math.min(progress, 1)) * 100}%` }}
      />
    </View>
  );
}

export function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  const palette = useThemePalette();

  return (
    <View className="gap-1 px-1">
      <Text
        selectable
        className="text-[28px] leading-[34px]"
        style={{ color: palette.text, fontWeight: "700", letterSpacing: -0.2 }}
      >
        {title}
      </Text>
      {detail ? (
        <Text selectable className="text-sm leading-5" style={{ color: palette.textMuted }}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

export function BookCard({
  book,
  width,
  onPress,
}: {
  book: BookItem;
  width: number;
  onPress?: () => void;
}) {
  const palette = useThemePalette();

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      className="rounded-3xl p-3"
      onPress={onPress}
      style={{
        width,
        backgroundColor: palette.surface,
        borderColor: palette.border,
        borderWidth: 1,
      }}
    >
      {book.coverUri ? (
        <Image
          source={book.coverUri}
          className="aspect-[2/3] w-full rounded-[18px]"
        />
      ) : (
        <View
          className="aspect-[2/3] w-full items-center justify-center rounded-[18px] px-4"
          style={{ backgroundColor: palette.surfaceMuted }}
        >
          <Text
            className="text-center text-sm leading-5"
            style={{ color: palette.textMuted, fontWeight: "600" }}
          >
            暂无封面
          </Text>
        </View>
      )}
      <Text selectable className="mt-3 text-[15px] font-semibold leading-5" style={{ color: palette.text }} numberOfLines={2}>
        {book.title}
      </Text>
      <Text selectable className="mt-1 text-sm leading-5" style={{ color: palette.textMuted }} numberOfLines={1}>
        {book.author}
      </Text>
      {typeof book.progress === "number" ? (
        <View className="mt-3">
          <ProgressBar progress={book.progress} />
        </View>
      ) : null}
    </Pressable>
  );
}

export function HorizontalBookShelf({
  data,
  onSelectBook,
}: {
  data: BookItem[];
  onSelectBook?: (book: BookItem) => void;
}) {
  return (
    <FlatList
      horizontal
      data={data}
      keyExtractor={(item) => item.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 12, paddingHorizontal: 4 }}
      renderItem={({ item }) => <BookCard book={item} width={156} onPress={onSelectBook ? () => onSelectBook(item) : undefined} />}
    />
  );
}

export function SearchField({
  placeholder,
  value,
  onChangeText,
}: {
  placeholder: string;
  value?: string;
  onChangeText?: (value: string) => void;
}) {
  const palette = useThemePalette();

  return (
    <View
      className="min-h-12 flex-row items-center gap-3 rounded-[20px] px-4 py-3"
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.border,
        borderWidth: 1,
      }}
    >
      <Text className="text-sm font-medium" style={{ color: palette.textMuted }}>
        搜索
      </Text>
      <TextInput
        editable
        placeholder={placeholder}
        placeholderTextColor={palette.textMuted}
        className="flex-1 text-[15px]"
        value={value}
        onChangeText={onChangeText}
        style={{ color: palette.text }}
      />
    </View>
  );
}

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  const palette = useThemePalette();

  return (
    <View
      className="items-center gap-3 rounded-[24px] px-6 py-8"
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.border,
        borderWidth: 1,
      }}
    >
      <Text
        selectable
        className="text-[20px] leading-7"
        style={{ color: palette.text, fontWeight: "700" }}
      >
        {title}
      </Text>
      <Text
        selectable
        className="text-center text-sm leading-6"
        style={{ color: palette.textMuted }}
      >
        {detail}
      </Text>
      {action}
    </View>
  );
}

export function FilterChip({
  active,
  label,
}: {
  active?: boolean;
  label: string;
}) {
  const palette = useThemePalette();

  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-11 rounded-full px-4 items-center justify-center"
      style={{
        backgroundColor: active ? palette.primary : palette.surface,
        borderColor: active ? palette.primary : palette.border,
        borderWidth: 1,
      }}
    >
      <Text
        className="text-[15px]"
        style={{ color: active ? palette.primaryForeground : palette.text, fontWeight: "700" }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function LibraryGrid({
  data,
  onSelectBook,
}: {
  data: BookItem[];
  onSelectBook?: (book: BookItem) => void;
}) {
  const { width } = useWindowDimensions();
  const columns = width >= 768 ? 4 : 2;
  const cardWidth = width >= 768 ? (width - 76) / 4 : (width - 44) / 2;

  return (
    <FlatList
      data={data}
      key={columns}
      keyExtractor={(item) => item.id}
      numColumns={columns}
      scrollEnabled={false}
      columnWrapperStyle={{ gap: 12 }}
      contentContainerStyle={{ gap: 12 }}
      renderItem={({ item }) => <BookCard book={item} width={cardWidth} onPress={onSelectBook ? () => onSelectBook(item) : undefined} />}
    />
  );
}

export function Sheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const palette = useThemePalette();

  return (
    <Modal transparent animationType="fade" visible={open} onRequestClose={onClose}>
      <RNPressable
        onPress={onClose}
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: palette.overlay }}
      >
        <RNPressable>
          <View
            className="rounded-t-[28px] px-4 pb-8 pt-4"
            style={{
              backgroundColor: palette.surface,
              borderTopWidth: 1,
              borderColor: palette.border,
            }}
          >
            <View className="mb-4 self-center rounded-full" style={{ width: 36, height: 4, backgroundColor: palette.border }} />
            <View className="gap-4">{children}</View>
          </View>
        </RNPressable>
      </RNPressable>
    </Modal>
  );
}

export function SheetOption({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const palette = useThemePalette();

  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-12 flex-row items-center justify-between rounded-2xl px-4"
      onPress={onPress}
      style={{ backgroundColor: active ? palette.surfaceMuted : "transparent" }}
    >
      <Text className="text-[16px]" style={{ color: palette.text, fontWeight: active ? "700" : "600" }}>
        {label}
      </Text>
      {active ? (
        <Text className="text-sm font-semibold" style={{ color: palette.primary }}>
          当前
        </Text>
      ) : null}
    </Pressable>
  );
}

export function SectionCard({ children }: { children: ReactNode }) {
  const palette = useThemePalette();

  return (
    <View
      className="overflow-hidden rounded-[24px]"
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.border,
        borderWidth: 1,
      }}
    >
      {children}
    </View>
  );
}

export function SettingsRow({
  title,
  detail,
  trailing,
  onPress,
  isLast,
}: {
  title: string;
  detail?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  isLast?: boolean;
}) {
  const palette = useThemePalette();

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      className="min-h-16 flex-row items-center justify-between gap-3 px-4 py-4"
      onPress={onPress}
      style={{ borderBottomColor: palette.border, borderBottomWidth: isLast ? 0 : 1 }}
    >
      <View className="flex-1 gap-1">
        <Text selectable className="text-[16px] leading-6" style={{ color: palette.text, fontWeight: "700" }}>
          {title}
        </Text>
        {detail ? (
          <Text selectable className="text-[13px] leading-5" style={{ color: palette.textMuted }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing}
    </Pressable>
  );
}

export function SettingsSwitch({ value, onValueChange }: { value: boolean; onValueChange: (next: boolean) => void }) {
  const palette = useThemePalette();

  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: palette.surfaceMuted, true: palette.primary }}
      thumbColor={palette.surface}
      ios_backgroundColor={palette.surfaceMuted}
    />
  );
}
