<template>
  <v-app>
    <v-app-bar
      app
      color="primary"
      dark
      clipped-right
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
          to="/review"
          v-if='!$store.state.denyAccess'
        >
          <v-badge color="error" :content="$store.state.totalMatchIssues" >
          <v-icon>mdi-alert</v-icon> Action Required
          </v-badge>
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

    <v-main>
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
      <v-dialog
        v-model="$store.state.progress.enable"
        persistent
        :width="$store.state.progress.width"
      >
        <v-card
          color="primary"
          dark
        >
          <v-card-text>
            {{$store.state.progress.title}}
            <v-progress-linear
              indeterminate
              color="white"
              class="mb-0"
            ></v-progress-linear>
          </v-card-text>
        </v-card>
      </v-dialog>
      <router-view />
    </v-main>
  </v-app>
</template>

<script>
import VueCookies from "vue-cookies";
import axios from "axios";
import { generalMixin } from "@/mixins/generalMixin";
export default {
  name: "App",
  mixins: [generalMixin],
  data() {
    return {
      totalMatchIssues: 0
    }
  },
  created() {
    if (VueCookies.get("token") && VueCookies.get("userID")) {
      this.$store.state.auth.token = VueCookies.get("token");
      this.$store.state.auth.userID = VueCookies.get("userID");
      this.$store.state.auth.username = VueCookies.get("username");
      axios.get("/ocrux/isTokenActive/").then(() => {
        this.$store.state.denyAccess = false;
        axios
          .get("/config/getURI")
          .then(response => {
            this.$store.state.systemURI = response.data;
          })
          .catch(err => {
            throw err;
          });
        this.getClients();
      });
    }
    this.countMatchIssues();
  }
};
</script>
