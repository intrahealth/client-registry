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
      }
    }
  }
};