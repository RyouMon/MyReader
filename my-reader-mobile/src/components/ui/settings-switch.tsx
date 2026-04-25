import { Switch } from "react-native";

import { useThemePalette } from "@/src/design/tokens";

export function SettingsSwitch({ value, onValueChange }: { value: boolean; onValueChange: (next: boolean) => void }) {
  const palette = useThemePalette();

  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: palette.backgroundSecondary, true: palette.primary }}
      thumbColor={palette.surface}
      ios_backgroundColor={palette.backgroundSecondary}
    />
  );
}
