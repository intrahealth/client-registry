<template>
  <v-app>
    <v-app-bar app color="primary" dark clipped-right>
      <v-toolbar-title class="display-1">National Health Client Registry</v-toolbar-title>
      <v-spacer></v-spacer>
      <v-toolbar-items>
        <!-- <v-btn color="primary" to="/dashboard" v-if='!$store.state.denyAccess && $store.state.auth.role !== "deduplication"'>
          <v-icon>mdi-home</v-icon> {{ $t('menu_dashboard') }}
        </v-btn> -->
        <v-btn color="primary" to="/" v-if='!$store.state.denyAccess'>
          <v-icon>mdi-home</v-icon> {{ $t('menu_home') }}
        </v-btn>
        <v-btn color="primary" to="/review" v-if='!$store.state.denyAccess'>
          <v-badge color="error" :content="$store.state.totalMatchIssues" :value="displayActionRequiredBadge"
            offset-x="100">
            <v-icon>mdi-alert</v-icon>{{ $t('menu_action_required') }}
          </v-badge>
        </v-btn>
        <v-btn color="primary" to="/automatch" v-if='!$store.state.denyAccess'>
          <v-badge color="error" :content="$store.state.totalAutoMatches" :value="displayAutoMatchBadge" offset-x="100">
            <v-icon>mdi-alert</v-icon> {{ $t('menu_auto_matches') }}
          </v-badge>
        </v-btn>
        <!-- <v-btn color="primary" to="/csvreport" v-if='!$store.state.denyAccess'>
          <v-icon>mdi-file-chart</v-icon>{{ $t('menu_csv') }}
        </v-btn> -->
        <v-menu bottom v-if='!$store.state.denyAccess && $store.state.auth.role !== "deduplication"'>
          <template v-slot:activator="{ on, attrs }">
            <v-btn color="primary" dark v-bind="attrs" v-on="on">
              <v-icon>mdi-flash-outline</v-icon>
              {{ $t('menu_settings') }}
            </v-btn>
          </template>
          <v-list>
            <v-list-item to="/user-management" v-if='!$store.state.denyAccess'>
              <v-icon>mdi-account-outline</v-icon> {{ $t('menu_accounts') }}
            </v-list-item>
            <v-list-item to="/logs" v-if='!$store.state.denyAccess'>
              <v-icon>mdi-shape-rectangle-plus</v-icon> {{ $t('settings_logs') }}
            </v-list-item>
            <v-list-item to="/config" v-if='!$store.state.denyAccess'>
              <v-icon>mdi-door-open</v-icon> {{ $t('settings_config') }}
            </v-list-item>
          </v-list>
        </v-menu>
        <!-- <v-menu bottom v-if='!$store.state.denyAccess && $store.state.auth.role !== "deduplication"'>
          <template v-slot:activator="{ on, attrs }">
            <v-btn color="primary" dark v-bind="attrs" v-on="on">
              <v-icon>mdi-account-outline</v-icon>
              {{ $t('menu_accounts') }}
            </v-btn>
          </template>

          <v-list>
            <v-list-item to="/addUser" v-if='!$store.state.denyAccess'>
              <v-icon>mdi-account-plus</v-icon> {{ $t('account_add') }}
            </v-list-item>
            <v-list-item to="/usersList" v-if='!$store.state.denyAccess'>
              <v-icon>mdi-account-plus</v-icon> {{ $t('account_list') }}
            </v-list-item>
            <v-list-item to="/changePassword" v-if='!$store.state.denyAccess'>
              <v-icon>mdi-account-plus</v-icon> {{ $t('account_change_password') }}
            </v-list-item>
          </v-list>
        </v-menu> -->
        <v-btn color="primary" to="/logout" v-if='!$store.state.denyAccess'>
          <v-icon>mdi-logout</v-icon> {{ $t('menu_logout') }}
        </v-btn>
        <!-- <div v-if='!$store.state.denyAccess' class="icon-div">
          <button v-for="entry in languages" :key="entry.title" @click="$i18n.locale=entry.language">
            <flag :iso="entry.flag" v-bind:squared=false /> {{entry.title}}
          </button>
        </div> -->

      </v-toolbar-items>
      <v-spacer />
    </v-app-bar>

    <v-main>
      <center>
        <v-alert :style="{width: $store.state.alert.width}" v-model="$store.state.alert.show"
          :type="$store.state.alert.type" :dismissible="$store.state.alert.dismisible"
          :transition="$store.state.alert.transition">
          {{ $store.state.alert.msg }}
        </v-alert>
      </center>
      <v-dialog v-model="$store.state.progress.enable" persistent :width="$store.state.progress.width">
        <v-card color="primary darken-1" dark>
          <v-card-text>
            {{$store.state.progress.title}}
            <v-progress-linear indeterminate color="white" class="mb-0"></v-progress-linear>
          </v-card-text>
        </v-card>
      </v-dialog>
      <router-view />
    </v-main>
    <AppFooter />
  </v-app>
</template>

<script>
import VueCookies from "vue-cookies";
import axios from "axios";
import { generalMixin } from "@/mixins/generalMixin";
import AppFooter from "./views/AppFooter.vue";

export default {
  name: "App",
  mixins: [generalMixin],
  components: {
    AppFooter
  },
  data() {
    return {
      totalMatchIssues: 0,
      totalAutoMatches: 0,
      languages: [
            { flag: 'us', language: 'en', title: 'English' },
        ]
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
          .get("/ocrux/config/getURI")
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
    this.countNewAutoMatches();
  },
  computed: {
    displayActionRequiredBadge() {
      if(this.$store.state.totalMatchIssues > 0) {
        return true
      }
      return false
    },
    displayAutoMatchBadge() {
      if(this.$store.state.totalAutoMatches > 0) {
        return true
      }
      return false
    }
  }
};
</script>
<style scoped>
.menuText {
  color: black;
  cursor: pointer;
}
.icon-div{
  padding-top: 15px;
  padding-left: 5px;
}
</style>