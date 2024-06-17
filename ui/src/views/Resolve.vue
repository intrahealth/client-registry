<template>
  <v-container>
    <v-navigation-drawer
      color="secondary"
      right
      permanent
      clipped
      app
      >
      <v-list>
        <v-list-item>
          <v-btn 
            @click="showMatrix = true; $vuetify.goTo($refs.scoreMatrix);" 
            color="accent"
          >{{ $t('show_scores_matrix') }}
          </v-btn>
        </v-list-item>
        <v-list-item>
          <v-btn
            @click="showReview = true"
            color="success"
          >{{ $t('save_changes') }}
          </v-btn>
        </v-list-item>
        <v-divider></v-divider>
        <v-list-item>
          <h3 class="white--text">Options</h3>
        </v-list-item>
        <v-list-item>
          <v-switch v-model="useNickname" dark :label="$t('simplified_naming')" @change="setupCRIDList"></v-switch>
        </v-list-item>
        <v-list-item>
          <v-switch v-model="includeCRID" dark :label="$t('include_real_crid')" @change="setupCRIDList"></v-switch>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>
    <v-dialog :value="showReview" max-width="900" persistent>
      <v-card light>
        <v-card-title>
          <v-toolbar color="primary" dark>
            <v-toolbar-title class="font-weight-bold">
              {{ $t('review_changes') }}
            </v-toolbar-title>
            <v-spacer></v-spacer>
            <v-toolbar-items>
              <v-btn @click="showReview = false" icon><v-icon>mdi-close</v-icon></v-btn>
            </v-toolbar-items>
          </v-toolbar>
        </v-card-title>
        <v-card-text v-if="!bucketsModified">
          {{ $t('confirm_remove_flag') }}
        </v-card-text>
        <v-data-table
          v-else
          :headers="review_headers"
          :items="review_list"
          class="elevation-1"
          :disable-pagination="true"
          :hide-default-footer="true"
          :no-data-text="$t('no_data')"
          >
        </v-data-table>
        <v-card-actions>
          <v-btn
            color="error"
            @click="showReview = false"
          >
          {{ $t('cancel') }}
          </v-btn>
          <v-spacer></v-spacer>
          <v-btn
            color="success"
            @click="saveChanges"
          >
          {{ $t('save') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog :value="cohortPopup" width="500">
      <v-card light>
        <v-card-title class="secondary lighten-1" color="white" primary-title>
          {{ $t('move_all') }}
        </v-card-title>
        {{ $t('confirm_move_all_to_new') }}
        <v-card-text>
        </v-card-text>
        <v-card-actions>
          <v-btn color="info" @click="copyClient">{{ $t('move_one') }}</v-btn>
          <v-spacer></v-spacer>
          <v-btn color="warning" @click="copyCohort">{{ $t('move_all_records') }}</v-btn>
        </v-card-actions>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="error" @click="copyCohortInfo = null; cohortPopup = false">{{ $t('cancel') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-row v-for="(list, uid) in crids" :key="uid">
      <v-col cols="12">
        <v-card>
          <v-card-title>
            <v-toolbar color="primary darken-1" dark>
              <v-toolbar-title class="font-weight-bold" v-if="useNickname">
                {{ nickname[uid] }}
              </v-toolbar-title>
              <v-spacer></v-spacer>
              <v-toolbar-title class="font-weight-bold">
                CR ID: {{ uid }}
              </v-toolbar-title>
            </v-toolbar>
          </v-card-title>
          <v-data-table
            style="cursor: pointer"
            :headers="headers"
            :items="list"
            class="elevation-1"
            :disable-pagination="true"
            :hide-default-footer="true"
            :loading="loading"
            >
            <template v-slot:header.uid="{ props: { } }">
              {{ cridHeader }}
            </template>
            <template v-slot:item.uid="{ item }">
              <v-select
                :value="item.uid"
                :items="crid_list"
                :success-messages="'Original: '+cridDisplay(item.ouid)"
                @change="moveClient($event, item)"
                :key="item.source+item.source_id"
                dense
              ></v-select>
            </template>
            <template v-slot:item.source_id="{ item }">
              <a @click="goTo('client',{ clientId: item.uid, sourceId: item.source_id })">{{ item.source_id }}</a>
            </template>
            <template v-slot:item.view="{ item }">
              <v-switch v-model="showCard[item.source_id]" hide-details @change="if ( showCard[item.source_id] ) $vuetify.goTo($refs.fullCards)"></v-switch>
            </template>
            <template v-slot:item.score="{ item }">
              <v-switch v-model="showScore[item.source_id]" hide-details></v-switch>
            </template>
            <template v-slot:item.birthDate="{ item }">
              {{ item.birthDate | moment("MMMM DD YYYY") }}
            </template>
          </v-data-table>
        </v-card>
      </v-col>
    </v-row>
    <v-row ref="scoreMatrix">
      <v-col cols="12" v-if="showMatrix">
        <v-card>
          <v-card-title>
            <v-toolbar color="accent" dark>
              <v-toolbar-title class="font-weight-bold">
                {{ $t('scores_matrix') }}
              </v-toolbar-title>
              <v-spacer></v-spacer>
              <v-toolbar-items>
                <v-btn icon @click="showMatrix = false"><v-icon>mdi-close</v-icon></v-btn>
              </v-toolbar-items>
            </v-toolbar>
          </v-card-title>
          <v-data-table
            style="cursor: pointer"
            :headers="score_headers"
            :items="score_matrix"
            class="elevation-1"
            :disable-pagination="true"
            :hide-default-footer="true"
            >
          </v-data-table>
        </v-card>
      </v-col>
    </v-row>
    <v-row ref="fullCards">
      <template v-for="data in resolves">
        <v-col cols="4" v-if="showCard[data.source_id]" :key="data.source_id">
          <v-card
            class="mx-auto"
            light
            :id="data.source+data.source_id"
            :ref="data.source+data.source_id"
            >
            <v-toolbar color="secondary" dark>
              <v-toolbar-title class="font-weight-bold">
                Source: {{ data.source }} {{ data.source_id }}
              </v-toolbar-title>
              <v-spacer></v-spacer>
              <v-toolbar-items>
                <v-btn icon @click="showCard[data.source_id] = false"><v-icon>mdi-close</v-icon></v-btn>
              </v-toolbar-items>
            </v-toolbar>
            <v-list
              dense
              light
              height="100%"
              >
              <v-list-item
              v-for="(val, key) in fields"
              :key="key">
                <v-list-item-content>{{val}}:</v-list-item-content>
                <v-list-item-content class="align-end" v-if="dates[key]">
                  {{ data[key] | moment("MMMM Do YYYY") }}
                </v-list-item-content>
                <v-list-item-content class="align-end" v-else>
                  {{ data[key] }}
                </v-list-item-content>
              </v-list-item>
              <v-divider></v-divider>
              <v-list-item>
                <h5 class="text-uppercase">Scores</h5>
              </v-list-item>
              <v-list-item
                v-for="(score,source_id) in data.scores"
                :key="data.source_id+'-'+source_id"
                >
                <v-list-item-content>{{getSource(source_id)}}</v-list-item-content>
                <v-list-item-content>{{source_id}}:</v-list-item-content>
                <v-list-item-content>{{score}}</v-list-item-content>
              </v-list-item>

            </v-list>
          </v-card>
        </v-col>
      </template>
    </v-row>
  </v-container>
</template>

<script>
//const ADD_TEXT =  this.$t('assign_new_cr_id') ;
//const NEW_PREFIX = this.$t('new_cr_id') ;
// @ is an alias to /src
//import draggable from 'vuedraggable'
const ADD_TEXT = "Assign to new CR ID"
const NEW_PREFIX = "New CR ID "
import axios from "axios";
const shuffle = (arr) => {
  for( let i = arr.length - 1; i > 0; i-- ) {
    let j = Math.floor(Math.random() * (i+1))
    let temp = arr[i]
    arr[i] = arr[j]
    arr[j] = temp
  }
}
import { generalMixin } from "@/mixins/generalMixin";
export default {
  name: "Resolve",
  mixins: [generalMixin],
  components: {
    //draggable
  },
  data() {
    return {
      crids: {},
      crid_list: [],
      showCard: {},
      showScore: {},
      showMatrix: false,
      showReview: false,
      cohortPopup: false,
      resolves: [],
      loading: false,
      newIdx: 1,
      headers: [
        { text: this.cridHeader, value: "uid", sortable: false },
        { text: "Source", value: "source" },
        { text: this.$t('source_id') , value: "source_id" },
        { text: this.$t('surname'), value: "family" },
        { text: this.$t('given_names'), value: "given" },
        { text: this.$t('birth_date'), value: "birthDate" },
        { text: this.$t('gender'), value: "gender" },
        { text: this.$t('health_identification_number'), value: "ohin" },
        { text: this.$t('full_view'), value: "view", sortable: false },
        { text: "Scores", value: "score", sortable: false },
      ],
      dates: { birthDate: true },
      fields: { source: this.$t('submitting_system'), source_id: this.$t('source_id'), family: this.$t('surname'), given: this.$t('given_names'),
        gender: this.$t('gender'), birthDate: this.$t('birth_date'), phone: this.$t('phone'), ohin: this.$t('health_identification_number')
      },
      score_matrix: [],
      score_headers: [ { text: "Source", value: "name" } ],
      review_headers: [
        { text: "Source", value: "source" },
        { text: this.$t('source_id'), value: "source_id" },
        { text: this.$t('original_cr_id'), value: "ouid" },
        { text: this.$t('new_cr_id'), value: "uid" },
        { text: this.$t('old_hin'), value: "ohin" }, 
        { text: this.$t('new_hin'), value: "nhin" }

      ],
      review_list: [],
      copyCohortInfo: null,
      useNickname: true,
      includeCRID: false,
      available_nicknames: [
        "Aluminum", "Beryllium", "Carbon", "Dysprosium", "Europium", "Flourine", "Gallium", "Hydrogen", "Iron", "Krypton",
        "Lithium", "Magnesium", "Nitrogen", "Oxygen", "Phosphorus", "Copper", "Sodium", "Titanium", "Uranium",
        "Vanadium", "Xenon", "Gold", "Zinc"
        ],
      nickname: {}
    };
  },
  watch: {
    showScore: {
      handler(val) {
        for( let source_id of Object.keys(val) ) {
          if ( val[source_id] ) {
            if ( !this.headers.find( header => header.value === source_id ) ) {
              this.headers.push( { text: this.getSource(source_id)+" "+source_id, value: source_id } )
            }
          } else {
            this.headers = this.headers.filter( header => header.value !== source_id )
          }
        }
      },
      deep: true
    }
  },
  created: function() {
    this.$store.state.progress.enable = true;
    this.$store.state.progress.width = "300px";
    this.$store.state.progress.title =  this.$t('loading_potential');
    if(this.$route.query.flagType === 'autoMatches'){
      this.$store.state.progress.title =  this.$t('loading_auto');
    }
    axios.get(`/ocrux/match/potential-matches/${this.$route.params.clientId}`).then((resp) => {
        let extRegexPattern = /^extension_/;

        let matchingKeys = [];

        for (let i = 0; i < resp.data.length; i++) {
          const dataObject = resp.data[i];
            for (let key in dataObject) {
              if (extRegexPattern.test(key)) {
                matchingKeys.push(key);
                this.$set(this.fields, key, this.$t(key));
              }
            }
        }


        let idRegexPattern = /^identifier/;
        for (let key in resp.data[0]) {
          if (idRegexPattern.test(key)) {
              this.$set(this.fields, key, this.$t(key));

          }
        }


      this.resolves = resp.data

      shuffle(this.available_nicknames)
      this.organizeResolves(true)
      this.$store.state.progress.enable = false;
    }).catch(() => {
      this.$store.state.progress.enable = false;
      this.$store.state.alert.show = true;
      this.$store.state.alert.width = "500px";
      this.$store.state.alert.msg = this.$t('something_wrong');
      this.$store.state.alert.type = "error";
    })
  },
  computed: {
    cridHeader: function() {
      return this.useNickname ?  this.$t('Temporary_cr_id') + ( this.includeCRID ? " / Actual CR ID" : "") : "CR ID"
    },
    bucketsModified () {
      for(let matrix of this.resolves) {
        if(matrix.uid !== matrix.ouid) {
          return true
        }
      }
      return false;
    }
  },
  methods: {
    organizeResolves: function (firstTime) {
      this.loading = true;

      // Reset crids and review_list
      for (let idx of Object.keys(this.crids)) {
        this.crids[idx] = [];
      }
      this.review_list = [];

      // Process each resolve
      for (let resolve of this.resolves) {
        if (firstTime) {
          let scoreRow = {};
          scoreRow.name = `${resolve.source} ${resolve.source_id}`;
          this.score_headers.push({ text: scoreRow.name, value: resolve.source_id });

          for (let score_id of Object.keys(resolve.scores)) {
            resolve[score_id] = resolve.scores[score_id];
            scoreRow[score_id] = resolve.scores[score_id];
          }
          this.score_matrix.push(scoreRow);
          resolve.ouid = resolve.uid;
          resolve.ohin = resolve.nhin;
        }

        // Initialize crids entry if it doesn't exist
        if (!this.crids[resolve.uid]) {
          this.crids[resolve.uid] = [];
          this.nickname[resolve.uid] = this.available_nicknames.pop();
        }
        this.crids[resolve.uid].push(resolve);

        // Handle copyCohortInfo
        if (this.copyCohortInfo && this.copyCohortInfo.new_id === resolve.uid) {
          const matchedResolves = this.resolves.filter(r => r.uid === this.copyCohortInfo.new_id);

          if (matchedResolves.length > 0) {
            matchedResolves.forEach(matchedResolve => {
              // Update nhin and ohin
              resolve.nhin = matchedResolve.ohin;

            });

            if (resolve.ouid !== resolve.uid) {
              this.review_list.push(resolve);
            }
          } else {
            console.log(`No resolve object found with new_id: ${this.copyCohortInfo.new_id}`);
          }
        }

      }

      this.setupCRIDList();
      this.loading = false;
    },
    setupCRIDList: function() {
      this.crid_list = Object.keys(this.crids).map( crid => { return { text: this.cridDisplay(crid), value: crid } } )
      this.crid_list.push( { divider: true } )
      this.crid_list.push( { text: ADD_TEXT, value: ADD_TEXT } )
    },
    cridDisplay: function( crid ) {
      return this.useNickname ? this.nickname[crid] + ( this.includeCRID ? " ("+crid+")" : "" ): crid
    },
    getSource: function(source_id) {
      return this.resolves.find( resolve => resolve.source_id === source_id ).source
    },
    moveClient: function (val, item) {
      this.copyCohortInfo = { old_id: item.uid, new_id: val,  item: item }
      this.cohortPopup = true
    },
    copyClient: function() {
      if ( this.copyCohortInfo ) {
        let item = this.copyCohortInfo.item
        if ( this.copyCohortInfo.new_id === ADD_TEXT ) {
          item.uid = NEW_PREFIX + this.newIdx
          this.nickname[ item.uid ] = this.available_nicknames.pop()
          this.newIdx++
        } else {
          item.uid = this.copyCohortInfo.new_id
        }
        this.organizeResolves()
      }
      this.copyCohortInfo = null
      this.cohortPopup = false
    },
    copyCohort: function() {
      if ( this.copyCohortInfo ) {
        if ( this.copyCohortInfo.new_id === ADD_TEXT ) {
          this.copyCohortInfo.new_id = NEW_PREFIX + this.newIdx
          this.nickname[ this.copyCohortInfo.new_id ] = this.available_nicknames.pop()
          this.newIdx++
        }
        for ( let resolve of this.resolves.filter( resolve => resolve.uid === this.copyCohortInfo.old_id ) ) {
          resolve.uid = this.copyCohortInfo.new_id
        }
        this.organizeResolves()
      }
      this.copyCohortInfo = null
      this.cohortPopup = false
    },
    goTo: function( name, params ) {
      let routeData = this.$router.resolve( { name: name, params: params } )
      window.open(routeData.href, '_blank')
    },
    saveChanges() {
      this.$store.state.progress.enable = true
      this.$store.state.progress.title = this.$t('saving');
      // if no changes made on buckets then remove the flag
      let removeFlag = true
      // if buckets have been modified, flag will be removed if changes made will results in no more issues
      if(this.bucketsModified) {
        removeFlag = false
      }
      let body = {
        resolvingFrom: this.$route.params.clientId,
        resolves: this.resolves,
        removeFlag,
        flagType: this.$route.query.flagType
      }
      axios.post('/ocrux/match/resolve-match-issue', body).then(() => {
        this.countMatchIssues();
        this.countNewAutoMatches();
        this.showReview = false
        this.$store.state.progress.enable = false
        this.$store.state.alert.show = true;
        this.$store.state.alert.width = "500px";
        this.$store.state.alert.msg = this.$t('operation_successful');
        this.$store.state.alert.type = "success";
      }).catch((err) => {
        this.showReview = false
        this.$store.state.progress.enable = false
        this.$store.state.alert.show = true;
        this.$store.state.alert.width = "500px";
        this.$store.state.alert.msg = this.$t('operation_failed');
        this.$store.state.alert.type = "error";
        console.log(err);
      })
    }
  }
};
</script>
