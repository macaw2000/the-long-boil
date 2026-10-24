// The first screen: the splash art, then signing in and choosing a workshop.
// A login names an account, which holds up to 3 Tinkers. With Cognito (build
// plan milestone 11) each provider has its own button, which goes straight to
// that provider, and the login is the signed-in account's; without Cognito,
// the dev login takes any name typed here.

import { useEffect, useState } from "react";
import { ImageBackground, Pressable, Text, TextInput, View } from "react-native";
import { api } from "./api";
import { art } from "./art";
import { cognitoEnabled, providers, signOut, startSignIn, type Provider } from "./auth";
import { colors, ui } from "./theme";

export function SignIn({ signedIn, onEnter }: { signedIn: boolean; onEnter: (login: string, tinkerId: number) => void }) {
  const [login, setLogin] = useState("");
  const [tinkers, setTinkers] = useState<{ id: number; name: string }[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const lookUp = (account = login.trim()) =>
    api
      .listTinkers(account)
      .then((result) => {
        setTinkers(result.tinkers);
        setError(null);
      })
      .catch((reason: Error) => setError(reason.message));

  // Signed in with Cognito: the server says which account this is, and its Tinkers follow.
  useEffect(() => {
    if (!cognitoEnabled || !signedIn) return;
    api
      .me()
      .then(({ login: account }) => {
        if (!account) throw new Error("the server is not using sign-in");
        setLogin(account);
        return lookUp(account);
      })
      .catch((reason: Error) => setError(reason.message));
  }, [signedIn]);

  const create = () =>
    api
      .createTinker(login.trim(), name.trim())
      .then((outcome) => onEnter(login.trim(), outcome.tinker.id))
      .catch((reason: Error) => setError(reason.message));

  const signInWith = (provider?: Provider) => startSignIn(provider).catch((reason: Error) => setError(reason.message));

  return (
    // The art's title sits at the top, so the panel sits at the bottom, over the rooftop.
    <ImageBackground
      source={{ uri: art("splash.jpg") }}
      resizeMode="cover"
      style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", padding: 16, paddingBottom: 32, backgroundColor: colors.soot }}
      accessibilityLabel="The Long Boil: a young Tinker on a brass rooftop among airships"
    >
      <View style={[ui.panel, { width: "100%", maxWidth: 420, gap: 12, backgroundColor: "rgba(38, 32, 26, 0.92)" }]}>
        <Text style={ui.muted}>
          A solicitor's letter: the tenancy of No. 9 Sprocket Row, "contents included", is yours.
        </Text>
        {cognitoEnabled && !signedIn ? (
          <View style={{ gap: 8 }}>
            {providers.length ? (
              providers.map((provider) => (
                <Pressable key={provider} style={ui.button} onPress={() => signInWith(provider)} accessibilityRole="button">
                  <Text style={ui.buttonText}>Continue with {provider}</Text>
                </Pressable>
              ))
            ) : (
              <Pressable style={ui.button} onPress={() => signInWith()} accessibilityRole="button">
                <Text style={ui.buttonText}>Sign in</Text>
              </Pressable>
            )}
          </View>
        ) : cognitoEnabled ? null : (
          <TextInput
            style={ui.input}
            value={login}
            onChangeText={(text) => {
              setLogin(text);
              setTinkers(null);
            }}
            onSubmitEditing={() => lookUp()}
            placeholder="login (any name, for now)"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            accessibilityLabel="Login"
          />
        )}
        {cognitoEnabled && (!signedIn || tinkers === null) ? null : tinkers === null ? (
          <Pressable
            style={[ui.button, !login.trim() && { opacity: 0.4 }]}
            disabled={!login.trim()}
            onPress={() => lookUp()}
            accessibilityRole="button"
          >
            <Text style={ui.buttonText}>Sign in</Text>
          </Pressable>
        ) : (
          <View style={{ gap: 8 }}>
            {tinkers.map((tinker) => (
              <Pressable key={tinker.id} style={ui.button} onPress={() => onEnter(login.trim(), tinker.id)} accessibilityRole="button">
                <Text style={ui.buttonText}>Open {tinker.name}'s workshop</Text>
              </Pressable>
            ))}
            {tinkers.length < 3 && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  style={[ui.input, { flex: 1 }]}
                  value={name}
                  onChangeText={setName}
                  onSubmitEditing={() => name.trim() && create()}
                  placeholder="a new Tinker's name"
                  placeholderTextColor={colors.muted}
                  maxLength={40}
                  accessibilityLabel="New Tinker's name"
                />
                <Pressable
                  style={[ui.button, !name.trim() && { opacity: 0.4 }]}
                  disabled={!name.trim()}
                  onPress={create}
                  accessibilityRole="button"
                >
                  <Text style={ui.buttonText}>Take the keys</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
        {error && <Text style={[ui.text, { color: colors.scald }]}>{error}</Text>}
        {cognitoEnabled && signedIn && (
          <Pressable onPress={signOut} accessibilityRole="button">
            <Text style={ui.muted}>Sign out</Text>
          </Pressable>
        )}
      </View>
    </ImageBackground>
  );
}
