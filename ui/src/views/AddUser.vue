<template>
  <v-container>
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
            <v-card-title class="title font-weight-regular">{{ $t('account_add') }}</v-card-title>
          </v-toolbar>
          <v-form
            ref="form"
            class="pa-3 pt-4"
          >
            <v-text-field
              required
              @blur="$v.firstName.$touch()"
              @change="$v.firstName.$touch()"
              :error-messages="firstnameErrors"
              v-model="firstName"
              filled
              color="deep-purple"
              :label="$t('given_names')"
            />
            <v-text-field
              v-model="otherName"
              filled
              color="deep-purple"
              :label="$t('middle_names')"
            />
            <v-text-field
              required
              @blur="$v.surname.$touch()"
              @change="$v.surname.$touch()"
              :error-messages="surnameErrors"
              v-model="surname"
              filled
              color="deep-purple"
              :label="$t('surname')"
            />
            <v-text-field
              required
              @blur="$v.userName.$touch()"
              @change="$v.surname.$touch()"
              :error-messages="usernameErrors"
              v-model="userName"
              filled
              color="deep-purple"
              :label="$t('username')"
            />
            <v-autocomplete
              v-model="role"
              :items="roles"
              item-text="name"
              item-value="value"
              @blur="$v.role.$touch()"
              @change="$v.role.$touch()"
              :error-messages="roleErrors"
              filled
              color="deep-purple"
              label="Role"
            ></v-autocomplete>
            <v-text-field
              required
              @blur="$v.password.$touch()"
              @change="$v.password.$touch()"
              :error-messages="passwordErrors"
              v-model="password"
              type="password"
              filled
              color="deep-purple"
              :label="$t('labels_Password')"
            />
            <v-text-field
              v-model="retype_password"
              :label="$t('retype_password')"
              required
              type="password"
              filled
              color="deep-purple"
              :error-messages="retype_passwordErrors"
              @blur="$v.retype_password.$touch()"
              @change="$v.retype_password.$touch()"
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
              @click="addUser()"
            >
              <v-icon left>
                mdi-language
              </v-icon>{{ $t('user.add') }}
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
    userName: { required },
    role: { required },
    retype_password: { required },
    password: { required },
    firstName: { required },
    surname: { required }
  },
  data() {
    return {
      firstName: "",
      otherName: "",
      surname: "",
      userName: "",
      role: "",
      password: "",
      retype_password: "",
      roles: [{
        name: 'Admin',
        value: 'admin'
      }, {
        name: 'Deduplication',
        value: 'deduplication'
      }]
    };
  },

  computed: {
    firstnameErrors() {
      const errors = [];
      if (!this.$v.firstName.$dirty) return errors;
      !this.$v.firstName.required && errors.push("First Name is required");
      return errors;
    },
    surnameErrors() {
      const errors = [];
      if (!this.$v.surname.$dirty) return errors;
      !this.$v.surname.required && errors.push("Surname is required");
      return errors;
    },
    usernameErrors() {
      const errors = [];
      if (!this.$v.userName.$dirty) return errors;
      !this.$v.userName.required && errors.push(this.$t('username_required'));
      return errors;
    },
    passwordErrors() {
      const errors = [];
      if (!this.$v.password.$dirty) return errors;
      !this.$v.password.required && errors.push(this.$('password_required'));
      return errors;
    },
    retype_passwordErrors() {
      const errors = [];
      if (!this.$v.retype_password.$dirty) return errors;
      !this.$v.retype_password.required && errors.push("Re-type Password");
      return errors;
    },
    roleErrors() {
      const errors = [];
      if (!this.$v.role.$dirty) return errors;
      !this.$v.role.required && errors.push("Role is missing");
      return errors;
    }
  },
  methods: {
    addUser() {
      if (this.password !== this.retype_password) {
        this.$store.state.dialogError = true;
        this.$store.state.errorTitle = "Error";
        this.$store.state.errorDescription = "Password mismatch";
        return;
      }
      this.$store.state.progress.enable = true;
      this.$store.state.progress.width = "300px";
      this.$store.state.progress.title = "Saving User"
      let formData = new FormData();
      formData.append("firstName", this.firstName);
      formData.append("otherName", this.otherName);
      formData.append("password", this.password);
      formData.append("userName", this.userName);
      formData.append("role", this.role);
      formData.append("surname", this.surname);
      axios
        .post("/ocrux/user/addUser/", formData, {
          headers: {
            "Content-Type": "multipart/form-data"
          }
        })
        .then(() => {
          this.$store.state.progress.enable = false;
          this.$store.state.alert.show = true;
          this.$store.state.alert.width = "500px";
          this.$store.state.alert.msg = "User added successfully";
          this.$store.state.alert.type = "success";
          this.$refs.form.reset();
        })
        .catch(() => {
          this.$store.state.progress.enable = false;
          this.$store.state.alert.show = true;
          this.$store.state.alert.width = "500px";
          this.$store.state.alert.msg =
            "This user was not added, ensure userName is not used";
          this.$store.state.alert.type = "error";
        });
    }
  }
};
</script>
