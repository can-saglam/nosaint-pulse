export type QuestionType =
  | "single" // single choice
  | "multi" // multiple choice
  | "text" // open text
  | "scale" // 1-10 likelihood
  | "nps" // 0-10 net promoter
  | "rating"; // 1-5 stars

export interface Question {
  id: string;
  type: QuestionType;
  title: string;
  subtitle?: string;
  options?: string[];
  placeholder?: string;
  optional?: boolean;
  // labels for scale endpoints
  minLabel?: string;
  maxLabel?: string;
  /**
   * Per-option skip logic (single-select only). Keyed by option text →
   * target question id, or the literal "END" to finish the survey.
   * Options without an entry fall through to the next question.
   */
  branches?: Record<string, string>;
  /** custom canvas position (birds-eye flow view); falls back to auto-layout */
  x?: number;
  y?: number;
}

/** sentinel branch target meaning "finish the survey" */
export const BRANCH_END = "END";

/**
 * The live NO SAINT pod range (1.8% SKUs). Use this as the option set for
 * any question that asks about flavours, so respondents pick from the real
 * catalogue instead of free-typing names we then have to reconcile.
 */
export const flavours = [
  "McIntosh Apple Nectar",
  "Haden Mango Nectar",
  "Honeydew Melon Nectar",
  "Sweet Grapefruit Nectar",
  "Summer Grape Nectar",
  "Jasmine Iced Tea, Cane Sugar",
  "Pineapple Coconut Nectar",
  "Lychee Nectar",
  "Passion Fruit Nectar",
  "Spearmint, Cane Sugar",
  "Raspberry, Gooseberry Nectar",
  "Limoncello",
];

export type SurveyStatus = "draft" | "ready" | "live";

export interface Segment {
  id: string;
  index: number;
  name: string;
  definition: string;
  goal: string;
  /** short hook shown on the picker card */
  blurb: string;
  /** visual accent: ns-green ('lime') or ns-black ('ink') */
  accent: "lime" | "ink";
  /** lifecycle state for the team */
  status?: SurveyStatus;
  /**
   * Completion incentive. "pods" = free pod pack (assumes they own a device);
   * "discount" = first-order offer for no-device segments. Defaults to "pods".
   */
  reward?: "pods" | "discount";
  questions: Question[];
}

export const segments: Segment[] = [
  {
    id: "prospect",
    index: 1,
    name: "Prospect",
    definition: "Signed up / email captured but 0 orders",
    goal: "Understand barriers to first purchase",
    blurb: "Recently active, hasn’t ordered yet.",
    accent: "lime",
    reward: "discount",
    questions: [
      {
        id: "p1",
        type: "single",
        title: "How did you first hear about NO SAINT?",
        options: [
          "Social media",
          "In a shop / on a shelf",
          "A friend",
          "An influencer or review",
          "NFC tap on a device",
          "Google search",
          "Other",
        ],
      },
      {
        id: "p2",
        type: "single",
        title: "What best describes where you are right now?",
        options: [
          "I’m still deciding which flavour to try",
          "I’m not sure the device is right for me",
          "The price feels high for a first try",
          "I’m planning to order soon",
          "I’m on another brand and not ready to switch",
        ],
      },
      {
        id: "p3",
        type: "multi",
        title: "Which flavour(s) caught your eye?",
        subtitle: "Pick any that stood out when you looked at our pods.",
        options: [...flavours],
      },
      {
        id: "p4",
        type: "single",
        title: "What would make you feel confident enough to place your first order?",
        options: [
          "A sample kit option",
          "More reviews from people like me",
          "A clearer explanation of how it works",
          "A discount on my first order",
          "Nothing — I’m about to order",
        ],
      },
      {
        id: "p5",
        type: "scale",
        title: "How likely are you to try NO SAINT in the next 30 days?",
        minLabel: "Not likely",
        maxLabel: "Very likely",
      },
    ],
  },
  {
    id: "first-timer",
    index: 2,
    name: "First-timer",
    definition: "Exactly 1 completed order",
    goal: "Understand first-impression satisfaction and reorder intent",
    blurb: "One order in. First impressions matter.",
    accent: "ink",
    questions: [
      {
        id: "f1",
        type: "rating",
        title: "How would you rate the NO SAINT vaporiser overall?",
        subtitle: "Your experience with the device.",
      },
      {
        id: "f2",
        type: "multi",
        title: "Which flavour(s) did you try?",
        subtitle: "Select all the pods you’ve had so far.",
        options: [...flavours],
      },
      {
        id: "f3",
        type: "single",
        title: "How does NO SAINT compare to what you were using before?",
        options: [
          "Noticeably better",
          "About the same",
          "Not quite what I expected",
          "I haven’t compared yet",
        ],
      },
      {
        id: "f4",
        type: "single",
        title: "What’s the main reason you haven’t reordered yet?",
        options: [
          "I still have pods left",
          "I’m trying a different flavour next time",
          "Price",
          "I had an issue with my order or product",
          "I’m not sure I’ll carry on vaping",
          "I’ve already reordered!",
        ],
      },
      {
        id: "f5",
        type: "text",
        title: "Is there anything you wish you’d known before buying?",
        subtitle: "About the device or pods.",
        placeholder: "Type your answer…",
        optional: true,
      },
      {
        id: "f6",
        type: "nps",
        title: "How likely are you to recommend NO SAINT to a friend?",
        minLabel: "Not at all likely",
        maxLabel: "Extremely likely",
      },
    ],
  },
  {
    id: "returning",
    index: 3,
    name: "Returning buyer",
    definition: "2+ completed orders",
    goal: "Understand loyalty drivers, flavour preferences and upsell signals",
    blurb: "Loyal. Reordering. Worth listening to.",
    accent: "lime",
    questions: [
      {
        id: "r1",
        type: "multi",
        title: "Which flavours have become your regulars?",
        subtitle:
          "Pick your go-tos. Choose “Other” to suggest one we don’t stock yet.",
        options: [...flavours, "Other"],
      },
      {
        id: "r2",
        type: "single",
        title: "How do you typically stock up?",
        options: [
          "Single pack as I need it",
          "4-pack at a time",
          "8-pack to save",
          "Mix depending on the month",
        ],
      },
      {
        id: "r3",
        type: "single",
        title: "Have you used the NFC tap on your device to access the shop?",
        subtitle: "Tap your device with your phone — Magic Tap.",
        options: [
          "Yes, regularly",
          "Yes, once or twice",
          "No, I didn’t know that was a feature",
          "No, I prefer to go straight to the website",
        ],
      },
      {
        id: "r4",
        type: "single",
        title: "What’s the one thing that would make you order even more frequently?",
        options: [
          "More flavour variety",
          "Better bulk pricing",
          "Faster / free delivery",
          "A loyalty reward programme",
          "Nothing, I’m happy with how things are",
        ],
      },
      {
        id: "r5",
        type: "single",
        title: "Have you recommended NO SAINT to anyone?",
        options: [
          "Yes, and they’ve ordered",
          "Yes, but not sure if they ordered",
          "No, but I’d be open to it",
          "No",
        ],
      },
      {
        id: "r7",
        type: "nps",
        title: "How likely are you to recommend NO SAINT to a friend?",
        minLabel: "Not at all likely",
        maxLabel: "Extremely likely",
      },
      {
        id: "r6",
        type: "text",
        title: "Is there anything about the experience that frustrates you?",
        subtitle: "Ordering, the device, the pods — anything.",
        placeholder: "Type your answer…",
        optional: true,
      },
    ],
  },
  {
    id: "dormant-prospect",
    index: 4,
    name: "Dormant prospect",
    definition: "0 orders, no activity in 60+ days",
    goal: "Re-engage or understand lost intent",
    blurb: "Signed up, went quiet. Never ordered.",
    accent: "ink",
    reward: "discount",
    questions: [
      {
        id: "dp1",
        type: "single",
        title: "Do you remember signing up to NO SAINT?",
        options: ["Yes", "Vaguely", "No, not really"],
      },
      {
        id: "dp2",
        type: "single",
        title: "Are you currently vaping?",
        options: [
          "Yes, with a different brand",
          "Yes, still deciding on a brand",
          "No, I’ve stopped for now",
          "No, I never started — I was just curious",
        ],
        // only ask "what's keeping you there" (dp3) of people on another brand
        branches: {
          "Yes, still deciding on a brand": "dp4",
          "No, I’ve stopped for now": "dp4",
          "No, I never started — I was just curious": "dp4",
        },
      },
      {
        id: "dp3",
        type: "single",
        title: "What’s keeping you with your current brand?",
        options: [
          "Price",
          "Flavour range",
          "Habit",
          "I couldn’t find NO SAINT in stock",
          "Other",
        ],
      },
      {
        id: "dp4",
        type: "single",
        title: "What would bring you back to take a look?",
        options: [
          "A good first-order offer",
          "More flavour choice",
          "A friend’s recommendation",
          "A no-risk sample option",
          "Honestly, nothing right now",
        ],
      },
    ],
  },
  {
    id: "dormant-first-timer",
    index: 5,
    name: "Dormant first-timer",
    definition: "1 order, no reorder in 60+ days",
    goal: "One-and-done vs. a recoverable lapse",
    blurb: "Tried it once. Didn’t come back.",
    accent: "lime",
    questions: [
      {
        id: "df1",
        type: "single",
        title: "Are you still vaping?",
        options: [
          "Yes, but with a different brand/product",
          "Yes, but I ran out and haven’t restocked",
          "I’ve cut down or stopped",
          "Still using what I have from my first order",
        ],
      },
      {
        id: "df2",
        type: "single",
        title: "How did you find your first NO SAINT order overall?",
        options: [
          "Really positive",
          "It was fine, nothing memorable",
          "Had a minor issue",
          "Had a significant issue",
        ],
      },
      {
        id: "df3",
        type: "single",
        title: "Is the NO SAINT device still in your rotation?",
        options: [
          "Yes, it’s my main device",
          "It’s sitting in a drawer",
          "I’ve lost or damaged it",
          "No, I’ve moved on",
        ],
      },
      {
        id: "df4",
        type: "single",
        title: "What would it take for you to reorder?",
        options: [
          "A discount or deal",
          "A new flavour launch",
          "Just a reminder, honestly",
          "Knowing other people rate it",
          "I don’t think I’ll be reordering",
        ],
      },
      {
        id: "df5",
        type: "text",
        title: "Anything we could have done better after your first order?",
        placeholder: "Type your answer…",
        optional: true,
      },
    ],
  },
  {
    id: "dormant-returner",
    index: 6,
    name: "Dormant returner",
    definition: "2+ orders, gone quiet for 90+ days",
    goal: "Understand churn from your most valuable segment",
    blurb: "Was a repeat buyer. Now silent.",
    accent: "ink",
    questions: [
      {
        id: "dr1",
        type: "single",
        title: "What’s the main reason you haven’t ordered recently?",
        options: [
          "I moved to a different brand",
          "I’m vaping less or have stopped",
          "Price",
          "I had an issue that put me off",
          "Life just got in the way — I’ll be back",
        ],
        // only ask "what drew you away" (dr2) of people who actually switched
        branches: {
          "I’m vaping less or have stopped": "dr3",
          Price: "dr3",
          "I had an issue that put me off": "dr3",
          "Life just got in the way — I’ll be back": "dr3",
        },
      },
      {
        id: "dr2",
        type: "single",
        title: "What drew you to the other brand?",
        options: [
          "Better flavours elsewhere",
          "Lower price",
          "Easier availability (retail stores)",
          "Someone recommended another brand",
          "Other",
        ],
      },
      {
        id: "dr3",
        type: "single",
        title: "Would you come back for pods?",
        subtitle: "If you still have your NO SAINT device.",
        options: [
          "Yes, actively thinking about it",
          "Maybe, with the right reason",
          "Unlikely",
          "I no longer have the device",
        ],
      },
      {
        id: "dr4",
        type: "scale",
        title: "How would you rate your overall experience as a NO SAINT customer?",
        minLabel: "Poor",
        maxLabel: "Excellent",
      },
      {
        id: "dr5",
        type: "text",
        title: "What’s one thing we could change that would bring you back?",
        placeholder: "Type your answer…",
      },
    ],
  },
];

export const getSegment = (id: string) => segments.find((s) => s.id === id);
