module.exports = {
  env: {
    browser: true,
    es6: true,
    node: true
  },
  extends: [
    "eslint:recommended",
    'plugin:vue/essential'
  ],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  parserOptions: {
    ecmaVersion: 2019,
    sourceType: 'module',
  },
  plugins: [
    'vue',
  ],
  rules: {
    'no-console': 'off'
  },
};

// module.exports = {
//   "env": {
//     "browser": true,
//     "es6": true,
//     "node": true
//   },
//   "parserOptions": {
//     "parser": "babel-eslint"
//   },
//   "extends": [
//     "airbnb-base",
//     "plugin:vue/recommended"
//   ],
//   "rules": {}
// }