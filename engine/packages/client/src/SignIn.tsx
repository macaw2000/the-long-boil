// The first screen: the splash art, then signing in and choosing a workshop.
// A login names an account, which holds up to 3 Tinkers. With Cognito (build
// plan milestone 11) each provider has its own button, which goes straight to
// that provider, and the login is the signed-in account's; without Cognito,
// the dev login takes any name typed here.

import { createElement, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Image, Linking, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
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

  // Before signing in, the panel is the solicitor's letter itself, which arrives sealed.
  const letter = cognitoEnabled && !signedIn && (
    <Letter still={still}>
      <Text style={[ui.text, { fontSize: 14, fontStyle: "italic", textAlign: "center", color: PAPER.muted }]}>
        The sea has boiled for 312 years. Nobody will say why.
      </Text>
      <Text style={[ui.heading, { fontSize: 22, textAlign: "center", color: PAPER.heading }]}>Sign in to play</Text>
      <Text style={[ui.text, { textAlign: "center", color: PAPER.ink }]}>The tenancy of No. 9 Sprocket Row, "contents included", is yours.</Text>
      <View style={{ gap: 10 }}>
        {providers.length ? (
          providers.map((provider) => <ProviderButton key={provider} provider={provider} onPress={() => signInWith(provider)} />)
        ) : (
          <Pressable style={[ui.button, { paddingVertical: 14 }]} onPress={() => signInWith()} accessibilityRole="button">
            <Text style={[ui.buttonText, { fontSize: 17 }]}>Sign in</Text>
          </Pressable>
        )}
      </View>
      {error && <Text style={[ui.text, { color: colors.scald, textAlign: "center" }]}>{error}</Text>}
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 16 }}>
        <LegalLink path="/privacy.html" label="Privacy" color={PAPER.muted} />
        <LegalLink path="/terms.html" label="Terms" color={PAPER.muted} />
      </View>
    </Letter>
  );

  const panel = letter || (
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
      <Text style={[ui.heading, { fontSize: 22, textAlign: "center" }]}>Your workshop</Text>
      <Text style={[ui.muted, { textAlign: "center" }]}>A solicitor's letter: the tenancy of No. 9 Sprocket Row, "contents included", is yours.</Text>
      {cognitoEnabled ? null : (
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
      {cognitoEnabled && tinkers === null ? null : tinkers === null ? (
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
      {cognitoEnabled && (
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
          <View style={{ flex: 2 }} />
          {panel}
          <View style={{ flex: 0.4, justifyContent: "flex-end", paddingBottom: 8 }}>
            {showcase && <SeeInside still={still} onPress={seeInside} />}
          </View>
        </View>
      )}
      {showcase && (
        <View style={{ width: "100%", alignItems: "center" }} onLayout={(event) => (showcaseTop.current = event.nativeEvent.layout.y)}>
          <Showcase wide={!tall && width >= 900} still={still} />
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
 * The splash painting in layers (art/splash/, cut by scripts/art/import_art.py),
 * back to front, each with how far it shifts, in pixels at 1440 wide, when the
 * view swings all the way: the nearer, the further. Every full-frame layer is
 * the painting's size, so drawn the same way they line up.
 */
const LAYERS = { sky: 6, roofs: 18, front: 30 };
const AIRSHIPS = [
  { file: "airship1.webp", aspect: 360 / 290, top: 2, width: 13, duration: 110000, phase: 0.05 },
  { file: "airship2.webp", aspect: 236 / 360, top: 46, width: 5, duration: 150000, phase: 0.3 },
  { file: "airship3.webp", aspect: 360 / 306, top: 30, width: 9, duration: 130000, phase: 0.85 },
];
const LAYER_FILES = ["sky.jpg", "roofs.webp", "front.webp", ...AIRSHIPS.map((ship) => ship.file)];

/**
 * Where the view is looking, from -1 to 1 each way: after the mouse where
 * there is one, and a slow sway of its own on a phone, where there is not.
 */
function useLook(still: boolean) {
  const look = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const sway = useLoop(24000, 0, still);
  const hover = typeof globalThis.matchMedia === "function" && globalThis.matchMedia("(hover: hover)").matches;
  useEffect(() => {
    if (still || !hover || typeof globalThis.addEventListener !== "function") return;
    const follow = (event: PointerEvent) => {
      const toValue = { x: (event.clientX / globalThis.innerWidth) * 2 - 1, y: (event.clientY / globalThis.innerHeight) * 2 - 1 };
      Animated.spring(look, { toValue, friction: 20, tension: 12, useNativeDriver: false }).start();
    };
    globalThis.addEventListener("pointermove", follow);
    return () => globalThis.removeEventListener("pointermove", follow);
  }, [still, hover]);
  if (hover) return look;
  return {
    x: sway.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, 1, 0, -1, 0] }),
    y: sway.interpolate({ inputRange: [0, 0.5, 1], outputRange: [-0.4, 0.4, -0.4] }),
  };
}

/**
 * The painting, alive: a slow push in, the layers shifting against each other
 * as the view swings, airships crossing the sky, steam rolling up off the
 * boiling sea behind the rooftops, and sparks drifting up past the Tinker.
 * The whole painting shows until every layer has loaded, and it all holds
 * still for anyone who asks their device for less motion.
 */
function LivingSplash({ still }: { still: boolean }) {
  const { width } = useWindowDimensions();
  const drift = useLoop(36000, 0, still);
  const look = useLook(still);
  const [loaded, setLoaded] = useState(0);
  const shown = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (loaded === LAYER_FILES.length) Animated.timing(shown, { toValue: 1, duration: 600, useNativeDriver: false }).start();
  }, [loaded]);
  const onLoad = () => setLoaded((count) => count + 1);

  // A little larger than the frame, so no layer's edge shows when it shifts.
  const scale = drift.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1.03, 1.08, 1.03] });
  const shift = (depth: number) => {
    const reach = (depth * width) / 1440;
    return [
      { translateX: look.x.interpolate({ inputRange: [-1, 1], outputRange: [reach, -reach] }) },
      { translateY: look.y.interpolate({ inputRange: [-1, 1], outputRange: [reach / 2, -reach / 2] }) },
      { scale },
    ];
  };
  const layer = (file: string, depth: number) => (
    <Animated.Image
      source={{ uri: art(`splash/${file}`) }}
      onLoad={onLoad}
      resizeMode="cover"
      style={{ position: "absolute", inset: 0, transformOrigin: "50% 30%", transform: shift(depth) }}
    />
  );

  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", inset: 0 }}
      accessible
      accessibilityRole="image"
      accessibilityLabel="The Long Boil: a young Tinker on a brass rooftop among airships"
    >
      <Animated.Image source={{ uri: art("splash.jpg") }} resizeMode="cover" style={{ position: "absolute", inset: 0, transformOrigin: "50% 30%", transform: [{ scale }] }} />
      <Animated.View style={{ position: "absolute", inset: 0, opacity: shown }}>
        {layer("sky.jpg", LAYERS.sky)}
        <Animated.View style={{ position: "absolute", inset: 0, transformOrigin: "50% 30%", transform: shift(LAYERS.sky + 4) }}>
          {AIRSHIPS.map((ship) => (
            <Airship key={ship.file} {...ship} still={still} onLoad={onLoad} />
          ))}
        </Animated.View>
        {!still && STEAM.map((puff, index) => <SteamPuff key={index} {...puff} />)}
        {layer("roofs.webp", LAYERS.roofs)}
        {layer("front.webp", LAYERS.front)}
      </Animated.View>
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

/** An airship sailing left to right across the sky, bobbing as it goes; top and width in percent of the frame. */
function Airship({ file, aspect, top, width, duration, phase, still, onLoad }: (typeof AIRSHIPS)[number] & { still: boolean; onLoad: () => void }) {
  const sail = useLoop(duration, 0, still);
  const bob = useLoop(7000 + duration / 40, 0, still);
  // Start part way across, so the sky is not empty on arrival.
  const along = Animated.modulo(Animated.add(sail, phase), 1);
  return (
    <Animated.Image
      source={{ uri: art(`splash/${file}`) }}
      onLoad={onLoad}
      resizeMode="contain"
      style={{
        position: "absolute",
        top: `${top}%`,
        width: `${width}%`,
        aspectRatio: aspect,
        left: along.interpolate({ inputRange: [0, 1], outputRange: [`${-width - 2}%`, "102%"] }),
        transform: [{ translateY: bob.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 6, 0] }) }],
      }}
    />
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

/**
 * What the game is, in real recordings and a screenshot, and what signing in
 * is for. The bench and the fight are clips of the real game, sped up through
 * the wait and back to real time for the moment it pays off; each still is
 * that moment, shown before the clip loads and to anyone who asks for less
 * motion.
 */
const SHOWCASE: { image: string; clip?: string; aspect: number; title: string; line: string }[] = [
  {
    image: "showcase/bench.jpg",
    clip: "showcase/bench.mp4",
    aspect: 1100 / 600,
    title: "Your workshop never sleeps",
    line: "Queue twelve hours of work, close the tab, and come back to finished spanners, full stores and Crowns in the till.",
  },
  {
    image: "showcase/fight.jpg",
    clip: "showcase/fight.mp4",
    aspect: 1100 / 600,
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

function Showcase({ wide, still }: { wide: boolean; still: boolean }) {
  return (
    <View style={{ width: "100%", maxWidth: 1160, paddingHorizontal: 16, paddingTop: 40, gap: 28 }}>
      <View style={{ alignItems: "center", gap: 10, maxWidth: 760, alignSelf: "center" }}>
        <Text style={[ui.heading, { fontSize: 26, textAlign: "center" }]}>A city above a boiling sea</Text>
        <Text style={[ui.text, { fontSize: 17, lineHeight: 26, textAlign: "center" }]}>
          Kettleport has ridden a column of steam for 312 years, and nobody in charge will say why the sea is still boiling. You inherit a
          cold workshop on Sprocket Row from a Tinker who vanished with a notebook full of questions.
        </Text>
      </View>
      {/* Wide, the clips have a row to themselves, big enough to read the game in; each still below lies on its side, picture beside words. */}
      <View style={{ flexDirection: wide ? "row" : "column", gap: 18 }}>
        {SHOWCASE.filter((tile) => !wide || tile.clip).map((tile) => (
          <ShowcaseTile key={tile.image} tile={tile} still={still} style={{ flex: wide ? 1 : undefined }} />
        ))}
      </View>
      {wide &&
        SHOWCASE.filter((tile) => !tile.clip).map((tile) => <ShowcaseTile key={tile.image} tile={tile} still={still} style={{ flexDirection: "row" }} />)}
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

/** Ink on the letter's cream paper, where the theme's light-on-soot colours would not read. */
const PAPER = { ink: "#3a2a18", heading: "#6b4a1c", muted: "#5e4c36" };

/** Where the seal sits on the envelope's flap, and how wide, as shares of the envelope (art/letter/, 720 by 546). */
const ENVELOPE_ASPECT = 720 / 546;
const SEAL = { x: 0.5, y: 0.635, width: 0.2, aspect: 240 / 228 };

/**
 * The sign-in as the solicitor's letter the game opens with (docs/gdd.md).
 * It arrives sealed; a tap cracks the wax, the halves fall away, the flap
 * opens and the letter rises out with the sign-in written on it. It comes
 * sealed every time: a player who stays signed in never sees it, so only
 * a new device or a signed-out player opens it. With less motion asked
 * for, it simply opens.
 */
function Letter({ still, children }: { still: boolean; children: React.ReactNode }) {
  const [opened, setOpened] = useState(false);
  const opening = useRef(false);
  const [width, setWidth] = useState(0);
  const crack = useRef(new Animated.Value(0)).current;
  const flap = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;
  const breathe = useLoop(2600, 0, still || opened);

  const breakSeal = () => {
    if (opening.current) return;
    opening.current = true;
    if (still) {
      [crack, flap, rise].forEach((value) => value.setValue(1));
      setOpened(true);
      return;
    }
    Animated.parallel([
      Animated.timing(crack, { toValue: 1, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.timing(flap, { toValue: 1, delay: 250, duration: 250, useNativeDriver: false }),
      Animated.timing(rise, { toValue: 1, delay: 500, duration: 850, easing: Easing.out(Easing.back(1.4)), useNativeDriver: false }),
    ]).start(() => setOpened(true));
  };

  // The envelope a little narrower than the letter, so it never stands taller than it.
  const envelopeWidth = width * 0.92;
  const envelopeHeight = envelopeWidth / ENVELOPE_ASPECT;
  const sealWidth = envelopeWidth * SEAL.width;
  const sealHeight = sealWidth / SEAL.aspect;
  const sealAt = { position: "absolute" as const, left: envelopeWidth * SEAL.x - sealWidth / 2, top: envelopeHeight * SEAL.y - sealHeight / 2, width: sealWidth, height: sealHeight };
  const half = (file: string, side: -1 | 1) => (
    <Animated.Image
      source={{ uri: art(`letter/${file}`) }}
      style={{
        ...sealAt,
        opacity: crack.interpolate({ inputRange: [0, 0.01, 0.6, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateX: crack.interpolate({ inputRange: [0, 1], outputRange: [0, side * sealWidth * 0.5] }) },
          { translateY: crack.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, -sealHeight * 0.1, sealHeight * 1.4] }) },
          { rotate: crack.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${side * 35}deg`] }) },
        ],
      }}
    />
  );

  return (
    <View style={{ width: "100%", maxWidth: 460 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {/* The letter, behind the envelope until it has risen out of it. */}
      <Animated.View
        pointerEvents={opened ? "auto" : "none"}
        style={{
          opacity: rise.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1] }),
          transform: [
            { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [envelopeHeight * 0.3, 0] }) },
            { scale: rise.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
          ],
          filter: "drop-shadow(0 12px 24px rgba(0, 0, 0, 0.6))",
        }}
      >
        <Image source={{ uri: art("letter/paper.webp") }} resizeMode="stretch" style={{ position: "absolute", inset: 0 }} />
        <View style={{ gap: 12, paddingHorizontal: "12%", paddingVertical: "9%" }}>{children}</View>
      </Animated.View>
      {!opened && width > 0 && (
        <Animated.View
          style={{
            position: "absolute",
            left: "4%",
            right: "4%",
            top: "50%",
            marginTop: -envelopeHeight / 2,
            height: envelopeHeight,
            opacity: rise.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: "clamp" }),
            transform: [
              { translateY: Animated.add(breathe.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -5, 0] }), rise.interpolate({ inputRange: [0, 1], outputRange: [0, envelopeHeight * 0.5] })) },
            ],
            filter: "drop-shadow(0 12px 24px rgba(0, 0, 0, 0.6))",
          }}
        >
          <Pressable onPress={breakSeal} accessibilityRole="button" accessibilityLabel="Break the seal and open the letter" style={{ flex: 1 }}>
            <Animated.Image source={{ uri: art("letter/closed.webp") }} style={{ position: "absolute", inset: 0, opacity: Animated.subtract(1, flap) }} />
            <Animated.Image source={{ uri: art("letter/open.webp") }} style={{ position: "absolute", inset: 0, opacity: flap }} />
            <Animated.Text
              style={[
                ui.text,
                { position: "absolute", left: 0, right: 0, top: "16%", textAlign: "center", fontStyle: "italic", fontSize: Math.max(14, envelopeWidth * 0.04), color: PAPER.ink },
                { opacity: Animated.subtract(1, flap) },
              ]}
            >
              To the new tenant,{"\n"}No. 9 Sprocket Row
            </Animated.Text>
            <Animated.Image
              source={{ uri: art("letter/seal.webp") }}
              style={{
                ...sealAt,
                opacity: crack.interpolate({ inputRange: [0, 0.01], outputRange: [1, 0], extrapolate: "clamp" }),
                transform: [{ scale: breathe.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.07, 1] }) }],
              }}
            />
            {half("seal-left.webp", -1)}
            {half("seal-right.webp", 1)}
            <Animated.Text
              style={[
                ui.heading,
                { position: "absolute", left: 0, right: 0, bottom: "7%", textAlign: "center", fontSize: Math.max(15, envelopeWidth * 0.04), color: PAPER.heading },
                { opacity: Animated.subtract(1, crack) },
              ]}
            >
              Break the seal
            </Animated.Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

/** One showcase card: the picture over its words, or beside them when laid in a row. */
function ShowcaseTile({ tile, still, style }: { tile: (typeof SHOWCASE)[number]; still: boolean; style: { flex?: number; flexDirection?: "row" } }) {
  const across = style.flexDirection === "row";
  return (
    <View style={[ui.panel, { padding: 0, overflow: "hidden", borderColor: colors.brassDim }, style]}>
      <View style={{ width: across ? "55%" : "100%" }}>
        <ShowcaseMedia tile={tile} aspect={tile.aspect} still={still} />
      </View>
      <View style={{ flex: across ? 1 : undefined, padding: across ? 24 : 16, gap: 6, justifyContent: "center" }}>
        <Text style={[ui.heading, { fontSize: across ? 22 : 18 }]}>{tile.title}</Text>
        <Text style={[ui.text, { fontSize: across ? 17 : 15, lineHeight: across ? 26 : 22, color: colors.steam }]}>{tile.line}</Text>
      </View>
    </View>
  );
}

/**
 * A tile's clip, playing on a loop without sound, or its still where there is
 * no clip, no browser video, or less motion asked for. A small mark says the
 * clip is sped up, since the real bench takes most of a minute a spanner.
 */
function ShowcaseMedia({ tile, aspect, still }: { tile: (typeof SHOWCASE)[number]; aspect: number; still: boolean }) {
  const box = { width: "100%", aspectRatio: aspect, backgroundColor: colors.soot } as const;
  if (!tile.clip || still || Platform.OS !== "web") {
    return <Image source={{ uri: art(tile.image) }} resizeMode="contain" style={box} accessibilityLabel={`A screenshot: ${tile.title}`} />;
  }
  return (
    <View style={box}>
      {createElement("video", {
        src: art(tile.clip),
        poster: art(tile.image),
        autoPlay: true,
        muted: true,
        loop: true,
        playsInline: true,
        "aria-label": `A recording: ${tile.title}`,
        style: { width: "100%", height: "100%", objectFit: "contain", display: "block" },
      })}
      <Text
        style={[
          ui.number,
          { position: "absolute", right: 8, bottom: 8, fontSize: 11, color: colors.steam, backgroundColor: "rgba(27, 23, 18, 0.8)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
        ]}
      >
        ▸▸ sped up
      </Text>
    </View>
  );
}

/** The privacy and terms pages are static files beside the bundle (public/). */
function LegalLink({ path, label, color }: { path: string; label: string; color?: string }) {
  const open = () => Linking.openURL(globalThis.location ? `${globalThis.location.origin}${path}` : `https://thelongboil.com${path}`);
  return (
    <Text onPress={open} accessibilityRole="link" style={[ui.muted, { fontSize: 13, textDecorationLine: "underline" }, color ? { color } : null]}>
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
