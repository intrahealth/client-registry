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
                    <v-list-item-content>{{ systems[id.system] || id.system }}:</v-list-item-content>
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
          ></v-data-table>
          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn
              class="warning"
              v-on:click="breakMatch()"
              :disabled="breaks.length === 0"
            >Break Match(es)</v-btn>
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
          ></v-data-table>
          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn
              class="accent"
              v-on:click="revertBreak()"
              :disabled="unbreaks.length === 0"
            >Revert Break</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>


<script>
export default {
  name: "client",
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
  methods: {
    selectPatient(patient) {
      this.selected = patient.selectIdx;
    },
    breakMatch() {
      for (let breakIt of this.breaks) {
        this.$delete(this.match_items, this.match_items.indexOf(breakIt));
        this.break_items.push(breakIt);
        this.match_count--;
        // Need to add in call to CR Service to do the break.
      }
      this.breaks = [];
    },
    revertBreak() {
      for (let unBreak of this.unbreaks) {
        // Need to add in call to CR Service to do the unbreak.
        this.$delete(this.break_items, this.break_items.indexOf(unBreak));
      }
    }
  },
  mounted() {
    this.systems[process.env.VUE_APP_SYSTEM_OPENMRS] =
      process.env.VUE_APP_SYSTEM_NAME_OPENMRS;
    this.systems[process.env.VUE_APP_SYSTEM_ART] =
      process.env.VUE_APP_SYSTEM_NAME_ART;
    this.systems[process.env.VUE_APP_SYSTEM_NIN] =
      process.env.VUE_APP_SYSTEM_NAME_NIN;
    this.$http
      .get(
        "/ocrux/fhir/Patient?_elements=link&_id=" + this.$route.params.clientId
      )
      .then(response => {
        let uid = response.data.entry[0].resource.link[0].other.reference.substring(
          8
        );
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
                if (patient.identifier) {
                  for (let id of patient.identifier) {
                    if (this.primary_systems.includes(id.system)) {
                      recordId = id.value;
                      systemName = this.systems[id.system];
                    } else if (id.system === process.env.VUE_APP_SYSTEM_ART) {
                      art = id.value;
                    } else if (id.system === process.env.VUE_APP_SYSTEM_NIN) {
                      nin = id.value;
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
                  identifier: patient.identifier,
                  family: name.family,
                  given: name.given.join(" "),
                  phone: phone,
                  art: art,
                  nin: nin
                });
                this.match_count++;
              }
            }
          });
      });
  }
};
</script>
