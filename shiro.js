// Shiro Discord Bot Copyright (©) 2018 - 2021 Shinwulf. All rights reserved. MIT License.

// We need this for our .env file, make sure to put it above anything else!
require("dotenv").config();
const Discord = require("discord.js");
const { promisify } = require("util");
const readdir = promisify(require("fs").readdir);
const Enmap = require("enmap");
const klaw = require("klaw");
const path = require("path");
const { SHIRO_TOKEN } = process.env;

// Client Settings
class Shiro extends Discord.Client {
  constructor(options) {
    super(options);

    this.config = require("./config.js");
    this.commands = new Discord.Collection();
    this.aliases = new Discord.Collection();
    this.settings = new Enmap({ name: "settings" });
    this.logger = require("./controllers/Logger");
    this.wait = promisify(setTimeout);
    this.cache = null;
  }

  // Permission Levels
  permlevel(message) {
    let permlvl = 0;

    const permOrder = this.config.permLevels.slice(0).sort((p, c) => p.level < c.level ? 1 : -1);

    while (permOrder.length) {
      const currentLevel = permOrder.shift();
      if (message.guild && currentLevel.guildOnly) continue;
      if (currentLevel.check(message)) {
        permlvl = currentLevel.level;
        break;
      }
    }
    return permlvl;
  }
  
  // Command load
  loadCommand(commandPath, commandName) {
    try {
      const props = new (require(`${commandPath}${path.sep}${commandName}`))(client);
      this.logger.log(`Loading command: ${props.help.name}. ✔`, "log");
      props.conf.location = commandPath;
      if (props.init) {
        props.init(this);
      }
      this.commands.set(props.help.name, props);
      props.conf.aliases.forEach(alias => {
        this.aliases.set(alias, props.help.name);
      });
      return false;
    } catch (e) {
      return `Unable to load command ${commandName}: ${e}`;
    }
  }
  
  // Command unload
  async unloadCommand(commandPath, commandName) {
    let command;
    if (this.commands.has(commandName)) {
      command = this.commands.get(commandName);
    } else if (this.aliases.has(commandName)) {
      command = this.commands.get(this.aliases.get(commandName));
    }
    if (!command) return `The command \`${commandName}\` doesn't seem to exist, nor is it an alias.`;

    if (command.shutdown) {
      await command.shutdown(this);
    }
    delete require.cache[require.resolve(`${commandPath}${path.sep}${commandName}.js`)];
    return false;
  }

  // Get Settingsfile
  getSettings(guild) {
    if (guild) {
      const defaults = client.config.defaultSettings || {};
      const guildData = client.settings.get(guild.id) || {};

      const returnObject = {};
      Object.keys(defaults).forEach((key) => {
        returnObject[key] = guildData[key] ? guildData[key] : defaults[key];
      });
      return returnObject;
    }
  }

  // Write Settingsfile
  writeSettings(id, newSettings) {
    const defaults = this.settings.get("default");
    let settings = this.settings.get(id);
    if (typeof settings != "object") settings = {};
    for (const key in newSettings) {
      if (defaults[key] !== newSettings[key]) {
        settings[key] = newSettings[key];
      } else {
        delete settings[key];
      }
    }
    this.settings.set(id, settings);
  }
}

// Shiro Client
const client = new Shiro({
  disabledEvents: ["TYPING_START", "RELATIONSHIP_ADD", "RELATIONSHIP_REMOVE", "CHANNEL_PINS_UPDATE"],
  disableEveryone: true
});

// Log Permission Levels
console.log(client.config.permLevels.map(p => `${p.level} : ${p.name}`));

// Get the functions file for loading the commands
require("./controllers/functions.js")(client);

const init = async () => {
  // Load commands
  klaw("./commands").on("data", (item) => {
    const cmdFile = path.parse(item.path);
    if (!cmdFile.ext || cmdFile.ext !== ".js") return;
    const response = client.loadCommand(cmdFile.dir, `${cmdFile.name}${cmdFile.ext}`);
    if (response) client.logger.error(response);
  });

  // Find and load events folder
  const evtFiles = await readdir("./events");
  client.logger.log(`Loading a total of ${evtFiles.length} events.`, "log");
  evtFiles.forEach(file => {
    const eventName = file.split(".")[0];
    client.logger.log(`Loading event: ${eventName}. ✅`);
    const event = new (require(`./events/${file}`))(client); 

    client.on(eventName, (...args) => event.run(...args));
    const mod = require.cache[require.resolve(`./events/${file}`)];
    delete require.cache[require.resolve(`./events/${file}`)];
    const index = mod.parent.children.indexOf(mod);
    if (index !== -1) mod.parent.children.splice(index, 1);
  });

  client.levelCache = {};
  for (let i = 0; i < client.config.permLevels.length; i++) {
    const thisLevel = client.config.permLevels[i];
    client.levelCache[thisLevel.name] = thisLevel.level;
  }

  // Discord Login
  client.login(SHIRO_TOKEN);
};

init();
