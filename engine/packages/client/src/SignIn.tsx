// A local dev sign-in until Cognito (build plan, Database): a login names an
// account, which holds up to 3 Tinkers.

import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { api } from "./api";
import { colors, ui } from "./theme";

export function SignIn({ onEnter }: { onEnter: (login: string, tinkerId: number) => void }) {
  const [login, setLogin] = useState("");
  const [tinkers, setTinkers] = useState<{ id: number; name: string }[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const lookUp = () =>
    api
      .listTinkers(login.trim())
      .then((result) => {
        setTinkers(result.tinkers);
        setError(null);
      })
      .catch((reason: Error) => setError(reason.message));

  const create = () =>
    api
      .createTinker(login.trim(), name.trim())
      .then((outcome) => onEnter(login.trim(), outcome.tinker.id))
      .catch((reason: Error) => setError(reason.message));

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
      <View style={[ui.panel, { width: "100%", maxWidth: 420, gap: 12 }]}>
        <Text style={[ui.heading, { fontSize: 22 }]}>The Long Boil</Text>
        <Text style={ui.muted}>
          A solicitor's letter: the tenancy of No. 9 Sprocket Row, "contents included", is yours.
        </Text>
        <TextInput
          style={ui.input}
          value={login}
          onChangeText={(text) => {
            setLogin(text);
            setTinkers(null);
          }}
          onSubmitEditing={lookUp}
          placeholder="login (any name, for now)"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          accessibilityLabel="Login"
        />
        {tinkers === null ? (
          <Pressable
            style={[ui.button, !login.trim() && { opacity: 0.4 }]}
            disabled={!login.trim()}
            onPress={lookUp}
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
      </View>
    </View>
  );
}
