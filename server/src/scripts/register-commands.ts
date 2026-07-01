/**
 * Register slash commands with Discord.
 *
 *   npm run register              → global (may take up to ~1h to appear)
 *   npm run register -- <guildId> → single guild (appears instantly, for testing)
 *
 * Reads DISCORD_APP_ID / DISCORD_BOT_TOKEN from the environment.
 */
import { COMMAND_DEFS } from "../discord/commands";
import { registerGlobalCommands, registerGuildCommands } from "../discord/rest";
import { log } from "../lib/logger";

async function main(): Promise<void> {
  const guildId = process.argv[2] ?? process.env.GUILD_ID;
  if (guildId) {
    await registerGuildCommands(guildId, COMMAND_DEFS);
    log.info("done: guild commands registered", { guildId });
  } else {
    await registerGlobalCommands(COMMAND_DEFS);
    log.info("done: global commands registered");
  }
}

main().catch((err) => {
  log.error("command registration failed", { err: String(err) });
  process.exit(1);
});
