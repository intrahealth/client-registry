import axios from "axios";
export const generalMixin = {
  methods: {
    countMatchIssues() {
      axios.get(`/match/count-match-issues`).then((response) => {
        if(response.data) {
          this.$store.state.totalMatchIssues = response.data.total
        }
      })
    },
    getClientDisplayName(clientid) {
      let clientDet = this.$store.state.clients.find((client) => {
        return client.id === clientid
      })
      if (clientDet) {
        return clientDet.displayName
      }
      return
    },
    getClients() {
      axios
        .get("/config/getClients")
        .then(response => {
          this.$store.state.clients = response.data;
        })
        .catch(err => {
          throw err;
        });
    },
    getSystemURIDisplayName(systemURI) {
      let name, id
      for (let index in this.$store.state.systemURI) {
        let systemURIDet
        if (Array.isArray(this.$store.state.systemURI[index].uri)) {
          systemURIDet = this.$store.state.systemURI[index].uri.find((uri) => {
            return uri === systemURI
          })
        } else {
          if (this.$store.state.systemURI[index].uri === systemURI) {
            systemURIDet = systemURI
          }
        }
        if (systemURIDet) {
          name = this.$store.state.systemURI[index].displayName
          id = index
          break;
        }
      }
      return {
        name,
        id
      }
    }
  }
}