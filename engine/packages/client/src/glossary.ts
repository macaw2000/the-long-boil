// What the screen's own words mean, in a line or two each, for the tooltips
// on the top bar and the Story tab (Term.tsx). Drawn from GDD section 5 and
// kept to what the game does today: a Needle at 8 is called the redline, but
// only Scald's is promised, because only the Infirmary exists yet, and paying
// a debt clears the debt, not Arrears. Haze's line is safe to show because
// Haze itself stays hidden until Act II.

export const glossary = {
  boiler:
    "Your workshop's steam. While the Boiler has steam, your queued work carries on, even while you are away, for up to 12 hours. Checking in tops it back up.",
  nerve:
    "Your story budget. Each scene costs Nerve, most of them 1. It refills by 1 every 36 minutes, up to 10, and keeps refilling while you are away.",
  crowns:
    "Kettleport's money. You earn it selling at the Counting-House window or on the Exchange, and spend it at the grocer's, on the Exchange and on your debts.",
  needles:
    "The four Needles are the story's risks. Each reads from 0 to 8 and falls by 1 every day on its own. They only touch the story: your Boiler, fights and trades carry on whatever they read.",
  "needle.scald":
    "Scald: knocks and burns from the city's physical risks, its vents, furnaces and rooftops. Some scenes, often for a Ration, bring it down. At 8 you are carried to the Infirmary of St. Pinion until you mend.",
  "needle.arrears":
    "Arrears: how deep in debt you are, from borrowing, bribes and deals gone wrong. Some scenes let you settle up and bring it down. 8 is the redline.",
  "needle.notice":
    "Notice: how much the Gaugers have noticed you, from broken locks, wrong questions and bad company. Some scenes let you lie low and bring it down. 8 is the redline.",
  "needle.haze":
    "Haze: how far the Great Whistle has got into your head. Calming teas and Chapel services bring it down. 8 is the redline.",
} as const;

export type GlossaryTerm = keyof typeof glossary;
