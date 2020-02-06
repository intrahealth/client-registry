import Vue from "vue";
import VueRouter from "vue-router";
import Home from "../views/Home.vue";
import Client from "../views/Client.vue";

Vue.use(VueRouter);

const routes = [
  {
    path: "/",
    name: "home",
    component: Home
  },
  {
    path: "/client/:clientId",
    name: "client",
    component: Client
  }
];

const router = new VueRouter({
  routes
});

export default router;
