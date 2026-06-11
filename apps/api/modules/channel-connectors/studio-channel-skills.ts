export interface StudioChannelConnectorPlatformSkillDefinition {
  platform: "octo" | "feishu";
  name: string;
  markdown: string;
}

export const STUDIO_CHANNEL_CONNECTOR_PLATFORM_SKILLS: StudioChannelConnectorPlatformSkillDefinition[] = [
  {
    platform: "octo",
    name: "octo-bot-api",
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

Use \`studio-channel-files\` for images, documents, archives, binaries, and generated files. Studio validates paths, preserves file names, uploads through Octo STS/COS when available, and falls back to the supported upload path when needed.

\`\`\`studio-channel-files
[
  {"path":"relative/or/absolute/file.ext","name":"original-name.ext","caption":"optional caption"}
]
\`\`\`

Generate or copy requested outgoing files under the current working directory unless the current permission mode allows an existing readable path. Do not call Octo upload endpoints yourself.

## Message History Sync

Studio injects recent Octo timeline context before the current request. In groups and threads, unmentioned messages are recorded as context but do not trigger a reply. When mentioned later, use the injected timeline to understand collaborator replies. Do not re-answer old messages unless the current user explicitly asks.

Studio also exposes the user command \`/octo history [limit]\` for the current group/thread and supports bounded history budgets to avoid context overflow.

## Multi-Bot Coordination

In Octo groups, other bots may be Studio agents or external products. Ask humans by DM when requested; ask bots by visible group/thread \`@[bot_uid_bot:Name]\`. Do not claim you lack Octo or Feishu API permission just because you are an Agent; Studio delivers the declared messages. Do not respond to unrelated bot chatter unless the user explicitly asks you to coordinate or summarize it.

## Groups and Threads

Studio provides Octo management commands to users and Agent-native context:

- \`/octo groups\`
- \`/octo info [group_no]\`
- \`/octo members [group_no]\`
- \`/octo search <keyword>\`
- \`/octo threads [group_no]\`
- \`/octo thread <short_id> [group_no]\`
- \`/octo thread-members <short_id> [group_no]\`
- \`/octo group-md [group_no]\`
- \`/octo thread-md <short_id> [group_no]\`
- \`/octo voice-context\`
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

## Runtime Safety

Never expose bot tokens or platform credentials. Do not install plugins or tell the user to configure OpenClaw for this Studio channel. Keep group replies concise and use current channel context, member IDs, and thread IDs exactly as Studio provides them.`,
  },
  {
    platform: "feishu",
    name: "feishu-messaging",
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

## Runtime Safety

Never expose App ID, App Secret, tenant tokens, message keys, file keys, or raw platform credentials. Do not install plugins or instruct the user to configure OpenClaw for this Studio channel.`,
  },
  {
    platform: "feishu",
    name: "feishu-doc",
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

Supported now after Studio IM approval: \`create\`, \`write\`, \`append\`, \`insert\`, \`update_block\`, \`delete_block\`, \`create_table\`, \`write_table_cells\`, \`create_table_with_values\`, \`upload_image\`, \`upload_file\`.

Use this manifest shape:

\`\`\`studio-feishu-actions
[
  {"tool":"feishu_doc","action":"read","doc_token":"ABC123def"},
  {"tool":"feishu_doc","action":"list_blocks","doc_token":"ABC123def"},
  {"tool":"feishu_doc","action":"get_block","doc_token":"ABC123def","block_id":"doxcnXXX"},
  {"tool":"feishu_doc","action":"create","title":"New Document","folder_token":"fldcnXXX"},
  {"tool":"feishu_doc","action":"append","doc_token":"ABC123def","content":"## Update\\n\\nMarkdown content"},
  {"tool":"feishu_doc","action":"create_table_with_values","doc_token":"ABC123def","row_size":2,"column_size":2,"values":[["A1","B1"],["A2","B2"]]},
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

Media actions use Feishu Drive \`upload_all\`; keep each upload at or below 20MB unless Studio later enables chunked upload:

- Upload Image to Docx: \`{"action":"upload_image","doc_token":"ABC123def","file_path":"/abs/path/image.png","filename":"image.png"}\`; sources can be exactly one of \`file_path\`, \`url\`, \`image\` data URI/base64/local path, or \`data\`/ \`base64\`.
- Upload File Attachment to Docx: \`{"action":"upload_file","doc_token":"ABC123def","file_path":"/abs/path/report.pdf","filename":"report.pdf"}\`; sources can be exactly one of \`file_path\`, \`url\`, \`file\` data URI/base64/local path, \`data\`, or \`base64\`.

## Studio Fallback

When a requested media upload is larger than Feishu \`upload_all\` supports, create requested content locally and send it with \`studio-channel-files\`, or send a Feishu Markdown message with \`studio-channel-messages\` summarizing the document changes the user should apply until chunked docx upload is implemented.`,
  },
  {
    platform: "feishu",
    name: "feishu-drive",
    markdown: `---
name: feishu-drive
description: Feishu Drive action catalog for Studio-managed channel skills. Activate for cloud space, folders, files, and drive management.
---

# Feishu Drive Runtime Skill

Studio manages this skill as a channel capability contract. Use \`studio-feishu-actions\` for Feishu Drive actions. Studio executes read-only actions immediately and asks for Studio IM approval before enabled mutation actions. Do not fabricate remote Drive changes.

## Token Extraction

From \`https://xxx.feishu.cn/drive/folder/ABC123\`, use folder token \`ABC123\`.

## Actions

Supported now without approval: \`list\`, \`info\`.

Supported now after Studio IM approval: \`create_folder\`, \`move\`, \`delete\`.

Use this manifest shape:

\`\`\`studio-feishu-actions
[
  {"tool":"feishu_drive","action":"list","folder_token":"fldcnXXX"},
  {"tool":"feishu_drive","action":"info","file_token":"ABC123","folder_token":"fldcnXXX"},
  {"tool":"feishu_drive","action":"create_folder","name":"New Folder","folder_token":"fldcnXXX"},
  {"tool":"feishu_drive","action":"move","file_token":"ABC123","type":"docx","folder_token":"fldcnXXX"},
  {"tool":"feishu_drive","action":"delete","file_token":"ABC123","type":"docx"}
]
\`\`\`

Full action catalog mirrors the OpenClaw Feishu extension contract:

- List Folder Contents: \`{"action":"list","folder_token":"fldcnXXX"}\`
- Get File Info: \`{"action":"info","file_token":"ABC123","type":"docx"}\`
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
];

export function studioChannelConnectorPlatformSkills(platform: string): StudioChannelConnectorPlatformSkillDefinition[] {
  const normalized = platform.trim().toLowerCase();
  const canonical = normalized === "dmwork" ? "octo" : normalized === "lark" ? "feishu" : normalized;
  return STUDIO_CHANNEL_CONNECTOR_PLATFORM_SKILLS.filter((skill) => skill.platform === canonical);
}
