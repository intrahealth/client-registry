<template>
  <v-container fluid>
    <v-card>
      <v-card-title>
        {{ $t("settings_users") }}
      </v-card-title>
      <v-spacer />
    </v-card>

    <v-card class="d-flex flex-column  justify-center ">
      <v-card-title>
        New User
      </v-card-title>
      <v-form ref="userForm" v-model="isValid" class="d-flex flex-column  pa-4">
        <v-row cols="12">
          <v-col cols="12" md="4">
            <v-text-field
              v-model="newUser.firstName"
              :label="$t('given_names')"
              :rules="[requiredRule]"
            />
          </v-col>
          <v-col cols="12" md="4">
            <v-text-field
              v-model="newUser.surname"
              :label="$t('surname')"
              :rules="[requiredRule]"
            />
          </v-col>
          <v-col cols="12" md="4">
            <v-text-field
              v-model="newUser.otherName"
              :label="$t('other_name')"
            />
          </v-col>
        </v-row>
        <v-row cols="12">
          <v-col cols="12" md="4">
            <v-text-field
              v-model="newUser.userName"
              :label="$t('username')"
              :rules="[requiredRule]"
            />
          </v-col>
          <v-col cols="12" md="4">
            <v-select
              v-model="newUser.role"
              :items="roles"
              item-text="name"
              item-value="value"
              :label="$t('user_role')"
            />
          </v-col>
        </v-row>
        <v-row cols="12">
          <v-col cols="12" md="4">
            <v-text-field
              v-model="newUser.newPassword"
              :label="$t('new_password')"
              :rules="[requiredRule]"
            />
          </v-col>
          <v-col cols="12" md="4">
            <v-text-field
              v-model="newUser.confirmPassword"
              :label="$t('retype_password')"
              :rules="[requiredRule]"
            />
          </v-col>
        </v-row>
        <v-row cols="12">
          <v-col cols="12" md="4">
            <v-btn color="primary" :disabled="!isValid" @click="addUser()">
              Save
            </v-btn>
          </v-col>
        </v-row>
      </v-form>
    </v-card>

    <v-card>
      <v-card-title>
        Users List
      </v-card-title>
      <v-data-table
        :headers="usersHeader"
        :items="users"
        :loading="loadingUsers"
        :footer-props="{
          'items-per-page-text': this.$t('row_per_page'),
        }"
        :no-data-text="$t('no_data')"
      >
        <v-progress-linear
          slot="progress"
          color="blue"
          indeterminate
        ></v-progress-linear>
        <template v-slot:item="{ item }">
          <tr>
            <td>{{ item.firstName }}</td>
            <td>{{ item.surname }}</td>
            <td>{{ item.otherName }}</td>
            <td>{{ item.userName }}</td>
            <td v-if="item.role">{{ item.role }}</td>
            <td v-else></td>
            <td>{{ item.status }}</td>
          </tr>
        </template>
      </v-data-table>
    </v-card>
  </v-container>
</template>
<script>
import axios from "axios";

export default {
  data() {
    return {
      isValid: false,
      newUser: {
        firstName: "",
        surname: "",
        otherName: "",
        userName: "",
        role: "",
        status: "",
        newPassword: "",
        confirmPassword: "",
      },
      roles: [
        {
          name: "Admin",
          value: "admin",
        },
        {
          name: "Deduplication",
          value: "deduplication",
        },
      ],
      statuses: ["Active", "Inactive"],
      requiredRule: (value) => !!value || "This field is required",
      users: [],
      loadingUsers: true,
      alertSuccess: false,
      alertFail: false,
      alertMsg: "",
    };
  },
  methods: {
    // add users
    addUser() {
      if (this.newUser.newPassword !== this.newUser.confirmPassword) {
        this.$store.state.dialogError = true;
        this.$store.state.errorTitle = "Error";
        this.$store.state.errorDescription = "Password mismatch";
        return;
      }
      this.$store.state.progress.enable = true;
      this.$store.state.progress.width = "300px";
      this.$store.state.progress.title = "Saving User";
      let formData = new FormData();
      formData.append("firstName", this.newUser.firstName);
      formData.append("otherName", this.newUser.otherName);
      formData.append("password", this.newUser.newPassword);
      formData.append("userName", this.newUser.userName);
      formData.append("role", this.newUser.role);
      formData.append("surname", this.newUser.surname);
      axios
        .post("/ocrux/user/addUser/", formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
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
    },

    // get users
    getUsers() {
      this.users = [];
      this.loadingUsers = true;
      axios
        .get("/ocrux/user/getUsers/")
        .then((users) => {
          this.loadingUsers = false;
          this.users = users.data;
        })
        .catch(() => {
          this.loadingUsers = false;
        });
    },
  },
  computed: {
    usersHeader() {
      return [
        { text: this.$t("given_names"), value: "firstName" },
        { text: this.$t("surname"), value: "surname" },
        { text: this.$t("other_name"), value: "otherName" },
        { text: this.$t("username"), value: "username" },
        { text: this.$t("user_role"), value: "role" },
        { text: this.$t("patient_status"), value: "status" },
      ];
    },
  },
  created() {
    this.getUsers();
  },
};
</script>
