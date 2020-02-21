module.exports = {
  publicPath: "/crux",
  outputDir: "../server/gui",
  transpileDependencies: ["vuetify"],
  devServer: {
    host: "localhost",
    proxy: {
      "/ocrux": {
        target: "http://scratchpad.ihris.org",
        secure: false,
        changeOrigin: true
      }
    }
  }
};