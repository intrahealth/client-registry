<template>
  <v-app>
    <v-app-bar app color="primary" dark>
      <v-toolbar-title class="display-1">Client Registry</v-toolbar-title>
      <v-spacer></v-spacer>
    </v-app-bar>

    <v-content>
      <router-view />
    </v-content>
  </v-app>
</template>

<script>
export default {
  name: "App",

  data: () => ({
    //
  })
};
</script>
