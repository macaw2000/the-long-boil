// What the screen's own words mean, in a line or two each, for the tooltips
// on the top bar and the Story tab (Term.tsx). Drawn from GDD section 5 and
// kept to what the game does today: a Needle at 8 is called the redline, but
// only Scald's is promised, because only the Infirmary exists yet, and paying
// a debt clears the debt, not Arrears. Haze has no line: the bundle reaches
// every player, so its words would be readable before Act II (the reveal
// check guards "haze" below act 2). Its entry comes back with Act II's content.

export const glossary = {
  boiler:
    "Your workshop's steam. While the Boiler has steam, your queued work carries on, even while you are away, for up to 12 hours. Checking in tops it back up.",
  nerve:
    "Your story budget. Each scene costs Nerve, most of them 1. It refills by 1 every 36 minutes, up to 10, and keeps refilling while you are away.",
  crowns:
    "Kettleport's money. You earn it selling at the Counting-House window or on the Exchange, and spend it at the grocer's, on the Exchange and on your debts.",
  counting_house:
    "The Counting-House window is where Kettleport's bills are paid, and where you can sell what you make for Crowns.",
  pneumatic_post:
    "The brass tube above your bench. Letters drop into its tray as canisters, and each one is a scene in the Story tab.",
  rations:
    "A Ration is a wax-paper brick of stew. In a fight your Tinker eats one when hurt, to heal; make more at Cooking or buy them at the grocer's.",
  needles:
    "The four Needles are the story's risks. Each reads from 0 to 8 and falls by 1 every day on its own. They only touch the story: your Boiler, fights and trades carry on whatever they read.",
  "needle.scald":
    "Scald: bruises and burns from the city's physical risks, its vents, furnaces and rooftops. Some scenes, often for a Ration, bring it down. At 8 you are carried to the Infirmary of St. Pinion until you mend.",
  "needle.arrears":
    "Arrears: how deep in debt you are, from borrowing, bribes and deals gone wrong. Some scenes let you settle up and bring it down. 8 is the redline.",
  "needle.notice":
    "Notice: how much the Gaugers have noticed you, from broken locks, wrong questions and bad company. Some scenes let you lie low and bring it down. 8 is the redline.",
  foundry_pass:
    "The Foundry Pass lets you into the Cinderworks. It comes through the story, never the Cog Shop or the Exchange: near the end of Act I, a scene at the Brass Exchange offers it several ways, from mending a vent for the Stokers to taking it on credit from the Counting-House.",
} as const;

export type GlossaryTerm = keyof typeof glossary;
