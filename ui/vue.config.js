module.exports = {
  publicPath: "/crux",
  transpileDependencies: ["vuetify"],
  devServer: {
    host: "localhost",
    proxy: {
      "/ocrux": {
        target: "https://localhost:3000",
        secure: false,
        changeOrigin: true
      },
      "/fhir": {
        target: "http://localhost:8081/clientregistry",
        changeOrigin: true
      }
    }
  }
};