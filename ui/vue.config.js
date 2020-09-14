module.exports = {
  publicPath: "/crux",
  outputDir: "../server/gui",
  transpileDependencies: ["vuetify"],
  devServer: {
    host: "localhost",
    proxy: {
      "/ocrux": {
        target: "https://localhost:3000",
        secure: false,
        changeOrigin: true
      },
      "/user": {
        target: "https://localhost:3000",
        secure: false,
        changeOrigin: true
      },
      "/config": {
        target: "https://localhost:3000",
        secure: false,
        changeOrigin: true
      },
      "/fhir": {
        target: "https://localhost:3000",
        secure: false,
        changeOrigin: true
      },
      "/match": {
        target: "https://localhost:3000",
        secure: false,
        changeOrigin: true
      }
    }
  }
};