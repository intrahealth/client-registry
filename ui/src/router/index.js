import Vue from "vue";
import VueRouter from "vue-router";
import Home from "../views/Home.vue";
import Client from "../views/Client.vue";
import Review from "../views/Review.vue";
import AutoMatches from "../views/AutoMatches.vue";
import AuditLogs from "../views/AuditLogs.vue";
import Resolve from "../views/Resolve.vue";
import AddUser from "../views/AddUser.vue";
import usersList from "../views/usersList.vue"
import Configuration from "../views/Configuration.vue"
import ChangePassword from "../views/ChangePassword.vue"
import UserManagement from "../views/UserManagement.vue";
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
    path: "/automatch",
    name: "automatch",
    component: AutoMatches
  },
  {
    path: "/resolve/:clientId?",
    name: "resolve",
    component: Resolve
  },
  {
    path : "/logs",
    name : "auditlogs",
    component : AuditLogs
  },
    {
    path : "/config",
    name : "configuration",
    component : Configuration
  },
  {
    path : "/user-management",
    name : "users",
    component : UserManagement
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
    name: 'Logout',
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