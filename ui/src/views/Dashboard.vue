<template>
  <v-container fluid>
    <v-card class="my-2">
      <v-card-title>
        {{ $t("menu_dashboard") }}
        <v-spacer />
      </v-card-title>
    </v-card>
    <v-spacer />

    <!-- Metrics Section -->
    <v-card  class="pt-2">
      <v-card-title>
        Metrics
        <v-spacer />
      </v-card-title>
      <v-row class="my-2">
        <v-col v-for="card in 4" :key="card" cols="12" sm="6" md="3">
          <v-card class="mx-auto" max-width="400" outlined>
            <v-list-item three-line>
              <v-list-item-content>
                <div class="text-overline mb-4">
                  Total Patients
                </div>
                <v-list-item-title class="text-h5 mb-1">
                  Headline 5
                </v-list-item-title>
                <v-list-item-subtitle>
                  Greyhound divisely hello coldly fonwderfully
                </v-list-item-subtitle>
              </v-list-item-content>
              <v-list-item-avatar
                tile
                size="80"
                color="grey"
              ></v-list-item-avatar>
            </v-list-item>
          </v-card>
        </v-col>
      </v-row>
    </v-card>

    <v-spacer />

    <!-- Matches Section -->
    <v-card class="pt-2">
      <v-card-title>
        Matches
        <v-spacer />
      </v-card-title>
      <v-row>
        <!-- Pie Chart -->
        <v-col cols="12" sm="6">
          <v-card class="pa-4" outlined style="height: 590px;">
            <PieChart />
          </v-card>
        </v-col>

        <!-- Table -->
        <v-col cols="12" sm="6">
          <v-card class="pa-4" outlined style="height: 590px;">
            <v-data-table
              :headers="tableHeaders"
              :items="tableItems"
              class="elevation-1"
              dense
              style="height: calc(100% - 56px); overflow: auto;"
            >
              <template v-slot:top>
                <v-toolbar flat>
                  <v-toolbar-title>Match Data</v-toolbar-title>
                  <v-spacer />
                </v-toolbar>
              </template>
            </v-data-table>
          </v-card>
        </v-col>
      </v-row>
    </v-card>
  </v-container>
</template>

<script>
import { Pie } from "vue-chartjs";
import axios from "axios";


export default {
  components: {
    PieChart: {
      extends: Pie,
      props: ["chartData", "options"],
      mounted() {
        this.renderChart(this.chartData, this.options);
      },
      data() {
        return {
          chartData: {
            labels: ["Won", "Lost", "Drawn"],
            datasets: [
              {
                backgroundColor: ["#4caf50", "#f44336", "#2196f3"],
                data: [40, 30, 30],
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
          },
        };
      },
    },
  },
  data() {
    return {
      tableHeaders: [
        { text: "CRUID", value: "id" },
        { text: "Surname", value: "family" },
        { text: "Given Name", value: "given" },
        { text: "Source", value: "source" },
        { text: "Source ID", value: "source_id" },
      ],
      tableItems: [],
    };
  },
  created : function() { 
    this.$store.state.progress.enable = true;
    this.$store.state.progress.width = "300px";
    this.$store.state.progress.title =  "Loading match issues";

    axios.get(`/ocrux/match/get-match-issues`).then((resp) => {
      this.$store.state.progress.enable = false
      this.tableItems = resp.data
    }).catch(() => {
      this.$store.state.progress.enable = false;
      this.$store.state.alert.show = true;
      this.$store.state.alert.width = "500px";
      this.$store.state.alert.msg = this.$t('something_wrong');
      this.$store.state.alert.type = "error";
    })
   }
};
</script>
