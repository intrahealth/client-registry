import Vue from "vue";
import Vuetify from "vuetify/lib";

Vue.use(Vuetify);

export default new Vuetify({
  theme: {
    themes: {
      light: {
        primary: "#569fd3",
        secondary: "#005595",
        accent: "#78496a",
        error: "#b32317",
        info: "#5f6062",
        success: "#8a8d35",
        warning: "#d06f1a"
      }
    }
  }
});
