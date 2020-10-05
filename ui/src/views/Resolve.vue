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
          <v-btn @click="showMatrix = true; $vuetify.goTo($refs.scoreMatrix);" color="accent">Show Scores Matrix</v-btn>
        </v-list-item>
        <v-list-item>
          <v-btn
            @click="showReview = true"
            color="success"
          >
            Save Changes
          </v-btn>
        </v-list-item>
        <v-divider></v-divider>
        <v-list-item>
          <h3 class="white--text">Options</h3>
        </v-list-item>
        <v-list-item>
          <v-switch v-model="useNickname" dark label="Use Simplified Label?" @change="setupCRIDList"></v-switch>
        </v-list-item>
        <v-list-item>
          <v-switch v-model="includeCRID" dark label="Include Actual CR ID with Temporary CR ID?" @change="setupCRIDList"></v-switch>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>
    <v-dialog :value="showReview" max-width="900" persistent>
      <v-card light>
        <v-card-title>
          <v-toolbar color="primary" dark>
            <v-toolbar-title class="font-weight-bold">
              Review Changes
            </v-toolbar-title>
            <v-spacer></v-spacer>
            <v-toolbar-items>
              <v-btn @click="showReview = false" icon><v-icon>mdi-close</v-icon></v-btn>
            </v-toolbar-items>
          </v-toolbar>
        </v-card-title>
        <v-card-text v-if="!bucketsModified">
          No changes have been made, are you sure you want to go ahead and remove the flag?
        </v-card-text>
        <v-data-table
          v-else
          :headers="review_headers"
          :items="review_list"
          class="elevation-1"
          :disable-pagination="true"
          :hide-default-footer="true"
          >
        </v-data-table>
        <v-card-actions>
          <v-btn
            color="error"
            @click="showReview = false"
          >
            Cancel
          </v-btn>
          <v-spacer></v-spacer>
          <v-btn
            color="success"
            @click="saveChanges"
          >
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog :value="cohortPopup" width="500">
      <v-card light>
        <v-card-title class="secondary lighten-1" color="white" primary-title>
          Move All?
        </v-card-title>
        <v-card-text>
          Do you want to include all the other records from this CR ID and move them all to the new CR ID”
        </v-card-text>
        <v-card-actions>
          <v-btn color="info" @click="copyClient">Move this one record</v-btn>
          <v-spacer></v-spacer>
          <v-btn color="warning" @click="copyCohort">Move all records</v-btn>
        </v-card-actions>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="error" @click="copyCohortInfo = null; cohortPopup = false">Cancel</v-btn>
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
            <template v-slot:item.birthdate="{ item }">
              {{ item.birthdate | moment("MMMM DD YYYY") }}
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
                Scores Matrix
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
        { text: "Source ID", value: "source_id" },
        { text: "Surname", value: "family" },
        { text: "Given Names", value: "given" },
        { text: "Birth Date", value: "birthdate" },
        { text: "Gender", value: "gender" },
        { text: "Full View", value: "view", sortable: false },
        { text: "Scores", value: "score", sortable: false },
      ],
      dates: { birthdate: true },
      fields: { source: "Submitting System", source_id: "System ID", family: "Family Name", given: "Given Name",
        gender: "Gender", birthdate: "Birth Date"
      },
      score_matrix: [],
      score_headers: [ { text: "Source", value: "name" } ],
      review_headers: [
        { text: "Source", value: "source" },
        { text: "Source ID", value: "source_id" },
        { text: "Original CR ID", value: "ouid" },
        { text: "New CR ID", value: "uid" }
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
    axios.get(`/match/potential-matches/${this.$route.params.clientId}`).then((resp) => {
      this.resolves = resp.data
      shuffle(this.available_nicknames)
      this.organizeResolves(true)
    })
  },
  computed: {
    cridHeader: function() {
      return this.useNickname ? "Temporary CR ID" + ( this.includeCRID ? " / Actual CR ID" : "") : "CR ID"
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
    organizeResolves: function( firstTime ) {
      this.loading = true
      for( let idx of Object.keys(this.crids) ) {
        this.crids[idx] = []
      }
      this.review_list = []

      for( let resolve of this.resolves ) {
        if ( firstTime ) {
          let scoreRow = {}
          console.log(this.getClientDisplayName(resolve.source_id));
          scoreRow.name = resolve.source+" "+resolve.source_id
          this.score_headers.push( { text: scoreRow.name, value: resolve.source_id } )
          for( let score_id of Object.keys(resolve.scores) ) {
            resolve[score_id] = resolve.scores[score_id]
            scoreRow[score_id] = resolve.scores[score_id]
          }
          this.score_matrix.push( scoreRow )
          resolve.ouid = resolve.uid
        }
        if ( !this.crids[ resolve.uid ] ) {
          this.crids[ resolve.uid ] = []
          this.nickname[ resolve.uid ] = this.available_nicknames.pop()
        }
        this.crids[ resolve.uid ].push( resolve )
        if ( resolve.ouid !== resolve.uid ) {
          this.review_list.push( resolve )
        }
      }


      this.setupCRIDList()
      this.loading = false
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
    moveClient: function(val,item) {
      this.copyCohortInfo = { old_id: item.uid, new_id: val, item: item }
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
      this.$store.state.progress.title = 'Saving...'
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
      axios.post('/match/resolve-match-issue', body).then(() => {
        this.countMatchIssues();
        this.showReview = false
        this.$store.state.progress.enable = false
        this.$store.state.alert.show = true;
        this.$store.state.alert.width = "500px";
        this.$store.state.alert.msg = "Operation successful";
        this.$store.state.alert.type = "success";
      }).catch((err) => {
        this.showReview = false
        this.$store.state.progress.enable = false
        this.$store.state.alert.show = true;
        this.$store.state.alert.width = "500px";
        this.$store.state.alert.msg = "Error occured, operation failed";
        this.$store.state.alert.type = "error";
        console.log(err);
      })
    }
  }
};
</script>
