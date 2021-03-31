<template>
    <v-card>
    <v-card-title>
      Action Required
      <v-spacer />
    </v-card-title>
    <v-data-table
      :headers="headers"
      :items="csvReport"
      :options.sync="options"
      :footer-props="{ 'items-per-page-options': [5,10,20,50] }"
      :loading="loading"
      class="elevation-1"
      >
      <template v-slot:item.date="{ item }">
        {{ item.date | moment("MMMM DD YYYY HH:mm:ssZ") }}
      </template>
      <template v-slot:item.reports="{ item }">
        <v-card-title small>
          <v-btn
            dense
            outlined
            rounded
            small
            @click="downloadReport(item.reportId)"
          >
            <v-progress-circular
              indeterminate
              color="amber"
              v-if="downloading"
            ></v-progress-circular>
            <v-icon left v-else>mdi-microsoft-excel</v-icon>
            Download
          </v-btn>
        </v-card-title>
      </template>
    </v-data-table>
  </v-card>
</template>

<script>
import axios from "axios";
export default {
  name: "CSVReport",
  components: {
  },
  data() {
    return {
      report_idx: 1,
      debug: "",
      search: "",
      loading: false,
      prevPage: -1,
      reports: {},
      disabled: {},
      options: { itemsPerPage: 10, sortBy: ["name"] },
      rowsPerPageItems: [5, 10, 20, 50],
      headers: [
        { text: "CSV ID", value: "uuid" },
        { text: "CSV Name", value: "name" },
        { text: "Date", value: "date" },
        { text: "Reports", value: "reports" }
      ],
      csvReport: [],
      downloading: false
    };
  },
  created: function() {
    this.getCSVReport()
  },
  methods: {
    getCSVReport() {
      axios.get('/ocrux/csv/getCSVUpload').then((resp) => {
        this.csvReport = resp.data
        for( let item of this.csvReport ) {
          this.reports[ item.uuid ] = []
          this.disabled[ item.uuid ] = false
        }
      })
    },
    downloadReport(id) {
      this.downloading = true
      axios.get(`/ocrux/csv/getCSVReport/${id}`).then((resp) => {
        this.downloading = false
        window.open(resp.data, "_self");
      })
    }
  }
};
</script>
