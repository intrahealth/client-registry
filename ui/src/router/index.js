import Vue from "vue";
import VueRouter from "vue-router";
import Home from "../views/Home.vue";
import Client from "../views/Client.vue";
import Review from "../views/Review.vue";
import Resolve from "../views/Resolve.vue";
import CSVReport from "../views/CSVReport.vue";
import AddUser from "../views/AddUser.vue";
import usersList from "../views/usersList.vue"
import ChangePassword from "../views/ChangePassword.vue"
import Login from '@/views/Login.vue'
import Logout from '@/components/Logout.vue'
import VueCookies from 'vue-cookies'
import {
  store
} from '../store/store.js'

Vue.use(VueRouter);

const routes = [{
    path: "/",
    name: "home",
    component: Home
  },
  {
    path: "/client/:clientId",
    name: "client",
    component: Client
  },
  {
    path: "/review",
    name: "review",
    component: Review
  },
  {
    path: "/resolve/:clientId?",
    name: "resolve",
    component: Resolve
  },
  {
    path: "/csvreport",
    name: "csvreport",
    component: CSVReport
  },
  {
    path: '/addUser',
    name: 'AddUser',
    component: AddUser
  },
  {
    path: '/usersList',
    name: 'usersList',
    component: usersList
  },
  {
    path: '/changePassword',
    name: 'ChangePassword',
    component: ChangePassword
  },
  {
    path: '/login',
    name: 'Login',
    component: Login
  },
  {
    path: '/logout',
    name: 'Se déconnecter',
    component: Logout
  }
];

const router = new VueRouter({
  routes
});

router.beforeEach((to, from, next) => {
  if (!store.state.auth.token &&
    (!VueCookies.get('token') || VueCookies.get('token') === 'null' || !VueCookies.get('userID') || VueCookies.get('userID') === 'null')
  ) {
    store.state.denyAccess = true
    if (to.path !== '/Login') {
      next({
        path: '/Login'
      })
    } else {
      return next()
    }
  } else {
    next()
  }
})

export default router;