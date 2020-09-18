<template>
  <v-container>
    <v-tabs
      v-model="tab"
      background-color="secondary"
      dark
    >
      <v-tabs-slider></v-tabs-slider>
      <v-tab href="#record"><v-icon>mdi-account</v-icon>Record</v-tab>
      <v-tab href="#history"><v-icon>mdi-history</v-icon>History</v-tab>
      <v-spacer></v-spacer>
      <v-toolbar-items>
        <v-btn v-if="uid === '6f2eac1b-5b1d-49ce-a4b7-f9089128f836'" color="warning" @click="$router.push('/resolve/590-57-2820')">
          <v-badge icon="mdi-alert" color="error" >Review Potential Matches</v-badge>
        </v-btn>
        <v-btn color="secondary" @click="$router.go(-1)" v-if="canGoBack">Back</v-btn>
        <v-btn color="secondary" @click="close" v-else>Close</v-btn>
      </v-toolbar-items>
      <v-tab-item value="record">
        <v-row>
          <v-col cols="6">
            <v-card class="mx-auto">
              <v-carousel
                v-model="selected"
                delimiter-icon="mdi-account"
                next-icon="mdi-account-arrow-right"
                prev-icon="mdi-account-arrow-left"
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
      </v-tab-item>
      <v-tab-item value="history">
        <v-row>
          <v-col cols="12">
            <v-card class="mx-auto">
              <v-toolbar
                color="secondary"
                dark
              >
                <v-toolbar-title>History</v-toolbar-title>
              </v-toolbar>
              <v-expansion-panels popout>
                <v-expansion-panel
                  v-for="(event,i) in matchEvents"
                  :key="i"
                >
                  <v-expansion-panel-header>
                    <template v-if="event.type === 'submittedResource'">
                      Submitted Resource
                    </template>
                    <template v-if="event.type === 'breakMatch'">
                      Break Match
                    </template>
                    <template v-if="event.type === 'unBreak'">
                      Revert Break
                    </template>
                    Event {{ event.recorded | moment('Do MMM YYYY h:mm:ss a') }}</v-expansion-panel-header>
                  <v-expansion-panel-content>
                    <template v-if="event.type !== 'submittedResource'">
                      User: {{ event.username }} <br>
                    </template>
                    Operation: <b>{{ event.operation }}</b> <br>
                    Operation Time {{ event.recorded | moment('Do MMM YYYY h:mm:ss a') }} <br>
                    Status:
                    <template v-if="event.outcomeCode === '0'">
                      <v-chip
                        color="green"
                        dark
                      >
                        {{ event.outcome }}
                      </v-chip>
                    </template>
                    <template v-else>
                      <v-chip
                        color="red"
                        dark
                      >
                        {{ event.outcome }}
                      </v-chip>
                    </template><br>
                    IP Address: {{ event.ipaddress }} <br>
                    <v-row v-if="event.type === 'breakMatch'">
                      <v-col cols="4">
                        <v-card
                          elevation="12"
                          color="green"
                          hover
                        >
                          <v-card-text class="white--text">
                            Break <br><b>{{ event.break }}</b>
                          </v-card-text>
                        </v-card>
                      </v-col>
                      <v-col cols="4">
                        <v-card
                          elevation="12"
                          color="red"
                          hover
                        >
                          <v-card-text class="white--text">
                            Old CRUID <br><b>{{ event.CRUID }}</b>
                          </v-card-text>
                        </v-card>
                      </v-col>
                      <v-col cols="4">
                        <v-card
                          elevation="12"
                          color="red"
                          hover
                        >
                          <v-card-text class="white--text">
                            Broken From <br>
                            <b>
                              <template v-for="breakFrom in event.breakFrom">
                                => {{ breakFrom }}
                              </template>
                            </b>
                          </v-card-text>
                        </v-card>
                      </v-col>
                    </v-row>
                    <v-row v-if="event.type === 'unBreak'">
                      <v-col cols="4">
                        <v-card
                          elevation="12"
                          color="green"
                          hover
                        >
                          <v-card-text class="white--text">
                            Reverting <br><b>{{ event.unBreak }}</b>
                          </v-card-text>
                        </v-card>
                      </v-col>
                      <v-col cols="4">
                        <v-card
                          elevation="12"
                          color="red"
                          hover
                        >
                          <v-card-text class="white--text">
                            Reverting From CRUID <br><b>{{ event.unBreakFromCRUID }}</b>
                          </v-card-text>
                        </v-card>
                      </v-col>
                      <v-col cols="4">
                        <v-card
                          elevation="12"
                          color="red"
                          hover
                        >
                          <v-card-text class="white--text">
                            Reverting From <br>
                            <b>
                              <template v-for="unBreakFrom in event.unBreakFrom">
                                => {{ unBreakFrom }}
                              </template>
                            </b>
                          </v-card-text>
                        </v-card>
                      </v-col>
                    </v-row>
                    <v-row
                      v-for="(detail,j) in event.matchData"
                      v-else
                      :key="j"
                    >
                      <v-col cols="6">
                        <v-card
                          elevation="12"
                          hover
                        >
                          <v-card-title primary-title>
                            Decision Rule {{ ++j }} => Matching Type: &nbsp; <b> {{ detail.matchingType }}</b>
                          </v-card-title>
                          <v-card-text>
                            <v-data-table
                              :headers="matchRuleHeaders"
                              :items="detail.decisionRule"
                              :items-per-page="20"
                              item-key="id"
                            >
                              <template v-slot:item.details="{ item }">
                                <template v-if="item.details.algorithm">
                                  Algorithm - {{ item.details.algorithm }}<br>
                                </template>
                                <template v-if="item.details.threshold">
                                  Threshold
                                  <v-chip
                                    color="red"
                                    dark
                                  >
                                    {{ item.details.threshold }}
                                  </v-chip><br>
                                </template>
                                <template v-if="detail.matchingType === 'probabilistic'">
                                  <b>mValue</b>
                                  <v-chip
                                    color="green"
                                    dark
                                  >
                                    {{ item.details.mValue }}
                                  </v-chip> <b>- uValue</b>
                                  <v-chip
                                    color="blue"
                                    dark
                                  >
                                    {{ item.details.uValue }}
                                  </v-chip><br>
                                </template>
                                <template v-if="item.details.fhirpath">
                                  FHIR Path - {{ item.details.fhirpath }}
                                </template>
                                <br><br>
                              </template>
                            </v-data-table>
                          </v-card-text>
                        </v-card>
                      </v-col>
                      <v-col cols="6">
                        <v-switch
                          v-model="advancedView"
                          label="View Advanced Details"
                        />
                        <template v-if="advancedView">
                          <v-card>
                            <v-card-text>
                              <v-textarea
                                filled
                                color="deep-purple"
                                label="Elasticsearch Query"
                                rows="10"
                                :value="detail.query"
                              />
                            </v-card-text>
                          </v-card>
                          <v-card>
                            <v-card-text>
                              <v-textarea
                                filled
                                color="deep-purple"
                                label="Elasticsearch Automatches Results"
                                rows="10"
                                :value="detail.autoMatches"
                              />
                            </v-card-text>
                          </v-card>
                          <v-card>
                            <v-card-text>
                              <v-textarea
                                filled
                                color="deep-purple"
                                label="Elasticsearch Potential Matches Results"
                                rows="10"
                                :value="detail.potentialMatches"
                              />
                            </v-card-text>
                          </v-card>
                          <v-card>
                            <v-card-text>
                              <v-textarea
                                filled
                                color="deep-purple"
                                label="Elasticsearch Conflicts Matches Results"
                                rows="10"
                                :value="detail.conflictsMatchResults"
                              />
                            </v-card-text>
                          </v-card>
                        </template>
                      </v-col>
                    </v-row>
                  </v-expansion-panel-content>
                </v-expansion-panel>
              </v-expansion-panels>
            </v-card>
          </v-col>
        </v-row>
      </v-tab-item>
    </v-tabs>
  </v-container>
</template>


<script>
import { generalMixin } from "@/mixins/generalMixin";
export default {
  mixins: [generalMixin],
  name: "Client",
  data() {
    return {
      tab: "record",
      advancedView: false,
      outcomes: {
        0: "Success",
        4: "Minor Failure - Client Error",
        8: "Serious Failure - Server Error",
        12: "Major Failure - Server Crashed"
      },
      selected: "",
      matchEvents: [],
      matchRule: [],
      auditEvent: [],
      systems: {},
      primary_systems: [process.env.VUE_APP_SYSTEM_OPENMRS],
      match_count: 0,
      uid: "",
      breaks: [],
      unbreaks: [],
      matchRuleHeaders: [
        {
          text: "Field",
          value: "name"
        },
        {
          text: "Field Details",
          value: "details"
        }
      ],
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
      match_items: [],
      break_items: []
    };
  },
  computed: {
    canGoBack() {
      return history.length > 1
    }
  },
  mounted() {
    this.getPatient();
    this.getAuditEvents();
  },
  methods: {
    getPatient() {
      this.breaks = [];
      this.match_items = [];
      this.break_items = [];
      this.match_count = 0;
      this.$http
        .get(
          "/fhir/Patient?_elements=link,extension&_id=" +
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
            this.$http
              .get("/fhir/Patient?_id=" + brokenList)
              .then(resp => {
                for (let entry of resp.data.entry) {
                  let patient = entry.resource;
                  let recordId, systemName, name, phone;
                  let clientUserId;
                  if (patient.meta && patient.meta.tag) {
                    for (let tag of patient.meta.tag) {
                      if (
                        tag.system ===
                        "http://openclientregistry.org/fhir/clientid"
                      ) {
                        clientUserId = tag.code;
                      }
                    }
                  }
                  systemName = this.getClientDisplayName(clientUserId);
                  let identifiers = [];
                  if (patient.identifier) {
                    for (let id of patient.identifier) {
                      let displName = this.getSystemURIDisplayName(id.system);
                      if (displName) {
                        if (displName.id === "internalid") {
                          recordId = id.value;
                        }
                        identifiers.push({
                          name: displName.name,
                          value: id.value
                        });
                      } else {
                        identifiers.push({
                          name: id.system,
                          value: id.value
                        });
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
                  if (
                    this.$route.query.pos &&
                    this.$route.query.pos === clientUserId
                  ) {
                    this.break_items.unshift({
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
                      phone: phone
                    });
                  } else {
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
                      phone: phone
                    });
                  }
                }
              });
          }
          this.$http
            .get("/fhir/Patient?_include=Patient:link&_id=" + uid)
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
                  let recordId, systemName, name, phone;
                  let clientUserId;
                  if (patient.meta && patient.meta.tag) {
                    for (let tag of patient.meta.tag) {
                      if (
                        tag.system ===
                        "http://openclientregistry.org/fhir/clientid"
                      ) {
                        clientUserId = tag.code;
                      }
                    }
                  }
                  systemName = this.getClientDisplayName(clientUserId);
                  let identifiers = [];
                  if (patient.identifier) {
                    for (let id of patient.identifier) {
                      let displName = this.getSystemURIDisplayName(id.system);
                      if (displName && displName.name) {
                        if (displName.id === "internalid") {
                          recordId = id.value;
                        }
                        identifiers.push({
                          name: displName.name,
                          value: id.value
                        });
                      } else {
                        identifiers.push({
                          name: id.system,
                          value: id.value
                        });
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
                  if (
                    this.$route.query.pos &&
                    this.$route.query.pos === clientUserId
                  ) {
                    this.match_items.unshift({
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
                      phone: phone
                    });
                  } else {
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
                      phone: phone
                    });
                  }
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
        this.$store.state.progress.enable = true;
        this.$store.state.progress.title = "Breaing Match";
        let username = this.$store.state.auth.username;
        let url = `/match/break-match?username=${username}`;
        let ids = [];
        for (let breakIt of this.breaks) {
          ids.push("Patient/" + breakIt.fid);
        }
        this.$http.post(url, ids).then(() => {
          this.$store.state.progress.enable = false;
          this.countMatchIssues();
          this.getPatient();
          this.getAuditEvents();
        });
      }
    },
    revertBreak() {
      if (this.unbreaks.length > 0) {
        this.$store.state.progress.enable = true;
        this.$store.state.progress.title = "UnBreaing Match";
        let username = this.$store.state.auth.username;
        let url = `/match/unbreak-match?username=${username}`;
        let ids = [];
        for (let unBreak of this.unbreaks) {
          for (let match of this.match_items) {
            ids.push({
              id2: "Patient/" + match.fid,
              id1: "Patient/" + unBreak.fid
            });
          }
        }
        this.$http.post(url, ids).then(() => {
          this.$store.state.progress.enable = false;
          this.countMatchIssues();
          this.getPatient();
          this.getAuditEvents();
        });
      }
    },
    getAuditEvents() {
      this.matchEvents = [];
      let url = `/fhir/AuditEvent?entity=${this.$route.params.clientId}&entity-name=submittedResource,breakTo,breakFrom,unBreak,unBreakFromResource&_sort=-_lastUpdated`;
      this.$http.get(url).then(response => {
        this.auditEvent = response.data;
        for (let event of response.data.entry) {
          let modifiedEvent = { matchData: [] };
          modifiedEvent.recorded = event.resource.recorded;
          let isBreakEvent = event.resource.entity.find(entity => {
            return entity.name === "break" || entity.name === "breakFrom";
          });
          let isUnBreakEvent = event.resource.entity.find(entity => {
            return (
              entity.name === "unBreak" || entity.name === "unBreakFromResource"
            );
          });
          let operation;
          for (let subtype of event.resource.subtype) {
            if (subtype.system === "http://hl7.org/fhir/restful-interaction") {
              operation = subtype.code;
            }
          }
          modifiedEvent.operation = operation;
          modifiedEvent.outcomeCode = event.resource.outcome;
          modifiedEvent.outcome = this.outcomes[event.resource.outcome];
          modifiedEvent.outcomeDesc = event.resource.outcomeDesc;
          if (event.resource.agent && Array.isArray(event.resource.agent)) {
            for (let agent of event.resource.agent) {
              if (agent.altId) {
                modifiedEvent.username = agent.altId;
              }
              if (agent.network) {
                modifiedEvent.ipaddress = agent.network.address;
              }
            }
          }
          if (isBreakEvent) {
            modifiedEvent.breakFrom = [];
            modifiedEvent.type = "breakMatch";
            for (let entity of event.resource.entity) {
              if (entity.name === "break") {
                modifiedEvent.break = entity.what.reference;
              }
              if (entity.name === "oldCRUID") {
                modifiedEvent.CRUID = entity.what.reference;
              }
              if (entity.name === "breakFrom") {
                modifiedEvent.breakFrom.push(entity.what.reference);
              }
            }
            this.matchEvents.push(modifiedEvent);
            continue;
          }
          if (isUnBreakEvent) {
            modifiedEvent.unBreakFrom = [];
            modifiedEvent.type = "unBreak";
            for (let entity of event.resource.entity) {
              if (entity.name === "unBreak") {
                modifiedEvent.unBreak = entity.what.reference;
              }
              if (entity.name === "unBreakFromCRUID") {
                modifiedEvent.unBreakFromCRUID = entity.what.reference;
              }
              if (entity.name === "unBreakFromResource") {
                modifiedEvent.unBreakFrom.push(entity.what.reference);
              }
            }
            this.matchEvents.push(modifiedEvent);
            continue;
          }
          for (let entity of event.resource.entity) {
            if (entity.name === "submittedResource") {
              modifiedEvent.type = "submittedResource";
              modifiedEvent.submittedResource = entity.what.reference;
              for (let detail of entity.detail) {
                if (detail.type === "resource") {
                  modifiedEvent.submittedResourceData = detail.valueString;
                } else if (detail.type === "match") {
                  let matches = new Buffer.from(detail.valueBase64Binary, "base64").toString("ascii");
                  matches = JSON.parse(matches);
                  let decRule = [];
                  for (let field in matches.rule.fields) {
                    let fieldDet = matches.rule.fields[field];
                    decRule.push({
                      name: field,
                      id: field,
                      details: fieldDet
                    });
                  }
                  modifiedEvent.matchData.push({
                    decisionRule: decRule,
                    matchingType: matches.rule.matchingType,
                    filters: matches.rule.filters,
                    autoMatches: JSON.stringify(matches.autoMatches, 0, 2),
                    potentialMatches: JSON.stringify(matches.potentialMatches, 0, 2),
                    conflictsMatchResults: JSON.stringify(matches.conflictMatches, 0, 2),
                    query: JSON.stringify(matches.query, 0, 2)
                  });
                }
              }
            }
          }
          this.matchEvents.push(modifiedEvent);
        }
      });
    },
    close() {
      window.close()
    }
  }
};
</script>
