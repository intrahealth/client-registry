module.exports = {
  publicPath: "/crux",
  outputDir: "../server/gui",
  transpileDependencies: ["vuetify"],
  devServer: {
    host: "localhost",
    proxy: {
      "/ocrux": {
        target: "http://localhost:3000",
        secure: false,
        changeOrigin: true
      },
      "/fhir": {
        target: "http://localhost:3000",
        secure: false,
        changeOrigin: true
      },
      "/tmp": {
        target: "http://localhost:3000",
        secure: false,
        changeOrigin: true
      }
    }
  }
};