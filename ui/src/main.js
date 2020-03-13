import Vue from "vue";
import App from "./App.vue";
import router from "./router";
import vuetify from "./plugins/vuetify";
import Vuelidate from 'vuelidate'
import axios from "axios"
import VueAxios from "vue-axios"
import {
  store
} from './store/store'

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