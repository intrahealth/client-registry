<template>
  <v-app>
    <v-app-bar
      app
      color="primary"
      dark
    >
      <v-toolbar-title class="display-1">Open Client Registry</v-toolbar-title>
      <v-spacer></v-spacer>
      <v-toolbar-items>
        <v-btn
          color="primary"
          to="/"
          v-if='!$store.state.denyAccess'
        >
          <v-icon>mdi-home</v-icon> Home
        </v-btn>
        <v-btn
          color="primary"
          to="/addUser"
          v-if='!$store.state.denyAccess'
        >
          <v-icon>mdi-account-plus</v-icon> Add User
        </v-btn>
        <v-btn
          color="primary"
          to="/logout"
          v-if='!$store.state.denyAccess'
        >
          <v-icon>mdi-logout</v-icon> Logout
        </v-btn>
      </v-toolbar-items>
      <v-spacer />
    </v-app-bar>

    <v-content>
      <center>
        <v-alert
          :style="{width: $store.state.alert.width}"
          v-model="$store.state.alert.show"
          :type="$store.state.alert.type"
          :dismissible="$store.state.alert.dismisible"
          :transition="$store.state.alert.transition"
        >
          {{ $store.state.alert.msg }}
        </v-alert>
      </center>
      <router-view />
    </v-content>
  </v-app>
</template>

<script>
const backendServer = process.env.VUE_APP_BACKEND_SERVER;
import VueCookies from "vue-cookies";
import axios from "axios";
export default {
  name: "App",

  data: () => ({
    //
  }),
  created() {
    if (VueCookies.get("token") && VueCookies.get("userID")) {
      this.$store.state.auth.token = VueCookies.get("token");
      this.$store.state.auth.userID = VueCookies.get("userID");
      this.$store.state.auth.username = VueCookies.get("username");
      axios.get("/ocrux/isTokenActive/").then(response => {
        this.$store.state.denyAccess = false;
        axios.get("/ocrux/getURI").then((response) => {
          this.$store.state.systemURI = response.data
        }).catch((err) => {
          console.log(err);
        })
        axios.get("/ocrux/getClients").then((response) => {
          this.$store.state.clients = response.data
        }).catch((err) => {
          console.log(err);
        })
      });
    }
  }
};
</script>
