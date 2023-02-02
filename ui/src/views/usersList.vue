<template>
  <v-container fluid>
    <v-dialog
      v-model="editDialog"
      persistent
      :overlay="false"
      max-width="500px"
      transition="dialog-transition"
    >
      <v-toolbar
        color="primary"
        dark
      >
        <v-spacer></v-spacer>
        <v-icon
          @click="editDialog = false"
          style="cursor: pointer"
        >mdi-close</v-icon>
      </v-toolbar>
      <v-card>
        <v-card-title primary-title>
          {{user.userName}}
        </v-card-title>
        <v-card-text>
          <v-layout
            row
            wrap
          >
            <v-spacer />
            <v-flex xs6>
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
                  label="First Name*"
                />
                <v-text-field
                  v-model="otherName"
                  filled
                  color="deep-purple"
                  label="Middle Names"
                />
                <v-text-field
                  required
                  @blur="$v.surname.$touch()"
                  @change="$v.surname.$touch()"
                  :error-messages="surnameErrors"
                  v-model="surname"
                  filled
                  color="deep-purple"
                  label="Surname*"
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
                <v-autocomplete
                  v-model="status"
                  :items="statuses"
                  item-text="name"
                  item-value="value"
                  @blur="$v.status.$touch()"
                  @change="$v.status.$touch()"
                  :error-messages="statusErrors"
                  filled
                  color="deep-purple"
                  label="Status"
                ></v-autocomplete>
              </v-form>
            </v-flex>
            <v-spacer />
          </v-layout>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            depressed
            :disabled="$v.$invalid"
            class="white--text"
            color="deep-purple accent-4"
            @click="saveChanges()"
          >
            <v-icon left>
              mdi-language
            </v-icon>Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <center>
      <v-alert
        style="width: 500px"
        v-model="alertSuccess"
        type="success"
        dismissible
        transition="scale-transition"
      >
        {{alertMsg}}
      </v-alert>
      <v-alert
        style="width: 500px"
        v-model="alertFail"
        type="error"
        dismissible
        transition="scale-transition"
      >
        {{alertMsg}}
      </v-alert>
    </center>
    <v-card
      color="cyan lighten-5"
      width="1500px"
      class="mx-auto"
    >
      <v-card-title
        primary-title
        width="1000"
      >
        <v-toolbar
          color="white"
          style="font-weight: bold; font-size: 18px;"
        >
          Users List
          <v-spacer></v-spacer>
          <v-text-field
            v-model="searchUsers"
            append-icon="mdi-magnify"
            label="Search"
            single-line
            hide-details
          ></v-text-field>
        </v-toolbar>
      </v-card-title>
      <v-card-text>
        <v-data-table
          :headers="usersHeader"
          :items="users"
          :search="searchUsers"
          dark
          class="elevation-1"
          :loading='loadingUsers'
        >
          <v-progress-linear
            slot="progress"
            color="blue"
            indeterminate
          ></v-progress-linear>
          <template
            v-slot:item="{ item }"
          >
            <tr>
              <td>{{item.firstName}}</td>
              <td>{{item.surname}}</td>
              <td>{{item.otherName}}</td>
              <td>{{item.userName}}</td>
              <td v-if='item.role'>{{item.role}}</td>
              <td v-else></td>
              <td>{{item.status}}</td>
              <td>
                <v-btn
                  small
                  @click="edit(item)"
                ><v-icon left>mdi-pencil</v-icon>Edit</v-btn>
              </td>
            </tr>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-container>
</template>
<script>
import axios from 'axios'
import { required } from 'vuelidate/lib/validators'
import { generalMixin } from '../mixins/generalMixin'

export default {
  mixins: [generalMixin],
  validations: {
    role: { required },
    firstName: { required },
    surname: { required },
    status: { required }
  },
  data () {
    return {
      users: [],
      user: {},
      id: '',
      firstName: "",
      otherName: "",
      surname: "",
      role: "",
      status: '',
      roles: [{
        name: 'Admin',
        value: 'admin'
      }, {
        name: 'Deduplication',
        value: 'deduplication'
      }],
      statuses: [{
        name: 'Active',
        value: 'active'
      }, {
        name: 'InActive',
        value: 'inactive'
      }],
      editDialog: false,
      loadingUsers: false,
      searchUsers: '',
      alertSuccess: false,
      alertFail: false,
      alertMsg: ''
    }
  },
  methods: {
    edit (item) {
      this.user = item
      this.editDialog = true
      this.firstName = item.firstName
      this.otherName = item.otherName
      this.surname = item.surname
      this.role = item.role
      this.status = item.status
      this.id = item.id
    },
    saveChanges () {
      this.$store.state.progress.enable = true;
      this.$store.state.progress.width = "300px";
      this.$store.state.progress.title = "Saving Changes"
      let formData = new FormData();
      formData.append("firstName", this.firstName);
      formData.append("otherName", this.otherName);
      formData.append("surname", this.surname);
      formData.append("role", this.role);
      formData.append("status", this.status);
      formData.append("id", this.id);
      axios
        .post("/ocrux/user/editUser/", formData, {
          headers: {
            "Content-Type": "multipart/form-data"
          }
        })
        .then(() => {
          this.editDialog = false
          this.$store.state.progress.enable = false;
          this.$store.state.alert.show = true;
          this.$store.state.alert.width = "500px";
          this.$store.state.alert.msg = "User added successfully";
          this.$store.state.alert.type = "success";
          this.$refs.form.reset();
          this.getUsers()
        })
        .catch(() => {
          this.$store.state.progress.enable = false;
          this.$store.state.alert.show = true;
          this.$store.state.alert.width = "500px";
          this.$store.state.alert.msg =
            "This user was not added, ensure userName is not used";
          this.$store.state.alert.type = "error";
        });
    },
    getUsers () {
      let formData = new FormData()
      formData.append('username', this.username)
      formData.append('password', this.password)
      this.users = []
      this.loadingUsers = true
      axios.get('/ocrux/user/getUsers/').then((users) => {
        this.loadingUsers = false
        this.users = users.data
      }).catch((err) => {
        this.loadingUsers = false
        if (err.hasOwnProperty('response')) {
          console.log(err.response.data.error)
        }
      })
    }
  },
  computed: {
    usersHeader() {
      return [
        { text: `First Name`, value: 'firstName' },
        { text: `Surname`, value: 'surname' },
        { text: `Other Name`, value: 'otherName' },
        { text: `User Name`, value: 'username' },
        { text: `Role`, value: 'role' },
        { text: `Status`, value: 'status' }
      ]
    },
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
    roleErrors() {
      const errors = [];
      if (!this.$v.role.$dirty) return errors;
      !this.$v.role.required && errors.push("Role is missing");
      return errors;
    },
    statusErrors() {
      const errors = [];
      if (!this.$v.status.$dirty) return errors;
      !this.$v.status.required && errors.push("Status is missing");
      return errors;
    }
  },
  created () {
    this.getUsers()
  }
}
</script>

