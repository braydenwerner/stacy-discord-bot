/** @typedef  {import("prettier").Config} PrettierConfig*/

const config = {
  arrowParens: "always",
  printWidth: 80,
  singleQuote: false,
  semi: true,
  trailingComma: "all",
  tabWidth: 2,
  // importOrder: [
  //   "<THIRD_PARTY_MODULES>", // Imports not matched by other special words or groups.
  //   "",
  //   "^@/utils/(.*)$",
  //   "^@/events/(.*)$",
  //   "^@/commands/(.*)$",
  //   "^@/types/(.*)$",
  //   "^@/(.*)$",
  //   "^[./]",
  // ],
  plugins: ["@ianvs/prettier-plugin-sort-imports"],
  importOrder: [
    "<THIRD_PARTY_MODULES>",
    "",
    "^@utils/(.*)$",
    "^@events/(.*)$",
    "^@commands/(.*)$",
    "^@types/(.*)$",
    "^[./]",
  ],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
  importOrderBuiltinModulesToTop: true,
  importOrderMergeDuplicateImports: true,
  importOrderCombineTypeAndValueImports: true,
};

module.exports = config;
