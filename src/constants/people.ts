export const DEFAULT_USER_ID = "278346419289718785"; // michael d.

// Known people. `michael` alone resolves to the default (Michael D.);
// "michael f" resolves to Michael F.
export const USER_IDS: Record<string, string> = {
  will: "238869227765891073",
  michael: DEFAULT_USER_ID,
  "michael d": DEFAULT_USER_ID,
  "michael f": "304779458802483221",
  aaron: "198254415440904192",
  ben: "213098147277176842",
  ryley: "152268038983516162",
  brayden: "268201627452833794",
  kevin: "543923375438036993",
  ashwin: "304032268836667394",
};

// Named groups -> member ids.
export const GROUPS: Record<string, string[]> = {
  "baldurs gate": [
    USER_IDS.ben,
    USER_IDS.ryley,
    USER_IDS.aaron,
    USER_IDS.brayden,
  ],
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Case-insensitive, punctuation-tolerant person lookup.
export function resolveUserId(rawName: string): string | undefined {
  const name = normalize(rawName);
  if (USER_IDS[name]) return USER_IDS[name];

  const [first, second] = name.split(" ");
  if (first === "michael") {
    // Default to Michael D. unless the "F" last initial is given.
    return second?.startsWith("f") ? USER_IDS["michael f"] : DEFAULT_USER_ID;
  }
  return USER_IDS[first];
}

// Case-insensitive group lookup (ignores a trailing "group").
export function resolveGroupIds(rawGroup: string): string[] | undefined {
  const key = normalize(rawGroup)
    .replace(/\bgroup\b/g, "")
    .trim();
  if (GROUPS[key]) return GROUPS[key];
  for (const name of Object.keys(GROUPS)) {
    if (key.includes(name)) return GROUPS[name];
  }
  return undefined;
}
