const cron = require("node-cron");
const matchMixin = require("../mixins/matchMixin");
const config = require("../config");
const logger = require("../winston");

let patientReprocessing = config.get("cronJobs:patientReprocessing");

cron.schedule("0 21 * * *", () => {
  logger.info("Running cron job for patients reprocessing");
  matchMixin.reprocessPatients().then(() => {
    logger.info("Done running cron job for patients reprocessing");
  }).catch((error) => {
    logger.error("Error running cron job for patients reprocessing:", error);
  });
});
