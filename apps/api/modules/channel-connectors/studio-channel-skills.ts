import type {
  ChannelConnectorCommandSurfaceSkillAction,
} from "../../../../types/channel-connectors.js";

export interface StudioChannelConnectorPlatformSkillDefinition {
  platform: "octo" | "feishu";
  name: string;
  markdown: string;
  runtimeActions: ChannelConnectorCommandSurfaceSkillAction[];
}

function action(
  id: string,
  label: string,
  manifest: string,
  tool: string | null,
  actionName: string | null,
  approval: ChannelConnectorCommandSurfaceSkillAction["approval"],
  notes?: string,
): ChannelConnectorCommandSurfaceSkillAction {
  return {
    id,
    label,
    manifest,
    tool,
    action: actionName,
    approval,
    notes: notes || null,
  };
}

const channelMessageActions = [
  action("channel-send-message", "Send IM message", "studio-channel-messages", null, "send", "managed"),
  action("channel-send-file", "Send IM file", "studio-channel-files", null, "send", "managed"),
];

const feishuChannelActions: ChannelConnectorCommandSurfaceSkillAction[] = [
  action("feishu-channel-send", "Send Feishu message", "studio-feishu-actions", "feishu_channel", "send", "required"),
  action("feishu-channel-thread-reply", "Reply in Feishu thread", "studio-feishu-actions", "feishu_channel", "thread-reply", "required"),
  action("feishu-channel-read", "Read Feishu message", "studio-feishu-actions", "feishu_channel", "read", "none"),
  action("feishu-channel-edit", "Edit Feishu message", "studio-feishu-actions", "feishu_channel", "edit", "required"),
  action("feishu-channel-pin", "Pin Feishu message", "studio-feishu-actions", "feishu_channel", "pin", "required"),
  action("feishu-channel-unpin", "Unpin Feishu message", "studio-feishu-actions", "feishu_channel", "unpin", "required"),
  action("feishu-channel-list-pins", "List Feishu pins", "studio-feishu-actions", "feishu_channel", "list-pins", "none"),
  action("feishu-channel-channel-info", "Read Feishu chat info", "studio-feishu-actions", "feishu_channel", "channel-info", "none"),
  action("feishu-channel-member-info", "Read Feishu member info", "studio-feishu-actions", "feishu_channel", "member-info", "none"),
  action("feishu-channel-channel-list", "List Feishu chats/users", "studio-feishu-actions", "feishu_channel", "channel-list", "none"),
  action("feishu-channel-react", "React to Feishu message", "studio-feishu-actions", "feishu_channel", "react", "required"),
  action("feishu-channel-reactions", "List Feishu reactions", "studio-feishu-actions", "feishu_channel", "reactions", "none"),
];

const feishuAppScopesActions: ChannelConnectorCommandSurfaceSkillAction[] = [
  action("feishu-app-scopes-list", "List Feishu app scopes", "studio-feishu-actions", "feishu_app_scopes", "list", "none"),
];

const octoManagementActions: ChannelConnectorCommandSurfaceSkillAction[] = [
  action("octo-list-groups", "List Octo groups", "studio-octo-actions", "octo_management", "list-groups", "none"),
  action("octo-group-info", "Read Octo group info", "studio-octo-actions", "octo_management", "group-info", "none"),
  action("octo-group-members", "List Octo group members", "studio-octo-actions", "octo_management", "group-members", "none"),
  action("octo-search-members", "Search Octo Space members", "studio-octo-actions", "octo_management", "search-members", "none"),
  action("octo-history", "Sync Octo channel history", "studio-octo-actions", "octo_management", "history", "none"),
  action("octo-group-md-read", "Read Octo GROUP.md", "studio-octo-actions", "octo_management", "group-md-read", "none"),
  action("octo-thread-md-read", "Read Octo THREAD.md", "studio-octo-actions", "octo_management", "thread-md-read", "none"),
  action("octo-file-download-url", "Get Octo file download URL", "studio-octo-actions", "octo_management", "file-download-url", "none"),
  action("octo-list-threads", "List Octo threads", "studio-octo-actions", "octo_management", "list-threads", "none"),
  action("octo-thread-info", "Read Octo thread info", "studio-octo-actions", "octo_management", "thread-info", "none"),
  action("octo-thread-members", "List Octo thread members", "studio-octo-actions", "octo_management", "thread-members", "none"),
  action("octo-voice-context-read", "Read Octo voice context", "studio-octo-actions", "octo_management", "voice-context-read", "none"),
  action("octo-create-group", "Create Octo group", "studio-octo-actions", "octo_management", "create-group", "required"),
  action("octo-update-group", "Update Octo group", "studio-octo-actions", "octo_management", "update-group", "required"),
  action("octo-add-members", "Add Octo group members", "studio-octo-actions", "octo_management", "add-members", "required"),
  action("octo-remove-members", "Remove Octo group members", "studio-octo-actions", "octo_management", "remove-members", "required"),
  action("octo-create-thread", "Create Octo thread", "studio-octo-actions", "octo_management", "create-thread", "required"),
  action("octo-delete-thread", "Delete Octo thread", "studio-octo-actions", "octo_management", "delete-thread", "required"),
  action("octo-join-thread", "Join Octo thread", "studio-octo-actions", "octo_management", "join-thread", "required"),
  action("octo-leave-thread", "Leave Octo thread", "studio-octo-actions", "octo_management", "leave-thread", "required"),
  action("octo-group-md-update", "Update Octo GROUP.md", "studio-octo-actions", "octo_management", "group-md-update", "required"),
  action("octo-thread-md-update", "Update Octo THREAD.md", "studio-octo-actions", "octo_management", "thread-md-update", "required"),
  action("octo-voice-context-update", "Update Octo voice context", "studio-octo-actions", "octo_management", "voice-context-update", "required"),
  action("octo-voice-context-delete", "Delete Octo voice context", "studio-octo-actions", "octo_management", "voice-context-delete", "required"),
  action("octo-message-edit", "Edit Octo bot message", "studio-octo-actions", "octo_management", "message-edit", "required"),
];

const feishuDocActions: ChannelConnectorCommandSurfaceSkillAction[] = [
  action("feishu-doc-read", "Read Feishu Docx", "studio-feishu-actions", "feishu_doc", "read", "none"),
  action("feishu-doc-list-blocks", "List Feishu Docx blocks", "studio-feishu-actions", "feishu_doc", "list_blocks", "none"),
  action("feishu-doc-get-block", "Get Feishu Docx block", "studio-feishu-actions", "feishu_doc", "get_block", "none"),
  action("feishu-doc-create", "Create Feishu Docx", "studio-feishu-actions", "feishu_doc", "create", "required"),
  action("feishu-doc-write", "Write Feishu Docx", "studio-feishu-actions", "feishu_doc", "write", "required"),
  action("feishu-doc-append", "Append Feishu Docx", "studio-feishu-actions", "feishu_doc", "append", "required"),
  action("feishu-doc-insert", "Insert Feishu Docx content", "studio-feishu-actions", "feishu_doc", "insert", "required"),
  action("feishu-doc-update-block", "Update Feishu Docx block", "studio-feishu-actions", "feishu_doc", "update_block", "required"),
  action("feishu-doc-delete-block", "Delete Feishu Docx block", "studio-feishu-actions", "feishu_doc", "delete_block", "required"),
  action("feishu-doc-create-table", "Create Feishu Docx table", "studio-feishu-actions", "feishu_doc", "create_table", "required"),
  action("feishu-doc-write-table-cells", "Write Feishu Docx table cells", "studio-feishu-actions", "feishu_doc", "write_table_cells", "required"),
  action("feishu-doc-create-table-with-values", "Create Feishu Docx table with values", "studio-feishu-actions", "feishu_doc", "create_table_with_values", "required"),
  action("feishu-doc-insert-table-row", "Insert Feishu Docx table row", "studio-feishu-actions", "feishu_doc", "insert_table_row", "required"),
  action("feishu-doc-insert-table-column", "Insert Feishu Docx table column", "studio-feishu-actions", "feishu_doc", "insert_table_column", "required"),
  action("feishu-doc-delete-table-rows", "Delete Feishu Docx table rows", "studio-feishu-actions", "feishu_doc", "delete_table_rows", "required"),
  action("feishu-doc-delete-table-columns", "Delete Feishu Docx table columns", "studio-feishu-actions", "feishu_doc", "delete_table_columns", "required"),
  action("feishu-doc-merge-table-cells", "Merge Feishu Docx table cells", "studio-feishu-actions", "feishu_doc", "merge_table_cells", "required"),
  action("feishu-doc-color-text", "Apply Feishu Docx colored text", "studio-feishu-actions", "feishu_doc", "color_text", "required"),
  action("feishu-doc-upload-image", "Upload image to Feishu Docx", "studio-feishu-actions", "feishu_doc", "upload_image", "required"),
  action("feishu-doc-upload-file", "Upload file to Feishu Docx", "studio-feishu-actions", "feishu_doc", "upload_file", "required"),
];

const feishuDriveActions: ChannelConnectorCommandSurfaceSkillAction[] = [
  action("feishu-drive-list", "List Feishu Drive folder", "studio-feishu-actions", "feishu_drive", "list", "none"),
  action("feishu-drive-info", "Read Feishu Drive file info", "studio-feishu-actions", "feishu_drive", "info", "none"),
  action("feishu-drive-list-comments", "List Feishu Drive comments", "studio-feishu-actions", "feishu_drive", "list_comments", "none"),
  action("feishu-drive-list-comment-replies", "List Feishu Drive comment replies", "studio-feishu-actions", "feishu_drive", "list_comment_replies", "none"),
  action("feishu-drive-create-folder", "Create Feishu Drive folder", "studio-feishu-actions", "feishu_drive", "create_folder", "required"),
  action("feishu-drive-move", "Move Feishu Drive file", "studio-feishu-actions", "feishu_drive", "move", "required"),
  action("feishu-drive-delete", "Delete Feishu Drive file", "studio-feishu-actions", "feishu_drive", "delete", "required"),
  action("feishu-drive-add-comment", "Add Feishu Drive comment", "studio-feishu-actions", "feishu_drive", "add_comment", "required"),
  action("feishu-drive-reply-comment", "Reply Feishu Drive comment", "studio-feishu-actions", "feishu_drive", "reply_comment", "required"),
];

const feishuPermActions: ChannelConnectorCommandSurfaceSkillAction[] = [
  action("feishu-perm-list", "List Feishu collaborators", "studio-feishu-actions", "feishu_perm", "list", "none"),
  action("feishu-perm-add", "Add Feishu collaborator", "studio-feishu-actions", "feishu_perm", "add", "required"),
  action("feishu-perm-remove", "Remove Feishu collaborator", "studio-feishu-actions", "feishu_perm", "remove", "required"),
];

const feishuWikiActions: ChannelConnectorCommandSurfaceSkillAction[] = [
  action("feishu-wiki-spaces", "List Feishu wiki spaces", "studio-feishu-actions", "feishu_wiki", "spaces", "none"),
  action("feishu-wiki-nodes", "List Feishu wiki nodes", "studio-feishu-actions", "feishu_wiki", "nodes", "none"),
  action("feishu-wiki-get", "Get Feishu wiki node", "studio-feishu-actions", "feishu_wiki", "get", "none"),
  action("feishu-wiki-search", "Feishu wiki search fallback", "studio-feishu-actions", "feishu_wiki", "search", "none"),
  action("feishu-wiki-create", "Create Feishu wiki node", "studio-feishu-actions", "feishu_wiki", "create", "required"),
  action("feishu-wiki-move", "Move Feishu wiki node", "studio-feishu-actions", "feishu_wiki", "move", "required"),
  action("feishu-wiki-rename", "Rename Feishu wiki node", "studio-feishu-actions", "feishu_wiki", "rename", "required"),
];

const feishuBitableActions: ChannelConnectorCommandSurfaceSkillAction[] = [
  action("feishu-bitable-get-meta", "Get Feishu Bitable metadata", "studio-feishu-actions", "feishu_bitable", "get_meta", "none"),
  action("feishu-bitable-list-fields", "List Feishu Bitable fields", "studio-feishu-actions", "feishu_bitable", "list_fields", "none"),
  action("feishu-bitable-list-records", "List Feishu Bitable records", "studio-feishu-actions", "feishu_bitable", "list_records", "none"),
  action("feishu-bitable-get-record", "Get Feishu Bitable record", "studio-feishu-actions", "feishu_bitable", "get_record", "none"),
  action("feishu-bitable-create-record", "Create Feishu Bitable record", "studio-feishu-actions", "feishu_bitable", "create_record", "required"),
  action("feishu-bitable-update-record", "Update Feishu Bitable record", "studio-feishu-actions", "feishu_bitable", "update_record", "required"),
  action("feishu-bitable-create-app", "Create Feishu Bitable app", "studio-feishu-actions", "feishu_bitable", "create_app", "required"),
  action("feishu-bitable-create-field", "Create Feishu Bitable field", "studio-feishu-actions", "feishu_bitable", "create_field", "required"),
];

export const STUDIO_CHANNEL_CONNECTOR_PLATFORM_SKILLS: StudioChannelConnectorPlatformSkillDefinition[] = [
  {
    platform: "octo",
    name: "octo-bot-api",
    runtimeActions: [...channelMessageActions, ...octoManagementActions],
    markdown: `---
name: octo-bot-api
description: Octo runtime messaging, history, files, group/thread management, and multi-bot collaboration through Studio Channel Connectors.
---

# Octo Bot API Runtime Skill

Studio owns Octo credentials, WebSocket, read receipts, heartbeat, file upload, message delivery, and Bot API calls. Do not install OpenClaw plugins, run cc-connect, curl Bot API endpoints, or save platform credentials from an Agent. Use the Studio contracts below.

## Send Messages

Use a \`studio-channel-messages\` JSON block when the user asks to send an Octo DM, group message, thread message, or bot/member mention.

\`\`\`studio-channel-messages
[
  {"platform":"octo","target":"dm:human_uid","content":"DM a human user"},
  {"platform":"octo","target":"group:group_no","content":"@[bot_uid_bot:BotName] Please introduce your capability."},
  {"platform":"octo","target":"thread:group_no____short_id","content":"reply inside the thread"},
  {"platform":"octo","target":"group:group_no","mentionUids":["human_uid"],"content":"@human_uid please confirm"}
]
\`\`\`

Targets: \`dm:<human_uid>\`, \`group:<group_no>\`, \`thread:<group_no>____<short_id>\`. Octo DM targets are humans only; IDs ending in \`_bot\` must be coordinated by group/thread mention. Visible mention syntax is \`@[uid:displayName]\`; Studio converts it to visible \`@displayName\` plus native Octo mention entities. Persona/on-behalf-of messages may use \`onBehalfOf\`, \`on_behalf_of\`, or \`respondAs\` when Studio grants that runtime identity.

## Files

Use \`studio-channel-files\` for images, documents, archives, binaries, and generated files. Studio validates paths, preserves file names, uploads through Octo STS/COS when available, and falls back to the supported upload path when needed. For inbound Octo file references that only include a platform path, use the \`file-download-url\` runtime action instead of calling Octo endpoints directly.

\`\`\`studio-channel-files
[
  {"path":"relative/or/absolute/file.ext","name":"original-name.ext","caption":"optional caption"}
]
\`\`\`

Generate or copy requested outgoing files under the current working directory unless the current permission mode allows an existing readable path. Do not call Octo upload endpoints yourself.

## Message History Sync

Studio injects recent Octo timeline context before the current request. In groups and threads, unmentioned messages are recorded as context but do not trigger a reply. When mentioned later, use the injected timeline to understand collaborator replies. Do not re-answer old messages unless the current user explicitly asks.

Studio also exposes the user command \`/octo history [limit]\` for the current group/thread and supports bounded history budgets to avoid context overflow.

For explicit platform operations, return a \`studio-octo-actions\` JSON block. Read-only actions run directly; mutating actions require Studio IM approval.

\`\`\`studio-octo-actions
[
  {"tool":"octo_management","action":"group-members","params":{"group_no":"group_no"}},
  {"tool":"octo_management","action":"history","params":{"channel_id":"group_no","channel_type":2,"limit":20}},
  {"tool":"octo_management","action":"file-download-url","params":{"file_path":"chat/hello.txt","file_name":"hello.txt"}},
  {"tool":"octo_management","action":"message-edit","params":{"message_id":"12345678901234567","content":"updated text"}}
]
\`\`\`

## Multi-Bot Coordination

In Octo groups, other bots may be Studio agents or external products. Ask humans by DM when requested; ask bots by visible group/thread \`@[bot_uid_bot:Name]\`. Do not claim you lack Octo or Feishu API permission just because you are an Agent; Studio delivers the declared messages. Do not respond to unrelated bot chatter unless the user explicitly asks you to coordinate or summarize it.

## Groups and Threads

Studio provides Octo management commands to users and Agent-native context:

- \`/octo groups\`
- \`/octo history [limit]\`
- \`/octo info [group_no]\`
- \`/octo members [group_no]\`
- \`/octo search <keyword>\`
- \`/octo threads [group_no]\`
- \`/octo thread <short_id> [group_no]\`
- \`/octo thread-members <short_id> [group_no]\`
- \`/octo group-md [group_no]\`
- \`/octo thread-md <short_id> [group_no]\`
- \`/octo voice-context\`
- \`/octo download-url <file_path> [file_name]\`
- \`/octo edit-message <message_id> <content>\`
- \`/octo create-group <name> --members uid1,uid2\`
- \`/octo update-group <group_no> --name <name> --notice <notice>\`
- \`/octo add-members <group_no> uid1,uid2\`
- \`/octo remove-members <group_no> uid1,uid2\`
- \`/octo create-thread <group_no> <name>\`
- \`/octo delete-thread <short_id> [group_no]\`
- \`/octo join-thread <short_id> [group_no]\`
- \`/octo leave-thread <short_id> [group_no]\`
- \`/octo set-group-md [--group group_no] <markdown>\`
- \`/octo set-thread-md [--group group_no] [--thread short_id] <markdown>\`
- \`/octo set-voice-context <text>\`
- \`/octo delete-voice-context\`

Mutating Octo commands require Studio channel management permission. For natural-language user requests, prefer the manifest contracts for outgoing messages/files and mention the matching \`/octo\` command only when the user needs to run a management action.

## Admin-Plane Boundary

Octo User API bot management endpoints such as bot listing, bot creation/deletion, user API keys, and bot token retrieval are Studio admin-plane capabilities, not Agent runtime actions. Agents must not request or expose \`uk_*\` user keys, bot tokens, bot-token retrieval endpoints, or raw registration flows. Ask the user to configure bots in Studio when bot lifecycle management is needed.

## Runtime Safety

Never expose bot tokens or platform credentials. Do not install plugins or tell the user to configure OpenClaw for this Studio channel. Keep group replies concise and use current channel context, member IDs, and thread IDs exactly as Studio provides them. Studio owns connection lifecycle actions including register, heartbeat, typing, read receipt, event ack, upload credentials, raw upload credentials, and raw delivery retries; Agents should not emit runtime actions for those lifecycle operations.`,
  },
  {
    platform: "feishu",
    name: "feishu-messaging",
    runtimeActions: [...channelMessageActions, ...feishuChannelActions],
    markdown: `---
name: feishu-messaging
description: Feishu/Lark IM runtime messages, Markdown replies, native mentions, files, group context, and member coordination through Studio Channel Connectors.
---

# Feishu Messaging Runtime Skill

Studio owns Feishu App credentials, tenant tokens, long connection, message parsing, file upload, card rendering, and outbound delivery. Do not run cc-connect, curl Feishu APIs, install OpenClaw Feishu plugins, or save app credentials from an Agent.

## Send Messages

Use a \`studio-channel-messages\` JSON block when the user asks to send a Feishu private message, group message, Markdown message, or native mention.

\`\`\`studio-channel-messages
[
  {"platform":"feishu","target":"open_id:ou_xxx","content":"DM by open_id"},
  {"platform":"feishu","target":"user_id:u_xxx","content":"DM by user_id"},
  {"platform":"feishu","target":"chat:oc_xxx","format":"markdown","content":"@[ou_member:MemberName] **please confirm**"}
]
\`\`\`

Targets: \`chat:<chat_id>\`, \`open_id:<ou_xxx>\`, \`user_id:<u_xxx>\`, \`dm:<ou_xxx>\`, and \`dm:<u_xxx>\`. Use \`format:"markdown"\` for Feishu post/Markdown rendering. In group messages, write visible native mentions as \`@[member_open_id:Display Name]\`; Studio converts them to Feishu at-tags.

## Files

Use \`studio-channel-files\` for images, documents, archives, and binaries. Studio uploads files through Feishu image/file APIs and sends the resulting message to the active conversation.

\`\`\`studio-channel-files
[
  {"path":"relative/or/absolute/file.ext","name":"original-name.ext","caption":"optional caption"}
]
\`\`\`

Generate or copy outgoing files under the current working directory unless the current permission mode allows an existing readable path. Do not call Feishu upload endpoints yourself.

## Groups and Members

Studio injects Feishu group context when available: chat ID, sender ID, bot identity, topic/root metadata, and a bounded member list from Feishu Chat Members API. Use \`chat:<chat_id>\` for group coordination and \`open_id:<member_open_id>\` or \`user_id:<member_user_id>\` for private coordination. Do not say you lack Feishu API permission unless Studio reports a concrete send failure.

## Message History Sync

Studio records real-time Feishu group messages that do not mention the bot as timeline context; they do not trigger an Agent run. When the bot is later mentioned, use the injected recent timeline to understand current group state. Topic/thread sessions may include root/thread bootstrap context when Studio can fetch it. Do not re-answer stale messages unless requested.

## Cards and Commands

Feishu menu cards, progress cards, command cards, permission approval buttons, final Markdown cards, and fallback text are rendered by Studio. Agents should provide concise content and manifests; they should not construct Feishu card JSON unless the user explicitly asks for card design content.

## Channel Actions

For OpenClaw-compatible Feishu channel operations, use \`studio-feishu-actions\` with \`tool:"feishu_channel"\`. Studio executes read-only actions immediately and asks for Studio IM approval before mutating actions.

Read-only actions: \`read\`, \`list-pins\`, \`channel-info\`, \`member-info\`, \`channel-list\`, \`reactions\`.

Mutation actions: \`send\`, \`thread-reply\`, \`edit\`, \`pin\`, \`unpin\`, \`react\`.

\`\`\`studio-feishu-actions
[
  {"tool":"feishu_channel","action":"channel-info","chat_id":"oc_xxx","include_members":true},
  {"tool":"feishu_channel","action":"member-info","chat_id":"oc_xxx","page_size":50},
  {"tool":"feishu_channel","action":"read","message_id":"om_xxx"},
  {"tool":"feishu_channel","action":"list-pins","chat_id":"oc_xxx"},
  {"tool":"feishu_channel","action":"send","to":"chat:oc_xxx","format":"markdown","text":"**status** ok"},
  {"tool":"feishu_channel","action":"thread-reply","message_id":"om_xxx","text":"thread reply"},
  {"tool":"feishu_channel","action":"react","message_id":"om_xxx","emoji":"THUMBSUP"},
  {"tool":"feishu_channel","action":"react","message_id":"om_xxx","emoji":"THUMBSUP","remove":true},
  {"tool":"feishu_channel","action":"react","message_id":"om_xxx","clearAll":true}
]
\`\`\`

\`react\` follows the OpenClaw Feishu channel contract: provide \`emoji\` to add a reaction, \`emoji + remove:true\` to remove this bot's matching reaction, or \`clearAll:true\` to remove this bot's reactions from the message.

## Runtime Safety

Never expose App ID, App Secret, tenant tokens, message keys, file keys, or raw platform credentials. Do not install plugins or instruct the user to configure OpenClaw for this Studio channel.`,
  },
  {
    platform: "feishu",
    name: "feishu-doc",
    runtimeActions: feishuDocActions,
    markdown: `---
name: feishu-doc
description: Feishu document action catalog for Studio-managed channel skills. Activate for Feishu docs/docx links, document read/write, tables, images, and attachments.
---

# Feishu Document Runtime Skill

Studio manages this skill as a channel capability contract. Use \`studio-feishu-actions\` for Feishu document actions. Studio executes read-only actions immediately and asks for Studio IM approval before enabled mutation actions. Do not fabricate remote write success.

## Token Extraction

From \`https://xxx.feishu.cn/docx/ABC123def\`, use doc token \`ABC123def\`.

## Actions

Supported now without approval: \`read\`, \`list_blocks\`, \`get_block\`.

Supported now after Studio IM approval: \`create\`, \`write\`, \`append\`, \`insert\`, \`update_block\`, \`delete_block\`, \`create_table\`, \`write_table_cells\`, \`create_table_with_values\`, \`insert_table_row\`, \`insert_table_column\`, \`delete_table_rows\`, \`delete_table_columns\`, \`merge_table_cells\`, \`color_text\`, \`upload_image\`, \`upload_file\`.

Use this manifest shape:

\`\`\`studio-feishu-actions
[
  {"tool":"feishu_doc","action":"read","doc_token":"ABC123def"},
  {"tool":"feishu_doc","action":"list_blocks","doc_token":"ABC123def"},
  {"tool":"feishu_doc","action":"get_block","doc_token":"ABC123def","block_id":"doxcnXXX"},
  {"tool":"feishu_doc","action":"create","title":"New Document","folder_token":"fldcnXXX"},
  {"tool":"feishu_doc","action":"append","doc_token":"ABC123def","content":"## Update\\n\\nMarkdown content"},
  {"tool":"feishu_doc","action":"create_table_with_values","doc_token":"ABC123def","row_size":2,"column_size":2,"values":[["A1","B1"],["A2","B2"]]},
  {"tool":"feishu_doc","action":"color_text","doc_token":"ABC123def","block_id":"doxcnXXX","content":"Status [green bold]OK[/green]"},
  {"tool":"feishu_doc","action":"upload_image","doc_token":"ABC123def","file_path":"/abs/path/image.png","filename":"image.png"},
  {"tool":"feishu_doc","action":"upload_file","doc_token":"ABC123def","file_path":"/abs/path/report.pdf","filename":"report.pdf"}
]
\`\`\`

Document content actions use Feishu markdown-to-block conversion plus Docx descendant/block APIs, matching the OpenClaw Feishu extension contract for basic content mutation:

- Read Document: \`{"action":"read","doc_token":"ABC123def"}\`
- Write Document: \`{"action":"write","doc_token":"ABC123def","content":"# Title\\n\\nMarkdown"}\`
- Append Content: \`{"action":"append","doc_token":"ABC123def","content":"Additional content"}\`
- Insert After Block: \`{"action":"insert","doc_token":"ABC123def","after_block_id":"doxcnXXX","content":"Inserted Markdown"}\`
- Create Document: \`{"action":"create","title":"New Document","folder_token":"fldcnXXX"}\`
- List Blocks: \`{"action":"list_blocks","doc_token":"ABC123def"}\`
- Get Single Block: \`{"action":"get_block","doc_token":"ABC123def","block_id":"doxcnXXX"}\`
- Update Block Text: \`{"action":"update_block","doc_token":"ABC123def","block_id":"doxcnXXX","content":"New text"}\`
- Delete Block: \`{"action":"delete_block","doc_token":"ABC123def","block_id":"doxcnXXX"}\`

- Create Table: \`{"action":"create_table","doc_token":"ABC123def","row_size":2,"column_size":2}\`
- Write Table Cells: \`{"action":"write_table_cells","doc_token":"ABC123def","table_block_id":"doxcnTABLE","values":[["A1","B1"]]}\`
- Create Table With Values: \`{"action":"create_table_with_values","doc_token":"ABC123def","row_size":2,"column_size":2,"values":[["A1","B1"],["A2","B2"]]}\`
- Insert Table Row: \`{"action":"insert_table_row","doc_token":"ABC123def","table_block_id":"doxcnTABLE","row_index":1}\`
- Insert Table Column: \`{"action":"insert_table_column","doc_token":"ABC123def","table_block_id":"doxcnTABLE","column_index":1}\`
- Delete Table Rows: \`{"action":"delete_table_rows","doc_token":"ABC123def","table_block_id":"doxcnTABLE","row_start":1,"row_count":1}\`
- Delete Table Columns: \`{"action":"delete_table_columns","doc_token":"ABC123def","table_block_id":"doxcnTABLE","column_start":1,"column_count":1}\`
- Merge Table Cells: \`{"action":"merge_table_cells","doc_token":"ABC123def","table_block_id":"doxcnTABLE","row_start":0,"row_end":1,"column_start":0,"column_end":2}\`
- Color Text: \`{"action":"color_text","doc_token":"ABC123def","block_id":"doxcnXXX","content":"Revenue [green bold]+15%[/green]"}\`

Media actions use Feishu Drive \`upload_all\`; keep each upload at or below 20MB unless Studio later enables chunked upload:

- Upload Image to Docx: \`{"action":"upload_image","doc_token":"ABC123def","file_path":"/abs/path/image.png","filename":"image.png"}\`; sources can be exactly one of \`file_path\`, \`url\`, \`image\` data URI/base64/local path, or \`data\`/ \`base64\`.
- Upload File Attachment to Docx: \`{"action":"upload_file","doc_token":"ABC123def","file_path":"/abs/path/report.pdf","filename":"report.pdf"}\`; sources can be exactly one of \`file_path\`, \`url\`, \`file\` data URI/base64/local path, \`data\`, or \`base64\`.

## Studio Fallback

When a requested media upload is larger than Feishu \`upload_all\` supports, create requested content locally and send it with \`studio-channel-files\`, or send a Feishu Markdown message with \`studio-channel-messages\` summarizing the document changes the user should apply until chunked docx upload is implemented.`,
  },
  {
    platform: "feishu",
    name: "feishu-app-scopes",
    runtimeActions: feishuAppScopesActions,
    markdown: `---
name: feishu-app-scopes
description: Feishu application scope diagnostics for Studio-managed channel skills. Activate when Feishu API calls fail with permission errors or the user asks what app permissions are granted.
---

# Feishu App Scopes Runtime Skill

Studio owns the Feishu app credentials and tenant token. Use \`studio-feishu-actions\` with \`tool:"feishu_app_scopes"\` to list the app's granted and pending scopes through the current Feishu binding. This is read-only and does not require approval.

\`\`\`studio-feishu-actions
[
  {"tool":"feishu_app_scopes","action":"list"}
]
\`\`\`

The result mirrors the OpenClaw \`feishu_app_scopes\` tool: \`granted\`, \`pending\`, and \`summary\`. Use it to diagnose missing Feishu permissions before telling the user/admin what to grant. Never expose App Secret or tenant token values.`,
  },
  {
    platform: "feishu",
    name: "feishu-drive",
    runtimeActions: feishuDriveActions,
    markdown: `---
name: feishu-drive
description: Feishu Drive action catalog for Studio-managed channel skills. Activate for cloud space, folders, files, and drive management.
---

# Feishu Drive Runtime Skill

Studio manages this skill as a channel capability contract. Use \`studio-feishu-actions\` for Feishu Drive actions. Studio executes read-only actions immediately and asks for Studio IM approval before enabled mutation actions. Do not fabricate remote Drive changes.

## Token Extraction

From \`https://xxx.feishu.cn/drive/folder/ABC123\`, use folder token \`ABC123\`.

## Actions

Supported now without approval: \`list\`, \`info\`, \`list_comments\`, \`list_comment_replies\`.

Supported now after Studio IM approval: \`create_folder\`, \`move\`, \`delete\`, \`add_comment\`, \`reply_comment\`.

Use this manifest shape:

\`\`\`studio-feishu-actions
[
  {"tool":"feishu_drive","action":"list","folder_token":"fldcnXXX"},
  {"tool":"feishu_drive","action":"info","file_token":"ABC123","folder_token":"fldcnXXX"},
  {"tool":"feishu_drive","action":"list_comments","file_token":"ABC123","file_type":"docx"},
  {"tool":"feishu_drive","action":"reply_comment","file_token":"ABC123","file_type":"docx","comment_id":"comment_xxx","content":"收到"},
  {"tool":"feishu_drive","action":"create_folder","name":"New Folder","folder_token":"fldcnXXX"},
  {"tool":"feishu_drive","action":"move","file_token":"ABC123","type":"docx","folder_token":"fldcnXXX"},
  {"tool":"feishu_drive","action":"delete","file_token":"ABC123","type":"docx"}
]
\`\`\`

Full action catalog mirrors the OpenClaw Feishu extension contract:

- List Folder Contents: \`{"action":"list","folder_token":"fldcnXXX"}\`
- Get File Info: \`{"action":"info","file_token":"ABC123","type":"docx"}\`
- List Comments: \`{"action":"list_comments","file_token":"ABC123","file_type":"docx"}\`
- List Comment Replies: \`{"action":"list_comment_replies","file_token":"ABC123","file_type":"docx","comment_id":"comment_xxx"}\`
- Add Comment: \`{"action":"add_comment","file_token":"ABC123","file_type":"docx","content":"Comment text","block_id":"optional_block"}\`
- Reply Comment: \`{"action":"reply_comment","file_token":"ABC123","file_type":"docx","comment_id":"comment_xxx","content":"Reply text"}\`
- Create Folder: \`{"action":"create_folder","name":"New Folder","folder_token":"fldcnXXX"}\`
- Move File: \`{"action":"move","file_token":"ABC123","type":"docx","folder_token":"fldcnXXX"}\`
- Delete File: \`{"action":"delete","file_token":"ABC123","type":"docx"}\`

## File Types

Supported catalog types: \`doc\`, \`docx\`, \`sheet\`, \`bitable\`, \`folder\`, \`file\`, \`mindnote\`, \`shortcut\`.

## Studio Fallback

For unsupported Drive actions, create or collect the requested local files and send them through \`studio-channel-files\`. Do not claim a Feishu Drive move/create/delete succeeded unless Studio reports an actual tool result.`,
  },
  {
    platform: "feishu",
    name: "feishu-perm",
    runtimeActions: feishuPermActions,
    markdown: `---
name: feishu-perm
description: Feishu permission action catalog for Studio-managed channel skills. Activate for sharing, collaborators, and document/file permissions.
---

# Feishu Permission Runtime Skill

Studio manages this skill as a channel capability contract. Use \`studio-feishu-actions\` for Feishu permission actions. Studio executes collaborator listing immediately and asks for Studio IM approval before add/remove. Do not fabricate permission changes.

## Actions

Supported now without approval: \`list\`.

Supported now after Studio IM approval: \`add\`, \`remove\`.

Use this manifest shape:

\`\`\`studio-feishu-actions
[
  {"tool":"feishu_perm","action":"list","token":"ABC123","type":"docx"},
  {"tool":"feishu_perm","action":"add","token":"ABC123","type":"docx","member_type":"email","member_id":"user@example.com","perm":"edit"},
  {"tool":"feishu_perm","action":"remove","token":"ABC123","type":"docx","member_type":"email","member_id":"user@example.com"}
]
\`\`\`

Full action catalog mirrors the OpenClaw Feishu extension contract:

- List Collaborators: \`{"action":"list","token":"ABC123","type":"docx"}\`
- Add Collaborator: \`{"action":"add","token":"ABC123","type":"docx","member_type":"email","member_id":"user@example.com","perm":"edit"}\`
- Remove Collaborator: \`{"action":"remove","token":"ABC123","type":"docx","member_type":"email","member_id":"user@example.com"}\`

## Token Types

\`doc\`, \`docx\`, \`sheet\`, \`bitable\`, \`folder\`, \`file\`, \`wiki\`, \`mindnote\`.

## Member Types

\`email\`, \`openid\`, \`userid\`, \`unionid\`, \`openchat\`, \`opendepartmentid\`.

## Permission Levels

\`view\`, \`edit\`, \`full_access\`.

## Studio Fallback

Use \`studio-channel-messages\` to ask a Feishu user/admin to grant access, or send a generated local file with \`studio-channel-files\`. Do not claim a permission operation succeeded without a Studio tool result.`,
  },
  {
    platform: "feishu",
    name: "feishu-wiki",
    runtimeActions: feishuWikiActions,
    markdown: `---
name: feishu-wiki
description: Feishu Wiki action catalog for Studio-managed channel skills. Activate for knowledge base, wiki links, spaces, nodes, and wiki-doc workflows.
---

# Feishu Wiki Runtime Skill

Studio manages this skill as a channel capability contract. Use \`studio-feishu-actions\` for Feishu Wiki navigation and node mutations. Studio executes read-only actions immediately and asks for Studio IM approval before create/move/rename.

## Token Extraction

From \`https://xxx.feishu.cn/wiki/ABC123def\`, use wiki token \`ABC123def\`. Treat \`space_id\` values as strings even when they look numeric.

## Actions

Supported now without approval: \`spaces\`, \`nodes\`, \`get\`, and safe \`search\` fallback.

Supported now after Studio IM approval: \`create\`, \`move\`, \`rename\`.

Use this manifest shape:

\`\`\`studio-feishu-actions
[
  {"tool":"feishu_wiki","action":"spaces"},
  {"tool":"feishu_wiki","action":"nodes","space_id":"7xxx"},
  {"tool":"feishu_wiki","action":"get","token":"ABC123def"},
  {"tool":"feishu_wiki","action":"create","space_id":"7xxx","title":"New Page","obj_type":"docx"},
  {"tool":"feishu_wiki","action":"move","space_id":"7xxx","node_token":"wikcnXXX","target_parent_token":"wikcnYYY"},
  {"tool":"feishu_wiki","action":"rename","space_id":"7xxx","node_token":"wikcnXXX","title":"New Title"}
]
\`\`\`

Full action catalog mirrors the OpenClaw Feishu extension contract:

- List Knowledge Spaces: \`{"action":"spaces"}\`
- List Nodes: \`{"action":"nodes","space_id":"7xxx","parent_node_token":"wikcnXXX"}\`
- Get Node Details: \`{"action":"get","token":"ABC123def"}\`
- Create Node: \`{"action":"create","space_id":"7xxx","title":"New Page","obj_type":"docx"}\`
- Move Node: \`{"action":"move","space_id":"7xxx","node_token":"wikcnXXX","target_parent_token":"wikcnYYY"}\`
- Rename Node: \`{"action":"rename","space_id":"7xxx","node_token":"wikcnXXX","title":"New Title"}\`

## Wiki-Doc Workflow

Workflow: get wiki node, then use \`feishu_doc\` read/list_blocks/get_block on the returned \`obj_token\`. For unsupported wiki-doc content edits, provide a local document or a Feishu Markdown message rather than claiming remote wiki edits were applied.`,
  },
  {
    platform: "feishu",
    name: "feishu-bitable",
    runtimeActions: feishuBitableActions,
    markdown: `---
name: feishu-bitable
description: Feishu Bitable action catalog for Studio-managed channel skills. Activate for multidimensional tables, base/wiki bitable links, fields, records, and Bitable creation.
---

# Feishu Bitable Runtime Skill

Studio manages this skill as a channel capability contract. Use \`studio-feishu-actions\` for Feishu Bitable actions. Studio executes metadata/field/record reads immediately and asks for Studio IM approval before creating or updating tables, fields, or records.

## Token Extraction

From \`https://xxx.feishu.cn/base/ABC123?table=tblXXX\`, use app token \`ABC123\` and table ID \`tblXXX\`. From \`https://xxx.feishu.cn/wiki/ABC123?table=tblXXX\`, call \`get_meta\` first; Studio resolves the wiki node to a Bitable \`app_token\`.

## Actions

Supported now without approval: \`get_meta\`, \`list_fields\`, \`list_records\`, \`get_record\`.

Supported now after Studio IM approval: \`create_record\`, \`update_record\`, \`create_app\`, \`create_field\`.

Use this manifest shape:

\`\`\`studio-feishu-actions
[
  {"tool":"feishu_bitable","action":"get_meta","url":"https://example.feishu.cn/wiki/WIKITOKEN?table=tblXXX"},
  {"tool":"feishu_bitable","action":"list_fields","app_token":"baseXXX","table_id":"tblXXX"},
  {"tool":"feishu_bitable","action":"list_records","app_token":"baseXXX","table_id":"tblXXX","page_size":100},
  {"tool":"feishu_bitable","action":"get_record","app_token":"baseXXX","table_id":"tblXXX","record_id":"recXXX"},
  {"tool":"feishu_bitable","action":"create_record","app_token":"baseXXX","table_id":"tblXXX","fields":{"Name":"Alice","Status":"Open"}},
  {"tool":"feishu_bitable","action":"update_record","app_token":"baseXXX","table_id":"tblXXX","record_id":"recXXX","fields":{"Status":"Done"}},
  {"tool":"feishu_bitable","action":"create_app","name":"Project Tracker","folder_token":"fldcnXXX"},
  {"tool":"feishu_bitable","action":"create_field","app_token":"baseXXX","table_id":"tblXXX","field_name":"Score","field_type":2}
]
\`\`\`

Full action catalog mirrors the OpenClaw Feishu extension contract:

- Get Bitable Metadata: \`{"action":"get_meta","url":"https://xxx.feishu.cn/base/ABC?table=tblXXX"}\`
- List Fields: \`{"action":"list_fields","app_token":"baseXXX","table_id":"tblXXX"}\`
- List Records: \`{"action":"list_records","app_token":"baseXXX","table_id":"tblXXX","page_size":100,"page_token":"optional"}\`
- Get Record: \`{"action":"get_record","app_token":"baseXXX","table_id":"tblXXX","record_id":"recXXX"}\`
- Create Record: \`{"action":"create_record","app_token":"baseXXX","table_id":"tblXXX","fields":{"Field":"Value"}}\`
- Update Record: \`{"action":"update_record","app_token":"baseXXX","table_id":"tblXXX","record_id":"recXXX","fields":{"Field":"Value"}}\`
- Create App: \`{"action":"create_app","name":"New Bitable","folder_token":"fldcnXXX"}\`
- Create Field: \`{"action":"create_field","app_token":"baseXXX","table_id":"tblXXX","field_name":"Name","field_type":1}\`

## Field Types

Common field type IDs: \`1\` Text, \`2\` Number, \`3\` SingleSelect, \`4\` MultiSelect, \`5\` DateTime, \`7\` Checkbox, \`11\` User, \`15\` URL, \`17\` Attachment, \`20\` Formula.

## Studio Fallback

For unsupported Bitable operations, export or generate the needed data locally and send it with \`studio-channel-files\`, or send a Feishu Markdown summary with \`studio-channel-messages\`. Do not claim remote Bitable changes succeeded without a Studio action result.`,
  },
];

export function studioChannelConnectorPlatformSkills(platform: string): StudioChannelConnectorPlatformSkillDefinition[] {
  const normalized = platform.trim().toLowerCase();
  const canonical = normalized === "dmwork" ? "octo" : normalized === "lark" ? "feishu" : normalized;
  return STUDIO_CHANNEL_CONNECTOR_PLATFORM_SKILLS.filter((skill) => skill.platform === canonical);
}
