import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";
import { api, setClockOffset, whenSignedOut, type Content } from "./src/api";
import { bearerToken, cognitoEnabled, finishSignIn } from "./src/auth";
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
  // Under the dev login everyone is signed in; with Cognito, unknown until a returning code is traded and the tokens looked at.
  const [signedIn, setSignedIn] = useState<boolean | null>(cognitoEnabled ? null : true);
  // Admins get the dev tools; under the dev login everyone does.
  const [admin, setAdmin] = useState(!cognitoEnabled);

  useEffect(() => {
    if (!cognitoEnabled) return;
    whenSignedOut(() => setSignedIn(false));
    finishSignIn()
      .catch(() => undefined)
      .then(bearerToken)
      .then((token) => setSignedIn(Boolean(token)));
  }, []);

  useEffect(() => {
    if (!cognitoEnabled || !signedIn) return;
    api
      .me()
      .then((me) => setAdmin(me.admin))
      .catch(() => setAdmin(false));
  }, [signedIn]);

  useEffect(() => {
    api
      .content()
      .then((loaded) => {
        setClockOffset(loaded.dev?.offsetMs ?? 0);
        setContent(loaded);
      })
      .catch((reason: Error) => setError(`Cannot reach the server: ${reason.message}`));
  }, []);

  const open = (id: number | null) => {
    remember(id);
    setTinkerId(id);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.soot }}>
      <StatusBar style="light" />
      {!content || signedIn === null ? (
        <View style={{ padding: 24 }}>
          <Text style={error ? [ui.text, { color: colors.scald }] : ui.muted}>{error ?? "Raising steam…"}</Text>
        </View>
      ) : tinkerId === null || !signedIn ? (
        <SignIn signedIn={signedIn} onEnter={(_login, id) => open(id)} />
      ) : (
        <Workshop key={tinkerId} content={content} tinkerId={tinkerId} admin={admin} onLeave={() => open(null)} />
      )}
    </View>
  );
}
