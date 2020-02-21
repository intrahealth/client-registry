export const generalMixin = {
  methods: {
    getClientDisplayName(clientid) {
      let clientDet = this.$store.state.clients.find((client) => {
        return client.id === clientid
      })
      if(clientDet) {
        return clientDet.displayName
      }
      return
    },
    getSystemURIDisplayName(systemURI) {
      let name, id
      for(let index in this.$store.state.systemURI) {
        let systemURIDet
        if(Array.isArray(this.$store.state.systemURI[index].uri)) {
          systemURIDet = this.$store.state.systemURI[index].uri.find((uri) => {
            return uri === systemURI
          })
        } else {
          if(this.$store.state.systemURI[index].uri === systemURI) {
            systemURIDet = systemURI
          }
        }
        if(systemURIDet) {
          name = this.$store.state.systemURI[index].displayName
          id = index
          break;
        }
      }
      return {name, id}
    }
  }
}