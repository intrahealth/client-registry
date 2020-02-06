module.exports = {
  publicPath: "/crux",
  transpileDependencies: ["vuetify"],
  devServer: {
    host: "anachrony",
    proxy: {
      "/fhir": {
        target: "http://localhost:8080/hapi",
        changeOrigin: true
      }
    }
  }
};
