module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es6: true
  },
  extends: [],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly'
  },
  parserOptions: {
    ecmaVersion: 2018
  },
  rules: {
    "semi": ["error", "always"],
    "camelcase": "off",
    "comma-dangle": "off",
    "indent": ["error", 2],
    "prefer-const": ["error", {
      "destructuring": "any",
      "ignoreReadBeforeAssign": false
    }]
  }
}