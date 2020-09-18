<template>
  <v-card>
    <v-card-title>
      <v-spacer />
      <v-text-field
        v-model="search_family"
        label="Search Surname"
        hide-details
        outlined
        shaped
        clearable
        @change="searchData()"
      />
      <v-text-field
        v-model="search_given"
        label="Search Given Name(s)"
        hide-details
        outlined
        shaped
        clearable
        @change="searchData()"
      />
      <v-text-field
        v-model="search_uid"
        label="Exact CRUID"
        hide-details
        outlined
        shaped
        clearable
        @change="searchData()"
      />
      <v-autocomplete
        v-model="pos"
        :items="$store.state.clients"
        item-text="displayName"
        item-value="id"
        clearable
        label="Point of Service"
        hide-details
        outlined
        shaped
        @change="searchData()"
      />
    </v-card-title>
    <v-data-table
      style="cursor: pointer"
      :headers="headers"
      :items="patients"
      :options.sync="options"
      :server-items-length="totalPatients"
      :footer-props="{ 'items-per-page-options': [5,10,20,50] }"
      :loading="loading"
      class="elevation-1"
      @click:row="clickIt"
    />
  </v-card>
</template>

<script>
import { generalMixin } from "@/mixins/generalMixin";
export default {
  name: "Home",
  mixins: [generalMixin],
  data() {
    return {
      debug: "",
      pos: "",
      search_family: "",
      search_given: "",
      search_uid: "",
      search_terms: [],
      loading: false,
      totalPatients: 0,
      prevPage: -1,
      link: [],
      options: { itemsPerPage: 10, sortBy: ["family"] },
      rowsPerPageItems: [5, 10, 20, 50],
      headers: [
        {
          text: "Surname",
          value: "family"
        },
        {
          text: "Given Name(s)",
          value: "given"
        },
        {
          text: "NIN",
          value: "nin",
          sortable: false
        },
        {
          text: "Gender",
          value: "gender"
        },
        {
          text: "Birth Date",
          value: "birthdate"
        },
        {
          text: "CRUID",
          value: "uid",
          sortable: false
        },
        {
          text: "Point of Service",
          value: "pos"
        }
      ],
      patients: []
    };
  },
  watch: {
    options: {
      handler() {
        this.getData();
      },
      deep: true
    }
  },
  mounted() {
    this.getData();
  },
  methods: {
    clickIt: function(client) {
      this.$router.push({
        name: "client",
        params: { clientId: client.id },
        query: { pos: this.pos }
      });
    },
    searchData() {
      this.search_terms = [];
      if (this.search_family) {
        this.search_terms.push(
          "family:contains=" + encodeURIComponent(this.search_family)
        );
      }
      if (this.search_given) {
        this.search_terms.push(
          "given:contains=" + encodeURIComponent(this.search_given)
        );
      }
      if (this.search_uid) {
        this.search_terms.push("link=" + encodeURIComponent(this.search_uid));
      }
      if (this.pos) {
        this.search_terms.push(
          "_tag=" +
            encodeURIComponent(
              "http://openclientregistry.org/fhir/clientid|" + this.pos
            )
        );
      }
      this.getData(true);
    },
    getData(restart) {
      this.loading = true;
      let url = "";
      if (restart) this.options.page = 1;
      if (this.options.page > 1) {
        if (this.options.page === this.prevPage - 1) {
          url = this.link.find(link => link.relation === "previous").url;
        } else if (this.options.page === this.prevPage + 1) {
          url = this.link.find(link => link.relation === "next").url;
        }
        url = url.replace(process.env.VUE_APP_FHIR_ROOT, "");
      }
      if (url === "") {
        let count = this.options.itemsPerPage || 10;
        let sort = "";
        for (let idx in this.options.sortBy) {
          if (sort) {
            sort += ",";
          }
          if (this.options.sortDesc[idx]) {
            sort += "-";
          }
          sort += this.options.sortBy[idx];
        }

        url =
          "/fhir/Patient?_count=" +
          count +
          "&_total=accurate&_tag:not=5c827da5-4858-4f3d-a50c-62ece001efea";
        if (this.search_terms.length > 0) {
          url += "&" + this.search_terms.join("&");
        }
        this.debug = url;
      }
      this.prevPage = this.options.page;

      this.$http.get(url).then(response => {
        this.patients = [];
        if (response.data.total > 0) {
          this.link = response.data.link;
          for (let entry of response.data.entry) {
            if (
              !entry.resource.link ||
              (entry.resource.link &&
                Array.isArray(entry.resource.link) &&
                entry.resource.link.length === 0) ||
              (entry.resource.link && !Array.isArray(entry.resource.link))
            ) {
              continue;
            }
            let name =
              entry.resource.name &&
              entry.resource.name.find(name => name.use === "official");
            if (!name) {
              name = {};
            }
            let nin = entry.resource.identifier.find(
              id => id.system === process.env.VUE_APP_SYSTEM_NIN
            );
            if (!nin) {
              nin = {};
            }
            let clientUserId;
            if (entry.resource.meta && entry.resource.meta.tag) {
              for (let tag of entry.resource.meta.tag) {
                if (
                  tag.system === "http://openclientregistry.org/fhir/clientid"
                ) {
                  clientUserId = tag.code;
                }
              }
            }
            let systemName = this.getClientDisplayName(clientUserId);
            console.log(clientUserId);
            this.patients.push({
              id: entry.resource.id,
              family: name.family,
              given: name.given,
              birthdate: entry.resource.birthDate,
              gender: entry.resource.gender,
              nin: nin.value,
              uid: entry.resource.link[0].other.reference.replace(
                "Patient/",
                ""
              ),
              pos: systemName
            });
          }
        }
        this.totalPatients = response.data.total;
        this.loading = false;
      });
    }
  }
};
</script>
