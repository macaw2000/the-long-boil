// The first screen: the splash art, then signing in and choosing a workshop.
// A login names an account, which holds up to 3 Tinkers. With Cognito (build
// plan milestone 11) each provider has its own button, which goes straight to
// that provider, and the login is the signed-in account's; without Cognito,
// the dev login takes any name typed here.

import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Image, Linking, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
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
  const still = useReducedMotion();
  const scroller = useRef<ScrollView>(null);
  const showcaseTop = useRef(0);

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
      {showcaseBeforeSignIn(signedIn, tinkers) && (
        <Text style={[ui.text, { fontSize: 15, fontStyle: "italic", textAlign: "center", color: colors.steam }]}>
          The sea has boiled for 312 years. Nobody will say why.
        </Text>
      )}
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
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 16 }}>
        <LegalLink path="/privacy.html" label="Privacy" />
        <LegalLink path="/terms.html" label="Terms" />
      </View>
    </View>
  );

  // Before signing in, the page goes on below the painting to show what the game is.
  const showcase = showcaseBeforeSignIn(signedIn, tinkers);
  const seeInside = () => scroller.current?.scrollTo({ y: showcaseTop.current, animated: true });

  return (
    <ScrollView ref={scroller} style={{ flex: 1, backgroundColor: colors.soot }} contentContainerStyle={{ alignItems: "center", paddingBottom: 32 }}>
      {tall ? (
        // A phone held upright: the whole painting across the top, so its title is not cropped, and the panel below.
        <>
          <View style={{ width: "100%", aspectRatio: SPLASH_ASPECT, overflow: "hidden" }}>
            <LivingSplash still={still} />
          </View>
          <View style={{ width: "100%", paddingHorizontal: 16, marginTop: -28 }}>{panel}</View>
        </>
      ) : (
        // The art's title fills the top half, so the panel sits just below it, in
        // the middle of the picture where the eye lands, not down at the edge.
        <View style={{ width: "100%", height, alignItems: "center", padding: 16, backgroundColor: colors.soot, overflow: "hidden" }}>
          <LivingSplash still={still} />
          <View style={{ flex: 1.3 }} />
          {panel}
          <View style={{ flex: 0.6, justifyContent: "flex-end", paddingBottom: 8 }}>
            {showcase && <SeeInside still={still} onPress={seeInside} />}
          </View>
        </View>
      )}
      {showcase && (
        <View style={{ width: "100%", alignItems: "center" }} onLayout={(event) => (showcaseTop.current = event.nativeEvent.layout.y)}>
          <Showcase wide={!tall && width >= 900} />
        </View>
      )}
    </ScrollView>
  );
}

/** Before signing in, the page goes on below the painting to show what the game is. */
const showcaseBeforeSignIn = (signedIn: boolean, tinkers: unknown[] | null) => (cognitoEnabled ? !signedIn : tinkers === null);

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => listener.remove();
  }, []);
  return reduced;
}

/** A value that runs 0 to 1 over `duration` forever, starting `delay` in. */
function useLoop(duration: number, delay = 0, still = false) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(Animated.timing(value, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: false }));
    const timer = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [still]);
  return value;
}

/**
 * The painting, alive: a slow push in, steam rolling up off the boiling sea
 * below the rooftops, and sparks drifting up past the Tinker. All of it is
 * drawn over the one picture, so it needs no new art, and it all holds still
 * for anyone who asks their device for less motion.
 */
function LivingSplash({ still }: { still: boolean }) {
  const drift = useLoop(36000, 0, still);
  const scale = drift.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.07, 1] });
  return (
    <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
      <Animated.Image
        source={{ uri: art("splash.jpg") }}
        resizeMode="cover"
        style={{ position: "absolute", inset: 0, transform: [{ scale }] }}
        accessibilityLabel="The Long Boil: a young Tinker on a brass rooftop among airships"
      />
      {!still && STEAM.map((puff, index) => <SteamPuff key={index} {...puff} />)}
      {!still && SPARKS.map((spark, index) => <Spark key={index} {...spark} />)}
      {/* A dark foot, so the button below the panel reads against the planks. */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "22%",
          experimental_backgroundImage: "linear-gradient(to bottom, rgba(27,23,18,0), rgba(27,23,18,0.75))",
        }}
      />
    </View>
  );
}

/** Puffs rise from below the frame, where the sea is: x and size in percent of the width. */
const STEAM = [
  { x: 2, size: 34, duration: 14000, delay: 0 },
  { x: 18, size: 26, duration: 17000, delay: 5000 },
  { x: 62, size: 30, duration: 15000, delay: 2500 },
  { x: 80, size: 38, duration: 19000, delay: 8000 },
  { x: 40, size: 24, duration: 16000, delay: 11000 },
  { x: 92, size: 28, duration: 13000, delay: 6500 },
];

function SteamPuff({ x, size, duration, delay }: (typeof STEAM)[number]) {
  const rise = useLoop(duration, delay);
  return (
    <Animated.View
      style={{
        position: "absolute",
        left: `${x - size / 2}%`,
        width: `${size}%`,
        aspectRatio: 1,
        borderRadius: 9999,
        backgroundColor: "rgba(239, 231, 214, 0.55)",
        filter: "blur(40px)",
        top: rise.interpolate({ inputRange: [0, 1], outputRange: ["100%", "-40%"] }),
        opacity: rise.interpolate({ inputRange: [0, 0.15, 0.6, 1], outputRange: [0, 0.7, 0.35, 0] }),
        transform: [{ scale: rise.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.5] }) }],
      }}
    />
  );
}

const SPARKS = Array.from({ length: 14 }, (_, index) => ({
  x: (index * 37 + 11) % 100,
  sway: index % 2 ? 18 : -18,
  size: 3 + (index % 3),
  duration: 7000 + ((index * 1300) % 6000),
  delay: (index * 900) % 9000,
}));

function Spark({ x, sway, size, duration, delay }: (typeof SPARKS)[number]) {
  const rise = useLoop(duration, delay);
  return (
    <Animated.View
      style={{
        position: "absolute",
        left: `${x}%`,
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: "#ffc56b",
        boxShadow: "0 0 8px 2px rgba(255, 170, 70, 0.8)",
        top: rise.interpolate({ inputRange: [0, 1], outputRange: ["105%", "35%"] }),
        opacity: rise.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 1, 0.8, 0] }),
        transform: [{ translateX: rise.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, sway, 0] }) }],
      }}
    />
  );
}

/** The way down to the showcase: a brass button that bobs, not a line of small print. */
function SeeInside({ still, onPress }: { still: boolean; onPress: () => void }) {
  const bob = useLoop(1800, 0, still);
  const translateY = bob.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 7, 0] });
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // hovered is react-native-web's, missing from the native types.
      style={({ pressed, ...state }) => ({
        alignItems: "center",
        gap: 2,
        paddingVertical: 10,
        paddingHorizontal: 26,
        borderRadius: 999,
        borderWidth: 2,
        borderColor: colors.brass,
        backgroundColor: (state as { hovered?: boolean }).hovered || pressed ? "rgba(201, 162, 90, 0.3)" : "rgba(27, 23, 18, 0.82)",
        boxShadow: "0 0 18px rgba(201, 162, 90, 0.45)",
      })}
    >
      <Text style={[ui.heading, { fontSize: 18 }]}>See inside the workshop</Text>
      <Animated.Text style={{ color: colors.brass, fontSize: 22, lineHeight: 22, transform: [{ translateY }] }}>⌄</Animated.Text>
    </Pressable>
  );
}

/** What the game is, in three real screenshots, and what signing in is for. */
const SHOWCASE: { image: string; aspect: number; title: string; line: string }[] = [
  {
    image: "showcase/bench.jpg",
    aspect: 1200 / 456,
    title: "Your workshop never sleeps",
    line: "Queue twelve hours of work, close the tab, and come back to finished spanners, full stores and Crowns in the till.",
  },
  {
    image: "showcase/fight.jpg",
    aspect: 1200 / 480,
    title: "Clear the scrapyards",
    line: "Arm yourself at the bench and fight through Rustmoor's Rust Rats to Scrapjaw, the king they built from the city's rubbish.",
  },
  {
    image: "showcase/story.jpg",
    aspect: 1200 / 541,
    title: "The city writes back",
    line: "Letters by Pneumatic Post bring choices, not chores, and every skill you train is another way to answer them.",
  },
];

function Showcase({ wide }: { wide: boolean }) {
  return (
    <View style={{ width: "100%", maxWidth: 1160, paddingHorizontal: 16, paddingTop: 40, gap: 28 }}>
      <View style={{ alignItems: "center", gap: 10, maxWidth: 760, alignSelf: "center" }}>
        <Text style={[ui.heading, { fontSize: 26, textAlign: "center" }]}>A city above a boiling sea</Text>
        <Text style={[ui.text, { fontSize: 17, lineHeight: 26, textAlign: "center" }]}>
          Kettleport has ridden a column of steam for 312 years, and nobody in charge will say why the sea is still boiling. You inherit a
          cold workshop on Sprocket Row from a Tinker who vanished with a notebook full of questions.
        </Text>
      </View>
      <View style={{ flexDirection: wide ? "row" : "column", gap: 18 }}>
        {SHOWCASE.map((tile) => (
          <View key={tile.image} style={[ui.panel, { flex: wide ? 1 : undefined, padding: 0, overflow: "hidden", borderColor: colors.brassDim }]}>
            <Image
              source={{ uri: art(tile.image) }}
              // Side by side, one shape for all three, each whole: the Tinker stands at the left edge.
              resizeMode={wide ? "contain" : "cover"}
              style={{ width: "100%", aspectRatio: wide ? 2.2 : tile.aspect, backgroundColor: colors.soot }}
              accessibilityLabel={`A screenshot: ${tile.title}`}
            />
            <View style={{ padding: 16, gap: 6 }}>
              <Text style={[ui.heading, { fontSize: 18 }]}>{tile.title}</Text>
              <Text style={[ui.text, { fontSize: 15, lineHeight: 22, color: colors.steam }]}>{tile.line}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={[ui.panel, { alignItems: "center", gap: 6, paddingVertical: 18, borderColor: colors.panelEdge }]}>
        <Text style={[ui.text, { fontSize: 15, textAlign: "center", color: colors.steam }]}>
          Free to play in your browser. No story is ever sold, and nothing in the shop can't also be bought with Crowns earned in the game.
        </Text>
        <Text style={[ui.muted, { fontSize: 14, textAlign: "center" }]}>
          Signing in only keeps your workshop yours: we never see your password, never post anything, and show no ads.
        </Text>
        <View style={{ flexDirection: "row", gap: 16, marginTop: 4 }}>
          <LegalLink path="/privacy.html" label="Privacy" />
          <LegalLink path="/terms.html" label="Terms" />
        </View>
      </View>
    </View>
  );
}

/** The privacy and terms pages are static files beside the bundle (public/). */
function LegalLink({ path, label }: { path: string; label: string }) {
  const open = () => Linking.openURL(globalThis.location ? `${globalThis.location.origin}${path}` : `https://thelongboil.com${path}`);
  return (
    <Text onPress={open} accessibilityRole="link" style={[ui.muted, { fontSize: 13, textDecorationLine: "underline" }]}>
      {label}
    </Text>
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
