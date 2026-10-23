import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";
import { api, type Content } from "./src/api";
import { SignIn } from "./src/SignIn";
import { colors, ui } from "./src/theme";
import { Workshop } from "./src/Workshop";

// The open workshop is remembered per browser, so a reload returns to it.
const STORAGE_KEY = "long-boil.tinker";

function remembered(): number | null {
  if (Platform.OS !== "web") return null;
  try {
    const value = Number(globalThis.localStorage?.getItem(STORAGE_KEY));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function remember(tinkerId: number | null) {
  if (Platform.OS !== "web") return;
  try {
    if (tinkerId === null) globalThis.localStorage?.removeItem(STORAGE_KEY);
    else globalThis.localStorage?.setItem(STORAGE_KEY, String(tinkerId));
  } catch {
    // Storage is a convenience; without it the player signs in again.
  }
}

export default function App() {
  const [content, setContent] = useState<Content | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tinkerId, setTinkerId] = useState<number | null>(remembered);

  useEffect(() => {
    api
      .content()
      .then(setContent)
      .catch((reason: Error) => setError(`Cannot reach the server: ${reason.message}`));
  }, []);

  const open = (id: number | null) => {
    remember(id);
    setTinkerId(id);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.soot }}>
      <StatusBar style="light" />
      {!content ? (
        <View style={{ padding: 24 }}>
          <Text style={error ? [ui.text, { color: colors.scald }] : ui.muted}>{error ?? "Raising steam…"}</Text>
        </View>
      ) : tinkerId === null ? (
        <SignIn onEnter={(_login, id) => open(id)} />
      ) : (
        <Workshop key={tinkerId} content={content} tinkerId={tinkerId} onLeave={() => open(null)} />
      )}
    </View>
  );
}
