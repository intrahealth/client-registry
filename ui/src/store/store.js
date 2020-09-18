import Vue from 'vue'
import Vuex from 'vuex'
import axios from 'axios'
import router from '../router'
import VueCookies from 'vue-cookies'

Vue.use(Vuex)

export const store = new Vuex.Store({
  state: {
    totalMatchIssues: 0,
    clients: [],
    systemURI: {},
    auth: {
      username: '',
      userID: '',
      role: '',
      token: ''
    },
    alert: {
      width: '800px',
      show: false,
      msg: '',
      type: 'success', // success or error
      dismisible: true,
      transition: 'scale-transition'
    },
    progress: {
      enable: false,
      width: "300",
      title: ''
    },
    denyAccess: true,
    dialogError: false,
    errorTitle: '',
    errorDescription: '',
    errorColor: 'primary',
    dynamicProgress: false
  }
})

axios.interceptors.request.use((config) => {
  let token = store.state.auth.token
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
}, (error) => {
  return Promise.reject(error)
})

axios.interceptors.response.use((response) => {
  return response
}, function (error) {
  let status = error.response.status
  if (status === 401) {
    store.state.auth.token = ''
    VueCookies.remove('token')
    router.push('login')
  }
  return Promise.reject(error)
})