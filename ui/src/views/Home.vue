<template>
  <v-card>
    <v-card-title>
      <v-spacer />
      <template v-for="filter in filters">
        <searchTerm :label="filter.label" :key="filter.searchparameter" :expression="filter.searchparameter"
          :binding="filter.binding" @termChange="searchData" />
      </template>
      <v-autocomplete v-model="pos" :items="$store.state.clients" item-text="displayName" item-value="id" clearable
        :label="$t('source')" hide-details outlined shaped @click:clear="searchPOS" @change="searchPOS" />
    </v-card-title>
    <v-data-table style="cursor: pointer" :headers="headers" :items="patients" :options.sync="options"
      :server-items-length="totalPatients" :footer-props="{
        'items-per-page-options': [5, 10, 20, 50],
        'items-per-page-text': this.$t('row_per_page'),
      }" :no-data-text="$t('no_data')" :loading="loading" class="elevation-1" @click:row="clickIt" />
  </v-card>
</template>

<script>
import { generalMixin } from "@/mixins/generalMixin";
import searchTerm from "../components/search-term";

export const headersNames = {
  givenName: "Given Names(s)",
  surname: "Surname",
  gender: "Gender",
  birth: "Birth Date",
  registeringFacility: "Registering Facility",
  nationalID: "National ID",
  passport: "Passport",
  healthIdentificationNumber: "Health Identification Number",
  cruid: "CRUID",
};

export default {
  name: "Home",
  mixins: [generalMixin],
  data() {
    return {
      debug: "",
      pos: "",
      search_terms: [],
      loading: false,
      totalPatients: 0,
      prevPage: -1,
      link: [],
      options: { itemsPerPage: 10, sortBy: ["family"] },
      rowsPerPageItems: [5, 10, 20, 50],
      headers: [],
      filters: [],
      patients: [],
    };
  },
  watch: {
    options: {
      handler() {
        this.getData();
      },
      deep: true,
    },
  },
  mounted() {
    this.getData();
  },
  components: {
    searchTerm: searchTerm,
  },
  methods: {
    clickIt: function (client) {
      this.$router.push({
        name: "client",
        params: { clientId: client.id },
        query: { pos: this.pos },
      });
    },
    searchPOS() {
      if (this.pos) {
        this.searchData(
          "_tag",
          "http://openclientregistry.org/fhir/clientid|" + this.pos
        );
      } else if (this.pos === null) {
        this.searchData("_tag", []);
      }
    },
    searchData(expression, value) {
      if (
        value === null ||
        this.search_terms.indexOf(
          expression + "=" + encodeURIComponent(value)
        ) !== -1
      ) {
        return;
      }
      if (Array.isArray(value) && value.length === 0) {
        for (let index in this.search_terms) {
          if (this.search_terms[index].startsWith(expression + "=")) {
            this.search_terms.splice(index, 1);
          }
        }
      } else if (expression) {
        this.search_terms.push(expression + "=" + encodeURIComponent(value));
      }
      this.getData(true);
    },
    getData(restart) {
      this.loading = true;
      let url = "";
      if (restart) this.options.page = 1;
      if (this.options.page > 1) {
        if (this.options.page === this.prevPage - 1) {
          url = this.link.find((link) => link.relation === "previous").url;
        } else if (this.options.page === this.prevPage + 1) {
          url = this.link.find((link) => link.relation === "next").url;
        }
        let query = url.split("?")[1];
        url = "/ocrux/fhir?" + query;
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
          "/ocrux/fhir/Patient?_count=" +
          count +
          "&_total=accurate&_tag:not=5c827da5-4858-4f3d-a50c-62ece001efea";
        if (this.search_terms.length > 0) {
          url += "&" + this.search_terms.join("&");
        }
        this.debug = url;
      }
      this.prevPage = this.options.page;

      let columns_info = [];
      this.$http
        .get("/ocrux/fhir/Basic/patientdisplaypage")
        .then((response) => {
          let extension_report =
            response.data.extension &&
            response.data.extension.find((ext) => {
              return (
                ext.url ===
                "http://ihris.org/fhir/StructureDefinition/opencrReportDisplay"
              );
            });
          this.headers = [];
          this.filters = [];
          if (extension_report) {
            let display =
              extension_report.extension &&
              extension_report.extension.filter((display) => {
                return (
                  display.url ===
                  "http://ihris.org/fhir/StructureDefinition/display"
                );
              });
            if (display) {
              for (let disp of display) {
                let label =
                  disp.extension &&
                  disp.extension.find((ext) => {
                    return ext.url === "label";
                  });
                let fhirpath =
                  disp.extension &&
                  disp.extension.find((ext) => {
                    return ext.url === "fhirpath";
                  });
                let valueset =
                  disp.extension &&
                  disp.extension.find((ext) => {
                    return ext.url === "valueset";
                  });
                let searchable =
                  disp.extension &&
                  disp.extension.find((ext) => {
                    return ext.url === "searchable";
                  });
                let searchparameter =
                  disp.extension &&
                  disp.extension.find((ext) => {
                    return ext.url === "searchparameter";
                  });

                let translatedHeader;
                if (label.valueString === headersNames.givenName) {
                  translatedHeader = this.$t("given_names");
                }
                if (label.valueString === headersNames.surname) {
                  translatedHeader = this.$t("surname");
                }
                if (label.valueString === headersNames.gender) {
                  translatedHeader = this.$t("gender");
                }
                if (label.valueString === headersNames.birth) {
                  translatedHeader = this.$t("birth_date");
                }
                if (label.valueString === headersNames.registeringFacility) {
                  translatedHeader = this.$t("registering_facility");
                }
                if (label.valueString === headersNames.nationalID) {
                  translatedHeader = this.$t("national_id");
                }
                if (label.valueString === headersNames.passport) {
                  translatedHeader = this.$t("passport");
                }
                if (
                  label.valueString === headersNames.healthIdentificationNumber
                ) {
                  translatedHeader = this.$t("health_identification_number");
                }

                if (label && fhirpath) {
                  columns_info.push({
                    text: label.valueString,
                    fhirpath: fhirpath.valueString,
                  });
                  this.headers.push({
                    text: translatedHeader
                      ? translatedHeader
                      : label.valueString,
                    value: label.valueString,
                  });
                }

                if (searchable && searchparameter) {
                  let filter = {
                    searchparameter: searchparameter.valueString,
                    label:
                      this.$t("search") + "_" + translatedHeader
                        ? translatedHeader
                        : label.valueString,
                  };
                  if (valueset && valueset.valueString) {
                    filter.binding = valueset.valueString;
                  }
                  this.filters.push(filter);
                }
              }
              this.headers.push({
                text: this.$t("source"),
                value: "pos",
              });
            }
          }

          this.$http.get(url).then((response) => {
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
                  entry.resource.name.find((name) => name.use === "official");
                if (!name) {
                  name = {};
                }
                let nin = entry.resource.identifier.find(
                  (id) => id.system === process.env.VUE_APP_SYSTEM_NIN
                );
                if (!nin) {
                  nin = {};
                }
                let clientUserId;
                if (entry.resource.meta && entry.resource.meta.tag) {
                  for (let tag of entry.resource.meta.tag) {
                    if (
                      tag.system ===
                      "http://openclientregistry.org/fhir/clientid"
                    ) {
                      clientUserId = tag.code;
                    }
                  }
                }
                let systemName = this.getClientDisplayName(clientUserId);
                let patient = {
                  id: entry.resource.id,
                  pos: systemName,
                };
                for (let col of columns_info) {
                  let val = this.$fhirpath.evaluate(
                    entry.resource,
                    col.fhirpath
                  );
                  if (Array.isArray(val)) {
                    val = val.join(", ");
                  }
                  if (val.split("/").length === 2) {
                    val = val.split("/")[1];
                  }
                  patient[col.text] = val;
                }
                this.patients.push(patient);
              }
            }
            this.totalPatients = response.data.total;
            this.loading = false;
          });
        });
    },
  },
};
</script>
