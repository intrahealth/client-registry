<template>
  <v-container>
    <center>
      <v-layout
        row
        wrap
      >
        <v-flex xs3 />
        <v-flex xs6>
          <v-alert
            type="error"
            :value="authStatus"
          > {{ $t('auth_failed') }}
          </v-alert>
        </v-flex>
      </v-layout>
      <v-card
        width="430px"
        hover
      >
        <v-card-title primary-title>
          <v-toolbar
            color="primary"
            style="color: white"
          >
            <v-layout
              row
              wrap
            >
              <v-flex
                xs2
                text-xs-left
              >
                <v-icon
                  x-large
                  color="white"
                >
                  mdi-lock
                </v-icon>
              </v-flex>
              <v-flex
                xs9
                text-xs-right
              >
                <b>  {{ $t('login') }}</b>
              </v-flex>
            </v-layout>
          </v-toolbar>
        </v-card-title>
        <v-card-text>
          <v-form
            ref="form"
            class="pa-3 pt-4"
          >
            <v-text-field
              v-model="username"
              required
              filled
              color="deep-purple"
              :label="$t('labels_Username')"
              @keyup.enter="authenticate()"
              @blur="$v.username.$touch()"
              @change="$v.username.$touch()"
              :error-messages="usernameErrors"
            />
            <v-text-field
              v-model="password"
              required
              filled
              type="password"
              color="deep-purple"
              :label="$t('labels_Password')"
              @keyup.enter="authenticate()"
              @blur="$v.password.$touch()"
              @change="$v.password.$touch()"
              :error-messages="passwordErrors"
            />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-toolbar>
            <v-spacer />
            <v-btn
              class="white--text"
              color="primary"
              depressed
              @click="authenticate()"
              :disabled="$v.$invalid"
            >
              <v-icon left>mdi-lock-open-variant</v-icon>
              {{ $t('login') }}
            </v-btn>
          </v-toolbar>
        </v-card-actions>
      </v-card>
    </center>
  </v-container>
</template>
<script>
import { required } from "vuelidate/lib/validators";
import axios from "axios";
import VueCookies from "vue-cookies";
import { generalMixin } from "@/mixins/generalMixin";

export default {
  mixins: [generalMixin],
  validations: {
    username: { required },
    password: { required }
  },
  data() {
    return {
      username: "",
      password: "",
      authStatus: false
    };
  },
  methods: {
    authenticate() {
      let formData = new FormData();
      formData.append("username", this.username);
      formData.append("password", this.password);
      let params = { username: this.username, password: this.password };
      axios({
        method: "POST",
        url: "/ocrux/user/authenticate",
        params
      })
        .then(authResp => {
          this.countMatchIssues();
          this.countNewAutoMatches();
          this.getClients();
          this.$store.state.auth.token = authResp.data.token;
          this.$store.state.auth.username = this.username;
          this.$store.state.auth.userID = authResp.data.userID;
          this.$store.state.auth.role = authResp.data.role;
          VueCookies.config("30d");
          VueCookies.set("token", this.$store.state.auth.token, "infinity");
          VueCookies.set("userID", this.$store.state.auth.userID, "infinity");
          VueCookies.set(
            "username",
            this.$store.state.auth.username,
            "infinity"
          );
          this.$store.state.auth.role = authResp.data.role;
          if (!authResp.data.token) {
            this.authStatus = true;
          } else {
            this.$store.state.denyAccess = false;
            this.$router.push({
              name: "home"
            });
          }
        })
        .catch(err => {
          this.$store.state.progress.enable = false;
          this.$store.state.alert.show = true;
          this.$store.state.alert.width = "500px";
          this.$store.state.alert.msg = this.$t('login_failed');
          this.$store.state.alert.type = "error";
          if (err.hasOwnProperty("response")) {
            throw err;
          }
        });
    }
  },
  computed: {
    usernameErrors() {
      const errors = [];
      if (!this.$v.username.$dirty) return errors;
      !this.$v.username.required && errors.push(this.$t('username_required'));
      return errors;
    },
    passwordErrors() {
      const errors = [];
      if (!this.$v.password.$dirty) return errors;
      !this.$v.password.required && errors.push(this.$t('password_required'));
      return errors;
    }
  }
};
</script>

