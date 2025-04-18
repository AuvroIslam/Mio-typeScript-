module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "google",
    "plugin:@typescript-eslint/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["../tsconfig.json", "../tsconfig.dev.json"],
    sourceType: "module",
    tsconfigRootDir: __dirname,
  },
  ignorePatterns: [
    "/lib/**/*", // Ignore built files.
    ".eslintrc.js", // Ignore this configuration file itself
  ],
  plugins: [
    "@typescript-eslint",
    "import",
  ],
  rules: {
    "quotes": ["off", "double"],
    "import/no-unresolved": 0,
    "indent": ["off", 2],
    "linebreak-style": 0,
    "valid-jsdoc": 0,
    "max-len": ["off", { "code": 120 }],
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "require-jsdoc": "off",
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "camelcase": "off",
    "comma-dangle": "off",
    "object-curly-spacing": "off",
    "no-trailing-spaces": "off"
  },
}; 