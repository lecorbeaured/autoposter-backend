async function sendAlert(message) {
  console.log("[telegram disabled]", message);
}

async function postReport(results) {
  console.log("[telegram disabled] report:", JSON.stringify(results));
}

module.exports = { sendAlert, postReport };
