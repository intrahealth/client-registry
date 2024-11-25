<template>
  <footer class="footer">
    <div>
      <div>National Health Client Registry</div>
      <div>Copyright &copy; {{ currentYear }} Uganda Ministry of Health</div>
    </div>
  </footer>
</template>

<script>
export default {

  data() {
    return {
      currentDate: "",
      currentYear: new Date().getFullYear(),
    };
  },

  created() {
    this.getCurrentDate().then((date) => {
      this.currentDate = date
    });
  },

  methods: {
    async getCurrentDate() {
      const date = new Date();
      const options = { year: 'numeric', month: 'long', day: 'numeric' };
      return date.toLocaleDateString(undefined, options);
    },
  },
};
</script>

<style lang="scss" scoped>
.footer {
  bottom: 0;
  position: sticky;
  height: auto;
  padding: 10px;
  background-color: #e0e0e0;/* Grayish background */
  text-align: center;
  font-size: 10px;
  color: #333; /* Dark text color for better contrast */
}
</style>
