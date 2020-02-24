<template>
  <v-container>
    <v-row>
      <v-col cols="6">
        <v-card class="mx-auto">
          <v-carousel
            v-model="selected"
            :show-arrows-on-hover="true"
          >
            <v-carousel-item
              v-for="(patient, i) in match_items"
              :key="`${i}-${patient.id}`"
            >
              <v-card
                class="mx-auto"
                height="100%"
              >
                <v-toolbar
                  color="secondary"
                  dark
                >
                  <v-toolbar-title class="font-weight-bold">
                    CRUID: {{ uid }}
                  </v-toolbar-title>
                  <v-spacer />
                  {{ selected+1 }} / {{ match_count }}
                </v-toolbar>
                <v-list
                  dense
                  light
                  height="100%"
                >
                  <v-list-item>
                    <v-list-item-content>Submitting System:</v-list-item-content>
                    <v-list-item-content class="align-end">
                      {{ patient.system }}
                    </v-list-item-content>
                  </v-list-item>
                  <v-list-item
                    v-for="(name, j) in patient.name"
                    :key="`${j}-${name.use}`"
                  >
                    <v-list-item-content>Name ({{ name.use }})</v-list-item-content>
                    <v-list-item-content class="align-end text-capitalize">
                      {{ name.given.join(" ") }} {{ name.family }}
                    </v-list-item-content>
                  </v-list-item>
                  <v-list-item>
                    <v-list-item-content>Gender:</v-list-item-content>
                    <v-list-item-content class="align-end">
                      {{ patient.gender }}
                    </v-list-item-content>
                  </v-list-item>
                  <v-list-item>
                    <v-list-item-content>Birth Date:</v-list-item-content>
                    <v-list-item-content class="align-end">
                      {{ patient.birthdate }}
                    </v-list-item-content>
                  </v-list-item>
                  <v-list-item
                    v-for="(telecom, k) in patient.telecom"
                    :key="`${k}-${telecom.system}`"
                  >
                    <v-list-item-content class="text-capitalize">
                      {{ telecom.system }}:
                    </v-list-item-content>
                    <v-list-item-content class="align-end">
                      {{ telecom.value }}
                    </v-list-item-content>
                  </v-list-item>
                  <v-list-item
                    v-for="(id, l) in patient.identifier"
                    :key="`${l}-${id.system}`"
                  >
                    <v-list-item-content>{{ id.name }}:</v-list-item-content>
                    <v-list-item-content class="align-end">
                      {{ id.value }}
                    </v-list-item-content>
                  </v-list-item>
                </v-list>
              </v-card>
            </v-carousel-item>
          </v-carousel>

          <v-list
            two-lines
            class="info"
            dark
          >
            <v-list-item>
              <v-list-item-content />
              <v-list-item-action>
                <router-link
                  to="/"
                  tag="button"
                >
                  Home
                </router-link>
              </v-list-item-action>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>
      <v-col cols="6">
        <v-card class="mx-auto">
          <v-toolbar
            color="accent"
            dark
          >
            <v-toolbar-title>Matched Records</v-toolbar-title>
          </v-toolbar>
          <v-data-table
            v-model="breaks"
            :headers="match_headers"
            :items="match_items"
            :items-per-page="20"
            class="elevation-1 text-capitalize"
            item-key="id"
            show-select
          />
          <v-card-actions>
            <v-spacer />
            <v-btn
              class="warning"
              :disabled="breaks.length === 0 || match_items.length < 2"
              @click="breakMatch()"
            >
              Break Match(es)
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
      <v-col cols="12">
        <v-card class="mx-auto">
          <v-toolbar
            color="warning"
            dark
          >
            <v-toolbar-title>Broken Matches</v-toolbar-title>
          </v-toolbar>
          <v-data-table
            v-model="unbreaks"
            :headers="match_headers"
            :items="break_items"
            :items-per-page="20"
            class="elevation-1 text-capitalize"
            item-key="id"
            show-select
          />
          <v-card-actions>
            <v-spacer />
            <v-btn
              class="accent"
              :disabled="unbreaks.length === 0"
              @click="revertBreak()"
            >
              Revert Break
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>


<script>
import { generalMixin } from '../mixins/generalMixin'
export default {
  mixins: [generalMixin],
  name: "Client",
  data() {
    return {
      selected: "",
      systems: {},
      primary_systems: [process.env.VUE_APP_SYSTEM_OPENMRS],
      match_count: 0,
      uid: "",
      breaks: [],
      unbreaks: [],
      match_headers: [
        {
          text: "Submitting System",
          value: "system"
        },
        {
          text: "Record ID",
          value: "id"
        },
        {
          text: "Surname",
          value: "family"
        },
        {
          text: "Given Name(s)",
          value: "given"
        },
        {
          text: "Gender",
          value: "gender"
        },
        {
          text: "Birth Date",
          value: "birthdate"
        }
      ],
      match_items: [
        //        { id: this.$route.params.clientId, gender: "f", birthdate: "1978-01-28", given: "flamina", family: "anicko", nin: "CF65426205VYNW", art: "RUK-793904", phone: "774 687023" }
      ],
      break_items: [
        //        { id: "rec-978-org-", gender: "f", birthdate: "1914-09-20", given: "kabyanga", family: "anicia", nin: "CF59866315NPOE", art: "FPL-944851", phone: "772 702269" }
      ]
    };
  },
  mounted() {
    this.getPatient();
  },
  methods: {
    getPatient() {
      this.breaks = [];
      this.match_items = [];
      this.break_items = [];
      this.match_count = 0;
      this.$http
      .get(
        "/ocrux/fhir/Patient?_elements=link,extension&_id=" +
          this.$route.params.clientId
      )
      .then(response => {
        let uid = response.data.entry[0].resource.link[0].other.reference
          .split("/")
          .pop();
        let resource = response.data.entry[0].resource;
        let brokenList = [];
        if (resource.extension) {
          for (let ext of resource.extension) {
            if (ext.url === process.env.VUE_APP_BROKEN_MATCH_URL) {
              brokenList.push(ext.valueReference.reference.split("/").pop());
            }
          }
        }
        if (brokenList.length > 0) {
          brokenList = brokenList.join(",");
          this.$http.get("/ocrux/fhir/Patient?_id=" + brokenList).then(resp => {
            for (let entry of resp.data.entry) {
              let patient = entry.resource;
              let recordId, systemName, nin, art, name, phone;
              let clientUserId
              if(patient.meta && patient.meta.tag) {
                for(let tag of patient.meta.tag) {
                  if(tag.code === 'clientid') {
                    clientUserId = tag.display
                  }
                }
              }
              systemName = this.getClientDisplayName(clientUserId)
              let identifiers = [];
              if (patient.identifier) {
                for (let id of patient.identifier) {
                  let displName = this.getSystemURIDisplayName(id.system)
                  if(displName) {
                    if(displName.id === 'internalid') {
                      recordId = id.value;
                    }
                    identifiers.push({
                      name: displName.name,
                      value: id.value
                    })
                  } else {
                    identifiers.push({
                      name: id.system,
                      value: id.value
                    })
                  }
                }
              }
              try {
                name = patient.name.find(name => name.use === "official");
              } catch (err) {
                name = { family: "", given: [] };
              }
              try {
                phone = patient.telecom.find(phone => (phone.system = "phone"))
                  .value;
              } catch (err) {
                phone = "";
              }
              this.break_items.push({
                fid: patient.id,
                system: systemName,
                id: recordId,
                gender: patient.gender,
                birthdate: patient.birthDate,
                name: patient.name,
                telecom: patient.telecom,
                identifier: identifiers,
                family: name.family,
                given: name.given.join(" "),
                phone: phone,
              });
            }
          });
        }
        this.$http
          .get("/ocrux/fhir/Patient?_include=Patient:link&_id=" + uid)
          .then(resp => {
            for (let entry of resp.data.entry) {
              let patient = entry.resource;
              if (
                patient.meta.tag &&
                patient.meta.tag.find(
                  tag => tag.code === process.env.VUE_APP_CRUID_TAG
                ) !== undefined
              ) {
                this.uid = patient.id;
              } else {
                if (patient.id === this.$route.params.clientId)
                  this.selected = this.match_count;
                let recordId, systemName, nin, art, name, phone;
                let clientUserId
                if(patient.meta && patient.meta.tag) {
                  for(let tag of patient.meta.tag) {
                    if(tag.code === 'clientid') {
                      clientUserId = tag.display
                    }
                  }
                }
                systemName = this.getClientDisplayName(clientUserId)
                let identifiers = [];
                if (patient.identifier) {
                  for (let id of patient.identifier) {
                    let displName = this.getSystemURIDisplayName(id.system)
                    if(displName && displName.name) {
                      if(displName.id === 'internalid') {
                        recordId = id.value;
                      }
                      identifiers.push({
                        name: displName.name,
                        value: id.value
                      })
                    } else {
                      identifiers.push({
                        name: id.system,
                        value: id.value
                      })
                    }
                  }
                }
                try {
                  name = patient.name.find(name => name.use === "official");
                } catch (err) {
                  name = { family: "", given: [] };
                }
                try {
                  phone = patient.telecom.find(
                    phone => (phone.system = "phone")
                  ).value;
                } catch (err) {
                  phone = "";
                }
                this.match_items.push({
                  fid: patient.id,
                  selectIdx: this.match_count,
                  system: systemName,
                  id: recordId,
                  gender: patient.gender,
                  birthdate: patient.birthDate,
                  name: patient.name,
                  telecom: patient.telecom,
                  identifier: identifiers,
                  family: name.family,
                  given: name.given.join(" "),
                  phone: phone,
                });
                this.match_count++;
              }
            }
          });
      });
    },
    selectPatient(patient) {
      this.selected = patient.selectIdx;
    },
    breakMatch() {
      if (this.breaks.length > 0) {
        let url = "/ocrux/breakMatch";
        let ids = [];
        for (let breakIt of this.breaks) {
          ids.push("Patient/" + breakIt.fid);
        }
        this.$http.post(url, ids).then(response => {
          this.getPatient();
        });
      }
    },
    revertBreak() {
      if (this.unbreaks.length > 0) {
        let url = "/ocrux/unBreakMatch";
        let ids = [];
        for (let unBreak of this.unbreaks) {
          for(let match of this.match_items) {
            ids.push({
              id2: "Patient/" + match.fid,
              id1: "Patient/" + unBreak.fid
            });
          }
        }
        this.$http.post(url, ids).then(response => {
          this.getPatient();
        });
      }
    }
  }
};
</script>
