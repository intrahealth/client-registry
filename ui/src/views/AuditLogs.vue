<template>
  <v-container fluid>
    <v-card>
      <v-card-title>
        {{ $t('settings_logs') }}
        <v-spacer />
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
  data() {
    return {
      auditEvents: [],
      totalAuditEvents: 0,
      currentPageUrl: '/ocrux/fhir/AuditEvent?_sort=-_lastUpdated', // Initial URL
      nextPageUrl: null,
      prevPageUrl: null,
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
  },
  mounted() {
    this.getAuditEvents();
  },
  methods: {
    fetchAuditEvents(url) {
      this.loading = true;
      this.$http.get(url).then((response) => {
        const data = response.data;

        // Update audit events and total count
        this.auditEvents = data.entry || [];
        this.totalAuditEvents = data.total;

        // Update pagination links
        this.nextPageUrl = null;
        this.prevPageUrl = null;
        if (data.link) {
          data.link.forEach((link) => {
            if (link.relation === 'next') {
              this.nextPageUrl = link.url;
            }
            if (link.relation === 'previous') {
              this.prevPageUrl = link.url;
            }
          });
        }

        this.loading = false;
      }).catch((error) => {
        console.error("Error fetching audit events:", error);
        this.loading = false;
      });
    },
    loadNextPage() {
      if (this.nextPageUrl) {
        this.fetchAuditEvents(this.nextPageUrl);
      }
    },
    loadPreviousPage() {
      if (this.prevPageUrl) {
        this.fetchAuditEvents(this.prevPageUrl);
      }
    },

  },
  created() {
    // Initial fetch
    this.fetchAuditEvents(this.currentPageUrl);
  }

}
</script>