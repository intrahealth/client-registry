<template>
  <v-container grid-list-xs>

  </v-container>
</template>
<script>
import VueCookies from "vue-cookies";
export default {
  mounted() {
    this.$store.state.auth.token = "";
    VueCookies.remove("token");
    VueCookies.remove("userID");
    VueCookies.remove("role");
    VueCookies.remove("username");
    this.$router.push("login");
    this.$store.state.denyAccess = true;
  }
};
</script>

