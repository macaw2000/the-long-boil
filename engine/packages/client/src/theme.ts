// Brass on soot (docs/art-brief.md): warm metal accents on a dark workshop.

import { StyleSheet } from "react-native";

export const colors = {
  soot: "#1b1712",
  panel: "#26201a",
  panelEdge: "#3d3226",
  brass: "#c9a25a",
  brassDim: "#8a7040",
  copper: "#b8693d",
  steam: "#d9d2c3",
  ink: "#efe7d6",
  muted: "#9c907c",
  scald: "#d0573f",
  verdigris: "#5e9c86",
};

export const fonts = {
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, Menlo, monospace",
};

export const ui = StyleSheet.create({
  panel: {
    backgroundColor: colors.panel,
    borderColor: colors.panelEdge,
    borderWidth: 1,
    borderRadius: 6,
    padding: 14,
    gap: 8,
  },
  heading: { color: colors.brass, fontFamily: fonts.serif, fontSize: 17, fontWeight: "700" },
  text: { color: colors.ink, fontFamily: fonts.serif, fontSize: 14 },
  muted: { color: colors.muted, fontFamily: fonts.serif, fontSize: 13 },
  number: { color: colors.ink, fontFamily: fonts.mono, fontSize: 13 },
  button: {
    backgroundColor: colors.brassDim,
    borderRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  buttonText: { color: colors.soot, fontFamily: fonts.serif, fontWeight: "700", fontSize: 14 },
  input: {
    borderColor: colors.panelEdge,
    borderWidth: 1,
    borderRadius: 4,
    color: colors.ink,
    backgroundColor: colors.soot,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontFamily: fonts.mono,
    fontSize: 14,
  },
});
