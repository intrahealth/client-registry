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
    dynamicProgress: false,
    csvs: [
      {
        "uid": "03861b8b-1112-45e7-bb33-529c8ae928f8",
        "name": "EMR_1.csv",
        "date": "2021-01-29T10:23:14Z",
      },
      {
        "uid": "0e3a637f-e0b1-4fb1-8635-4cab46e33f07",
        "name": "Labs.csv",
        "date": "2021-02-02T14:41:28Z",
      },
      {
        "uid": "2ac2c4ad-1893-40ed-9b54-5002ccc46e2b",
        "name": "EMR_2.csv",
        "date": "2021-01-14T08:56:31Z",
      },
    ]
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