import Vue from "vue";
import App from "./App.vue";
import router from "./router";
import vuetify from "./plugins/vuetify";
import fhirutils from "./plugins/fhirutils";
import Vuelidate from 'vuelidate'
import axios from "axios"
import VueAxios from "vue-axios"
import fhirpath from "fhirpath"
import {
  store
} from './store/store'
import VueI18n from 'vue-i18n'
import fr from './locales/fr.json'
import en from './locales/en.json'
import FlagIcon from 'vue-flag-icon';


Object.defineProperty(Vue.prototype, '$fhirpath', {
  value: fhirpath
})

Object.defineProperty(Vue.prototype, '$fhirutils', {
  value: fhirutils
})
Vue.config.productionTip = false;
Vue.use(VueAxios, axios)
Vue.use(Vuelidate)
Vue.use(require('vue-moment'));
Vue.use(VueI18n)
Vue.use(FlagIcon);

const i18n = new VueI18n({
  locale: 'fr', // Set the default locale here
  messages: {  fr, en },
})

new Vue({
  router,
  store,
  vuetify,
  i18n,
  render: h => h(App)
}).$mount("#app");