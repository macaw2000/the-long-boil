// The first screen: the splash art, then signing in and choosing a workshop.
// A login names an account, which holds up to 3 Tinkers. With Cognito (build
// plan milestone 11) each provider has its own button, which goes straight to
// that provider, and the login is the signed-in account's; without Cognito,
// the dev login takes any name typed here.

import { useEffect, useState } from "react";
import { Image, ImageBackground, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
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
  const { width, height } = useWindowDimensions();
  const tall = height > width * 1.1;

  const panel = (
    <View
      style={[
        ui.panel,
        {
          width: "100%",
          maxWidth: 440,
          gap: 14,
          padding: 22,
          backgroundColor: "rgba(27, 23, 18, 0.9)",
          borderColor: colors.brass,
          borderWidth: 2,
          borderRadius: 10,
          shadowColor: "#000",
          shadowOpacity: 0.6,
          shadowRadius: 24,
        },
      ]}
    >
      <Text style={[ui.heading, { fontSize: 22, textAlign: "center" }]}>{cognitoEnabled && !signedIn ? "Sign in to play" : "Your workshop"}</Text>
      <Text style={[ui.muted, { textAlign: "center" }]}>A solicitor's letter: the tenancy of No. 9 Sprocket Row, "contents included", is yours.</Text>
      {cognitoEnabled && !signedIn ? (
        <View style={{ gap: 10 }}>
          {providers.length ? (
            providers.map((provider) => <ProviderButton key={provider} provider={provider} onPress={() => signInWith(provider)} />)
          ) : (
            <Pressable style={[ui.button, { paddingVertical: 14 }]} onPress={() => signInWith()} accessibilityRole="button">
              <Text style={[ui.buttonText, { fontSize: 17 }]}>Sign in</Text>
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
              <Pressable style={[ui.button, !name.trim() && { opacity: 0.4 }]} disabled={!name.trim()} onPress={create} accessibilityRole="button">
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
  );

  return tall ? (
    // A phone held upright: the whole painting across the top, so its title is not cropped, and the panel below.
    <ScrollView style={{ flex: 1, backgroundColor: colors.soot }} contentContainerStyle={{ alignItems: "center", paddingBottom: 24 }}>
      <Image
        source={{ uri: art("splash.jpg") }}
        resizeMode="cover"
        style={{ width: "100%", aspectRatio: SPLASH_ASPECT }}
        accessibilityLabel="The Long Boil: a young Tinker on a brass rooftop among airships"
      />
      <View style={{ width: "100%", paddingHorizontal: 16, marginTop: -28 }}>{panel}</View>
    </ScrollView>
  ) : (
    // The art's title fills the top half, so the panel sits just below it, in
    // the middle of the picture where the eye lands, not down at the edge.
    <ImageBackground
      source={{ uri: art("splash.jpg") }}
      resizeMode="cover"
      style={{ flex: 1, alignItems: "center", padding: 16, backgroundColor: colors.soot }}
      accessibilityLabel="The Long Boil: a young Tinker on a brass rooftop among airships"
    >
      <View style={{ flex: 1.15 }} />
      {panel}
      <View style={{ flex: 0.6 }} />
    </ImageBackground>
  );
}

/** art/splash.jpg is 1376 by 768. */
const SPLASH_ASPECT = 1376 / 768;

/** Each provider in its own colours, so the buttons read as Google and Discord at a glance. */
const PROVIDER_STYLES: Record<Provider, { background: string; text: string; mark: string; markColour: string }> = {
  Google: { background: "#ffffff", text: "#1f1f1f", mark: "G", markColour: "#4285F4" },
  Discord: { background: "#5865F2", text: "#ffffff", mark: "◉", markColour: "#ffffff" },
};

function ProviderButton({ provider, onPress }: { provider: Provider; onPress: () => void }) {
  const look = PROVIDER_STYLES[provider];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Continue with ${provider}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        paddingVertical: 14,
        borderRadius: 8,
        backgroundColor: look.background,
      }}
    >
      <Text style={{ fontSize: 20, fontWeight: "700", color: look.markColour }}>{look.mark}</Text>
      <Text style={{ fontSize: 17, fontWeight: "600", color: look.text, fontFamily: "system-ui, sans-serif" }}>Continue with {provider}</Text>
    </Pressable>
  );
}
