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

/**
 * Each provider's own mark and colours, after their brand rules: Google's
 * light button (white, a #747775 outline, the four-colour G) and Discord's
 * Blurple with the white Clyde. The marks are SVG data URIs, drawn as images.
 */
const GOOGLE_G =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
const DISCORD_CLYDE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#ffffff" d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>';

const svg = (markup: string) => ({ uri: `data:image/svg+xml;base64,${btoa(markup)}` });

const PROVIDER_STYLES: Record<Provider, { background: string; border: string; text: string; mark: { uri: string } }> = {
  Google: { background: "#ffffff", border: "#747775", text: "#1f1f1f", mark: svg(GOOGLE_G) },
  Discord: { background: "#5865F2", border: "#5865F2", text: "#ffffff", mark: svg(DISCORD_CLYDE) },
};

function ProviderButton({ provider, onPress }: { provider: Provider; onPress: () => void }) {
  const look = PROVIDER_STYLES[provider];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Continue with ${provider}`}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        height: 48,
        paddingHorizontal: 16,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: look.border,
        backgroundColor: look.background,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Image source={look.mark} style={{ width: provider === "Discord" ? 22 : 20, height: provider === "Discord" ? 22 : 20 }} accessibilityIgnoresInvertColors />
      <Text style={{ fontSize: 16, fontWeight: "500", color: look.text, fontFamily: "Roboto, system-ui, sans-serif" }}>Continue with {provider}</Text>
    </Pressable>
  );
}
