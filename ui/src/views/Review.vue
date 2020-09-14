<template>
    <v-card>
    <v-card-title>
      Action Required
      <v-spacer />
    </v-card-title>
    <v-data-table
      style="cursor: pointer"
      :headers="headers"
      :items="reviews"
      :options.sync="options"
      :footer-props="{ 'items-per-page-options': [5,10,20,50] }"
      :loading="loading"
      class="elevation-1"
      @click:row="clickIt"
    >
      <template v-slot:item.uid="{ item }">
        <router-link :to="'/resolve/'+item.id+'?flagType='+item.reasonCode">{{ item.uid }}</router-link>
      </template>
      <template v-slot:item.reason="{ item }">
        <span class="text-uppercase">{{ item.reason }}</span>
      </template>
      <template v-slot:item.source="{ item }">
        <span class="text-uppercase">{{ getClientDisplayName(item.source) }}</span>
      </template>
      <template v-slot:item.date="{ item }">
        {{ item.date | moment("MMMM DD YYYY HH:mm:ssZ") }}
      </template>
    </v-data-table>
  </v-card>
</template>

<script>
// @ is an alias to /src
import axios from "axios";
import { generalMixin } from "@/mixins/generalMixin";
export default {
  mixins: [generalMixin],
  name: "Review",
  components: {
  },
  data() {
    return {
      reviews: [],
      debug: "",
      search: "",
      loading: false,
      prevPage: -1,
      link: [],
      options: { itemsPerPage: 10, sortBy: ["family"] },
      rowsPerPageItems: [5, 10, 20, 50],
      headers: [
        { text: "CR ID", value: "uid" },
        { text: "Surname", value: "family" },
        { text: "Given Names", value: "given" },
        { text: "Source", value: "source" },
        { text: "Source ID", value: "source_id" },
        { text: "Reason", value: "reason" },
        { text: "Date Flagged", value: "date" }
      ],
    };
  },
  methods: {
    getReviews() {
      axios.get('/match/get-match-issues').then((resp) => {
        this.reviews = resp.data
      })
    },
    clickIt: function(client) {
      this.$router.push({ name: "review", params: { clientId: client.uid } });
      //alert(patient.nin)
    }
  },
  created() {
    this.getReviews()
  }
};
</script>
