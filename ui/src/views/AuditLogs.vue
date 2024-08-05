<template>
  <v-container fluid>
  <v-card>
    <v-card-title>
      {{ $t('settings_logs') }}
      <v-spacer />
    </v-card-title>
    <v-card-title>
      <v-text-field v-model="search" append-icon="mdi-magnify" :label="$t('search')" single-line
        hide-details></v-text-field>
    </v-card-title>
    <!-- table -->
    <v-data-table loading-text="Loading...AuditLogs Please wait" :headers="headers" :items="auditEvents"
      :loading="loading">
      <template v-slot:no-data>
        <v-alert :value="true"> No AuditEvents Available </v-alert>
      </template>

      <template v-slot:item.id="{ item }">
        <span class="pl-2">{{ item.resource.id }}</span>
      </template>

      <template v-slot:item.action="{ item }">
        <span class="pl-2">{{ item.resource.action }}</span>
      </template>

      <template v-slot:item.recorded="{ item }">
        <span class="pl-2">{{ item.resource.recorded }}</span>
      </template>

      <template v-slot:item.what="{ item }">
        <span class="pl-2">{{ item.resource.entity[0].what.reference }}</span>
      </template>

      <template v-slot:item.outcomeDesc="{ item }">
        <span class="pl-2">{{ item.resource.outcomeDesc }}</span>
      </template>

      <template v-slot:item.who="{ item }">
        <span class="pl-2">{{ item.resource.agent[0].network.address }}</span>
      </template>

    </v-data-table>
  </v-card>
  </v-container>
</template>

<script>
export default {
  data () {
    return {
      search_date: "",
      search_action: "",
      search: "",
      date: "",
      search_terms: [],
      prevPage: -1,
      options: {},
      totalAuditEvents: 0,
      auditEvents: [],
      loading: false,
      headers: [
        {
          text: "Id",
          value: "id",
        },
        {
          text: "Action",
          value: "action",
        },
        {
          text: "Recorded",
          value: "recorded",
        },
        {
          text: "OutCome",
          value: "outcomeDesc",
        },
        {
          text: "What",
          value: "what",
        },
        {
          text: "Who",
          value: "who",
        },
      ],
    };
  } ,
  mounted() {
    this.getAuditEvents();
  },
  methods: {
    async getAuditEvents() {
      this.loading = true;
      this.auditEvents = [];
      let url = `/ocrux/fhir/AuditEvent?_sort=-_lastUpdated`;
      this.$http.get(url).then((response) => {
        this.auditEvents = response.data.entry;
        this.totalAuditEvents = response.data.total;
        this.loading = false;
      });
    }
  }
}
</script>