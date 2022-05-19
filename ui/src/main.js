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
new Vue({
  router,
  store,
  vuetify,
  render: h => h(App)
}).$mount("#app");