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
      "/fhir": {
        target: "https://localhost:3000",
        secure: false,
        changeOrigin: true
      },
      "/tmp": {
        target: "https://localhost:3000",
        secure: false,
        changeOrigin: true
      }
    }
  }
};