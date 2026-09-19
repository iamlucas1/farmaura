/*
farmaura-pdv-bridge/src/config.js

Loads (or creates, on first run) the local config file that lives outside this
repo, at ~/.farmaura-pdv-bridge/config.json on the register PC:

  { "port": 8734, "token": "<random>", "allowedOrigins": ["http://localhost:3000"], "driver": "simulated" }

The token is the only thing standing between this local HTTP port and any other
page/process running on the same PC — it must be copied once into the Farmaura
PDV settings (Configurações > Maquininha) on that same computer. It is generated
once and kept stable across restarts so that pairing doesn't need to be redone.
*/

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const CONFIG_DIR = path.join(os.homedir(), ".farmaura-pdv-bridge");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

const DEFAULTS = {
  port: 8734,
  allowedOrigins: ["http://localhost:3000"],
  driver: "simulated",
};

function loadConfig() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) {
    const generated = { ...DEFAULTS, token: crypto.randomBytes(24).toString("hex") };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(generated, null, 2) + "\n", "utf8");
    return generated;
  }
  const onDisk = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  return { ...DEFAULTS, ...onDisk };
}

module.exports = { loadConfig, CONFIG_PATH };
