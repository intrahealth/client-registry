<template>
    <v-card>
    <v-card-title>
    {{ $t('menu_action_required') }}
      <v-spacer />
    </v-card-title>
    <v-card-title>
      <v-text-field
        v-model="search"
        append-icon="mdi-magnify"
        :label="$t('search')"
        single-line
        hide-details
      ></v-text-field>
    </v-card-title>
    <v-data-table
      style="cursor: pointer"
      :headers="headers"
      :items="reviews"
      :options.sync="options"
      :footer-props="{ 
      'items-per-page-options': [5,10,20,50] ,
      'items-per-page-text':this.$t('row_per_page')}"
      :no-data-text="$t('no_data')"
      :loading="loading"
      class="elevation-1"
      :search="search"
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
        { text:  this.$t('cr_id'), value: "uid" },
        { text: this.$t('health_identification_number'), value: "hin" },
        { text:  this.$t('surname'), value: "family" },
        { text:  this.$t('given_names'), value: "given" },
        { text:  this.$t('source'), value: "source" },
        { text:  this.$t('source_id') , value: "source_id" },
        { text:  this.$t('reason'), value: "reason" },
        { text:  this.$t('date_flagged'), value: "date" }
      ],
    };
  },
  methods: {
    getReviews() {
      this.loading = true
      axios.get('/ocrux/match/get-match-issues').then((resp) => {
        this.reviews = resp.data
        this.loading = false
      })
    },
    clickIt: function(client) {
      this.$router.push({ name: "review", params: { clientId: client.uid } });
    }
  },
  created() {
    this.getReviews()
  }
};
</script>
