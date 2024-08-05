<template>
  <v-container fluid>
    <v-layout
      row
      wrap
    >
      <v-spacer />
      <v-flex xs6>
        <v-card
          class="mx-auto"
          style="max-width: 500px;"
        >
          <v-system-bar
            color="primary"
            dark
          />
          <v-toolbar
            color="secondary"
            cards
            dark
            flat
          >
            <v-card-title class="title font-weight-regular">{{ $t('account_change_password') }}</v-card-title>
          </v-toolbar>
          <v-form
            ref="form"
            class="pa-3 pt-4"
          >
          <v-text-field
              required
              @blur="$v.password.$touch()"
              @change="$v.password.$touch()"
              :error-messages="passwordErrors"
              v-model="password"
              type="password"
              filled
              color="deep-purple"
              :label="$t('current_password')"
            />
            <v-text-field
              required
              @blur="$v.newpassword.$touch()"
              @change="$v.newpassword.$touch()"
              :error-messages="newpasswordErrors"
              v-model="newpassword"
              type="password"
              filled
              color="deep-purple"
              :label="$t('new_passord')"
            />
            <v-text-field
              v-model="retype_newpassword"
              :label="$t('retype_password')"
              required
              type="password"
              filled
              color="deep-purple"
              :error-messages="retype_newpasswordErrors"
              @blur="$v.retype_newpassword.$touch()"
              @change="$v.retype_newpassword.$touch()"
            />
          </v-form>
          <v-divider />
          <v-card-actions>
            <v-btn
              text
              @click="$refs.form.reset()"
            >
              <v-icon>mdi-clear</v-icon>{{ $t('clear') }}
            </v-btn>
            <v-spacer />
            <v-btn
              depressed
              :disabled="$v.$invalid"
              class="white--text"
              color="deep-purple accent-4"
              @click="changePassword()"
            >
              <v-icon left>
                mdi-language
              </v-icon>{{ $t('password_change') }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-flex>
      <v-spacer />
    </v-layout>
  </v-container>
</template>
<script>
import axios from "axios";
import { required } from "vuelidate/lib/validators";

export default {
  validations: {
    newpassword: { required },
    retype_newpassword: { required },
    password: { required }
  },
  data() {
    return {
      password: "",
      newpassword: "",
      retype_newpassword: ""
    };
  },

  computed: {
    newpasswordErrors() {
      const errors = [];
      if (!this.$v.newpassword.$dirty) return errors;
      !this.$v.newpassword.required && errors.push(this.$t('new_password_required'));
      return errors;
    },
    retype_newpasswordErrors() {
      const errors = [];
      if (!this.$v.retype_newpassword.$dirty) return errors;
      !this.$v.retype_newpassword.required && errors.push(this.$t('retype_new_password'));
      return errors;
    },
    passwordErrors() {
      const errors = [];
      if (!this.$v.password.$dirty) return errors;
      !this.$v.password.required && errors.push(this.$t('password_required'));
      return errors;
    }
  },
  methods: {
    changePassword() {
      if (this.newpassword !== this.retype_newpassword) {
        this.$store.state.alert.show = true;
        this.$store.state.alert.width = "500px";
        this.$store.state.alert.msg = this.$t('new_password_mismatch');
        this.$store.state.alert.type = "error";
        return;
      }
      this.$store.state.progress.enable = true;
      this.$store.state.progress.width = "300px";
      this.$store.state.progress.title = this.$t('changing_password')
      let formData = new FormData();
      formData.append("password", this.password);
      formData.append("username", this.$store.state.auth.username);
      formData.append("newpassword", this.newpassword);
      axios
        .post("/ocrux/user/changepassword/", formData, {
          headers: {
            "Content-Type": "multipart/form-data"
          }
        })
        .then(() => {
          this.$store.state.progress.enable = false;
          this.$store.state.alert.show = true;
          this.$store.state.alert.width = "500px";
          this.$store.state.alert.msg = this.$t('password_changed');
          this.$store.state.alert.type = "success";
          this.$refs.form.reset();
        })
        .catch((error) => {
          let msg = ""
          if (error.response) {
            msg = error.response.data
          } else if (error.request) {
            msg = error.request
          } else if(error.message) {
            msg = error.message
          } else {
            msg = this.$t('error_occured')
          }
          this.$store.state.progress.enable = false;
          this.$store.state.alert.show = true;
          this.$store.state.alert.width = "500px";
          this.$store.state.alert.msg = msg
          this.$store.state.alert.type = "error";
        });
    }
  }
};
</script>
