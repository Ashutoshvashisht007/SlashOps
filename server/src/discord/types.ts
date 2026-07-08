/** Discord interaction protocol constants + minimal payload typings. */

export enum InteractionType {
  PING = 1,
  APPLICATION_COMMAND = 2,
  MESSAGE_COMPONENT = 3,
  APPLICATION_COMMAND_AUTOCOMPLETE = 4,
  MODAL_SUBMIT = 5,
}

export enum InteractionResponseType {
  PONG = 1,
  CHANNEL_MESSAGE_WITH_SOURCE = 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE = 5,
  DEFERRED_UPDATE_MESSAGE = 6,
  UPDATE_MESSAGE = 7,
  MODAL = 9,
}

export enum MessageFlags {
  EPHEMERAL = 1 << 6, // 64
}

export enum ComponentType {
  ACTION_ROW = 1,
  BUTTON = 2,
  TEXT_INPUT = 4,
}

export enum ButtonStyle {
  PRIMARY = 1,
  SECONDARY = 2,
  SUCCESS = 3,
  DANGER = 4,
  LINK = 5,
}

export enum TextInputStyle {
  SHORT = 1,
  PARAGRAPH = 2,
}

export interface InteractionUser {
  id: string;
  username: string;
  global_name?: string | null;
}

export interface CommandOption {
  name: string;
  type: number;
  value?: string | number | boolean;
}

export interface Interaction {
  id: string;
  application_id: string;
  type: InteractionType;
  token: string;
  guild_id?: string;
  channel_id?: string;
  member?: { user: InteractionUser; roles?: string[] };
  user?: InteractionUser;
  data?: {
    id?: string;
    name?: string; // command name
    custom_id?: string; // component / modal id
    options?: CommandOption[];
    components?: Array<{
      type: number;
      components: Array<{ type: number; custom_id: string; value: string }>;
    }>;
  };
}

export function interactionUser(i: Interaction): InteractionUser | undefined {
  return i.member?.user ?? i.user;
}

/**
 * The role ids the invoking member holds. Only present for guild interactions —
 * in a DM there is no member, so this is an empty list.
 */
export function memberRoles(i: Interaction): string[] {
  return i.member?.roles ?? [];
}
