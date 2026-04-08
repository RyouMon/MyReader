import { router } from "expo-router";
import { useState } from "react";

import { useThemePalette } from "@/src/design/tokens";
import { Pressable, Text, TextInput, View } from "@/tw";

import { Screen } from "../components";
import { useDataSourceStore } from "../store/data-source-store";
import { testWebDavConnection } from "../data/webdav";

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function AddWebDavDataSourceScreen() {
  const palette = useThemePalette();
  const { addDataSource } = useDataSourceStore();
  const [name, setName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [basePath, setBasePath] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      const dataSource = {
        id: createId(),
        type: "webdav" as const,
        name: name.trim() || "WebDAV 数据源",
        serverUrl: serverUrl.trim(),
        username: username.trim(),
        password,
        basePath: basePath.trim(),
        createdAt: Date.now(),
      };

      await testWebDavConnection(dataSource);
      await addDataSource(dataSource);
      router.replace({ pathname: "/settings/add-library/webdav-browser", params: { dataSourceId: dataSource.id } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法连接到 WebDAV 服务。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <View className="gap-3 rounded-[24px] px-4 py-4" style={{ backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 }}>
        {[{ label: "名称", value: name, onChangeText: setName, placeholder: "家庭 NAS" }, { label: "服务器地址", value: serverUrl, onChangeText: setServerUrl, placeholder: "https://dav.example.com" }, { label: "基础路径", value: basePath, onChangeText: setBasePath, placeholder: "/books" }, { label: "用户名", value: username, onChangeText: setUsername, placeholder: "reader" }, { label: "密码", value: password, onChangeText: setPassword, placeholder: "••••••••" }].map((field) => (
          <View key={field.label} className="gap-2">
            <Text className="text-sm font-semibold" style={{ color: palette.text }}>{field.label}</Text>
            <TextInput
              value={field.value}
              onChangeText={field.onChangeText}
              placeholder={field.placeholder}
              placeholderTextColor={palette.textMuted}
              secureTextEntry={field.label === "密码"}
              className="min-h-12 rounded-[18px] px-4 text-[15px]"
              style={{ backgroundColor: palette.surfaceMuted, color: palette.text }}
            />
          </View>
        ))}

        {error ? (
          <Text className="text-sm leading-6" style={{ color: palette.error }}>{error}</Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          className="min-h-12 items-center justify-center rounded-full px-4"
          onPress={() => void handleSave()}
          style={{ backgroundColor: palette.primary }}
        >
          <Text className="text-[15px]" style={{ color: palette.primaryForeground, fontWeight: "700" }}>
            {saving ? "连接中..." : "保存并浏览"}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
