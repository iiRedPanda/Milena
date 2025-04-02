export default [
    {
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        globals: {
          node: true,
          es2021: true
        }
      },
      rules: {
        "no-unused-vars": "warn",
        "no-console": "off"
      }
    }
  ];
  