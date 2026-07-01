import { ButtonStyle, ComponentType, TextInputStyle } from "./types";

/**
 * The slash commands we register with Discord, plus the modal + button
 * definitions used by the /report flow. Two are the core requirement; /report
 * exercises the modal + button stretch goals.
 */
export const COMMAND_DEFS = [
  {
    name: "report",
    description: "File a report — opens a short form (title + details).",
    type: 1,
  },
  {
    name: "status",
    description: "Show SlashOps status for this server.",
    type: 1,
  },
  {
    name: "echo",
    description: "Record a quick note and mirror it. Usage: /echo <text>",
    type: 1,
    options: [
      {
        name: "text",
        description: "What you want to record",
        type: 3, // STRING
        required: true,
      },
    ],
  },
];

/** custom_id namespaces so we can route component/modal interactions. */
export const REPORT_MODAL_ID = "report_modal";
export const REPORT_INPUT_TITLE = "report_title";
export const REPORT_INPUT_DETAILS = "report_details";

/** Button custom_ids carry the interaction id they act on: `ack:<id>`. */
export const BTN_ACK = "ack";
export const BTN_ESCALATE = "escalate";

/** The Acknowledge / Escalate buttons attached to a processed item. */
export function actionButtons(targetInteractionId: string) {
  return [
    {
      type: ComponentType.ACTION_ROW,
      components: [
        {
          type: ComponentType.BUTTON,
          style: ButtonStyle.SUCCESS,
          label: "Acknowledge",
          custom_id: `${BTN_ACK}:${targetInteractionId}`,
        },
        {
          type: ComponentType.BUTTON,
          style: ButtonStyle.DANGER,
          label: "Escalate",
          custom_id: `${BTN_ESCALATE}:${targetInteractionId}`,
        },
      ],
    },
  ];
}

export function reportModal() {
  return {
    custom_id: REPORT_MODAL_ID,
    title: "File a report",
    components: [
      {
        type: ComponentType.ACTION_ROW,
        components: [
          {
            type: ComponentType.TEXT_INPUT,
            custom_id: REPORT_INPUT_TITLE,
            label: "Title",
            style: TextInputStyle.SHORT,
            max_length: 100,
            required: true,
            placeholder: "e.g. Checkout is failing",
          },
        ],
      },
      {
        type: ComponentType.ACTION_ROW,
        components: [
          {
            type: ComponentType.TEXT_INPUT,
            custom_id: REPORT_INPUT_DETAILS,
            label: "Details",
            style: TextInputStyle.PARAGRAPH,
            max_length: 900,
            required: false,
            placeholder: "What happened? Any context helps.",
          },
        ],
      },
    ],
  };
}
